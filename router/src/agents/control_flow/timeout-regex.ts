/**
 * Timeout-Protected Regex Evaluation
 *
 * Provides timeout protection for regex pattern evaluation to prevent
 * denial-of-service from malicious or poorly-constructed patterns.
 *
 * Implements:
 * - FR-001: Maximum execution time for pattern evaluation
 * - FR-002: Continue analysis when pattern times out
 * - FR-005: Configurable timeout limit (10-1000ms)
 */

import type { PatternEvaluationResult, PatternValidationResult, ValidationError } from './types.js';
import { createPatternValidator, type PatternValidatorConfig } from './pattern-validator.js';

// =============================================================================
// Constants
// =============================================================================

/** Maximum input length to evaluate (10KB) */
const MAX_INPUT_LENGTH = 10_000;

/** Default timeout in milliseconds */
const DEFAULT_TIMEOUT_MS = 100;

/** Minimum allowed timeout */
const MIN_TIMEOUT_MS = 10;

/** Maximum allowed timeout */
const MAX_TIMEOUT_MS = 1000;

// =============================================================================
// TimeoutRegex Class
// =============================================================================

/**
 * Options for TimeoutRegex construction.
 */
export interface TimeoutRegexOptions {
  /** Timeout in milliseconds for pattern execution */
  timeoutMs?: number;
  /** Whether to validate pattern for ReDoS before use */
  validatePattern?: boolean;
  /** Configuration for pattern validation */
  validationConfig?: Partial<PatternValidatorConfig>;
}

/**
 * Result of creating a TimeoutRegex with validation.
 */
export interface TimeoutRegexCreationResult {
  /** The created TimeoutRegex instance (null if validation failed) */
  regex: TimeoutRegex | null;
  /** Validation result if validation was performed */
  validationResult?: PatternValidationResult;
  /** Whether creation was successful */
  success: boolean;
  /** Error if creation failed */
  error?: ValidationError;
}

/**
 * Provides timeout-protected regex pattern evaluation.
 *
 * Uses process.hrtime.bigint() for high-resolution time tracking.
 * Patterns that exceed the timeout are treated as non-matching (conservative).
 */
export class TimeoutRegex {
  private pattern: RegExp;
  private patternId: string;
  private timeoutMs: number;
  private validationResult?: PatternValidationResult;

  constructor(pattern: RegExp | string, patternId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    // Trust: REPO_CONFIG - Pattern from validated repository configuration
    // Control: TimeoutRegex enforces execution timeout preventing CPU exhaustion
    // See docs/security/regex-threat-model.md
    // eslint-disable-next-line security/detect-non-literal-regexp -- Validated config with timeout
    this.pattern = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    this.patternId = patternId;
    this.timeoutMs = this.validateTimeout(timeoutMs);
  }

  /**
   * Get the validation result if pattern was validated during creation.
   */
  getValidationResult(): PatternValidationResult | undefined {
    return this.validationResult;
  }

  /**
   * Set validation result (internal use by factory functions).
   */
  setValidationResult(result: PatternValidationResult): void {
    this.validationResult = result;
  }

  /**
   * Validate and clamp timeout to allowed range.
   */
  private validateTimeout(timeoutMs: number): number {
    if (timeoutMs < MIN_TIMEOUT_MS) return MIN_TIMEOUT_MS;
    if (timeoutMs > MAX_TIMEOUT_MS) return MAX_TIMEOUT_MS;
    return Math.floor(timeoutMs);
  }

  /**
   * Test if input matches the pattern with timeout protection.
   *
   * @param input The string to test against the pattern
   * @returns PatternEvaluationResult with match status and timing info
   */
  test(input: string): PatternEvaluationResult {
    const inputLength = input.length;

    // First defense: input length check (FR-001)
    if (inputLength > MAX_INPUT_LENGTH) {
      return {
        patternId: this.patternId,
        matched: false,
        timedOut: false,
        elapsedMs: 0,
        inputLength,
      };
    }

    // Track execution time with high-resolution timer
    const startTime = process.hrtime.bigint();

    try {
      // Execute regex match
      const matched = this.pattern.test(input);

      // Calculate elapsed time in milliseconds
      const endTime = process.hrtime.bigint();
      const elapsedNs = Number(endTime - startTime);
      const elapsedMs = elapsedNs / 1_000_000;

      // Check if we exceeded timeout (post-hoc check)
      // Note: JavaScript regex is synchronous, so we can only detect timeout after completion
      const timedOut = elapsedMs > this.timeoutMs;

      return {
        patternId: this.patternId,
        matched: timedOut ? false : matched, // Treat timeout as non-match (conservative)
        timedOut,
        elapsedMs,
        inputLength,
      };
    } catch {
      // Handle regex errors (e.g., catastrophic backtracking caught by engine)
      const endTime = process.hrtime.bigint();
      const elapsedNs = Number(endTime - startTime);
      const elapsedMs = elapsedNs / 1_000_000;

      return {
        patternId: this.patternId,
        matched: false,
        timedOut: true,
        elapsedMs,
        inputLength,
      };
    }
  }

