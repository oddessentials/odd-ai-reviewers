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
    warnings.push('Both --range and --base/--head specified; using --range');
  }

  // Determine staged and uncommitted values
  const staged = raw.staged ?? false;
  // Default uncommitted to true unless explicitly set to false
  const uncommitted = raw.uncommitted ?? true;

  // Check if nothing to review
  if (!staged && !uncommitted) {
    return Err(
      new ValidationError(
        'Nothing to review. Specify --staged or --uncommitted.',
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
