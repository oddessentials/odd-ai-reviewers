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
import type { RunStatus } from '../cli/execution-plan.js';
import {
  deduplicateFindings,
  deduplicatePartialFindings,
  sortFindings,
  generateFullSummaryMarkdown,
} from '../report/formats.js';
import { sanitizeFindings } from '../report/sanitize.js';
import {
  validateFindingsSemantics,
  normalizeAndValidateFindings,
} from '../report/finding-validator.js';
import {
  filterFrameworkConventionFindings,
  getValidFindings,
} from '../report/framework-pattern-filter.js';
import {
  filterUserSuppressions,
  enforceBreadthLimits,
  buildSuppressionSummary,
  type SuppressionMode,
  type UserSuppressionResult,
} from '../report/user-suppressions.js';
import type { SkippedAgent } from './execute.js';

export type Platform = 'github' | 'ado' | 'unknown';

export interface DispatchReportResult {
  /** Whether the check run was completed during reporting (always false for ADO) */
  checkRunCompleted: boolean;
  /** Post-normalization validated findings for gating (after Stage 2 validation in reporters) */
  postNormalizationFindings?: Finding[];
}

export interface ReportOptions {
  dryRun?: boolean;
  owner?: string;
  repoName?: string;
  pr?: number;
  head: string;
  /** Optional: use this SHA for GitHub check runs when the review head is not in the base repo */
  githubHeadSha?: string;
  checkRunId?: number;
  /** Canonical run status — when 'incomplete', reporters MUST use neutral/pending conclusion
   *  regardless of gating config. This is the same RunStatus used for CLI exit codes and JSON status. */
  runStatus?: RunStatus;
}

export interface SharedReportFindings {
  /** Complete findings after the relevant reporting pipeline */
  complete: Finding[];
  /** Partial findings after the relevant reporting pipeline */
  partial: Finding[];
  /** Per-rule suppression match counts for JSON output (FR-022) */
  suppressionSummary?: { reason: string; matched: number }[];
}

export interface ProcessedFindings extends SharedReportFindings {
  /** Findings after dedup + semantic validation + user suppression + framework filter + sanitization */
  filtered: Finding[];
  sorted: Finding[];
  partialSorted: Finding[];
  summary: string;
}

interface SharedPreDiffResult {
  findings: Finding[];
  userSuppressionResult?: UserSuppressionResult;
  suppressionSummary?: { reason: string; matched: number }[];
}

function mergeMatchCounts(...matchCounts: Map<number, number>[]): Map<number, number> {
  const merged = new Map<number, number>();

  for (const counts of matchCounts) {
    for (const [ruleIndex, count] of counts) {
      merged.set(ruleIndex, (merged.get(ruleIndex) ?? 0) + count);
    }
  }

  return merged;
}

function buildFrameworkFilterDiffContent(diffFiles: DiffFile[]): string {
  return diffFiles
    .flatMap((diffFile) => {
      if (!diffFile.patch) {
        return [];
      }

      const oldPath = diffFile.oldPath ?? diffFile.path;
      const fromPath = diffFile.status === 'added' ? '/dev/null' : `a/${oldPath}`;
      const toPath = diffFile.status === 'deleted' ? '/dev/null' : `b/${diffFile.path}`;
      const beforeHeader = diffFile.status === 'added' ? '--- /dev/null' : `--- a/${oldPath}`;
      const afterHeader =
        diffFile.status === 'deleted' ? '+++ /dev/null' : `+++ b/${diffFile.path}`;

      return [`diff --git ${fromPath} ${toPath}`, beforeHeader, afterHeader, diffFile.patch].join(
        '\n'
      );
    })
    .join('\n');
}

