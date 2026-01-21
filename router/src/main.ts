#!/usr/bin/env node
/**
 * AI Review Router - Main Entry Point
 * Orchestrates multi-pass AI code review
 */

import { Command } from 'commander';
import { loadConfig, resolveEffectiveModel, resolveProvider } from './config.js';
import { checkTrust, type PullRequestContext } from './trust.js';
import { checkBudget, estimateTokens, type BudgetContext } from './budget.js';
import { getDiff, filterFiles, buildCombinedDiff } from './diff.js';
import {
  getAgentsByIds,
  type AgentContext,
  type AgentResult,
  type Finding,
} from './agents/index.js';
import { reportToGitHub, startCheckRun, type GitHubContext } from './report/github.js';
import {
  deduplicateFindings,
  sortFindings,
  generateFullSummaryMarkdown,
} from './report/formats.js';
import { buildRouterEnv, buildAgentEnv, isKnownAgentId } from './agents/security.js';
import { getCached, setCache } from './cache/store.js';
import { generateCacheKey, hashConfig } from './cache/key.js';
import {
  validateAgentSecrets,
  validateModelConfig,
  validateModelProviderMatch,
  validateOllamaConfig,
} from './preflight.js';
import { isMainBranchPush, isAgentForbiddenOnMain } from './policy.js';

const program = new Command();

/**
 * Agent concurrency limits
 * Agents execute sequentially by default (for loop at line 167).
 * This map documents explicit limits for resource-intensive agents.
 */
const _AGENT_CONCURRENCY_LIMITS: Record<string, number> = {
  local_llm: 1, // Only one LLM request at a time (CPU/memory intensive)
  ai_semantic_review: 1, // OpenAI rate limiting
  pr_agent: 1, // OpenAI rate limiting
};

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

