/**
 * Local Review Command Module
 *
 * Orchestrates the local review flow:
 * 1. Infer git context from path argument
 * 2. Load configuration (with zero-config fallback)
 * 3. Generate diff for local changes
 * 4. Execute agent passes
 * 5. Report findings to terminal
 *
 * This module is designed for dependency injection to enable testing.
 *
 * @module cli/commands/local-review
 */

import type { Config } from '../../config.js';
import type { AgentContext, Finding } from '../../agents/types.js';
import type { DiffSummary, PathFilter } from '../../diff.js';
import type { LocalReviewOptions } from '../options/local-review-options.js';
import type { GitContext, GitContextError } from '../git-context.js';
import type { TerminalContext } from '../../report/terminal.js';
import type { ExecuteResult } from '../../phases/execute.js';
import type { Result } from '../../types/result.js';
import type { GenerateZeroConfigResult, ZeroConfigResult } from '../../config/zero-config.js';
import type { ValidatedConfig } from '../../types/branded.js';
import type { DependencyCheckSummary, SkippedPassInfo } from '../dependencies/types.js';

import { isOk } from '../../types/result.js';
import { inferGitContext, GitContextErrorCode } from '../git-context.js';
import {
  parseLocalReviewOptions,
  applyOptionDefaults,
  resolveDiffRange,
} from '../options/index.js';
import {
  loadConfig,
  loadConfigFromPath,
  generateZeroConfigDefaults,
  isZeroConfigSuccess,
} from '../../config.js';
import { getLocalDiff, canonicalizeDiffFiles, buildCombinedDiff } from '../../diff.js';
import { loadReviewIgnore } from '../../reviewignore.js';
import { checkBudget, estimateTokens, type BudgetContext } from '../../budget.js';
import { buildRouterEnv } from '../../agents/security.js';
import { hashConfig } from '../../cache/key.js';
import { executeAllPasses } from '../../phases/execute.js';
import { supportsColor, supportsUnicode, createColorizer } from '../output/colors.js';
import {
  formatCLIError,
  NotAGitRepoError,
  NoCredentialsError,
  InvalidConfigError,
  GitNotFoundError,
  InvalidPathError,
} from '../output/errors.js';
import { reportToTerminal } from '../../report/terminal.js';
import {
  setupSignalHandlers,
  setPartialResultsContext,
  clearPartialResultsContext,
  getPartialResultsContext,
  formatPartialResultsMessage,
} from '../signals.js';
import { countBySeverity } from '../../report/formats.js';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import {
  checkDependenciesForPasses,
  displayDependencyErrors,
  displaySkippedPassWarnings,
  getDependenciesForAgent,
} from '../dependencies/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Dependencies for local review command
 * All external dependencies are injected for testability
 */
export interface LocalReviewDependencies {
  /** Environment variables */
  env: Record<string, string | undefined>;
  /** Exit handler (allows testing without process.exit) */
  exitHandler: (code: number) => void;
  /** Standard output writer */
  stdout: {
    write: (text: string) => void;
    isTTY?: boolean;
  };
  /** Standard error writer */
  stderr: {
    write: (text: string) => void;
  };
  /** Override for git context inference (for testing) */
  inferGitContext?: (cwd: string) => Result<GitContext, GitContextError>;
  /** Override for config loading (for testing) */
  loadConfig?: (repoRoot: string) => Promise<ValidatedConfig<Config>>;
  /** Override for config loading from explicit path (for testing) */
  loadConfigFromPath?: (configPath: string) => Promise<ValidatedConfig<Config>>;
  /** Override for zero-config generation (for testing) */
  generateZeroConfig?: (env: Record<string, string | undefined>) => GenerateZeroConfigResult;
  /** Override for diff generation (for testing) */
  getLocalDiff?: (
    repoPath: string,
    options: {
      baseRef: string;
      headRef?: string;
      rangeOperator?: '..' | '...';
      stagedOnly?: boolean;
      uncommitted?: boolean;
      pathFilter?: PathFilter;
    }
  ) => DiffSummary;
  /** Override for agent execution (for testing) */
  executeAllPasses?: typeof executeAllPasses;
  /** Override for terminal reporting (for testing) */
  reportToTerminal?: typeof reportToTerminal;
}

