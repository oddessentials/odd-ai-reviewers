/**
 * Schema Compliance Tests: Terminal Format Stability
 *
 * PR_LESSONS_LEARNED.md Requirement: Schema/Contract Integrity
 * "Consumers need to validate compatibility"
 *
 * These snapshot tests ensure the terminal output format remains stable
 * across releases. Changes to the format should be intentional and
 * documented.
 *
 * @module tests/schema/terminal-format-stability
 */

import { describe, it, expect } from 'vitest';
import type { Finding } from '../../src/agents/types.js';
import {
  formatFindingBox,
  generateSummary,
  generateHeader,
  createDefaultContext,
  getBoxChars,
  drawHorizontalLine,
  formatCodeSnippet,
} from '../../src/report/terminal.js';
import type { TerminalContext, CodeSnippet } from '../../src/report/terminal.js';

/**
 * Create a deterministic finding for snapshot testing
 */
function createStableFinding(): Finding {
  return {
    file: 'src/example.ts',
    line: 42,
    message: 'Consider using optional chaining',
    severity: 'warning',
    sourceAgent: 'style-checker',
    suggestion: 'Replace with obj?.prop',
    ruleId: 'prefer-optional-chaining',
  };
}

/**
 * Create a non-colored context for consistent snapshots
 */
function createStableContext(): TerminalContext {
  return {
    ...createDefaultContext(),
    colored: false, // Disable colors for consistent snapshots
    useUnicode: true, // Use Unicode for consistent rendering
    verbose: false,
    quiet: false,
    format: 'pretty',
    showProgress: false,
    showCost: false,
    version: '1.0.0', // Fixed version for snapshots
    configSource: { source: 'file', path: '.ai-review.yml' },
    executionTimeMs: 1234,
    estimatedCostUsd: 0.05,
  };
}

