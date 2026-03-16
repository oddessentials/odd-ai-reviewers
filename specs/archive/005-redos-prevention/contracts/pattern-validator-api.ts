/**
 * Pattern Validator API Contract
 *
 * Defines the public interface for the ReDoS pattern validation module.
 * This contract specifies what the pattern-validator.ts module MUST implement.
 *
 * Feature: 005-redos-prevention
 * Date: 2026-01-28
 */

import { z } from 'zod';

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Risk level for ReDoS vulnerability assessment.
 */
export const ReDoSRiskLevelSchema = z.enum(['none', 'low', 'medium', 'high']);
export type ReDoSRiskLevel = z.infer<typeof ReDoSRiskLevelSchema>;

/**
 * Result of validating a regex pattern for ReDoS vulnerabilities.
 */
export const PatternValidationResultSchema = z.object({
  /** The regex pattern that was validated */
  pattern: z.string().min(1),

  /** Identifier for the pattern */
  patternId: z.string().min(1),

  /** Whether the pattern passed validation */
  isValid: z.boolean(),

  /** Reasons why pattern was rejected (empty if valid) */
  rejectionReasons: z.array(z.string()).default([]),

  /** Assessed ReDoS risk level */
  redosRisk: ReDoSRiskLevelSchema,

  /** Time taken for validation in milliseconds */
  validationTimeMs: z.number().nonnegative(),

  /** Whether pattern was whitelisted (skipped validation) */
  whitelisted: z.boolean().optional(),
});
export type PatternValidationResult = z.infer<typeof PatternValidationResultSchema>;

/**
 * Configuration for the pattern validator.
 */
export const PatternValidatorConfigSchema = z.object({
  /** Maximum time allowed for validation in milliseconds (default: 10ms) */
  validationTimeoutMs: z.number().int().min(1).max(100).default(10),

  /** Pattern IDs to skip validation (manually verified safe) */
  whitelistedPatterns: z.array(z.string()).default([]),

  /** Minimum risk level that causes rejection (default: 'medium') */
  rejectionThreshold: ReDoSRiskLevelSchema.default('medium'),

  /** Whether to log validation results (default: true) */
  enableLogging: z.boolean().default(true),
});
export type PatternValidatorConfig = z.infer<typeof PatternValidatorConfigSchema>;

// =============================================================================
// API Interface
// =============================================================================

/**
 * Pattern Validator Interface
 *
 * Implementations MUST:
 * - Validate patterns synchronously
 * - Complete within configured timeout
 * - Never throw exceptions (return result types)
 * - Log validation decisions when logging enabled
 */
export interface IPatternValidator {
  /**
   * Validate a single regex pattern for ReDoS vulnerabilities.
   *
   * @param pattern - The regex pattern string to validate
   * @param patternId - Identifier for the pattern (for logging/tracking)
   * @returns Validation result with risk assessment
   *
   * @example
   * const result = validator.validatePattern('(a+)+', 'my-pattern');
   * if (!result.isValid) {
   *   console.log('Rejected:', result.rejectionReasons);
   * }
   */
  validatePattern(pattern: string, patternId: string): PatternValidationResult;

  /**
   * Validate multiple patterns in batch.
   *
   * @param patterns - Array of {pattern, patternId} pairs
   * @returns Array of validation results in same order as input
   */
  validatePatterns(patterns: { pattern: string; patternId: string }[]): PatternValidationResult[];

  /**
   * Check if a pattern ID is whitelisted.
   *
   * @param patternId - The pattern ID to check
   * @returns true if pattern is whitelisted and should skip validation
   */
  isWhitelisted(patternId: string): boolean;

  /**
   * Get current validator configuration.
   */
  getConfig(): PatternValidatorConfig;
}

// =============================================================================
// Factory Function Contract
// =============================================================================

/**
 * Factory function signature for creating pattern validators.
 *
 * @param config - Optional configuration overrides
 * @returns Configured pattern validator instance
 */
export type CreatePatternValidator = (
  config?: Partial<PatternValidatorConfig>
) => IPatternValidator;

// =============================================================================
// Validation Utilities Contract
// =============================================================================

/**
 * Utility function signatures that MUST be exported from pattern-validator.ts
 */

/**
 * Check if a pattern contains nested quantifiers.
 * Examples: (a+)+, (a*)+, (a+)*
 */
export type HasNestedQuantifiers = (pattern: string) => boolean;

/**
 * Check if a pattern contains overlapping alternation.
 * Examples: (a|a)+, (aa|a)+
 */
export type HasOverlappingAlternation = (pattern: string) => boolean;

/**
 * Calculate the star-height (max nesting depth of Kleene operators).
 */
export type CalculateStarHeight = (pattern: string) => number;

/**
 * Compute overall ReDoS risk score (0-100).
 */
export type ComputeRiskScore = (pattern: string) => number;
