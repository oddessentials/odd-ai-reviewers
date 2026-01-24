/**
 * Azure DevOps Reporter
 * Posts findings as PR threads and commit statuses
 * Includes deduplication, throttling, and line validation
 *
 * Line Validation:
 * Azure DevOps thread API requires comments to target lines
 * that are part of the diff. This module validates line numbers before
 * posting to prevent comments from appearing on wrong lines or failing silently.
 */

import type { Finding, Severity } from '../agents/index.js';
import type { Config } from '../config.js';
import type { DiffFile } from '../diff.js';
import {
  deduplicateFindings,
  sortFindings,
  generateSummaryMarkdown,
  countBySeverity,
  buildFingerprintMarker,
  extractFingerprintMarkers,
  getDedupeKey,
} from './formats.js';
import { buildDiffLineMap, validateFindingLine, type DiffLineMap } from '../diff_line_validator.js';

export interface ADOContext {
  /** Azure DevOps organization name */
  organization: string;
  /** Azure DevOps project name */
  project: string;
  /** Repository ID or name */
  repositoryId: string;
  /** Pull Request ID */
  pullRequestId: number;
  /** Source commit SHA for the PR */
  sourceRefCommit: string;
  /** Authentication token (System.AccessToken or PAT) */
  token: string;
  /** Optional: Existing thread ID for summary updates */
  summaryThreadId?: number;
  /** Optional: Existing status ID for status updates */
  statusId?: number;
  /** Diff files for line validation (optional but recommended) */
  diffFiles?: DiffFile[];
}

