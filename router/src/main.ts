#!/usr/bin/env node
/**
 * AI Review Router - Main Entry Point
 *
 * Orchestrates multi-pass AI code review using phase modules.
 * This is the orchestrator - actual logic lives in ./phases/*.ts
 */

import { Command } from 'commander';
import { loadConfig, resolveEffectiveModel } from './config.js';
import { checkTrust, buildADOPRContext, type PullRequestContext } from './trust.js';
import { checkBudget, estimateTokens, type BudgetContext } from './budget.js';
import { getDiff, filterFiles, buildCombinedDiff, normalizeGitRef } from './diff.js';
import type { AgentContext } from './agents/types.js';
import { startCheckRun } from './report/github.js';
import { buildRouterEnv } from './agents/security.js';
import { hashConfig } from './cache/key.js';
import {
  runPreflightChecks,
  executeAllPasses,
  processFindings,
  dispatchReport,
  checkGating,
  type Platform,
} from './phases/index.js';

const program = new Command();

program.name('ai-review').description('AI Code Review Router').version('1.0.0');

program
  .command('review')
  .description('Run AI review on a PR or commit range')
  .requiredOption('--repo <path>', 'Path to repository')
  .requiredOption('--base <sha>', 'Base commit SHA')
  .requiredOption('--head <sha>', 'Head commit SHA')
  .option('--pr <number>', 'PR number', parseInt)
  .option('--owner <owner>', 'Repository owner (for GitHub API)')
  .option('--repo-name <name>', 'Repository name (for GitHub API)')
  .option('--dry-run', 'Run without posting results')
  .action(async (options) => {
    try {
      await runReview(options);
    } catch (error) {
      console.error('[router] Fatal error:', error);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate configuration file')
  .requiredOption('--repo <path>', 'Path to repository')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.repo);
      console.log('[validate] Configuration is valid:');
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('[validate] Invalid configuration:', error);
      process.exit(1);
    }
  });

interface ReviewOptions {
  repo: string;
  base: string;
  head: string;
  pr?: number;
  owner?: string;
  repoName?: string;
  dryRun?: boolean;
}

/**
 * Detect the CI platform from environment variables
 */
function detectPlatform(env: Record<string, string | undefined>): Platform {
  if (env['GITHUB_ACTIONS'] === 'true') return 'github';
  if (env['TF_BUILD'] === 'True' || env['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI']) return 'ado';
  return 'unknown';
}

/**
 * Main review orchestration function.
 *
 * Flow:
 * 1. Load config and build contexts
 * 2. Check trust, get diff, filter files
 * 3. Run preflight validation
 * 4. Execute agent passes
 * 5. Process and report findings
 * 6. Check gating
 */
