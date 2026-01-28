/**
 * Pattern Validator
 *
 * Validates regex patterns for ReDoS vulnerabilities before execution.
 * Implements defense-in-depth alongside timeout protection.
 *
 * Implements:
 * - FR-001: Validate user-provided regex patterns against known ReDoS patterns
 * - FR-002: Reject patterns with nested quantifiers
 * - FR-003: Reject patterns with overlapping alternations
 * - FR-004: Provide independent validation function
 * - FR-005: Allow whitelisting of verified-safe patterns
 */

import type { PatternValidationResult, ReDoSDetectionResult, ReDoSRiskLevel } from './types.js';
import { getLogger, type AnalysisLogger } from './logger.js';

// =============================================================================
// Constants
// =============================================================================

/** Default timeout for validation in milliseconds */
const DEFAULT_VALIDATION_TIMEOUT_MS = 10;

/** Minimum allowed validation timeout */
const MIN_VALIDATION_TIMEOUT_MS = 1;

/** Maximum allowed validation timeout */
const MAX_VALIDATION_TIMEOUT_MS = 100;

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for the pattern validator.
 */
export interface PatternValidatorConfig {
  /** Maximum time allowed for validation in milliseconds (default: 10ms) */
  validationTimeoutMs: number;
  /** Pattern IDs to skip validation (manually verified safe) */
  whitelistedPatterns: string[];
  /** Minimum risk level that causes rejection (default: 'medium') */
  rejectionThreshold: ReDoSRiskLevel;
  /** Whether to log validation results (default: true) */
  enableLogging: boolean;
}

const DEFAULT_CONFIG: PatternValidatorConfig = {
  validationTimeoutMs: DEFAULT_VALIDATION_TIMEOUT_MS,
  whitelistedPatterns: [],
  rejectionThreshold: 'medium',
  enableLogging: true,
};

// =============================================================================
// Risk Level Utilities
// =============================================================================

const RISK_LEVEL_ORDER: Record<ReDoSRiskLevel, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

/**
 * Compare two risk levels.
 * Returns true if level >= threshold.
 */
function riskMeetsThreshold(level: ReDoSRiskLevel, threshold: ReDoSRiskLevel): boolean {
  return RISK_LEVEL_ORDER[level] >= RISK_LEVEL_ORDER[threshold];
}

/**
 * Convert vulnerability score (0-100) to risk level.
 */
function scoreToRiskLevel(score: number): ReDoSRiskLevel {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score > 0) return 'low';
  return 'none';
}

// =============================================================================
// ReDoS Detection Utilities
// =============================================================================

/**
 * Check if a pattern contains nested quantifiers.
 * Examples: (a+)+, (a*)+, (a+)*, (a*)*
 *
 * These patterns cause exponential backtracking.
 */
export function hasNestedQuantifiers(pattern: string): boolean {
  // Match groups with quantifiers inside that are themselves quantified
  // Pattern: \( ... [+*?] ... \) [+*?{]
  // This is a simplified check - looks for quantified groups containing quantifiers
  const nestedQuantifierRegex = /\([^)]*[+*][^)]*\)[+*?]|\([^)]*[+*][^)]*\)\{/;
  return nestedQuantifierRegex.test(pattern);
}

/**
 * Check if a pattern contains overlapping alternation.
 * Examples: (a|a)+, (aa|a)+, (a|ab)+
 *
 * These patterns cause ambiguous matching paths.
 */
