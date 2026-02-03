/**
 * User-facing message formatter for dependency errors.
 * Generates consolidated, platform-specific error messages with install guidance.
 * @module cli/dependencies/messages
 */

import type { DependencyCheckResult, DependencyCheckSummary } from './types.js';

/**
 * Formats a missing or problematic dependency error with platform-specific
 * install instructions and documentation link.
 *
 * @param result - The dependency check result
 * @returns Formatted error message string
 *
 * @remarks
 * Implementation pending in T018. This is a stub for TDD tests.
 */
export function formatMissingDependencyError(_result: DependencyCheckResult): string {
  // T018 will implement this
  throw new Error('Not implemented - see T018');
}

/**
 * Formats a single dependency status line for display.
 *
 * @param result - The dependency check result
 * @returns Formatted status line (e.g., "✓ semgrep 1.56.0")
 *
 * @remarks
 * Implementation pending in T018. This is a stub for TDD tests.
 */
export function formatDependencyStatus(_result: DependencyCheckResult): string {
  // T018 will implement this
  throw new Error('Not implemented - see T018');
}

/**
 * Displays dependency errors to stderr with consolidated formatting.
 *
 * @param summary - The dependency check summary
 * @param stderr - The stderr stream to write to
 *
 * @remarks
 * Implementation pending in T019. This is a stub for TDD tests.
 */
export function displayDependencyErrors(
  _summary: DependencyCheckSummary,
  _stderr: NodeJS.WriteStream
): void {
  // T019 will implement this
  throw new Error('Not implemented - see T019');
}
