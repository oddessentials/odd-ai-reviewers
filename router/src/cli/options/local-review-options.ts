/**
 * Local Review Options Module
 *
 * Command-line options specific to local review mode with parsing and validation.
 *
 * @module cli/options/local-review-options
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Output format for terminal reporter
 */
export type OutputFormat = 'pretty' | 'json' | 'sarif';

/**
 * Command-line options for local review mode.
 * Parsed and validated from raw CLI input.
 */
export interface LocalReviewOptions {
  /** Directory to review (default: ".") */
  readonly path: string;
  /** Base reference for comparison (auto-detected if not specified) */
  readonly base?: string;
  /** Head reference (default: "HEAD") */
  readonly head: string;
  /** Git range (e.g., HEAD~3..) - mutually exclusive with base/head */
  readonly range?: string;
  /** Review only staged changes */
  readonly staged: boolean;
  /** Include uncommitted changes (default: true) */
  readonly uncommitted: boolean;
  /** Run specific pass only */
  readonly pass?: string;
  /** Run specific agent only */
  readonly agent?: string;
  /** Output format */
  readonly format: OutputFormat;
  /** Disable colored output */
  readonly noColor: boolean;
  /** Minimal output (errors only) */
  readonly quiet: boolean;
  /** Show debug information */
  readonly verbose: boolean;
  /** Show what would be reviewed without executing */
  readonly dryRun: boolean;
  /** Estimate cost only without executing agents */
  readonly costOnly: boolean;
  /** Config file path */
  readonly config?: string;
}

/**
 * Raw CLI options before parsing and validation
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
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  costOnly?: boolean;
  config?: string;
}

/**
 * Validation error for CLI options
 */
export interface OptionsValidationError {
  readonly code: 'MUTUALLY_EXCLUSIVE' | 'INVALID_FORMAT' | 'NOTHING_TO_REVIEW' | 'INVALID_PATH';
  readonly message: string;
  readonly field?: string;
}

// =============================================================================
// Implementation (Phase 6)
// =============================================================================

// Placeholder exports - implementations added in Phase 6
import type { Result } from '../../types/result.js';
import type { GitContext } from '../git-context.js';

export const parseLocalReviewOptions = undefined as unknown as (
  raw: RawLocalReviewOptions
) => Result<LocalReviewOptions, OptionsValidationError>;

export const applyOptionDefaults = undefined as unknown as (
  options: Partial<LocalReviewOptions>,
  gitContext: GitContext
) => LocalReviewOptions;

export const resolveOutputFormat = undefined as unknown as (
  options: Partial<LocalReviewOptions>
) => OutputFormat;

export const resolveBaseRef = undefined as unknown as (
  options: Partial<LocalReviewOptions>,
  gitContext: GitContext
) => string;
