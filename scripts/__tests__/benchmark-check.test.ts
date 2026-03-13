/**
 * Benchmark Check Tests
 *
 * Unit tests for the benchmark check script's validation and metric
 * comparison logic.
 */

import { describe, it, expect } from 'vitest';
import {
  validateSummary,
  checkMetrics,
  formatResults,
  type BenchmarkSummary,
} from '../benchmark-check.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSummary(overrides: Partial<BenchmarkSummary> = {}): BenchmarkSummary {
  return {
    precision: 0.85,
    recall: 0.78,
    f1: 0.81,
    tool: 'odd-ai-reviewers',
    judge_model: 'gpt-4o',
    timestamp: '2026-01-15T12:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// validateSummary
// ---------------------------------------------------------------------------

describe('validateSummary', () => {
  it('accepts valid summary object', () => {
    const input = {
      precision: 0.9,
      recall: 0.8,
      f1: 0.85,
      tool: 'test-tool',
      judge_model: 'test-model',
      timestamp: '2026-01-01T00:00:00Z',
    };

    const result = validateSummary(input);

    expect(result.precision).toBe(0.9);
    expect(result.recall).toBe(0.8);
    expect(result.f1).toBe(0.85);
    expect(result.tool).toBe('test-tool');
    expect(result.judge_model).toBe('test-model');
  });

  it('throws on null input', () => {
    expect(() => validateSummary(null)).toThrow('must contain a JSON object');
  });

  it('throws on undefined input', () => {
    expect(() => validateSummary(undefined)).toThrow('must contain a JSON object');
  });

  it('throws on non-object input', () => {
    expect(() => validateSummary('string')).toThrow('must contain a JSON object');
    expect(() => validateSummary(42)).toThrow('must contain a JSON object');
    expect(() => validateSummary([])).not.toThrow('must contain a JSON object');
  });

  it('throws when precision is not a number', () => {
    expect(() => validateSummary({ precision: 'high', recall: 0.8, f1: 0.85 })).toThrow(
      '"precision" must be a number'
    );
  });

  it('throws when precision is missing', () => {
    expect(() => validateSummary({ recall: 0.8, f1: 0.85 })).toThrow(
      '"precision" must be a number'
    );
  });

  it('throws when recall is not a number', () => {
    expect(() => validateSummary({ precision: 0.9, recall: 'medium', f1: 0.85 })).toThrow(
      '"recall" must be a number'
    );
  });

  it('throws when recall is missing', () => {
    expect(() => validateSummary({ precision: 0.9, f1: 0.85 })).toThrow(
      '"recall" must be a number'
    );
  });

  it('throws when f1 is not a number', () => {
    expect(() => validateSummary({ precision: 0.9, recall: 0.8, f1: null })).toThrow(
      '"f1" must be a number'
    );
  });

  it('throws when f1 is missing', () => {
    expect(() => validateSummary({ precision: 0.9, recall: 0.8 })).toThrow('"f1" must be a number');
  });

  it('throws on NaN precision', () => {
    expect(() => validateSummary({ precision: NaN, recall: 0.8, f1: 0.85 })).toThrow(
      '"precision" must be a number'
    );
  });

  it('throws on NaN recall', () => {
    expect(() => validateSummary({ precision: 0.9, recall: NaN, f1: 0.85 })).toThrow(
      '"recall" must be a number'
    );
  });

  it('throws on NaN f1', () => {
    expect(() => validateSummary({ precision: 0.9, recall: 0.8, f1: NaN })).toThrow(
      '"f1" must be a number'
    );
  });

  it('defaults tool to unknown when not a string', () => {
    const result = validateSummary({ precision: 0.9, recall: 0.8, f1: 0.85, tool: 123 });

    expect(result.tool).toBe('unknown');
  });

  it('defaults judge_model to unknown when not a string', () => {
    const result = validateSummary({
      precision: 0.9,
      recall: 0.8,
      f1: 0.85,
      judge_model: null,
    });

    expect(result.judge_model).toBe('unknown');
  });

  it('generates timestamp when not a string', () => {
    const before = new Date().toISOString();
    const result = validateSummary({ precision: 0.9, recall: 0.8, f1: 0.85 });
    const after = new Date().toISOString();

    // Timestamp should be a valid ISO string between before and after
    expect(result.timestamp >= before).toBe(true);
    expect(result.timestamp <= after).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkMetrics
// ---------------------------------------------------------------------------

describe('checkMetrics', () => {
  it('all scores above thresholds returns all passed', () => {
    const summary = makeSummary({ precision: 0.9, recall: 0.85, f1: 0.87 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    expect(checks).toHaveLength(3);
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('precision below threshold fails precision check', () => {
    const summary = makeSummary({ precision: 0.7, recall: 0.85, f1: 0.87 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    const precisionCheck = checks.find((c) => c.name === 'Precision');
    expect(precisionCheck?.passed).toBe(false);
    expect(precisionCheck?.value).toBe(0.7);
    expect(precisionCheck?.threshold).toBe(0.8);

    // Other checks should still pass
    const recallCheck = checks.find((c) => c.name === 'Recall');
    expect(recallCheck?.passed).toBe(true);
    const f1Check = checks.find((c) => c.name === 'F1');
    expect(f1Check?.passed).toBe(true);
  });

  it('recall below threshold fails recall check', () => {
    const summary = makeSummary({ precision: 0.9, recall: 0.6, f1: 0.87 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    const recallCheck = checks.find((c) => c.name === 'Recall');
    expect(recallCheck?.passed).toBe(false);
    expect(recallCheck?.value).toBe(0.6);
    expect(recallCheck?.threshold).toBe(0.75);
  });

  it('F1 below threshold fails F1 check', () => {
    const summary = makeSummary({ precision: 0.9, recall: 0.85, f1: 0.5 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    const f1Check = checks.find((c) => c.name === 'F1');
    expect(f1Check?.passed).toBe(false);
    expect(f1Check?.value).toBe(0.5);
    expect(f1Check?.threshold).toBe(0.78);
  });

  it('thresholds at boundary (exact match) pass', () => {
    const summary = makeSummary({ precision: 0.8, recall: 0.75, f1: 0.78 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('all metrics below thresholds fail all checks', () => {
    const summary = makeSummary({ precision: 0.1, recall: 0.1, f1: 0.1 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    expect(checks.every((c) => !c.passed)).toBe(true);
  });

  it('returns correct structure for each metric', () => {
    const summary = makeSummary({ precision: 0.9, recall: 0.85, f1: 0.87 });

    const checks = checkMetrics(summary, 0.8, 0.75, 0.78);

    expect(checks[0]).toEqual({
      name: 'Precision',
      value: 0.9,
      threshold: 0.8,
      passed: true,
    });
    expect(checks[1]).toEqual({
      name: 'Recall',
      value: 0.85,
      threshold: 0.75,
      passed: true,
    });
    expect(checks[2]).toEqual({
      name: 'F1',
      value: 0.87,
      threshold: 0.78,
      passed: true,
    });
  });

  it('handles zero values correctly', () => {
    const summary = makeSummary({ precision: 0.0, recall: 0.0, f1: 0.0 });

    const checks = checkMetrics(summary, 0.0, 0.0, 0.0);

    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('handles maximum values (1.0) correctly', () => {
    const summary = makeSummary({ precision: 1.0, recall: 1.0, f1: 1.0 });

    const checks = checkMetrics(summary, 1.0, 1.0, 1.0);

    expect(checks.every((c) => c.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatResults
// ---------------------------------------------------------------------------

describe('formatResults', () => {
  it('reports PASSED when all checks pass', () => {
    const checks = checkMetrics(
      makeSummary({ precision: 0.9, recall: 0.85, f1: 0.87 }),
      0.8,
      0.75,
      0.78
    );

    const output = formatResults(checks);

    expect(output).toContain('Benchmark check PASSED');
    expect(output).not.toContain('REGRESSION');
  });

  it('reports FAILED when any check fails', () => {
    const checks = checkMetrics(
      makeSummary({ precision: 0.5, recall: 0.85, f1: 0.87 }),
      0.8,
      0.75,
      0.78
    );

    const output = formatResults(checks);

    expect(output).toContain('Benchmark check FAILED');
    expect(output).toContain('REGRESSION');
  });

  it('includes metric values and thresholds in output', () => {
    const checks = checkMetrics(
      makeSummary({ precision: 0.9, recall: 0.85, f1: 0.87 }),
      0.8,
      0.75,
      0.78
    );

    const output = formatResults(checks);

    expect(output).toContain('Precision');
    expect(output).toContain('0.90');
    expect(output).toContain('0.80');
    expect(output).toContain('Recall');
    expect(output).toContain('0.85');
    expect(output).toContain('F1');
    expect(output).toContain('0.87');
  });

  it('marks only failing metrics with REGRESSION', () => {
    const checks = checkMetrics(
      makeSummary({ precision: 0.7, recall: 0.85, f1: 0.87 }),
      0.8,
      0.75,
      0.78
    );

    const output = formatResults(checks);
    const lines = output.split('\n');

    // Precision line should have REGRESSION
    const precisionLine = lines.find((l) => l.includes('Precision'));
    expect(precisionLine).toContain('REGRESSION');

    // Recall line should NOT have REGRESSION
    const recallLine = lines.find((l) => l.includes('Recall'));
    expect(recallLine).not.toContain('REGRESSION');

    // F1 line should NOT have REGRESSION
    const f1Line = lines.find((l) => l.includes('F1'));
    expect(f1Line).not.toContain('REGRESSION');
  });
});
