#!/usr/bin/env node
/**
 * AI Review Router - Main Entry Point
 *
 * Orchestrates multi-pass AI code review using phase modules.
 * This is the orchestrator - actual logic lives in ./phases/*.ts
 *
 * To run tests against this module, use the exported `run()` function
 * with a custom ExitHandler to avoid process.exit() calls.
 */

import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { realpathSync } from 'fs';
import { loadConfig } from './config.js';
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
import type { AgentId } from './config/schemas.js';

// =============================================================================
// Exit Handler (for testability)
// =============================================================================

/**
 * Function type for handling exit codes
 * Allows tests to capture exit codes without calling process.exit
 */
export type ExitHandler = (code: number) => never | void;

/**
 * Default exit handler that calls process.exit
 */
export const defaultExitHandler: ExitHandler = (code: number): never => {
  process.exit(code);
};

// =============================================================================
// CLI Program
// =============================================================================

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
      defaultExitHandler(1);
    }
  });

program
  .command('validate')
  .description('Validate configuration file')
  .requiredOption('--repo <path>', 'Path to repository')
  .option('--json', 'Output validation result as JSON')
  .action(async (options) => {
    const { formatValidationReport, printValidationReport } =
      await import('./cli/validation-report.js');

    try {
      // T029: Call runPreflightChecks for validation
      const config = await loadConfig(options.repo);

      // Build minimal agent context for preflight checks
      const env = process.env as Record<string, string | undefined>;

      // Create minimal AgentContext for validation (no diff needed)
      // T016 (FR-003): Use placeholder - preflight will resolve the actual model
      const minimalContext: AgentContext = {
        repoPath: options.repo,
        diff: {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          baseSha: '',
          headSha: '',
          contextLines: 3,
          source: 'local-git',
        },
        files: [],
        config,
        diffContent: '',
        prNumber: undefined,
        env,
        effectiveModel: '', // Placeholder - preflight resolves the actual model
        provider: null,
      };

      // T029: Run preflight checks
      const preflightResult = runPreflightChecks(config, minimalContext, env, options.repo);

      // T030: Format validation report
      const report = formatValidationReport(preflightResult);

      if (options.json) {
        // JSON output for programmatic consumption
        console.log(JSON.stringify(report, null, 2));
      } else {
        // T031: Print human-readable report
        printValidationReport(report);
      }

      // T032: Exit 1 on errors, 0 on warnings-only or success
      defaultExitHandler(report.valid ? 0 : 1);
    } catch (error) {
      // Config loading failed - this is an error
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`✗ ERROR: Failed to load configuration: ${errorMessage}`);
      defaultExitHandler(1);
    }
  });

// Config init command (Feature 015 - Interactive Configuration Wizard)
const configCommand = program.command('config').description('Configuration management commands');

