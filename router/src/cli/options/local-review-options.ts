/**
 * Local Review Options Module
 *
 * Type definitions and parsing for CLI options specific to local review mode.
 * Handles option validation, mutual exclusivity, and default application.
 */

import { type Result, Ok, Err } from '../../types/result.js';
import { ValidationError, ValidationErrorCode } from '../../types/errors.js';
import type { GitContext } from '../git-context.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Output format for terminal reporter
 */
export type OutputFormat = 'pretty' | 'json' | 'sarif';

/**
 * Range operator type for git diff ranges.
 * - '..' - Two-dot: direct comparison (base..head)
 * - '...' - Three-dot: symmetric difference / merge-base (base...head)
 */
export type RangeOperator = '..' | '...';

/**
 * Error codes for range validation (before git calls).
 */
export enum RangeErrorCode {
  /** Multiple range operators found (e.g., "a..b..c") */
  MULTIPLE_OPERATORS = 'MULTIPLE_OPERATORS',
  /** Base reference is empty or whitespace-only */
  EMPTY_BASE_REF = 'EMPTY_BASE_REF',
  /** Head reference is empty or whitespace-only */
  EMPTY_HEAD_REF = 'EMPTY_HEAD_REF',
  /** Both refs are missing (e.g., ".." or "...") */
  MISSING_REFS = 'MISSING_REFS',
}

/**
 * Range validation error details.
 */
export interface RangeValidationError {
  readonly code: RangeErrorCode;
  readonly message: string;
  readonly input: string;
}

/**
 * Successful parse result from range string.
 */
export interface ParsedRange {
  readonly baseRef: string;
  readonly headRef: string | undefined; // undefined = defaults to HEAD
  readonly operator: RangeOperator;
}

/**
 * Result type for range parsing.
 */
export type RangeParseResult =
  | { readonly ok: true; readonly value: ParsedRange }
  | { readonly ok: false; readonly error: RangeValidationError };

/**
 * Represents a resolved diff mode after CLI option parsing.
 * Exactly one mode must be selected; undefined is a programmer error.
 */
export type ResolvedDiffMode =
  | { readonly mode: 'staged' }
  | { readonly mode: 'uncommitted' }
  | { readonly mode: 'range'; readonly rangeSpec: string; readonly operator: RangeOperator };

/**
 * Type guard for ResolvedDiffMode.
 */
export function isResolvedDiffMode(value: unknown): value is ResolvedDiffMode {
  if (!value || typeof value !== 'object') return false;
  const mode = (value as { mode?: unknown }).mode;
  return mode === 'staged' || mode === 'uncommitted' || mode === 'range';
}

/**
 * Assertion function for diff mode invariant.
 * Throws programmer error if mode is undefined.
 */
export function assertDiffModeResolved(
  mode: ResolvedDiffMode | undefined,
  context?: string
): asserts mode is ResolvedDiffMode {
  if (!mode) {
    throw new Error(
      `INVARIANT VIOLATION: No diff mode resolved${context ? ` (${context})` : ''}. ` +
        'This is a programmer error—options parsing must guarantee a mode is set.'
    );
  }
}

export interface ResolvedDiffRange {
  baseRef: string;
  headRef: string;
  rangeOperator: RangeOperator;
}

/**
 * Command-line options for local review mode
 */
export interface LocalReviewOptions {
  /** Directory to review (default: ".") */
  path: string;
  /** Base reference for comparison (auto-detected if not specified) */
  base?: string;
  /** Head reference (default: "HEAD") */
  head?: string;
  /** Git range (e.g., HEAD~3..) - mutually exclusive with base/head */
  range?: string;
  /** Review only staged changes */
  staged: boolean;
  /** Include uncommitted changes (default: true) */
  uncommitted: boolean;
  /** Run specific pass only */
  pass?: string;
  /** Run specific agent only */
  agent?: string;
  /** Output format */
  format: OutputFormat;
  /** Disable colored output */
  noColor: boolean;
  /** Minimal output (errors only) */
  quiet: boolean;
  /** Show debug information */
  verbose: boolean;
  /** Show what would be reviewed without running */
  dryRun: boolean;
  /** Estimate cost without running agents */
  costOnly: boolean;
  /** Config file path */
  config?: string;
}

