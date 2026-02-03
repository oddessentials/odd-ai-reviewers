/**
 * Dependency checker module.
 * Implements runtime checking of external tool availability and version compatibility.
 * @module cli/dependencies/checker
 */

import type { DependencyCheckResult } from './types.js';

/**
 * Checks a single dependency's availability and version.
 * Uses execFileSync with shell: false for security.
 *
 * @param name - Dependency name from the catalog (e.g., 'semgrep')
 * @returns Check result with status, version, and any error
 * @throws If dependency name is not in the catalog
 *
 * @remarks
 * Implementation pending in T014. This is a stub for TDD tests.
 */
export function checkDependency(_name: string): DependencyCheckResult {
  // T014 will implement this
  throw new Error('Not implemented - see T014');
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
