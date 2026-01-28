/**
 * Pattern Corpus Contract
 *
 * Defines the schema for vendored ReDoS test patterns.
 * Location: tests/fixtures/redos-corpus/v<N>.json
 *
 * @see FR-018, FR-020, FR-020a
 */

import { z } from 'zod';

/**
 * Pattern categories for classification
 */
export const PatternCategory = z.enum([
  'nested_quantifiers',
  'catastrophic_backtracking',
  'overlapping_alternation',
  'excessive_grouping',
  'unbounded_repetition',
  'lookahead_abuse',
  'lookbehind_abuse',
  'backreference_complexity',
  'edge_case',
]);
export type PatternCategory = z.infer<typeof PatternCategory>;

/**
 * Expected validation result
 */
export const ExpectedResult = z.enum(['reject', 'accept']);
export type ExpectedResult = z.infer<typeof ExpectedResult>;

/**
 * Single pattern entry in corpus
 */
export const PatternEntry = z.object({
  /** Unique identifier (e.g., "redos-001") */
  id: z.string().regex(/^redos-\d{3}$/, 'Must match pattern redos-NNN'),

  /** The regex pattern to test */
  pattern: z.string().min(1),

  /** Classification category */
  category: PatternCategory,

  /** Expected validation outcome */
  expected_result: ExpectedResult,

  /** Expected error code if rejected */
  error_code: z.string().optional(),

  /** Attribution source (OWASP, CWE, etc.) */
  source: z.string().min(1),

  /** Proof-of-concept input that triggers ReDoS */
  poc_input: z.string().optional(),

  /** Description of the vulnerability */
  description: z.string().optional(),
});

export type PatternEntry = z.infer<typeof PatternEntry>;

/**
 * Complete pattern corpus
 */
export const PatternCorpus = z.object({
  /** Semantic version of the corpus */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver format'),

  /** URLs of authoritative sources */
  source_urls: z.array(z.string().url()),

  /** ISO 8601 date when patterns were retrieved/curated */
  retrieved_at: z.string().datetime(),

  /** Description of selection criteria */
  curation_rules: z.string().min(1),

  /** Array of test patterns */
  patterns: z.array(PatternEntry),
});

export type PatternCorpus = z.infer<typeof PatternCorpus>;

/**
 * Corpus validation result
 */
export interface CorpusValidationResult {
  valid: boolean;
  errors: string[];
  patternCount: number;
  categoryCounts: Record<PatternCategory, number>;
}

/**
 * Validate corpus structure and uniqueness constraints
 *
 * @param corpus - Corpus to validate
 * @returns Validation result with error details
 */
export function validateCorpus(corpus: PatternCorpus): CorpusValidationResult {
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const categoryCounts: Record<string, number> = {};

  for (const pattern of corpus.patterns) {
    // Check ID uniqueness
    if (seenIds.has(pattern.id)) {
      errors.push(`Duplicate pattern ID: ${pattern.id}`);
    }
    seenIds.add(pattern.id);

    // Count categories
    categoryCounts[pattern.category] = (categoryCounts[pattern.category] || 0) + 1;

    // Check reject patterns have error codes
    if (pattern.expected_result === 'reject' && !pattern.error_code) {
      errors.push(`Pattern ${pattern.id}: rejected patterns should have error_code`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    patternCount: corpus.patterns.length,
    categoryCounts: categoryCounts as Record<PatternCategory, number>,
  };
}

/**
 * Assert corpus version matches expected (for CI)
 *
 * @param corpus - Loaded corpus
 * @param expectedVersion - Expected version string
 * @throws Error if versions don't match
 */
export function assertCorpusVersion(corpus: PatternCorpus, expectedVersion: string): void {
  if (corpus.version !== expectedVersion) {
    throw new Error(`Corpus version mismatch: expected ${expectedVersion}, got ${corpus.version}`);
  }
}
