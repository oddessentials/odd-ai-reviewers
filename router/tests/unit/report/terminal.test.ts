/**
 * Terminal Reporter Tests
 *
 * Tests for the terminal reporter module including:
 * - Box drawing utilities (T057)
 * - Code snippet extraction (T058)
 * - Finding formatting (T059)
 * - Summary generation (T060)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Finding } from '../../../src/agents/types.js';
import type { DiffFile, CanonicalDiffFile } from '../../../src/diff.js';
import type { Config } from '../../../src/config.js';
import type { TerminalContext } from '../../../src/report/terminal.js';
import {
  // Box drawing utilities
  BOX_CHARS,
  ASCII_BOX_CHARS,
  getBoxChars,
  drawHorizontalLine,
  drawSectionDivider,
  padToWidth,
  wrapText,
  // Code snippet extraction
  detectLanguage,
  extractCodeSnippet,
  // Finding formatting
  formatFindingBox,
  formatFindingsList,
  formatCodeSnippet,
  // Summary generation
  generateSummary,
  generateTerminalSummary,
  generateHeader,
  // Output formats
  generateQuietOutput,
  generateVerboseOutput,
  // Main function
  reportToTerminal,
  formatFindingForTerminal,
  createDefaultContext,
} from '../../../src/report/terminal.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'error',
    file: 'src/example.ts',
    line: 10,
    message: 'This is an error message',
    sourceAgent: 'test-agent',
    ...overrides,
  };
}

function createTestContext(overrides: Partial<TerminalContext> = {}): TerminalContext {
  return {
    colored: false, // Default to no colors for easier testing
    verbose: false,
    quiet: false,
    format: 'pretty',
    showProgress: true,
    showCost: true,
    version: '1.0.0',
    ...overrides,
  };
}

function createTestPatch(): string {
  return `diff --git a/src/example.ts b/src/example.ts
index 1234567..abcdefg 100644
--- a/src/example.ts
+++ b/src/example.ts
@@ -7,6 +7,8 @@ function foo() {
   const a = 1;
   const b = 2;
   const c = 3;
+  // This is line 10 - the error line
+  const problematic = undefined;
   const d = 4;
   const e = 5;
 }`;
}

// =============================================================================
// Box Drawing Utilities Tests (T057)
// =============================================================================

describe('Box Drawing Utilities', () => {
  describe('BOX_CHARS and ASCII_BOX_CHARS', () => {
    it('should have all required box characters', () => {
      expect(BOX_CHARS.topLeft).toBe('┌');
      expect(BOX_CHARS.topRight).toBe('┐');
      expect(BOX_CHARS.bottomLeft).toBe('└');
      expect(BOX_CHARS.bottomRight).toBe('┘');
      expect(BOX_CHARS.horizontal).toBe('─');
      expect(BOX_CHARS.vertical).toBe('│');
      expect(BOX_CHARS.sectionDivider).toBe('━');
    });

    it('should have ASCII fallback characters', () => {
      expect(ASCII_BOX_CHARS.topLeft).toBe('+');
      expect(ASCII_BOX_CHARS.topRight).toBe('+');
      expect(ASCII_BOX_CHARS.bottomLeft).toBe('+');
      expect(ASCII_BOX_CHARS.bottomRight).toBe('+');
      expect(ASCII_BOX_CHARS.horizontal).toBe('-');
      expect(ASCII_BOX_CHARS.vertical).toBe('|');
      expect(ASCII_BOX_CHARS.sectionDivider).toBe('=');
    });
  });

  describe('getBoxChars', () => {
    it('should return Unicode characters when useUnicode is true', () => {
      const chars = getBoxChars(true);
      expect(chars.topLeft).toBe('┌');
      expect(chars.horizontal).toBe('─');
    });

    it('should return ASCII characters when useUnicode is false', () => {
      const chars = getBoxChars(false);
      expect(chars.topLeft).toBe('+');
      expect(chars.horizontal).toBe('-');
    });
  });

  describe('drawHorizontalLine', () => {
    it('should draw a line of specified width', () => {
      expect(drawHorizontalLine(5, '-')).toBe('-----');
      expect(drawHorizontalLine(3, '─')).toBe('───');
    });

    it('should handle zero width', () => {
      expect(drawHorizontalLine(0, '-')).toBe('');
    });
  });

  describe('drawSectionDivider', () => {
    it('should draw Unicode section divider', () => {
      expect(drawSectionDivider(5, true)).toBe('━━━━━');
    });

    it('should draw ASCII section divider', () => {
      expect(drawSectionDivider(5, false)).toBe('=====');
    });
  });

  describe('padToWidth', () => {
    it('should left-pad by default', () => {
      expect(padToWidth('hello', 10)).toBe('hello     ');
    });

    it('should center-pad when specified', () => {
      expect(padToWidth('hi', 6, 'center')).toBe('  hi  ');
    });

    it('should right-pad when specified', () => {
      expect(padToWidth('hi', 6, 'right')).toBe('    hi');
    });

    it('should not truncate text longer than width', () => {
      expect(padToWidth('hello world', 5)).toBe('hello world');
    });
  });

  describe('wrapText', () => {
    it('should wrap text at word boundaries', () => {
      const result = wrapText('hello world foo bar', 10);
      expect(result).toEqual(['hello', 'world foo', 'bar']);
    });

    it('should handle single long word', () => {
      const result = wrapText('superlongword', 5);
      expect(result).toEqual(['superlongword']); // Long word on its own line
    });

    it('should handle empty string', () => {
      const result = wrapText('', 10);
      expect(result).toEqual(['']);
    });

    it('should handle zero max width', () => {
      const result = wrapText('hello', 0);
      expect(result).toEqual(['hello']); // Falls back to original
    });
  });
});

// =============================================================================
// Code Snippet Extraction Tests (T058)
// =============================================================================

describe('Code Snippet Extraction', () => {
  describe('detectLanguage', () => {
    it('should detect TypeScript from .ts extension', () => {
      expect(detectLanguage('src/example.ts')).toBe('typescript');
    });

    it('should detect TypeScript from .tsx extension', () => {
      expect(detectLanguage('src/Component.tsx')).toBe('typescript');
    });

    it('should detect JavaScript from .js extension', () => {
      expect(detectLanguage('src/example.js')).toBe('javascript');
    });

    it('should detect Python from .py extension', () => {
      expect(detectLanguage('script.py')).toBe('python');
    });

    it('should return undefined for unknown extension', () => {
      expect(detectLanguage('file.xyz')).toBeUndefined();
    });

    it('should return undefined for files without extension', () => {
      expect(detectLanguage('Dockerfile')).toBeUndefined();
    });
  });

  describe('extractCodeSnippet', () => {
    const patch = createTestPatch();

    it('should extract snippet for a valid line', () => {
      const snippet = extractCodeSnippet(patch, 10, 2, 'src/example.ts');

      expect(snippet).toBeDefined();
      if (snippet) {
        expect(snippet.lines.length).toBeGreaterThan(0);
        expect(snippet.language).toBe('typescript');
      }
    });

    it('should return undefined for undefined line', () => {
      const snippet = extractCodeSnippet(patch, undefined, 2);
      expect(snippet).toBeUndefined();
    });

    it('should return undefined for undefined patch', () => {
      const snippet = extractCodeSnippet(undefined, 10, 2);
      expect(snippet).toBeUndefined();
    });

    it('should highlight the target line', () => {
      const snippet = extractCodeSnippet(patch, 10, 2, 'src/example.ts');

      if (snippet) {
        const highlightedLine = snippet.lines.find((l) => l.isHighlighted);
        expect(highlightedLine).toBeDefined();
        if (highlightedLine) {
          expect(highlightedLine.lineNumber).toBe(10);
        }
      }
    });
  });

  describe('formatCodeSnippet', () => {
    it('should format snippet with line numbers', () => {
      const snippet = {
        lines: [
          { lineNumber: 9, content: 'const c = 3;', isHighlighted: false },
          { lineNumber: 10, content: 'const d = 4;', isHighlighted: true },
          { lineNumber: 11, content: 'const e = 5;', isHighlighted: false },
        ],
        highlightLine: 1,
        language: 'typescript',
      };

      const formatted = formatCodeSnippet(snippet, false, 60);

      expect(formatted.length).toBe(3);
      expect(formatted[1]).toContain('10'); // Line number
      expect(formatted[1]).toContain('▸'); // Highlight marker
    });

    it('should handle empty snippet', () => {
      const snippet = {
        lines: [],
        highlightLine: -1,
      };

      const formatted = formatCodeSnippet(snippet, false, 60);
      expect(formatted).toEqual([]);
    });
  });
});

// =============================================================================
// Finding Formatting Tests (T059)
// =============================================================================

describe('Finding Formatting', () => {
  describe('formatFindingBox', () => {
    it('should format a basic finding', () => {
      const finding = createTestFinding();
      const context = createTestContext();

      const box = formatFindingBox(finding, context);

      expect(box).toContain('src/example.ts');
      expect(box).toContain('10');
      expect(box).toContain('ERROR');
      expect(box).toContain('This is an error message');
    });

    it('should include suggestion if present', () => {
      const finding = createTestFinding({
        suggestion: 'Consider using a different approach',
      });
      const context = createTestContext();

      const box = formatFindingBox(finding, context);

      expect(box).toContain('💡');
      expect(box).toContain('Consider using a different approach');
    });

    it('should include rule ID if present', () => {
      const finding = createTestFinding({
        ruleId: 'no-unused-vars',
      });
      const context = createTestContext();

      const box = formatFindingBox(finding, context);

      expect(box).toContain('no-unused-vars');
    });

    it('should handle file-level findings (no line)', () => {
      const finding = createTestFinding({
        line: undefined,
      });
      const context = createTestContext();

      const box = formatFindingBox(finding, context);

      expect(box).toContain('src/example.ts');
      expect(box).not.toContain(':undefined');
    });

    it('should handle warning severity', () => {
      const finding = createTestFinding({
        severity: 'warning',
      });
      const context = createTestContext();

      const box = formatFindingBox(finding, context);

      expect(box).toContain('WARNING');
    });

    it('should handle info severity', () => {
      const finding = createTestFinding({
        severity: 'info',
      });
      const context = createTestContext();

      const box = formatFindingBox(finding, context);

      expect(box).toContain('INFO');
    });
  });

  describe('formatFindingsList', () => {
    it('should format multiple findings', () => {
      const findings = [
        createTestFinding({ message: 'First error' }),
        createTestFinding({ message: 'Second error', line: 20 }),
      ];
      const context = createTestContext();

      const list = formatFindingsList(findings, context);

      expect(list).toContain('First error');
      expect(list).toContain('Second error');
    });

    it('should return empty string for no findings', () => {
      const list = formatFindingsList([], createTestContext());
      expect(list).toBe('');
    });

    it('should separate findings with blank lines', () => {
      const findings = [
        createTestFinding({ message: 'First' }),
        createTestFinding({ message: 'Second' }),
      ];
      const context = createTestContext();

      const list = formatFindingsList(findings, context);

      expect(list).toContain('\n\n');
    });
  });

  describe('formatFindingForTerminal', () => {
    it('should format finding using formatFindingBox', () => {
      const finding = createTestFinding();
      const context = createTestContext();

      const formatted = formatFindingForTerminal(finding, context);

      expect(formatted).toContain('src/example.ts');
      expect(formatted).toContain('ERROR');
    });
  });
});

// =============================================================================
// Summary Generation Tests (T060)
// =============================================================================

describe('Summary Generation', () => {
  describe('generateSummary', () => {
    it('should show correct counts', () => {
      const findings = [
        createTestFinding({ severity: 'error' }),
        createTestFinding({ severity: 'error' }),
        createTestFinding({ severity: 'warning' }),
        createTestFinding({ severity: 'info' }),
      ];
      const context = createTestContext();
      const stats = {
        filesAnalyzed: 5,
        linesChanged: 100,
        executionTimeMs: 1500,
        estimatedCostUsd: 0.05,
      };

      const summary = generateSummary(findings, stats, context);

      expect(summary).toContain('Errors:      2');
      expect(summary).toContain('Warnings:    1');
      expect(summary).toContain('Suggestions: 1');
    });

    it('should show file count', () => {
      const context = createTestContext();
      const stats = {
        filesAnalyzed: 10,
        linesChanged: 200,
        executionTimeMs: 1000,
        estimatedCostUsd: 0.01,
      };

      const summary = generateSummary([], stats, context);

      expect(summary).toContain('10 analyzed');
    });

    it('should show execution time', () => {
      const context = createTestContext();
      const stats = {
        filesAnalyzed: 5,
        linesChanged: 100,
        executionTimeMs: 2500,
        estimatedCostUsd: 0.05,
      };

      const summary = generateSummary([], stats, context);

      expect(summary).toContain('2.5s');
    });

    it('should show cost when enabled', () => {
      const context = createTestContext({ showCost: true });
      const stats = {
        filesAnalyzed: 5,
        linesChanged: 100,
        executionTimeMs: 1000,
        estimatedCostUsd: 0.0523,
      };

      const summary = generateSummary([], stats, context);

      expect(summary).toContain('$0.0523');
    });

    it('should hide cost when disabled', () => {
      const context = createTestContext({ showCost: false });
      const stats = {
        filesAnalyzed: 5,
        linesChanged: 100,
        executionTimeMs: 1000,
        estimatedCostUsd: 0.05,
      };

      const summary = generateSummary([], stats, context);

      expect(summary).not.toContain('Cost:');
    });

    it('should clamp negative cost to zero', () => {
      const context = createTestContext({ showCost: true });
      const stats = {
        filesAnalyzed: 5,
        linesChanged: 100,
        executionTimeMs: 1000,
        estimatedCostUsd: -0.05, // Negative cost
      };

      const summary = generateSummary([], stats, context);

      // Should not show negative cost
      expect(summary).not.toContain('-$');
      expect(summary).not.toContain('$-');
    });
  });

  describe('generateTerminalSummary', () => {
    it('should generate summary using legacy interface', () => {
      const findings = [createTestFinding()];
      const partialFindings: Finding[] = [];

      const summary = generateTerminalSummary(findings, partialFindings, 1000, 0.05);

      expect(summary).toContain('SUMMARY');
    });
  });

  describe('generateHeader', () => {
    it('should include version', () => {
      const context = createTestContext({ version: '2.0.0' });

      const header = generateHeader(context, { fileCount: 5, lineCount: 100 });

      expect(header).toContain('v2.0.0');
    });

    it('should show file and line counts', () => {
      const context = createTestContext();

      const header = generateHeader(context, { fileCount: 10, lineCount: 500 });

      expect(header).toContain('10 files');
      expect(header).toContain('500 lines');
    });

    it('should show config source', () => {
      const context = createTestContext({
        configSource: { source: 'zero-config' },
      });

      const header = generateHeader(context, { fileCount: 5, lineCount: 100 });

      expect(header).toContain('zero-config defaults');
    });

    it('should show base ref', () => {
      const context = createTestContext({
        baseRef: 'main',
        baseSource: 'auto-detected',
      });

      const header = generateHeader(context, { fileCount: 5, lineCount: 100 });

      expect(header).toContain('main');
      expect(header).toContain('auto-detected');
    });
  });
});

// =============================================================================
// Output Mode Tests
// =============================================================================

describe('Output Modes', () => {
  describe('generateQuietOutput', () => {
    it('should show error count when errors exist', () => {
      const findings = [
        createTestFinding({ severity: 'error' }),
        createTestFinding({ severity: 'error' }),
        createTestFinding({ severity: 'warning' }), // Ignored in quiet mode
      ];

      const output = generateQuietOutput(findings);

      expect(output).toBe('2 errors found\n');
    });

    it('should show singular when one error', () => {
      const findings = [createTestFinding({ severity: 'error' })];

      const output = generateQuietOutput(findings);

      expect(output).toBe('1 error found\n');
    });

    it('should show success message when no errors', () => {
      const findings = [
        createTestFinding({ severity: 'warning' }),
        createTestFinding({ severity: 'info' }),
      ];

      const output = generateQuietOutput(findings);

      expect(output).toBe('No errors found\n');
    });
  });

  describe('generateVerboseOutput', () => {
    it('should include verbose header', () => {
      const context = createTestContext();
      const diffFiles: CanonicalDiffFile[] = [];

      const output = generateVerboseOutput(context, diffFiles);

      expect(output).toContain('Verbose Details');
    });

    it('should show base ref when available', () => {
      const context = createTestContext({ baseRef: 'feature-branch' });
      const diffFiles: CanonicalDiffFile[] = [];

      const output = generateVerboseOutput(context, diffFiles);

      expect(output).toContain('feature-branch');
    });
  });
});

// =============================================================================
// Default Context Tests
// =============================================================================

describe('createDefaultContext', () => {
  it('should create context with sensible defaults', () => {
    const context = createDefaultContext();

    expect(context.colored).toBe(true);
    expect(context.verbose).toBe(false);
    expect(context.quiet).toBe(false);
    expect(context.format).toBe('pretty');
    expect(context.showProgress).toBe(true);
    expect(context.showCost).toBe(true);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('reportToTerminal Integration', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('should return success result with findings count', async () => {
    const findings = [createTestFinding()];
    const partialFindings: Finding[] = [];
    const context = createTestContext();
    const config = {} as Config;
    const diffFiles: DiffFile[] = [
      {
        path: 'src/example.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: createTestPatch(),
      },
    ];

    const result = await reportToTerminal(findings, partialFindings, context, config, diffFiles);

    expect(result.success).toBe(true);
    expect(result.findingsCount).toBe(1);
    expect(result.partialFindingsCount).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it('should write output to stdout', async () => {
    const findings = [createTestFinding()];
    const context = createTestContext();
    const config = {} as Config;
    const diffFiles: DiffFile[] = [];

    await reportToTerminal(findings, [], context, config, diffFiles);

    expect(stdoutSpy).toHaveBeenCalled();
  });

  it('should handle empty findings', async () => {
    const context = createTestContext();
    const config = {} as Config;
    const diffFiles: DiffFile[] = [];

    const result = await reportToTerminal([], [], context, config, diffFiles);

    expect(result.success).toBe(true);
    expect(result.findingsCount).toBe(0);
  });

  it('should count partial findings separately', async () => {
    const findings = [createTestFinding()];
    const partialFindings = [
      createTestFinding({ message: 'Partial finding', provenance: 'partial' }),
    ];
    const context = createTestContext();
    const config = {} as Config;
    const diffFiles: DiffFile[] = [];

    const result = await reportToTerminal(findings, partialFindings, context, config, diffFiles);

    expect(result.findingsCount).toBe(1);
    expect(result.partialFindingsCount).toBe(1);
  });
});
