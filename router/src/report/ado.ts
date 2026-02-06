/**
 * Azure DevOps Reporter
 * Posts findings as PR threads and commit statuses
 * Includes deduplication and throttling
 */

import type { Finding, Severity } from '../agents/types.js';
import type { Config } from '../config.js';
import {
  deduplicateFindings,
  sortFindings,
  generateSummaryMarkdown,
  renderPartialFindingsSection,
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
  shouldSuppressInlineComments,
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
  /** Whether inline comments were suppressed by drift gate */
  inlineCommentsGated?: boolean;
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
 *
 * (012-fix-agent-result-regressions) - Now accepts partialFindings to include
 * in PR thread summaries. Partial findings are rendered in a dedicated section
 * that makes clear they're from failed agents and don't affect gating.
 */
export async function reportToADO(
  findings: Finding[],
  partialFindings: Finding[],
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
      // FR-003: Use canonicalFiles for path normalization consistency with findings
      const deletedFiles = new Set(
        canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );
      const result = await postPRThreads(
        context,
        sorted,
        partialFindings,
        reportingConfig.max_inline_comments,
        reportingConfig.thread_status === 'pending' ? 6 : 1,
        deletedFiles,
        driftSignal,
        config
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
      inlineCommentsGated: shouldSuppressInlineComments(driftSignal, config.gating.drift_gate),
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
  partialFindings: Finding[],
  maxInlineComments: number,
  threadStatus: number,
  deletedFiles: Set<string> = new Set<string>(),
  driftSignal?: DriftSignal,
  config?: Config
): Promise<{ threadId: number; skippedDuplicates: number }> {
  const baseUrl = `https://dev.azure.com/${context.organization}/${context.project}/_apis/git/repositories/${context.repositoryId}/pullRequests/${context.pullRequestId}`;

  // Generate summary with drift visibility when thresholds exceeded
  // (012-fix-agent-result-regressions) - Include partial findings section
  const baseSummary = generateSummaryMarkdown(findings);
  const partialSection = renderPartialFindingsSection(partialFindings);
  const driftMarkdown = driftSignal ? generateDriftMarkdown(driftSignal) : '';
  const isDriftGated = shouldSuppressInlineComments(
    driftSignal,
    config?.gating?.drift_gate ?? false
  );
  const gateNotice = isDriftGated
    ? '\n> **Drift Gate Active**: Inline comments have been suppressed because line validation ' +
      'degradation exceeds the fail threshold. Review findings in this summary only.\n'
    : '';
  const summary = baseSummary + partialSection + driftMarkdown + gateNotice;

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

  if (summaryThread) {
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

  // Drift gate: suppress inline comments when line validation is too degraded
  if (shouldSuppressInlineComments(driftSignal, config?.gating?.drift_gate ?? false)) {
    console.log(
      `[ado] Drift gate active: suppressing inline comments ` +
        `(degradation: ${driftSignal?.degradationPercent}%)`
    );
    return { threadId, skippedDuplicates: 0 };
  }

  // Build set of existing comment fingerprints and map to thread IDs for resolution
  const existingDedupeKeys: string[] = [];
  const dedupeKeyToThreadId = new Map<string, number>();
  for (const thread of existingThreadsData.value) {
    for (const comment of thread.comments) {
      const markers = extractFingerprintMarkers(comment.content);
      for (const marker of markers) {
        existingDedupeKeys.push(marker);
        dedupeKeyToThreadId.set(marker, thread.id);
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

    // Filter out already-posted findings so grouped comments don't re-post duplicates
    const newFindings = findingsInGroup.filter(
      (f) => !isDuplicateByProximity(f, existingFingerprintSet, proximityMap)
    );
    if (newFindings.length === 0) continue;

    const finding = newFindings[0];
    if (!finding) continue;

    const body =
      newFindings.length > 1
        ? formatGroupedInlineComment(newFindings)
        : formatInlineComment(finding);
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

      for (const groupFinding of findingsInGroup) {
        const key = getDedupeKey(groupFinding);
        existingFingerprintSet.add(key);

        // FR-001: Update proximityMap using canonical pattern
        updateProximityMap(proximityMap, groupFinding);
      }

      // Rate limiting delay
      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      console.warn(`[ado] Failed to post inline comment: ${error}`);
    }
  }

  // Resolve stale threads (threads for issues that no longer exist)
  // FIX: Use grouped comment resolution - only resolve when ALL markers are stale
  const staleKeys = identifyStaleComments(existingDedupeKeys, findings);
  const staleKeySet = new Set(staleKeys);

  // Build reverse map: threadId -> all markers in that thread
  const threadIdToMarkers = buildCommentToMarkersMap(dedupeKeyToThreadId);

  // Track which threads we've already processed to avoid duplicate API calls
  const processedThreadIds = new Set<number>();
  let resolvedCount = 0;
  let partiallyResolvedCount = 0;

  // Process each thread that has at least one stale marker
  for (const staleKey of staleKeys) {
    const threadIdToProcess = dedupeKeyToThreadId.get(staleKey);
    if (!threadIdToProcess || processedThreadIds.has(threadIdToProcess)) continue;

    processedThreadIds.add(threadIdToProcess);

    // Get ALL markers for this thread
    const allMarkersInThread = threadIdToMarkers.get(threadIdToProcess) ?? [];

    // Emit warning if any markers are malformed (FR-010: exactly one warning per thread)
    if (hasMalformedMarkers(allMarkersInThread)) {
      emitMalformedMarkerWarning('ado', threadIdToProcess);
    }

    // Check if thread should be resolved (ALL markers must be stale)
    const shouldResolve = shouldResolveComment(allMarkersInThread, staleKeySet);

    // Get partially resolved markers for visual indication
    const partiallyResolved = getPartiallyResolvedMarkers(allMarkersInThread, staleKeySet);

    // FR-006: Simplified staleCount calculation for clarity (matches GitHub implementation)
    const staleCount = shouldResolve ? allMarkersInThread.length : partiallyResolved.length;
    emitResolutionLog(
      'ado',
      threadIdToProcess,
      allMarkersInThread.length,
      staleCount,
      shouldResolve
    );

    try {
      // Get the existing thread to check its current content
      // Note: O(n) linear search is acceptable here - only called once per processed thread
      // (not per marker), and processedThreadIds prevents duplicates. For enterprise PRs
      // with 1000+ threads, consider indexing existingThreadsData.value by ID upfront.
      const existingThread = existingThreadsData.value.find((t) => t.id === threadIdToProcess);
      const existingContent = existingThread?.comments[0]?.content ?? '';

      // Skip if already marked as fully resolved
      if (existingContent.includes('✅ **Resolved**')) {
        continue;
      }

      if (shouldResolve) {
        // ALL markers are stale - close the thread (status 4 = Closed in ADO)
        const response = await fetch(`${baseUrl}/threads/${threadIdToProcess}?api-version=7.1`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${context.token}`,
          },
          body: JSON.stringify({ status: 4 }), // 4 = Closed
        });

        if (response.ok) {
          resolvedCount++;
        }
      } else if (partiallyResolved.length > 0 && existingContent) {
        // Only SOME markers are stale - apply visual indication (strikethrough)
        const updatedContent = applyPartialResolutionVisual(existingContent, partiallyResolved);

        // Only update if the content actually changed
        if (updatedContent !== existingContent) {
          const response = await fetch(`${baseUrl}/threads/${threadIdToProcess}?api-version=7.1`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${context.token}`,
            },
            body: JSON.stringify({
              comments: [{ id: 1, content: updatedContent }],
            }),
          });

          if (response.ok) {
            partiallyResolvedCount++;
          }
        }
      }

      await delay(INLINE_COMMENT_DELAY_MS);
    } catch (error) {
      console.warn(`[ado] Failed to resolve/update thread ${threadIdToProcess}: ${error}`);
    }
  }

  console.log(
    `[ado] Posted ${postedCount} inline comments, skipped ${skippedDuplicates} duplicates, resolved ${resolvedCount} threads, ${partiallyResolvedCount} partially resolved`
  );

  return { threadId, skippedDuplicates };
}

/**
 * Convert finding to ADO thread context for inline comments.
 *
 * FR-010: ADO Path Format Intentionality
 * The ADO API requires file paths with a leading slash (e.g., `/src/file.ts`) for thread context,
 * while dedupe keys use normalized paths WITHOUT leading slashes (e.g., `src/file.ts`) to match
 * the canonical format from normalizeFindingsForDiff(). This separation is intentional:
 *
 * - Thread context (filePath): ADO API requirement, must have leading slash
 * - Dedupe keys (via getDedupeKey): Use canonical paths without leading slash for consistency
 *   with finding.file values and cross-platform path normalization
 *
 * Do NOT "fix" this by normalizing both to the same format - they serve different purposes.
 */
function toADOThreadContext(finding: Finding): {
  filePath: string;
  rightFileStart: { line: number; offset: number };
  rightFileEnd: { line: number; offset: number };
} | null {
  if (!finding.line) return null;

  return {
    // ADO API requires leading slash for file paths in thread context
    filePath: finding.file.startsWith('/') ? finding.file : `/${finding.file}`,
    rightFileStart: { line: finding.line, offset: 1 },
    rightFileEnd: { line: finding.endLine ?? finding.line, offset: 1 },
  };
}
