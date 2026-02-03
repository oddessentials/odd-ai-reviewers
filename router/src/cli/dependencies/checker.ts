/**
 * Dependency checker module.
 * Implements runtime checking of external tool availability and version compatibility.
 * @module cli/dependencies/checker
 */

import { execFileSync } from 'child_process';

import { getDependencyInfo } from './catalog.js';
import type { DependencyCheckResult } from './types.js';
import { meetsMinimum, parseVersion } from './version.js';

/** Timeout for version commands in milliseconds */
const VERSION_COMMAND_TIMEOUT = 5000;

/**
 * Checks a single dependency's availability and version.
 * Uses execFileSync with shell: false for security.
 *
 * @param name - Dependency name from the catalog (e.g., 'semgrep')
 * @returns Check result with status, version, and any error
 * @throws If dependency name is not in the catalog
 */
export function checkDependency(name: string): DependencyCheckResult {
  const depInfo = getDependencyInfo(name);

  if (!depInfo) {
    throw new Error(`Unknown dependency: ${name}. Not found in catalog.`);
  }

  const [binary, args] = depInfo.versionCommand;

  try {
    // Execute version command with shell: false for security
    const output = execFileSync(binary, args, {
      timeout: VERSION_COMMAND_TIMEOUT,
      encoding: 'utf8',
    });

    // Parse version from output (execFileSync with encoding: 'utf8' returns string)
    const parsed = parseVersion(output, depInfo.versionRegex);

    if (!parsed) {
      return {
        name,
        status: 'unhealthy',
        version: null,
        error: `Could not parse version from output: ${output.slice(0, 100)}`,
      };
    }

    // Check version requirement if specified
    if (depInfo.minVersion && !meetsMinimum(parsed, depInfo.minVersion)) {
      return {
        name,
        status: 'version-mismatch',
        version: parsed.raw,
        error: `Version ${parsed.raw} does not meet minimum requirement of ${depInfo.minVersion}`,
      };
    }

    return {
      name,
      status: 'available',
      version: parsed.raw,
      error: null,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoException;

    // ENOENT means binary not found
    if (error.code === 'ENOENT') {
      return {
        name,
        status: 'missing',
        version: null,
        error: `${depInfo.displayName} not found in PATH`,
      };
    }

    // ETIMEDOUT means version command timed out
    if (error.code === 'ETIMEDOUT') {
      return {
        name,
        status: 'unhealthy',
        version: null,
        error: `${depInfo.displayName} version command timed out after ${VERSION_COMMAND_TIMEOUT}ms`,
      };
    }

    // Other errors indicate unhealthy state
    return {
      name,
      status: 'unhealthy',
      version: null,
      error: `${depInfo.displayName} version check failed: ${error.message}`,
    };
  }
}

/**
 * Checks multiple dependencies and returns all results.
 *
 * @param names - Array of dependency names to check
 * @returns Array of check results
 *
 * @remarks
 * Implementation pending in T015. This is a stub for TDD tests.
 */
export function checkAllDependencies(_names: string[]): DependencyCheckResult[] {
  // T015 will implement this
  throw new Error('Not implemented - see T015');
}
