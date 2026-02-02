/**
 * Schema Compliance Tests: JSON Output Format
 *
 * PR_LESSONS_LEARNED.md Requirement #6: Always version your output schemas
 * "When your CLI produces structured output (JSON, SQLite, manifests),
 * include schema versions. Consumers need to validate compatibility."
 *
 * These tests verify the JSON output format includes required fields
 * and conforms to the schema defined in data-model.md.
 *
 * @module tests/schema/json-output
 */

import { describe, it, expect } from 'vitest';
import type { Finding } from '../../src/agents/types.js';
import {
  generateJsonOutput,
  createDefaultContext,
  JSON_SCHEMA_VERSION,
} from '../../src/report/terminal.js';
import type { CanonicalDiffFile } from '../../src/diff.js';

/**
 * Create mock findings for testing
 */
function createMockFindings(): Finding[] {
  return [
    {
      file: 'src/main.ts',
      line: 10,
      message: 'Consider using const instead of let',
      severity: 'warning',
      sourceAgent: 'style-checker',
      suggestion: 'Use const for variables that are never reassigned',
      ruleId: 'prefer-const',
    },
    {
      file: 'src/utils.ts',
      line: 25,
      message: 'Potential null pointer dereference',
      severity: 'error',
      sourceAgent: 'null-safety',
    },
    {
      file: 'src/config.ts',
      line: 5,
      message: 'Consider adding type annotation',
      severity: 'info',
      sourceAgent: 'type-checker',
    },
  ];
}

/**
 * Create mock diff files for testing
 */
function createMockDiffFiles(): CanonicalDiffFile[] {
  return [
    {
      path: 'src/main.ts',
      status: 'modified',
      additions: 15,
      deletions: 5,
      patch: '@@ -1,10 +1,15 @@\n+// New code here',
    },
    {
      path: 'src/utils.ts',
      status: 'modified',
      additions: 10,
      deletions: 3,
      patch: '@@ -20,5 +20,12 @@\n+function newHelper() {}',
    },
    {
      path: 'src/config.ts',
      status: 'added',
      additions: 20,
      deletions: 0,
      patch: '@@ -0,0 +1,20 @@\n+export const config = {};',
    },
  ] as CanonicalDiffFile[];
}

describe('T127: JSON Output Schema Compliance', () => {
  describe('Required Fields', () => {
    it('should include schema_version field', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('schema_version');
      expect(typeof parsed.schema_version).toBe('string');
      expect(parsed.schema_version).toBe(JSON_SCHEMA_VERSION);
    });

    it('should include version field (tool version)', () => {
      const findings = createMockFindings();
      const context = { ...createDefaultContext(), version: '1.2.3' };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('version');
      expect(parsed.version).toBe('1.2.3');
    });

    it('should include timestamp field', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('timestamp');
      // Should be ISO 8601 format
      expect(() => new Date(parsed.timestamp)).not.toThrow();
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });

    it('should include summary object', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('summary');
      expect(parsed.summary).toHaveProperty('errorCount');
      expect(parsed.summary).toHaveProperty('warningCount');
      expect(parsed.summary).toHaveProperty('infoCount');
      expect(parsed.summary).toHaveProperty('filesAnalyzed');
      expect(parsed.summary).toHaveProperty('linesChanged');
    });

    it('should include findings array', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('findings');
      expect(Array.isArray(parsed.findings)).toBe(true);
      expect(parsed.findings).toHaveLength(3);
    });

    it('should include partialFindings array', () => {
      const findings = createMockFindings();
      const partialFindings: Finding[] = [
        {
          file: 'partial.ts',
          line: 1,
          message: 'Agent interrupted',
          severity: 'warning',
          sourceAgent: 'interrupted-agent',
        },
      ];
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, partialFindings, context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('partialFindings');
      expect(Array.isArray(parsed.partialFindings)).toBe(true);
      expect(parsed.partialFindings).toHaveLength(1);
    });

    it('should include passes array', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('passes');
      expect(Array.isArray(parsed.passes)).toBe(true);
    });

    it('should include config source information', () => {
      const findings = createMockFindings();
      const context = {
        ...createDefaultContext(),
        configSource: { source: 'file' as const, path: '.ai-review.yml' },
      };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('config');
      expect(parsed.config).toHaveProperty('source');
    });
  });

  describe('Summary Counts', () => {
    it('should correctly count findings by severity', () => {
      const findings = createMockFindings(); // 1 error, 1 warning, 1 info
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.errorCount).toBe(1);
      expect(parsed.summary.warningCount).toBe(1);
      expect(parsed.summary.infoCount).toBe(1);
    });

    it('should correctly count files analyzed', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.filesAnalyzed).toBe(3);
    });

    it('should correctly calculate lines changed', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      // Total: (15+5) + (10+3) + (20+0) = 53
      expect(parsed.summary.linesChanged).toBe(53);
    });
  });

  describe('Finding Structure', () => {
    it('should include required finding fields', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      const finding = parsed.findings[0];
      expect(finding).toHaveProperty('file');
      expect(finding).toHaveProperty('line');
      expect(finding).toHaveProperty('message');
      expect(finding).toHaveProperty('severity');
      expect(finding).toHaveProperty('sourceAgent');
    });

    it('should include optional finding fields when present', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      // First finding has suggestion and ruleId
      const finding = parsed.findings[0];
      expect(finding).toHaveProperty('suggestion');
      expect(finding).toHaveProperty('ruleId');
    });
  });

  describe('Cost Information', () => {
    it('should include execution time when provided', () => {
      const findings = createMockFindings();
      const context = { ...createDefaultContext(), executionTimeMs: 1500 };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.executionTimeMs).toBe(1500);
    });

    it('should include estimated cost when provided', () => {
      const findings = createMockFindings();
      const context = { ...createDefaultContext(), estimatedCostUsd: 0.05 };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBe(0.05);
    });

    it('should clamp negative costs to zero (FR-REL-002)', () => {
      const findings = createMockFindings();
      const context = { ...createDefaultContext(), estimatedCostUsd: -0.05 };
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput(findings, [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.summary.estimatedCostUsd).toBe(0);
    });
  });

  describe('Empty Cases', () => {
    it('should handle empty findings array', () => {
      const context = createDefaultContext();
      const diffFiles = createMockDiffFiles();

      const output = generateJsonOutput([], [], context, diffFiles);
      const parsed = JSON.parse(output);

      expect(parsed.findings).toHaveLength(0);
      expect(parsed.summary.errorCount).toBe(0);
      expect(parsed.summary.warningCount).toBe(0);
      expect(parsed.summary.infoCount).toBe(0);
    });

    it('should handle empty diff files', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateJsonOutput(findings, [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed.summary.filesAnalyzed).toBe(0);
      expect(parsed.summary.linesChanged).toBe(0);
    });
  });
});
