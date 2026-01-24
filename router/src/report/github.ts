/**
 * GitHub Reporter
 * Posts findings as PR comments and check run summaries
 * Includes deduplication and throttling
 */

import { Octokit } from '@octokit/rest';
import type { Finding, Severity } from '../agents/index.js';
import type { Config } from '../config.js';
import {
  deduplicateFindings,
  sortFindings,
  generateSummaryMarkdown,
  toGitHubAnnotation,
  countBySeverity,
  buildFingerprintMarker,
  extractFingerprintMarkers,
  getDedupeKey,
} from './formats.js';
import type { DiffFile } from '../diff.js';
import {
  buildLineResolver,
  normalizeFindingsForDiff,
  type ValidationStats,
  type InvalidLineDetail,
} from './line-resolver.js';

export interface GitHubContext {
  owner: string;
  repo: string;
  prNumber?: number;
  headSha: string;
  token: string;
  /** Check run ID created at start of review (for proper lifecycle) */
  checkRunId?: number;
}

export interface ReportResult {
  success: boolean;
  checkRunId?: number;
  commentId?: number;
  error?: string;
  /** Number of findings skipped due to deduplication */
  skippedDuplicates?: number;
  /** Statistics from line validation */
  validationStats?: ValidationStats;
  /** Details about findings with invalid lines */
  invalidLineDetails?: InvalidLineDetail[];
}

/** Delay between inline comments to avoid spam (ms) */
const INLINE_COMMENT_DELAY_MS = 100;

/**
 * Delay helper for rate limiting
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Start a check run in 'in_progress' state
 * Call this at the beginning of the review to show users the review is running
 */
export async function startCheckRun(context: GitHubContext): Promise<number> {
  const octokit = new Octokit({ auth: context.token });

  const response = await octokit.checks.create({
    owner: context.owner,
    repo: context.repo,
    name: 'AI Code Review',
    head_sha: context.headSha,
    status: 'in_progress',
    started_at: new Date().toISOString(),
    output: {
      title: 'AI Code Review in progress...',
      summary: 'Analyzing code changes. This may take a moment.',
    },
  });

  console.log(`[github] Started check run ${response.data.id} (in_progress)`);
  return response.data.id;
}

/**
 * Post findings to GitHub
 */
