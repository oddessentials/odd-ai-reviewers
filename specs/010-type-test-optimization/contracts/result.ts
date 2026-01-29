/**
 * Result Type Contract
 * Feature: 010-type-test-optimization
 *
 * This file defines the Result<T, E> discriminated union type contract.
 * Implementation must conform to these interfaces.
 */

import { z } from 'zod';

// =============================================================================
// Result Type Definition
// =============================================================================

/**
 * Result type representing either success (Ok) or failure (Err)
 * Uses discriminated union with 'ok' boolean for type narrowing
 */
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/**
 * Success result variant
 */
export type Ok<T> = { readonly ok: true; readonly value: T };

/**
 * Failure result variant
 */
export type Err<E> = { readonly ok: false; readonly error: E };

// =============================================================================
// Result Constructors
// =============================================================================

/**
 * Create a success result
 * @param value The success value
 */
export function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value } as const;
}

/**
 * Create a failure result
 * @param error The error value
 */
export function Err<E>(error: E): Result<never, E> {
  return { ok: false, error } as const;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for success results
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Type guard for failure results
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

// =============================================================================
// Result Utilities
// =============================================================================

/**
 * Unwrap a result, throwing if it's an error
 * @throws The error value if result is Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Map the success value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? Ok(fn(result.value)) : result;
}

/**
 * Map the error value
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? Err(fn(result.error)) : result;
}

/**
 * FlatMap (chain) the success value
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Match on result variants (pattern matching)
 */
export function match<T, E, U>(
  result: Result<T, E>,
  handlers: {
    ok: (value: T) => U;
    err: (error: E) => U;
  }
): U {
  return isOk(result) ? handlers.ok(result.value) : handlers.err(result.error);
}

// =============================================================================
// Async Result Utilities
// =============================================================================

/**
 * Wrap a promise that may throw into a Result
 */
export async function fromPromise<T, E = Error>(
  promise: Promise<T>,
  mapError?: (error: unknown) => E
): Promise<Result<T, E>> {
  try {
    const value = await promise;
    return Ok(value);
  } catch (error) {
    return Err(mapError ? mapError(error) : (error as E));
  }
}

/**
 * Convert a Result to a Promise
 */
export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
  return isOk(result) ? Promise.resolve(result.value) : Promise.reject(result.error);
}

// =============================================================================
// Collection Utilities
// =============================================================================

/**
 * Collect an array of Results into a Result of array
 * Returns Err with first error if any result is Err
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return Ok(values);
}

/**
 * Partition an array of Results into successes and failures
 */
export function partition<T, E>(results: Result<T, E>[]): { ok: T[]; err: E[] } {
  const ok: T[] = [];
  const err: E[] = [];
  for (const result of results) {
    if (isOk(result)) {
      ok.push(result.value);
    } else {
      err.push(result.error);
    }
  }
  return { ok, err };
}

// =============================================================================
// Zod Schema Factory
// =============================================================================

/**
 * Create a Zod schema for Result<T, E>
 */
export function ResultSchema<T extends z.ZodTypeAny, E extends z.ZodTypeAny>(
  successSchema: T,
  errorSchema: E
) {
  return z.discriminatedUnion('ok', [
    z.object({
      ok: z.literal(true),
      value: successSchema,
    }),
    z.object({
      ok: z.literal(false),
      error: errorSchema,
    }),
  ]);
}

// =============================================================================
// Backward Compatibility Wrapper Factory
// =============================================================================

/**
 * Create a throwing wrapper for a function that returns Result
 * Use this to maintain backward compatibility for public APIs
 *
 * @example
 * ```typescript
 * // Internal function uses Result
 * function parseConfigInternal(input: string): Result<Config, ConfigError> { ... }
 *
 * // Public API throws (backward compatible)
 * export const parseConfig = wrapThrowing(parseConfigInternal);
 * ```
 */
export function wrapThrowing<Args extends unknown[], T, E extends Error>(
  fn: (...args: Args) => Result<T, E>
): (...args: Args) => T {
  return (...args: Args): T => {
    const result = fn(...args);
    if (isOk(result)) {
      return result.value;
    }
    throw result.error;
  };
}

/**
 * Async version of wrapThrowing
 */
export function wrapThrowingAsync<Args extends unknown[], T, E extends Error>(
  fn: (...args: Args) => Promise<Result<T, E>>
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    const result = await fn(...args);
    if (isOk(result)) {
      return result.value;
    }
    throw result.error;
  };
}
