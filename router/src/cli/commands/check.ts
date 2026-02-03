/**
 * Check Command Module
 *
 * Provides the `ai-review check` command for validating external dependencies.
 * Reports status of all known dependencies with version information.
 *
 * @module cli/commands/check
 */

import {
  getAllDependencyNames,
  checkAllDependencies,
  getDependencyInfo,
  detectPlatform,
} from '../dependencies/index.js';
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
 * @param _options - Command options (verbose, json flags)
 * @returns Check result with exit code and dependency status
 */
export function runCheck(_options: CheckOptions): CheckResult {
  // Get all known dependency names and check them
  const depNames = getAllDependencyNames();
  const results = checkAllDependencies(depNames);

  // Build summary
  const summary = {
    available: 0,
    missing: 0,
    unhealthy: 0,
    versionMismatch: 0,
    allAvailable: true,
  };

  for (const result of results) {
    switch (result.status) {
      case 'available':
        summary.available++;
        break;
      case 'missing':
        summary.missing++;
        summary.allAvailable = false;
        break;
      case 'unhealthy':
        summary.unhealthy++;
        summary.allAvailable = false;
        break;
      case 'version-mismatch':
        summary.versionMismatch++;
        summary.allAvailable = false;
        break;
    }
  }

  // Exit code: 0 if all available, 1 otherwise
  const exitCode = summary.allAvailable ? 0 : 1;

  return {
    exitCode,
    results,
    summary,
  };
}

/**
 * Format check output for terminal display.
 *
 * @param results - Dependency check results
 * @param options - Formatting options
 * @returns Formatted output string
 */
export function formatCheckOutput(
  results: DependencyCheckResult[],
  options: { verbose: boolean }
): string {
  const lines: string[] = [];
  const platform = detectPlatform();

  // Header
  lines.push('');
  lines.push('Dependency Status Check');
  lines.push('─'.repeat(40));
  lines.push('');

  for (const result of results) {
    const depInfo = getDependencyInfo(result.name);
    const displayName = depInfo?.displayName ?? result.name;

    // Status line
    switch (result.status) {
      case 'available':
        lines.push(`✓ ${displayName} ${result.version}`);
        break;
      case 'missing':
        lines.push(`✗ ${displayName} - missing`);
        break;
      case 'unhealthy':
        lines.push(`⚠ ${displayName} - unhealthy`);
        if (result.error) {
          lines.push(`    Error: ${result.error}`);
        }
        break;
      case 'version-mismatch':
        lines.push(`⚠ ${displayName} ${result.version} - version mismatch`);
        if (depInfo?.minVersion) {
          lines.push(`    Required: ${depInfo.minVersion} or later`);
        }
        break;
    }

    // Verbose details
    if (options.verbose && depInfo) {
      if (depInfo.minVersion) {
        lines.push(`    Minimum version: ${depInfo.minVersion}`);
      }
      lines.push(`    Documentation: ${depInfo.docsUrl}`);

      // Install instructions for non-available dependencies
      if (result.status !== 'available') {
        const instructions = depInfo.installInstructions[platform];
        if (instructions) {
          lines.push('    Install:');
          for (const line of instructions.split('\n')) {
            lines.push(`      ${line}`);
          }
        }
      }
    }

    lines.push('');
  }

  return lines.join('\n');
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
