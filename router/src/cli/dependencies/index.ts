/**
 * CLI dependency detection module.
 * Provides utilities for checking external tool availability and version compatibility.
 * @module cli/dependencies
 */

// ============= Types =============
export type {
  Platform,
  DependencyStatus,
  PlatformInstructions,
  ExternalDependency,
  DependencyCheckResult,
  DependencyCheckSummary,
  PassDependencyInfo,
  DependencyCatalog,
  AgentDependencyMap,
  SkippedPassInfo,
} from './types.js';

// ============= Schemas =============
export {
  PlatformSchema,
  DependencyStatusSchema,
  DependencyCheckResultSchema,
  DependencyCheckSummarySchema,
} from './schemas.js';

export type {
  PlatformFromSchema,
  DependencyStatusFromSchema,
  DependencyCheckResultFromSchema,
  DependencyCheckSummaryFromSchema,
} from './schemas.js';

// ============= Platform Detection =============
export { detectPlatform, isSupportedPlatform } from './platform.js';

// ============= Version Utilities =============
export type { ParsedVersion } from './version.js';
export { parseVersion, compareVersions, meetsMinimum, extractVersionString } from './version.js';

// ============= Catalog =============
export {
  DEPENDENCY_CATALOG,
  AGENT_DEPENDENCIES,
  getDependenciesForAgent,
  getDependencyInfo,
  getAllDependencyNames,
  agentRequiresExternalDeps,
} from './catalog.js';

// ============= Checker =============
export {
  checkDependency,
  checkAllDependencies,
  getDependenciesForPasses,
  checkDependenciesForPasses,
} from './checker.js';

// ============= Messages =============
export type { WritableLike } from './messages.js';
export {
  formatMissingDependencyError,
  formatDependencyStatus,
  displayDependencyErrors,
  formatSkippedPassWarning,
  displaySkippedPassWarnings,
} from './messages.js';
