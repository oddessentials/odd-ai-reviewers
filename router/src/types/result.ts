/**
 * Result Type for Type-Safe Error Handling
 *
 * This module provides:
 * - Result<T, E>: Discriminated union for success/failure
 * - Ok/Err constructors
 * - Type guards (isOk, isErr)
 * - Utility functions (map, flatMap, match, collect, partition)
 * - wrapThrowing/wrapThrowingAsync for backward compatibility
 *
 * Use Result for internal operations to enforce compile-time error handling.
 * Use wrapThrowing for public APIs that need to maintain backward compatibility.
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
 * Success result variant interface
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Failure result variant interface
 */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

// =============================================================================
// Result Constructors
// =============================================================================

/**
 * Create a success result
 *
 * Uses `const` type parameter (TypeScript 5.0+) to preserve literal types.
 *
 * @param value - The success value
 * @returns A Result with ok: true and the value
 *
 * @example
 * ```typescript
 * const result = Ok(42);
 * // result: Result<42, never> (literal type preserved)
 * ```
 */
export function Ok<const T>(value: T): Result<T, never> {
  return { ok: true, value } as const;
}

/**
 * Create a failure result
 *
 * Uses `const` type parameter (TypeScript 5.0+) to preserve literal types.
 *
 * @param error - The error value
 * @returns A Result with ok: false and the error
 *
 * @example
 * ```typescript
 * const result = Err(new ValidationError('invalid', ...));
 * // result: Result<never, ValidationError>
 * ```
 */
export function Err<const E>(error: E): Result<never, E> {
  return { ok: false, error } as const;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for success results
 *
 * @example
 * ```typescript
 * const result = loadConfig(path);
 * if (isOk(result)) {
 *   // TypeScript knows result.value exists here
 *   console.log(result.value);
 * }
 * ```
 */
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok === true;
}

/**
 * Type guard for failure results
 *
 * @example
 * ```typescript
 * const result = loadConfig(path);
 * if (isErr(result)) {
 *   // TypeScript knows result.error exists here
 *   console.error(result.error);
 * }
 * ```
 */
export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.ok === false;
}

// =============================================================================
// Result Utilities
// =============================================================================

/**
 * Unwrap a result, throwing if it's an error
 *
 * @param result - The result to unwrap
 * @returns The success value
 * @throws The error value if result is Err
 *
 * @example
 * ```typescript
 * const config = unwrap(loadConfig(path)); // throws if Err
 * ```
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
}

/**
 * Unwrap a result with a default value for errors
 *
 * @param result - The result to unwrap
 * @param defaultValue - Value to return if result is Err
 * @returns The success value or default value
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  return isOk(result) ? result.value : defaultValue;
}

/**
 * Unwrap a result with a lazy default for errors
 *
 * @param result - The result to unwrap
 * @param defaultFn - Function to compute default value from error
 * @returns The success value or computed default
 */
export function unwrapOrElse<T, E>(result: Result<T, E>, defaultFn: (error: E) => T): T {
  return isOk(result) ? result.value : defaultFn(result.error);
}

/**
 * Map the success value
 *
 * @param result - The result to map
 * @param fn - Function to apply to success value
 * @returns New Result with mapped value
 *
 * @example
 * ```typescript
 * const result = map(Ok(5), x => x * 2); // Ok(10)
 * ```
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return isOk(result) ? Ok(fn(result.value)) : result;
}

/**
 * Map the error value
 *
 * @param result - The result to map
 * @param fn - Function to apply to error value
 * @returns New Result with mapped error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return isErr(result) ? Err(fn(result.error)) : result;
}

/**
 * FlatMap (chain) the success value
 *
 * @param result - The result to flatMap
 * @param fn - Function that returns a new Result
 * @returns The new Result from fn, or the original error
 *
 * @example
 * ```typescript
 * const result = flatMap(loadConfig(path), config =>
 *   validateConfig(config)
 * );
 * ```
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  return isOk(result) ? fn(result.value) : result;
}

/**
 * Pattern match on result variants
 *
 * @param result - The result to match
 * @param handlers - Object with ok and err handler functions
 * @returns The result of the matching handler
 *
 * @example
 * ```typescript
 * const message = match(result, {
 *   ok: value => `Success: ${value}`,
 *   err: error => `Error: ${error.message}`,
 * });
 * ```
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
 *
 * @param promise - The promise to wrap
 * @param mapError - Optional function to map caught errors
 * @returns Promise of Result
 *
 * @example
 * ```typescript
 * const result = await fromPromise(
 *   fetch('/api/data'),
 *   err => new NetworkError('fetch failed', NetworkErrorCode.CONNECTION_FAILED, {}, { cause: err })
 * );
 * ```
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
 *
 * @param result - The result to convert
 * @returns Promise that resolves with value or rejects with error
 */