function applySharedPreDiffReportingStages(
  findings: Finding[],
  diffFiles: DiffFile[],
  prDescription?: string,
  config?: Config,
  suppressionMode?: SuppressionMode
): SharedPreDiffResult {
  const semanticResult = validateFindingsSemantics(findings, prDescription);
  const validated = semanticResult.validFindings;

  const suppressionRules = config?.suppressions?.rules ?? [];
  const disableMatchers = config?.suppressions?.disable_matchers ?? [];
  const securityOverrideAllowlist = config?.suppressions?.security_override_allowlist ?? [];
  let afterSuppression = validated;
  let userSuppressionResult: UserSuppressionResult | undefined;

  if (suppressionRules.length > 0) {
    userSuppressionResult = filterUserSuppressions(validated, suppressionRules);
    afterSuppression = userSuppressionResult.filtered;

    if (userSuppressionResult.suppressed.length > 0) {
      // Diagnostics go to stderr to avoid corrupting JSON/SARIF stdout
      console.error(
        `[router] [user-suppression] Suppressed ${userSuppressionResult.suppressed.length} finding(s) via ${suppressionRules.length} rule(s)`
      );
    }

    enforceBreadthLimits(
      suppressionRules,
      userSuppressionResult,
      suppressionMode ?? 'local',
      securityOverrideAllowlist
    );
  }

  const diffContent = buildFrameworkFilterDiffContent(diffFiles);
  const frameworkResult = filterFrameworkConventionFindings(
    afterSuppression,
    diffContent,
    disableMatchers
  );
  const frameworkFiltered = getValidFindings(frameworkResult);

  if (frameworkResult.suppressed > 0) {
    // Diagnostics go to stderr to avoid corrupting JSON/SARIF stdout
    console.error(
      `[router] [framework-filter] Suppressed ${frameworkResult.suppressed} framework convention finding(s)`
    );
  }

  const suppressionSummary = userSuppressionResult
    ? buildSuppressionSummary(suppressionRules, userSuppressionResult.matchCounts)
    : undefined;

  return { findings: frameworkFiltered, userSuppressionResult, suppressionSummary };
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
  skippedAgents: SkippedAgent[],
  diffFiles: DiffFile[] = [],
  prDescription?: string,
  config?: Config,
  suppressionMode?: SuppressionMode
): ProcessedFindings {
  // Process complete findings (from successful agents)
  const deduplicated = deduplicateFindings(completeFindings);
  const sharedPreDiff = applySharedPreDiffReportingStages(
    deduplicated,
    diffFiles,
    prDescription,
    config,
    suppressionMode
  );

  // Sanitize after all filtering (defense-in-depth for platform posting)
  const sanitized = sanitizeFindings(sharedPreDiff.findings);
  const sorted = sortFindings(sanitized);

  // Process partial findings (from failed agents) separately
  // FR-010: Partial dedup uses sourceAgent in key to preserve cross-agent findings
  // FR-011: No cross-collection deduplication - partial findings stay separate
  const partialDeduplicated = deduplicatePartialFindings(partialFindings);
  const partialSharedPreDiff = applySharedPreDiffReportingStages(
    partialDeduplicated,
    diffFiles,
    prDescription,
    config,
    suppressionMode
  );
  const partialSanitized = sanitizeFindings(partialSharedPreDiff.findings);
  const partialSorted = sortFindings(partialSanitized);
  const suppressionRules = config?.suppressions?.rules ?? [];
  const suppressionSummary =
    suppressionRules.length > 0
      ? buildSuppressionSummary(
          suppressionRules,
          mergeMatchCounts(
            sharedPreDiff.userSuppressionResult?.matchCounts ?? new Map<number, number>(),
            partialSharedPreDiff.userSuppressionResult?.matchCounts ?? new Map<number, number>()
          )
        )
      : sharedPreDiff.suppressionSummary;

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

  // NOTE: These counts are pre-normalization (Stage 1 only). Platform reporters apply
  // Stage 2 (diff-bound validation) which may further filter findings. The reporter-generated
  // summaries in check runs / PR comments use post-Stage-2 counts and are the source of truth.
  console.log(
    `[router] Complete findings (pre-normalization): ${sorted.length} (deduplicated from ${completeFindings.length})`
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

  return {
    complete: sorted,
    partial: partialSorted,
    filtered: sanitized,
    sorted,
    partialSorted,
    summary,
    suppressionSummary,
  };
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
): Promise<DispatchReportResult | undefined> {
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
      diffFiles,
      options.runStatus
    );

    if (reportResult.success) {
      console.log('[router] Successfully reported to GitHub');
      if (reportResult.inlineCommentsGated) {
        console.log('[router] Inline comments were suppressed by drift gate');
      }
    } else {
      console.error('[router] Failed to report to GitHub:', reportResult.error);
    }
    return {
      checkRunCompleted: reportResult.checkRunCompleted ?? false,
      postNormalizationFindings: reportResult.postNormalizationFindings,
    };
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
      diffFiles,
      options.runStatus
    );

    if (reportResult.success) {
      console.log('[router] Successfully reported to Azure DevOps');
      if (reportResult.inlineCommentsGated) {
        console.log('[router] Inline comments were suppressed by drift gate');
      }
    } else {
      console.error('[router] Failed to report to Azure DevOps:', reportResult.error);
    }
    return {
      checkRunCompleted: false,
      postNormalizationFindings: reportResult.postNormalizationFindings,
    };
  }
}

