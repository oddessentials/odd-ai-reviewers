/**
 * CLI Error Formatting Module
 *
 * Provides user-friendly error messages for CLI-specific errors.
 * All errors write to stderr with actionable guidance.
 *
 * @module cli/output/errors
 */

// =============================================================================
// Error Types
// =============================================================================

/**
 * Base interface for CLI errors
 */
export interface CLIError {
  readonly type: string;
  readonly message: string;
  readonly hint?: string;
}

/**
 * Error when not in a git repository
 */
export interface NotAGitRepoError extends CLIError {
  readonly type: 'NOT_GIT_REPO';
  readonly path: string;
}

/**
 * Error when API credentials are missing
 */
export interface NoCredentialsError extends CLIError {
  readonly type: 'NO_CREDENTIALS';
  readonly checkedVars: readonly string[];
}

/**
 * Success indicator when no changes are detected
 */
export interface NoChangesError extends CLIError {
  readonly type: 'NO_CHANGES';
  readonly base: string;
  readonly head: string;
}

/**
 * Error when config file is invalid
 */
export interface InvalidConfigError extends CLIError {
  readonly type: 'INVALID_CONFIG';
  readonly configPath: string;
  readonly errors: readonly string[];
}

/**
 * Error when config file is not found
 */
export interface ConfigNotFoundError extends CLIError {
  readonly type: 'CONFIG_NOT_FOUND';
  readonly configPath: string;
}

/**
 * Error when mutually exclusive options are used together
 */
export interface MutuallyExclusiveOptionsError extends CLIError {
  readonly type: 'MUTUALLY_EXCLUSIVE_OPTIONS';
  readonly options: readonly string[];
}

/**
 * Error when nothing to review (--staged=false + --uncommitted=false)
 */
export interface NothingToReviewError extends CLIError {
  readonly type: 'NOTHING_TO_REVIEW';
}

/**
 * Union type of all CLI errors
 */
export type CLIErrorType =
  | NotAGitRepoError
  | NoCredentialsError
  | NoChangesError
  | InvalidConfigError
  | ConfigNotFoundError
  | MutuallyExclusiveOptionsError
  | NothingToReviewError;

// =============================================================================
// Error Constructors
// =============================================================================

/**
 * Create a NotAGitRepoError
 */
export function createNotAGitRepoError(path: string): NotAGitRepoError {
  return {
    type: 'NOT_GIT_REPO',
    path,
    message: 'Not a git repository (or any parent up to mount point)',
    hint: `Run this command from within a git repository, or specify a path to one:\n  ai-review /path/to/repo`,
  };
}

/**
 * Create a NoCredentialsError
 */
export function createNoCredentialsError(checkedVars: readonly string[]): NoCredentialsError {
  return {
    type: 'NO_CREDENTIALS',
    checkedVars,
    message: 'No API credentials found',
    hint: `To use AI review, set one of the following environment variables:
  ANTHROPIC_API_KEY   - For Claude models
  OPENAI_API_KEY      - For GPT models
  AZURE_OPENAI_KEY    - For Azure OpenAI
  OLLAMA_HOST         - For local Ollama

See: https://docs.oddessentials.com/ai-review/setup`,
  };
}

/**
 * Create a NoChangesError (not actually an error - success case)
 */
export function createNoChangesError(base: string, head: string): NoChangesError {
  return {
    type: 'NO_CHANGES',
    base,
    head,
    message: 'No changes to review',
    hint: `Base: ${base}\nHead: ${head}\n\nNo uncommitted or staged changes found.`,
  };
}

/**
 * Create an InvalidConfigError
 */
export function createInvalidConfigError(
  configPath: string,
  errors: readonly string[]
): InvalidConfigError {
  return {
    type: 'INVALID_CONFIG',
    configPath,
    errors,
    message: `Invalid configuration in ${configPath}`,
    hint: `Run 'ai-review validate' for detailed diagnostics.`,
  };
}

/**
 * Create a ConfigNotFoundError
 */
export function createConfigNotFoundError(configPath: string): ConfigNotFoundError {
  return {
    type: 'CONFIG_NOT_FOUND',
    configPath,
    message: `Config file not found: ${configPath}`,
    hint: 'Remove -c flag to use zero-config defaults, or check the file path.',
  };
}

/**
 * Create a MutuallyExclusiveOptionsError
 */
export function createMutuallyExclusiveOptionsError(
  options: readonly string[]
): MutuallyExclusiveOptionsError {
  return {
    type: 'MUTUALLY_EXCLUSIVE_OPTIONS',
    options,
    message: `Cannot use ${options.join(' and ')} together`,
    hint:
      options.includes('--quiet') && options.includes('--verbose')
        ? 'Use --quiet for minimal output (errors only), or --verbose for debug information.'
        : undefined,
  };
}

/**
 * Create a NothingToReviewError
 */
export function createNothingToReviewError(): NothingToReviewError {
  return {
    type: 'NOTHING_TO_REVIEW',
    message: 'Nothing to review',
    hint: `Both --staged=false and --uncommitted=false specified.
Use --staged to review staged changes, or --uncommitted for all uncommitted changes.`,
  };
}

// =============================================================================
// Formatting
// =============================================================================

import { createColorizer } from './colors.js';

/**
 * Format a CLI error for terminal display.
 *
 * @param error - The CLI error to format
 * @param colored - Whether to use colors (default: true)
 */
export function formatCLIError(error: CLIErrorType, colored = true): string {
  const c = createColorizer(colored);
  const lines: string[] = [];

  // Error type determines formatting
  if (error.type === 'NO_CHANGES') {
    // Success case - green checkmark
    lines.push(c.green('✓') + ' ' + error.message);
    if (error.hint) {
      lines.push('');
      lines.push(c.gray(error.hint));
    }
  } else {
    // Error case - red prefix
    lines.push(c.red('Error:') + ' ' + error.message);
    if (error.hint) {
      lines.push('');
      lines.push(c.gray('Hint: ') + error.hint);
    }
  }

  return lines.join('\n');
}

/**
 * Format a warning for terminal display.
 */
export function formatCLIWarning(message: string, colored = true): string {
  const c = createColorizer(colored);
  return c.yellow('Warning:') + ' ' + message;
}
