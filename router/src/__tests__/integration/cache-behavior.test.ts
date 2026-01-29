/**
 * Cache Behavior Integration Tests (T061-T062)
 *
 * Tests for cache hit and miss behavior across the review pipeline.
 * Uses hermetic test utilities for deterministic behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FROZEN_TIMESTAMP, setupHermeticTest, teardownHermeticTest } from '../hermetic-setup.js';
import { generateCacheKey, hashConfig, parseCacheKey, CACHE_KEY_PREFIX } from '../../cache/key.js';
import { AgentSuccess, isSuccess, CACHE_SCHEMA_VERSION } from '../../agents/types.js';

describe('Cache Behavior Integration Tests', () => {
  beforeEach(() => {
    setupHermeticTest();
  });

  afterEach(() => {
    teardownHermeticTest();
  });

  describe('Cache Key Generation', () => {
    it('generates deterministic cache keys', () => {
      const inputs = {
        prNumber: 123,
        headSha: 'abc123def456',
        configHash: 'config-hash-123',
        agentId: 'pr_agent',
      };

      const key1 = generateCacheKey(inputs);
      const key2 = generateCacheKey(inputs);

      expect(key1).toBe(key2);
      // (012-fix-agent-result-regressions) - Cache key now includes version prefix
      expect(key1.startsWith(`ai-review-v${CACHE_SCHEMA_VERSION}-123-`)).toBe(true);
      expect(key1).toMatch(/^ai-review-v\d+-\d+-[a-f0-9]+$/);
    });

    it('includes CACHE_SCHEMA_VERSION in key prefix (T027)', () => {
      const inputs = {
        prNumber: 999,
        headSha: 'test-sha',
        configHash: 'test-config',
        agentId: 'test-agent',
      };

      const key = generateCacheKey(inputs);
      expect(key).toContain(`ai-review-v${CACHE_SCHEMA_VERSION}`);
      expect(CACHE_KEY_PREFIX).toBe(`ai-review-v${CACHE_SCHEMA_VERSION}`);
    });

    it('generates different keys for different PRs', () => {
      const baseInputs = {
        headSha: 'abc123',
        configHash: 'config-123',
        agentId: 'semgrep',
      };

      const key1 = generateCacheKey({ ...baseInputs, prNumber: 1 });
      const key2 = generateCacheKey({ ...baseInputs, prNumber: 2 });

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different SHAs', () => {
      const baseInputs = {
        prNumber: 123,
        configHash: 'config-123',
        agentId: 'semgrep',
      };

      const key1 = generateCacheKey({ ...baseInputs, headSha: 'sha-1' });
      const key2 = generateCacheKey({ ...baseInputs, headSha: 'sha-2' });

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different agents', () => {
      const baseInputs = {
        prNumber: 123,
        headSha: 'abc123',
        configHash: 'config-123',
      };

      const key1 = generateCacheKey({ ...baseInputs, agentId: 'semgrep' });
      const key2 = generateCacheKey({ ...baseInputs, agentId: 'pr_agent' });

      expect(key1).not.toBe(key2);
    });

    it('generates different keys when config changes', () => {
      const baseInputs = {
        prNumber: 123,
        headSha: 'abc123',
        agentId: 'semgrep',
      };

      const key1 = generateCacheKey({ ...baseInputs, configHash: 'config-v1' });
      const key2 = generateCacheKey({ ...baseInputs, configHash: 'config-v2' });

      expect(key1).not.toBe(key2);
    });
  });

  describe('Config Hashing', () => {
    it('generates deterministic hash for same config', () => {
      const config = {
        version: 1,
        passes: [{ name: 'fast', agents: ['semgrep'] }],
      };

      const hash1 = hashConfig(config);
      const hash2 = hashConfig(config);

      expect(hash1).toBe(hash2);
    });

    it('generates different hash when config changes', () => {
      // Note: hashConfig uses JSON.stringify with array replacer which only
      // sorts top-level keys. Nested changes in arrays/objects still work
      // because array positions differ.
      const config1 = {
        version: 1,
        agents: ['semgrep'],
      };
      const config2 = {
        version: 2, // Different top-level value
        agents: ['semgrep'],
      };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).not.toBe(hash2);
    });

    it('is insensitive to key order', () => {
      const config1 = { a: 1, b: 2 };
      const config2 = { b: 2, a: 1 };

      const hash1 = hashConfig(config1);
      const hash2 = hashConfig(config2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('Cache Key Parsing', () => {
    it('parses valid versioned cache key', () => {
      // (012-fix-agent-result-regressions) - Test new versioned format
      const key = `ai-review-v${CACHE_SCHEMA_VERSION}-123-abcdef1234567890`;
      const parsed = parseCacheKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed?.version).toBe(CACHE_SCHEMA_VERSION);
      expect(parsed?.prNumber).toBe(123);
      expect(parsed?.hash).toBe('abcdef1234567890');
    });

    it('parses legacy cache key (without version)', () => {
      // Legacy keys should still be parseable for backwards compatibility
      const key = 'ai-review-123-abcdef1234567890';
      const parsed = parseCacheKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed?.prNumber).toBe(123);
      expect(parsed?.hash).toBe('abcdef1234567890');
      expect(parsed?.version).toBeUndefined();
    });

    it('returns null for invalid cache key format', () => {
      expect(parseCacheKey('invalid-key')).toBeNull();
      expect(parseCacheKey('ai-review-')).toBeNull();
      expect(parseCacheKey('ai-review-abc-123')).toBeNull();
    });

    it('handles edge cases in PR numbers', () => {
      const key = `ai-review-v${CACHE_SCHEMA_VERSION}-999999-abcdef1234567890`;
      const parsed = parseCacheKey(key);

      expect(parsed?.prNumber).toBe(999999);
    });
  });

  describe('Cache Hit Behavior (T061)', () => {
    it('should produce same cache key for identical review runs', () => {
      const inputs = {
        prNumber: 42,
        headSha: 'feature-branch-sha',
        configHash: hashConfig({ version: 1, passes: [] }),
        agentId: 'semgrep',
      };

      // Simulate two runs with identical inputs
      const run1Key = generateCacheKey(inputs);
      const run2Key = generateCacheKey(inputs);

      expect(run1Key).toBe(run2Key);
    });

    it('should use deterministic timestamps from hermetic environment', () => {
      const now = new Date().toISOString();
      expect(now).toBe(FROZEN_TIMESTAMP);

      // Cache entries would use this timestamp for TTL
      const entry = {
        createdAt: now,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      expect(entry.createdAt).toBe('2026-01-29T00:00:00.000Z');
      expect(entry.expiresAt).toBe('2026-01-30T00:00:00.000Z');
    });
  });

  describe('Cache Miss Behavior (T062)', () => {
    it('should produce different cache key when SHA changes', () => {
      const baseInputs = {
        prNumber: 42,
        configHash: hashConfig({ version: 1 }),
        agentId: 'semgrep',
      };

      const oldKey = generateCacheKey({ ...baseInputs, headSha: 'old-sha' });
      const newKey = generateCacheKey({ ...baseInputs, headSha: 'new-sha' });

      expect(oldKey).not.toBe(newKey);
    });

    it('should invalidate cache when config changes', () => {
      const baseInputs = {
        prNumber: 42,
        headSha: 'same-sha',
        agentId: 'semgrep',
      };

      // Use different top-level values to ensure different hashes
      const oldConfigHash = hashConfig({ version: 1, enabled: true });
      const newConfigHash = hashConfig({ version: 2, enabled: true });

      const oldKey = generateCacheKey({ ...baseInputs, configHash: oldConfigHash });
      const newKey = generateCacheKey({ ...baseInputs, configHash: newConfigHash });

      expect(oldKey).not.toBe(newKey);
    });
  });

  describe('Cache Entry Structure', () => {
    it('should have valid AgentResult structure for caching', () => {
      const result = AgentSuccess({
        agentId: 'semgrep',
        findings: [
          {
            severity: 'warning',
            file: 'src/index.ts',
            line: 42,
            message: 'Test finding',
            sourceAgent: 'semgrep',
          },
        ],
        metrics: {
          durationMs: 1500,
          filesProcessed: 10,
        },
      });

      // Verify JSON serialization round-trip
      const serialized = JSON.stringify(result);
      const deserialized = JSON.parse(serialized);

      expect(deserialized.agentId).toBe(result.agentId);
      expect(isSuccess(deserialized)).toBe(true);
      expect(deserialized.findings).toHaveLength(1);
      expect(deserialized.findings[0]?.line).toBe(42);
    });
  });
});
