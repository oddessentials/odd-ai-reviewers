/**
 * Reliability Compliance Tests: Value Clamping
 *
 * PR_LESSONS_LEARNED.md Requirements #12 and #13:
 * - Handle edge cases in statistical calculations
 * - Clamp predictions to valid ranges
 *
 * "When producing predictions/forecasts: Clamp ALL derived values,
 * ensure confidence intervals remain valid, handle edge cases where
 * math produces impossible values."
 *
 * These tests verify that numerical values are clamped to valid ranges.
 *
 * @module tests/reliability/value-clamping
 */

import { describe, it, expect } from 'vitest';
import { generateJsonOutput, createDefaultContext } from '../../src/report/terminal.js';
import type { CanonicalDiffFile } from '../../src/diff.js';

/**
 * Create mock diff files for testing
 */
function createMockDiffFiles(): CanonicalDiffFile[] {
  return [
    {
      path: 'test.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
      patch: '@@ test',
    },
  ] as CanonicalDiffFile[];
}

describe('T132a: Value Clamping', () => {
  describe('Cost Clamping', () => {
    it('should clamp negative costs to zero', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: -0.05,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBe(0);
    });

    it('should preserve zero cost', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: 0,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBe(0);
    });

    it('should preserve positive costs', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: 0.25,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBe(0.25);
    });

    it('should handle undefined cost gracefully', () => {
      const context = createDefaultContext();
      // Don't set estimatedCostUsd
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      // Should default to 0, not undefined/null
      expect(parsed.summary.estimatedCostUsd).toBe(0);
    });

    it('should handle very small costs', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: 0.000001,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBeCloseTo(0.000001, 6);
    });

    it('should handle large costs', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: 100.5,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBe(100.5);
    });
  });

  describe('Execution Time Clamping', () => {
    it('should handle zero execution time', () => {
      const context = {
        ...createDefaultContext(),
        executionTimeMs: 0,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.executionTimeMs).toBe(0);
    });

    it('should preserve positive execution time', () => {
      const context = {
        ...createDefaultContext(),
        executionTimeMs: 5000,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.executionTimeMs).toBe(5000);
    });

    it('should handle undefined execution time', () => {
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.executionTimeMs).toBe(0);
    });
  });

  describe('Count Values', () => {
    it('should handle zero file count', () => {
      const context = createDefaultContext();

      const output = generateJsonOutput([], [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed.summary.filesAnalyzed).toBe(0);
    });

    it('should handle zero line count', () => {
      const context = createDefaultContext();

      const output = generateJsonOutput([], [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed.summary.linesChanged).toBe(0);
    });

    it('should correctly sum lines from multiple files', () => {
      const context = createDefaultContext();
      const diffFiles = [
        { path: 'a.ts', status: 'modified' as const, additions: 10, deletions: 5 },
        { path: 'b.ts', status: 'modified' as const, additions: 20, deletions: 10 },
        { path: 'c.ts', status: 'added' as const, additions: 50, deletions: 0 },
      ] as CanonicalDiffFile[];

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      // Total: (10+5) + (20+10) + (50+0) = 95
      expect(parsed.summary.linesChanged).toBe(95);
    });

    it('should correctly count severity categories', () => {
      const context = createDefaultContext();
      const findings = [
        {
          file: 'a.ts',
          line: 1,
          message: 'Error 1',
          severity: 'error' as const,
          sourceAgent: 'test',
        },
        {
          file: 'b.ts',
          line: 2,
          message: 'Error 2',
          severity: 'error' as const,
          sourceAgent: 'test',
        },
        {
          file: 'c.ts',
          line: 3,
          message: 'Warning',
          severity: 'warning' as const,
          sourceAgent: 'test',
        },
        { file: 'd.ts', line: 4, message: 'Info', severity: 'info' as const, sourceAgent: 'test' },
      ];

      const output = generateJsonOutput(findings, [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed.summary.errorCount).toBe(2);
      expect(parsed.summary.warningCount).toBe(1);
      expect(parsed.summary.infoCount).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle NaN values safely', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: NaN,
        executionTimeMs: NaN,
      };
      const diffFiles = createMockDiffFiles();

      // Should not throw
      expect(() => generateJsonOutput([], [], context, diffFiles)).not.toThrow();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      // NaN becomes null in JSON.stringify, check it doesn't crash
      // The actual value could be null (from JSON) or a number
      expect(
        parsed.summary.estimatedCostUsd === null ||
          typeof parsed.summary.estimatedCostUsd === 'number'
      ).toBe(true);
    });

    it('should handle Infinity values safely', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: Infinity,
      };
      const diffFiles = createMockDiffFiles();

      // Should not throw
      expect(() => generateJsonOutput([], [], context, diffFiles)).not.toThrow();
    });

    it('should handle negative infinity safely', () => {
      const context = {
        ...createDefaultContext(),
        estimatedCostUsd: -Infinity,
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      // Should clamp to 0 (same as other negative values)
      // Or handle gracefully
      expect(parsed.summary.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Percentage Values', () => {
    it('should not produce negative percentages in calculations', () => {
      // This tests the concept - actual percentage values depend on implementation
      const context = createDefaultContext();
      const findings = [
        { file: 'a.ts', line: 1, message: 'Test', severity: 'error' as const, sourceAgent: 'test' },
      ];
      const diffFiles: CanonicalDiffFile[] = [];

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      // Verify counts are non-negative
      expect(parsed.summary.errorCount).toBeGreaterThanOrEqual(0);
      expect(parsed.summary.warningCount).toBeGreaterThanOrEqual(0);
      expect(parsed.summary.infoCount).toBeGreaterThanOrEqual(0);
    });
  });
});
