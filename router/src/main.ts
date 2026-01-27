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
import {
  getDiff,
  filterFiles,
  buildCombinedDiff,
  resolveReviewRefs,
  getGitHubCheckHeadSha,
  type PathFilter,
} from './diff.js';
import { loadReviewIgnore, shouldIgnoreFile } from './reviewignore.js';
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

  // === PHASE 1: Setup & Context Building ===
  const routerEnv = buildRouterEnv(process.env as Record<string, string | undefined>);
  const config = await loadConfig(options.repo);
  console.log(`[router] Loaded config with ${config.passes.length} passes`);
  const configHash = hashConfig(config);

  // Load .reviewignore patterns
  const reviewIgnoreResult = await loadReviewIgnore(options.repo);
  const reviewIgnorePatterns = reviewIgnoreResult.patterns;

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

  console.log('[router] Resolving review refs...');
  // Resolve base/head refs to SHAs for stable cache keys and accurate diff mapping.
  const reviewRefs = resolveReviewRefs(options.repo, options.base, options.head);
  if (reviewRefs.headSource === 'merge-parent') {
    console.log(`[router] Using PR head SHA ${reviewRefs.headSha} for review`);
  }
  const githubHeadSha = getGitHubCheckHeadSha(reviewRefs);
  if (platform === 'github' && reviewRefs.headSource === 'merge-parent') {
    console.log(`[router] Using merge commit SHA ${githubHeadSha} for GitHub checks`);
  }

  console.log('[router] Extracting diff...');
  const diff = getDiff(options.repo, reviewRefs.baseSha, reviewRefs.headSha);
  console.log(
    `[router] Found ${diff.files.length} changed files (${diff.totalAdditions}+ / ${diff.totalDeletions}-)`
  );

  // Count .reviewignore exclusions separately (count-only pre-pass)
  const ignoredByReviewIgnore =
    reviewIgnorePatterns.length > 0
      ? diff.files.filter((f) => shouldIgnoreFile(f.path, reviewIgnorePatterns)).length
      : 0;

  // Combine path_filters from config with .reviewignore patterns
  // Filter precedence (applied in filterFiles):
  //   1. .reviewignore patterns (excludes matching files)
  //   2. path_filters.exclude (excludes additional files)
  //   3. path_filters.include (if set, only keeps matching files - whitelist)
  const pathFilter: PathFilter = {
    ...config.path_filters,
    reviewIgnorePatterns,
  };
  const filteredFiles = filterFiles(diff.files, pathFilter);

  // Calculate path_filters exclusions (approximate if there's overlap)
  const totalExcluded = diff.files.length - filteredFiles.length;
  const ignoredByPathFilters = Math.max(0, totalExcluded - ignoredByReviewIgnore);

  // Log filtering results with breakdown
  console.log(`[router] ${filteredFiles.length} files after filtering`);
  if (ignoredByReviewIgnore > 0) {
    console.log(`[router]   - ${ignoredByReviewIgnore} excluded by .reviewignore`);
  }
  if (ignoredByPathFilters > 0) {
    console.log(`[router]   - ${ignoredByPathFilters} excluded by path_filters`);
  }

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
        headSha: githubHeadSha,
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
    head: reviewRefs.headSha,
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
    head: reviewRefs.headSha,
    githubHeadSha,
    checkRunId,
  });

  // === PHASE 7: Gating ===
  checkGating(config, sorted);

  console.log('[router] Review complete');
}

program.parse();
