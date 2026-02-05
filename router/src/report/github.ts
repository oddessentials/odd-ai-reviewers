/**
 * GitHub Reporter
 * Posts findings as PR comments and check run summaries
 * Includes deduplication and throttling
 */

import { Octokit } from '@octokit/rest';
import type { Finding, Severity } from '../agents/types.js';
import type { Config } from '../config.js';
import {
  deduplicateFindings,
  sortFindings,
  generateSummaryMarkdown,
  renderPartialFindingsSection,
  toGitHubAnnotation,
  countBySeverity,
  extractFingerprintMarkers,
  getDedupeKey,
  buildProximityMap,
  isDuplicateByProximity,
  identifyStaleComments,
  updateProximityMap,
} from './formats.js';
import {
  buildCommentToMarkersMap,
  shouldResolveComment,
  getPartiallyResolvedMarkers,
  hasMalformedMarkers,
  applyPartialResolutionVisual,
  stripOwnFingerprintMarkers,
  emitResolutionLog,
  emitMalformedMarkerWarning,
} from './resolution.js';
import type { DiffFile } from '../diff.js';
import { canonicalizeDiffFiles } from '../diff.js';
import {
  delay,
  INLINE_COMMENT_DELAY_MS,
  formatInlineComment,
  formatGroupedInlineComment,
  groupAdjacentFindings,
} from './base.js';

