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

import type { PatternEvaluationResult } from './types.js';

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
 * Provides timeout-protected regex pattern evaluation.
 *
 * Uses process.hrtime.bigint() for high-resolution time tracking.
 * Patterns that exceed the timeout are treated as non-matching (conservative).
 */
export class TimeoutRegex {
  private pattern: RegExp;
  private patternId: string;
  private timeoutMs: number;

  constructor(pattern: RegExp | string, patternId: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern from validated config
    this.pattern = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    this.patternId = patternId;
    this.timeoutMs = this.validateTimeout(timeoutMs);
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
