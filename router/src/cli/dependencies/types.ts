/**
 * TypeScript types and interfaces for CLI dependency detection.
 * @module cli/dependencies/types
 */

// ============= Core Types =============

/**
 * Supported platforms for dependency detection.
 */
export type Platform = 'darwin' | 'win32' | 'linux';

/**
 * Status of a dependency check.
 * - available: Tool works, version verified
 * - missing: ENOENT - binary not found in PATH
 * - unhealthy: Binary exists but --version failed or returned unparseable output
 * - version-mismatch: Below minimum required version
 */
export type DependencyStatus = 'available' | 'missing' | 'unhealthy' | 'version-mismatch';

/**
 * Per-platform installation command mapping.
 */
export interface PlatformInstructions {
  darwin: string;
  win32: string;
  linux: string;
}

/**
 * Centralized catalog entry for a required external tool.
 */
export interface ExternalDependency {
  /** Tool identifier (e.g., 'semgrep') */
  name: string;
  /** Human-readable name for error messages */
  displayName: string;
  /** Binary and args for version check (e.g., ['semgrep', ['--version']]) */
  versionCommand: [string, string[]];
  /** Pattern to extract version from output */
  versionRegex: RegExp;
  /** Minimum required version (semver), null if no minimum */
  minVersion: string | null;
  /** Official documentation URL */
  docsUrl: string;
  /** Per-platform install commands */
  installInstructions: PlatformInstructions;
}

// ============= Check Results =============

/**
 * Result of checking a single dependency.
 */
export interface DependencyCheckResult {
  /** Dependency name */
  name: string;
  /** Check result status */
  status: DependencyStatus;
  /** Detected version (null if missing/unparseable) */
  version: string | null;
  /** Error message (for unhealthy/missing states) */
  error: string | null;
}

/**
 * Aggregated result of checking all dependencies for a run.
 */
export interface DependencyCheckSummary {
  /** Individual check results */
  results: DependencyCheckResult[];
  /** Dependencies missing for required passes */
  missingRequired: string[];
  /** Dependencies missing for optional passes */
  missingOptional: string[];
  /** Dependencies in unhealthy state */
  unhealthy: string[];
  /** Dependencies below recommended version */
  versionWarnings: string[];
  /** True if any required dependency unavailable */
  hasBlockingIssues: boolean;
  /** True if any non-blocking issues exist */
  hasWarnings: boolean;
}

// ============= Pass Mapping =============

/**
 * Information about a pass and its required dependencies.
 */
export interface PassDependencyInfo {
  /** Pass name from config */
  passName: string;
  /** Whether pass is marked as required */
  required: boolean;
  /** Agent IDs used by this pass */
  agents: string[];
  /** External tools needed (derived from agents) */
  dependencies: string[];
}

// ============= Catalog Types =============

/**
 * Registry of all known external dependencies.
 */
export type DependencyCatalog = Record<string, ExternalDependency>;

/**
 * Mapping from agent IDs to their required external tools.
 */
export type AgentDependencyMap = Record<string, string[]>;