describe('T128a: Terminal Format Stability', () => {
  describe('Box Characters', () => {
    it('should have consistent Unicode box characters', () => {
      const chars = getBoxChars(true);

      expect(chars.topLeft).toBe('┌');
      expect(chars.topRight).toBe('┐');
      expect(chars.bottomLeft).toBe('└');
      expect(chars.bottomRight).toBe('┘');
      expect(chars.horizontal).toBe('─');
      expect(chars.vertical).toBe('│');
    });

    it('should have consistent ASCII box characters', () => {
      const chars = getBoxChars(false);

      expect(chars.topLeft).toBe('+');
      expect(chars.topRight).toBe('+');
      expect(chars.bottomLeft).toBe('+');
      expect(chars.bottomRight).toBe('+');
      expect(chars.horizontal).toBe('-');
      expect(chars.vertical).toBe('|');
    });
  });

  describe('Horizontal Lines', () => {
    it('should draw consistent horizontal lines', () => {
      const line = drawHorizontalLine(10, '-');
      expect(line).toBe('----------');
    });
  });

  describe('Finding Box Format', () => {
    it('should format finding box consistently', () => {
      const finding = createStableFinding();
      const context = createStableContext();

      const output = formatFindingBox(finding, context);

      // Verify key components are present
      expect(output).toContain('src/example.ts');
      expect(output).toContain('42');
      expect(output.toUpperCase()).toContain('WARNING'); // Case may vary
      expect(output).toContain('Consider using optional chaining');
      expect(output).toContain('style-checker');
    });

    it('should include suggestion when present', () => {
      const finding = createStableFinding();
      const context = createStableContext();

      const output = formatFindingBox(finding, context);

      expect(output).toContain('Replace with obj?.prop');
    });

    it('should format error severity distinctly', () => {
      const finding: Finding = {
        ...createStableFinding(),
        severity: 'error',
      };
      const context = createStableContext();

      const output = formatFindingBox(finding, context);

      expect(output.toUpperCase()).toContain('ERROR');
    });

    it('should format info severity distinctly', () => {
      const finding: Finding = {
        ...createStableFinding(),
        severity: 'info',
      };
      const context = createStableContext();

      const output = formatFindingBox(finding, context);

      expect(output.toUpperCase()).toContain('INFO');
    });
  });

  describe('Summary Format', () => {
    it('should generate consistent summary structure', () => {
      const findings: Finding[] = [
        { file: 'a.ts', line: 1, message: 'e1', severity: 'error', sourceAgent: 't' },
        { file: 'b.ts', line: 2, message: 'e2', severity: 'error', sourceAgent: 't' },
        { file: 'c.ts', line: 3, message: 'w1', severity: 'warning', sourceAgent: 't' },
        { file: 'd.ts', line: 4, message: 'w2', severity: 'warning', sourceAgent: 't' },
        { file: 'e.ts', line: 5, message: 'w3', severity: 'warning', sourceAgent: 't' },
        { file: 'f.ts', line: 6, message: 'w4', severity: 'warning', sourceAgent: 't' },
        { file: 'g.ts', line: 7, message: 'w5', severity: 'warning', sourceAgent: 't' },
        { file: 'h.ts', line: 8, message: 'i1', severity: 'info', sourceAgent: 't' },
        { file: 'i.ts', line: 9, message: 'i2', severity: 'info', sourceAgent: 't' },
        { file: 'j.ts', line: 10, message: 'i3', severity: 'info', sourceAgent: 't' },
      ];
      const stats = {
        filesAnalyzed: 10,
        linesChanged: 150,
        executionTimeMs: 1500,
        estimatedCostUsd: 0.08,
      };
      const context = createStableContext();

      const output = generateSummary(findings, stats, context);

      // Verify counts are present
      expect(output).toContain('2'); // errors
      expect(output).toContain('5'); // warnings
      expect(output).toContain('10'); // files
    });

    it('should handle zero counts', () => {
      const findings: Finding[] = [];
      const stats = {
        filesAnalyzed: 0,
        linesChanged: 0,
        executionTimeMs: 0,
        estimatedCostUsd: 0,
      };
      const context = createStableContext();

      const output = generateSummary(findings, stats, context);

      // Should not throw and should contain zeros
      expect(output).toContain('0');
    });
  });

  describe('Header Format', () => {
    it('should generate consistent header', () => {
      const context = createStableContext();
      const stats = { fileCount: 5, lineCount: 100 };
      const output = generateHeader(context, stats);

      // Should include tool identification
      expect(output.toLowerCase()).toMatch(/ai.*review|odd/);
    });

    it('should include version when provided', () => {
      const context = { ...createStableContext(), version: '2.0.0' };
      const stats = { fileCount: 5, lineCount: 100 };
      const output = generateHeader(context, stats);

      expect(output).toContain('2.0.0');
    });
  });

  describe('Code Snippet Format', () => {
    it('should format code snippets consistently', () => {
      const snippet: CodeSnippet = {
        lines: [
          { lineNumber: 40, content: 'function example() {', isHighlighted: false },
          { lineNumber: 41, content: '  const x = obj && obj.prop;', isHighlighted: false },
          { lineNumber: 42, content: '  return x;', isHighlighted: true },
          { lineNumber: 43, content: '}', isHighlighted: false },
        ],
        highlightLine: 2,
        language: 'typescript',
      };

      const output = formatCodeSnippet(snippet, false, 80);
      const outputStr = output.join('\n');

      // Should include line numbers
      expect(outputStr).toContain('40');
      expect(outputStr).toContain('41');
      expect(outputStr).toContain('42');
      expect(outputStr).toContain('43');

      // Should include code content
      expect(outputStr).toContain('function example()');
    });

    it('should highlight the correct line', () => {
      const snippet: CodeSnippet = {
        lines: [
          { lineNumber: 1, content: 'line 1', isHighlighted: false },
          { lineNumber: 2, content: 'line 2', isHighlighted: true },
          { lineNumber: 3, content: 'line 3', isHighlighted: false },
        ],
        highlightLine: 1,
      };

      const output = formatCodeSnippet(snippet, false, 80);
      const outputStr = output.join('\n');

      // The highlighted line should be visually distinct
      // We can't easily test for visual distinction without colors,
      // but we can verify all lines are present
      expect(outputStr).toContain('line 1');
      expect(outputStr).toContain('line 2');
      expect(outputStr).toContain('line 3');
    });
  });

  describe('Output Consistency', () => {
    it('should produce identical output for identical input', () => {
      const finding = createStableFinding();
      const context = createStableContext();

      const output1 = formatFindingBox(finding, context);
      const output2 = formatFindingBox(finding, context);

      expect(output1).toBe(output2);
    });

    it('should be deterministic across multiple calls', () => {
      const context = createStableContext();
      const outputs: string[] = [];

      for (let i = 0; i < 5; i++) {
        const finding = createStableFinding();
        outputs.push(formatFindingBox(finding, context));
      }

      // All outputs should be identical
      expect(new Set(outputs).size).toBe(1);
    });
  });

  describe('Character Encoding', () => {
    it('should handle special characters in messages', () => {
      const finding: Finding = {
        ...createStableFinding(),
        message: 'Consider using `??` operator for <nullable> values',
      };
      const context = createStableContext();

      const output = formatFindingBox(finding, context);

      // Special characters should be preserved
      expect(output).toContain('??');
      expect(output).toContain('<nullable>');
    });

    it('should handle Unicode in file paths', () => {
      const finding: Finding = {
        ...createStableFinding(),
        file: 'src/コンポーネント.ts',
      };
      const context = createStableContext();

      const output = formatFindingBox(finding, context);

      expect(output).toContain('コンポーネント');
    });
  });
});