export function toPromise<T, E>(result: Result<T, E>): Promise<T> {
  return isOk(result) ? Promise.resolve(result.value) : Promise.reject(result.error);
}

/**
 * Async version of map
 */
export async function mapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<U>
): Promise<Result<U, E>> {
  if (isOk(result)) {
    try {
      const value = await fn(result.value);
      return Ok(value);
    } catch {
      // If fn throws, we can't convert to E, so we return the original result
      // This should be used with fromPromise instead for proper error handling
      throw new Error('mapAsync fn threw - use fromPromise for proper error handling');
    }
  }
  return result;
}

/**
 * Async version of flatMap
 */
export async function flatMapAsync<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Promise<Result<U, E>>
): Promise<Result<U, E>> {
  return isOk(result) ? fn(result.value) : result;
}

// =============================================================================
// Collection Utilities
// =============================================================================

/**
 * Collect an array of Results into a Result of array
 *
 * Returns Err with first error if any result is Err.
 * Use partition() if you want to collect all successes and failures.
 *
 * @param results - Array of Results to collect
 * @returns Result containing all values or first error
 *
 * @example
 * ```typescript
 * const results = files.map(f => validateFile(f));
 * const allOrNone = collect(results);
 * if (isOk(allOrNone)) {
 *   // allOrNone.value is all validated files
 * }
 * ```
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
 *
 * Unlike collect(), this continues processing all results.
 *
 * @param results - Array of Results to partition
 * @returns Object with ok array (values) and err array (errors)
 *
 * @example
 * ```typescript
 * const { ok: successes, err: failures } = partition(results);
 * console.log(`${successes.length} succeeded, ${failures.length} failed`);
 * ```
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
 *
 * @param successSchema - Zod schema for success value
 * @param errorSchema - Zod schema for error value
 * @returns Zod schema for Result type
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
 *
 * Use this to maintain backward compatibility for public APIs that
 * previously threw errors but now use Result internally.
 *
 * @param fn - Function that returns Result
 * @returns Function that throws on error, returns value on success
 *
 * @example
 * ```typescript
 * // Internal function uses Result
 * function loadConfigInternal(path: string): Result<Config, ConfigError> {
 *   // ... returns Ok(config) or Err(error)
 * }
 *
 * // Public API throws (backward compatible)
 * export const loadConfig = wrapThrowing(loadConfigInternal);
 * // loadConfig throws ConfigError on failure
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
 *
 * @param fn - Async function that returns Promise<Result>
 * @returns Async function that throws on error, returns value on success
 *
 * @example
 * ```typescript
 * // Internal function uses Result
 * async function fetchDataInternal(url: string): Promise<Result<Data, NetworkError>> {
 *   // ... returns Ok(data) or Err(error)
 * }
 *
 * // Public API throws (backward compatible)
 * export const fetchData = wrapThrowingAsync(fetchDataInternal);
 * ```
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

/**
 * Convert a throwing function to one that returns Result
 *
 * @param fn - Function that may throw
 * @param mapError - Function to convert caught errors
 * @returns Function that returns Result
 *
 * @example
 * ```typescript
 * const safeParseJSON = tryCatch(
 *   JSON.parse,
 *   err => new ValidationError('Invalid JSON', ...)
 * );
 * const result = safeParseJSON(input); // Result<unknown, ValidationError>
 * ```
 */
export function tryCatch<Args extends unknown[], T, E>(
  fn: (...args: Args) => T,
  mapError: (error: unknown) => E
): (...args: Args) => Result<T, E> {
  return (...args: Args): Result<T, E> => {
    try {
      return Ok(fn(...args));
    } catch (error) {
      return Err(mapError(error));
    }
  };
}

/**
 * Async version of tryCatch
 */
export function tryCatchAsync<Args extends unknown[], T, E>(
  fn: (...args: Args) => Promise<T>,
  mapError: (error: unknown) => E
): (...args: Args) => Promise<Result<T, E>> {
  return async (...args: Args): Promise<Result<T, E>> => {
    try {
      return Ok(await fn(...args));
    } catch (error) {
      return Err(mapError(error));
    }
  };
}
