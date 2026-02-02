/**
 * CLI Commands Module Exports
 *
 * Barrel export for CLI command handlers.
 */

export {
  runLocalReview,
  createDefaultDependencies,
  ExitCode,
  type LocalReviewDependencies,
  type LocalReviewResult,
  type DryRunResult,
  type CostEstimateResult,
} from './local-review.js';

/**
 * Command registry version - used for module loading verification
 */
export const COMMANDS_MODULE_VERSION = '1.0.0' as const;