/**
 * Apply Stage 2 normalization and diff-bound validation outside hosted reporters.
 * This keeps dry-run and unknown-platform gating aligned with GitHub/ADO behavior.
 */
export function getPostNormalizationFindings(
  findings: Finding[],
  diffFiles: DiffFile[]
): Finding[] {
  return normalizeAndValidateFindings(findings, diffFiles, 'router').validatedFindings;
}

/**
 * Shared 4-stage post-processing pipeline for findings (FR-018).
 *
 * Applies stages in contract order:
 *   1. Stage 1 — Semantic validation (self-contradiction filter)
 *   2. Framework convention filter
 *   3. Stage 2 — Diff-bound validation (line/path normalization)
 *   4. Sanitize (presentation concern — HTML entity escaping for platform posting)
 *
 * Sanitization runs LAST to avoid corrupting text that matcher regexes match against.
 *
 * Used by CLI local review, benchmark adapter, and any code path that needs
 * the same suppression behavior as hosted mode.
 */
export function applyFindingsPipeline(
  findings: Finding[],
  diffFiles: DiffFile[],
  prDescription?: string,
  config?: Config,
  suppressionMode?: SuppressionMode
): Finding[] {
  const sharedPreDiff = applySharedPreDiffReportingStages(
    findings,
    diffFiles,
    prDescription,
    config,
    suppressionMode
  );

  // Stage 2: Diff-bound validation
  const postNorm = normalizeAndValidateFindings(sharedPreDiff.findings, diffFiles, 'pipeline');

  // Stage 3: Sanitize (defense-in-depth for platform posting, after all filtering)
  return sanitizeFindings(postNorm.validatedFindings);
}

/**
 * Shared local-reporting pipeline.
 *
 * Produces the same suppression-aware metadata contract used by hosted reporting,
 * while applying Stage 2 diff-bound validation required for local gating/terminal output.
 */
export function processLocalReportFindings(
  completeFindings: Finding[],
  partialFindings: Finding[],
  diffFiles: DiffFile[],
  config?: Config,
  suppressionMode?: SuppressionMode
): SharedReportFindings {
  const sharedPreDiff = applySharedPreDiffReportingStages(
    completeFindings,
    diffFiles,
    undefined,
    config,
    suppressionMode
  );
  const postNorm = normalizeAndValidateFindings(sharedPreDiff.findings, diffFiles, 'pipeline');
  const partialSharedPreDiff = applySharedPreDiffReportingStages(
    deduplicatePartialFindings(partialFindings),
    diffFiles,
    undefined,
    config,
    suppressionMode
  );
  const partialPostNorm = normalizeAndValidateFindings(
    partialSharedPreDiff.findings,
    diffFiles,
    'pipeline'
  );
  const suppressionRules = config?.suppressions?.rules ?? [];
  const suppressionSummary =
    suppressionRules.length > 0
      ? buildSuppressionSummary(
          suppressionRules,
          mergeMatchCounts(
            sharedPreDiff.userSuppressionResult?.matchCounts ?? new Map<number, number>(),
            partialSharedPreDiff.userSuppressionResult?.matchCounts ?? new Map<number, number>()
          )
        )
      : sharedPreDiff.suppressionSummary;

  return {
    complete: sanitizeFindings(postNorm.validatedFindings),
    partial: sanitizeFindings(partialPostNorm.validatedFindings),
    suppressionSummary,
  };
}

/**
 * Error thrown when gating detects blocking findings.
 * Distinct from FatalExecutionError to allow callers to handle gating
 * exits through the injected exitHandler rather than process.exit.
 */
export class GatingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatingError';
  }
}

/**
 * Check gating and throw if blocking findings present.
 *
 * FR-008: Gating uses ONLY completeFindings (from successful agents).
 * Partial findings from failed agents are rendered in reports but do NOT block merges.
 * This ensures that agent failures don't cause unexpected CI failures.
 *
 * @throws {GatingError} when blocking findings are present
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
    throw new GatingError('Blocking severity findings present');
  }
}
