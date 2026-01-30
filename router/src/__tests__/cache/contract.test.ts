/**
 * Cache Contract Tests
 *
 * These tests verify that getCached() and findCachedForPR() maintain
 * identical behavior when validating cache entries. Both functions
 * are entry points to the cache system and MUST accept/reject the
 * same set of cache entries.
 *
 * Contract: If getCached returns null for an entry, findCachedForPR
 * must also return null for the same entry (and vice versa for
 * valid entries).
 *
 * This prevents regressions like the one in 011 where getCached was
 * updated to validate entries but findCachedForPR was not.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import { AgentSuccess, AgentFailure, AgentSkipped, type AgentMetrics } from '../../agents/types.js';
import { getCached, clearCache, findCachedForPR, setCache } from '../../cache/store.js';

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

const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
};

/**
 * Test cases that both cache entrypoints must handle identically.
 * Each case has a name, the cache entry to test, and whether it should be accepted.
 */
interface ContractTestCase {
  name: string;
  entry: {
    key: string;
    result: unknown;
    createdAt: string;
    expiresAt: string;
  };
  shouldAccept: boolean;
  description: string;
}

const contractTestCases: ContractTestCase[] = [
  {
    name: 'valid success result (new format)',
    entry: {
      key: 'valid-success-key',
      result: AgentSuccess({
        agentId: 'semgrep',
        findings: [{ severity: 'warning', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' }],
        metrics,
      }),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: true,
    description: 'Valid success entries with status field MUST be accepted',
  },
  {
    name: 'valid failure result (new format)',
    entry: {
      key: 'valid-failure-key',
      result: AgentFailure({
        agentId: 'eslint',
        error: 'Timeout',
        failureStage: 'exec',
        partialFindings: [
          { severity: 'error', file: 'b.ts', message: 'Error', sourceAgent: 'eslint' },
        ],
        metrics,
      }),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: true,
    description: 'Valid failure entries with status field MUST be accepted',
  },
  {
    name: 'valid skipped result (new format)',
    entry: {
      key: 'valid-skipped-key',
      result: AgentSkipped({
        agentId: 'reviewdog',
        reason: 'No supported files',
        metrics,
      }),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: true,
    description: 'Valid skipped entries with status field MUST be accepted',
  },
  {
    name: 'legacy success: boolean format',
    entry: {
      key: 'legacy-success-key',
      result: {
        agentId: 'semgrep',
        success: true, // Legacy format - no status field
        findings: [],
        metrics,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Legacy entries with success: boolean MUST be rejected',
  },
  {
    name: 'legacy success: false format',
    entry: {
      key: 'legacy-failure-key',
      result: {
        agentId: 'eslint',
        success: false, // Legacy format
        error: 'Error',
        findings: [],
        metrics,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Legacy failure entries with success: false MUST be rejected',
  },
  {
    name: 'missing status discriminant',
    entry: {
      key: 'no-status-key',
      result: {
        agentId: 'test',
        findings: [],
        metrics,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Entries without status field MUST be rejected',
  },
  {
    name: 'corrupted - missing agentId',
    entry: {
      key: 'no-agentid-key',
      result: {
        status: 'success',
        findings: [],
        metrics,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Entries without agentId MUST be rejected',
  },
  {
    name: 'corrupted - missing metrics',
    entry: {
      key: 'no-metrics-key',
      result: {
        status: 'success',
        agentId: 'test',
        findings: [],
        // metrics missing
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Entries without metrics MUST be rejected',
  },
  {
    name: 'corrupted - invalid status value',
    entry: {
      key: 'invalid-status-key',
      result: {
        status: 'unknown', // Invalid status
        agentId: 'test',
        findings: [],
        metrics,
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Entries with invalid status MUST be rejected',
  },
  {
    name: 'corrupted - null result',
    entry: {
      key: 'null-result-key',
      result: null,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Null result MUST be rejected',
  },
  {
    name: 'corrupted - empty object result',
    entry: {
      key: 'empty-result-key',
      result: {},
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Empty object result MUST be rejected',
  },
  {
    name: 'failure result missing error field',
    entry: {
      key: 'failure-no-error-key',
      result: {
        status: 'failure',
        agentId: 'test',
        failureStage: 'exec',
        partialFindings: [],
        metrics,
        // error field missing
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Failure results without error field MUST be rejected',
  },
  {
    name: 'skipped result missing reason field',
    entry: {
      key: 'skipped-no-reason-key',
      result: {
        status: 'skipped',
        agentId: 'test',
        metrics,
        // reason field missing
      },
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
    shouldAccept: false,
    description: 'Skipped results without reason field MUST be rejected',
  },
];

describe('Cache Entrypoint Contract Tests', () => {
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

  describe('getCached and findCachedForPR must handle entries identically', () => {
    for (const testCase of contractTestCases) {
      it(`both ${testCase.shouldAccept ? 'ACCEPT' : 'REJECT'}: ${testCase.name}`, async () => {
        // Setup getCached to find the entry
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(testCase.entry));

        const getCachedResult = await getCached(testCase.entry.key);

        // Reset mocks for findCachedForPR
        vi.clearAllMocks();
        await clearCache();

        // Setup findCachedForPR to find the same entry
        // Filename must match pattern: ai-review-v2-{prNumber}-{hash}.json
        const prNumber = 123;
        const filename = `ai-review-v2-${prNumber}-abc123.json`;
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readdirSync).mockReturnValue([filename] as unknown as ReturnType<
          typeof fs.readdirSync
        >);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(testCase.entry));

        const findCachedResult = await findCachedForPR(prNumber);

        // CONTRACT VERIFICATION
        if (testCase.shouldAccept) {
          expect(getCachedResult).not.toBeNull();
          expect(findCachedResult).not.toBeNull();
          // Both should return a result with status field
          expect(getCachedResult?.status).toBeDefined();
          expect(findCachedResult?.status).toBeDefined();
        } else {
          expect(getCachedResult).toBeNull();
          expect(findCachedResult).toBeNull();
        }
      });
    }
  });

  describe('Contract: Expired entries are rejected by both', () => {
    it('both reject expired valid entries', async () => {
      const expiredEntry = {
        key: 'expired-key',
        result: AgentSuccess({
          agentId: 'test',
          findings: [],
          metrics,
        }),
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        expiresAt: new Date(Date.now() - 86400000).toISOString(), // Expired yesterday
      };

      // Test getCached
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(expiredEntry));

      const getCachedResult = await getCached('expired-key');
      expect(getCachedResult).toBeNull();

      // Reset and test findCachedForPR
      vi.clearAllMocks();
      await clearCache();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-123-expired.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(expiredEntry));

      const findCachedResult = await findCachedForPR(123);
      expect(findCachedResult).toBeNull();
    });
  });

  describe('Contract: Logging behavior is consistent', () => {
    it('both use console.warn for validation failures', async () => {
      const invalidEntry = {
        key: 'invalid-key',
        result: { agentId: 'test', success: true }, // Legacy format
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      // Test getCached logs warning
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidEntry));

      await getCached('invalid-key');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));

      // Reset and test findCachedForPR logs warning
      vi.clearAllMocks();
      await clearCache();
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-123-abc123.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(invalidEntry));

      await findCachedForPR(123);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
    });

    it('both use console.log for successful cache hits', async () => {
      const validEntry = {
        key: 'valid-key',
        result: AgentSuccess({
          agentId: 'test',
          findings: [],
          metrics,
        }),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      // Test getCached logs hit
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await getCached('valid-key');
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('hit'));

      // Reset and test findCachedForPR logs hit
      vi.clearAllMocks();
      await clearCache();
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'ai-review-v2-456-abc456.json',
      ] as unknown as ReturnType<typeof fs.readdirSync>);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validEntry));

      await findCachedForPR(456);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Fallback hit'));
    });
  });

  describe('Contract: Round-trip consistency', () => {
    it('setCache writes entries that getCached accepts', async () => {
      const validResult = AgentSuccess({
        agentId: 'roundtrip-test',
        findings: [
          { severity: 'info', file: 'test.ts', message: 'Info message', sourceAgent: 'test' },
        ],
        metrics,
      });

      // Setup for setCache to write
      vi.mocked(fs.existsSync).mockReturnValue(true);

      await setCache('roundtrip-key', validResult);

      // Capture what was written
      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Reset and setup getCached to read what was written
      vi.clearAllMocks();
      await clearCache();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('roundtrip-key');

      // CONTRACT: setCache output MUST be accepted by getCached
      expect(retrieved).not.toBeNull();
      expect(retrieved?.status).toBe('success');
      expect(retrieved?.agentId).toBe('roundtrip-test');
    });
  });
});
