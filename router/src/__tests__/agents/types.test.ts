/**
 * AgentResult Types Unit Tests (T011)
 *
 * Tests for discriminated union types, constructors, type guards, and Zod schemas.
 * Part of 011-agent-result-unions feature.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentSuccess,
  AgentFailure,
  AgentSkipped,
  isSuccess,
  isFailure,
  isSkipped,
  AgentResultSchema,
  AgentResultSuccessSchema,
  AgentResultFailureSchema,
  AgentResultSkippedSchema,
  type AgentResult,
  type AgentResultSuccess,
  type AgentResultFailure,
  type AgentResultSkipped,
  type AgentMetrics,
  type Finding,
} from '../../agents/types.js';

// Test fixtures
const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
  tokensUsed: 1000,
  estimatedCostUsd: 0.01,
};

const finding: Finding = {
  severity: 'warning',
  file: 'src/test.ts',
  line: 42,
  message: 'Test finding',
  sourceAgent: 'test-agent',
};

describe('AgentResult Constructors', () => {
  describe('AgentSuccess', () => {
    it('creates a success result with correct status', () => {
      const result = AgentSuccess({
        agentId: 'test-agent',
        findings: [finding],
        metrics,
      });

      expect(result.status).toBe('success');
      expect(result.agentId).toBe('test-agent');
      expect(result.findings).toEqual([finding]);
      expect(result.metrics).toEqual(metrics);
    });

    it('creates a success result with empty findings', () => {
      const result = AgentSuccess({
        agentId: 'test-agent',
        findings: [],
        metrics,
      });

      expect(result.status).toBe('success');
      expect(result.findings).toEqual([]);
    });
  });

  describe('AgentFailure', () => {
    it('creates a failure result with correct status and required fields', () => {
      const result = AgentFailure({
        agentId: 'test-agent',
        error: 'Something went wrong',
        failureStage: 'exec',
        metrics,
      });

      expect(result.status).toBe('failure');
      expect(result.agentId).toBe('test-agent');
      expect(result.error).toBe('Something went wrong');
      expect(result.failureStage).toBe('exec');
      expect(result.partialFindings).toEqual([]);
      expect(result.metrics).toEqual(metrics);
    });

    it('creates a failure result with partial findings', () => {
      const result = AgentFailure({
        agentId: 'test-agent',
        error: 'Timeout',
        failureStage: 'postprocess',
        partialFindings: [finding],
        metrics,
      });

      expect(result.status).toBe('failure');
      expect(result.partialFindings).toEqual([finding]);
    });

    it('creates a failure result for each failure stage', () => {
      const stages = ['preflight', 'exec', 'postprocess'] as const;

      for (const stage of stages) {
        const result = AgentFailure({
          agentId: 'test-agent',
          error: `Failed at ${stage}`,
          failureStage: stage,
          metrics,
        });

        expect(result.failureStage).toBe(stage);
      }
    });
  });

  describe('AgentSkipped', () => {
    it('creates a skipped result with correct status', () => {
      const result = AgentSkipped({
        agentId: 'test-agent',
        reason: 'No supported files',
        metrics,
      });

      expect(result.status).toBe('skipped');
      expect(result.agentId).toBe('test-agent');
      expect(result.reason).toBe('No supported files');
      expect(result.metrics).toEqual(metrics);
    });
  });
});

describe('Type Guards', () => {
  const successResult = AgentSuccess({ agentId: 'test', findings: [], metrics });
  const failureResult = AgentFailure({
    agentId: 'test',
    error: 'error',
    failureStage: 'exec',
    metrics,
  });
  const skippedResult = AgentSkipped({ agentId: 'test', reason: 'reason', metrics });

  describe('isSuccess', () => {
    it('returns true for success results', () => {
      expect(isSuccess(successResult)).toBe(true);
    });

    it('returns false for failure results', () => {
      expect(isSuccess(failureResult)).toBe(false);
    });

    it('returns false for skipped results', () => {
      expect(isSuccess(skippedResult)).toBe(false);
    });

    it('narrows type correctly', () => {
      const result: AgentResult = successResult;
      if (isSuccess(result)) {
        // TypeScript should know result has findings
        expect(result.findings).toBeDefined();
      }
    });
  });

  describe('isFailure', () => {
    it('returns true for failure results', () => {
      expect(isFailure(failureResult)).toBe(true);
    });

    it('returns false for success results', () => {
      expect(isFailure(successResult)).toBe(false);
    });

    it('returns false for skipped results', () => {
      expect(isFailure(skippedResult)).toBe(false);
    });

    it('narrows type correctly', () => {
      const result: AgentResult = failureResult;
      if (isFailure(result)) {
        // TypeScript should know result has error and partialFindings
        expect(result.error).toBeDefined();
        expect(result.partialFindings).toBeDefined();
        expect(result.failureStage).toBeDefined();
      }
    });
  });

  describe('isSkipped', () => {
    it('returns true for skipped results', () => {
      expect(isSkipped(skippedResult)).toBe(true);
    });

    it('returns false for success results', () => {
      expect(isSkipped(successResult)).toBe(false);
    });

    it('returns false for failure results', () => {
      expect(isSkipped(failureResult)).toBe(false);
    });

    it('narrows type correctly', () => {
      const result: AgentResult = skippedResult;
      if (isSkipped(result)) {
        // TypeScript should know result has reason
        expect(result.reason).toBeDefined();
      }
    });
  });
});

describe('Zod Schemas', () => {
  describe('AgentResultSuccessSchema', () => {
    it('validates a correct success result', () => {
      const data = {
        status: 'success',
        agentId: 'test-agent',
        findings: [
          {
            severity: 'warning',
            file: 'test.ts',
            message: 'test',
            sourceAgent: 'test',
          },
        ],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultSuccessSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects invalid status', () => {
      const data = {
        status: 'failure',
        agentId: 'test-agent',
        findings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultSuccessSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentResultFailureSchema', () => {
    it('validates a correct failure result', () => {
      const data = {
        status: 'failure',
        agentId: 'test-agent',
        error: 'Something went wrong',
        failureStage: 'exec',
        partialFindings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultFailureSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects missing error field', () => {
      const data = {
        status: 'failure',
        agentId: 'test-agent',
        failureStage: 'exec',
        partialFindings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultFailureSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('rejects invalid failureStage', () => {
      const data = {
        status: 'failure',
        agentId: 'test-agent',
        error: 'error',
        failureStage: 'invalid',
        partialFindings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultFailureSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentResultSkippedSchema', () => {
    it('validates a correct skipped result', () => {
      const data = {
        status: 'skipped',
        agentId: 'test-agent',
        reason: 'No supported files',
        metrics: { durationMs: 10, filesProcessed: 0 },
      };

      const result = AgentResultSkippedSchema.safeParse(data);
      expect(result.success).toBe(true);
    });

    it('rejects missing reason field', () => {
      const data = {
        status: 'skipped',
        agentId: 'test-agent',
        metrics: { durationMs: 10, filesProcessed: 0 },
      };

      const result = AgentResultSkippedSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe('AgentResultSchema (discriminated union)', () => {
    it('validates success variant', () => {
      const data = {
        status: 'success',
        agentId: 'test',
        findings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('success');
      }
    });

    it('validates failure variant', () => {
      const data = {
        status: 'failure',
        agentId: 'test',
        error: 'error',
        failureStage: 'preflight',
        partialFindings: [],
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('failure');
      }
    });

    it('validates skipped variant', () => {
      const data = {
        status: 'skipped',
        agentId: 'test',
        reason: 'reason',
        metrics: { durationMs: 10, filesProcessed: 0 },
      };

      const result = AgentResultSchema.safeParse(data);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('skipped');
      }
    });

    it('rejects unknown status', () => {
      const data = {
        status: 'unknown',
        agentId: 'test',
        metrics: { durationMs: 100, filesProcessed: 1 },
      };

      const result = AgentResultSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it('supports round-trip serialization', () => {
      const original = AgentSuccess({
        agentId: 'test-agent',
        findings: [finding],
        metrics,
      });

      // Serialize to JSON and back
      const json = JSON.stringify(original);
      const parsed = JSON.parse(json);

      // Validate with schema
      const result = AgentResultSchema.safeParse(parsed);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(original);
      }
    });
  });
});

describe('Type Invariants', () => {
  it('success result has findings but not error or reason', () => {
    const result: AgentResultSuccess = AgentSuccess({
      agentId: 'test',
      findings: [],
      metrics,
    });

    expect('findings' in result).toBe(true);
    expect('error' in result).toBe(false);
    expect('reason' in result).toBe(false);
    expect('partialFindings' in result).toBe(false);
  });

  it('failure result has error and partialFindings but not findings or reason', () => {
    const result: AgentResultFailure = AgentFailure({
      agentId: 'test',
      error: 'error',
      failureStage: 'exec',
      metrics,
    });

    expect('error' in result).toBe(true);
    expect('partialFindings' in result).toBe(true);
    expect('failureStage' in result).toBe(true);
    expect('findings' in result).toBe(false);
    expect('reason' in result).toBe(false);
  });

  it('skipped result has reason but not error or findings', () => {
    const result: AgentResultSkipped = AgentSkipped({
      agentId: 'test',
      reason: 'reason',
      metrics,
    });

    expect('reason' in result).toBe(true);
    expect('error' in result).toBe(false);
    expect('findings' in result).toBe(false);
    expect('partialFindings' in result).toBe(false);
  });
});