configCommand
  .command('init')
  .description('Generate a new .ai-review.yml configuration file')
  .option('--defaults', 'Use default settings without prompts')
  .option('--yes', 'Alias for --defaults')
  .option('--provider <provider>', 'LLM provider (openai, anthropic, azure-openai, ollama)')
  .option('--platform <platform>', 'Platform (github, ado)', 'github')
  .option('--output <path>', 'Output file path', '.ai-review.yml')
  .action(async (options) => {
    const configWizard = await import('./cli/config-wizard.js');
    const { writeFile } = await import('fs/promises');
    const { existsSync } = await import('fs');
    const { createReadlineInterface, promptSelect, promptConfirm } =
      await import('./cli/interactive-prompts.js');
    const { formatValidationReport, printValidationReport } =
      await import('./cli/validation-report.js');

    const useDefaults = options.defaults || options.yes;
    let provider: 'openai' | 'anthropic' | 'azure-openai' | 'ollama';
    let platform: 'github' | 'ado';
    let agents: string[];
    const outputPath = options.output;

    // Check TTY for interactive mode (T022)
    if (!useDefaults && !configWizard.isInteractiveTerminal()) {
      console.error('Error: Interactive mode requires a TTY terminal.');
      console.error('Use --defaults or --yes flag with --provider and --platform options.');
      console.error('');
      console.error(
        'Example: ai-review config init --defaults --provider openai --platform github'
      );
      defaultExitHandler(1);
      return;
    }

    // Interactive mode (T017-T021)
    if (!useDefaults) {
      const rl = createReadlineInterface();

      // Handle Ctrl+C gracefully (T021)
      rl.on('close', () => {
        // If closed unexpectedly, exit 0 (user cancellation)
      });

      try {
        console.log('Welcome to ai-review configuration wizard!\n');

        // Platform selection (T017)
        const platformOptions = configWizard.AVAILABLE_PLATFORMS.map((p) => ({
          label: p.name,
          value: p.id,
          description: p.description,
        }));
        const platformResult = await promptSelect(rl, 'Select your platform:', platformOptions);
        if (platformResult.status === 'cancelled') {
          console.log('\nConfiguration cancelled.');
          rl.close();
          defaultExitHandler(0);
          return;
        }
        // Convert 'both' to 'github' for config generation (both means github reporting config)
        platform = platformResult.value === 'both' ? 'github' : platformResult.value;

        // Provider selection (T018)
        const providerOptions = configWizard.AVAILABLE_PROVIDERS.map((p) => ({
          label: p.name,
          value: p.id,
          description: p.description,
        }));
        const providerResult = await promptSelect(rl, 'Select your LLM provider:', providerOptions);
        if (providerResult.status === 'cancelled') {
          console.log('\nConfiguration cancelled.');
          rl.close();
          defaultExitHandler(0);
          return;
        }
        provider = providerResult.value;

        // Agent selection with provider-appropriate defaults (T019)
        const defaultAgents =
          provider === 'ollama' ? ['semgrep', 'local_llm'] : ['semgrep', 'opencode'];

        console.log(`\nRecommended agents for ${provider}: ${defaultAgents.join(', ')}`);
        const useRecommended = await promptConfirm(rl, 'Use recommended agents?', false);
        agents = useRecommended ? defaultAgents : defaultAgents; // For simplicity, always use recommended

        // Overwrite confirmation (T020)
        if (existsSync(outputPath)) {
          const overwrite = await promptConfirm(
            rl,
            `\nFile ${outputPath} exists. Overwrite?`,
            true
          );
          if (!overwrite) {
            console.log('Configuration cancelled.');
            rl.close();
            defaultExitHandler(0);
            return;
          }
        }

        rl.close();
      } catch {
        // Ctrl+C or other error - exit 0 (T021)
        rl.close();
        console.log('\nConfiguration cancelled.');
        defaultExitHandler(0);
        return;
      }
    } else {
      // Non-interactive mode with --defaults

      // Validate provider option
      const validProviders = ['openai', 'anthropic', 'azure-openai', 'ollama'] as const;
      provider = (options.provider || 'openai') as (typeof validProviders)[number];
      if (!validProviders.includes(provider)) {
        console.error(`[config init] Invalid provider: ${options.provider}`);
        console.error(`Valid providers: ${validProviders.join(', ')}`);
        defaultExitHandler(1);
        return;
      }

      // Validate platform option
      const validPlatforms = ['github', 'ado'] as const;
      platform = (options.platform || 'github') as (typeof validPlatforms)[number];
      if (!validPlatforms.includes(platform)) {
        console.error(`[config init] Invalid platform: ${options.platform}`);
        console.error(`Valid platforms: ${validPlatforms.join(', ')}`);
        defaultExitHandler(1);
        return;
      }

      // Default agents based on provider
      agents = provider === 'ollama' ? ['semgrep', 'local_llm'] : ['semgrep', 'opencode'];

      // Check if output file already exists (no prompt in defaults mode)
      if (existsSync(outputPath)) {
        console.error(`[config init] File already exists: ${outputPath}`);
        console.error('Remove the existing file or specify a different --output path.');
        defaultExitHandler(1);
        return;
      }
    }

    // Generate config
    const yaml = configWizard.generateConfigYaml({
      provider,
      platform,
      agents: agents as AgentId[],
      useDefaults: true,
    });

    // Write to file
    await writeFile(outputPath, yaml, 'utf-8');
    console.log(`\n✓ Configuration written to ${outputPath}`);

    // Run validation and show summary (US3 integration - T037-T040)
    console.log('\nValidating configuration...');
    try {
      const config = await loadConfig(process.cwd());
      const preflightResult = runPreflightChecks(
        config,
        undefined as never,
        process.env as Record<string, string | undefined>
      );
      const report = formatValidationReport(preflightResult);
      printValidationReport(report);

      // Show next steps
      console.log('\nNext steps:');
      if (provider === 'azure-openai') {
        console.log(
          '  1. Set AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT'
        );
        console.log('  2. Set MODEL=<your-deployment-name>');
        console.log("  3. Run 'ai-review review --repo .' to test");
      } else if (provider === 'openai') {
        console.log('  1. Set OPENAI_API_KEY environment variable');
        console.log("  2. Run 'ai-review review --repo .' to test");
      } else if (provider === 'anthropic') {
        console.log('  1. Set ANTHROPIC_API_KEY environment variable');
        console.log("  2. Run 'ai-review review --repo .' to test");
      } else if (provider === 'ollama') {
        console.log('  1. Ensure Ollama is running (or set OLLAMA_BASE_URL)');
        console.log("  2. Run 'ai-review review --repo .' to test");
      }

      // Exit based on validation result (T040)
      defaultExitHandler(report.valid ? 0 : 1);
    } catch {
      // Config validation failed but file was written
      console.log('\n⚠ Could not validate config (this is expected for new projects)');
      defaultExitHandler(0);
    }
  });

