/**
 * Configuration Schema Tests
 *
 * Tests for Zod schema validation including LimitsSchema max_completion_tokens field.
 *
 * @module tests/unit/config/schemas
 */

import { describe, it, expect } from 'vitest';
import { LimitsSchema } from '../../../src/config/schemas.js';

// =============================================================================
// T031-T034: LimitsSchema max_completion_tokens tests (US4)
// =============================================================================

describe('LimitsSchema', () => {
  describe('max_completion_tokens field (T031-T034)', () => {
    // T031: LimitsSchema accepts optional max_completion_tokens field
    it('accepts max_completion_tokens as optional field', () => {
      // Should parse successfully without max_completion_tokens
      const resultWithout = LimitsSchema.safeParse({});
      expect(resultWithout.success).toBe(true);

      // Should parse successfully with max_completion_tokens
      const resultWith = LimitsSchema.safeParse({ max_completion_tokens: 8000 });
      expect(resultWith.success).toBe(true);
      if (resultWith.success) {
        expect(resultWith.data.max_completion_tokens).toBe(8000);
      }
    });

    it('accepts various valid max_completion_tokens values', () => {
      const validValues = [16, 100, 4000, 8000, 16000, 100000];

      for (const value of validValues) {
        const result = LimitsSchema.safeParse({ max_completion_tokens: value });
        expect(result.success, `Should accept ${value}`).toBe(true);
        if (result.success) {
          expect(result.data.max_completion_tokens).toBe(value);
        }
      }
    });

    // T032: Default 4000 when not specified
    it('defaults to 4000 when max_completion_tokens not specified', () => {
      const result = LimitsSchema.parse({});
      expect(result.max_completion_tokens).toBe(4000);
    });

    it('defaults to 4000 when max_completion_tokens is undefined', () => {
      const result = LimitsSchema.parse({ max_completion_tokens: undefined });
      expect(result.max_completion_tokens).toBe(4000);
    });

    // T033: Validates minimum of 16
    it('validates minimum value of 16', () => {
      // Exactly 16 should pass
      const resultAt16 = LimitsSchema.safeParse({ max_completion_tokens: 16 });
      expect(resultAt16.success).toBe(true);

      // Below 16 should fail
      const resultBelow = LimitsSchema.safeParse({ max_completion_tokens: 15 });
      expect(resultBelow.success).toBe(false);
    });

    it('rejects values below minimum of 16', () => {
      const invalidValues = [0, 1, 10, 15];

      for (const value of invalidValues) {
        const result = LimitsSchema.safeParse({ max_completion_tokens: value });
        expect(result.success, `Should reject ${value}`).toBe(false);
      }
    });

    // T034: Rejects negative values
    it('rejects negative max_completion_tokens values', () => {
      const negativeValues = [-1, -100, -4000];

      for (const value of negativeValues) {
        const result = LimitsSchema.safeParse({ max_completion_tokens: value });
        expect(result.success, `Should reject negative value ${value}`).toBe(false);
      }
    });

    it('rejects non-integer values', () => {
      const nonIntegerValues = [16.5, 4000.1, 100.99];

      for (const value of nonIntegerValues) {
        const result = LimitsSchema.safeParse({ max_completion_tokens: value });
        expect(result.success, `Should reject non-integer ${value}`).toBe(false);
      }
    });

    it('provides meaningful error message for invalid values', () => {
      const result = LimitsSchema.safeParse({ max_completion_tokens: 10 });
      expect(result.success).toBe(false);

      if (!result.success) {
        const errorMessage = result.error.issues[0]?.message ?? '';
        // Should mention the minimum constraint
        expect(errorMessage.toLowerCase()).toMatch(/16|greater|minimum|least/);
      }
    });
  });

  describe('other LimitsSchema fields remain unchanged', () => {
    it('preserves default values for existing fields', () => {
      const result = LimitsSchema.parse({});

      expect(result.max_files).toBe(50);
      expect(result.max_diff_lines).toBe(2000);
      expect(result.max_tokens_per_pr).toBe(12000);
      expect(result.max_usd_per_pr).toBe(1.0);
      expect(result.monthly_budget_usd).toBe(100);
    });

    it('allows overriding all fields including max_completion_tokens', () => {
      const customLimits = {
        max_files: 100,
        max_diff_lines: 5000,
        max_tokens_per_pr: 20000,
        max_usd_per_pr: 2.0,
        monthly_budget_usd: 200,
        max_completion_tokens: 8000,
      };

      const result = LimitsSchema.parse(customLimits);

      expect(result.max_files).toBe(100);
      expect(result.max_diff_lines).toBe(5000);
      expect(result.max_tokens_per_pr).toBe(20000);
      expect(result.max_usd_per_pr).toBe(2.0);
      expect(result.monthly_budget_usd).toBe(200);
      expect(result.max_completion_tokens).toBe(8000);
    });
  });
});
