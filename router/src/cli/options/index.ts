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
  // Range parsing types (T005-T009)
  RangeErrorCode,
  type RangeValidationError,
  type ParsedRange,
  type RangeParseResult,
  type ResolvedDiffMode,
  isResolvedDiffMode,
  assertDiffModeResolved,
  // Functions
  parseLocalReviewOptions,
  applyOptionDefaults,
  resolveOutputFormat,
  resolveDiffRange,
  parseRangeString,
} from './local-review-options.js';