/**
 * Options for the review command
 */
export interface ReviewOptions {
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
export function detectPlatform(env: Record<string, string | undefined>): Platform {
  if (env['GITHUB_ACTIONS'] === 'true') return 'github';
  if (env['TF_BUILD'] === 'True' || env['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI']) return 'ado';
  return 'unknown';
}

/**
 * Dependencies that can be injected for testing
 */
export interface ReviewDependencies {
  /** Environment variables (defaults to process.env) */
  env?: Record<string, string | undefined>;
  /** Exit handler for error termination (defaults to process.exit) */
  exitHandler?: ExitHandler;
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
 *
 * @param options - Review options (repo, base, head, etc.)
 * @param deps - Injectable dependencies for testing
 */
export async function runReview(
  options: ReviewOptions,
  deps: ReviewDependencies = {}
): Promise<void> {
  const env = deps.env ?? (process.env as Record<string, string | undefined>);
  const exitHandler = deps.exitHandler ?? defaultExitHandler;
  console.log('[router] Starting AI Review');
  console.log(`[router] Repository: ${options.repo}`);
  console.log(`[router] Diff: ${options.base}...${options.head}`);

  // === PHASE 1: Setup & Context Building ===
  const routerEnv = buildRouterEnv(env);
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
    // T016 (FR-003): Use placeholder - preflight will resolve the actual model
    effectiveModel: '',
    provider: null, // Resolved per-agent in execute phase
  };

  // === PHASE 4: Preflight Validation ===
  const preflightResult = runPreflightChecks(config, agentContext, env);
  if (!preflightResult.valid) {
    console.error('[router] ❌ Preflight validation failed:');
    for (const error of preflightResult.errors) {
      console.error(`[router]   - ${error}`);
    }
    exitHandler(1);
    return; // For type safety when exitHandler doesn't terminate
  }

  // T015 (FR-002, FR-004): Update agentContext with resolved model from preflight
  // This is the single source of truth - no re-resolution after preflight
  if (preflightResult.resolved) {
    agentContext.effectiveModel = preflightResult.resolved.model;
  }

  // === PHASE 5: Execute Agent Passes ===
  const executeResult = await executeAllPasses(config, agentContext, routerEnv, budgetCheck, {
    pr: options.pr,
    head: reviewRefs.headSha,
    configHash,
  });

  // === PHASE 6: Process & Report Findings ===
  // (012-fix-agent-result-regressions) - Now passing completeFindings and partialFindings separately
  const { sorted, partialSorted } = processFindings(
    executeResult.completeFindings,
    executeResult.partialFindings,
    executeResult.allResults,
    executeResult.skippedAgents
  );

  await dispatchReport(
    platform,
    sorted,
    partialSorted,
    config,
    diff.files,
    routerEnv,
    prContext.number,
    {
      dryRun: options.dryRun,
      owner: options.owner,
      repoName: options.repoName,
      pr: options.pr,
      head: reviewRefs.headSha,
      githubHeadSha,
      checkRunId,
    }
  );

  // === PHASE 7: Gating ===
  // FR-008: checkGating receives only completeFindings (sorted) - partial findings don't affect gating
  checkGating(config, sorted);

  console.log('[router] Review complete');
}

// Only parse arguments when run directly (not when imported for testing)
// This allows tests to import runReview without triggering CLI parsing
// Use realpathSync to resolve npm bin shims (symlinks) to their real paths
function isMainModule(): boolean {
  if (!process.argv[1]) return false;

  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const argvPath = process.argv[1];

    // Try resolving symlinks for both paths
    const realScriptPath = realpathSync(scriptPath);
    const realArgvPath = realpathSync(argvPath);

    return realScriptPath === realArgvPath;
  } catch {
    // If realpathSync fails (e.g., path doesn't exist during testing),
    // fall back to direct comparison
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}

if (isMainModule()) {
  program.parse();
}
