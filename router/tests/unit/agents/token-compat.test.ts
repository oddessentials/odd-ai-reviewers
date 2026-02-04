/**
 * Unit tests for Token Parameter Compatibility Module
 *
 * @module token-compat.test
 */

import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import {
  buildPreferredTokenLimit,
  buildFallbackTokenLimit,
  isTokenParamCompatibilityError,
  withTokenCompatibility,
  type TokenLimitParam,
} from '../../../src/agents/token-compat.js';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Create a mock Headers object for OpenAI error construction.
 * The OpenAI SDK only uses headers.get() internally, so we provide a minimal mock.
 */
function createMockHeaders(): Headers {
  return { get: (key: string) => (key === 'x-request-id' ? 'test-req-id' : null) } as Headers;
}

// =============================================================================
// T010: buildPreferredTokenLimit tests
// =============================================================================

describe('buildPreferredTokenLimit', () => {
  it('returns object with max_completion_tokens key', () => {
    const result = buildPreferredTokenLimit(4000);
    expect(result).toEqual({ max_completion_tokens: 4000 });
  });

  it('returns correct value for different token limits', () => {
    expect(buildPreferredTokenLimit(100)).toEqual({ max_completion_tokens: 100 });
    expect(buildPreferredTokenLimit(8000)).toEqual({ max_completion_tokens: 8000 });
    expect(buildPreferredTokenLimit(16)).toEqual({ max_completion_tokens: 16 });
  });

  it('does not include max_tokens key', () => {
    const result = buildPreferredTokenLimit(4000);
    expect('max_tokens' in result).toBe(false);
  });
});

// =============================================================================
// T011: buildFallbackTokenLimit tests
// =============================================================================

describe('buildFallbackTokenLimit', () => {
  it('returns object with max_tokens key', () => {
    const result = buildFallbackTokenLimit(4000);
    expect(result).toEqual({ max_tokens: 4000 });
  });

  it('returns correct value for different token limits', () => {
    expect(buildFallbackTokenLimit(100)).toEqual({ max_tokens: 100 });
    expect(buildFallbackTokenLimit(8000)).toEqual({ max_tokens: 8000 });
    expect(buildFallbackTokenLimit(16)).toEqual({ max_tokens: 16 });
  });

  it('does not include max_completion_tokens key', () => {
    const result = buildFallbackTokenLimit(4000);
    expect('max_completion_tokens' in result).toBe(false);
  });
});

// =============================================================================
// T016-T020: isTokenParamCompatibilityError tests
// =============================================================================

