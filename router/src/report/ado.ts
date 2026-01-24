/**
 * Azure DevOps Reporter
 * Posts findings as PR threads and commit statuses
 * Includes deduplication and throttling
 */

import type { Finding, Severity } from '../agents/index.js';
import type { Config } from '../config.js';
import {
  deduplicateFindings,
  sortFindings,
  generateSummaryMarkdown,
  countBySeverity,
  buildFingerprintMarker,
  extractFingerprintMarkers,
  getDedupeKey,
} from './formats.js';
import type { DiffFile } from '../diff.js';
import { canonicalizeDiffFiles } from '../diff.js';
import {
  buildLineResolver,
  normalizeFindingsForDiff,
  computeDriftSignal,
  generateDriftMarkdown,
  type ValidationStats,
  type InvalidLineDetail,
  type DriftSignal,
} from './line-resolver.js';

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
}

export interface ReportResult {
  success: boolean;
  statusId?: number;
  threadId?: number;
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
  config: Config,
  diffFiles: DiffFile[]
): Promise<ReportResult> {
  const reportingConfig = config.reporting.ado ?? {
    mode: 'threads_and_status',
    max_inline_comments: 20,
    summary: true,
    thread_status: 'active',
  };

  // CANONICAL ENTRYPOINT: Ensure all diff paths are normalized FIRST
  // This must happen before buildLineResolver, deleted set, or rename maps
  const canonicalFiles = canonicalizeDiffFiles(diffFiles);

  // Build line resolver and normalize findings from canonical files
  const lineResolver = buildLineResolver(canonicalFiles);
  const normalizationResult = normalizeFindingsForDiff(findings, lineResolver);

  if (normalizationResult.stats.dropped > 0 || normalizationResult.stats.normalized > 0) {
    console.log(
      `[ado] Line validation: ${normalizationResult.stats.valid} valid, ` +
        `${normalizationResult.stats.normalized} normalized, ${normalizationResult.stats.dropped} dropped`
    );
  }

  // Compute drift signal for visibility in PR thread summary
  const driftSignal = computeDriftSignal(
    normalizationResult.stats,
    normalizationResult.invalidDetails
  );

  // Process normalized findings
  const deduplicated = deduplicateFindings(normalizationResult.findings);
  const sorted = sortFindings(deduplicated);
  const counts = countBySeverity(sorted);

  try {
    let statusId: number | undefined;
    let threadId: number | undefined;
    let skippedDuplicates = 0;

    // Create/update commit status if enabled
    if (reportingConfig.mode === 'status_only' || reportingConfig.mode === 'threads_and_status') {
      statusId = await updateBuildStatus(context, sorted, counts, config);
    }

    // Post PR threads if enabled
    if (reportingConfig.mode === 'threads_only' || reportingConfig.mode === 'threads_and_status') {
      // Build set of deleted files for belt-and-suspenders guard in postPRThreads
      const deletedFiles = new Set(
        diffFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );
      const result = await postPRThreads(
        context,
        sorted,
        reportingConfig.max_inline_comments,
        reportingConfig.thread_status === 'pending' ? 6 : 1,
        deletedFiles,
        driftSignal
      );
      threadId = result.threadId;
      skippedDuplicates = result.skippedDuplicates;
    }

    return {
      success: true,
      statusId,
      threadId,
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
 * Post PR threads (summary + inline comments) with deduplication
 */
async function postPRThreads(
  context: ADOContext,
  findings: Finding[],
  maxInlineComments: number,
  threadStatus: number,
  deletedFiles: Set<string> = new Set<string>(),
  driftSignal?: DriftSignal
): Promise<{ threadId: number; skippedDuplicates: number }> {
  const baseUrl = `https://dev.azure.com/${context.organization}/${context.project}/_apis/git/repositories/${context.repositoryId}/pullRequests/${context.pullRequestId}`;

  // Generate summary with drift visibility when thresholds exceeded
  const baseSummary = generateSummaryMarkdown(findings);
  const driftMarkdown = driftSignal ? generateDriftMarkdown(driftSignal) : '';
  const summary = baseSummary + driftMarkdown;

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

  let skippedDuplicates = 0;
  let postedCount = 0;

  for (const finding of inlineFindings) {
    if (postedCount >= maxInlineComments) break;

    const fingerprint = getDedupeKey(finding);

    // Skip if already posted
    if (existingFingerprints.has(fingerprint)) {
      skippedDuplicates++;
      continue;
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
        continue;
      }

      postedCount++;
      existingFingerprints.add(fingerprint);

      // Rate limiting delay
      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      console.warn(`[ado] Failed to post inline comment: ${error}`);
    }
  }

  console.log(
    `[ado] Posted ${postedCount} inline comments (skipped ${skippedDuplicates} duplicates)`
  );

  return { threadId, skippedDuplicates };
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