export interface ReportResult {
  success: boolean;
  statusId?: number;
  threadId?: number;
  error?: string;
  /** Number of findings skipped due to deduplication */
  skippedDuplicates?: number;
  /** Number of findings skipped due to invalid line numbers */
  skippedInvalidLines?: number;
  /** Details about findings with invalid lines (for debugging) */
  invalidLineDetails?: {
    file: string;
    line?: number;
    reason: string;
    nearestValidLine?: number;
  }[];
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
 * Start a commit status in 'pending' state
 * Call this at the beginning of the review to show users the review is running
 */
export async function startBuildStatus(context: ADOContext): Promise<number> {
  const baseUrl = `https://dev.azure.com/${context.organization}/${context.project}/_apis/git/repositories/${context.repositoryId}`;

  const statusPayload = {
    state: 'pending',
    description: 'AI Code Review in progress...',
    context: {
      name: 'AI Code Review',
      genre: 'continuous-integration',
    },
  };

  const response = await fetch(
    `${baseUrl}/commits/${context.sourceRefCommit}/statuses?api-version=7.1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.token}`,
      },
      body: JSON.stringify(statusPayload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to start build status: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { id: number };
  console.log(`[ado] Started commit status ${data.id} (pending)`);
  return data.id;
}

/**
 * Post findings to Azure DevOps
 */
export async function reportToADO(
  findings: Finding[],
  context: ADOContext,
  config: Config
): Promise<ReportResult> {
  const reportingConfig = config.reporting.ado ?? {
    mode: 'threads_and_status',
    max_inline_comments: 20,
    summary: true,
    thread_status: 'active',
  };

  // Process findings
  const deduplicated = deduplicateFindings(findings);
  const sorted = sortFindings(deduplicated);
  const counts = countBySeverity(sorted);

  // Build line map for validation (if diff files provided)
  const diffLineMap = context.diffFiles ? buildDiffLineMap(context.diffFiles) : null;

  try {
    let statusId: number | undefined;
    let threadId: number | undefined;
    let skippedDuplicates = 0;
    let skippedInvalidLines = 0;
    let invalidLineDetails: ReportResult['invalidLineDetails'] = [];

    // Create/update commit status if enabled
    if (reportingConfig.mode === 'status_only' || reportingConfig.mode === 'threads_and_status') {
      statusId = await updateBuildStatus(context, sorted, counts, config);
    }

    // Post PR threads if enabled
    if (reportingConfig.mode === 'threads_only' || reportingConfig.mode === 'threads_and_status') {
      const result = await postPRThreads(
        context,
        sorted,
        reportingConfig.max_inline_comments,
        reportingConfig.thread_status === 'pending' ? 6 : 1,
        diffLineMap
      );
      threadId = result.threadId;
      skippedDuplicates = result.skippedDuplicates;
      skippedInvalidLines = result.skippedInvalidLines;
      invalidLineDetails = result.invalidLineDetails;
    }

    return {
      success: true,
      statusId,
      threadId,
      skippedDuplicates,
      skippedInvalidLines,
      invalidLineDetails: invalidLineDetails.length > 0 ? invalidLineDetails : undefined,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Create or update commit status with findings summary
 */
async function updateBuildStatus(
  context: ADOContext,
  findings: Finding[],
  counts: Record<Severity, number>,
  config: Config
): Promise<number> {
  // Determine state based on gating config
  let state: 'pending' | 'succeeded' | 'failed' | 'error' = 'succeeded';

  if (config.gating.enabled) {
    if (config.gating.fail_on_severity === 'error' && counts.error > 0) {
      state = 'failed';
    } else if (
      config.gating.fail_on_severity === 'warning' &&
      (counts.error > 0 || counts.warning > 0)
    ) {
      state = 'failed';
    } else if (
      config.gating.fail_on_severity === 'info' &&
      (counts.error > 0 || counts.warning > 0 || counts.info > 0)
    ) {
      state = 'failed';
    }
  }

  const baseUrl = `https://dev.azure.com/${context.organization}/${context.project}/_apis/git/repositories/${context.repositoryId}`;

  const statusPayload = {
    state,
    description: `${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`,
    context: {
      name: 'AI Code Review',
      genre: 'continuous-integration',
    },
  };

  const response = await fetch(
    `${baseUrl}/commits/${context.sourceRefCommit}/statuses?api-version=7.1`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.token}`,
      },
      body: JSON.stringify(statusPayload),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to update build status: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { id: number };
  console.log(`[ado] Updated commit status ${data.id} with state: ${state}`);
  return data.id;
}

/**
 * Post PR threads (summary + inline comments) with deduplication and line validation
 */
async function postPRThreads(
  context: ADOContext,
  findings: Finding[],
  maxInlineComments: number,
  threadStatus: number,
  diffLineMap: DiffLineMap | null
): Promise<{
  threadId: number;
  skippedDuplicates: number;
  skippedInvalidLines: number;
  invalidLineDetails: {
    file: string;
    line?: number;
    reason: string;
    nearestValidLine?: number;
  }[];
}> {
  const baseUrl = `https://dev.azure.com/${context.organization}/${context.project}/_apis/git/repositories/${context.repositoryId}/pullRequests/${context.pullRequestId}`;

  const summary = generateSummaryMarkdown(findings);

  // Get existing threads for deduplication
  const existingThreadsResponse = await fetch(`${baseUrl}/threads?api-version=7.1`, {
    headers: { Authorization: `Bearer ${context.token}` },
  });

  if (!existingThreadsResponse.ok) {
    throw new Error(`Failed to fetch existing threads: ${existingThreadsResponse.status}`);
  }

  const existingThreadsData = (await existingThreadsResponse.json()) as {
    value: {
      id: number;
      comments: { content: string }[];
      properties?: Record<string, unknown>;
    }[];
  };

  // Find existing summary thread (thread without threadContext = general thread)
  const summaryThread = existingThreadsData.value.find(
    (t) =>
      !t.properties?.['Microsoft.TeamFoundation.Discussion.UniqueID'] &&
      t.comments.some((c) => c.content.includes('## AI Code Review Summary'))
  );

  let threadId: number;

  if (summaryThread && context.summaryThreadId) {
    // Update existing summary thread
    const updatePayload = {
      comments: [
        {
          id: 1,
          content: summary,
          commentType: 1,
        },
      ],
      status: threadStatus,
    };

    const response = await fetch(`${baseUrl}/threads/${summaryThread.id}?api-version=7.1`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.token}`,
      },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      throw new Error(`Failed to update summary thread: ${response.status}`);
    }

    threadId = summaryThread.id;
    console.log(`[ado] Updated existing summary thread ${threadId}`);
  } else {
    // Create new summary thread
    const createPayload = {
      comments: [
        {
          content: summary,
          commentType: 1,
        },
      ],
      status: threadStatus,
    };

    const response = await fetch(`${baseUrl}/threads?api-version=7.1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${context.token}`,
      },
      body: JSON.stringify(createPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create summary thread: ${response.status} ${errorText}`);
    }

    const data = (await response.json()) as { id: number };
    threadId = data.id;
    console.log(`[ado] Created new summary thread ${threadId}`);
  }

  // Build set of existing comment fingerprints from all threads
  const existingFingerprints = new Set<string>();
  for (const thread of existingThreadsData.value) {
    for (const comment of thread.comments) {
      const markers = extractFingerprintMarkers(comment.content);
      for (const marker of markers) {
        existingFingerprints.add(marker);
      }
    }
  }

  // Filter findings for inline comments
  const inlineFindings = findings
    .filter((f): f is Finding & { line: number } => f.line !== undefined)
    .sort((a, b) => {
      // Sort by severity (error > warning > info)
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2);
    });

  let skippedDuplicates = 0;
  let skippedInvalidLines = 0;
  let postedCount = 0;
  const invalidLineDetails: {
    file: string;
    line?: number;
    reason: string;
    nearestValidLine?: number;
  }[] = [];

  for (const finding of inlineFindings) {
    if (postedCount >= maxInlineComments) break;

    const fingerprint = getDedupeKey(finding);

    // Skip if already posted
    if (existingFingerprints.has(fingerprint)) {
      skippedDuplicates++;
      continue;
    }

    // Validate line number against diff if we have a line map
    if (diffLineMap) {
      const validation = validateFindingLine(finding.file, finding.line, diffLineMap, {
        suggestNearest: true,
      });

      if (!validation.valid) {
        skippedInvalidLines++;
        invalidLineDetails.push({
          file: finding.file,
          line: finding.line,
          reason: validation.reason ?? 'Line not in diff',
          nearestValidLine: validation.nearestValidLine,
        });
        console.warn(
          `[ado] Skipping comment on ${finding.file}:${finding.line} - ${validation.reason}` +
            (validation.nearestValidLine
              ? ` (nearest valid line: ${validation.nearestValidLine})`
              : '')
        );
        continue;
      }
    }

    const body = formatInlineComment(finding);
    const threadContext = toADOThreadContext(finding);

    if (!threadContext) {
      console.warn(`[ado] Skipping finding without line info: ${finding.file}`);
      continue;
    }

    try {
      const inlinePayload = {
        comments: [
          {
            content: body,
            commentType: 1,
          },
        ],
        status: threadStatus,
        threadContext,
      };

      const response = await fetch(`${baseUrl}/threads?api-version=7.1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${context.token}`,
        },
        body: JSON.stringify(inlinePayload),
      });

      if (!response.ok) {
        console.warn(`[ado] Failed to post inline comment: ${response.status}`);
        invalidLineDetails.push({
          file: finding.file,
          line: finding.line,
          reason: `API error: HTTP ${response.status}`,
        });
        continue;
      }

      postedCount++;
      existingFingerprints.add(fingerprint);

      // Rate limiting delay
      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      console.warn(`[ado] Failed to post inline comment: ${error}`);
      invalidLineDetails.push({
        file: finding.file,
        line: finding.line,
        reason: `API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    }
  }

  console.log(
    `[ado] Posted ${postedCount} inline comments ` +
      `(skipped ${skippedDuplicates} duplicates, ${skippedInvalidLines} invalid lines)`
  );

  return { threadId, skippedDuplicates, skippedInvalidLines, invalidLineDetails };
}

/**
 * Convert finding to ADO thread context for inline comments
 */
function toADOThreadContext(finding: Finding): {
  filePath: string;
  rightFileStart: { line: number; offset: number };
  rightFileEnd: { line: number; offset: number };
} | null {
  if (!finding.line) return null;

  return {
    filePath: finding.file.startsWith('/') ? finding.file : `/${finding.file}`,
    rightFileStart: { line: finding.line, offset: 1 },
    rightFileEnd: { line: finding.endLine ?? finding.line, offset: 1 },
  };
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
