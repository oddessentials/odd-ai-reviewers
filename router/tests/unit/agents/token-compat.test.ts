/**
 * Unit tests for Token Parameter Compatibility Module
 *
 * @module token-compat.test
 */

import { describe, it, expect } from 'vitest';
import {
  buildPreferredTokenLimit,
  buildFallbackTokenLimit,
} from '../../../src/agents/token-compat.js';

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