import {
  buildLineResolver,
  normalizeFindingsForDiff,
  computeDriftSignal,
  generateDriftMarkdown,
  type ValidationStats,
  type InvalidLineDetail,
  type DriftSignal,
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
 *
 * (012-fix-agent-result-regressions) - Now accepts partialFindings to include
 * in check summaries and PR comments. Partial findings are rendered in a dedicated
 * section that makes clear they're from failed agents and don't affect gating.
 */
export async function reportToGitHub(
  findings: Finding[],
  partialFindings: Finding[],
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

  // CANONICAL ENTRYPOINT: Ensure all diff paths are normalized FIRST
  // This must happen before buildLineResolver, deleted set, or rename maps
  const canonicalFiles = canonicalizeDiffFiles(diffFiles);

  // Build line resolver and normalize findings from canonical files
  const lineResolver = buildLineResolver(canonicalFiles);
  const normalizationResult = normalizeFindingsForDiff(findings, lineResolver);

  if (normalizationResult.stats.dropped > 0 || normalizationResult.stats.normalized > 0) {
    console.log(
      `[github] Line validation: ${normalizationResult.stats.valid} valid, ` +
        `${normalizationResult.stats.normalized} normalized, ${normalizationResult.stats.dropped} dropped`
    );
  }

  // Compute drift signal for visibility in check summary
  const driftSignal = computeDriftSignal(
    normalizationResult.stats,
    normalizationResult.invalidDetails
  );

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
      checkRunId = await createCheckRun(
        octokit,
        context,
        sorted,
        partialFindings,
        counts,
        config,
        driftSignal
      );
    }

    // Post PR comment if enabled and we have a PR number
    if (
      context.prNumber &&
      (reportingConfig.mode === 'comments_only' || reportingConfig.mode === 'checks_and_comments')
    ) {
      // Build set of deleted files for belt-and-suspenders guard in postPRComment
      // FR-003: Use canonicalFiles for path normalization consistency with findings
      const deletedFiles = new Set(
        canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );
      const result = await postPRComment(
        octokit,
        context,
        sorted,
        partialFindings,
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
 *
 * (012-fix-agent-result-regressions) - Now includes partialFindings in summary
 */
async function createCheckRun(
  octokit: Octokit,
  context: GitHubContext,
  findings: Finding[],
  partialFindings: Finding[],
  counts: Record<Severity, number>,
  config: Config,
  driftSignal: DriftSignal
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

  // (012-fix-agent-result-regressions) - Append partial findings section if present
  const partialSection = renderPartialFindingsSection(partialFindings);

  // Append drift signal to summary (only shows when warn/fail threshold exceeded)
  const driftMarkdown = generateDriftMarkdown(driftSignal);
  const fullSummary = summary + partialSection + driftMarkdown;

  const output = {
    title: `AI Review: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`,
    summary: fullSummary,
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
  partialFindings: Finding[],
  maxInlineComments: number,
  deletedFiles: Set<string> = new Set<string>()
): Promise<{ commentId: number; skippedDuplicates: number }> {
  if (!context.prNumber) {
    throw new Error('PR number required for comments');
  }

  // (012-fix-agent-result-regressions) - Include partial findings section in PR comment
  const summary = generateSummaryMarkdown(findings) + renderPartialFindingsSection(partialFindings);

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

  // Build set of existing comment fingerprints and map to comment IDs for resolution
  const existingDedupeKeys: string[] = [];
  const dedupeKeyToCommentId = new Map<string, number>();
  for (const comment of existingReviewComments.data) {
    if (comment.body) {
      const markers = extractFingerprintMarkers(comment.body);
      for (const marker of markers) {
        existingDedupeKeys.push(marker);
        dedupeKeyToCommentId.set(marker, comment.id);
      }
    }
  }

  // Build proximity-based deduplication structures
  const existingFingerprintSet = new Set<string>(existingDedupeKeys);
  const proximityMap = buildProximityMap(existingDedupeKeys);

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

    const findingsInGroup = Array.isArray(findingOrGroup) ? findingOrGroup : [findingOrGroup];

    // Use proximity-based deduplication: skip if ALL findings in group are duplicates
    // A finding is a duplicate if:
    // 1. Exact dedupe key match (same fingerprint + file + line), OR
    // 2. Same fingerprint+file within LINE_PROXIMITY_THRESHOLD lines
    const allDuplicates = findingsInGroup.every((f) =>
      isDuplicateByProximity(f, existingFingerprintSet, proximityMap)
    );

    if (allDuplicates) {
      skippedDuplicates++;
      continue;
    }

    const finding = findingsInGroup[0];
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

      // Update tracking structures with newly posted findings
      for (const f of findingsInGroup) {
        const key = getDedupeKey(f);
        existingFingerprintSet.add(key);

        // FR-001: Update proximityMap using canonical pattern
        updateProximityMap(proximityMap, f);
      }

      // Rate limiting delay
      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      // Inline comments can fail for various reasons (line not in diff, etc.)
      console.warn(`[github] Failed to post inline comment: ${error}`);
    }
  }

  // Resolve stale comments (comments for issues that no longer exist)
  // FIX: Use grouped comment resolution - only resolve when ALL markers are stale
  const staleKeys = identifyStaleComments(existingDedupeKeys, findings);
  const staleKeySet = new Set(staleKeys);

  // Build reverse map: commentId -> all markers in that comment
  const commentIdToMarkers = buildCommentToMarkersMap(dedupeKeyToCommentId);

  // Track which comments we've already processed to avoid duplicate API calls
  const processedCommentIds = new Set<number>();
  let resolvedCount = 0;
  let partiallyResolvedCount = 0;

  // Process each comment that has at least one stale marker
  for (const staleKey of staleKeys) {
    const commentIdToProcess = dedupeKeyToCommentId.get(staleKey);
    if (!commentIdToProcess || processedCommentIds.has(commentIdToProcess)) continue;

    processedCommentIds.add(commentIdToProcess);

    // Get ALL markers for this comment
    const allMarkersInComment = commentIdToMarkers.get(commentIdToProcess) ?? [];

    // Emit warning if any markers are malformed (FR-010: exactly one warning per comment)
    if (hasMalformedMarkers(allMarkersInComment)) {
      emitMalformedMarkerWarning('github', commentIdToProcess);
    }

    // Check if comment should be resolved (ALL markers must be stale)
    const shouldResolve = shouldResolveComment(allMarkersInComment, staleKeySet);

    // Get partially resolved markers for visual indication
    const partiallyResolved = getPartiallyResolvedMarkers(allMarkersInComment, staleKeySet);

    // Emit resolution log (once per comment per run)
    // FR-005: Simplified staleCount calculation for clarity
    const staleCount = shouldResolve ? allMarkersInComment.length : partiallyResolved.length;
    emitResolutionLog(
      'github',
      commentIdToProcess,
      allMarkersInComment.length,
      staleCount,
      shouldResolve
    );

    try {
      // Get the existing comment to preserve its content
      // Note: O(n) linear search is acceptable here - only called once per processed comment
      // (not per marker), and processedCommentIds prevents duplicates. For enterprise PRs
      // with 1000+ comments, consider indexing existingReviewComments.data by ID upfront.
      const existingComment = existingReviewComments.data.find((c) => c.id === commentIdToProcess);
      if (!existingComment?.body) continue;

      // Skip if already marked as fully resolved
      if (existingComment.body.includes('✅ **Resolved**')) {
        continue;
      }

      if (shouldResolve) {
        // ALL markers are stale - resolve the entire comment
        // Strip only our fingerprint markers, preserving any user-added HTML comments (FR-019)
        const bodyWithoutOurMarkers = stripOwnFingerprintMarkers(existingComment.body);
        const resolvedBody =
          `~~${bodyWithoutOurMarkers}~~\n\n` +
          `✅ **Resolved** - This issue appears to have been fixed.\n\n` +
          allMarkersInComment
            .map((m) => `<!-- odd-ai-reviewers:fingerprint:v1:${m} -->`)
            .join('\n');

        await octokit.pulls.updateReviewComment({
          owner: context.owner,
          repo: context.repo,
          comment_id: commentIdToProcess,
          body: resolvedBody,
        });
        resolvedCount++;
      } else if (partiallyResolved.length > 0) {
        // Only SOME markers are stale - apply visual indication (strikethrough)
        const updatedBody = applyPartialResolutionVisual(existingComment.body, partiallyResolved);

        // Only update if the body actually changed
        if (updatedBody !== existingComment.body) {
          await octokit.pulls.updateReviewComment({
            owner: context.owner,
            repo: context.repo,
            comment_id: commentIdToProcess,
            body: updatedBody,
          });
          partiallyResolvedCount++;
        }
      }

      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      console.warn(`[github] Failed to resolve/update comment ${commentIdToProcess}: ${error}`);
    }
  }

  console.log(
    `[github] Posted ${postedCount} inline comments, skipped ${skippedDuplicates} duplicates, resolved ${resolvedCount} comments, ${partiallyResolvedCount} partially resolved`
  );

  return { commentId, skippedDuplicates };
}
