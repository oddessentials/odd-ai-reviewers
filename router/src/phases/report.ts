/**
 * Report Dispatch Module
 *
 * Handles platform-specific reporting dispatch.
 * Extracted from main.ts lines 449-500.
 */

import type { Config } from '../config.js';
import {
  isSuccess,
  isFailure,
  isSkipped,
  type Finding,
  type AgentResult,
} from '../agents/types.js';
import { assertNever } from '../types/assert-never.js';
import type { DiffFile } from '../diff.js';
import { reportToGitHub, type GitHubContext } from '../report/github.js';
import { reportToADO, type ADOContext } from '../report/ado.js';
import {
  deduplicateFindings,
  deduplicatePartialFindings,
  sortFindings,
  generateFullSummaryMarkdown,
} from '../report/formats.js';
import { sanitizeFindings } from '../report/sanitize.js';
import type { SkippedAgent } from './execute.js';

export type Platform = 'github' | 'ado' | 'unknown';

export interface ReportOptions {
  dryRun?: boolean;
  owner?: string;
  repoName?: string;
  pr?: number;
  head: string;
  /** Optional: use this SHA for GitHub check runs when the review head is not in the base repo */
  githubHeadSha?: string;
  checkRunId?: number;
}

export interface ProcessedFindings {
  deduplicated: Finding[];
  sorted: Finding[];
  partialSorted: Finding[];
  summary: string;
}

/**
 * Process findings: deduplicate, sanitize, sort, and generate summary.
 *
 * (012-fix-agent-result-regressions) - Updated to handle completeFindings and partialFindings
 * separately. Partial findings are rendered in a dedicated section but NOT used for gating.
 */
export function processFindings(
  completeFindings: Finding[],
  partialFindings: Finding[],
  allResults: AgentResult[],
  skippedAgents: SkippedAgent[]
): ProcessedFindings {
  // Process complete findings (from successful agents)
  const deduplicated = deduplicateFindings(completeFindings);
  // Sanitize findings before sorting/posting (defense-in-depth)
  const sanitized = sanitizeFindings(deduplicated);
  const sorted = sortFindings(sanitized);

  // Process partial findings (from failed agents) separately
  // FR-010: Partial dedup uses sourceAgent in key to preserve cross-agent findings
  // FR-011: No cross-collection deduplication - partial findings stay separate
  const partialDeduplicated = deduplicatePartialFindings(partialFindings);
  const partialSanitized = sanitizeFindings(partialDeduplicated);
  const partialSorted = sortFindings(partialSanitized);

  // Transform AgentResult[] to the format expected by generateFullSummaryMarkdown
  // This adapts the new discriminated union to the legacy format
  const resultsForSummary = allResults
    .filter((r) => !isSkipped(r))
    .map((r) => {
      if (isSuccess(r)) {
        return {
          agentId: r.agentId,
          success: true as const,
          findings: r.findings,
          error: undefined,
        };
      } else if (isFailure(r)) {
        return {
          agentId: r.agentId,
          success: false as const,
          findings: r.partialFindings,
          error: r.error,
        };
      }
      // Exhaustive check - compile error if new variant added (FR-003)
      return assertNever(r);
    });

  const summary = generateFullSummaryMarkdown(
    sorted,
    partialSorted,
    resultsForSummary,
    skippedAgents
  );

  console.log(
    `[router] Complete findings: ${sorted.length} (deduplicated from ${completeFindings.length})`
  );
  if (partialFindings.length > 0) {
    console.log(
      `[router] Partial findings: ${partialSorted.length} (deduplicated from ${partialFindings.length})`
    );
  }

  // Log skipped agents summary
  if (skippedAgents.length > 0) {
    console.log(`[router] Skipped agents: ${skippedAgents.length}`);
    for (const s of skippedAgents) {
      console.log(`[router]   - ${s.name}: ${s.reason}`);
    }
  }

  console.log('\n' + summary);

  return { deduplicated: sanitized, sorted, partialSorted, summary };
}

/**
 * Dispatch report to the appropriate platform.
 *
 * (012-fix-agent-result-regressions) - Now accepts partialFindings to include
 * in GitHub/ADO reports. Partial findings are rendered in a dedicated section
 * that makes clear they're from failed agents and don't affect gating.
 */
export async function dispatchReport(
  platform: Platform,
  findings: Finding[],
  partialFindings: Finding[],
  config: Config,
  diffFiles: DiffFile[],
  routerEnv: Record<string, string | undefined>,
  prNumber: number,
  options: ReportOptions
): Promise<void> {
  if (options.dryRun) {
    console.log('[router] Dry run - skipping reporting');
    return;
  }

  if (platform === 'github' && options.owner && options.repoName && routerEnv['GITHUB_TOKEN']) {
    const githubContext: GitHubContext = {
      owner: options.owner,
      repo: options.repoName,
      prNumber: options.pr,
      headSha: options.githubHeadSha ?? options.head,
      token: routerEnv['GITHUB_TOKEN'],
      checkRunId: options.checkRunId,
    };

    console.log('[router] Reporting to GitHub...');
    const reportResult = await reportToGitHub(
      findings,
      partialFindings,
      githubContext,
      config,
      diffFiles
    );

    if (reportResult.success) {
      console.log('[router] Successfully reported to GitHub');
    } else {
      console.error('[router] Failed to report to GitHub:', reportResult.error);
    }
  } else if (platform === 'ado') {
    // Extract ADO context from environment
    const collectionUri = routerEnv['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'] ?? '';
    const organization = collectionUri.split('/').filter(Boolean).pop() ?? '';
    const project = routerEnv['SYSTEM_TEAMPROJECT'] ?? '';
    const repositoryId = routerEnv['BUILD_REPOSITORY_NAME'] ?? '';
    const token = routerEnv['SYSTEM_ACCESSTOKEN'] || routerEnv['AZURE_DEVOPS_PAT'] || '';

    if (!organization || !project || !repositoryId || !token || !prNumber) {
      console.warn('[router] Missing ADO context - skipping reporting');
      return;
    }

    const adoContext: ADOContext = {
      organization,
      project,
      repositoryId,
      pullRequestId: prNumber,
      sourceRefCommit: options.head,
      token,
    };

    console.log('[router] Reporting to Azure DevOps...');
    const reportResult = await reportToADO(
      findings,
      partialFindings,
      adoContext,
      config,
      diffFiles
    );

    if (reportResult.success) {
      console.log('[router] Successfully reported to Azure DevOps');
    } else {
      console.error('[router] Failed to report to Azure DevOps:', reportResult.error);
    }
  }
}

/**
 * Check gating and exit if blocking findings present.
 *
 * FR-008: Gating uses ONLY completeFindings (from successful agents).
 * Partial findings from failed agents are rendered in reports but do NOT block merges.
 * This ensures that agent failures don't cause unexpected CI failures.
 */
export function checkGating(config: Config, completeFindings: Finding[]): void {
  if (!config.gating.enabled) {
    return;
  }

  const hasBlockingFindings = completeFindings.some((f) => {
    if (config.gating.fail_on_severity === 'error') return f.severity === 'error';
    if (config.gating.fail_on_severity === 'warning')
      return f.severity === 'error' || f.severity === 'warning';
    return true;
  });

  if (hasBlockingFindings) {
    console.error('[router] Gating failed - blocking severity findings present');
    process.exit(1);
  }
}
