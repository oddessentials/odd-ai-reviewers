/**
 * CLI Error Types and Formatters
 *
 * Provides user-facing error types and formatting for terminal output.
 * All error messages include actionable guidance.
 */

// =============================================================================
// CLI Error Codes
// =============================================================================

/**
 * CLI-specific error codes
 */
export const CLIErrorCode = {
  NOT_GIT_REPO: 'CLI_NOT_GIT_REPO',
  GIT_NOT_FOUND: 'CLI_GIT_NOT_FOUND',
  INVALID_PATH: 'CLI_INVALID_PATH',
  NO_CREDENTIALS: 'CLI_NO_CREDENTIALS',
  NO_CHANGES: 'CLI_NO_CHANGES',
  INVALID_CONFIG: 'CLI_INVALID_CONFIG',
  CONFIG_NOT_FOUND: 'CLI_CONFIG_NOT_FOUND',
  INVALID_OPTIONS: 'CLI_INVALID_OPTIONS',
  EXECUTION_FAILED: 'CLI_EXECUTION_FAILED',
} as const;

export type CLIErrorCode = (typeof CLIErrorCode)[keyof typeof CLIErrorCode];

// =============================================================================
// CLI Error Classes
// =============================================================================

/**
 * Base class for CLI errors
 */
export abstract class CLIError extends Error {
  abstract readonly code: CLIErrorCode;
  abstract readonly hint?: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/**
 * Error when not in a git repository
 */
export class NotAGitRepoError extends CLIError {
  readonly code = CLIErrorCode.NOT_GIT_REPO;
  readonly hint: string;
  readonly path?: string;

  constructor(path?: string) {
    super('Not a git repository (or any parent up to root)');
    this.path = path;
    this.hint =
      'Run this command from within a git repository, or specify a path to one:\n' +
      '  ai-review /path/to/repo';
  }
}

/**
 * Error when git is not available in PATH
 */
export class GitNotFoundError extends CLIError {
  readonly code = CLIErrorCode.GIT_NOT_FOUND;
  readonly hint: string;

  constructor(message = 'git command not found') {
    super(message);
    this.hint = 'Install git and ensure it is available on your PATH.';
  }
}

/**
 * Error when the provided path is invalid or inaccessible
 */
export class InvalidPathError extends CLIError {
  readonly code = CLIErrorCode.INVALID_PATH;
  readonly hint: string;
  readonly path?: string;

  constructor(message: string, path?: string) {
    super(message);
    this.path = path;
    this.hint = path ? `Check the path and try again:\n  ${path}` : 'Check the path and try again.';
  }
}

/**
 * Error when no API credentials are found
 */
export class NoCredentialsError extends CLIError {
  readonly code = CLIErrorCode.NO_CREDENTIALS;
  readonly hint: string;

  constructor() {
    super('No API credentials found');
    this.hint =
      'To use AI review, set one of the following environment variables:\n' +
      '  ANTHROPIC_API_KEY  - For Claude models\n' +
      '  OPENAI_API_KEY     - For GPT models\n' +
      '  AZURE_OPENAI_KEY   - For Azure OpenAI\n' +
      '  OLLAMA_HOST        - For local Ollama\n\n' +
      'See: https://docs.oddessentials.com/ai-review/setup';
  }
}

/**
 * Error when no changes are found to review
 */
export class NoChangesError extends CLIError {
  readonly code = CLIErrorCode.NO_CHANGES;
  readonly hint: string;
  readonly base?: string;
  readonly head?: string;

  constructor(base?: string, head?: string) {
    super('No changes to review');
    this.base = base;
    this.head = head;
    this.hint =
      `Base: ${base ?? 'auto-detected'}\n` +
      `Head: ${head ?? 'HEAD'}\n\n` +
      'No uncommitted or staged changes found.';
  }
}

/**
 * Error when configuration is invalid
 */
export class InvalidConfigError extends CLIError {
  readonly code = CLIErrorCode.INVALID_CONFIG;
  readonly hint: string;
  readonly configPath: string;
  readonly details: string[];

  constructor(configPath: string, details: string[]) {
    super(`Invalid configuration in ${configPath}`);
    this.configPath = configPath;
    this.details = details;
    this.hint =
      details.map((d) => `  ${d}`).join('\n') +
      "\n\nRun 'ai-review validate' for detailed diagnostics.";
  }
}

/**
 * Error when config file is not found
 */
export class ConfigNotFoundError extends CLIError {
  readonly code = CLIErrorCode.CONFIG_NOT_FOUND;
  readonly hint: string;
  readonly configPath: string;

