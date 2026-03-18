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
import type { BenchmarkScenario } from './benchmark/scoring.js';
import { fileURLToPath } from 'url';
import { realpathSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

// Read version from package.json at startup (not hardcoded)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
const CLI_VERSION = packageJson.version;
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
import {
  loadProjectRules,
  loadPRDescription,
  truncateContext,
  loadGitHubEventPR,
  fetchGitHubPRDetails,
} from './context-loader.js';
import { startCheckRun, completeCheckRun, type GitHubContext } from './report/github.js';
import { buildRouterEnv } from './agents/security.js';
import { setupSignalHandlers } from './cli/signals.js';
import { hashConfig } from './cache/key.js';
import {
  runPreflightChecks,
  executeAllPasses,
  FatalExecutionError,
  processFindings,
  dispatchReport,
  getPostNormalizationFindings,
  checkGating,
  GatingError,
  type Platform,
} from './phases/index.js';
import type { AgentId } from './config/schemas.js';
import { loadBaseBranchSuppressions } from './report/user-suppressions.js';
import { exitCodeFromStatus } from './cli/execution-plan.js';
import { ConfigError } from './types/errors.js';

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

function exitSuccess(exitHandler: ExitHandler): void {
  exitHandler(0);
}

// =============================================================================
// CLI Program
// =============================================================================

function enableBlockingWrites(stream: NodeJS.WriteStream): void {
  if (stream.isTTY) return;
  const handle = (stream as unknown as { _handle?: { setBlocking?: (v: boolean) => void } })
    ._handle;
  if (handle?.setBlocking) {
    handle.setBlocking(true);
  }
}

enableBlockingWrites(process.stdout);
enableBlockingWrites(process.stderr);

const program = new Command();

program
  .name('ai-review')
  .description('AI Code Review Router')
  .version(CLI_VERSION)
  // Enable positional options mode to prevent global options from being parsed
  // before subcommand options. This fixes the conflict between:
  // - Root program's `--base <ref>` (for shorthand `ai-review .` usage)
  // - Review subcommand's `--base <sha>` (for CI usage)
  .enablePositionalOptions();

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

// Check command (Feature 001-local-deps-setup - Dependency validation)
program
  .command('check')
  .description('Check external dependency availability')
  .option('--verbose', 'Show additional details (minimum version, docs URL)')
  .option('--json', 'Output results in JSON format')
  .action(async (options) => {
    const { runCheck, formatCheckOutput, formatCheckOutputJson } =
      await import('./cli/commands/check.js');

    const result = runCheck({ verbose: options.verbose, json: options.json });

    if (options.json) {
      console.log(formatCheckOutputJson(result.results));
    } else {
      console.log(formatCheckOutput(result.results, { verbose: options.verbose ?? false }));
    }

    defaultExitHandler(result.exitCode);
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

    type WizardProvider = 'openai' | 'anthropic' | 'azure-openai' | 'ollama';
    type WizardPlatform = 'github' | 'ado' | 'both';
    const useDefaults = options.defaults || options.yes;
    let provider: WizardProvider;
    let platform: WizardPlatform;
    let agents: AgentId[];
    const outputPath = options.output;

    const defaultAgentsByProvider: Record<WizardProvider, AgentId[]> = {
      openai: ['semgrep', 'opencode'],
      anthropic: ['semgrep', 'opencode'],
      'azure-openai': ['semgrep', 'pr_agent'],
      ollama: ['semgrep', 'local_llm'],
    };

    const allowedAgentsByProvider: Record<WizardProvider, AgentId[]> = {
      openai: ['semgrep', 'reviewdog', 'opencode', 'pr_agent', 'ai_semantic_review', 'local_llm'],
      anthropic: [
        'semgrep',
        'reviewdog',
        'opencode',
        'pr_agent',
        'ai_semantic_review',
        'local_llm',
      ],
      'azure-openai': ['semgrep', 'reviewdog', 'pr_agent', 'ai_semantic_review', 'local_llm'],
      ollama: ['semgrep', 'reviewdog', 'local_llm'],
    };

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
        // T039 (FR-011): Pass 'both' directly to generate dual reporting blocks
        platform = platformResult.value;

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
        const defaultAgents = defaultAgentsByProvider[provider];
        const allowedAgents = allowedAgentsByProvider[provider];
        const agentOptions = configWizard.AVAILABLE_AGENTS.filter((agent) =>
          allowedAgents.includes(agent.id)
        );

        console.log('\nSelect agents to enable (press Enter to accept defaults):');
        const selectedAgents: AgentId[] = [];

        for (const agent of agentOptions) {
          const isRecommended = defaultAgents.includes(agent.id);
          const descriptor = agent.description ? ` (${agent.description})` : '';
          const label = `${agent.name}${descriptor}${isRecommended ? ' [recommended]' : ''}`;
          const include = await promptConfirm(rl, `Include ${label}`, !isRecommended);
          if (include) {
            selectedAgents.push(agent.id);
          }
        }

        if (selectedAgents.length === 0) {
          console.log(`\nNo agents selected. Using recommended: ${defaultAgents.join(', ')}`);
          agents = defaultAgents;
        } else {
          agents = selectedAgents;
        }

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

      // Validate platform option (including 'both' for dual reporting)
      const validPlatforms = ['github', 'ado', 'both'] as const;
      platform = (options.platform || 'github') as (typeof validPlatforms)[number];
      if (!validPlatforms.includes(platform)) {
        console.error(`[config init] Invalid platform: ${options.platform}`);
        console.error(`Valid platforms: ${validPlatforms.join(', ')}`);
        defaultExitHandler(1);
        return;
      }

      // Default agents based on provider
      agents = defaultAgentsByProvider[provider];

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
      agents,
      useDefaults: true,
    });

    // Write to file
    await writeFile(outputPath, yaml, 'utf-8');
    console.log(`\n✓ Configuration written to ${outputPath}`);

    // Run validation and show summary (US3 integration - T037-T040)
    console.log('\nValidating configuration...');
    try {
      // Parse the generated YAML and merge with defaults to match loadConfig behavior.
      // This ensures validation uses the same merged config that runtime will see.
      const { parse: parseYaml } = await import('yaml');
      const { ConfigSchema } = await import('./config/schemas.js');
      const { loadDefaults, deepMerge } = await import('./config.js');

      const generatedConfig = parseYaml(yaml) as Record<string, unknown>;
      const defaults = await loadDefaults();
      const mergedConfig = deepMerge(defaults, generatedConfig);
      const config = ConfigSchema.parse(mergedConfig);
      const env = process.env as Record<string, string | undefined>;

      // T030 (FR-009, FR-010): Build minimal AgentContext same pattern as validate command
      // This fixes the P2 bug where undefined was passed, causing validation to crash
      const minimalContext: AgentContext = {
        repoPath: process.cwd(),
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

      // T031: Use same pattern as validate command
      // Use outputPath (where config was written) for accurate reporting
      const preflightResult = runPreflightChecks(config, minimalContext, env, outputPath);
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

// =============================================================================
// Benchmark Command (Phase 410 - T027)
// =============================================================================

program
  .command('benchmark')
  .description('Run false-positive regression benchmark')
  .requiredOption('--fixtures <path>', 'Path to benchmark fixture JSON')
  .option('--output <path>', 'Write report JSON to file')
  .option('--verbose', 'Print per-scenario details')
  .action(async (options) => {
    try {
      const { readFileSync: readFile, writeFileSync: writeFile } = await import('fs');

      const scoring = await import('./benchmark/scoring.js');
      const adapter = await import('./benchmark/adapter.js');

      // Load fixtures
      const data = JSON.parse(readFile(options.fixtures as string, 'utf-8')) as {
        scenarios: BenchmarkScenario[];
      };
      const benchmarkScenarios = data.scenarios;

      if (benchmarkScenarios.length === 0) {
        throw new Error('Fixture file contains no scenarios');
      }

      console.log(`[benchmark] Running ${benchmarkScenarios.length} scenarios...`);

      // Run each scenario, skipping unsupported patterns
      const results = [];
      let skippedCount = 0;
      for (const scenario of benchmarkScenarios) {
        const unsupportedReason = adapter.getUnsupportedScenarioReason(scenario);
        if (unsupportedReason) {
          skippedCount++;
          if (options.verbose) {
            console.log(`  [SKIP] ${scenario.id}: ${unsupportedReason}`);
          }
          continue;
        }
        const findings = await adapter.runScenario(scenario);
        const result = scoring.scoreScenario(scenario, findings);
        results.push(result);
        if (options.verbose) {
          console.log(
            `  [${result.passed ? 'PASS' : 'FAIL'}] ${scenario.id}: ${scenario.description}`
          );
        }
      }

      if (results.length === 0 && skippedCount > 0) {
        throw new Error(
          'All benchmark scenarios were skipped as unsupported by the deterministic benchmark adapter'
        );
      }

      // Compute report
      const report = scoring.computeReport(results);

      // Output
      const reportJson = JSON.stringify(report, null, 2);
      if (options.output) {
        writeFile(options.output as string, reportJson);
        console.log(`[benchmark] Report written to ${options.output}`);
      } else {
        console.log(reportJson);
      }

      // Summary
      const suppression = (report.pool1.suppressionRate * 100).toFixed(1);
      const recall = (report.pool2.recall * 100).toFixed(1);
      const precision = (report.pool2.precision * 100).toFixed(1);
      if (skippedCount > 0) {
        console.log(
          `\n[benchmark] ${results.length} scored, ${skippedCount} skipped (unsupported patterns)`
        );
      }
      console.log(`\n[benchmark] Pool 1 (FP): suppression=${suppression}%`);
      console.log(`[benchmark] Pool 2 (TP): recall=${recall}%, precision=${precision}%`);
      // SC-007: Pattern E self-contradiction filter rate
      const patternEScenarios = report.scenarios.filter((s) => s.pattern === 'E');
      const patternEPassed = patternEScenarios.filter((s) => s.passed).length;
      const patternERate =
        patternEScenarios.length > 0 ? patternEPassed / patternEScenarios.length : 1;
      console.log(
        `[benchmark] SC-007: Pattern E self-contradiction=${(patternERate * 100).toFixed(1)}%`
      );

      // Exit code — all release gate metrics must pass (SC-001 through SC-004, SC-007)
      const suppressionGate = report.pool1.suppressionRate >= 0.85; // SC-001
      const recallGate = report.pool2.recall === 1.0; // SC-002
      const precisionGate = report.pool2.precision >= 0.7; // SC-003
      const fprGate = report.pool1.fpRate <= 0.25; // SC-004
      const selfContradictionGate = patternERate >= 0.8; // SC-007
      if (!suppressionGate) console.log('[benchmark] FAIL: SC-001 suppression rate < 85%');
      if (!recallGate) console.log('[benchmark] FAIL: SC-002 TP recall < 100%');
      if (!precisionGate) console.log('[benchmark] FAIL: SC-003 TP precision < 70%');
      if (!fprGate) console.log('[benchmark] FAIL: SC-004 FP rate > 25%');
      if (!selfContradictionGate)
        console.log(
          `[benchmark] FAIL: SC-007 Pattern E self-contradiction filter ${(patternERate * 100).toFixed(1)}% < 80%`
        );
      const gatesPassed =
        suppressionGate && recallGate && precisionGate && fprGate && selfContradictionGate;
      defaultExitHandler(gatesPassed ? 0 : 1);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[benchmark] Fatal error: ${msg}`);
      defaultExitHandler(2);
    }
  });

// =============================================================================
// Local Review Command (Phase 407 - T097-T113)
// =============================================================================

program
  .command('local')
  .alias('local-review') // T015 (US1): Add alias for command discoverability
  .description('Run AI review on local changes (uncommitted/staged)')
  .argument('[path]', 'Path to repository (default: current directory)', '.')
  .option('--base <ref>', 'Base reference for comparison (auto-detected if not specified)')
  .option('--head <ref>', 'Head reference (default: HEAD)')
  .option(
    '--range <range>',
    'Git range (e.g., main...HEAD, HEAD~3..)\n' +
      '                              Operators: ... (default) = merge-base, .. = direct comparison'
  )
  .option('--staged', 'Review only staged changes')
  .option('--uncommitted', 'Include uncommitted changes (default when no --base/--range)')
  .option('--pass <name>', 'Run specific pass only')
  .option('--agent <id>', 'Run specific agent only')
  .option('--format <fmt>', 'Output format: pretty, json, sarif (default: pretty)', 'pretty')
  .option('--no-color', 'Disable colored output')
  .option('--quiet', 'Minimal output (errors only)')
  .option('--verbose', 'Show debug information')
  .option('--dry-run', 'Show what would be reviewed without running agents')
  .option('--cost-only', 'Estimate cost without running agents')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (path: string, options) => {
    // Dynamically import to avoid circular dependencies
    const { runLocalReview, createDefaultDependencies } =
      await import('./cli/commands/local-review.js');

    const deps = createDefaultDependencies();

    // Build raw options object matching RawLocalReviewOptions
    const rawOptions = {
      path,
      base: options.base,
      head: options.head,
      range: options.range,
      staged: options.staged,
      uncommitted: options.uncommitted,
      pass: options.pass,
      agent: options.agent,
      format: options.format,
      noColor: options.noColor,
      color: options.color, // Commander sets color=false for --no-color
      quiet: options.quiet,
      verbose: options.verbose,
      dryRun: options.dryRun,
      costOnly: options.costOnly,
      config: options.config,
    };

    try {
      const result = await runLocalReview(rawOptions, deps);
      deps.exitHandler(result.exitCode);
    } catch (error) {
      console.error('[local] Fatal error:', error);
      deps.exitHandler(1);
    }
  });

// Alias: `ai-review .` as shorthand for `ai-review local .`
// This provides the zero-friction experience: npx @oddessentials/odd-ai-reviewers .
program
  .argument('[path]', 'Path to repository for local review')
  .option('--base <ref>', 'Base reference for comparison')
  .option('--head <ref>', 'Head reference (default: HEAD)')
  .option(
    '--range <range>',
    'Git range (e.g., main...HEAD, HEAD~3..)\n' +
      '                              Operators: ... (default) = merge-base, .. = direct comparison'
  )
  .option('--staged', 'Review only staged changes')
  .option('--uncommitted', 'Include uncommitted changes (default when no --base/--range)')
  .option('--pass <name>', 'Run specific pass only')
  .option('--agent <id>', 'Run specific agent only')
  .option('--format <fmt>', 'Output format: pretty, json, sarif')
  .option('--no-color', 'Disable colored output')
  .option('--quiet', 'Minimal output (errors only)')
  .option('--verbose', 'Show debug information')
  .option('--dry-run', 'Show what would be reviewed without running agents')
  .option('--cost-only', 'Estimate cost without running agents')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (path: string | undefined, options) => {
    // Skip if no path provided and no relevant options - let Commander show help
    // This handles the case where user runs `ai-review` with no arguments
    if (!path && !options.base && !options.staged && !options.range) {
      program.outputHelp();
      return;
    }

    const { runLocalReview, createDefaultDependencies } =
      await import('./cli/commands/local-review.js');

    const deps = createDefaultDependencies();

    const rawOptions = {
      path: path ?? '.',
      base: options.base,
      head: options.head,
      range: options.range,
      staged: options.staged,
      uncommitted: options.uncommitted,
      pass: options.pass,
      agent: options.agent,
      format: options.format,
      noColor: options.noColor,
      color: options.color,
      quiet: options.quiet,
      verbose: options.verbose,
      dryRun: options.dryRun,
      costOnly: options.costOnly,
      config: options.config,
    };

    try {
      const result = await runLocalReview(rawOptions, deps);
      deps.exitHandler(result.exitCode);
    } catch (error) {
      console.error('[local] Fatal error:', error);
      deps.exitHandler(1);
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

  let checkRunId: number | undefined;
  let checkRunContext: GitHubContext | undefined;
  let checkRunFinalized = false;

  const finalizeCheckRun = async (
    conclusion: 'success' | 'failure' | 'neutral',
    title: string,
    summary: string
  ): Promise<void> => {
    if (!checkRunId || !checkRunContext || checkRunFinalized) return;
    await completeCheckRun({ ...checkRunContext, checkRunId }, { conclusion, title, summary });
    checkRunFinalized = true;
  };

  const shouldHandleSignals = platform === 'github' && deps.exitHandler === undefined;
  if (shouldHandleSignals) {
    setupSignalHandlers({
      cleanup: async () => {
        await finalizeCheckRun(
          'neutral',
          'AI Review interrupted',
          'The AI review was interrupted before completion.'
        );
      },
      showPartialResultsMessage: false,
      logger: {
        log: (message) => console.log(`[router] ${message}`),
        warn: (message) => console.warn(`[router] ${message}`),
      },
    });
  }

  // Build PR context based on platform
  let prContext: PullRequestContext;
  if (platform === 'ado') {
    const adoContext = buildADOPRContext(routerEnv);
    if (!adoContext) {
      console.log('[router] Not running in ADO PR context - skipping review');
      exitSuccess(exitHandler);
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

  // FR-006: Enrich PR context with title/body from GitHub event payload
  if (platform === 'github') {
    const eventPR = await loadGitHubEventPR(routerEnv['GITHUB_EVENT_PATH']);
    if (eventPR.title) prContext.title = eventPR.title;
    if (eventPR.body) prContext.body = eventPR.body;

    // Fallback: fetch from GitHub API when event payload didn't yield title/body
    // (e.g., workflow_dispatch or external CI without a pull_request event payload)
    if (
      !prContext.title &&
      !prContext.body &&
      options.pr &&
      options.owner &&
      options.repoName &&
      routerEnv['GITHUB_TOKEN']
    ) {
      console.log('[router] No PR description in event payload, fetching from GitHub API...');
      const apiPR = await fetchGitHubPRDetails(
        options.owner,
        options.repoName,
        options.pr,
        routerEnv['GITHUB_TOKEN']
      );
      if (apiPR.title) prContext.title = apiPR.title;
      if (apiPR.body) prContext.body = apiPR.body;
    }
  }

  // === PHASE 2: Trust & Diff ===
  const trustResult = checkTrust(prContext, config);
  if (!trustResult.trusted) {
    console.log(`[router] Skipping review: ${trustResult.reason}`);
    exitSuccess(exitHandler);
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
    exitSuccess(exitHandler);
    return;
  }

  // Start GitHub check run (in_progress state)
  const reportingMode = config.reporting.github?.mode ?? 'checks_and_comments';
  const shouldUseChecks =
    reportingMode === 'checks_only' || reportingMode === 'checks_and_comments';

  if (
    platform === 'github' &&
    shouldUseChecks &&
    !options.dryRun &&
    options.owner &&
    options.repoName &&
    routerEnv['GITHUB_TOKEN']
  ) {
    try {
      checkRunContext = {
        owner: options.owner,
        repo: options.repoName,
        headSha: githubHeadSha,
        token: routerEnv['GITHUB_TOKEN'],
      };
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

  // FR-006/FR-007: Load context enrichment fields
  const projectRules = await loadProjectRules(options.repo);
  const prDescription = await loadPRDescription(prContext?.title, prContext?.body);
  const truncatedCtx = truncateContext(
    projectRules,
    prDescription,
    diffContent,
    config.limits.max_tokens_per_pr
  );

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
    prDescription: truncatedCtx.prDescription,
    projectRules: truncatedCtx.projectRules,
    reviewIgnorePatterns: reviewIgnorePatterns.map((p) => p.pattern),
  };

  // === PHASE 4: Preflight Validation ===
  const preflightResult = runPreflightChecks(config, agentContext, env);
  if (!preflightResult.valid) {
    console.error('[router] ❌ Preflight validation failed:');
    for (const error of preflightResult.errors) {
      console.error(`[router]   - ${error}`);
    }
    const summary =
      'Preflight checks failed. Review did not run.\n' +
      preflightResult.errors.map((error) => `- ${error}`).join('\n');
    await finalizeCheckRun('failure', 'AI Review preflight failed', summary);
    exitHandler(exitCodeFromStatus('config_error'));
    return; // For type safety when exitHandler doesn't terminate
  }

  // Log preflight warnings (non-fatal diagnostics, e.g. optional agents missing keys)
  if (preflightResult.warnings.length > 0) {
    console.error('[router] Preflight warnings:');
    for (const warning of preflightResult.warnings) {
      console.error(`[router]   - ${warning}`);
    }
  }

  // T015 (FR-002, FR-004): Update agentContext with resolved model from preflight
  // This is the single source of truth - no re-resolution after preflight
  if (preflightResult.resolved) {
    agentContext.effectiveModel = preflightResult.resolved.model;
  }

  // FR-022: Load suppressions from base branch in CI mode (security constraint).
  // In CI, suppression rules ALWAYS come from the BASE branch config, never from the PR branch.
  // This prevents attackers from smuggling suppressions into fork PRs to hide vulnerabilities.
  // Any suppressions in the PR branch config are unconditionally replaced.
  const isCIMode = platform === 'github' || platform === 'ado';
  let ciConfig = config;
  if (isCIMode) {
    const baseBranchSuppressions = loadBaseBranchSuppressions(options.repo, reviewRefs.baseSha);
    // Always override PR-branch suppressions with base-branch suppressions.
    // If base branch has no suppressions, this clears any PR-branch suppressions too —
    // that's intentional: untrusted PR branches must not control suppression rules.
    ciConfig = { ...config, suppressions: baseBranchSuppressions };
  }

  try {
    // === PHASE 5: Execute Agent Passes ===
    const executeResult = await executeAllPasses(config, agentContext, routerEnv, budgetCheck, {
      pr: options.pr,
      head: reviewRefs.headSha,
      configHash,
    });

    // === PHASE 6: Process & Report Findings ===
    // (012-fix-agent-result-regressions) - Now passing completeFindings and partialFindings separately
    // FR-022: Pass config with suppressions and CI mode for breadth enforcement
    const { sorted, partialSorted } = processFindings(
      executeResult.completeFindings,
      executeResult.partialFindings,
      executeResult.allResults,
      executeResult.skippedAgents,
      diff.files,
      agentContext.prDescription,
      ciConfig,
      isCIMode ? 'ci' : 'local'
    );

    const reportResult = await dispatchReport(
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
        runStatus: 'complete',
      }
    );
    if (platform === 'github' && reportResult?.checkRunCompleted) {
      checkRunFinalized = true;
    }

    // === PHASE 7: Gating ===
    // FR-008: checkGating receives only completeFindings - partial findings don't affect gating
    // Use post-normalization findings from reporter when available (after Stage 2 validation),
    // otherwise run the same Stage 2 locally for dry runs or unknown platforms.
    const gatingFindings =
      reportResult?.postNormalizationFindings ?? getPostNormalizationFindings(sorted, diff.files);
    checkGating(config, gatingFindings);

    console.log('[router] Review complete');
    exitSuccess(exitHandler);
  } catch (error) {
    if (error instanceof GatingError) {
      exitHandler(exitCodeFromStatus('gating_failed'));
      return;
    }

    // FR-022: Suppression breadth/allowlist violations throw ConfigError from processFindings().
    // These are config-level errors, not execution failures — exit with config_error (2).
    if (error instanceof ConfigError) {
      const configErrorMsg = error.message;
      console.error(`[router] ❌ Configuration error: ${configErrorMsg}`);
      const summary = `Configuration error during review.\n\nError: ${configErrorMsg}`;
      await finalizeCheckRun('failure', 'AI Review config error', summary);
      exitHandler(exitCodeFromStatus('config_error'));
      return;
    }

    const errorMsg = error instanceof Error ? error.message : String(error);

    // FR-021: When a FatalExecutionError carries partial results, report them
    // in degraded mode with a 'neutral' check run conclusion instead of 'failure'.
    if (
      error instanceof FatalExecutionError &&
      error.partialResults &&
      (error.partialResults.completeFindings.length > 0 ||
        error.partialResults.partialFindings.length > 0)
    ) {
      console.warn(
        `[router] ⚠ Incomplete review: ${errorMsg}. ` +
          `Reporting ${error.partialResults.completeFindings.length} findings from completed agents.`
      );

      // Process and report partial findings through the standard pipeline
      const { sorted, partialSorted } = processFindings(
        error.partialResults.completeFindings,
        error.partialResults.partialFindings,
        error.partialResults.allResults,
        error.partialResults.skippedAgents,
        diff.files,
        agentContext.prDescription,
        ciConfig,
        isCIMode ? 'ci' : 'local'
      );

      // FR-021: Pass runStatus: 'incomplete' so reporters use neutral/pending conclusion.
      // The reporter handles the conclusion directly — no separate finalizeCheckRun override needed.
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
          runStatus: 'incomplete',
        }
      );

      // FR-021: Exit code 3 for incomplete reviews — gating is NOT evaluated
      exitHandler(exitCodeFromStatus('incomplete'));
      return;
    }

    console.error(`[router] ❌ Review failed: ${errorMsg}`);
    const summary = 'The AI review failed before reporting results.\n' + `Error: ${errorMsg}`;
    await finalizeCheckRun('failure', 'AI Review failed', summary);
    exitHandler(exitCodeFromStatus('incomplete'));
  }
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