async function runReview(options: ReviewOptions): Promise<void> {
  console.log('[router] Starting AI Review');
  console.log(`[router] Repository: ${options.repo}`);
  console.log(`[router] Diff: ${options.base}...${options.head}`);

  const routerEnv = buildRouterEnv(process.env as Record<string, string | undefined>);

  // Load configuration
  const config = await loadConfig(options.repo);
  console.log(`[router] Loaded config with ${config.passes.length} passes`);
  const configHash = hashConfig(config);

  // Build PR context for trust check
  // Note: GITHUB_HEAD_REPO is only set for fork PRs by some CI systems.
  // If not set, assume same repo (not a fork) to avoid false positives.
  const headRepo = routerEnv['GITHUB_HEAD_REPO'];
  const baseRepo = routerEnv['GITHUB_REPOSITORY'];
  const isFork = headRepo !== undefined && headRepo !== '' && headRepo !== baseRepo;

  const prContext: PullRequestContext = {
    number: options.pr ?? 0,
    headRepo: options.owner && options.repoName ? `${options.owner}/${options.repoName}` : '',
    baseRepo: options.owner && options.repoName ? `${options.owner}/${options.repoName}` : '',
    author: routerEnv['GITHUB_ACTOR'] ?? 'unknown',
    isFork,
    isDraft:
      routerEnv['GITHUB_EVENT_NAME'] === 'pull_request' &&
      routerEnv['GITHUB_EVENT_PULL_REQUEST_DRAFT'] === 'true',
  };

  // Check trust
  const trustResult = checkTrust(prContext, config);
  if (!trustResult.trusted) {
    console.log(`[router] Skipping review: ${trustResult.reason}`);
    return;
  }

  // Get diff
  console.log('[router] Extracting diff...');
  const diff = getDiff(options.repo, options.base, options.head);
  console.log(
    `[router] Found ${diff.files.length} changed files (${diff.totalAdditions}+ / ${diff.totalDeletions}-)`
  );

  // Filter files
  const filteredFiles = filterFiles(diff.files, config.path_filters);
  console.log(`[router] ${filteredFiles.length} files after filtering`);

  if (filteredFiles.length === 0) {
    console.log('[router] No files to review after filtering');
    return;
  }

  // Start GitHub check run in 'in_progress' state for proper lifecycle
  // This shows users the review is actively running
  // Only start after early exits to prevent orphaned in_progress checks
  // Only start if reporting mode includes checks (not comments_only)
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
        headSha: options.head,
        token: routerEnv['GITHUB_TOKEN'],
      });
    } catch (error) {
      console.warn('[router] Failed to start check run:', error);
      // Continue without check run - will fall back to creating on completion
    }
  }

  // Build combined diff for LLM context
  const diffContent = buildCombinedDiff(filteredFiles, config.limits.max_diff_lines);
  const estimatedTokenCount = estimateTokens(diffContent);

  // Check budget
  const budgetContext: BudgetContext = {
    fileCount: filteredFiles.length,
    diffLines: diff.totalAdditions + diff.totalDeletions,
    estimatedTokens: estimatedTokenCount,
  };

  const budgetCheck = checkBudget(budgetContext, config.limits);
  if (!budgetCheck.allowed) {
    console.warn(`[router] Budget exceeded: ${budgetCheck.reason}`);
    // Continue with static analysis only
  }

  // Build agent context
  const agentContext: AgentContext = {
    repoPath: options.repo,
    diff,
    files: filteredFiles,
    config,
    diffContent,
    prNumber: options.pr,
    env: routerEnv,
    effectiveModel: resolveEffectiveModel(config, routerEnv),
    provider: null, // Resolved per-agent below
  };

  // Preflight validation: ensure required secrets are configured for enabled agents
  // This fails fast before any agent execution with clear error messages
  const preflight = validateAgentSecrets(config, process.env as Record<string, string | undefined>);
  if (!preflight.valid) {
    console.error('[router] ❌ Preflight validation failed:');
    for (const error of preflight.errors) {
      console.error(`[router]   - ${error}`);
    }
    process.exit(1);
  }

  // Model config validation: fail if no model is configured
  const modelValidation = validateModelConfig(
    agentContext.effectiveModel,
    process.env as Record<string, string | undefined>
  );
  if (!modelValidation.valid) {
    console.error('[router] ❌ Model configuration validation failed:');
    for (const error of modelValidation.errors) {
      console.error(`[router]   - ${error}`);
    }
    process.exit(1);
  }

  // Model-provider match validation: fail if model requires unavailable provider
  const modelProviderCheck = validateModelProviderMatch(
    agentContext.effectiveModel,
    process.env as Record<string, string | undefined>
  );
  if (!modelProviderCheck.valid) {
    console.error('[router] ❌ Model-provider mismatch:');
    for (const error of modelProviderCheck.errors) {
      console.error(`[router]   - ${error}`);
    }
    process.exit(1);
  }

  // Ollama config validation: fail if local_llm required but OLLAMA_BASE_URL missing
  const ollamaCheck = validateOllamaConfig(
    config,
    process.env as Record<string, string | undefined>
  );
  if (!ollamaCheck.valid) {
    console.error('[router] ❌ Ollama configuration missing:');
    for (const error of ollamaCheck.errors) {
      console.error(`[router]   - ${error}`);
    }
    process.exit(1);
  }

  // Run passes
  const allFindings: Finding[] = [];
  const allResults: AgentResult[] = [];
  const skippedAgents: { id: string; name: string; reason: string }[] = [];

  for (const pass of config.passes) {
    if (!pass.enabled) {
      console.log(`[router] Skipping disabled pass: ${pass.name}`);
      continue;
    }

    console.log(`[router] Running pass: ${pass.name} (required: ${pass.required})`);
    const agents = getAgentsByIds(pass.agents);

    // Check if this pass uses PAID LLM services and we're over budget
    // Local LLM (Ollama) is exempt from budget checks since it's free
    const usesPaidLlm = agents.some((a) => a.usesLlm && a.id !== 'local_llm');
    if (usesPaidLlm && !budgetCheck.allowed) {
      if (pass.required) {
        console.error(`[router] ❌ Required pass ${pass.name} blocked by budget limit`);
        process.exit(1);
      }
      console.log(`[router] Skipping optional paid LLM pass due to budget: ${pass.name}`);
      for (const agent of agents) {
        skippedAgents.push({ id: agent.id, name: agent.name, reason: 'Budget limit exceeded' });
      }
      continue;
    }

    for (const agent of agents) {
      console.log(`[router] Running agent: ${agent.name} (${agent.id})`);

      try {
        if (!isKnownAgentId(agent.id)) {
          throw new Error(`Unknown agent id "${agent.id}" has no allowlisted environment`);
        }

        // Check if LLM agent is forbidden on main branch pushes
        // Note: PRs targeting main are allowed (isMainBranchPush returns false for PRs)
        if (isMainBranchPush(routerEnv) && isAgentForbiddenOnMain(agent.id)) {
          console.error(
            `[router] Policy violation: in-process LLM agent "${agent.id}" is forbidden on direct main push`
          );
          process.exit(1);
        }

        const scopedContext: AgentContext = {
          ...agentContext,
          env: buildAgentEnv(agent.id, routerEnv),
          provider: resolveProvider(agent.id as Parameters<typeof resolveProvider>[0], routerEnv),
        };

        let result: AgentResult | null = null;

        if (options.pr && options.head) {
          const cacheKey = generateCacheKey({
            prNumber: options.pr,
            headSha: options.head,
            configHash,
            agentId: agent.id,
          });
          const cached = await getCached(cacheKey);
          if (cached) {
            console.log(`[router] Cache hit for ${agent.id}`);
            result = cached;
          }
        }

        if (!result) {
          result = await agent.run(scopedContext);

          if (options.pr && options.head && result.success) {
            const cacheKey = generateCacheKey({
              prNumber: options.pr,
              headSha: options.head,
              configHash,
              agentId: agent.id,
            });
            await setCache(cacheKey, result);
          }
        }
        allResults.push(result);

        if (result.success) {
          console.log(
            `[router] ${agent.name}: ${result.findings.length} findings in ${result.metrics.durationMs}ms`
          );
          allFindings.push(...result.findings);
        } else {
          // Agent failed - check if pass is required
          if (pass.required) {
            console.error(`[router] ❌ Required agent ${agent.name} failed: ${result.error}`);
            process.exit(1);
          }
          // Optional agent failed - log skip reason and continue
          console.log(`[router] ⏭️  Optional agent ${agent.name} skipped: ${result.error}`);
          skippedAgents.push({
            id: agent.id,
            name: agent.name,
            reason: result.error || 'Unknown error',
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (pass.required) {
          console.error(`[router] ❌ Required agent ${agent.name} crashed: ${errorMsg}`);
          process.exit(1);
        }
        console.error(`[router] ⏭️  Optional agent ${agent.name} crashed: ${errorMsg}`);
        skippedAgents.push({ id: agent.id, name: agent.name, reason: errorMsg });
      }
    }
  }

  // Process findings
  const deduplicated = deduplicateFindings(allFindings);
  const sorted = sortFindings(deduplicated);

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

  // Generate summary with agent status table
  const summary = generateFullSummaryMarkdown(sorted, allResults, skippedAgents);
  console.log('\n' + summary);

  // Report to GitHub (unless dry run)
  if (!options.dryRun && options.owner && options.repoName && routerEnv['GITHUB_TOKEN']) {
    const githubContext: GitHubContext = {
      owner: options.owner,
      repo: options.repoName,
      prNumber: options.pr,
      headSha: options.head,
      token: routerEnv['GITHUB_TOKEN'],
      checkRunId, // Pass check run ID for proper lifecycle (update vs create)
    };

    console.log('[router] Reporting to GitHub...');
    const reportResult = await reportToGitHub(sorted, githubContext, config);

    if (reportResult.success) {
      console.log('[router] Successfully reported to GitHub');
    } else {
      console.error('[router] Failed to report to GitHub:', reportResult.error);
    }
  } else if (options.dryRun) {
    console.log('[router] Dry run - skipping GitHub reporting');
  }

  // Check gating
  if (config.gating.enabled) {
    const hasBlockingFindings = sorted.some((f) => {
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

  console.log('[router] Review complete');
}

program.parse();