describe('isTokenParamCompatibilityError', () => {
  // T016: Returns true for BadRequestError with token params and "not supported"
  describe('token parameter compatibility errors (T016)', () => {
    it('returns true for BadRequestError with both param names and "not supported"', () => {
      const error = new OpenAI.BadRequestError(
        400,
        {
          message:
            "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
        },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(true);
    });

    it('returns true for error message with different casing', () => {
      const error = new OpenAI.BadRequestError(
        400,
        {
          message: 'MAX_TOKENS is NOT SUPPORTED. Please use MAX_COMPLETION_TOKENS for this model.',
        },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(true);
    });

    it('returns true for error message with params in different order', () => {
      const error = new OpenAI.BadRequestError(
        400,
        {
          message:
            'This model requires max_completion_tokens. The parameter max_tokens is not supported.',
        },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(true);
    });
  });

  // T017: Returns false for network errors
  describe('network errors (T017)', () => {
    it('returns false for APIConnectionError', () => {
      const error = new OpenAI.APIConnectionError({
        message: 'Connection failed',
        cause: new Error('ECONNREFUSED'),
      });
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });

    it('returns false for APIConnectionTimeoutError', () => {
      const error = new OpenAI.APIConnectionTimeoutError({
        message: 'Request timed out',
      });
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });
  });

  // T018: Returns false for auth errors
  describe('authentication errors (T018)', () => {
    it('returns false for AuthenticationError', () => {
      const error = new OpenAI.AuthenticationError(
        401,
        { message: 'Invalid API key' },
        'Unauthorized',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });

    it('returns false for PermissionDeniedError', () => {
      const error = new OpenAI.PermissionDeniedError(
        403,
        { message: 'Access denied' },
        'Forbidden',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });
  });

  // T019: Returns false for rate limit errors
  describe('rate limit errors (T019)', () => {
    it('returns false for RateLimitError', () => {
      const error = new OpenAI.RateLimitError(
        429,
        { message: 'Rate limit exceeded' },
        'Too Many Requests',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });
  });

  // T020: Returns false for generic 400 errors without token params
  describe('generic 400 errors (T020)', () => {
    it('returns false for BadRequestError without token param mentions', () => {
      const error = new OpenAI.BadRequestError(
        400,
        { message: 'Invalid model specified' },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });

    it('returns false for BadRequestError with only max_tokens mentioned', () => {
      const error = new OpenAI.BadRequestError(
        400,
        { message: 'max_tokens must be a positive integer' },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });

    it('returns false for BadRequestError with only max_completion_tokens mentioned', () => {
      const error = new OpenAI.BadRequestError(
        400,
        { message: 'max_completion_tokens exceeds model limit' },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });

    it('returns false for BadRequestError with both params but no "not supported"', () => {
      const error = new OpenAI.BadRequestError(
        400,
        {
          message: 'Cannot specify both max_tokens and max_completion_tokens in the same request',
        },
        'Bad Request',
        createMockHeaders()
      );
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(isTokenParamCompatibilityError(null)).toBe(false);
      expect(isTokenParamCompatibilityError(undefined)).toBe(false);
      expect(isTokenParamCompatibilityError('error string')).toBe(false);
      expect(isTokenParamCompatibilityError({ message: 'object error' })).toBe(false);
    });

    it('returns false for generic Error', () => {
      const error = new Error('max_tokens is not supported, use max_completion_tokens');
      expect(isTokenParamCompatibilityError(error)).toBe(false);
    });
  });
});

// =============================================================================
// T021: withTokenCompatibility retry tests
// =============================================================================

describe('withTokenCompatibility', () => {
  // T021: Retries once with max_tokens on compatibility error
  describe('fallback retry behavior (T021)', () => {
    it('uses max_completion_tokens on first attempt', async () => {
      const calls: TokenLimitParam[] = [];
      const mockFn = async (tokenParam: TokenLimitParam) => {
        calls.push(tokenParam);
        return 'success';
      };

      await withTokenCompatibility(mockFn, 4000, 'gpt-4o');

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ max_completion_tokens: 4000 });
    });

    it('retries with max_tokens when compatibility error occurs', async () => {
      const calls: TokenLimitParam[] = [];
      const compatError = new OpenAI.BadRequestError(
        400,
        {
          message:
            "Unsupported parameter: 'max_completion_tokens' is not supported with this model. Use 'max_tokens' instead.",
        },
        'Bad Request',
        createMockHeaders()
      );

      const mockFn = async (tokenParam: TokenLimitParam) => {
        calls.push(tokenParam);
        if (calls.length === 1) {
          throw compatError;
        }
        return 'success after retry';
      };

      const result = await withTokenCompatibility(mockFn, 4000, 'legacy-model');

      expect(calls).toHaveLength(2);
      expect(calls[0]).toEqual({ max_completion_tokens: 4000 });
      expect(calls[1]).toEqual({ max_tokens: 4000 });
      expect(result).toBe('success after retry');
    });

    it('throws non-compatibility errors immediately without retry', async () => {
      const calls: TokenLimitParam[] = [];
      const authError = new OpenAI.AuthenticationError(
        401,
        { message: 'Invalid API key' },
        'Unauthorized',
        createMockHeaders()
      );

      const mockFn = async (tokenParam: TokenLimitParam) => {
        calls.push(tokenParam);
        throw authError;
      };

      await expect(withTokenCompatibility(mockFn, 4000, 'gpt-4o')).rejects.toThrow(authError);
      expect(calls).toHaveLength(1);
    });

    it('throws rate limit errors immediately without retry', async () => {
      const calls: TokenLimitParam[] = [];
      const rateLimitError = new OpenAI.RateLimitError(
        429,
        { message: 'Rate limit exceeded' },
        'Too Many Requests',
        createMockHeaders()
      );

      const mockFn = async (tokenParam: TokenLimitParam) => {
        calls.push(tokenParam);
        throw rateLimitError;
      };

      await expect(withTokenCompatibility(mockFn, 4000, 'gpt-4o')).rejects.toThrow(rateLimitError);
      expect(calls).toHaveLength(1);
    });

    it('throws network errors immediately without retry', async () => {
      const calls: TokenLimitParam[] = [];
      const networkError = new OpenAI.APIConnectionError({
        message: 'Connection failed',
        cause: new Error('ECONNREFUSED'),
      });

      const mockFn = async (tokenParam: TokenLimitParam) => {
        calls.push(tokenParam);
        throw networkError;
      };

      await expect(withTokenCompatibility(mockFn, 4000, 'gpt-4o')).rejects.toThrow(networkError);
      expect(calls).toHaveLength(1);
    });

    it('preserves token limit value in retry', async () => {
      const calls: TokenLimitParam[] = [];
      const compatError = new OpenAI.BadRequestError(
        400,
        {
          message: 'max_completion_tokens is not supported. Use max_tokens instead.',
        },
        'Bad Request',
        createMockHeaders()
      );

      const mockFn = async (tokenParam: TokenLimitParam) => {
        calls.push(tokenParam);
        if (calls.length === 1) {
          throw compatError;
        }
        return 'success';
      };

      await withTokenCompatibility(mockFn, 8192, 'legacy-model');

      expect(calls[0]).toEqual({ max_completion_tokens: 8192 });
      expect(calls[1]).toEqual({ max_tokens: 8192 });
    });
  });
});
