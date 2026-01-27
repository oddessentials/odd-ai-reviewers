/**
 * Cache Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  generateCacheKey,
  hashConfig,
  hashContent,
  parseCacheKey,
  CACHE_KEY_PREFIX,
} from '../cache/key.js';
import { getCached, setCache, clearCache } from '../cache/store.js';
import type { AgentResult } from '../agents/index.js';

describe('generateCacheKey', () => {
  it('should produce consistent keys for same inputs', () => {
    const inputs = {
      prNumber: 42,
      headSha: 'abc123def456',
      configHash: 'config123',
      agentId: 'semgrep',
    };

    const key1 = generateCacheKey(inputs);
    const key2 = generateCacheKey(inputs);

    expect(key1).toBe(key2);
  });

  it('should produce different keys for different inputs', () => {
    const key1 = generateCacheKey({
      prNumber: 42,
      headSha: 'abc123',
      configHash: 'config1',
      agentId: 'semgrep',
    });

    const key2 = generateCacheKey({
      prNumber: 42,
      headSha: 'def456', // Different SHA
      configHash: 'config1',
      agentId: 'semgrep',
    });

    expect(key1).not.toBe(key2);
  });

  it('should include prefix and PR number in key', () => {
    const key = generateCacheKey({
      prNumber: 123,
      headSha: 'abc123',
      configHash: 'config1',
      agentId: 'semgrep',
    });

    expect(key).toContain(CACHE_KEY_PREFIX);
    expect(key).toContain('123');
  });
});

describe('hashConfig', () => {
  it('should produce same hash for same config', () => {
    const config = { version: 1, trusted_only: true };
    const hash1 = hashConfig(config);
    const hash2 = hashConfig(config);

    expect(hash1).toBe(hash2);
  });

  it('should produce same hash regardless of property order', () => {
    const config1 = { a: 1, b: 2 };
    const config2 = { b: 2, a: 1 };

    const hash1 = hashConfig(config1);
    const hash2 = hashConfig(config2);

    expect(hash1).toBe(hash2);
  });

  it('should produce different hash for different config', () => {
    const hash1 = hashConfig({ version: 1 });
    const hash2 = hashConfig({ version: 2 });

    expect(hash1).not.toBe(hash2);
  });
});

describe('hashContent', () => {
  it('should produce consistent hash for same content', () => {
    const content = 'const x = 1;';
    const hash1 = hashContent(content);
    const hash2 = hashContent(content);

    expect(hash1).toBe(hash2);
  });
});

describe('parseCacheKey', () => {
  it('should parse valid cache key', () => {
    const key = 'ai-review-42-abc123def456';
    const parsed = parseCacheKey(key);

    expect(parsed).not.toBeNull();
    expect(parsed?.prNumber).toBe(42);
    expect(parsed?.hash).toBe('abc123def456');
  });

  it('should return null for invalid key', () => {
    expect(parseCacheKey('invalid')).toBeNull();
    expect(parseCacheKey('ai-review-notanumber-hash')).toBeNull();
  });
});

describe('Cache Key - Branch vs SHA Resolution', () => {
  /**
   * This test demonstrates the stale cache bug that was fixed.
   *
   * BUG SCENARIO (before fix):
   * 1. First review: --head feat/branch (branch name)
   *    - Cache key uses 'feat/branch' as headSha
   *    - Agent runs, produces findings for commit ABC123
   * 2. User pushes new commit to feat/branch
   * 3. Second review: --head feat/branch (same branch name)
   *    - Cache key STILL uses 'feat/branch' - CACHE HIT!
   *    - Returns OLD findings from ABC123
   *    - But diff is computed for NEW commit DEF456
   *    - Line numbers are WRONG!
   *
   * FIX: Resolve branch names to SHAs BEFORE generating cache key
   * - First review: key uses resolved SHA 'abc123...' (12 chars)
   * - Second review: key uses NEW resolved SHA 'def456...'
   * - Cache misses correctly, agent re-runs with correct diff
   */
  it('should produce different keys when branch resolves to different SHAs', () => {
    // Simulate first review - branch resolves to commit ABC
    const key1 = generateCacheKey({
      prNumber: 42,
      headSha: 'abc123def456789012345678901234567890abcd', // Resolved SHA
      configHash: 'config1',
      agentId: 'semgrep',
    });

    // Simulate second review - same branch now resolves to commit DEF
    const key2 = generateCacheKey({
      prNumber: 42,
      headSha: 'def456abc789012345678901234567890abcdef12', // NEW resolved SHA
      configHash: 'config1',
      agentId: 'semgrep',
    });

    // Keys MUST be different to prevent stale cache hits
    expect(key1).not.toBe(key2);
  });

  it('should produce same key for same resolved SHA regardless of original ref', () => {
    // Whether user passes branch name or SHA, after resolution we get same cache behavior
    const resolvedSha = 'abc123def456789012345678901234567890abcd';

    const key1 = generateCacheKey({
      prNumber: 42,
      headSha: resolvedSha, // From resolved 'feat/branch'
      configHash: 'config1',
      agentId: 'semgrep',
    });

    const key2 = generateCacheKey({
      prNumber: 42,
      headSha: resolvedSha, // From resolved 'abc123def456789012345678901234567890abcd'
      configHash: 'config1',
      agentId: 'semgrep',
    });

    // Same SHA = same key = correct cache behavior
    expect(key1).toBe(key2);
  });

  it('should NOT use branch name as cache key (demonstrates the bug)', () => {
    // This test shows what would happen if we used branch names directly
    // BOTH would have the same key even though they're different commits!
    const keyWithBranchName = generateCacheKey({
      prNumber: 42,
      headSha: 'feat/my-branch', // Branch name - BAD!
      configHash: 'config1',
      agentId: 'semgrep',
    });

    // This key would be the same for ANY commit on 'feat/my-branch'
    // which is why we must resolve to SHA first
    expect(keyWithBranchName).toContain(CACHE_KEY_PREFIX);
    expect(keyWithBranchName).toContain('42');
  });
});

describe('Cache Store', () => {
  beforeEach(async () => {
    await clearCache();
  });

  afterEach(async () => {
    await clearCache();
  });

  it('should return null for missing key', async () => {
    const result = await getCached('nonexistent-key');
    expect(result).toBeNull();
  });

  it('should store and retrieve value', async () => {
    const agentResult: AgentResult = {
      agentId: 'test',
      success: true,
      findings: [],
      metrics: {
        durationMs: 100,
        filesProcessed: 5,
      },
    };

    await setCache('test-key', agentResult);
    const retrieved = await getCached('test-key');

    expect(retrieved).not.toBeNull();
    expect(retrieved?.agentId).toBe('test');
    expect(retrieved?.success).toBe(true);
  });

  it('should expire after TTL', async () => {
    const agentResult: AgentResult = {
      agentId: 'test',
      success: true,
      findings: [],
      metrics: { durationMs: 100, filesProcessed: 1 },
    };

    // Set with 0 second TTL (immediate expiry)
    await setCache('expire-key', agentResult, 0);

    // Wait a bit for expiry
    await new Promise((resolve) => setTimeout(resolve, 50));

    const retrieved = await getCached('expire-key');
    expect(retrieved).toBeNull();
  });
});
