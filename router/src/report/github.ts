/**
 * GitHub Reporter
 * Posts findings as PR comments and check run summaries
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
} from './formats.js';

export interface GitHubContext {
  owner: string;
  repo: string;
  prNumber?: number;
  headSha: string;
  token: string;
}

export interface ReportResult {
  success: boolean;
  checkRunId?: number;
  commentId?: number;
  error?: string;
}

/**
 * Post findings to GitHub
 */
export async function reportToGitHub(
  findings: Finding[],
  context: GitHubContext,
  config: Config
): Promise<ReportResult> {
  const octokit = new Octokit({ auth: context.token });
  const reportingConfig = config.reporting.github ?? {
    mode: 'checks_and_comments',
    max_inline_comments: 20,
    summary: true,
  };

  // Process findings
  const deduplicated = deduplicateFindings(findings);
  const sorted = sortFindings(deduplicated);
  const counts = countBySeverity(sorted);

  try {
    let checkRunId: number | undefined;
    let commentId: number | undefined;

    // Create check run if enabled
    if (reportingConfig.mode === 'checks_only' || reportingConfig.mode === 'checks_and_comments') {
      checkRunId = await createCheckRun(octokit, context, sorted, counts, config);
    }

    // Post PR comment if enabled and we have a PR number
    if (
      context.prNumber &&
      (reportingConfig.mode === 'comments_only' || reportingConfig.mode === 'checks_and_comments')
    ) {
      commentId = await postPRComment(
        octokit,
        context,
        sorted,
        reportingConfig.max_inline_comments
      );
    }

    return {
      success: true,
      checkRunId,
      commentId,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create a GitHub check run with annotations
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

  const response = await octokit.checks.create({
    owner: context.owner,
    repo: context.repo,
    name: 'AI Code Review',
    head_sha: context.headSha,
    status: 'completed',
    conclusion,
    output: {
      title: `AI Review: ${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`,
      summary,
      annotations,
    },
  });

  console.log(`[github] Created check run ${response.data.id} with conclusion: ${conclusion}`);
  return response.data.id;
}

/**
 * Post a summary comment on the PR
 */
async function postPRComment(
  octokit: Octokit,
  context: GitHubContext,
  findings: Finding[],
  maxInlineComments: number
): Promise<number> {
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

  // Post inline comments for top findings
  const inlineFindings = findings
    .filter((f): f is Finding & { line: number } => f.line !== undefined)
    .slice(0, maxInlineComments);

  for (const finding of inlineFindings) {
    try {
      await octokit.pulls.createReviewComment({
        owner: context.owner,
        repo: context.repo,
        pull_number: context.prNumber,
        body: formatInlineComment(finding),
        commit_id: context.headSha,
        path: finding.file,
        line: finding.line,
      });
    } catch (error) {
      // Inline comments can fail for various reasons (line not in diff, etc.)
      console.warn(`[github] Failed to post inline comment: ${error}`);
    }
  }

  return commentId;
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

  return lines.join('');
}