/**
 * Raw options from Commander before validation
 */
export interface RawLocalReviewOptions {
  path?: string;
  base?: string;
  head?: string;
  range?: string;
  staged?: boolean;
  uncommitted?: boolean;
  pass?: string;
  agent?: string;
  format?: string;
  noColor?: boolean;
  color?: boolean; // Commander uses --no-color which sets color=false
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  costOnly?: boolean;
  config?: string;
}

/**
 * Validation error for options
 */
export interface OptionsValidationError {
  field: string;
  message: string;
}

/**
 * Result of options parsing
 */
export interface ParsedOptionsResult {
  options: LocalReviewOptions;
  warnings: string[];
}

// =============================================================================
// Validation & Parsing
// =============================================================================

/**
 * Parse and validate raw CLI options into LocalReviewOptions.
 *
 * @param raw - Raw options from Commander
 * @returns Result with parsed options or validation error
 */
export function parseLocalReviewOptions(
  raw: RawLocalReviewOptions
): Result<ParsedOptionsResult, ValidationError> {
  const warnings: string[] = [];

  // Validate output format
  const validFormats: OutputFormat[] = ['pretty', 'json', 'sarif'];
  let format: OutputFormat = 'pretty';

  if (raw.format !== undefined) {
    if (!validFormats.includes(raw.format as OutputFormat)) {
      return Err(
        new ValidationError(
          `Invalid output format: ${raw.format}. Valid formats: ${validFormats.join(', ')}`,
          ValidationErrorCode.INVALID_INPUT,
          { field: 'format', value: raw.format, constraint: 'valid-format' }
        )
      );
    }
    format = raw.format as OutputFormat;
  }

  // Check mutual exclusivity: quiet and verbose
  if (raw.quiet && raw.verbose) {
    return Err(
      new ValidationError(
        'Cannot use --quiet and --verbose together',
        ValidationErrorCode.INVALID_INPUT,
        { field: 'quiet/verbose', value: { quiet: raw.quiet, verbose: raw.verbose } }
      )
    );
  }

  // Handle --range vs --base/--head mutual exclusivity
  if (raw.range && (raw.base || raw.head)) {
    return Err(
      new ValidationError(
        'Cannot use --range with --base or --head. Use either --range OR --base/--head.',
        ValidationErrorCode.INVALID_INPUT,
        { field: 'range/base/head', value: { range: raw.range, base: raw.base, head: raw.head } }
      )
    );
  }

  // Validate range format using parseRangeString for comprehensive validation
  if (raw.range) {
    const rangeResult = parseRangeString(raw.range);
    if (!rangeResult.ok) {
      // Map RangeErrorCode to ValidationErrorCode
      let validationCode: ValidationErrorCode;
      switch (rangeResult.error.code) {
        case RangeErrorCode.MULTIPLE_OPERATORS:
          validationCode = ValidationErrorCode.MALFORMED_RANGE_MULTIPLE_OPERATORS;
          break;
        case RangeErrorCode.EMPTY_BASE_REF:
        case RangeErrorCode.EMPTY_HEAD_REF:
          validationCode = ValidationErrorCode.MALFORMED_RANGE_EMPTY_REF;
          break;
        case RangeErrorCode.MISSING_REFS:
          validationCode = ValidationErrorCode.MALFORMED_RANGE_MISSING_REFS;
          break;
        default:
          validationCode = ValidationErrorCode.INVALID_INPUT;
      }

      return Err(
        new ValidationError(rangeResult.error.message, validationCode, {
          field: 'range',
          value: raw.range,
          constraint: rangeResult.error.code,
        })
      );
    }
  }

  // Determine staged and uncommitted values
  const staged = raw.staged ?? false;
  // Default uncommitted behavior:
  // - When --base or --range specified: default to false (commit comparison mode)
  // - When --staged specified: default to false (staged changes only)
  // - Otherwise: default to true (working tree changes)
  const hasExplicitRef =
    raw.base !== undefined ||
    raw.range !== undefined ||
    (raw.head !== undefined && raw.head !== 'HEAD');
  const uncommitted = raw.uncommitted ?? (hasExplicitRef || staged ? false : true);

  // Check if nothing to review:
  // - Need at least one of: staged, uncommitted, or explicit ref (base/range)
  if (!staged && !uncommitted && !hasExplicitRef) {
    return Err(
      new ValidationError(
        'Nothing to review. Specify --staged, --uncommitted, or --base/--range.',
        ValidationErrorCode.INVALID_INPUT,
        { field: 'staged/uncommitted', value: { staged, uncommitted } }
      )
    );
  }

  // Handle --no-color (Commander sets color=false for --no-color)
  const noColor = raw.noColor ?? raw.color === false;

  const options: LocalReviewOptions = {
    path: raw.path ?? '.',
    base: raw.range ? undefined : raw.base,
    head: raw.range ? undefined : (raw.head ?? 'HEAD'),
    range: raw.range,
    staged,
    uncommitted,
    pass: raw.pass,
    agent: raw.agent,
    format,
    noColor,
    quiet: raw.quiet ?? false,
    verbose: raw.verbose ?? false,
    dryRun: raw.dryRun ?? false,
    costOnly: raw.costOnly ?? false,
    config: raw.config,
  };

  return Ok({ options, warnings });
}

