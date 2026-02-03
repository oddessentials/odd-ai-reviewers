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
 * Outputs blocking errors first, then warnings.
 *
 * @param summary - The dependency check summary
 * @param stderr - The stderr stream to write to
 */
export function displayDependencyErrors(
  summary: DependencyCheckSummary,
  stderr: NodeJS.WriteStream
): void {
  const lines: string[] = [];

  // Only output if there are issues to report
  if (!summary.hasBlockingIssues && !summary.hasWarnings) {
    return;
  }

  // Header
  if (summary.hasBlockingIssues) {
    lines.push('');
    lines.push('❌ Missing required dependencies');
    lines.push('');
  }

  // Missing required dependencies (blocking)
  for (const depName of summary.missingRequired) {
    const result = summary.results.find((r) => r.name === depName);
    if (result) {
      lines.push(formatMissingDependencyError(result));
      lines.push('');
    }
  }

  // Unhealthy dependencies
  for (const depName of summary.unhealthy) {
    const result = summary.results.find((r) => r.name === depName);
    if (result) {
      lines.push(formatMissingDependencyError(result));
      lines.push('');
    }
  }

  // Version warnings
  if (summary.versionWarnings.length > 0) {
    lines.push('⚠ Version warnings:');
    for (const warning of summary.versionWarnings) {
      const depName = warning.split(':')[0];
      const result = summary.results.find((r) => r.name === depName);
      if (result) {
        lines.push(formatMissingDependencyError(result));
      } else {
        lines.push(`  ${warning}`);
      }
    }
    lines.push('');
  }

  // Missing optional dependencies (warnings, not blocking)
  if (summary.missingOptional.length > 0) {
    lines.push('⚠ Optional dependencies not found:');
    for (const depName of summary.missingOptional) {
      const result = summary.results.find((r) => r.name === depName);
      if (result) {
        lines.push(formatMissingDependencyError(result));
      }
    }
    lines.push('');
  }

  // Write to stderr
  stderr.write(lines.join('\n'));
}
