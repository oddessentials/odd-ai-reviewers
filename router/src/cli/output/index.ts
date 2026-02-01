/**
 * CLI Output Module Exports
 *
 * Barrel export for CLI output utilities including:
 * - Colors: ANSI color codes and support detection
 * - Progress: Spinners and agent status tracking
 * - Errors: CLI error types and formatters
 */

// Error types and formatters
export {
  CLIErrorCode,
  type CLIErrorCode as CLIErrorCodeType,
  CLIError,
  NotAGitRepoError,
  NoCredentialsError,
  NoChangesError,
  InvalidConfigError,
  ConfigNotFoundError,
  InvalidOptionsError,
  ExecutionFailedError,
  formatCLIError,
  formatNotAGitRepoError,
  formatNoCredentialsError,
  formatNoChangesError,
  formatInvalidConfigError,
  isCLIError,
  isNotAGitRepoError,
  isNoCredentialsError,
  isNoChangesError,
  isInvalidConfigError,
} from './errors.js';

// Colors will be exported when implemented (Phase 2)
// export * from './colors.js';

// Progress will be exported when implemented (Phase 2)
// export * from './progress.js';
