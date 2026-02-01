/**
 * Terminal Reporter JSON Output Tests (T061)
 *
 * Tests for JSON output format including schema validation.
 * Verifies FR-SCH-001: JSON output includes schema_version field
 */

import { describe, it, expect } from 'vitest';
import type { Finding } from '../../../src/agents/types.js';
import type { TerminalContext, JsonOutput } from '../../../src/report/terminal.js';
import { generateJsonOutput, JSON_SCHEMA_VERSION } from '../../../src/report/terminal.js';
import type { CanonicalDiffFile } from '../../../src/diff.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'error',
    file: 'src/example.ts',
    line: 10,
    message: 'Test error message',
    sourceAgent: 'test-agent',
    ...overrides,
  };
}

function createTestContext(overrides: Partial<TerminalContext> = {}): TerminalContext {
  return {
    colored: false,
    verbose: false,
    quiet: false,
    format: 'json',
    showProgress: true,
    showCost: true,
    version: '1.2.3',
    configSource: { source: 'file', path: '.ai-review.yml' },
    executionTimeMs: 1500,
    estimatedCostUsd: 0.05,
    ...overrides,
  };
}

function createTestDiffFiles(): CanonicalDiffFile[] {
  return [
    {
      path: 'src/example.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
    } as CanonicalDiffFile,
    {
      path: 'src/another.ts',
      status: 'added',
      additions: 50,
      deletions: 0,
    } as CanonicalDiffFile,
  ];
}

// =============================================================================
// JSON Output Tests
// =============================================================================

describe('JSON Output', () => {
  describe('Schema Version (FR-SCH-001)', () => {
    it('should include schema_version field', () => {
      const findings = [createTestFinding()];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.schema_version).toBeDefined();
      expect(typeof output.schema_version).toBe('string');
    });

    it('should use the correct schema version', () => {
      const findings = [createTestFinding()];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.schema_version).toBe(JSON_SCHEMA_VERSION);
      expect(output.schema_version).toBe('1.0.0');
    });

    it('should have valid semver format', () => {
      const findings: Finding[] = [];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      // Match semver pattern: X.Y.Z
      const semverPattern = /^\d+\.\d+\.\d+$/;
      expect(output.schema_version).toMatch(semverPattern);
    });
  });

  describe('Tool Version', () => {
    it('should include version from context', () => {
      const context = createTestContext({ version: '2.0.0' });
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.version).toBe('2.0.0');
    });

    it('should use fallback version when not provided', () => {
      const context = createTestContext({ version: undefined });
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.version).toBe('0.0.0');
    });
  });

  describe('Timestamp', () => {
    it('should include ISO 8601 timestamp', () => {
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.timestamp).toBeDefined();
      // Validate ISO 8601 format with Z suffix (UTC)
      expect(output.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should use UTC timezone (Z suffix)', () => {
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.timestamp.endsWith('Z')).toBe(true);
    });
  });

  describe('Summary Section', () => {
    it('should include correct severity counts', () => {
      const findings = [
        createTestFinding({ severity: 'error' }),
        createTestFinding({ severity: 'error' }),
        createTestFinding({ severity: 'warning' }),
        createTestFinding({ severity: 'info' }),
        createTestFinding({ severity: 'info' }),
        createTestFinding({ severity: 'info' }),
      ];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.summary.errorCount).toBe(2);
      expect(output.summary.warningCount).toBe(1);
      expect(output.summary.infoCount).toBe(3);
    });

    it('should include file stats', () => {
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.summary.filesAnalyzed).toBe(2);
      expect(output.summary.linesChanged).toBe(65); // 10+5 + 50+0
    });

    it('should include execution time', () => {
      const context = createTestContext({ executionTimeMs: 2500 });
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.summary.executionTimeMs).toBe(2500);
    });

    it('should clamp negative cost to zero', () => {
      const context = createTestContext({ estimatedCostUsd: -0.05 });
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.summary.estimatedCostUsd).toBe(0);
    });
  });

  describe('Findings Array', () => {
    it('should include all findings', () => {
      const findings = [
        createTestFinding({ message: 'First' }),
        createTestFinding({ message: 'Second' }),
        createTestFinding({ message: 'Third' }),
      ];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.findings).toHaveLength(3);
    });

    it('should preserve finding properties', () => {
      const finding = createTestFinding({
        severity: 'warning',
        file: 'path/to/file.ts',
        line: 42,
        endLine: 45,
        message: 'Test message',
        suggestion: 'Fix suggestion',
        ruleId: 'test-rule',
        sourceAgent: 'test-agent',
      });
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([finding], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.findings[0]).toMatchObject({
        severity: 'warning',
        file: 'path/to/file.ts',
        line: 42,
        endLine: 45,
        message: 'Test message',
        suggestion: 'Fix suggestion',
        ruleId: 'test-rule',
        sourceAgent: 'test-agent',
      });
    });
  });

  describe('Partial Findings Array', () => {
    it('should include partial findings separately', () => {
      const findings = [createTestFinding()];
      const partialFindings = [
        createTestFinding({ message: 'Partial 1', provenance: 'partial' }),
        createTestFinding({ message: 'Partial 2', provenance: 'partial' }),
      ];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, partialFindings, context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.findings).toHaveLength(1);
      expect(output.partialFindings).toHaveLength(2);
    });
  });

  describe('Config Section', () => {
    it('should include config source info', () => {
      const context = createTestContext({
        configSource: { source: 'file', path: '/path/to/.ai-review.yml' },
      });
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.config.source).toBe('file');
      expect(output.config.path).toBe('/path/to/.ai-review.yml');
    });

    it('should handle zero-config source', () => {
      const context = createTestContext({
        configSource: { source: 'zero-config' },
      });
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.config.source).toBe('zero-config');
      expect(output.config.path).toBeUndefined();
    });
  });

  describe('Output Format', () => {
    it('should produce valid JSON', () => {
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([], [], context, diffFiles);

      expect(() => JSON.parse(jsonStr)).not.toThrow();
    });

    it('should produce single-line JSON (no pretty-printing)', () => {
      const findings = [createTestFinding(), createTestFinding()];
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput(findings, [], context, diffFiles);

      // Should not contain newlines within the JSON
      const lineCount = jsonStr.split('\n').length;
      expect(lineCount).toBe(1);
    });

    it('should be UTF-8 compatible', () => {
      const finding = createTestFinding({
        message: 'Unicode test: 日本語 🔥 émoji',
      });
      const context = createTestContext();
      const diffFiles = createTestDiffFiles();

      const jsonStr = generateJsonOutput([finding], [], context, diffFiles);
      const output = JSON.parse(jsonStr) as JsonOutput;

      expect(output.findings[0]?.message).toBe('Unicode test: 日本語 🔥 émoji');
    });
  });
});
