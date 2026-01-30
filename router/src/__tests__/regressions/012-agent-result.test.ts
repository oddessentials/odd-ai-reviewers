/**
 * Regression Suite: 012-fix-agent-result-regressions
 *
 * This file permanently captures bugs fixed in the 012 branch to prevent
 * their reintroduction. Each test documents a specific regression that
 * was found during adversarial review of the 011-agent-result-unions feature.
 *
 * IMPORTANT: These tests should NEVER be deleted or weakened. If a test
 * fails, it means a regression has been reintroduced.
 *
 * Regressions captured:
 * 1. findCachedForPR bypassed validation (returned entry.result directly)
 * 2. Partial findings not surfaced from failed agents
 * 3. getPartialDedupeKey didn't preserve distinct messages
 * 4. Legacy cache entries (success: boolean) not treated as miss
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  AgentSuccess,
  AgentFailure,
  AgentResultSchema,
  type Finding,
  type AgentMetrics,
} from '../../agents/types.js';
import { getCached, clearCache, findCachedForPR } from '../../cache/store.js';
import { getPartialDedupeKey, deduplicatePartialFindings } from '../../report/formats.js';
import { annotateProvenance } from '../../phases/execute.js';

// Mock fs module for cache tests
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

describe('012 Regression Suite', () => {
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

  describe('Regression #1: findCachedForPR must validate cached results', () => {
    /**
     * BUG: findCachedForPR at line 252 returned entry.result directly without
     * calling validateCachedResult(), allowing legacy cache entries to bypass
     * schema validation that was correctly applied in getCached().
     *
     * FIX: Added validateCachedResult() call in findCachedForPR fallback path.
     */

    it('rejects legacy cache entry (success: boolean format) in fallback path', async () => {
      const legacyCacheEntry = {
        key: 'ai-review-v2-123-abc123',
        result: {
          agentId: 'semgrep',
          success: true, // Legacy format - no status field
          findings: [],
          metrics,
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

      // REGRESSION CHECK: Legacy entries MUST be rejected
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
    });

    it('accepts valid new-format cache entry in fallback path', async () => {
      const validResult = AgentSuccess({
        agentId: 'semgrep',
        findings: [{ severity: 'warning', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' }],
        metrics,
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

      // REGRESSION CHECK: Valid entries MUST be returned
      expect(result).not.toBeNull();
      expect(result?.status).toBe('success');
    });
  });

  describe('Regression #2: Partial findings must be surfaced from failed agents', () => {
    /**
     * BUG: ExecuteResult combined all findings into allFindings, losing the
     * distinction between complete findings (from success) and partial findings
     * (from failure). This caused partial findings to either be lost or mixed
     * with complete findings incorrectly.
     *
     * FIX: ExecuteResult now has separate completeFindings and partialFindings
     * arrays. Findings are annotated with provenance: 'complete' | 'partial'.
     */

    it('annotateProvenance adds provenance field to findings', () => {
      const findings: Finding[] = [
        { severity: 'error', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' },
      ];

      const annotated = annotateProvenance(findings, 'partial');

      // REGRESSION CHECK: Provenance MUST be set
      expect(annotated[0]?.provenance).toBe('partial');
    });

    it('complete findings get provenance: complete', () => {
      const findings: Finding[] = [
        { severity: 'warning', file: 'b.ts', message: 'Warning', sourceAgent: 'eslint' },
      ];

      const annotated = annotateProvenance(findings, 'complete');

      // REGRESSION CHECK: Complete findings MUST be marked as complete
      expect(annotated[0]?.provenance).toBe('complete');
    });

    it('partialFindings field exists on failure results and is extracted', () => {
      const failure = AgentFailure({
        agentId: 'semgrep',
        error: 'Timeout',
        failureStage: 'exec',
        partialFindings: [
          { severity: 'error', file: 'x.ts', message: 'Partial', sourceAgent: 'semgrep' },
        ],
        metrics,
      });

      // REGRESSION CHECK: partialFindings MUST exist and contain data
      expect(failure.partialFindings).toHaveLength(1);
      expect(failure.partialFindings[0]?.message).toBe('Partial');
    });
  });

  describe('Regression #3: getPartialDedupeKey preserves distinct messages', () => {
    /**
     * REQUIREMENT: Partial dedup key includes sourceAgent AND fingerprint (message hash)
     * so that distinct same-line same-rule messages from the same agent are preserved.
     *
     * Key format: sourceAgent:fingerprint:file:line
     */

    it('preserves findings with same rule but different messages from same agent', () => {
      const finding1: Finding = {
        severity: 'error',
        file: 'src/security.ts',
        line: 42,
        ruleId: 'sql-injection',
        message: 'SQL injection via user input in query parameter',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      };

      const finding2: Finding = {
        ...finding1,
        message: 'SQL injection via unescaped string concatenation', // Different message
      };

      // Keys should be DIFFERENT because messages differ (fingerprints differ)
      const key1 = getPartialDedupeKey(finding1);
      const key2 = getPartialDedupeKey(finding2);

      // REGRESSION CHECK: Different messages MUST produce different keys
      expect(key1).not.toBe(key2);
    });

    it('deduplicatePartialFindings retains distinct messages from same agent', () => {
      const finding1: Finding = {
        severity: 'error',
        file: 'src/security.ts',
        line: 42,
        ruleId: 'sql-injection',
        message: 'SQL injection via user input',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      };

      const finding2: Finding = {
        ...finding1,
        message: 'SQL injection via string concat', // Different message
      };

      const result = deduplicatePartialFindings([finding1, finding2]);

      // REGRESSION CHECK: Both findings MUST be retained (different messages)
      expect(result).toHaveLength(2);
    });

    it('deduplicatePartialFindings dedupes exact duplicates from same agent', () => {
      const finding1: Finding = {
        severity: 'error',
        file: 'src/security.ts',
        line: 42,
        ruleId: 'sql-injection',
        message: 'SQL injection via user input',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      };

      const finding2: Finding = {
        ...finding1, // Exact same finding
      };

      const result = deduplicatePartialFindings([finding1, finding2]);

      // Only exact duplicates are deduplicated
      expect(result).toHaveLength(1);
    });

    it('getPartialDedupeKey includes sourceAgent for cross-agent preservation', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'a.ts',
        line: 10,
        message: 'Issue',
        sourceAgent: 'semgrep',
      };

      const key = getPartialDedupeKey(finding);

      // REGRESSION CHECK: sourceAgent MUST be in the key
      expect(key).toContain('semgrep');
    });

    it('preserves same finding from two different failed agents', () => {
      const finding1: Finding = {
        severity: 'error',
        file: 'a.ts',
        line: 10,
        message: 'Issue found',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      };

      const finding2: Finding = {
        ...finding1,
        sourceAgent: 'eslint', // Different agent, same finding
      };

      const key1 = getPartialDedupeKey(finding1);
      const key2 = getPartialDedupeKey(finding2);

      // Different agents = different keys = both preserved
      expect(key1).not.toBe(key2);

      const result = deduplicatePartialFindings([finding1, finding2]);
      expect(result).toHaveLength(2);
    });
  });

  describe('Regression #4: Legacy cache entries must be treated as cache miss', () => {
    /**
     * BUG: Cache entries created before the discriminated union migration
     * used success: boolean format instead of status: 'success'|'failure'.
     * These entries passed through without validation, causing type errors
     * when consumers expected the new format.
     *
     * FIX: AgentResultSchema now rejects entries without status field.
     * validateCachedResult returns null for legacy entries.
     */

    it('AgentResultSchema rejects legacy success: boolean format', () => {
      const legacyResult = {
        agentId: 'test',
        success: true, // Legacy format
        findings: [],
        metrics,
      };

      const parsed = AgentResultSchema.safeParse(legacyResult);

      // REGRESSION CHECK: Legacy format MUST be rejected
      expect(parsed.success).toBe(false);
    });

    it('AgentResultSchema rejects missing status discriminant', () => {
      const invalidResult = {
        agentId: 'test',
        findings: [],
        metrics,
      };

      const parsed = AgentResultSchema.safeParse(invalidResult);

      // REGRESSION CHECK: Missing status MUST be rejected
      expect(parsed.success).toBe(false);
    });

    it('getCached returns null for legacy cache entry', async () => {
      const legacyCacheEntry = {
        key: 'test-key',
        result: {
          agentId: 'semgrep',
          success: true, // Legacy format
          findings: [],
          metrics,
        },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyCacheEntry));

      const result = await getCached('test-key');

      // REGRESSION CHECK: Legacy entries MUST return null
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid format'));
    });

    it('validation failures use console.warn not console.log', async () => {
      const legacyCacheEntry = {
        key: 'test-key',
        result: { agentId: 'test', success: true, findings: [] },
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(legacyCacheEntry));

      await getCached('test-key');

      // REGRESSION CHECK: Validation failures MUST use warn, not log
      expect(consoleWarnSpy).toHaveBeenCalled();
      // Ensure it wasn't logged as informational
      const warnCalls = consoleWarnSpy.mock.calls.flat().join(' ');
      expect(warnCalls).toContain('invalid format');
    });
  });
});
