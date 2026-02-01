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

// Colors - ANSI codes and support detection
export {
  ANSI,
  type AnsiCode,
  supportsColor,
  colorize,
  colorizeMulti,
  type Severity,
  getSeverityColor,
  colorizeSeverity,
  formatSeverityLabel,
  createColorizer,
  stripAnsi,
  visibleLength,
} from './colors.js';

// Progress - Spinners and agent status tracking
export {
  UNICODE_SPINNER_FRAMES,
  ASCII_SPINNER_FRAMES,
  STATUS_INDICATORS,
  ASCII_STATUS_INDICATORS,
  type SpinnerStatus,
  type SpinnerOptions,
  Spinner,
  type AgentStatus,
  type AgentProgressEntry,
  AgentProgress,
  formatDuration,
  formatAgentStatusLine,
  getSeverityIndicator,
} from './progress.js';