export async function reportToGitHub(
  findings: Finding[],
  context: GitHubContext,
  config: Config,
  diffFiles: DiffFile[]
): Promise<ReportResult> {
  const octokit = new Octokit({ auth: context.token });
  const reportingConfig = config.reporting.github ?? {
    mode: 'checks_and_comments',
    max_inline_comments: 20,
    summary: true,
  };

  // Build line resolver and normalize findings
  const lineResolver = buildLineResolver(diffFiles);
  const normalizationResult = normalizeFindingsForDiff(findings, lineResolver);

  if (normalizationResult.stats.dropped > 0 || normalizationResult.stats.normalized > 0) {
    console.log(
      `[github] Line validation: ${normalizationResult.stats.valid} valid, ` +
        `${normalizationResult.stats.normalized} normalized, ${normalizationResult.stats.dropped} dropped`
    );
  }

  // Process normalized findings
  const deduplicated = deduplicateFindings(normalizationResult.findings);
  const sorted = sortFindings(deduplicated);
  const counts = countBySeverity(sorted);

  try {
    let checkRunId: number | undefined;
    let commentId: number | undefined;
    let skippedDuplicates = 0;

    // Create check run if enabled
    if (reportingConfig.mode === 'checks_only' || reportingConfig.mode === 'checks_and_comments') {
      checkRunId = await createCheckRun(octokit, context, sorted, counts, config);
    }

    // Post PR comment if enabled and we have a PR number
    if (
      context.prNumber &&
      (reportingConfig.mode === 'comments_only' || reportingConfig.mode === 'checks_and_comments')
    ) {
      // Build set of deleted files for belt-and-suspenders guard in postPRComment
      const deletedFiles = new Set(
        diffFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );
      const result = await postPRComment(
        octokit,
        context,
        sorted,
        reportingConfig.max_inline_comments,
        deletedFiles
      );
      commentId = result.commentId;
      skippedDuplicates = result.skippedDuplicates;
    }

    return {
      success: true,
      checkRunId,
      commentId,
      skippedDuplicates,
      validationStats: normalizationResult.stats,
      invalidLineDetails:
        normalizationResult.invalidDetails.length > 0
          ? normalizationResult.invalidDetails
          : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create or update a GitHub check run with annotations
 * If context.checkRunId is provided, updates existing check run (proper lifecycle)
 * Otherwise creates a new check run (legacy/fallback behavior)
 */
async function createCheckRun(
  octokit: Octokit,
  context: GitHubContext,
  findings: Finding[],
  counts: Record<Severity, number>,
  config: Config
): Promise<number> {
  // Determine conclusion based on gating config
  let conclusion: 'success' | 'failure' | 'neutral' = 'success';

  if (config.gating.enabled) {
    if (config.gating.fail_on_severity === 'error' && counts.error > 0) {
      conclusion = 'failure';
    } else if (
      config.gating.fail_on_severity === 'warning' &&
      (counts.error > 0 || counts.warning > 0)
    ) {
      conclusion = 'failure';
    } else if (
      config.gating.fail_on_severity === 'info' &&
      (counts.error > 0 || counts.warning > 0 || counts.info > 0)
    ) {
      conclusion = 'failure';
    }
  }

  // Convert findings to annotations (max 50 per request)
  const annotations = findings
    .map(toGitHubAnnotation)
    .filter((a): a is NonNullable<typeof a> => a !== null)
    .slice(0, 50);

  const summary = generateSummaryMarkdown(findings);

  const output = {
    title: `AI Review: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`,
    summary,
    annotations,
  };

  // If we have an existing check run ID, update it (proper lifecycle)
  if (context.checkRunId) {
    await octokit.checks.update({
      owner: context.owner,
      repo: context.repo,
      check_run_id: context.checkRunId,
      status: 'completed',
      conclusion,
      completed_at: new Date().toISOString(),
      output,
    });

    console.log(`[github] Updated check run ${context.checkRunId} with conclusion: ${conclusion}`);
    return context.checkRunId;
  }

  // Fallback: create new check run (legacy behavior if startCheckRun wasn't called)
  const response = await octokit.checks.create({
    owner: context.owner,
    repo: context.repo,
    name: 'AI Code Review',
    head_sha: context.headSha,
    status: 'completed',
    conclusion,
    output,
  });

  console.log(`[github] Created check run ${response.data.id} with conclusion: ${conclusion}`);
  return response.data.id;
}

/**
 * Post a summary comment on the PR with deduplication
 */
async function postPRComment(
  octokit: Octokit,
  context: GitHubContext,
  findings: Finding[],
  maxInlineComments: number,
  deletedFiles: Set<string> = new Set<string>()
): Promise<{ commentId: number; skippedDuplicates: number }> {
  if (!context.prNumber) {
    throw new Error('PR number required for comments');
  }

  const summary = generateSummaryMarkdown(findings);

  // Find existing comment to update
  const existingComments = await octokit.issues.listComments({
    owner: context.owner,
    repo: context.repo,
    issue_number: context.prNumber,
  });

  const botComment = existingComments.data.find(
    (c) => c.user?.type === 'Bot' && c.body?.includes('## AI Code Review Summary')
  );

  let commentId: number;

  if (botComment) {
    // Update existing comment
    const response = await octokit.issues.updateComment({
      owner: context.owner,
      repo: context.repo,
      comment_id: botComment.id,
      body: summary,
    });
    commentId = response.data.id;
    console.log(`[github] Updated existing comment ${commentId}`);
  } else {
    // Create new comment
    const response = await octokit.issues.createComment({
      owner: context.owner,
      repo: context.repo,
      issue_number: context.prNumber,
      body: summary,
    });
    commentId = response.data.id;
    console.log(`[github] Created new comment ${commentId}`);
  }

  // Get existing review comments for deduplication
  const existingReviewComments = await octokit.pulls.listReviewComments({
    owner: context.owner,
    repo: context.repo,
    pull_number: context.prNumber,
  });

  // Build set of existing comment fingerprints (canonical markers only)
  const existingFingerprints = new Set<string>();
  for (const comment of existingReviewComments.data) {
    if (comment.body) {
      const markers = extractFingerprintMarkers(comment.body);
      for (const marker of markers) {
        existingFingerprints.add(marker);
      }
    }
  }

  // Filter findings for inline comments
  // Belt-and-suspenders: also filter out deleted files (should already be file-level)
  const inlineFindings = findings
    .filter(
      (f): f is Finding & { line: number } => f.line !== undefined && !deletedFiles.has(f.file)
    )
    .sort((a, b) => {
      // Sort by severity (error > warning > info)
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
    });

  // Group adjacent findings (within 3 lines of each other in same file)
  const groupedFindings = groupAdjacentFindings(inlineFindings);

  let skippedDuplicates = 0;
  let postedCount = 0;

  for (const findingOrGroup of groupedFindings) {
    if (postedCount >= maxInlineComments) break;

    const fingerprints = Array.isArray(findingOrGroup)
      ? findingOrGroup.map((finding) => getDedupeKey(finding))
      : [getDedupeKey(findingOrGroup)];

    // Skip if already posted
    if (fingerprints.every((fingerprint) => existingFingerprints.has(fingerprint))) {
      skippedDuplicates++;
      continue;
    }

    const finding = Array.isArray(findingOrGroup) ? findingOrGroup[0] : findingOrGroup;
    if (!finding) continue;

    const body = Array.isArray(findingOrGroup)
      ? formatGroupedInlineComment(findingOrGroup)
      : formatInlineComment(finding);

    try {
      const commentParams: {
        owner: string;
        repo: string;
        pull_number: number;
        body: string;
        commit_id: string;
        path: string;
        line: number;
        side: 'RIGHT';
        start_line?: number;
        start_side?: 'RIGHT';
      } = {
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
        body,
        commit_id: context.headSha,
        path: finding.file,
        line: finding.line,
        side: 'RIGHT', // Always comment on new file (right side of diff)
      };

      // Add multi-line comment support if endLine is present
      if (finding.endLine && finding.endLine !== finding.line) {
        commentParams.start_line = finding.line;
        commentParams.start_side = 'RIGHT';
        commentParams.line = finding.endLine;
      }

      await octokit.pulls.createReviewComment(commentParams);
      postedCount++;
      for (const fingerprint of fingerprints) {
        existingFingerprints.add(fingerprint);
      }

      // Rate limiting delay
      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      // Inline comments can fail for various reasons (line not in diff, etc.)
      console.warn(`[github] Failed to post inline comment: ${error}`);
    }
  }

  console.log(
    `[github] Posted ${postedCount} inline comments (skipped ${skippedDuplicates} duplicates)`
  );

  return { commentId, skippedDuplicates };
}

/**
 * Group adjacent findings (within 3 lines in the same file)
 */
function groupAdjacentFindings(
  findings: (Finding & { line: number })[]
): ((Finding & { line: number }) | (Finding & { line: number })[])[] {
  if (findings.length === 0) return [];

  const result: ((Finding & { line: number }) | (Finding & { line: number })[])[] = [];
  const firstFinding = findings[0];
  if (!firstFinding) return [];

  let currentGroup: (Finding & { line: number })[] = [firstFinding];

  for (let i = 1; i < findings.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = findings[i];

    if (!prev || !curr) continue;

    // Group if same file and within 3 lines
    if (prev.file === curr.file && Math.abs(curr.line - prev.line) <= 3) {
      currentGroup.push(curr);
    } else {
      // Finish current group
      const firstInGroup = currentGroup[0];
      if (firstInGroup) {
        result.push(currentGroup.length === 1 ? firstInGroup : currentGroup);
      }
      currentGroup = [curr];
    }
  }

  // Don't forget the last group
  const firstInGroup = currentGroup[0];
  if (firstInGroup) {
    result.push(currentGroup.length === 1 ? firstInGroup : currentGroup);
  }

  return result;
}

/**
 * Format a finding as an inline comment
 */
function formatInlineComment(finding: Finding): string {
  const emoji = finding.severity === 'error' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵';
  const lines = [`${emoji} **${finding.sourceAgent}**: ${finding.message}`];

  if (finding.ruleId) {
    lines.push(`\n*Rule: \`${finding.ruleId}\`*`);
  }

  if (finding.suggestion) {
    lines.push(`\n💡 **Suggestion**: ${finding.suggestion}`);
  }

  lines.push(`\n\n${buildFingerprintMarker(finding)}`);

  return lines.join('');
}

/**
 * Format grouped findings as a single inline comment
 */
function formatGroupedInlineComment(findings: (Finding & { line: number })[]): string {
  const lines: string[] = [`**Multiple issues found in this area (${findings.length}):**\n`];

  for (const finding of findings) {
    const emoji =
      finding.severity === 'error' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵';
    lines.push(`${emoji} **Line ${finding.line}** (${finding.sourceAgent}): ${finding.message}`);

    if (finding.suggestion) {
      lines.push(`   💡 ${finding.suggestion}`);
    }
    lines.push('');
  }

  for (const finding of findings) {
    lines.push(buildFingerprintMarker(finding));
  }

  return lines.join('\n').trim();
}
