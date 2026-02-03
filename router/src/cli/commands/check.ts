/**
 * Check Command Module
 *
 * Provides the `ai-review check` command for validating external dependencies.
 * Reports status of all known dependencies with version information.
 *
 * @module cli/commands/check
 */

import type { DependencyCheckResult } from '../dependencies/types.js';

/**
 * Options for the check command
 */
export interface CheckOptions {
  /** Show additional details (minimum version, docs URL) */
  verbose?: boolean;
  /** Output results in JSON format */
  json?: boolean;
}

/**
 * Result from running the check command
 */
export interface CheckResult {
  /** Exit code (0=all available, 1=issues found) */
  exitCode: number;
  /** Individual dependency results */
  results: DependencyCheckResult[];
  /** Summary information */
  summary: {
    available: number;
    missing: number;
    unhealthy: number;
    versionMismatch: number;
    allAvailable: boolean;
  };
}

/**
 * Run the check command to validate all known dependencies.
 *
 * @param options - Command options
 * @returns Check result with exit code and dependency status
 *
 * @remarks
 * Implementation pending in T023. This is a stub for TDD tests.
 */
export function runCheck(_options: CheckOptions): CheckResult {
  // T023 will implement this
  throw new Error('Not implemented - see T023');
}

/**
 * Format check output for terminal display.
 *
 * @param results - Dependency check results
 * @param options - Formatting options
 * @returns Formatted output string
 *
 * @remarks
 * Implementation pending in T024. This is a stub for TDD tests.
 */
export function formatCheckOutput(
  _results: DependencyCheckResult[],
  _options: { verbose: boolean }
): string {
  // T024 will implement this
  throw new Error('Not implemented - see T024');
}

/**
 * Format check output as JSON.
 *
 * @param results - Dependency check results
 * @returns JSON string
 *
 * @remarks
 * Implementation pending in T025. This is a stub for TDD tests.
 */
export function formatCheckOutputJson(_results: DependencyCheckResult[]): string {
  // T025 will implement this
  throw new Error('Not implemented - see T025');
}