async function runReview(options: ReviewOptions): Promise<void> {
  console.log('[router] Starting AI Review');
  console.log(`[router] Repository: ${options.repo}`);
  console.log(`[router] Diff: ${options.base}...${options.head}`);

  // === PHASE 0: Resolve Git Refs to SHAs ===
  // CRITICAL: Resolve base/head refs to actual SHAs before using them for caching or reporting.
  // This prevents stale cache hits when a branch name is passed as --head.
  // Without this, if --head is 'feat/branch', the cache key would be the same
  // across different commits on that branch, causing incorrect line numbers
  // when cached findings are returned for a different commit.
  const resolvedBase = normalizeGitRef(options.repo, options.base);
  if (resolvedBase !== options.base) {
    console.log(`[router] Resolved base ref: ${options.base} -> ${resolvedBase.slice(0, 12)}`);
  }

  const resolvedHead = normalizeGitRef(options.repo, options.head);
  if (resolvedHead !== options.head) {
    console.log(`[router] Resolved head ref: ${options.head} -> ${resolvedHead.slice(0, 12)}`);
  }

  // === PHASE 1: Setup & Context Building ===
  const routerEnv = buildRouterEnv(process.env as Record<string, string | undefined>);
  const config = await loadConfig(options.repo);
  console.log(`[router] Loaded config with ${config.passes.length} passes`);
  const configHash = hashConfig(config);

  const platform = detectPlatform(routerEnv);
  console.log(`[router] Detected platform: ${platform}`);

  // Build PR context based on platform
  let prContext: PullRequestContext;
  if (platform === 'ado') {
    const adoContext = buildADOPRContext(routerEnv);
    if (!adoContext) {
      console.log('[router] Not running in ADO PR context - skipping review');
      return;
    }
    prContext = adoContext;
  } else {
    const headRepo = routerEnv['GITHUB_HEAD_REPO'];
    const baseRepo = routerEnv['GITHUB_REPOSITORY'];
    const isFork = headRepo !== undefined && headRepo !== '' && headRepo !== baseRepo;

    prContext = {
      number: options.pr ?? 0,
      headRepo: options.owner && options.repoName ? `${options.owner}/${options.repoName}` : '',
      baseRepo: options.owner && options.repoName ? `${options.owner}/${options.repoName}` : '',
      author: routerEnv['GITHUB_ACTOR'] ?? 'unknown',
      isFork,
      isDraft:
        routerEnv['GITHUB_EVENT_NAME'] === 'pull_request' &&
        routerEnv['GITHUB_EVENT_PULL_REQUEST_DRAFT'] === 'true',
    };
  }

  // === PHASE 2: Trust & Diff ===
  const trustResult = checkTrust(prContext, config);
  if (!trustResult.trusted) {
    console.log(`[router] Skipping review: ${trustResult.reason}`);
    return;
  }

  console.log('[router] Extracting diff...');
  const diff = getDiff(options.repo, resolvedBase, resolvedHead);
  console.log(
    `[router] Found ${diff.files.length} changed files (${diff.totalAdditions}+ / ${diff.totalDeletions}-)`
  );

  const filteredFiles = filterFiles(diff.files, config.path_filters);
  console.log(`[router] ${filteredFiles.length} files after filtering`);

  if (filteredFiles.length === 0) {
    console.log('[router] No files to review after filtering');
    return;
  }

  // Start GitHub check run (in_progress state)
  let checkRunId: number | undefined;
  const reportingMode = config.reporting.github?.mode ?? 'checks_and_comments';
  const shouldUseChecks =
    reportingMode === 'checks_only' || reportingMode === 'checks_and_comments';

  if (
    shouldUseChecks &&
    !options.dryRun &&
    options.owner &&
    options.repoName &&
    routerEnv['GITHUB_TOKEN']
  ) {
    try {
      checkRunId = await startCheckRun({
        owner: options.owner,
        repo: options.repoName,
        headSha: resolvedHead,
        token: routerEnv['GITHUB_TOKEN'],
      });
    } catch (error) {
      console.warn('[router] Failed to start check run:', error);
    }
  }

  // === PHASE 3: Budget & Agent Context ===
  const diffContent = buildCombinedDiff(filteredFiles, config.limits.max_diff_lines);
  const estimatedTokenCount = estimateTokens(diffContent);

  const budgetContext: BudgetContext = {
    fileCount: filteredFiles.length,
    diffLines: diff.totalAdditions + diff.totalDeletions,
    estimatedTokens: estimatedTokenCount,
  };

  const budgetCheck = checkBudget(budgetContext, config.limits);
  if (!budgetCheck.allowed) {
    console.warn(`[router] Budget exceeded: ${budgetCheck.reason}`);
  }

  const agentContext: AgentContext = {
    repoPath: options.repo,
    diff,
    files: filteredFiles,
    config,
    diffContent,
    prNumber: options.pr,
    env: routerEnv,
    effectiveModel: resolveEffectiveModel(config, routerEnv),
    provider: null, // Resolved per-agent in execute phase
  };

  // === PHASE 4: Preflight Validation ===
  const preflightResult = runPreflightChecks(
    config,
    agentContext,
    process.env as Record<string, string | undefined>
  );
  if (!preflightResult.valid) {
    console.error('[router] ❌ Preflight validation failed:');
    for (const error of preflightResult.errors) {
      console.error(`[router]   - ${error}`);
    }
    process.exit(1);
  }

  // === PHASE 5: Execute Agent Passes ===
  const executeResult = await executeAllPasses(config, agentContext, routerEnv, budgetCheck, {
    pr: options.pr,
    head: resolvedHead,
    configHash,
  });

  // === PHASE 6: Process & Report Findings ===
  const { sorted } = processFindings(
    executeResult.allFindings,
    executeResult.allResults,
    executeResult.skippedAgents
  );

  await dispatchReport(platform, sorted, config, diff.files, routerEnv, prContext.number, {
    dryRun: options.dryRun,
    owner: options.owner,
    repoName: options.repoName,
    pr: options.pr,
    head: resolvedHead,
    checkRunId,
  });

  // === PHASE 7: Gating ===
  checkGating(config, sorted);

  console.log('[router] Review complete');
}

program.parse();
