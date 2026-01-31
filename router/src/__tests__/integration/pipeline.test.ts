/**
 * Pipeline Integration Tests
 *
 * End-to-end tests for the full finding processing pipeline:
 * execute → cache → dedupe → render
 *
 * These tests verify that findings flow correctly through all stages
 * and that partial findings from failed agents are properly:
 * 1. Collected during execution
 * 2. Annotated with provenance
 * 3. Deduplicated separately from complete findings
 * 4. Rendered in the dedicated partial findings section
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  AgentSuccess,
  AgentFailure,
  isSuccess,
  isFailure,
  type AgentMetrics,
  type Finding,
  type AgentResult,
} from '../../agents/types.js';
import { setCache, getCached, clearCache } from '../../cache/store.js';
import {
  deduplicateFindings,
  deduplicatePartialFindings,
  generateSummaryMarkdown,
  renderPartialFindingsSection,
  generateFullSummaryMarkdown,
} from '../../report/formats.js';
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

// Mock homedir
vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
};

function createFinding(
  id: string,
  agent: string,
  severity: 'error' | 'warning' | 'info' = 'warning'
): Finding {
  return {
    severity,
    file: `src/${id}.ts`,
    line: 10,
    message: `Finding ${id} from ${agent}`,
    sourceAgent: agent,
  };
}

describe('Pipeline Integration Tests', () => {
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

  describe('Full pipeline: execute → cache → dedupe → render', () => {
    it('complete findings flow through pipeline with correct provenance', async () => {
      // Stage 1: Simulate agent execution results
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'semgrep',
          findings: [createFinding('s1', 'semgrep'), createFinding('s2', 'semgrep')],
          metrics,
        }),
        AgentSuccess({
          agentId: 'eslint',
          findings: [createFinding('e1', 'eslint')],
          metrics,
        }),
      ];

      // Stage 2: Collect and annotate findings (simulating execute phase)
      const completeFindings = results
        .filter(isSuccess)
        .flatMap((r) => annotateProvenance(r.findings, 'complete'));

      // Verify provenance annotation
      expect(completeFindings).toHaveLength(3);
      expect(completeFindings.every((f) => f.provenance === 'complete')).toBe(true);

      // Stage 3: Cache results (simulating cache write)
      vi.mocked(fs.existsSync).mockReturnValue(true);
      for (const result of results) {
        await setCache(`test-${result.agentId}`, result);
      }
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);

      // Stage 4: Deduplicate
      const deduplicated = deduplicateFindings(completeFindings);
      expect(deduplicated).toHaveLength(3); // All distinct

      // Stage 5: Render
      const markdown = generateSummaryMarkdown(deduplicated);
      expect(markdown).toContain('AI Code Review Summary');
      expect(markdown).toContain('s1.ts');
      expect(markdown).toContain('s2.ts');
      expect(markdown).toContain('e1.ts');
    });

    it('partial findings flow through pipeline with separate handling', async () => {
      // Stage 1: Simulate mixed results with partial findings
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'semgrep',
          findings: [createFinding('complete1', 'semgrep')],
          metrics,
        }),
        AgentFailure({
          agentId: 'eslint',
          error: 'Timeout after processing 3 files',
          failureStage: 'exec',
          partialFindings: [
            createFinding('partial1', 'eslint'),
            createFinding('partial2', 'eslint'),
          ],
          metrics,
        }),
      ];

      // Stage 2: Collect and annotate (simulating execute phase separation)
      const completeFindings = results
        .filter(isSuccess)
        .flatMap((r) => annotateProvenance(r.findings, 'complete'));

      const partialFindings = results
        .filter(isFailure)
        .flatMap((r) => annotateProvenance(r.partialFindings, 'partial'));

      // Verify separation
      expect(completeFindings).toHaveLength(1);
      expect(partialFindings).toHaveLength(2);
      expect(completeFindings[0]?.provenance).toBe('complete');
      expect(partialFindings.every((f) => f.provenance === 'partial')).toBe(true);

      // Stage 3: Deduplicate separately
      const dedupedComplete = deduplicateFindings(completeFindings);
      const dedupedPartial = deduplicatePartialFindings(partialFindings);

      expect(dedupedComplete).toHaveLength(1);
      expect(dedupedPartial).toHaveLength(2);

      // Stage 4: Render full summary with both sections
      const fullMarkdown = generateFullSummaryMarkdown(
        dedupedComplete,
        dedupedPartial,
        results.map((r) => ({
          agentId: r.agentId,
          success: r.status === 'success',
          findings: isSuccess(r) ? r.findings : [],
          error: isFailure(r) ? r.error : undefined,
        })),
        []
      );

      // Verify complete findings section
      expect(fullMarkdown).toContain('AI Code Review Summary');
      expect(fullMarkdown).toContain('complete1.ts');

      // Verify partial findings section is rendered
      expect(fullMarkdown).toContain('Partial Findings');
      expect(fullMarkdown).toContain('partial1.ts');
      expect(fullMarkdown).toContain('partial2.ts');
      expect(fullMarkdown).toContain('do NOT affect gating');
    });

    it('cross-agent deduplication works for complete findings', () => {
      // Same issue found by two agents
      const finding1: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        line: 42,
        message: 'SQL injection vulnerability',
        sourceAgent: 'semgrep',
        provenance: 'complete',
      };

      const finding2: Finding = {
        ...finding1,
        sourceAgent: 'codeql', // Different agent, same issue
      };

      const deduplicated = deduplicateFindings([finding1, finding2]);

      // Cross-agent dedup: only one should remain
      expect(deduplicated).toHaveLength(1);
    });

    it('partial findings preserve cross-agent duplicates', () => {
      // Same issue found by two failed agents
      const finding1: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        line: 42,
        message: 'SQL injection vulnerability',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      };

      const finding2: Finding = {
        ...finding1,
        sourceAgent: 'codeql', // Different agent, same issue
      };

      const deduplicated = deduplicatePartialFindings([finding1, finding2]);

      // Partial dedup: both should remain (different agents)
      expect(deduplicated).toHaveLength(2);
    });
  });

  describe('Failure with partial findings scenario', () => {
    it('partial findings from failed agent are emitted to report', () => {
      const failureResult = AgentFailure({
        agentId: 'security-scanner',
        error: 'API rate limit exceeded',
        failureStage: 'exec',
        partialFindings: [
          {
            severity: 'error',
            file: 'src/auth.ts',
            line: 100,
            message: 'Hardcoded credentials',
            sourceAgent: 'security-scanner',
          },
          {
            severity: 'warning',
            file: 'src/api.ts',
            line: 50,
            message: 'Missing rate limiting',
            sourceAgent: 'security-scanner',
          },
        ],
        metrics,
      });

      // Annotate with provenance
      const annotated = annotateProvenance(failureResult.partialFindings, 'partial');

      // Render partial section
      const partialSection = renderPartialFindingsSection(annotated);

      // CRITICAL: Partial section MUST be rendered
      expect(partialSection).not.toBe('');
      expect(partialSection).toContain('Partial Findings');
      expect(partialSection).toContain('failed agents');
      expect(partialSection).toContain('do NOT affect gating');

      // Findings MUST appear in section
      expect(partialSection).toContain('auth.ts');
      expect(partialSection).toContain('Hardcoded credentials');
      expect(partialSection).toContain('🤖'); // security-scanner uses default icon

      // Severity counts MUST be present
      expect(partialSection).toContain('Errors | 1');
      expect(partialSection).toContain('Warnings | 1');
    });

    it('multiple failed agents have their partial findings combined', () => {
      const results: AgentResult[] = [
        AgentFailure({
          agentId: 'agent-a',
          error: 'Error A',
          failureStage: 'exec',
          partialFindings: [createFinding('a1', 'agent-a', 'error')],
          metrics,
        }),
        AgentFailure({
          agentId: 'agent-b',
          error: 'Error B',
          failureStage: 'postprocess',
          partialFindings: [
            createFinding('b1', 'agent-b', 'warning'),
            createFinding('b2', 'agent-b', 'info'),
          ],
          metrics,
        }),
      ];

      // Collect all partial findings
      const allPartial = results
        .filter(isFailure)
        .flatMap((r) => annotateProvenance(r.partialFindings, 'partial'));

      expect(allPartial).toHaveLength(3);

      // Deduplicate (preserves all since different agents/messages)
      const deduped = deduplicatePartialFindings(allPartial);
      expect(deduped).toHaveLength(3);

      // Render
      const section = renderPartialFindingsSection(deduped);
      expect(section).toContain('🤖'); // agent-a and agent-b both use default icon
      expect(section).toContain('Errors | 1');
      expect(section).toContain('Warnings | 1');
      expect(section).toContain('Info | 1');
    });

    it('preflight failures have no partial findings to emit', () => {
      const preflightFailure = AgentFailure({
        agentId: 'test',
        error: 'Missing configuration',
        failureStage: 'preflight',
        // No partialFindings
        metrics,
      });

      const annotated = annotateProvenance(preflightFailure.partialFindings, 'partial');
      const section = renderPartialFindingsSection(annotated);

      // Empty section for preflight failures
      expect(annotated).toHaveLength(0);
      expect(section).toBe('');
    });
  });

  describe('Cache round-trip integration', () => {
    it('cached results maintain correct structure through round-trip', async () => {
      const originalResult = AgentSuccess({
        agentId: 'roundtrip-test',
        findings: [
          createFinding('cached1', 'roundtrip-test', 'error'),
          createFinding('cached2', 'roundtrip-test', 'warning'),
        ],
        metrics,
      });

      // Write to cache
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('roundtrip-key', originalResult);

      // Capture written data
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Read from cache (simulate file read)
      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('roundtrip-key');

      // Verify round-trip
      expect(retrieved).not.toBeNull();
      if (retrieved && isSuccess(retrieved)) {
        expect(retrieved.findings).toHaveLength(2);
        expect(retrieved.findings[0]?.severity).toBe('error');
        expect(retrieved.findings[1]?.severity).toBe('warning');
      } else {
        // This branch should not be reached
        expect.fail('Expected successful cache retrieval');
      }
    });

    it('failure results with partialFindings survive cache round-trip', async () => {
      const originalResult = AgentFailure({
        agentId: 'failure-roundtrip',
        error: 'Test error',
        failureStage: 'exec',
        partialFindings: [createFinding('partial-cached', 'failure-roundtrip')],
        metrics,
      });

      // Write
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('failure-key', originalResult);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Read
      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('failure-key');

      // Verify partialFindings survived
      expect(retrieved).not.toBeNull();
      if (retrieved && isFailure(retrieved)) {
        expect(retrieved.partialFindings).toHaveLength(1);
        expect(retrieved.partialFindings[0]?.sourceAgent).toBe('failure-roundtrip');
      } else {
        // This branch should not be reached
        expect.fail('Expected failure cache retrieval');
      }
    });
  });

  describe('Report output integration', () => {
    it('full summary includes all sections in correct order', () => {
      const completeFindings: Finding[] = [
        {
          severity: 'error',
          file: 'a.ts',
          message: 'Error 1',
          sourceAgent: 'semgrep',
          provenance: 'complete',
        },
      ];

      const partialFindings: Finding[] = [
        {
          severity: 'warning',
          file: 'b.ts',
          message: 'Partial 1',
          sourceAgent: 'eslint',
          provenance: 'partial',
        },
      ];

      const results = [
        { agentId: 'semgrep', success: true, findings: completeFindings },
        { agentId: 'eslint', success: false, findings: [], error: 'Timeout' },
      ];

      const skipped = [{ id: 'reviewdog', name: 'Reviewdog', reason: 'No supported files' }];

      const markdown = generateFullSummaryMarkdown(
        completeFindings,
        partialFindings,
        results,
        skipped
      );

      // Verify section order (complete summary → partial findings → agent status)
      const completeSummaryIndex = markdown.indexOf('AI Code Review Summary');
      const partialIndex = markdown.indexOf('Partial Findings');
      const agentStatusIndex = markdown.indexOf('Agent Status');

      expect(completeSummaryIndex).toBeLessThan(partialIndex);
      expect(partialIndex).toBeLessThan(agentStatusIndex);

      // Verify content
      expect(markdown).toContain('a.ts'); // Complete finding
      expect(markdown).toContain('b.ts'); // Partial finding
      expect(markdown).toContain('reviewdog'); // Skipped agent
      expect(markdown).toContain('Timeout'); // Error message
    });
  });
});
