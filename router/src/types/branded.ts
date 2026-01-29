/**
 * Branded Type Utilities
 *
 * This module provides:
 * - Brand<T, B>: Generic branded type pattern
 * - BrandHelpers interface: Standard helpers for working with branded types
 * - createBrandHelpers: Factory for creating brand helpers
 * - Predefined branded types: SafeGitRef, ValidatedConfig, CanonicalPath
 *
 * Branded types provide compile-time guarantees that data has been validated.
 * Once you have a branded value, you never need to re-validate it.
 *
 * IMPORTANT: Direct casting (e.g., `value as SafeGitRef`) is FORBIDDEN.
 * Always use the helpers: parse() for validation, brand() internally only.
 */

import { z } from 'zod';
import { type Result, Ok, Err, isOk } from './result.js';
import { ValidationError, ValidationErrorCode } from './errors.js';

// =============================================================================
// Brand Symbol (Compile-Time Only)
// =============================================================================

/**
 * Unique symbol for type branding
 * This symbol exists only at compile time - no runtime overhead
 */
declare const __brand: unique symbol;

/**
 * Brand type that adds a compile-time brand to a base type
 * The brand is not present at runtime - purely for type checking
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// =============================================================================
// Brand Helpers Interface
// =============================================================================

/**
 * Helper functions for working with a branded type
 * Every branded type must have these helpers
 */
export interface BrandHelpers<T, B extends string> {
  /**
   * Parse and validate unknown input, returning branded type on success
   * This is the primary way to create branded values from external input
   */
  parse(value: unknown): Result<Brand<T, B>, ValidationError>;

  /**
   * Brand a pre-validated value (INTERNAL USE ONLY)
   * Caller must guarantee value is valid - no validation performed
   * Direct casting (as Brand<T, B>) is forbidden outside this function
   */
  brand(value: T): Brand<T, B>;

  /**
   * Remove brand for serialization
   * Returns the underlying value without the brand
   * Use when writing to JSON, cache, or crossing process boundaries
   */
  unbrand(branded: Brand<T, B>): T;

  /**
   * Type guard to check if a value is branded
   * Note: At runtime, branded and unbranded values are identical
   * This checks if value passes validation, not if it has a brand
   */
  is(value: unknown): value is Brand<T, B>;
}

// =============================================================================
// Brand Helpers Factory
// =============================================================================

/**
 * Create brand helpers for a new branded type
 *
 * @param schema - Zod schema for validating the underlying type
 * @param brandName - The brand identifier string (used in error messages)
 * @param fieldName - The field name for error context
 * @param additionalValidation - Optional additional validation beyond schema
 *
 * @example
 * ```typescript
 * const SafeGitRefHelpers = createBrandHelpers(
 *   z.string().min(1).max(256).regex(/^[a-zA-Z0-9\-_/.]+$/),
 *   'SafeGitRef',
 *   'gitRef'
 * );
 *
 * const result = SafeGitRefHelpers.parse(userInput);
 * if (isOk(result)) {
 *   const ref: SafeGitRef = result.value;
 * }
 * ```
 */
export function createBrandHelpers<T, B extends string>(
  schema: z.ZodType<T>,
  brandName: B,
  fieldName: string,
  additionalValidation?: (value: T) => Result<T, ValidationError>
): BrandHelpers<T, B> {
  return {
    parse(value: unknown): Result<Brand<T, B>, ValidationError> {
      const parseResult = schema.safeParse(value);

      if (!parseResult.success) {
        const issues = parseResult.error.issues;
        const message = issues.map((i) => i.message).join('; ');
        return Err(
          new ValidationError(
            `Invalid ${brandName}: ${message}`,
            ValidationErrorCode.INVALID_INPUT,
            {
              field: fieldName,
              value,
              constraint: issues[0]?.code,
            }
          )
        );
      }

      // Run additional validation if provided
      if (additionalValidation) {
        const additionalResult = additionalValidation(parseResult.data);
        if (!isOk(additionalResult)) {
          return additionalResult as Result<Brand<T, B>, ValidationError>;
        }
      }

      // Brand the validated value
      return Ok(parseResult.data as Brand<T, B>);
    },

    brand(value: T): Brand<T, B> {
      // INTERNAL USE ONLY - caller must guarantee value is valid
      return value as Brand<T, B>;
    },

    unbrand(branded: Brand<T, B>): T {
      // Simply return the value - brands exist only at compile time
      return branded as T;
    },

    is(value: unknown): value is Brand<T, B> {
      // At runtime, check if value passes validation
      return schema.safeParse(value).success;
    },
  };
}

