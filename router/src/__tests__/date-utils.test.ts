/**
 * Date Utilities Tests
 *
 * Tests for injectable date functions used in LLM prompts.
 * Ensures deterministic behavior in tests via setDateOverride.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { getCurrentDateUTC, setDateOverride } from '../agents/date-utils.js';

describe('Date Utilities', () => {
  afterEach(() => {
    // Always reset override after each test
    setDateOverride(null);
  });

  describe('getCurrentDateUTC', () => {
    it('should return override when set', () => {
      setDateOverride('2026-01-24');
      expect(getCurrentDateUTC()).toBe('2026-01-24');
    });

    it('should return different override values', () => {
      setDateOverride('2025-12-31');
      expect(getCurrentDateUTC()).toBe('2025-12-31');

      setDateOverride('2030-06-15');
      expect(getCurrentDateUTC()).toBe('2030-06-15');
    });

    it('should return real date when no override is set', () => {
      setDateOverride(null);
      const result = getCurrentDateUTC();

      // Should match YYYY-MM-DD format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      // Should be a valid date (no NaN or invalid values)
      const parsed = new Date(result);
      expect(parsed.toString()).not.toBe('Invalid Date');
    });

    it('should reset to real date when override is cleared', () => {
      setDateOverride('1999-01-01');
      expect(getCurrentDateUTC()).toBe('1999-01-01');

      setDateOverride(null);
      const result = getCurrentDateUTC();

      // Should not be the old override
      expect(result).not.toBe('1999-01-01');
      // Should be real date format
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Prompt Date Injection Invariants', () => {
    it('date format should be safe for LLM prompts (no special chars)', () => {
      setDateOverride('2026-01-24');
      const date = getCurrentDateUTC();

      // Should not contain any shell metacharacters or prompt injection chars
      expect(date).not.toMatch(/[;|&$`\\!<>(){}[\]'"*?\n\r]/);

      // Should be exactly YYYY-MM-DD format
      expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should support leap year dates', () => {
      setDateOverride('2024-02-29');
      expect(getCurrentDateUTC()).toBe('2024-02-29');
    });

    it('should support year boundaries', () => {
      setDateOverride('2025-12-31');
      expect(getCurrentDateUTC()).toBe('2025-12-31');

      setDateOverride('2026-01-01');
      expect(getCurrentDateUTC()).toBe('2026-01-01');
    });
  });
});
