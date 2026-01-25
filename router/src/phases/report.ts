/**
 * Report Dispatch Module
 *
 * Handles platform-specific reporting dispatch.
 * Extracted from main.ts lines 449-500.
 */

import type { Config } from '../config.js';
import type { Finding, AgentResult } from '../agents/types.js';
import type { DiffFile } from '../diff.js';
import { reportToGitHub, type GitHubContext } from '../report/github.js';
import { reportToADO, type ADOContext } from '../report/ado.js';
import {
  deduplicateFindings,
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
  checkRunId?: number;
}

export interface ProcessedFindings {
  deduplicated: Finding[];
  sorted: Finding[];
  summary: string;
}

/**
 * Process findings: deduplicate, sanitize, sort, and generate summary.
 */
export function processFindings(
  allFindings: Finding[],
  allResults: AgentResult[],
  skippedAgents: SkippedAgent[]
): ProcessedFindings {
  const deduplicated = deduplicateFindings(allFindings);
  // Sanitize findings before sorting/posting (defense-in-depth)
  const sanitized = sanitizeFindings(deduplicated);
  const sorted = sortFindings(sanitized);
  const summary = generateFullSummaryMarkdown(sorted, allResults, skippedAgents);

  console.log(
    `[router] Total findings: ${sorted.length} (deduplicated from ${allFindings.length})`
  );

  // Log skipped agents summary
  if (skippedAgents.length > 0) {
    console.log(`[router] Skipped agents: ${skippedAgents.length}`);
    for (const s of skippedAgents) {
      console.log(`[router]   - ${s.name}: ${s.reason}`);
    }
  }

  console.log('\n' + summary);

  return { deduplicated: sanitized, sorted, summary };
}

/**
 * Dispatch report to the appropriate platform.
 */
export async function dispatchReport(
  platform: Platform,
  findings: Finding[],
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
      headSha: options.head,
      token: routerEnv['GITHUB_TOKEN'],
      checkRunId: options.checkRunId,
    };

    console.log('[router] Reporting to GitHub...');
    const reportResult = await reportToGitHub(findings, githubContext, config, diffFiles);

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
    const reportResult = await reportToADO(findings, adoContext, config, diffFiles);

    if (reportResult.success) {
      console.log('[router] Successfully reported to Azure DevOps');
    } else {
      console.error('[router] Failed to report to Azure DevOps:', reportResult.error);
    }
  }
}

/**
 * Check gating and exit if blocking findings present.
 */
export function checkGating(config: Config, findings: Finding[]): void {
  if (!config.gating.enabled) {
    return;
  }

  const hasBlockingFindings = findings.some((f) => {
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