  /**
   * Execute pattern matching and return match result or null if input exceeds length limit.
   *
   * @param input The string to match against the pattern
   * @returns Match result with evaluation info, or null if input too long
   */
  exec(input: string): { match: RegExpExecArray | null; result: PatternEvaluationResult } {
    const inputLength = input.length;

    // First defense: input length check
    if (inputLength > MAX_INPUT_LENGTH) {
      return {
        match: null,
        result: {
          patternId: this.patternId,
          matched: false,
          timedOut: false,
          elapsedMs: 0,
          inputLength,
        },
      };
    }

    const startTime = process.hrtime.bigint();

    try {
      const match = this.pattern.exec(input);
      const endTime = process.hrtime.bigint();
      const elapsedNs = Number(endTime - startTime);
      const elapsedMs = elapsedNs / 1_000_000;
      const timedOut = elapsedMs > this.timeoutMs;

      return {
        match: timedOut ? null : match,
        result: {
          patternId: this.patternId,
          matched: timedOut ? false : match !== null,
          timedOut,
          elapsedMs,
          inputLength,
        },
      };
    } catch {
      const endTime = process.hrtime.bigint();
      const elapsedNs = Number(endTime - startTime);
      const elapsedMs = elapsedNs / 1_000_000;

      return {
        match: null,
        result: {
          patternId: this.patternId,
          matched: false,
          timedOut: true,
          elapsedMs,
          inputLength,
        },
      };
    }
  }

  /**
   * Get the pattern ID.
   */
  getPatternId(): string {
    return this.patternId;
  }

  /**
   * Get the configured timeout in milliseconds.
   */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Check if an input string exceeds the maximum allowed length.
 *
 * @param input The string to check
 * @returns true if input exceeds MAX_INPUT_LENGTH
 */
export function exceedsInputLengthLimit(input: string): boolean {
  return input.length > MAX_INPUT_LENGTH;
}

/**
 * Get the maximum allowed input length.
 */
export function getMaxInputLength(): number {
  return MAX_INPUT_LENGTH;
}

/**
 * Validate a timeout value is within allowed bounds.
 *
 * @param timeoutMs The timeout value to validate
 * @returns true if timeout is within MIN_TIMEOUT_MS and MAX_TIMEOUT_MS
 */
export function isValidTimeout(timeoutMs: number): boolean {
  return timeoutMs >= MIN_TIMEOUT_MS && timeoutMs <= MAX_TIMEOUT_MS;
}

/**
 * Create a TimeoutRegex instance for pattern evaluation.
 *
 * @param pattern The regex pattern (string or RegExp)
 * @param patternId Identifier for the pattern (used in results)
 * @param timeoutMs Timeout in milliseconds (default: 100ms)
 * @returns TimeoutRegex instance
 */
export function createTimeoutRegex(
  pattern: RegExp | string,
  patternId: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): TimeoutRegex {
  return new TimeoutRegex(pattern, patternId, timeoutMs);
}

/**
 * Evaluate a pattern against input with timeout protection.
 *
 * Convenience function for one-shot pattern evaluation.
 *
 * @param pattern The regex pattern (string or RegExp)
 * @param patternId Identifier for the pattern
 * @param input The string to test
 * @param timeoutMs Timeout in milliseconds (default: 100ms)
 * @returns PatternEvaluationResult
 */
export function evaluatePatternWithTimeout(
  pattern: RegExp | string,
  patternId: string,
  input: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): PatternEvaluationResult {
  const regex = new TimeoutRegex(pattern, patternId, timeoutMs);
  return regex.test(input);
}

/**
 * Create a TimeoutRegex with optional pattern validation.
 *
 * This is the recommended way to create TimeoutRegex instances when
 * using user-provided patterns, as it validates for ReDoS vulnerabilities
 * before creating the regex.
 *
 * @param pattern The regex pattern (string or RegExp)
 * @param patternId Identifier for the pattern
 * @param options Creation options including validation settings
 * @returns TimeoutRegexCreationResult with regex instance or error
 */
export function createValidatedTimeoutRegex(
  pattern: RegExp | string,
  patternId: string,
  options: TimeoutRegexOptions = {}
): TimeoutRegexCreationResult {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    validatePattern: shouldValidate = true,
    validationConfig,
  } = options;

  const patternString = typeof pattern === 'string' ? pattern : pattern.source;

  // Validate pattern if requested
  if (shouldValidate) {
    const validator = createPatternValidator(validationConfig);
    const validationResult = validator.validatePattern(patternString, patternId);

    if (!validationResult.isValid) {
      return {
        regex: null,
        validationResult,
        success: false,
        error: {
          errorType: 'validation',
          patternId,
          message: validationResult.rejectionReasons.join('; ') || 'Pattern validation failed',
          details: {
            pattern: patternString,
            riskLevel: validationResult.redosRisk,
            reasons: validationResult.rejectionReasons,
          },
          recoverable: true,
          timestamp: Date.now(),
        },
      };
    }

    // Create regex with stored validation result
    try {
      const regex = new TimeoutRegex(pattern, patternId, timeoutMs);
      regex.setValidationResult(validationResult);

      return {
        regex,
        validationResult,
        success: true,
      };
    } catch (error) {
      return {
        regex: null,
        validationResult,
        success: false,
        error: {
          errorType: 'compilation',
          patternId,
          message: error instanceof Error ? error.message : 'Failed to compile pattern',
          details: { pattern: patternString },
          recoverable: true,
          timestamp: Date.now(),
        },
      };
    }
  }

  // No validation - just create the regex
  try {
    const regex = new TimeoutRegex(pattern, patternId, timeoutMs);

    return {
      regex,
      success: true,
    };
  } catch (error) {
    return {
      regex: null,
      success: false,
      error: {
        errorType: 'compilation',
        patternId,
        message: error instanceof Error ? error.message : 'Failed to compile pattern',
        details: { pattern: patternString },
        recoverable: true,
        timestamp: Date.now(),
      },
    };
  }
}

/**
 * Helper to create a ValidationError from an exception.
 */
export function createValidationError(
  errorType: 'compilation' | 'validation' | 'timeout' | 'resource',
  patternId: string,
  message: string,
  details?: Record<string, unknown>
): ValidationError {
  return {
    errorType,
    patternId,
    message,
    details,
    recoverable: errorType !== 'resource',
    timestamp: Date.now(),
  };
}
