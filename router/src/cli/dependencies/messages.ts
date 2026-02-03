/**
 * User-facing message formatter for dependency errors.
 * Generates consolidated, platform-specific error messages with install guidance.
 * @module cli/dependencies/messages
 */

import { getDependencyInfo } from './catalog.js';
import { detectPlatform } from './platform.js';
import type { DependencyCheckResult, DependencyCheckSummary } from './types.js';

/**
 * Formats a missing or problematic dependency error with platform-specific
 * install instructions and documentation link.
 *
 * @param result - The dependency check result
 * @returns Formatted error message string
 */
export function formatMissingDependencyError(result: DependencyCheckResult): string {
  const depInfo = getDependencyInfo(result.name);
  const platform = detectPlatform();

  const lines: string[] = [];

  // Header based on status
  switch (result.status) {
    case 'missing':
      lines.push(`✗ ${depInfo?.displayName ?? result.name} is not installed`);
      break;
    case 'unhealthy':
      lines.push(`⚠ ${depInfo?.displayName ?? result.name} is unhealthy`);
      if (result.error) {
        lines.push(`  Error: ${result.error}`);
      }
      lines.push('  Try reinstalling the tool or check your installation.');
      break;
    case 'version-mismatch':
      lines.push(
        `⚠ ${depInfo?.displayName ?? result.name} version ${result.version} is below minimum`
      );
      if (depInfo?.minVersion) {
        lines.push(`  Required: ${depInfo.minVersion} or later`);
      }
      break;
    default:
      return '';
  }

  // Installation instructions
  if (depInfo) {
    const installInstructions = depInfo.installInstructions[platform];
    if (installInstructions) {
      lines.push('');
      lines.push('  To install:');
      for (const instruction of installInstructions.split('\n')) {
        lines.push(`    ${instruction}`);
      }
    }

    // Documentation link
    lines.push('');
    lines.push(`  Documentation: ${depInfo.docsUrl}`);
  }

  // Suggestion to run ai-review check
  lines.push('');
  lines.push('  Run "ai-review check" to verify your environment setup.');

  return lines.join('\n');
}

/**
 * Formats a single dependency status line for display.
 *
 * @param result - The dependency check result
 * @returns Formatted status line (e.g., "✓ semgrep 1.56.0")
 */
export function formatDependencyStatus(result: DependencyCheckResult): string {
  const depInfo = getDependencyInfo(result.name);
  const displayName = depInfo?.displayName ?? result.name;

  switch (result.status) {
    case 'available':
      return `✓ ${displayName} ${result.version}`;
    case 'missing':
      return `✗ ${displayName} - missing`;
    case 'unhealthy':
      return `⚠ ${displayName} - unhealthy`;
    case 'version-mismatch':
      return `⚠ ${displayName} ${result.version} - version mismatch`;
  }
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