// =============================================================================
// Predefined Branded Types
// =============================================================================

/**
 * Git reference that has been validated as safe for shell execution
 * Must pass: non-empty, max 256 chars, alphanumeric + -_/. only
 */
export type SafeGitRef = Brand<string, 'SafeGitRef'>;

/** Maximum length for SafeGitRef */
const SAFE_GIT_REF_MAX_LENGTH = 256;

/** Pattern for valid SafeGitRef - alphanumeric plus common git ref characters */
const SAFE_GIT_REF_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9\-_/.]*$/;

/** Forbidden patterns that could be used for command injection */
const SAFE_GIT_REF_FORBIDDEN = [
  /\.\./, // Path traversal
  /^-/, // Leading dash (option injection)
  /[;&|`$]/, // Shell metacharacters
  /\s/, // Whitespace
];

const SafeGitRefSchema = z
  .string()
  .min(1, 'Git reference cannot be empty')
  .max(SAFE_GIT_REF_MAX_LENGTH, `Git reference cannot exceed ${SAFE_GIT_REF_MAX_LENGTH} characters`)
  .regex(SAFE_GIT_REF_PATTERN, 'Git reference contains invalid characters');

/**
 * Helpers for SafeGitRef branded type
 */
export const SafeGitRefHelpers: BrandHelpers<string, 'SafeGitRef'> & {
  readonly MAX_LENGTH: number;
  readonly PATTERN: RegExp;
} = {
  ...createBrandHelpers(SafeGitRefSchema, 'SafeGitRef', 'gitRef', (value) => {
    // Additional security validation
    for (const forbidden of SAFE_GIT_REF_FORBIDDEN) {
      if (forbidden.test(value)) {
        return Err(
          new ValidationError(
            `Git reference contains forbidden pattern: ${forbidden.source}`,
            ValidationErrorCode.INVALID_GIT_REF,
            {
              field: 'gitRef',
              value,
              constraint: 'no-forbidden-patterns',
            }
          )
        );
      }
    }
    return Ok(value);
  }),
  MAX_LENGTH: SAFE_GIT_REF_MAX_LENGTH,
  PATTERN: SAFE_GIT_REF_PATTERN,
};

// =============================================================================
// CanonicalPath
// =============================================================================

/**
 * File path that has been canonicalized (normalized, no traversal)
 */
export type CanonicalPath = Brand<string, 'CanonicalPath'>;

/** Pattern for valid path characters */
const CANONICAL_PATH_PATTERN = /^[a-zA-Z0-9_.\-/\\]+$/;

const CanonicalPathSchema = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(4096, 'Path cannot exceed 4096 characters');

/**
 * Normalize path separators to forward slashes
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * Check if path contains traversal sequences
 */
function hasTraversal(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized.includes('..') || normalized.startsWith('/') || /^[a-zA-Z]:/.test(path);
}

/**
 * Helpers for CanonicalPath branded type
 */
export const CanonicalPathHelpers: BrandHelpers<string, 'CanonicalPath'> & {
  normalize(path: string): string;
  hasTraversal(path: string): boolean;
} = {
  ...createBrandHelpers(CanonicalPathSchema, 'CanonicalPath', 'path', (value) => {
    // Normalize the path first
    const normalized = normalizePath(value);

    // Check for invalid characters
    if (!CANONICAL_PATH_PATTERN.test(normalized)) {
      return Err(
        new ValidationError('Path contains invalid characters', ValidationErrorCode.INVALID_PATH, {
          field: 'path',
          value,
          constraint: 'valid-characters',
        })
      );
    }

    // Check for traversal
    if (hasTraversal(value)) {
      return Err(
        new ValidationError('Path contains directory traversal', ValidationErrorCode.INVALID_PATH, {
          field: 'path',
          value,
          constraint: 'no-traversal',
        })
      );
    }

    return Ok(value);
  }),

  // Override parse to normalize the value before branding
  parse(value: unknown): Result<CanonicalPath, ValidationError> {
    const schemaResult = CanonicalPathSchema.safeParse(value);
    if (!schemaResult.success) {
      const issues = schemaResult.error.issues;
      return Err(
        new ValidationError(
          `Invalid path: ${issues.map((i) => i.message).join('; ')}`,
          ValidationErrorCode.INVALID_PATH,
          {
            field: 'path',
            value,
            constraint: issues[0]?.code,
          }
        )
      );
    }

    const rawPath = schemaResult.data;
    const normalized = normalizePath(rawPath);

    // Check for invalid characters
    if (!CANONICAL_PATH_PATTERN.test(normalized)) {
      return Err(
        new ValidationError('Path contains invalid characters', ValidationErrorCode.INVALID_PATH, {
          field: 'path',
          value: rawPath,
          constraint: 'valid-characters',
        })
      );
    }

    // Check for traversal
    if (hasTraversal(rawPath)) {
      return Err(
        new ValidationError('Path contains directory traversal', ValidationErrorCode.INVALID_PATH, {
          field: 'path',
          value: rawPath,
          constraint: 'no-traversal',
        })
      );
    }

    return Ok(normalized as CanonicalPath);
  },

  normalize: normalizePath,
  hasTraversal,
};

// =============================================================================
// ValidatedConfig
// =============================================================================

/**
 * Configuration that has been validated through Zod schema
 * Generic over the config type T
 */
export type ValidatedConfig<T = unknown> = Brand<T, 'ValidatedConfig'>;

/**
 * Create helpers for a ValidatedConfig branded type with a specific schema
 *
 * @param schema - Zod schema for the configuration
 * @returns Brand helpers for ValidatedConfig<T>
 *
 * @example
 * ```typescript
 * const ReviewConfigSchema = z.object({
 *   owner: z.string(),
 *   repo: z.string(),
 *   // ...
 * });
 *
 * type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
 *
 * const ValidatedReviewConfigHelpers = createValidatedConfigHelpers(ReviewConfigSchema);
 *
 * const result = ValidatedReviewConfigHelpers.parse(rawConfig);
 * if (isOk(result)) {
 *   const config: ValidatedConfig<ReviewConfig> = result.value;
 * }
 * ```
 */
export function createValidatedConfigHelpers<T>(
  schema: z.ZodType<T>
): BrandHelpers<T, 'ValidatedConfig'> & { readonly schema: z.ZodType<T> } {
  const helpers = createBrandHelpers(schema, 'ValidatedConfig', 'config');
  return {
    ...helpers,
    schema,
  };
}

// =============================================================================
// Branded Schema Factory
// =============================================================================

/**
 * Create a Zod schema that produces a branded type
 *
 * Note: The output is branded at the type level only.
 * At runtime, it's the same value as the input schema produces.
 *
 * @example
 * ```typescript
 * const SafeGitRefSchema = brandedSchema(
 *   z.string().min(1).max(256).regex(/^[a-zA-Z0-9\-_/.]+$/),
 *   'SafeGitRef'
 * );
 *
 * const result = SafeGitRefSchema.safeParse(userInput);
 * if (result.success) {
 *   const ref: SafeGitRef = result.data; // Branded!
 * }
 * ```
 */
export function brandedSchema<T, B extends string>(
  schema: z.ZodType<T>,
  _brandName: B
): z.ZodType<Brand<T, B>> {
  // The brand is compile-time only - runtime value is unchanged
  return schema as unknown as z.ZodType<Brand<T, B>>;
}

// =============================================================================
// Branded Serialization Utilities
// =============================================================================

/**
 * Serializer interface for branded types
 */
export interface BrandedSerializer<T, B extends string> {
  /** Convert branded value to JSON-serializable format */
  serialize(value: Brand<T, B>): T;
  /** Parse JSON value back to branded type */
  deserialize(value: unknown): Result<Brand<T, B>, ValidationError>;
}

/**
 * Create a serializer for a branded type using its helpers
 */
export function createBrandedSerializer<T, B extends string>(
  helpers: BrandHelpers<T, B>
): BrandedSerializer<T, B> {
  return {
    serialize: helpers.unbrand,
    deserialize: helpers.parse,
  };
}
