/**
 * Exhaustiveness Coverage Tests - Consumer Paths
 *
 * These tests verify that all AgentResult.status variants are handled
 * in actual consumer code paths (not just test functions).
 *
 * The goal is to ensure no silent fallthrough when processing results
 * in the real codebase. Each test exercises a different consumer path
 * with all three variants.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  AgentSuccess,
  AgentFailure,
  AgentSkipped,
  isSuccess,
  isFailure,
  isSkipped,
  type AgentResult,
  type Finding,
  type AgentMetrics,
} from '../../agents/types.js';
import { generateAgentStatusTable, generateFullSummaryMarkdown } from '../../report/formats.js';
import { annotateProvenance } from '../../phases/execute.js';
import { setCache, getCached, clearCache } from '../../cache/store.js';

// Mock fs for cache tests
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

const finding: Finding = {
  severity: 'warning',
  file: 'test.ts',
  line: 10,
  message: 'Test finding',
  sourceAgent: 'test-agent',
};

/**
 * Create all three AgentResult variants for testing.
 * This ensures every test can exercise all paths.
 */
function createAllVariants(): {
  success: AgentResult;
  failure: AgentResult;
  skipped: AgentResult;
} {
  return {
    success: AgentSuccess({
      agentId: 'success-agent',
      findings: [finding],
      metrics,
    }),
    failure: AgentFailure({
      agentId: 'failure-agent',
      error: 'Test error',
      failureStage: 'exec',
      partialFindings: [{ ...finding, sourceAgent: 'failure-agent' }],
      metrics,
    }),
    skipped: AgentSkipped({
      agentId: 'skipped-agent',
      reason: 'No supported files',
      metrics,
    }),
  };
}

