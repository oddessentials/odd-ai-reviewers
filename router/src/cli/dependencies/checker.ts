/**
 * Dependency checker module.
 * Implements runtime checking of external tool availability and version compatibility.
 * @module cli/dependencies/checker
 */

import { execFileSync } from 'child_process';

import type { Pass } from '../../config/schemas.js';
import { getDependenciesForAgent, getDependencyInfo } from './catalog.js';
import type { DependencyCheckResult, DependencyCheckSummary } from './types.js';
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
 * Continues checking remaining dependencies even if one fails.
 *
 * @param names - Array of dependency names to check
 * @returns Array of check results in the same order as input
 */
export function checkAllDependencies(names: string[]): DependencyCheckResult[] {
  return names.map((name) => checkDependency(name));
}

/**
 * Derives the set of external dependencies required by configured passes.
 * Only considers enabled passes.
 *
 * @param passes - Array of pass configurations
 * @returns Array of unique dependency names required by the passes
 */
export function getDependenciesForPasses(passes: Pass[]): string[] {
  const dependencies = new Set<string>();

  for (const pass of passes) {
    // Skip disabled passes
    if (!pass.enabled) continue;

    // Get dependencies for each agent in the pass
    for (const agent of pass.agents) {
      const agentDeps = getDependenciesForAgent(agent);
      for (const dep of agentDeps) {
        dependencies.add(dep);
      }
    }
  }

  return [...dependencies];
}

/**
 * Gets dependencies that are required (blocking) based on pass configuration.
 * A dependency is required if any enabled pass that uses it has required: true.
 *
 * @param passes - Array of pass configurations
 * @returns Set of dependency names that are required
 */
function getRequiredDependencies(passes: Pass[]): Set<string> {
  const requiredDeps = new Set<string>();

  for (const pass of passes) {
    // Only consider enabled, required passes
    if (!pass.enabled || !pass.required) continue;

    for (const agent of pass.agents) {
      const agentDeps = getDependenciesForAgent(agent);
      for (const dep of agentDeps) {
        requiredDeps.add(dep);
      }
    }
  }

  return requiredDeps;
}

/**
 * Checks all dependencies required by configured passes and returns a summary.
 * Determines which missing dependencies are blocking (from required passes)
 * vs optional (from optional passes).
 *
 * @param passes - Array of pass configurations
 * @returns Summary of dependency check results
 */
export function checkDependenciesForPasses(passes: Pass[]): DependencyCheckSummary {
  // Get all dependencies and check them
  const allDeps = getDependenciesForPasses(passes);
  const results = checkAllDependencies(allDeps);

  // Build a set of unavailable deps (missing or unhealthy)
  const unavailableDeps = new Set<string>();
  for (const result of results) {
    if (result.status === 'missing' || result.status === 'unhealthy') {
      unavailableDeps.add(result.name);
    }
  }

  // Determine which dependencies are required (from required passes)
  const requiredDeps = getRequiredDependencies(passes);

  // Categorize results
  const missingRequired: string[] = [];
  const missingOptional: string[] = [];
  const unhealthy: string[] = [];
  const versionWarnings: string[] = [];

  for (const result of results) {
    const isRequired = requiredDeps.has(result.name);

    switch (result.status) {
      case 'missing':
        if (isRequired) {
          missingRequired.push(result.name);
        } else {
          missingOptional.push(result.name);
        }
        break;
      case 'unhealthy':
        unhealthy.push(result.name);
        break;
      case 'version-mismatch':
        versionWarnings.push(`${result.name}: ${result.version} < required minimum`);
        break;
    }
  }

  // Determine runnable and skipped passes
  const runnablePasses: string[] = [];
  const skippedPasses: string[] = [];

  for (const pass of passes) {
    // Skip disabled passes entirely
    if (!pass.enabled) continue;

    // Get dependencies for this pass
    const passDeps = new Set<string>();
    for (const agent of pass.agents) {
      const agentDeps = getDependenciesForAgent(agent);
      for (const dep of agentDeps) {
        passDeps.add(dep);
      }
    }

    // Check if all deps are available
    const hasUnavailableDep = [...passDeps].some((dep) => unavailableDeps.has(dep));

    if (hasUnavailableDep) {
      // Only skip optional passes (required passes cause blocking issue)
      if (!pass.required) {
        skippedPasses.push(pass.name);
      }
    } else {
      runnablePasses.push(pass.name);
    }
  }

  // Blocking issues: missing required deps OR unhealthy deps from required passes
  const unhealthyRequired = unhealthy.filter((name) => requiredDeps.has(name));
  const hasBlockingIssues = missingRequired.length > 0 || unhealthyRequired.length > 0;

  // Warnings: optional missing, any unhealthy (even if not required), version mismatches
  const hasWarnings =
    missingOptional.length > 0 || unhealthy.length > 0 || versionWarnings.length > 0;

  return {
    results,
    missingRequired,
    missingOptional,
    unhealthy,
    versionWarnings,
    hasBlockingIssues,
    hasWarnings,
    runnablePasses,
    skippedPasses,
  };
}