/**
 * Result from local review execution
 */
export interface LocalReviewResult {
  /** Exit code (0=success, 1=failures or execution errors, 2=invalid args/config) */
  exitCode: number;
  /** Number of findings reported */
  findingsCount: number;
  /** Number of partial findings (from interrupted agents) */
  partialFindingsCount: number;
  /** Error message if execution failed */
  error?: string;
  /** Whether execution was interrupted */
  interrupted?: boolean;
}

/**
 * Dry run result
 */
export interface DryRunResult {
  /** Git context information */
  gitContext: GitContext;
  /** Resolved base reference used for diff */
  baseRef: string;
  /** Config source (file or zero-config) */
  configSource: 'file' | 'zero-config';
  /** Config file path if from file */
  configPath?: string;
  /** Number of files that would be analyzed */
  fileCount: number;
  /** Total lines changed */
  linesChanged: number;
  /** List of files that would be analyzed */
  files: string[];
  /** Agents that would run */
  agents: string[];
}

/**
 * Cost estimate result
 */
export interface CostEstimateResult {
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Estimated input tokens */
  estimatedInputTokens: number;
  /** Number of files */
  fileCount: number;
  /** Total lines changed */
  linesChanged: number;
  /** Whether budget allows execution */
  budgetAllowed: boolean;
}

// =============================================================================
// Default Dependencies
// =============================================================================

/**
 * Create default dependencies using real implementations
 */
