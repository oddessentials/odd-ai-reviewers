/**
 * Reliability Compliance Tests: Run Summary on Failure
 *
 * PR_LESSONS_LEARNED.md Requirement #10: Always write run summaries, even on failure
 * "CLI tools should produce machine-readable status output regardless of
 * success/failure. Downstream automation depends on it."
 *
 * These tests verify that the local review command produces consistent
 * output structure even when errors occur.
 *
 * @module tests/reliability/run-summary
 */

import { describe, it, expect } from 'vitest';
import type { Finding } from '../../src/agents/types.js';
import {
  generateJsonOutput,
  generateSarifOutput,
  generateQuietOutput,
  createDefaultContext,
} from '../../src/report/terminal.js';
import type { CanonicalDiffFile } from '../../src/diff.js';

/**
 * Create mock diff files
 */
function createMockDiffFiles(): CanonicalDiffFile[] {
  return [
    {
      path: 'src/test.ts',
      status: 'modified',
      additions: 5,
      deletions: 2,
      patch: '@@ -1,5 +1,8 @@\n+new line',
    },
  ] as CanonicalDiffFile[];
}

describe('T131: Run Summary on Failure', () => {
  describe('JSON Output on Success', () => {
    it('should produce valid JSON on successful review', () => {
      const findings: Finding[] = [
        {
          file: 'src/test.ts',
          line: 1,
          message: 'Test finding',
          severity: 'warning',
          sourceAgent: 'test-agent',
        },
      ];
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('schema_version');
      expect(parsed).toHaveProperty('summary');
      expect(parsed).toHaveProperty('findings');
    });
  });

  describe('JSON Output with Zero Findings', () => {
    it('should produce valid JSON when no findings', () => {
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.findings).toHaveLength(0);
      expect(parsed.summary.errorCount).toBe(0);
      expect(parsed.summary.warningCount).toBe(0);
      expect(parsed.summary.infoCount).toBe(0);
    });
  });

  describe('JSON Output with Partial Findings', () => {
    it('should include partial findings from interrupted agents', () => {
      const findings: Finding[] = [];
      const partialFindings: Finding[] = [
        {
          file: 'src/partial.ts',
          line: 5,
          message: 'Agent was interrupted',
          severity: 'warning',
          sourceAgent: 'interrupted-agent',
        },
      ];
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, partialFindings, context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('partialFindings');
      expect(parsed.partialFindings).toHaveLength(1);
      expect(parsed.partialFindings[0].sourceAgent).toBe('interrupted-agent');
    });
  });

  describe('JSON Output with Empty Diff', () => {
    it('should handle empty diff files gracefully', () => {
      const findings: Finding[] = [];
      const context = createDefaultContext();

      const output = generateJsonOutput(findings, [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed.summary.filesAnalyzed).toBe(0);
      expect(parsed.summary.linesChanged).toBe(0);
    });
  });

  describe('SARIF Output on Failure Cases', () => {
    it('should produce valid SARIF with zero findings', () => {
      const context = createDefaultContext();

      const output = generateSarifOutput([], context);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('$schema');
      expect(parsed).toHaveProperty('version');
      expect(parsed).toHaveProperty('runs');
      expect(parsed.runs[0].results).toHaveLength(0);
    });

    it('should produce valid SARIF structure regardless of finding count', () => {
      const findingCounts = [0, 1, 10, 100];

      for (const count of findingCounts) {
        const findings: Finding[] = Array(count)
          .fill(null)
          .map((_, i) => ({
            file: `file${i}.ts`,
            line: i + 1,
            message: `Finding ${i}`,
            severity: 'warning' as const,
            sourceAgent: 'test-agent',
          }));

        const context = createDefaultContext();
        const output = generateSarifOutput(findings, context);
        const parsed = JSON.parse(output);

        expect(parsed.runs[0].results).toHaveLength(count);
      }
    });
  });

  describe('Quiet Output on Failure', () => {
    it('should produce output even with no errors', () => {
      const findings: Finding[] = [
        {
          file: 'test.ts',
          line: 1,
          message: 'Warning only',
          severity: 'warning',
          sourceAgent: 'test',
        },
      ];

      const output = generateQuietOutput(findings);

      expect(output).toBeTruthy();
      expect(output.toLowerCase()).toContain('no errors');
    });

    it('should report error count when errors exist', () => {
      const findings: Finding[] = [
        {
          file: 'test.ts',
          line: 1,
          message: 'Error finding',
          severity: 'error',
          sourceAgent: 'test',
        },
        {
          file: 'test2.ts',
          line: 2,
          message: 'Another error',
          severity: 'error',
          sourceAgent: 'test',
        },
      ];

      const output = generateQuietOutput(findings);

      expect(output).toContain('2');
      expect(output.toLowerCase()).toContain('error');
    });
  });

  describe('Summary Statistics', () => {
    it('should always include execution time', () => {
      const context = { ...createDefaultContext(), executionTimeMs: 5000 };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary).toHaveProperty('executionTimeMs');
      expect(parsed.summary.executionTimeMs).toBe(5000);
    });

    it('should always include cost estimate', () => {
      const context = { ...createDefaultContext(), estimatedCostUsd: 0.15 };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary).toHaveProperty('estimatedCostUsd');
      expect(parsed.summary.estimatedCostUsd).toBe(0.15);
    });

    it('should default execution time to 0 if not provided', () => {
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.executionTimeMs).toBe(0);
    });
  });

  describe('Error Context Preservation', () => {
    it('should preserve config source in output', () => {
      const context = {
        ...createDefaultContext(),
        configSource: { source: 'zero-config' as const },
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.config.source).toBe('zero-config');
    });

    it('should preserve config file path when available', () => {
      const context = {
        ...createDefaultContext(),
        configSource: { source: 'file' as const, path: '/path/to/.ai-review.yml' },
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.config.source).toBe('file');
      expect(parsed.config.path).toBe('/path/to/.ai-review.yml');
    });
  });

  describe('Output Completeness', () => {
    it('should include all required fields even on minimal input', () => {
      const context = createDefaultContext();

      const output = generateJsonOutput([], [], context, []);
      const parsed = JSON.parse(output);

      // All required top-level fields
      const requiredFields = [
        'schema_version',
        'version',
        'timestamp',
        'summary',
        'findings',
        'partialFindings',
        'passes',
        'config',
      ];

      for (const field of requiredFields) {
        expect(parsed).toHaveProperty(field);
      }

      // All required summary fields
      const summaryFields = [
        'errorCount',
        'warningCount',
        'infoCount',
        'filesAnalyzed',
        'linesChanged',
        'executionTimeMs',
        'estimatedCostUsd',
      ];

      for (const field of summaryFields) {
        expect(parsed.summary).toHaveProperty(field);
      }
    });
  });
});
