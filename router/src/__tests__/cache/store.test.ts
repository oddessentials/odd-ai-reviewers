/**
 * Cache Store Tests
 *
 * Tests for cache storage, retrieval, and validation logic.
 * Covers legacy cache handling (FR-005) and schema validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCached, setCache, clearCache, findCachedForPR } from '../../cache/store.js';
import { AgentSuccess, AgentFailure, AgentResultSchema } from '../../agents/types.js';
import * as fs from 'fs';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));

// Mock homedir to avoid filesystem access
vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

// Mock buildRouterEnv to control cache directory
vi.mock('../../agents/security.js', () => ({
  buildRouterEnv: vi.fn(() => ({})),
}));

describe('Cache Store', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the memory cache before each test to ensure isolation
    await clearCache();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('getCached validation (FR-005)', () => {
    it('should return null for legacy cache entry (success: boolean format)', async () => {
      // Legacy format used success: boolean instead of status discriminant
      const legacyCacheEntry = {
        key: 'test-key',
        result: {
          agentId: 'semgrep',
          success: true, // Legacy format
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 5 },
        },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyCacheEntry));

      const result = await getCached('test-key');

      // Legacy entries should be treated as cache miss
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('invalid format, treating as miss')
      );
    });

    it('should return validated result for new-format cache entry', async () => {
      const validResult = AgentSuccess({
        agentId: 'semgrep',
        findings: [{ severity: 'warning', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' }],
        metrics: { durationMs: 100, filesProcessed: 5 },
      });

      const validCacheEntry = {
        key: 'test-key',
        result: validResult,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCacheEntry));

      const result = await getCached('test-key');

      expect(result).not.toBeNull();
      expect(result?.agentId).toBe('semgrep');
      expect(consoleLogSpy).toHaveBeenCalledWith('[cache] File hit: test-key');
    });

    it('should return null for malformed/corrupted cache entry', async () => {
      const corruptedEntry = {
        key: 'test-key',
        result: {
          // Missing required fields
          agentId: 'semgrep',
          // no status, no findings, etc.
        },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(corruptedEntry));

      const result = await getCached('test-key');

      expect(result).toBeNull();
    });

    it('should validate failure results with partialFindings', async () => {
      const failureResult = AgentFailure({
        agentId: 'semgrep',
        error: 'Timeout',
        failureStage: 'exec',
        partialFindings: [
          { severity: 'error', file: 'b.ts', message: 'Partial', sourceAgent: 'semgrep' },
        ],
        metrics: { durationMs: 30000, filesProcessed: 2 },
      });

      const validCacheEntry = {
        key: 'test-key',
        result: failureResult,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCacheEntry));

      const result = await getCached('test-key');

      expect(result).not.toBeNull();
      expect(result?.status).toBe('failure');
    });
  });

  describe('AgentResultSchema validation', () => {
    it('should accept valid success result', () => {
      const result = AgentSuccess({
        agentId: 'test',
        findings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      });

      const parsed = AgentResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('should accept valid failure result', () => {
      const result = AgentFailure({
        agentId: 'test',
        error: 'Test error',
        failureStage: 'exec',
        metrics: { durationMs: 100, filesProcessed: 0 },
      });

      const parsed = AgentResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it('should reject legacy success: boolean format', () => {
      const legacyResult = {
        agentId: 'test',
        success: true, // Legacy format
        findings: [],
      };

      const parsed = AgentResultSchema.safeParse(legacyResult);
      expect(parsed.success).toBe(false);
    });

    it('should reject missing status discriminant', () => {
      const invalidResult = {
        agentId: 'test',
        findings: [],
      };

      const parsed = AgentResultSchema.safeParse(invalidResult);
      expect(parsed.success).toBe(false);
    });
  });

  describe('cache stores only validated results', () => {
    it('setCache should store valid results', async () => {
      const validResult = AgentSuccess({
        agentId: 'semgrep',
        findings: [],
        metrics: { durationMs: 100, filesProcessed: 5 },
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      await setCache('test-key', validResult);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = JSON.parse(writeCall?.[1] as string);

      // Verify the stored result is the valid one
      expect(writtenData.result.status).toBe('success');
      expect(writtenData.result.agentId).toBe('semgrep');
    });

    it('memory cache should store validated results after file hit', async () => {
      const validResult = AgentSuccess({
        agentId: 'reviewdog',
        findings: [{ severity: 'info', file: 'c.ts', message: 'Info', sourceAgent: 'reviewdog' }],
        metrics: { durationMs: 50, filesProcessed: 3 },
      });

      const validCacheEntry = {
        key: 'memory-test-key',
        result: validResult,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCacheEntry));

      // First call reads from file
      const result1 = await getCached('memory-test-key');
      expect(result1).not.toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith('[cache] File hit: memory-test-key');

      // Reset mocks for second call
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // Second call should hit memory cache
      const result2 = await getCached('memory-test-key');
      expect(result2).not.toBeNull();
      expect(consoleLogSpy).toHaveBeenCalledWith('[cache] Memory hit: memory-test-key');

      // Both results should be identical
      expect(result1?.agentId).toBe(result2?.agentId);
    });
  });

  describe('cache key validation (security)', () => {
    /**
     * These tests verify the cache key validation rejects dangerous inputs.
     * Each test class covers a specific injection/traversal vector.
     */

    it('should reject keys with forward slash (path separator)', async () => {
      await expect(getCached('../etc/passwd')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo/bar')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject keys with backslash (Windows path separator)', async () => {
      await expect(getCached('..\\windows\\system32')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo\\bar')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject keys with percent encoding (bypass attempts)', async () => {
      await expect(getCached('%2e%2e%2f')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo%00bar')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject keys with colon (Windows drive letters)', async () => {
      await expect(getCached('C:foo')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('D:\\bar')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject keys with dot-dot traversal sequences', async () => {
      await expect(getCached('..')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo..bar')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('..foo')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject keys with whitespace (injection vectors)', async () => {
      await expect(getCached('foo bar')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo\tbar')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo\nbar')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo\rbar')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject keys with shell metacharacters (command injection)', async () => {
      await expect(getCached('foo;rm -rf /')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo&whoami')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo|cat /etc/passwd')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo`id`bar')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo$HOME')).rejects.toThrow('Invalid cache key format');
      await expect(getCached('foo$(id)')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject empty keys', async () => {
      await expect(getCached('')).rejects.toThrow('Invalid cache key format');
    });

    it('should reject excessively long keys', async () => {
      const longKey = 'a'.repeat(257);
      await expect(getCached(longKey)).rejects.toThrow('Invalid cache key format');
    });

    it('should accept valid cache keys', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      // These should not throw (return null for missing cache is expected)
      await expect(getCached('ai-review-v2-123-abc123def456')).resolves.toBeNull();
      await expect(getCached('my-valid-cache-key')).resolves.toBeNull();
      await expect(getCached('KEY123-with-MIXED-case')).resolves.toBeNull();
    });
  });

  describe('findCachedForPR validation (US2)', () => {
    it('should return null for legacy cache entry in fallback path', async () => {
      // Legacy format used success: boolean instead of status discriminant
      const legacyCacheEntry = {
        key: 'ai-review-v2-123-abc123',
        result: {
          agentId: 'semgrep',
          success: true, // Legacy format - no status field
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 5 },
        },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-123-abc123.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyCacheEntry));

      const result = await findCachedForPR(123);

      // Legacy entry should be treated as cache miss
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fallback entry invalid format, skipping')
      );
    });

    it('should return validated result for valid cache entry in fallback path', async () => {
      const validResult = AgentSuccess({
        agentId: 'semgrep',
        findings: [{ severity: 'warning', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' }],
        metrics: { durationMs: 100, filesProcessed: 5 },
      });

      const validCacheEntry = {
        key: 'ai-review-v2-456-def456',
        result: validResult,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-456-def456.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validCacheEntry));

      const result = await findCachedForPR(456);

      expect(result).not.toBeNull();
      expect(result?.agentId).toBe('semgrep');
      expect(result?.status).toBe('success');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fallback hit for PR 456')
      );
    });

    it('should skip invalid entries and try next file in fallback path', async () => {
      const legacyEntry = {
        key: 'ai-review-v2-789-legacy',
        result: { agentId: 'old', success: true, findings: [] }, // Legacy format
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      const validResult = AgentSuccess({
        agentId: 'new-agent',
        findings: [],
        metrics: { durationMs: 50, filesProcessed: 1 },
      });

      const validEntry = {
        key: 'ai-review-v2-789-valid',
        result: validResult,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      // Files sorted reverse, so legacy comes first
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-789-valid.json',
        'ai-review-v2-789-legacy.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);

      // Return different content based on file path
      vi.mocked(fs.readFileSync).mockImplementation((path) => {
        if (String(path).includes('legacy')) {
          return JSON.stringify(legacyEntry);
        }
        return JSON.stringify(validEntry);
      });

      const result = await findCachedForPR(789);

      // Should skip legacy and return valid entry
      expect(result).not.toBeNull();
      expect(result?.agentId).toBe('new-agent');
    });
  });
});