export function createDefaultDependencies(): LocalReviewDependencies {
  return {
    env: process.env as Record<string, string | undefined>,
    exitHandler: (code: number) => process.exit(code),
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

// =============================================================================
// Exit Codes
// =============================================================================

/**
 * Exit codes per contracts/cli-interface.md
 */
export const ExitCode = {
  /** Success (no findings, or findings below gating threshold) */
  SUCCESS: 0,
  /** Failure (findings exceed gating threshold, or execution error) */
  FAILURE: 1,
  /** Invalid arguments or configuration */
  INVALID_ARGS: 2,
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Determine exit code based on findings and gating configuration
 */
function determineExitCode(findings: Finding[], config: Config): number {
  if (!config.gating?.enabled) {
    return ExitCode.SUCCESS;
  }

  const counts = countBySeverity(findings);
  const threshold = config.gating.fail_on_severity ?? 'error';

  if (threshold === 'warning') {
    // Fail on warnings or errors
    if (counts.error > 0 || counts.warning > 0) {
      return ExitCode.FAILURE;
    }
  } else {
    // Default: fail on errors only
    if (counts.error > 0) {
      return ExitCode.FAILURE;
    }
  }

  return ExitCode.SUCCESS;
}

/**
 * Get package version from package.json
 */
function getPackageVersion(): string {
  try {
    // Dynamic import would be needed for proper ESM handling
    // For now, return a placeholder that will be set at build time
    return process.env['npm_package_version'] ?? '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/**
 * Build terminal context from options and git context
 */
function buildTerminalContext(
  options: LocalReviewOptions,
  gitContext: GitContext,
  configSource: 'file' | 'zero-config',
  configPath?: string,
  version?: string
): TerminalContext {
  return {
    colored: !options.noColor && supportsColor(),
    useUnicode: supportsUnicode(),
    verbose: options.verbose,
    quiet: options.quiet,
    format: options.format,
    showProgress: !options.quiet,
    showCost: true,
    version,
    configSource: {
      source: configSource,
      path: configPath,
    },
    baseRef: options.base ?? gitContext.defaultBase,
    baseSource: options.base ? 'specified' : 'auto-detected',
  };
}

/**
 * Build agent context for execution
 */
function buildAgentContext(
  repoPath: string,
  diff: DiffSummary,
  config: Config,
  env: Record<string, string | undefined>,
  prNumber?: number
): AgentContext {
  const canonicalFiles = canonicalizeDiffFiles(diff.files);
  const diffContent = buildCombinedDiff(diff.files, config.limits?.max_diff_lines ?? 5000);

  return {
    repoPath,
    diff,
    files: canonicalFiles,
    config,
    diffContent,
    prNumber,
    env,
    effectiveModel: config.models?.default ?? '',
    provider: config.provider ?? null,
  };
}

/**
 * Build info about skipped passes for warning display.
 * Determines which dependency caused each pass to be skipped.
 */
function buildSkippedPassInfo(
  passes: Config['passes'],
  depSummary: DependencyCheckSummary
): SkippedPassInfo[] {
  const skippedInfo: SkippedPassInfo[] = [];

  // Build set of unavailable deps with their reason
  const unavailableDeps = new Map<string, 'missing' | 'unhealthy'>();
  for (const result of depSummary.results) {
    if (result.status === 'missing') {
      unavailableDeps.set(result.name, 'missing');
    } else if (result.status === 'unhealthy') {
      unavailableDeps.set(result.name, 'unhealthy');
    }
  }

  for (const pass of passes) {
    if (!pass.enabled || pass.required) continue;

    // Check if this pass has unavailable deps
    for (const agent of pass.agents) {
      const agentDeps = getDependenciesForAgent(agent);
      for (const dep of agentDeps) {
        const reason = unavailableDeps.get(dep);
        if (reason) {
          skippedInfo.push({
            name: pass.name,
            missingDep: dep,
            reason,
          });
          break; // Only report first unavailable dep per pass
        }
      }
    }
  }

  return skippedInfo;
}

/**
 * Filter config to only include passes whose dependencies are available.
 */
function filterToRunnablePasses(config: Config, runnablePassNames: string[]): Config {
  const runnableSet = new Set(runnablePassNames);
  return {
    ...config,
    passes: config.passes.filter(
      (pass) => !pass.enabled || pass.required || runnableSet.has(pass.name)
    ),
  };
}

/**
 * Load config with zero-config fallback
 */
async function loadConfigWithFallback(
  repoRoot: string,
  env: Record<string, string | undefined>,
  deps: LocalReviewDependencies,
  customConfigPath?: string
): Promise<{
  config: Config;
  source: 'file' | 'zero-config';
  path?: string;
  zeroConfigResult?: ZeroConfigResult;
}> {
  const configPath = customConfigPath
    ? resolve(customConfigPath)
    : join(repoRoot, '.ai-review.yml');

  // Check if config file exists
  const configExists = existsSync(configPath);

  if (configExists) {
    // Load from file
    if (customConfigPath) {
      const loadConfigFromPathFn = deps.loadConfigFromPath ?? loadConfigFromPath;
      const config = await loadConfigFromPathFn(configPath);
      return { config, source: 'file', path: configPath };
    }

    const loadConfigFn = deps.loadConfig ?? loadConfig;
    const config = await loadConfigFn(repoRoot);
    return { config, source: 'file', path: configPath };
  }

  // Use zero-config defaults
  const generateFn = deps.generateZeroConfig ?? generateZeroConfigDefaults;
  const result = generateFn(env);

  if (!isZeroConfigSuccess(result)) {
    throw new NoCredentialsError();
  }

  return { config: result.config, source: 'zero-config', zeroConfigResult: result };
}

// =============================================================================
// Dry Run Mode
// =============================================================================

/**
 * Execute dry run mode - show what would be reviewed without running agents
 */
async function executeDryRun(
  options: LocalReviewOptions,
  gitContext: GitContext,
  config: Config,
  configSource: 'file' | 'zero-config',
  configPath: string | undefined,
  deps: LocalReviewDependencies
): Promise<DryRunResult> {
  const diffRange = resolveDiffRange(options, gitContext);
  const baseRef = diffRange.baseRef;

  // Load .reviewignore patterns
  const reviewIgnoreResult = await loadReviewIgnore(gitContext.repoRoot);

  // Generate diff to see what files would be analyzed
  const getDiffFn = deps.getLocalDiff ?? getLocalDiff;
  const diff = getDiffFn(gitContext.repoRoot, {
    baseRef,
    headRef: diffRange.headRef,
    rangeOperator: diffRange.rangeOperator,
    stagedOnly: options.staged,
    uncommitted: options.uncommitted,
    pathFilter:
      reviewIgnoreResult.patterns.length > 0
        ? { reviewIgnorePatterns: reviewIgnoreResult.patterns }
        : undefined,
  });

  // Get list of agents that would run
  const agents: string[] = [];
  for (const pass of config.passes) {
    if (pass.enabled) {
      agents.push(...pass.agents);
    }
  }

  return {
    gitContext,
    baseRef,
    configSource,
    configPath,
    fileCount: diff.files.length,
    linesChanged: diff.totalAdditions + diff.totalDeletions,
    files: diff.files.map((f) => f.path),
    agents: [...new Set(agents)], // Dedupe
  };
}

/**
 * Format dry run output in pretty (human-readable) format
 */
function formatDryRunOutputPretty(result: DryRunResult, colored: boolean): string {
  const c = createColorizer(colored);
  const lines: string[] = [];

  lines.push('');
  lines.push(c.bold('🔍 DRY RUN - No agents will be executed'));
  lines.push('');
  lines.push(c.gray('─'.repeat(50)));
  lines.push('');

  // Git context
  lines.push(c.bold('Git Context:'));
  lines.push(`  Repository: ${result.gitContext.repoRoot}`);
  lines.push(`  Branch: ${result.gitContext.currentBranch}`);
  lines.push(`  Base: ${result.baseRef}`);
  lines.push('');

  // Config
  lines.push(c.bold('Configuration:'));
  if (result.configSource === 'zero-config') {
    lines.push(`  Source: ${c.yellow('zero-config defaults')}`);
  } else {
    lines.push(`  Source: ${result.configPath}`);
  }
  lines.push('');

  // Files
  lines.push(c.bold('Files to analyze:'));
  lines.push(`  Count: ${result.fileCount}`);
  lines.push(`  Lines changed: ${result.linesChanged}`);
  lines.push('');

  if (result.files.length > 0) {
    const maxFiles = 10;
    for (let i = 0; i < Math.min(result.files.length, maxFiles); i++) {
      lines.push(`  ${c.cyan(result.files[i] ?? '')}`);
    }
    if (result.files.length > maxFiles) {
      lines.push(`  ${c.gray(`... and ${result.files.length - maxFiles} more`)}`);
    }
  } else {
    lines.push(`  ${c.yellow('No files to analyze')}`);
  }
  lines.push('');

  // Agents
  lines.push(c.bold('Agents to run:'));
  for (const agent of result.agents) {
    lines.push(`  ${c.green('•')} ${agent}`);
  }
  lines.push('');

  return lines.join('\n');
}

/**
 * Format dry run output in JSON format (FR-SCH-001 compliant)
 */
function formatDryRunOutputJson(result: DryRunResult): string {
  const output = {
    schema_version: '1.0.0',
    version: getPackageVersion(),
    timestamp: new Date().toISOString(),
    mode: 'dry-run',
    summary: {
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      filesAnalyzed: result.fileCount,
      linesChanged: result.linesChanged,
      executionTimeMs: 0,
      estimatedCostUsd: 0,
    },
    findings: [],
    partialFindings: [],
    passes: [],
    config: {
      source: result.configSource,
      path: result.configPath,
    },
    gitContext: {
      repository: result.gitContext.repoRoot,
      branch: result.gitContext.currentBranch,
      base: result.baseRef,
    },
    files: result.files,
    agents: result.agents,
  };
  return JSON.stringify(output);
}

/**
 * Format dry run output in SARIF format (FR-SCH-002 compliant)
 */
function formatDryRunOutputSarif(result: DryRunResult): string {
  const output = {
    $schema:
      'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
    version: '2.1.0' as const,
    runs: [
      {
        tool: {
          driver: {
            name: 'odd-ai-reviewers',
            version: getPackageVersion(),
            informationUri: 'https://github.com/oddessentials/odd-ai-reviewers',
            rules: [],
          },
        },
        results: [],
        invocations: [
          {
            executionSuccessful: true,
            properties: {
              mode: 'dry-run',
              filesAnalyzed: result.fileCount,
              linesChanged: result.linesChanged,
            },
          },
        ],
      },
    ],
  };
  return JSON.stringify(output);
}

/**
 * Format dry run output based on format option
 */
function formatDryRunOutput(
  result: DryRunResult,
  colored: boolean,
  format: 'pretty' | 'json' | 'sarif'
): string {
  switch (format) {
    case 'json':
      return formatDryRunOutputJson(result);
    case 'sarif':
      return formatDryRunOutputSarif(result);
    case 'pretty':
    default:
      return formatDryRunOutputPretty(result, colored);
  }
}

// =============================================================================
// Cost Only Mode
// =============================================================================

/**
 * Execute cost-only mode - estimate cost without running agents
 */
async function executeCostOnly(
  options: LocalReviewOptions,
  gitContext: GitContext,
  config: Config,
  deps: LocalReviewDependencies
): Promise<CostEstimateResult> {
  const diffRange = resolveDiffRange(options, gitContext);
  const baseRef = diffRange.baseRef;

  // Load .reviewignore patterns
  const reviewIgnoreResult = await loadReviewIgnore(gitContext.repoRoot);

  // Generate diff to estimate cost
  const getDiffFn = deps.getLocalDiff ?? getLocalDiff;
  const diff = getDiffFn(gitContext.repoRoot, {
    baseRef,
    headRef: diffRange.headRef,
    rangeOperator: diffRange.rangeOperator,
    stagedOnly: options.staged,
    uncommitted: options.uncommitted,
    pathFilter:
      reviewIgnoreResult.patterns.length > 0
        ? { reviewIgnorePatterns: reviewIgnoreResult.patterns }
        : undefined,
  });

  const diffContent = buildCombinedDiff(diff.files, config.limits?.max_diff_lines ?? 5000);
  const estimatedTokens = estimateTokens(diffContent);

  // Rough cost estimate: $0.003 per 1K input tokens (varies by provider/model)
  // This is a conservative upper-bound estimate
  const costPer1kTokens = 0.003;
  const estimatedCost = (estimatedTokens / 1000) * costPer1kTokens;

  // Check budget
  const budgetContext: BudgetContext = {
    fileCount: diff.files.length,
    diffLines: diff.totalAdditions + diff.totalDeletions,
    estimatedTokens: estimatedTokens,
  };
  const limits = config.limits ?? {
    max_files: 50,
    max_diff_lines: 2000,
    max_tokens_per_pr: 50000,
    max_usd_per_pr: 0.1,
    monthly_budget_usd: 10,
  };
  const budgetCheck = checkBudget(budgetContext, limits);

  return {
    estimatedCostUsd: Math.max(0, estimatedCost), // Clamp to non-negative (FR-REL-002)
    estimatedInputTokens: estimatedTokens,
    fileCount: diff.files.length,
    linesChanged: diff.totalAdditions + diff.totalDeletions,
    budgetAllowed: budgetCheck.allowed,
  };
}

/**
 * Format cost estimate output
 */
function formatCostOutput(result: CostEstimateResult, colored: boolean): string {
  const c = createColorizer(colored);
  const lines: string[] = [];

  lines.push('');
  lines.push(c.bold('💰 COST ESTIMATE'));
  lines.push('');
  lines.push(c.gray('─'.repeat(50)));
  lines.push('');

  lines.push(`Files to analyze: ${result.fileCount}`);
  lines.push(`Lines changed: ${result.linesChanged}`);
  lines.push(`Estimated input tokens: ${result.estimatedInputTokens.toLocaleString()}`);
  lines.push('');
  lines.push(
    `${c.bold('Estimated cost:')} ${c.green(`$${result.estimatedCostUsd.toFixed(4)}`)} (upper bound)`
  );
  lines.push('');

  if (result.budgetAllowed) {
    lines.push(`Budget status: ${c.green('✓ Within budget')}`);
  } else {
    lines.push(`Budget status: ${c.red('✗ Exceeds budget limit')}`);
  }
  lines.push('');

  lines.push(c.gray('Note: Actual cost may be lower depending on model responses.'));
  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Main Execution
// =============================================================================

/**
 * Run local review command
 *
 * This is the main orchestration function that:
 * 1. Parses and validates options
 * 2. Infers git context
 * 3. Loads configuration (with zero-config fallback)
 * 4. Generates diff
 * 5. Executes agent passes
 * 6. Reports findings to terminal
 *
 * @param rawOptions - Raw CLI options from Commander
 * @param deps - Injected dependencies (defaults to real implementations)
 * @returns Result with exit code and finding counts
 */
export async function runLocalReview(
  rawOptions: Parameters<typeof parseLocalReviewOptions>[0],
  deps: LocalReviewDependencies = createDefaultDependencies()
): Promise<LocalReviewResult> {
  const { env, stdout, stderr } = deps;
  const colored = stdout.isTTY !== false && supportsColor();
  const c = createColorizer(colored);

  // Track start time
  const startTime = Date.now();

  // 1. Parse and validate options
  const parseResult = parseLocalReviewOptions(rawOptions);
  if (!isOk(parseResult)) {
    stderr.write(formatCLIError(parseResult.error, colored) + '\n');
    return {
      exitCode: ExitCode.INVALID_ARGS,
      findingsCount: 0,
      partialFindingsCount: 0,
      error: parseResult.error.message,
    };
  }

  const { options, warnings } = parseResult.value;

  // Print warnings
  for (const warning of warnings) {
    stderr.write(c.yellow(`Warning: ${warning}`) + '\n');
  }

  // 2. Infer git context
  const inferFn = deps.inferGitContext ?? inferGitContext;
  const gitResult = inferFn(resolve(options.path));

  if (!isOk(gitResult)) {
    const error =
      gitResult.error.code === GitContextErrorCode.GIT_NOT_FOUND
        ? new GitNotFoundError(gitResult.error.message)
        : gitResult.error.code === GitContextErrorCode.INVALID_PATH
          ? new InvalidPathError(gitResult.error.message, gitResult.error.path)
          : new NotAGitRepoError(gitResult.error.path ?? options.path);
    stderr.write(formatCLIError(error, colored) + '\n');
    return {
      exitCode: ExitCode.INVALID_ARGS,
      findingsCount: 0,
      partialFindingsCount: 0,
      error: error.message,
    };
  }

  const gitContext = gitResult.value;

  // Apply defaults from git context
  const resolvedOptions = applyOptionDefaults(options, gitContext);
  const diffRange = resolveDiffRange(resolvedOptions, gitContext);
  const baseRef = diffRange.baseRef;

  // 3. Load configuration (with zero-config fallback)
  let config: Config;
  let configSource: 'file' | 'zero-config';
  let configPath: string | undefined;
  let zeroConfigResult: ZeroConfigResult | undefined;

  try {
    const configResult = await loadConfigWithFallback(
      gitContext.repoRoot,
      env,
      deps,
      resolvedOptions.config
    );
    config = configResult.config;
    configSource = configResult.source;
    configPath = configResult.path;
    zeroConfigResult = configResult.zeroConfigResult;
  } catch (error) {
    if (error instanceof NoCredentialsError) {
      stderr.write(formatCLIError(error, colored) + '\n');
      return {
        exitCode: ExitCode.INVALID_ARGS,
        findingsCount: 0,
        partialFindingsCount: 0,
        error: error.message,
      };
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    const configError = new InvalidConfigError(resolvedOptions.config ?? '.ai-review.yml', [
      errorMsg,
    ]);
    stderr.write(formatCLIError(configError, colored) + '\n');
    return {
      exitCode: ExitCode.INVALID_ARGS,
      findingsCount: 0,
      partialFindingsCount: 0,
      error: errorMsg,
    };
  }

  // Show zero-config message if applicable
  if (configSource === 'zero-config' && zeroConfigResult && !resolvedOptions.quiet) {
    stdout.write(
      c.yellow(`\nUsing ${zeroConfigResult.provider} (${zeroConfigResult.keySource} found)\n`)
    );
    if (zeroConfigResult.ignoredProviders.length > 0) {
      for (const ignored of zeroConfigResult.ignoredProviders) {
        stdout.write(
          c.gray(`Note: ${ignored.keySource} also set but ignored due to priority order\n`)
        );
      }
    }
    stdout.write(c.gray('Tip: Create .ai-review.yml to customize settings\n\n'));
  }

  // 4. Handle special modes (dry-run and cost-only) - before dependency check
  // These modes don't execute agents, so dependencies are not required
  if (resolvedOptions.dryRun) {
    const dryRunResult = await executeDryRun(
      resolvedOptions,
      gitContext,
      config,
      configSource,
      configPath,
      deps
    );
    const output = formatDryRunOutput(dryRunResult, colored, resolvedOptions.format);
    stdout.write(output);
    return { exitCode: ExitCode.SUCCESS, findingsCount: 0, partialFindingsCount: 0 };
  }

  if (resolvedOptions.costOnly) {
    const costResult = await executeCostOnly(resolvedOptions, gitContext, config, deps);
    const output = formatCostOutput(costResult, colored);
    stdout.write(output);
    return { exitCode: ExitCode.SUCCESS, findingsCount: 0, partialFindingsCount: 0 };
  }

  // 5. Dependency preflight check (only needed when actually running agents)
  const depSummary = checkDependenciesForPasses(config.passes);
  if (depSummary.hasBlockingIssues) {
    displayDependencyErrors(depSummary, stderr);
    return {
      exitCode: ExitCode.FAILURE,
      findingsCount: 0,
      partialFindingsCount: 0,
      error: 'Missing required dependencies',
    };
  }

  // Build skipped pass info for warnings
  const skippedPassInfo = buildSkippedPassInfo(config.passes, depSummary);

  // Show warnings for skipped passes (graceful degradation)
  if (skippedPassInfo.length > 0 && !resolvedOptions.quiet) {
    displaySkippedPassWarnings(skippedPassInfo, stderr);
  }

  // Filter config to only include runnable passes
  const runnableConfig = filterToRunnablePasses(config, depSummary.runnablePasses);

  // Show warnings for other optional missing dependencies
  if (depSummary.hasWarnings && !resolvedOptions.quiet && skippedPassInfo.length === 0) {
    displayDependencyErrors(depSummary, stderr);
  }

  // 6. Load .reviewignore patterns (before diff to filter early)
  const reviewIgnoreResult = await loadReviewIgnore(gitContext.repoRoot);

  // 7. Generate diff once with reviewignore filtering applied
  const getDiffFn = deps.getLocalDiff ?? getLocalDiff;
  const diff = getDiffFn(gitContext.repoRoot, {
    baseRef,
    headRef: diffRange.headRef,
    rangeOperator: diffRange.rangeOperator,
    stagedOnly: resolvedOptions.staged,
    uncommitted: resolvedOptions.uncommitted,
    pathFilter:
      reviewIgnoreResult.patterns.length > 0
        ? { reviewIgnorePatterns: reviewIgnoreResult.patterns }
        : undefined,
  });

  // 8. Check for changes (using already-generated diff)
  if (diff.files.length === 0) {
    // No changes to review - could be no changes or all filtered by .reviewignore
    const headLabel = resolvedOptions.staged
      ? 'STAGED'
      : resolvedOptions.uncommitted
        ? 'WORKTREE'
        : diffRange.headRef;
    const output = colored
      ? `${c.green('✓')} No changes to review\n\n  Base: ${baseRef}\n  Head: ${headLabel}\n\n  No uncommitted or staged changes found.\n`
      : `No changes to review\n\n  Base: ${baseRef}\n  Head: ${headLabel}\n\n  No uncommitted or staged changes found.\n`;
    stdout.write(output);
    return { exitCode: ExitCode.SUCCESS, findingsCount: 0, partialFindingsCount: 0 };
  }

  // 9. Build agent context (using runnableConfig with filtered passes)
  const routerEnv = buildRouterEnv(env);
  const agentContext = buildAgentContext(gitContext.repoRoot, diff, runnableConfig, routerEnv);
  const configHash = hashConfig(config); // Use original config for consistent cache key

  // 10. Check budget
  const diffContent = buildCombinedDiff(diff.files, config.limits?.max_diff_lines ?? 5000);
  const estimatedTokensCount = estimateTokens(diffContent);
  const budgetContext: BudgetContext = {
    fileCount: diff.files.length,
    diffLines: diff.totalAdditions + diff.totalDeletions,
    estimatedTokens: estimatedTokensCount,
  };
  const budgetCheck = checkBudget(
    budgetContext,
    config.limits ?? {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 50000,
      max_usd_per_pr: 0.1,
      monthly_budget_usd: 10,
    }
  );

  // 11. Setup signal handlers for graceful shutdown
  // exitOnSignal defaults to true - first Ctrl+C stops execution immediately
  // This is the correct behavior for CLI tools to avoid runaway costs
  setupSignalHandlers({
    // Cleanup must be SYNCHRONOUS to guarantee completion before process.exit()
    // Only uses stdout.write() which is sync - no async I/O allowed here
    cleanup: () => {
      // Log partial results context if available
      const ctx = getPartialResultsContext();
      if (ctx && ctx.completedAgents > 0) {
        const lines = formatPartialResultsMessage(ctx);
        for (const line of lines) {
          stdout.write(line + '\n');
        }
      }
    },
    showPartialResultsMessage: true,
    // exitOnSignal: true (default) - process.exit() called on first signal
    exitOnSignal: true,
    logger: {
      log: (msg) => stdout.write(msg + '\n'),
      warn: (msg) => stderr.write(msg + '\n'),
    },
  });

  // 12. Execute agent passes
  let executeResult: ExecuteResult;

  try {
    // Set up partial results tracking (using runnableConfig which excludes skipped passes)
    const totalAgents = runnableConfig.passes.reduce(
      (sum, p) => (p.enabled ? sum + p.agents.length : sum),
      0
    );
    setPartialResultsContext({
      totalAgents,
      completedAgents: 0,
      completedAgentNames: [],
      currentAgent: undefined,
    });

    const executeFn = deps.executeAllPasses ?? executeAllPasses;
    executeResult = await executeFn(runnableConfig, agentContext, routerEnv, budgetCheck, {
      configHash,
      head: diff.headSha,
    });
  } catch (error) {
    clearPartialResultsContext();

    const errorMsg = error instanceof Error ? error.message : String(error);
    stderr.write(c.red(`\nExecution error: ${errorMsg}\n`));
    return {
      exitCode: ExitCode.FAILURE,
      findingsCount: 0,
      partialFindingsCount: 0,
      error: errorMsg,
    };
  }

  clearPartialResultsContext();

  // 13. Calculate execution time and cost
  const executionTimeMs = Date.now() - startTime;
  const estimatedCostUsd = executeResult.allResults.reduce((sum, r) => {
    if ('metrics' in r && r.metrics?.estimatedCostUsd) {
      return sum + r.metrics.estimatedCostUsd;
    }
    return sum;
  }, 0);

  // 14. Build terminal context with execution info
  const terminalContext = buildTerminalContext(
    resolvedOptions,
    gitContext,
    configSource,
    configPath,
    getPackageVersion()
  );
  terminalContext.executionTimeMs = executionTimeMs;
  terminalContext.estimatedCostUsd = Math.max(0, estimatedCostUsd); // Clamp to non-negative (FR-REL-002)

  // 15. Report findings to terminal
  const reportFn = deps.reportToTerminal ?? reportToTerminal;
  const reportResult = await reportFn(
    executeResult.completeFindings,
    executeResult.partialFindings,
    terminalContext,
    config,
    diff.files
  );

  // 16. Determine exit code
  const exitCode = determineExitCode(executeResult.completeFindings, config);

  return {
    exitCode,
    findingsCount: reportResult.findingsCount,
    partialFindingsCount: reportResult.partialFindingsCount,
  };
}