  constructor(configPath: string) {
    super(`Config file not found: ${configPath}`);
    this.configPath = configPath;
    this.hint = 'Remove -c flag to use zero-config defaults, or check the file path.';
  }
}

/**
 * Error for invalid CLI options
 */
export class InvalidOptionsError extends CLIError {
  readonly code = CLIErrorCode.INVALID_OPTIONS;
  readonly hint: string;
  readonly option: string;
  readonly reason: string;

  constructor(option: string, reason: string, hint: string) {
    super(`Invalid option: ${option}`);
    this.option = option;
    this.reason = reason;
    this.hint = hint;
  }
}

/**
 * Error for execution failures
 */
export class ExecutionFailedError extends CLIError {
  readonly code = CLIErrorCode.EXECUTION_FAILED;
  readonly hint?: string;
  readonly stage: string;
  readonly originalCause?: Error;

  constructor(stage: string, message: string, originalCause?: Error) {
    super(`Execution failed during ${stage}: ${message}`);
    this.stage = stage;
    this.originalCause = originalCause;
    this.hint = originalCause?.message;
  }
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format a CLI error for terminal display
 *
 * @param error - CLI error to format
 * @param colored - Whether to use ANSI colors
 * @returns Formatted error string
 */
export function formatCLIError(error: CLIError | Error, colored = false): string {
  const red = colored ? '\x1b[31m' : '';
  const yellow = colored ? '\x1b[33m' : '';
  const reset = colored ? '\x1b[0m' : '';
  const bold = colored ? '\x1b[1m' : '';

  if (error instanceof CLIError) {
    const lines: string[] = [];

    // Error header
    lines.push(`${red}${bold}Error:${reset}${red} ${error.message}${reset}`);

    // Hint with different formatting
    if (error.hint) {
      lines.push('');
      lines.push(`${yellow}Hint:${reset}`);
      lines.push(error.hint);
    }

    return lines.join('\n');
  }

  // Generic error formatting
  return `${red}${bold}Error:${reset}${red} ${error.message}${reset}`;
}

/**
 * Format NotAGitRepoError with guidance
 */
export function formatNotAGitRepoError(error: NotAGitRepoError, colored: boolean): string {
  return formatCLIError(error, colored);
}

/**
 * Format NoCredentialsError with env var instructions
 */
export function formatNoCredentialsError(error: NoCredentialsError, colored: boolean): string {
  return formatCLIError(error, colored);
}

/**
 * Format NoChangesError with success styling (not actually an error state)
 */
export function formatNoChangesError(error: NoChangesError, colored: boolean): string {
  const green = colored ? '\x1b[32m' : '';
  const reset = colored ? '\x1b[0m' : '';

  const lines: string[] = [];
  lines.push(`${green}✓ No changes to review${reset}`);
  lines.push('');
  lines.push(`Base: ${error.base ?? 'auto-detected'}`);
  lines.push(`Head: ${error.head ?? 'HEAD'}`);
  lines.push('');
  lines.push('No uncommitted or staged changes found.');

  return lines.join('\n');
}

/**
 * Format InvalidConfigError with validation details
 */
export function formatInvalidConfigError(error: InvalidConfigError, colored: boolean): string {
  return formatCLIError(error, colored);
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for CLIError
 */
export function isCLIError(error: unknown): error is CLIError {
  return error instanceof CLIError;
}

/**
 * Type guard for NotAGitRepoError
 */
export function isNotAGitRepoError(error: unknown): error is NotAGitRepoError {
  return error instanceof NotAGitRepoError;
}

/**
 * Type guard for NoCredentialsError
 */
export function isNoCredentialsError(error: unknown): error is NoCredentialsError {
  return error instanceof NoCredentialsError;
}

/**
 * Type guard for NoChangesError
 */
export function isNoChangesError(error: unknown): error is NoChangesError {
  return error instanceof NoChangesError;
}

/**
 * Type guard for InvalidConfigError
 */
export function isInvalidConfigError(error: unknown): error is InvalidConfigError {
  return error instanceof InvalidConfigError;
}
