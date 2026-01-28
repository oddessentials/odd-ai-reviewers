/**
 * ReDoS Corpus Validation Tests
 *
 * Validates the vendored ReDoS pattern corpus against the expected schema.
 * Ensures corpus integrity for pattern validator testing.
 *
 * @see FR-018, FR-020, FR-020a
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import corpus from '../fixtures/redos-corpus/v1.json' with { type: 'json' };

/**
 * Schema for individual patterns in the corpus
 */
const PatternEntrySchema = z.object({
  id: z.string().regex(/^redos-\d{3}$/, 'Pattern ID must be redos-NNN format'),
  pattern: z.string().min(1),
  category: z.enum([
    'nested_quantifiers',
    'overlapping_alternation',
    'atomic_group_missing',
    'bounded_nested',
    'safe',
  ]),
  description: z.string().min(1),
  attack_string: z.string(),
  expected_vulnerable: z.boolean(),
});

/**
 * Schema for the complete corpus file
 */
const CorpusSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must be semver format'),
  source_urls: z.array(z.string().url()).min(1),
  retrieved_at: z.string().datetime(),
  curation_rules: z.array(z.string()).min(1),
  patterns: z.array(PatternEntrySchema).min(50, 'Corpus must contain at least 50 patterns'),
});

describe('ReDoS Corpus Validation', () => {
  describe('Corpus Schema Compliance', () => {
    it('validates against corpus schema', () => {
      const result = CorpusSchema.safeParse(corpus);
      if (!result.success) {
        console.error('Schema validation errors:', result.error.format());
      }
      expect(result.success).toBe(true);
    });

    it('has valid version string', () => {
      expect(corpus.version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it('has at least one source URL', () => {
      expect(corpus.source_urls.length).toBeGreaterThanOrEqual(1);
    });

    it('has valid ISO 8601 retrieved_at timestamp', () => {
      expect(() => new Date(corpus.retrieved_at)).not.toThrow();
      // JavaScript toISOString adds milliseconds, so we check the date is valid
      const parsed = new Date(corpus.retrieved_at);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('has curation rules documented', () => {
      expect(corpus.curation_rules.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Pattern Entry Validation', () => {
    it('contains at least 50 patterns per FR-018', () => {
      expect(corpus.patterns.length).toBeGreaterThanOrEqual(50);
    });

    it('has unique pattern IDs', () => {
      const ids = corpus.patterns.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all patterns have valid regex syntax', () => {
      for (const entry of corpus.patterns) {
        // Trust: REPO_CONFIG - Test corpus patterns, validated during test
        // Control: Patterns are from vendored corpus, not user input
        // See docs/security/regex-threat-model.md
        expect(
          () =>
            // eslint-disable-next-line security/detect-non-literal-regexp -- Test corpus validation
            new RegExp(entry.pattern),
          `Pattern ${entry.id} should be valid`
        ).not.toThrow();
      }
    });

    it('all pattern IDs follow redos-NNN format', () => {
      for (const entry of corpus.patterns) {
        expect(entry.id).toMatch(/^redos-\d{3}$/);
      }
    });

    it('all patterns have non-empty descriptions', () => {
      for (const entry of corpus.patterns) {
        expect(entry.description.length).toBeGreaterThan(0);
      }
    });

    it('all patterns have attack strings', () => {
      for (const entry of corpus.patterns) {
        expect(entry.attack_string).toBeDefined();
      }
    });
  });

  describe('Pattern Distribution', () => {
    it('includes vulnerable patterns', () => {
      const vulnerable = corpus.patterns.filter((p) => p.expected_vulnerable);
      expect(vulnerable.length).toBeGreaterThan(0);
    });

    it('includes safe patterns', () => {
      const safe = corpus.patterns.filter((p) => !p.expected_vulnerable);
      expect(safe.length).toBeGreaterThan(0);
    });

    it('includes nested_quantifiers category', () => {
      const nested = corpus.patterns.filter((p) => p.category === 'nested_quantifiers');
      expect(nested.length).toBeGreaterThan(0);
    });

    it('includes overlapping_alternation category', () => {
      const overlapping = corpus.patterns.filter((p) => p.category === 'overlapping_alternation');
      expect(overlapping.length).toBeGreaterThan(0);
    });

    it('includes safe category', () => {
      const safe = corpus.patterns.filter((p) => p.category === 'safe');
      expect(safe.length).toBeGreaterThan(0);
    });
  });

  describe('Corpus Version Assertion (FR-020a)', () => {
    // T033: CI assertion for corpus version
    it('corpus version is 1.0.0 for this release', () => {
      // FR-020a: CI assertion for corpus version
      // Update this when corpus is updated
      expect(corpus.version).toBe('1.0.0');
    });
  });
});
