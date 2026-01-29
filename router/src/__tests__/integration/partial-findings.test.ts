/**
 * Partial Findings Exclusion Test (T013)
 *
 * Tests that partialFindings from failure results are properly labeled
 * and excluded from success metrics.
 *
 * Part of 011-agent-result-unions feature (FR-015, FR-016).
 */

import { describe, it, expect } from 'vitest';
import {
  AgentSuccess,
  AgentFailure,
  AgentSkipped,
  isSuccess,
  isFailure,
  type AgentResult,
  type Finding,
  type AgentMetrics,
} from '../../agents/types.js';

// Test fixtures
const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
};

function createFinding(id: string): Finding {
  return {
    severity: 'warning',
    file: `src/${id}.ts`,
    line: 10,
    message: `Finding ${id}`,
    sourceAgent: 'test-agent',
    fingerprint: `fp-${id}`,
  };
}

/**
 * Summarize results, properly separating success findings from partial findings.
 *
 * This demonstrates the correct pattern for handling partialFindings:
 * - Only success results contribute to the success finding count
 * - Partial findings from failures are tracked separately
 * - Partial findings MUST be labeled as such in reports
 */
function summarizeResults(results: AgentResult[]): {
  successFindings: Finding[];
  partialFindings: Finding[];
  successCount: number;
  failureCount: number;
  skippedCount: number;
} {
  const summary = {
    successFindings: [] as Finding[],
    partialFindings: [] as Finding[],
    successCount: 0,
    failureCount: 0,
    skippedCount: 0,
  };

  for (const result of results) {
    switch (result.status) {
      case 'success':
        summary.successCount++;
        summary.successFindings.push(...result.findings);
        break;
      case 'failure':
        summary.failureCount++;
        // Partial findings are tracked separately, NOT added to successFindings
        summary.partialFindings.push(...result.partialFindings);
        break;
      case 'skipped':
        summary.skippedCount++;
        break;
    }
  }

  return summary;
}

describe('Partial Findings Handling', () => {
  describe('summarizeResults separates findings correctly', () => {
    it('counts only success findings in successFindings', () => {
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'agent-1',
          findings: [createFinding('s1'), createFinding('s2')],
          metrics,
        }),
        AgentSuccess({
          agentId: 'agent-2',
          findings: [createFinding('s3')],
          metrics,
        }),
      ];

      const summary = summarizeResults(results);

      expect(summary.successFindings).toHaveLength(3);
      expect(summary.partialFindings).toHaveLength(0);
      expect(summary.successCount).toBe(2);
    });

    it('tracks partial findings separately from success findings', () => {
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'agent-1',
          findings: [createFinding('s1')],
          metrics,
        }),
        AgentFailure({
          agentId: 'agent-2',
          error: 'Timeout',
          failureStage: 'exec',
          partialFindings: [createFinding('p1'), createFinding('p2')],
          metrics,
        }),
      ];

      const summary = summarizeResults(results);

      expect(summary.successFindings).toHaveLength(1);
      expect(summary.successFindings[0]?.fingerprint).toBe('fp-s1');

      expect(summary.partialFindings).toHaveLength(2);
      expect(summary.partialFindings.map((f) => f.fingerprint)).toEqual(['fp-p1', 'fp-p2']);

      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
    });

    it('handles failures without partial findings', () => {
      const results: AgentResult[] = [
        AgentFailure({
          agentId: 'agent-1',
          error: 'Missing API key',
          failureStage: 'preflight',
          // No partialFindings provided - defaults to []
          metrics,
        }),
      ];

      const summary = summarizeResults(results);

      expect(summary.successFindings).toHaveLength(0);
      expect(summary.partialFindings).toHaveLength(0);
      expect(summary.failureCount).toBe(1);
    });

    it('handles skipped results (no findings)', () => {
      const results: AgentResult[] = [
        AgentSkipped({
          agentId: 'agent-1',
          reason: 'No supported files',
          metrics,
        }),
        AgentSkipped({
          agentId: 'agent-2',
          reason: 'Agent disabled',
          metrics,
        }),
      ];

      const summary = summarizeResults(results);

      expect(summary.successFindings).toHaveLength(0);
      expect(summary.partialFindings).toHaveLength(0);
      expect(summary.skippedCount).toBe(2);
    });

    it('handles mixed results correctly', () => {
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'success-1',
          findings: [createFinding('s1')],
          metrics,
        }),
        AgentFailure({
          agentId: 'failure-1',
          error: 'Error 1',
          failureStage: 'exec',
          partialFindings: [createFinding('p1')],
          metrics,
        }),
        AgentSkipped({
          agentId: 'skipped-1',
          reason: 'Skip 1',
          metrics,
        }),
        AgentSuccess({
          agentId: 'success-2',
          findings: [createFinding('s2'), createFinding('s3')],
          metrics,
        }),
        AgentFailure({
          agentId: 'failure-2',
          error: 'Error 2',
          failureStage: 'postprocess',
          partialFindings: [createFinding('p2'), createFinding('p3')],
          metrics,
        }),
      ];

      const summary = summarizeResults(results);

      expect(summary.successFindings).toHaveLength(3);
      expect(summary.partialFindings).toHaveLength(3);
      expect(summary.successCount).toBe(2);
      expect(summary.failureCount).toBe(2);
      expect(summary.skippedCount).toBe(1);
    });
  });

  describe('Partial findings labeling (FR-015)', () => {
    it('failure results have partialFindings field, not findings', () => {
      const failure = AgentFailure({
        agentId: 'test',
        error: 'Error',
        failureStage: 'exec',
        partialFindings: [createFinding('p1')],
        metrics,
      });

      // partialFindings exists on failure results
      expect(failure.partialFindings).toBeDefined();
      expect(failure.partialFindings).toHaveLength(1);

      // findings does NOT exist on failure results
      expect('findings' in failure).toBe(false);
    });

    it('success results have findings field, not partialFindings', () => {
      const success = AgentSuccess({
        agentId: 'test',
        findings: [createFinding('s1')],
        metrics,
      });

      // findings exists on success results
      expect(success.findings).toBeDefined();
      expect(success.findings).toHaveLength(1);

      // partialFindings does NOT exist on success results
      expect('partialFindings' in success).toBe(false);
    });
  });

  describe('Metrics exclusion (FR-016)', () => {
    it('partial findings do not count toward success metrics', () => {
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'a',
          findings: [createFinding('s1'), createFinding('s2')],
          metrics,
        }),
        AgentFailure({
          agentId: 'b',
          error: 'err',
          failureStage: 'exec',
          partialFindings: [createFinding('p1'), createFinding('p2'), createFinding('p3')],
          metrics,
        }),
      ];

      // Count only success findings for metrics
      const successFindingCount = results
        .filter(isSuccess)
        .reduce((count, r) => count + r.findings.length, 0);

      // Partial findings are separate
      const partialFindingCount = results
        .filter(isFailure)
        .reduce((count, r) => count + r.partialFindings.length, 0);

      expect(successFindingCount).toBe(2); // Only s1, s2
      expect(partialFindingCount).toBe(3); // p1, p2, p3 tracked separately
    });
  });

  describe('Failure stage determines partial findings usability', () => {
    it('preflight failures typically have no partial findings', () => {
      const failure = AgentFailure({
        agentId: 'test',
        error: 'Missing config',
        failureStage: 'preflight',
        metrics,
      });

      expect(failure.failureStage).toBe('preflight');
      expect(failure.partialFindings).toHaveLength(0);
    });

    it('exec failures may have partial findings gathered before error', () => {
      const failure = AgentFailure({
        agentId: 'test',
        error: 'API timeout after 3 files',
        failureStage: 'exec',
        partialFindings: [createFinding('p1'), createFinding('p2'), createFinding('p3')],
        metrics,
      });

      expect(failure.failureStage).toBe('exec');
      expect(failure.partialFindings).toHaveLength(3);
    });

    it('postprocess failures may have all findings but invalid format', () => {
      const failure = AgentFailure({
        agentId: 'test',
        error: 'Failed to parse JSON response',
        failureStage: 'postprocess',
        partialFindings: [
          createFinding('p1'),
          createFinding('p2'),
          createFinding('p3'),
          createFinding('p4'),
          createFinding('p5'),
        ],
        metrics,
      });

      expect(failure.failureStage).toBe('postprocess');
      expect(failure.partialFindings).toHaveLength(5);
    });
  });
});