describe('Exhaustiveness Coverage - Consumer Paths', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Type guards handle all variants', () => {
    it('isSuccess identifies only success variant', () => {
      const { success, failure, skipped } = createAllVariants();

      expect(isSuccess(success)).toBe(true);
      expect(isSuccess(failure)).toBe(false);
      expect(isSuccess(skipped)).toBe(false);
    });

    it('isFailure identifies only failure variant', () => {
      const { success, failure, skipped } = createAllVariants();

      expect(isFailure(success)).toBe(false);
      expect(isFailure(failure)).toBe(true);
      expect(isFailure(skipped)).toBe(false);
    });

    it('isSkipped identifies only skipped variant', () => {
      const { success, failure, skipped } = createAllVariants();

      expect(isSkipped(success)).toBe(false);
      expect(isSkipped(failure)).toBe(false);
      expect(isSkipped(skipped)).toBe(true);
    });

    it('exactly one type guard returns true for each variant', () => {
      const { success, failure, skipped } = createAllVariants();
      const allVariants = [success, failure, skipped];

      for (const result of allVariants) {
        const guards = [isSuccess(result), isFailure(result), isSkipped(result)];
        const trueCount = guards.filter(Boolean).length;

        // EXHAUSTIVENESS: Exactly one guard must match
        expect(trueCount).toBe(1);
      }
    });
  });

  describe('Finding collection handles all variants', () => {
    it('collects findings only from success variants', () => {
      const { success, failure, skipped } = createAllVariants();
      const results = [success, failure, skipped];

      const completeFindings = results.filter(isSuccess).flatMap((r) => r.findings);

      // Only success contributes to complete findings
      expect(completeFindings).toHaveLength(1);
      expect(completeFindings[0]?.sourceAgent).toBe('test-agent');
    });

    it('collects partialFindings only from failure variants', () => {
      const { success, failure, skipped } = createAllVariants();
      const results = [success, failure, skipped];

      const partialFindings = results.filter(isFailure).flatMap((r) => r.partialFindings);

      // Only failure contributes to partial findings
      expect(partialFindings).toHaveLength(1);
      expect(partialFindings[0]?.sourceAgent).toBe('failure-agent');
    });

    it('skipped variants contribute no findings', () => {
      const { skipped } = createAllVariants();
      const results = [skipped, skipped, skipped];

      const complete = results.filter(isSuccess).flatMap((r) => r.findings);
      const partial = results.filter(isFailure).flatMap((r) => r.partialFindings);

      expect(complete).toHaveLength(0);
      expect(partial).toHaveLength(0);
    });
  });

  describe('Provenance annotation handles all variants', () => {
    it('success findings can be annotated as complete', () => {
      const { success } = createAllVariants();

      if (isSuccess(success)) {
        const annotated = annotateProvenance(success.findings, 'complete');
        expect(annotated).toHaveLength(1);
        expect(annotated[0]?.provenance).toBe('complete');
      }
    });

    it('failure partialFindings can be annotated as partial', () => {
      const { failure } = createAllVariants();

      if (isFailure(failure)) {
        const annotated = annotateProvenance(failure.partialFindings, 'partial');
        expect(annotated).toHaveLength(1);
        expect(annotated[0]?.provenance).toBe('partial');
      }
    });

    it('skipped has no findings to annotate (empty array)', () => {
      // Skipped results have neither findings nor partialFindings
      // This is the expected behavior - nothing to annotate
      const annotated = annotateProvenance([], 'complete');
      expect(annotated).toHaveLength(0);
    });
  });

  describe('Report generation handles all variants', () => {
    it('generateAgentStatusTable handles all status variants', () => {
      // Using createAllVariants() to verify the pattern works
      const variants = createAllVariants();
      expect(variants.success.status).toBe('success');
      expect(variants.failure.status).toBe('failure');
      expect(variants.skipped.status).toBe('skipped');

      const results = [
        { agentId: 'success-agent', success: true, findings: [finding] },
        { agentId: 'failure-agent', success: false, findings: [], error: 'Test error' },
      ];

      const skippedAgents = [
        { id: 'skipped-agent', name: 'Skipped Agent', reason: 'No supported files' },
      ];

      const table = generateAgentStatusTable(results, skippedAgents);

      // All variants appear in table
      expect(table).toContain('success-agent');
      expect(table).toContain('✅ Ran');
      expect(table).toContain('failure-agent');
      expect(table).toContain('❌ Failed');
      expect(table).toContain('skipped-agent');
      expect(table).toContain('⏭️ Skipped');
    });

    it('generateFullSummaryMarkdown handles all result types', () => {
      const completeFindings = [finding];
      const partialFindings = [{ ...finding, provenance: 'partial' as const }];

      const results = [
        { agentId: 'success', success: true, findings: completeFindings },
        { agentId: 'failure', success: false, findings: [], error: 'Error' },
      ];

      const skipped = [{ id: 'skipped', name: 'Skipped', reason: 'Reason' }];

      const markdown = generateFullSummaryMarkdown(
        completeFindings,
        partialFindings,
        results,
        skipped
      );

      // All sections present
      expect(markdown).toContain('AI Code Review Summary');
      expect(markdown).toContain('Partial Findings');
      expect(markdown).toContain('Agent Status');

      // All agents represented
      expect(markdown).toContain('success');
      expect(markdown).toContain('failure');
      expect(markdown).toContain('skipped');
    });
  });

  describe('Cache storage handles all variants', () => {
    it('setCache accepts success variant', async () => {
      const { success } = createAllVariants();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('success-key', success);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string);
      expect(written.result.status).toBe('success');
    });

    it('setCache accepts failure variant', async () => {
      const { failure } = createAllVariants();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('failure-key', failure);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string);
      expect(written.result.status).toBe('failure');
    });

    it('setCache accepts skipped variant', async () => {
      const { skipped } = createAllVariants();

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('skipped-key', skipped);

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0]?.[1] as string);
      expect(written.result.status).toBe('skipped');
    });

    it('getCached returns all variant types correctly', async () => {
      const variants = createAllVariants();

      for (const [name, result] of Object.entries(variants)) {
        vi.clearAllMocks();
        await clearCache();

        // Setup cache entry
        const cacheEntry = {
          key: `${name}-key`,
          result,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        };

        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(cacheEntry));

        const retrieved = await getCached(`${name}-key`);

        // Verify correct status returned
        expect(retrieved).not.toBeNull();
        expect(retrieved?.status).toBe(result.status);
      }
    });
  });

  describe('Counting and aggregation handles all variants', () => {
    it('count results by status', () => {
      const { success, failure, skipped } = createAllVariants();
      const results = [success, success, failure, skipped, skipped, skipped];

      const counts = {
        success: results.filter(isSuccess).length,
        failure: results.filter(isFailure).length,
        skipped: results.filter(isSkipped).length,
      };

      expect(counts.success).toBe(2);
      expect(counts.failure).toBe(1);
      expect(counts.skipped).toBe(3);

      // Total must equal input length
      expect(counts.success + counts.failure + counts.skipped).toBe(results.length);
    });

    it('aggregate metrics across all variants', () => {
      const { success, failure, skipped } = createAllVariants();
      const results = [success, failure, skipped];

      const totalDuration = results.reduce((sum, r) => sum + r.metrics.durationMs, 0);
      const totalFiles = results.reduce((sum, r) => sum + r.metrics.filesProcessed, 0);

      // All variants contribute to metrics (3 * 100ms, 3 * 5 files)
      expect(totalDuration).toBe(300);
      expect(totalFiles).toBe(15);
    });
  });

  describe('Error scenarios for each variant', () => {
    it('success with empty findings is valid', () => {
      const emptySuccess = AgentSuccess({
        agentId: 'clean-agent',
        findings: [],
        metrics,
      });

      expect(isSuccess(emptySuccess)).toBe(true);
      expect(emptySuccess.findings).toHaveLength(0);
    });

    it('failure with empty partialFindings is valid (preflight)', () => {
      const preflightFailure = AgentFailure({
        agentId: 'preflight-fail',
        error: 'Missing config',
        failureStage: 'preflight',
        // No partialFindings
        metrics,
      });

      expect(isFailure(preflightFailure)).toBe(true);
      expect(preflightFailure.partialFindings).toHaveLength(0);
    });

    it('skipped with detailed reason is valid', () => {
      const detailedSkip = AgentSkipped({
        agentId: 'detailed-skip',
        reason: 'No .ts files in diff (only .md, .json files changed)',
        metrics,
      });

      expect(isSkipped(detailedSkip)).toBe(true);
      expect(detailedSkip.reason).toContain('.ts files');
    });
  });
});
