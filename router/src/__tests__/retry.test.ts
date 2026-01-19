/**
 * Retry Module Tests
 *
 * Tests for the shared retry logic used by LLM-based agents.
 * Ensures correct classification of retryable vs non-retryable errors
 * and proper exponential backoff behavior.
 */

import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import { getRetryDelayMs, withRetry } from '../agents/retry.js';

describe('getRetryDelayMs', () => {
  const BASE_DELAY = 1000;

  describe('Retryable errors', () => {
    it('should return extended backoff for RateLimitError', () => {
      const error = new OpenAI.RateLimitError(429, { message: 'Rate limit' }, '', {});
      const delay = getRetryDelayMs(error, 0);

      // Rate limit uses attempt + 2 for extended backoff: 1000 * 2^(0+2) = 4000
      expect(delay).toBe(BASE_DELAY * Math.pow(2, 0 + 2));
    });

    it('should respect Retry-After header for RateLimitError', () => {
      const error = new OpenAI.RateLimitError(429, { message: 'Rate limit' }, '', {});
      // Manually attach headers (OpenAI SDK pattern)
      (error as unknown as { headers: Record<string, string> }).headers = {
        'retry-after': '30',
      };

      const delay = getRetryDelayMs(error, 0);
      expect(delay).toBe(30000); // 30 seconds in ms
    });

    it('should return exponential backoff for InternalServerError', () => {
      const error = new OpenAI.InternalServerError(500, { message: 'Server error' }, '', {});

      expect(getRetryDelayMs(error, 0)).toBe(BASE_DELAY * Math.pow(2, 0)); // 1000
      expect(getRetryDelayMs(error, 1)).toBe(BASE_DELAY * Math.pow(2, 1)); // 2000
      expect(getRetryDelayMs(error, 2)).toBe(BASE_DELAY * Math.pow(2, 2)); // 4000
    });

    it('should return exponential backoff for APIConnectionError', () => {
      const error = new OpenAI.APIConnectionError({ message: 'Connection failed' });

      expect(getRetryDelayMs(error, 0)).toBe(1000);
      expect(getRetryDelayMs(error, 1)).toBe(2000);
      expect(getRetryDelayMs(error, 2)).toBe(4000);
    });

    it('should return exponential backoff for generic 5xx APIError', () => {
      const error = new OpenAI.APIError(503, { message: 'Service unavailable' }, '', {});

      expect(getRetryDelayMs(error, 0)).toBe(1000);
    });
  });

  describe('Non-retryable errors', () => {
    it('should return null for AuthenticationError', () => {
      const error = new OpenAI.AuthenticationError(401, { message: 'Invalid key' }, '', {});
      expect(getRetryDelayMs(error, 0)).toBeNull();
    });

    it('should return null for BadRequestError', () => {
      const error = new OpenAI.BadRequestError(400, { message: 'Bad request' }, '', {});
      expect(getRetryDelayMs(error, 0)).toBeNull();
    });

    it('should return null for NotFoundError', () => {
      const error = new OpenAI.NotFoundError(404, { message: 'Not found' }, '', {});
      expect(getRetryDelayMs(error, 0)).toBeNull();
    });

    it('should return null for PermissionDeniedError', () => {
      const error = new OpenAI.PermissionDeniedError(403, { message: 'Forbidden' }, '', {});
      expect(getRetryDelayMs(error, 0)).toBeNull();
    });

    it('should return null for unknown error types', () => {
      const error = new Error('Generic error');
      expect(getRetryDelayMs(error, 0)).toBeNull();
    });
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const result = await withRetry(fn);

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately on non-retryable error', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new OpenAI.AuthenticationError(401, { message: 'Invalid key' }, '', {}));

    await expect(withRetry(fn)).rejects.toThrow('Invalid key');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should throw immediately on BadRequestError', async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new OpenAI.BadRequestError(400, { message: 'Bad request' }, '', {}));

    await expect(withRetry(fn)).rejects.toThrow('Bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // Note: Tests for retry delays and max retries would require integration testing
  // with real timers or a more complex mock setup. The core retry logic is covered
  // by the getRetryDelayMs tests above which verify correct delay calculation.
});