/**
 * Apply defaults based on git context.
 *
 * @param options - Parsed options
 * @param gitContext - Inferred git context
 * @returns Options with defaults applied
 */
export function applyOptionDefaults(
  options: LocalReviewOptions,
  gitContext: GitContext
): LocalReviewOptions {
  // If no base specified and no range, use detected default branch
  if (!options.base && !options.range) {
    return {
      ...options,
      base: gitContext.defaultBase,
    };
  }

  return options;
}

/**
 * Resolve output format based on options and TTY detection.
 *
 * @param options - Parsed options
 * @param isTTY - Whether stdout is a TTY
 * @returns Resolved output format
 */
export function resolveOutputFormat(options: LocalReviewOptions, isTTY: boolean): OutputFormat {
  // If format explicitly specified, use it
  if (options.format !== 'pretty') {
    return options.format;
  }

  // For non-TTY, default to JSON for piping
  if (!isTTY && !process.env['FORCE_PRETTY']) {
    return 'json';
  }

  return 'pretty';
}

/**
 * Resolve the base reference for diff generation.
 *
 * @internal This function is not part of the public API. Use {@link resolveDiffRange} instead.
 * @deprecated Use {@link resolveDiffRange} which returns the full range (base, head, operator).
 *
 * @param options - Parsed options
 * @param gitContext - Inferred git context
 * @returns Resolved base reference
 */
export function resolveBaseRef(options: LocalReviewOptions, gitContext: GitContext): string {
  // If range specified, parse it
  if (options.range) {
    // Range format: START..END or START...END
    const rangeMatch = options.range.match(/^(.+?)(\.\.\.?)(.*)$/);
    if (rangeMatch?.[1]) {
      return rangeMatch[1];
    }
    // Single ref (e.g., HEAD~3..) - return the starting point
    return options.range.replace(/\.\.\.?$/, '');
  }

  // Use explicit base or detected default
  return options.base ?? gitContext.defaultBase;
}

/**
 * Resolve base/head references and range operator for diff generation.
 *
 * @param options - Parsed options
 * @param gitContext - Inferred git context
 * @returns Resolved diff range
 */
export function resolveDiffRange(
  options: LocalReviewOptions,
  gitContext: GitContext
): ResolvedDiffRange {
  if (options.range) {
    const rangeMatch = options.range.match(/^(.*?)(\.\.\.?)(.*)$/);
    if (rangeMatch) {
      const baseRef = rangeMatch[1]?.trim() || 'HEAD';
      const rangeOperator = (rangeMatch[2] === '...' ? '...' : '..') as RangeOperator;
      const headRef = rangeMatch[3]?.trim() || 'HEAD';
      return { baseRef, headRef, rangeOperator };
    }
    return { baseRef: options.range, headRef: 'HEAD', rangeOperator: '...' };
  }

  // Default to three-dot ('...') which compares against merge-base,
  // showing only changes introduced on the head branch.
  return {
    baseRef: options.base ?? gitContext.defaultBase,
    headRef: options.head ?? 'HEAD',
    rangeOperator: '...',
  };
}

