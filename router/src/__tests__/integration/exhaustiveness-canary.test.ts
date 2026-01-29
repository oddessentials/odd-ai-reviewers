/**
 * Exhaustiveness Canary Test (T012)
 *
 * This test verifies that the discriminated union enforces exhaustive handling.
 * If a new variant is added to AgentResult without updating switch handlers,
 * this test will fail at compile time.
 *
 * Part of 011-agent-result-unions feature (FR-003, FR-004).
 */

import { describe, it, expect } from 'vitest';
import { assertNever } from '../../types/assert-never.js';
import {
  AgentSuccess,
  AgentFailure,
  AgentSkipped,
  type AgentResult,
  type Finding,
  type AgentMetrics,
} from '../../agents/types.js';

// Test fixtures
const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
};

const finding: Finding = {
  severity: 'info',
  file: 'test.ts',
  message: 'Test finding',
  sourceAgent: 'canary-test',
};

/**
 * Summarize an AgentResult using exhaustive switch pattern.
 *
 * This function demonstrates the required pattern for handling AgentResult.
 * The assertNever in the default case ensures compile-time exhaustiveness.
 *
 * If a fourth variant is added to AgentResult (e.g., 'pending'), this function
 * will fail to compile because assertNever(result) won't accept the new variant.
 */
function summarizeResult(result: AgentResult): {
  label: string;
  findingCount: number;
  isTerminal: boolean;
} {
  switch (result.status) {
    case 'success':
      return {
        label: `Success: ${result.findings.length} findings`,
        findingCount: result.findings.length,
        isTerminal: true,
      };
    case 'failure':
      return {
        label: `Failure at ${result.failureStage}: ${result.error}`,
        findingCount: result.partialFindings.length,
        isTerminal: true,
      };
    case 'skipped':
      return {
        label: `Skipped: ${result.reason}`,
        findingCount: 0,
        isTerminal: true,
      };
    default:
      // This line ensures exhaustiveness at compile time
      // If a new variant is added, TypeScript will error here
      return assertNever(result);
  }
}

describe('Exhaustiveness Canary', () => {
  describe('summarizeResult with exhaustive switch', () => {
    it('handles success result', () => {
      const result = AgentSuccess({
        agentId: 'test',
        findings: [finding, finding],
        metrics,
      });

      const summary = summarizeResult(result);

      expect(summary.label).toBe('Success: 2 findings');
      expect(summary.findingCount).toBe(2);
      expect(summary.isTerminal).toBe(true);
    });

    it('handles success result with zero findings', () => {
      const result = AgentSuccess({
        agentId: 'test',
        findings: [],
        metrics,
      });

      const summary = summarizeResult(result);

      expect(summary.label).toBe('Success: 0 findings');
      expect(summary.findingCount).toBe(0);
    });

    it('handles failure result with partial findings', () => {
      const result = AgentFailure({
        agentId: 'test',
        error: 'Connection timeout',
        failureStage: 'exec',
        partialFindings: [finding],
        metrics,
      });

      const summary = summarizeResult(result);

      expect(summary.label).toBe('Failure at exec: Connection timeout');
      expect(summary.findingCount).toBe(1);
      expect(summary.isTerminal).toBe(true);
    });

    it('handles failure result at preflight stage', () => {
      const result = AgentFailure({
        agentId: 'test',
        error: 'Missing API key',
        failureStage: 'preflight',
        metrics,
      });

      const summary = summarizeResult(result);

      expect(summary.label).toBe('Failure at preflight: Missing API key');
      expect(summary.findingCount).toBe(0);
    });

    it('handles failure result at postprocess stage', () => {
      const result = AgentFailure({
        agentId: 'test',
        error: 'Invalid JSON response',
        failureStage: 'postprocess',
        partialFindings: [finding, finding, finding],
        metrics,
      });

      const summary = summarizeResult(result);

      expect(summary.label).toBe('Failure at postprocess: Invalid JSON response');
      expect(summary.findingCount).toBe(3);
    });

    it('handles skipped result', () => {
      const result = AgentSkipped({
        agentId: 'test',
        reason: 'No TypeScript files in diff',
        metrics,
      });

      const summary = summarizeResult(result);

      expect(summary.label).toBe('Skipped: No TypeScript files in diff');
      expect(summary.findingCount).toBe(0);
      expect(summary.isTerminal).toBe(true);
    });

    it('throws for invalid status at runtime (safety check)', () => {
      // This tests the runtime safety of assertNever
      // In practice, this should never happen with proper TypeScript types
      const invalidResult = {
        status: 'pending',
        agentId: 'test',
        metrics,
      } as unknown as AgentResult;

      expect(() => summarizeResult(invalidResult)).toThrow('Unexpected value');
    });
  });

  describe('compile-time exhaustiveness', () => {
    /**
     * This test exists to document the compile-time guarantee.
     *
     * If you add a new variant to AgentResult (e.g., status: 'pending'),
     * the summarizeResult function above will fail to compile with:
     *
     *   Argument of type '{ status: "pending"; ... }' is not assignable
     *   to parameter of type 'never'.
     *
     * This is the "canary" behavior - the compile error tells you
     * exactly where you need to add handling for the new variant.
     */
    it('documents the exhaustiveness guarantee', () => {
      // This test simply verifies the function compiles and runs
      // The real guarantee is at compile time, not runtime
      const results: AgentResult[] = [
        AgentSuccess({ agentId: 'a', findings: [], metrics }),
        AgentFailure({ agentId: 'b', error: 'err', failureStage: 'exec', metrics }),
        AgentSkipped({ agentId: 'c', reason: 'skip', metrics }),
      ];

      const summaries = results.map(summarizeResult);
      expect(summaries).toHaveLength(3);
      expect(summaries.every((s) => s.isTerminal)).toBe(true);
    });
  });
});

describe('All Variants Covered (FR-004)', () => {
  it('processes all three variants in a loop', () => {
    const results: AgentResult[] = [
      AgentSuccess({ agentId: 'success-agent', findings: [finding], metrics }),
      AgentFailure({
        agentId: 'failure-agent',
        error: 'Test error',
        failureStage: 'exec',
        partialFindings: [],
        metrics,
      }),
      AgentSkipped({ agentId: 'skipped-agent', reason: 'Test skip', metrics }),
    ];

    const statuses = results.map((r) => r.status);
    expect(statuses).toContain('success');
    expect(statuses).toContain('failure');
    expect(statuses).toContain('skipped');
    expect(statuses).toHaveLength(3);
  });

  it('verifies variant-specific fields are only on correct variants', () => {
    const successResult = AgentSuccess({ agentId: 'test', findings: [finding], metrics });
    const failureResult = AgentFailure({
      agentId: 'test',
      error: 'err',
      failureStage: 'exec',
      partialFindings: [finding],
      metrics,
    });
    const skippedResult = AgentSkipped({ agentId: 'test', reason: 'skip', metrics });

    // Success has findings
    expect(successResult.findings).toHaveLength(1);

    // Failure has error, failureStage, partialFindings
    expect(failureResult.error).toBe('err');
    expect(failureResult.failureStage).toBe('exec');
    expect(failureResult.partialFindings).toHaveLength(1);

    // Skipped has reason
    expect(skippedResult.reason).toBe('skip');
  });
});