export function hasOverlappingAlternation(pattern: string): boolean {
  // This is a simplified heuristic check
  // Look for alternations where branches share common prefixes and are quantified
  // Pattern: \( branch | branch \) [+*?{]
  const alternationRegex = /\([^|)]+\|[^)]+\)[+*?]|\([^|)]+\|[^)]+\)\{/;
  if (!alternationRegex.test(pattern)) {
    return false;
  }

  // Extract alternations and check for overlapping patterns
  const altMatch = pattern.match(/\(([^)]+)\)[+*?{]/g);
  if (!altMatch) return false;

  for (const alt of altMatch) {
    // Extract the content inside parentheses
    const contentMatch = alt.match(/\(([^)]+)\)/);
    const content = contentMatch?.[1];
    if (!content || !content.includes('|')) continue;

    const branches = content.split('|');
    // Check if any branch is a prefix of another
    for (let i = 0; i < branches.length; i++) {
      for (let j = 0; j < branches.length; j++) {
        if (i !== j) {
          const branchA = branches[i];
          const branchB = branches[j];
          if (branchA && branchB) {
            const a = branchA.trim();
            const b = branchB.trim();
            // Check for common prefix
            if (a.length > 0 && b.length > 0 && (a.startsWith(b) || b.startsWith(a))) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Calculate the star-height (max nesting depth of Kleene operators).
 * Star-height > 1 indicates potential exponential complexity.
 */
export function calculateStarHeight(pattern: string): number {
  let maxHeight = 0;
  let currentHeight = 0;
  let inQuantifiedGroup = false;

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    const prevChar = i > 0 ? pattern[i - 1] : '';

    if (char === '(' && prevChar !== '\\') {
      if (inQuantifiedGroup) {
        currentHeight++;
      }
    } else if (char === ')' && prevChar !== '\\') {
      // Check if this group is quantified
      const nextChar = pattern[i + 1];
      if (nextChar === '+' || nextChar === '*' || nextChar === '?' || nextChar === '{') {
        inQuantifiedGroup = true;
        currentHeight++;
        maxHeight = Math.max(maxHeight, currentHeight);
      }
      if (currentHeight > 0) {
        currentHeight--;
      }
      if (currentHeight === 0) {
        inQuantifiedGroup = false;
      }
    }
  }

  return maxHeight;
}

/**
 * Compute overall ReDoS risk score (0-100).
 * Higher score indicates higher risk.
 */
export function computeRiskScore(pattern: string): number {
  let score = 0;

  // Nested quantifiers: high risk (+50)
  if (hasNestedQuantifiers(pattern)) {
    score += 50;
  }

  // Overlapping alternation: medium-high risk (+30)
  if (hasOverlappingAlternation(pattern)) {
    score += 30;
  }

  // Star height > 1: additional risk
  const starHeight = calculateStarHeight(pattern);
  if (starHeight > 1) {
    score += Math.min(starHeight * 10, 20); // Cap at +20
  }

  // Long patterns with many quantifiers: slight additional risk
  const quantifierCount = (pattern.match(/[+*?]|\{\d+/g) || []).length;
  if (quantifierCount > 5) {
    score += Math.min((quantifierCount - 5) * 2, 10); // Cap at +10
  }

  return Math.min(score, 100);
}

/**
 * Perform full ReDoS detection analysis on a pattern.
 */
export function detectReDoSPatterns(pattern: string): ReDoSDetectionResult {
  const detectedPatterns: string[] = [];

  const nested = hasNestedQuantifiers(pattern);
  if (nested) {
    detectedPatterns.push('nested_quantifiers');
  }

  const overlapping = hasOverlappingAlternation(pattern);
  if (overlapping) {
    detectedPatterns.push('overlapping_alternation');
  }

  const starHeight = calculateStarHeight(pattern);
  if (starHeight > 1) {
    detectedPatterns.push(`star_height_${starHeight}`);
  }

  // Check for quantified overlapping groups pattern: (.*a){n}
  const quantifiedOverlapRegex = /\(\.\*[^)]+\)\{|\([^)]*\.\*\)\{/;
  const hasQuantifiedOverlap = quantifiedOverlapRegex.test(pattern);
  if (hasQuantifiedOverlap) {
    detectedPatterns.push('quantified_overlap');
  }

  const vulnerabilityScore = computeRiskScore(pattern);

  return {
    hasNestedQuantifiers: nested,
    hasOverlappingAlternation: overlapping,
    hasQuantifiedOverlap,
    starHeight,
    vulnerabilityScore,
    detectedPatterns,
  };
}

// =============================================================================
// Pattern Validator Interface
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
  validatePattern(pattern: string, patternId: string): PatternValidationResult;
  validatePatterns(patterns: { pattern: string; patternId: string }[]): PatternValidationResult[];
  isWhitelisted(patternId: string): boolean;
  getConfig(): PatternValidatorConfig;
}

// =============================================================================
// Pattern Validator Class
// =============================================================================

/**
 * Validates regex patterns for ReDoS vulnerabilities.
 *
 * Uses static analysis to detect known ReDoS patterns before execution.
 * Combined with TimeoutRegex provides defense-in-depth protection.
 */
export class PatternValidator implements IPatternValidator {
  private config: PatternValidatorConfig;
  private whitelistSet: Set<string>;
  private logger: AnalysisLogger;

  constructor(config?: Partial<PatternValidatorConfig>, logger?: AnalysisLogger) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.config.validationTimeoutMs = this.clampTimeout(this.config.validationTimeoutMs);
    this.whitelistSet = new Set(this.config.whitelistedPatterns);
    this.logger = logger ?? getLogger();
  }

  /**
   * Clamp validation timeout to allowed range.
   */
  private clampTimeout(timeout: number): number {
    if (timeout < MIN_VALIDATION_TIMEOUT_MS) return MIN_VALIDATION_TIMEOUT_MS;
    if (timeout > MAX_VALIDATION_TIMEOUT_MS) return MAX_VALIDATION_TIMEOUT_MS;
    return Math.floor(timeout);
  }

  /**
   * Check if a pattern ID is whitelisted.
   */
  isWhitelisted(patternId: string): boolean {
    return this.whitelistSet.has(patternId);
  }

  /**
   * Get current validator configuration.
   */
  getConfig(): PatternValidatorConfig {
    return { ...this.config };
  }

  /**
   * Validate a single regex pattern for ReDoS vulnerabilities.
   */
  validatePattern(pattern: string, patternId: string): PatternValidationResult {
    const startTime = process.hrtime.bigint();

    // Check whitelist first
    if (this.isWhitelisted(patternId)) {
      const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

      if (this.config.enableLogging) {
        this.logger.log(
          'debug',
          'pattern_timeout',
          `Pattern ${patternId} whitelisted, skipping validation`,
          {
            patternId,
            whitelisted: true,
          }
        );
      }

      return {
        pattern,
        patternId,
        isValid: true,
        rejectionReasons: [],
        redosRisk: 'none',
        validationTimeMs: elapsedMs,
        whitelisted: true,
      };
    }

    // Try to compile the pattern first to catch syntax errors
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- Validating user-provided pattern
      new RegExp(pattern);
    } catch (error) {
      const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
      const errorMessage = error instanceof Error ? error.message : 'Invalid regex syntax';

      if (this.config.enableLogging) {
        this.logger.log(
          'warn',
          'pattern_timeout',
          `Pattern ${patternId} failed compilation: ${errorMessage}`,
          {
            patternId,
            error: errorMessage,
          }
        );
      }

      return {
        pattern,
        patternId,
        isValid: false,
        rejectionReasons: [`Compilation error: ${errorMessage}`],
        redosRisk: 'high', // Treat compilation errors as high risk
        validationTimeMs: elapsedMs,
      };
    }

    // Perform ReDoS detection
    const detection = detectReDoSPatterns(pattern);
    const riskLevel = scoreToRiskLevel(detection.vulnerabilityScore);
    const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

    // Build rejection reasons
    const rejectionReasons: string[] = [];

    if (detection.hasNestedQuantifiers) {
      rejectionReasons.push(
        'Pattern contains nested quantifiers (e.g., (a+)+) which can cause exponential backtracking'
      );
    }

    if (detection.hasOverlappingAlternation) {
      rejectionReasons.push(
        'Pattern contains overlapping alternation (e.g., (a|ab)+) which can cause ambiguous matching'
      );
    }

    if (detection.hasQuantifiedOverlap) {
      rejectionReasons.push(
        'Pattern contains quantified overlapping groups (e.g., (.*a){n}) which can cause quadratic behavior'
      );
    }

    if (detection.starHeight > 1) {
      rejectionReasons.push(
        `Pattern has star-height of ${detection.starHeight} (nested Kleene closures)`
      );
    }

    // Determine if pattern should be rejected based on risk threshold
    const shouldReject = riskMeetsThreshold(riskLevel, this.config.rejectionThreshold);
    const isValid = !shouldReject;

    if (this.config.enableLogging) {
      if (isValid) {
        this.logger.log('debug', 'pattern_timeout', `Pattern ${patternId} validated successfully`, {
          patternId,
          riskLevel,
          score: detection.vulnerabilityScore,
          elapsedMs,
        });
      } else {
        this.logger.log(
          'warn',
          'pattern_timeout',
          `Pattern ${patternId} rejected: ${rejectionReasons.join('; ')}`,
          {
            patternId,
            riskLevel,
            score: detection.vulnerabilityScore,
            reasons: rejectionReasons,
            elapsedMs,
          }
        );
      }
    }

    return {
      pattern,
      patternId,
      isValid,
      rejectionReasons: isValid ? [] : rejectionReasons,
      redosRisk: riskLevel,
      validationTimeMs: elapsedMs,
    };
  }

  /**
   * Validate multiple patterns in batch.
   */
  validatePatterns(patterns: { pattern: string; patternId: string }[]): PatternValidationResult[] {
    return patterns.map(({ pattern, patternId }) => this.validatePattern(pattern, patternId));
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a pattern validator with the given configuration.
 */
export function createPatternValidator(
  config?: Partial<PatternValidatorConfig>,
  logger?: AnalysisLogger
): PatternValidator {
  return new PatternValidator(config, logger);
}

// =============================================================================
// Mitigation Pattern Validation with ReDoS Check
// =============================================================================

import { validateMitigationPattern, type MitigationPattern } from './types.js';
import { z } from 'zod';

/**
 * Validate a mitigation pattern configuration with ReDoS protection.
 *
 * This extends the basic `validateMitigationPattern` from types.ts by also
 * checking namePattern regex for ReDoS vulnerabilities.
 *
 * @param pattern - The pattern configuration to validate
 * @param rejectionThreshold - Minimum risk level to reject ('low', 'medium', 'high')
 */
export function validateMitigationPatternWithReDoSCheck(
  pattern: unknown,
  rejectionThreshold: ReDoSRiskLevel = 'medium'
): { success: true; data: MitigationPattern } | { success: false; error: z.ZodError } {
  // First, validate syntax
  const syntaxResult = validateMitigationPattern(pattern);
  if (!syntaxResult.success) {
    return syntaxResult;
  }

  const data = syntaxResult.data;

  // Check namePattern for ReDoS if present
  if (data.match.namePattern) {
    const score = computeRiskScore(data.match.namePattern);
    // Convert score to risk level (mirrors scoreToRiskLevel)
    let level: ReDoSRiskLevel;
    if (score >= 70) level = 'high';
    else if (score >= 40) level = 'medium';
    else if (score > 0) level = 'low';
    else level = 'none';

    // Reject if: threshold is not 'none', level is not 'none', and level meets threshold
    if (
      rejectionThreshold !== 'none' &&
      level !== 'none' &&
      riskMeetsThreshold(level, rejectionThreshold)
    ) {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['match', 'namePattern'],
            message: `Pattern has ${level} ReDoS risk and may cause denial-of-service`,
          },
        ]),
      };
    }
  }

  return { success: true, data };
}