// =============================================================================
// Range String Parsing (T024)
// =============================================================================

/**
 * Parse a range string into its components.
 *
 * Algorithm (per research.md):
 * 1. Count occurrences of '...' in input
 * 2. Count occurrences of '..' in input (subtract 3-dot count to avoid double-counting)
 * 3. If total operators > 1: REJECT "multiple operators"
 * 4. If '...' found: split on first '...'
 * 5. Else if '..' found: split on first '..'
 * 6. Else: single ref (base only, head defaults to HEAD)
 * 7. Trim both parts; reject if either is empty
 *
 * @param input - Range string (e.g., "main...HEAD", "HEAD~3..", "main..feature")
 * @returns RangeParseResult with parsed range or validation error
 *
 * @example
 * ```typescript
 * parseRangeString("main...HEAD")  // { ok: true, value: { baseRef: "main", headRef: "HEAD", operator: "..." } }
 * parseRangeString("a..b..c")      // { ok: false, error: { code: "MULTIPLE_OPERATORS", ... } }
 * parseRangeString("..")           // { ok: false, error: { code: "MISSING_REFS", ... } }
 * ```
 */
export function parseRangeString(input: string): RangeParseResult {
  const trimmed = input.trim();

  // Count operators: check '...' first to avoid partial match with '..'
  // Use regex to count non-overlapping occurrences
  const threeDotMatches = trimmed.match(/\.\.\./g);
  const threeDotCount = threeDotMatches ? threeDotMatches.length : 0;

  // For two-dot count, we need to exclude three-dot sequences
  // Replace '...' with placeholder, then count '..'
  const withoutThreeDot = trimmed.replace(/\.\.\./g, '\x00');
  const twoDotMatches = withoutThreeDot.match(/\.\./g);
  const twoDotCount = twoDotMatches ? twoDotMatches.length : 0;

  const totalOperators = threeDotCount + twoDotCount;

  // Reject multiple operators
  if (totalOperators > 1) {
    return {
      ok: false,
      error: {
        code: RangeErrorCode.MULTIPLE_OPERATORS,
        message: `Invalid range format: multiple operators found in '${input}'. Use 'base..head' or 'base...head'.`,
        input,
      },
    };
  }

  // Determine operator and split
  let operator: RangeOperator;
  let parts: string[];

  if (threeDotCount === 1) {
    operator = '...';
    // Split on first '...' only
    const idx = trimmed.indexOf('...');
    parts = [trimmed.slice(0, idx), trimmed.slice(idx + 3)];
  } else if (twoDotCount === 1) {
    operator = '..';
    // Split on first '..' only
    const idx = trimmed.indexOf('..');
    parts = [trimmed.slice(0, idx), trimmed.slice(idx + 2)];
  } else {
    // No operator - single ref (base only)
    if (!trimmed) {
      return {
        ok: false,
        error: {
          code: RangeErrorCode.MISSING_REFS,
          message: `Invalid range format: empty input. Provide a base reference.`,
          input,
        },
      };
    }
    return {
      ok: true,
      value: { baseRef: trimmed, headRef: undefined, operator: '...' },
    };
  }

  const baseRef = parts[0]?.trim() ?? '';
  const headRef = parts[1]?.trim() ?? '';

  // Validate non-empty refs - both empty = MISSING_REFS
  if (!baseRef && !headRef) {
    return {
      ok: false,
      error: {
        code: RangeErrorCode.MISSING_REFS,
        message: `Invalid range format: '${input}' requires at least one reference.`,
        input,
      },
    };
  }

  // Empty base ref (but head is present) = EMPTY_BASE_REF
  if (!baseRef) {
    return {
      ok: false,
      error: {
        code: RangeErrorCode.EMPTY_BASE_REF,
        message: `Invalid range format: empty base reference in '${input}'.`,
        input,
      },
    };
  }

  // Return successful parse (empty headRef becomes undefined, defaults to HEAD later)
  return {
    ok: true,
    value: {
      baseRef,
      headRef: headRef || undefined,
      operator,
    },
  };
}
