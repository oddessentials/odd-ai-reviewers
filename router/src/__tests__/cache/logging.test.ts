/**
 * Cache Logging Semantics Tests
 *
 * These tests verify that the cache system uses consistent and appropriate
 * logging patterns:
 *
 * 1. console.log for successful operations (hits, writes, clears)
 * 2. console.warn for failures and invalid entries
 * 3. Log messages include proper context (keys, PRs, errors)
 * 4. Both getCached and findCachedForPR use consistent logging
 *
 * Contract: Success → console.log, Failure/Warning → console.warn
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { AgentSuccess, AgentFailure, AgentSkipped, type AgentMetrics } from '../../agents/types.js';
import {
  setCache,
  getCached,
  clearCache,
  findCachedForPR,
  cleanupExpired,
} from '../../cache/store.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
};

describe('Cache Logging Semantics', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('getCached logging', () => {
    it('logs cache hit with console.log for valid file entry', async () => {
      const validEntry = {
        key: 'file-hit-key',
        result: AgentSuccess({
          agentId: 'test',
          findings: [],
          metrics,
        }),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await getCached('file-hit-key');

      // SUCCESS: Must use console.log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('File hit'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('file-hit-key'));
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('logs invalid format with console.warn', async () => {
      const legacyEntry = {
        key: 'legacy-key',
        result: {
          agentId: 'test',
          success: true, // Legacy format
          findings: [],
          metrics,
        },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyEntry));

      await getCached('legacy-key');

      // FAILURE: Must use console.warn
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('legacy-key'));
    });

    it('logs file read errors with console.warn', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await getCached('error-key');

      // FAILURE: Must use console.warn
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to read'));
    });

    it('no warning for simple cache miss (file not found)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await getCached('nonexistent-key');

      // MISS (not an error): No console.warn
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('findCachedForPR logging', () => {
    it('logs fallback hit with console.log for valid entry', async () => {
      const validEntry = {
        key: 'ai-review-v2-123-abc123',
        result: AgentSuccess({
          agentId: 'fallback-test',
          findings: [],
          metrics,
        }),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-123-abc123.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await findCachedForPR(123);

      // SUCCESS: Must use console.log with PR number
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Fallback hit'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('PR 123'));
    });

    it('logs invalid fallback entry with console.warn', async () => {
      const legacyEntry = {
        key: 'ai-review-v2-456-legacy',
        result: {
          agentId: 'test',
          success: false, // Legacy format
          error: 'Error',
          findings: [],
          metrics,
        },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-456-legacy.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyEntry));

      await findCachedForPR(456);

      // FAILURE: Must use console.warn
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('skipping'));
    });

    it('no warning for simple fallback miss (no files)', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      await findCachedForPR(789);

      // MISS (not an error): No console.warn
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('setCache logging', () => {
    it('logs successful write with console.log', async () => {
      const result = AgentSuccess({
        agentId: 'set-test',
        findings: [],
        metrics,
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);

      await setCache('write-key', result);

      // SUCCESS: Must use console.log with key and expiration
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Set:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('write-key'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('expires'));
    });

    it('logs write failure with console.warn', async () => {
      const result = AgentSuccess({
        agentId: 'fail-write',
        findings: [],
        metrics,
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {
        throw new Error('Disk full');
      });

      await setCache('fail-write-key', result);

      // FAILURE: Must use console.warn
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to write'));
    });
  });

  describe('clearCache logging', () => {
    it('logs successful clear with console.log', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      await clearCache();

      // SUCCESS: Must use console.log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Cleared'));
    });
  });

  describe('cleanupExpired logging', () => {
    it('logs cleanup count with console.log when entries removed', async () => {
      const expiredEntry = {
        key: 'ai-review-v2-expired-key',
        result: AgentSuccess({ agentId: 'test', findings: [], metrics }),
        createdAt: new Date(Date.now() - 172800000).toISOString(),
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-expired-key.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(expiredEntry));

      await cleanupExpired();

      // SUCCESS: Must use console.log with count
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringMatching(/Cleaned up \d+ expired/));
    });

    it('no log when nothing to clean', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      // Clear the spy calls from beforeEach clearCache
      consoleLogSpy.mockClear();

      await cleanupExpired();

      // No log when count is 0
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Cleaned up'));
    });
  });

  describe('Log message format consistency', () => {
    it('all cache logs use [cache] prefix', async () => {
      // Generate various log scenarios
      const validEntry = {
        key: 'prefix-test',
        result: AgentSuccess({ agentId: 'test', findings: [], metrics }),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await getCached('prefix-test');
      await setCache('prefix-set', AgentSuccess({ agentId: 'x', findings: [], metrics }));
      await clearCache();

      // All logs should have [cache] prefix
      const allLogCalls = consoleLogSpy.mock.calls;
      for (const call of allLogCalls) {
        expect(call[0]).toMatch(/^\[cache\]/);
      }
    });

    it('all cache warnings use [cache] prefix', async () => {
      const legacyEntry = {
        key: 'warn-prefix-test',
        result: { agentId: 'test', success: true }, // Legacy
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyEntry));

      await getCached('warn-prefix-test');

      // All warnings should have [cache] prefix
      const allWarnCalls = consoleWarnSpy.mock.calls;
      for (const call of allWarnCalls) {
        expect(call[0]).toMatch(/^\[cache\]/);
      }
    });
  });

  describe('Logging parity between getCached and findCachedForPR', () => {
    it('both use console.warn for legacy entries', async () => {
      const legacyEntry = {
        key: 'ai-review-v2-999-parity',
        result: { agentId: 'test', success: true }, // Legacy
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      // Test getCached
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyEntry));

      await getCached('ai-review-v2-999-parity');

      const getCachedWarnCount = consoleWarnSpy.mock.calls.length;
      expect(getCachedWarnCount).toBeGreaterThan(0);

      // Reset for findCachedForPR
      vi.clearAllMocks();
      await clearCache();
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-999-parity.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyEntry));

      await findCachedForPR(999);

      const findCachedWarnCount = consoleWarnSpy.mock.calls.length;
      expect(findCachedWarnCount).toBeGreaterThan(0);

      // PARITY: Both should have warned
      expect(getCachedWarnCount).toBeGreaterThan(0);
      expect(findCachedWarnCount).toBeGreaterThan(0);
    });

    it('both use console.log for valid entries', async () => {
      const validEntry = {
        key: 'ai-review-v2-888-valid',
        result: AgentSuccess({ agentId: 'parity', findings: [], metrics }),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      // Test getCached
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await getCached('ai-review-v2-888-valid');

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('hit'));

      // Reset for findCachedForPR
      vi.clearAllMocks();
      await clearCache();
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-888-valid.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await findCachedForPR(888);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('hit'));
    });
  });

  describe('All AgentResult variants log correctly', () => {
    const variants = [
      {
        name: 'success',
        result: AgentSuccess({ agentId: 'log-success', findings: [], metrics }),
      },
      {
        name: 'failure',
        result: AgentFailure({
          agentId: 'log-failure',
          error: 'Test error',
          failureStage: 'exec',
          metrics,
        }),
      },
      {
        name: 'skipped',
        result: AgentSkipped({
          agentId: 'log-skipped',
          reason: 'No files',
          metrics,
        }),
      },
    ];

    for (const { name, result } of variants) {
      it(`${name} variant logs hit with console.log`, async () => {
        const entry = {
          key: `variant-${name}`,
          result,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };

        vi.clearAllMocks();
        await clearCache();
        consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(entry));

        await getCached(`variant-${name}`);

        // All valid variants should log hit, not warn
        expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('hit'));
        expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('invalid'));
      });
    }
  });
});