describe('Report Generation Pattern', () => {
  /**
   * Demonstrates how reports should handle partial findings.
   * This is a documentation test showing the expected pattern.
   */
  function generateReport(results: AgentResult[]): string {
    const lines: string[] = ['# Review Report', ''];

    // Success section
    const successResults = results.filter(isSuccess);
    if (successResults.length > 0) {
      lines.push('## Findings');
      for (const result of successResults) {
        for (const finding of result.findings) {
          lines.push(`- [${finding.severity}] ${finding.file}: ${finding.message}`);
        }
      }
      lines.push('');
    }

    // Partial findings section (clearly labeled)
    const failureResults = results.filter(isFailure);
    const allPartialFindings = failureResults.flatMap((r) => r.partialFindings);
    if (allPartialFindings.length > 0) {
      lines.push('## Partial Findings (Incomplete)');
      lines.push(
        '*These findings were gathered before an agent failure and may be incomplete.*',
        ''
      );
      for (const finding of allPartialFindings) {
        lines.push(`- [${finding.severity}] ${finding.file}: ${finding.message}`);
      }
      lines.push('');
    }

    // Errors section
    if (failureResults.length > 0) {
      lines.push('## Agent Errors');
      for (const result of failureResults) {
        lines.push(`- ${result.agentId}: ${result.error} (stage: ${result.failureStage})`);
      }
    }

    return lines.join('\n');
  }

  it('generates report with partial findings clearly labeled', () => {
    const results: AgentResult[] = [
      AgentSuccess({
        agentId: 'lint',
        findings: [createFinding('lint-1')],
        metrics,
      }),
      AgentFailure({
        agentId: 'security',
        error: 'API timeout',
        failureStage: 'exec',
        partialFindings: [createFinding('sec-1')],
        metrics,
      }),
    ];

    const report = generateReport(results);

    expect(report).toContain('## Findings');
    expect(report).toContain('lint-1.ts');

    expect(report).toContain('## Partial Findings (Incomplete)');
    expect(report).toContain('sec-1.ts');
    expect(report).toContain('may be incomplete');

    expect(report).toContain('## Agent Errors');
    expect(report).toContain('security: API timeout');
  });
});
