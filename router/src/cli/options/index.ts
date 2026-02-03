/**
 * CLI Options Module Exports
 *
 * Barrel export for CLI option parsing and validation.
 */

export {
  type OutputFormat,
  type RangeOperator,
  type ResolvedDiffRange,
  type LocalReviewOptions,
  type RawLocalReviewOptions,
  type OptionsValidationError,
  type ParsedOptionsResult,
  parseLocalReviewOptions,
  applyOptionDefaults,
  resolveOutputFormat,
  resolveBaseRef,
  resolveDiffRange,
} from './local-review-options.js';
