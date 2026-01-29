/**
 * Branded Type Contract
 * Feature: 010-type-test-optimization
 *
 * This file defines the branded type pattern and helpers contract.
 * Implementation must conform to these interfaces.
 */

import { z } from 'zod';
import type { Result } from './result.js';
import type { ValidationErrorContract } from './errors.js';

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
// Predefined Branded Types
// =============================================================================

/**
 * Configuration that has been validated through Zod schema
 */
export type ValidatedConfig<T = unknown> = Brand<T, 'ValidatedConfig'>;

/**
 * Git reference that has been validated as safe for shell execution
 * Must pass: non-empty, max 256 chars, alphanumeric + -_/. only
 */
export type SafeGitRef = Brand<string, 'SafeGitRef'>;

/**
 * File path that has been canonicalized (normalized, no traversal)
 */
export type CanonicalPath = Brand<string, 'CanonicalPath'>;

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
  parse(value: unknown): Result<Brand<T, B>, ValidationErrorContract>;

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
 * @param schema Zod schema for validating the underlying type
 * @param brandName The brand identifier string
 * @param validate Optional additional validation beyond schema
 *
 * @example
 * ```typescript
 * const SafeGitRefHelpers = createBrandHelpers(
 *   z.string().min(1).max(256).regex(/^[a-zA-Z0-9\-_/.]+$/),
 *   'SafeGitRef'
 * );
 *
 * // Usage
 * const result = SafeGitRefHelpers.parse(userInput);
 * if (isOk(result)) {
 *   const ref: SafeGitRef = result.value;
 *   // ref is now type-safe for git operations
 * }
 * ```
 */
export function createBrandHelpers<T, B extends string>(
  schema: z.ZodType<T>,
  brandName: B,
  validate?: (value: T) => Result<T, ValidationErrorContract>
): BrandHelpers<T, B>;

// Implementation signature (not exported, just for documentation)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _createBrandHelpersImpl<T, B extends string>(
  schema: z.ZodType<T>,
  brandName: B,
  validate?: (value: T) => Result<T, ValidationErrorContract>
): BrandHelpers<T, B> {
  // Implementation will be in router/src/types/branded.ts
  throw new Error('Contract only - see implementation');
}

// =============================================================================
// Specific Brand Helpers (Contract)
// =============================================================================

/**
 * Helpers for ValidatedConfig<T>
 * Validates configuration against a Zod schema
 */
export interface ValidatedConfigHelpers<T> extends BrandHelpers<T, 'ValidatedConfig'> {
  /** The Zod schema used for validation */
  readonly schema: z.ZodType<T>;
}

/**
 * Helpers for SafeGitRef
 * Validates git references for safe shell execution
 */
export interface SafeGitRefHelpers extends BrandHelpers<string, 'SafeGitRef'> {
  /** Maximum allowed length for git refs */
  readonly MAX_LENGTH: 256;
  /** Pattern for valid git refs */
  readonly PATTERN: RegExp; // /^[a-zA-Z0-9\-_/.]+$/
}

/**
 * Helpers for CanonicalPath
 * Validates and normalizes file paths
 */
export interface CanonicalPathHelpers extends BrandHelpers<string, 'CanonicalPath'> {
  /** Normalize path separators and resolve . and .. */
  normalize(path: string): string;
  /** Check if path attempts directory traversal */
  hasTraversal(path: string): boolean;
}

// =============================================================================
// Zod Integration
// =============================================================================

/**
 * Create a Zod schema that produces a branded type
 * The schema validates input and brands the output
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
  // The schema output is branded at the type level only
  // At runtime, it's the same value
  return schema as unknown as z.ZodType<Brand<T, B>>;
}

// =============================================================================
// Serialization Contracts
// =============================================================================

/**
 * Contract for serializing branded types to JSON-safe format
 * Must strip brand and return plain value
 */
export interface BrandedSerializer<T, B extends string> {
  /** Convert branded value to JSON-serializable format */
  serialize(value: Brand<T, B>): T;
  /** Parse JSON value back to branded type */
  deserialize(value: unknown): Result<Brand<T, B>, ValidationErrorContract>;
}

/**
 * Create serializer for a branded type
 * Uses the brand helpers for validation
 */
export function createBrandedSerializer<T, B extends string>(
  helpers: BrandHelpers<T, B>
): BrandedSerializer<T, B> {
  return {
    serialize: helpers.unbrand,
    deserialize: helpers.parse,
  };
}

// =============================================================================
// Lint Rule Contract (Documentation)
// =============================================================================

/**
 * ESLint rule contract for preventing direct casting
 *
 * The following patterns MUST be flagged as errors:
 * - `value as SafeGitRef`
 * - `value as Brand<string, 'SafeGitRef'>`
 * - `<SafeGitRef>value`
 *
 * Allowed patterns:
 * - `SafeGitRefHelpers.brand(value)` (inside helpers only)
 * - `SafeGitRefHelpers.parse(value)`
 *
 * Implementation: Add ESLint rule or rely on code review
 * until automated rule is available
 */
export const CASTING_FORBIDDEN_MESSAGE =
  'Direct casting to branded types is forbidden. Use the brand helpers instead.';
