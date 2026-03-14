/**
 * Finding Validator Tests
 *
 * Tests for finding classification, line validation, and self-contradiction detection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateFindings,
  validateFindingsSemantics,
  validateNormalizedFindings,
  normalizeUnicode,
  filterPRIntentContradictions,
} from '../../../src/report/finding-validator.js';
import type { Finding } from '../../../src/agents/types.js';

/** Create a mock line resolver that controls validation per-call */
function createMockLineResolver(validEntries: Map<string, Set<number>>) {
  return {
    validateLine(file: string, line: number | undefined): { valid: boolean } {
      if (line === undefined) return { valid: false };
      const validLines = validEntries.get(file);
      return { valid: validLines?.has(line) ?? false };
    },
  };
}

/** Helper to create a finding */
function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'warning',
    file: 'src/app.ts',
    line: 10,
    message: 'Test finding',
    sourceAgent: 'test-agent',
    ...overrides,
  };
}

describe('Finding Validator', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('classification', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10, 20, 30])]]));
    const diffFiles = ['src/app.ts'];

    it('should classify inline: file + line in diff', () => {
      const findings = [makeFinding({ file: 'src/app.ts', line: 10 })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.stats.byClassification.inline).toBe(1);
    });

    it('should classify file-level: file only, no line', () => {
      const findings = [makeFinding({ file: 'src/app.ts', line: undefined })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.stats.byClassification['file-level']).toBe(1);
    });

    it('should classify global: no file', () => {
      const findings = [makeFinding({ file: undefined as unknown as string, line: undefined })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.stats.byClassification.global).toBe(1);
    });

    it('should classify cross-file: file not in diff', () => {
      const findings = [makeFinding({ file: 'src/other.ts', line: 5 })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.stats.byClassification['cross-file']).toBe(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('cross-file finding for src/other.ts')
      );
    });
  });

  describe('line validation', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10, 20, 30])]]));
    const diffFiles = ['src/app.ts'];

    it('should pass valid line through', () => {
      const findings = [makeFinding({ file: 'src/app.ts', line: 10 })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredByLine).toBe(0);
    });

    it('should filter invalid line with reason', () => {
      const findings = [makeFinding({ file: 'src/app.ts', line: 999 })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0]?.filterType).toBe('invalid_line');
      expect(result.filtered[0]?.filterReason).toContain('Line 999 not in diff range');
      expect(result.stats.filteredByLine).toBe(1);
    });

    it('should skip line validation for file-level findings', () => {
      const findings = [makeFinding({ file: 'src/app.ts', line: undefined })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
    });

    it('should skip line validation for global findings', () => {
      const findings = [makeFinding({ file: undefined as unknown as string, line: undefined })];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
    });

    it('should skip line validation for cross-file findings', () => {
      const findings = [makeFinding({ file: 'src/other.ts', line: 5 })];
      const result = validateFindings(findings, resolver, diffFiles);
      // Cross-file findings are not line-validated, they pass through
      expect(result.validFindings).toHaveLength(1);
    });
  });

  describe('self-contradiction detection', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10, 20, 30])]]));
    const diffFiles = ['src/app.ts'];

    it('should filter: info + dismissive + no suggestion', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'This is fine, no action required.',
          suggestion: undefined,
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
      expect(result.stats.filteredBySelfContradiction).toBe(1);
    });

    it('should NOT filter: info + dismissive + concrete suggestion', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'This is acceptable as-is but could be improved.',
          suggestion: 'Consider using a const assertion for type safety.',
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
    });

    it('should NOT filter: warning + dismissive + no suggestion (severity protection)', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          line: 10,
          message: 'No action required for this pattern.',
          suggestion: undefined,
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
    });

    it('should NOT filter: error + dismissive', () => {
      const findings = [
        makeFinding({
          severity: 'error',
          line: 10,
          message: 'Can be ignored in this context.',
          suggestion: undefined,
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
    });

    it('should NOT filter: info + no dismissive language', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'Consider adding error handling for the async call.',
          suggestion: undefined,
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
    });

    // Test each dismissive pattern individually
    const dismissivePatterns = [
      'no action required',
      'acceptable as-is',
      'acceptable as is',
      'not blocking',
      'no change needed',
      'can be ignored',
      'working as intended',
      'no issues found',
      'non-critical',
      'low priority',
    ];

    for (const pattern of dismissivePatterns) {
      it(`should detect dismissive pattern: "${pattern}"`, () => {
        const findings = [
          makeFinding({
            severity: 'info',
            line: 10,
            message: `This ${pattern} for now.`,
            suggestion: undefined,
          }),
        ];
        const result = validateFindings(findings, resolver, diffFiles);
        expect(result.filtered).toHaveLength(1);
        expect(result.filtered[0]?.filterType).toBe('self_contradicting');
      });
    }

    it('should not filter when suggestion itself contains actionable content', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'This can be ignored in most cases.',
          suggestion: 'Replace with a type guard for runtime safety.',
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
    });

    it('should filter when suggestion repeats dismissive language', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'This can be ignored.',
          suggestion: 'No action required.',
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('should not filter when dismissive wording is paired with concrete remediation', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'This is not blocking.',
          suggestion: 'Not blocking, but sanitize this before writing to innerHTML.',
        }),
      ];

      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
    });

    // FR-026: Warning severity must always pass through even with dismissive pattern
    it('should not filter warning severity even when dismissive pattern matches', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          line: 10,
          message: 'This is working as intended but has a security issue.',
          suggestion: undefined,
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
    });

    // FR-026: Actionable suggestion must always pass through even with dismissive pattern + info severity
    it('should not filter info severity with dismissive pattern when suggestion is actionable', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'This is low priority.',
          suggestion: 'Add input validation to prevent injection attacks.',
        }),
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
    });
  });

  describe('stats', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10, 20])]]));
    const diffFiles = ['src/app.ts'];

    it('should report correct counts in byClassification', () => {
      const findings = [
        makeFinding({ file: 'src/app.ts', line: 10 }), // inline
        makeFinding({ file: 'src/app.ts', line: undefined }), // file-level
        makeFinding({ file: undefined as unknown as string, line: undefined }), // global
        makeFinding({ file: 'src/other.ts', line: 5 }), // cross-file
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.stats.byClassification.inline).toBe(1);
      expect(result.stats.byClassification['file-level']).toBe(1);
      expect(result.stats.byClassification.global).toBe(1);
      expect(result.stats.byClassification['cross-file']).toBe(1);
    });

    it('should report correct filteredByLine and filteredBySelfContradiction', () => {
      const findings = [
        makeFinding({ file: 'src/app.ts', line: 999 }), // invalid line
        makeFinding({
          severity: 'info',
          file: 'src/app.ts',
          line: 10,
          message: 'No action required.',
          suggestion: undefined,
        }), // self-contradicting
        makeFinding({ file: 'src/app.ts', line: 20 }), // valid
      ];
      const result = validateFindings(findings, resolver, diffFiles);
      expect(result.stats.total).toBe(3);
      expect(result.stats.valid).toBe(1);
      expect(result.stats.filteredByLine).toBe(1);
      expect(result.stats.filteredBySelfContradiction).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle empty findings array', () => {
      const resolver = createMockLineResolver(new Map());
      const result = validateFindings([], resolver, []);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered).toHaveLength(0);
      expect(result.stats.total).toBe(0);
    });

    it('should handle missing diffFiles (all files treated as in-diff)', () => {
      const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10])]]));
      // No diffFiles parameter → diffFileSet is empty → no cross-file classification
      const findings = [makeFinding({ file: 'src/app.ts', line: 10 })];
      const result = validateFindings(findings, resolver);
      expect(result.validFindings).toHaveLength(1);
    });
  });
});

/**
 * Stage 1: Semantic-only validation tests (validateFindingsSemantics)
 *
 * Regression tests for the finding lifecycle boundary fix.
 * Semantic validation must NOT filter by line/path — only by self-contradiction.
 */
describe('validateFindingsSemantics (Stage 1)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should NOT filter findings with stale line numbers', () => {
    // Previously, processFindings would filter this via line validation.
    // After the lifecycle fix, semantic validation preserves it for normalization.
    const findings = [
      makeFinding({ file: 'src/app.ts', line: 999 }), // stale line
    ];
    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(1);
    expect(result.stats.filteredByLine).toBe(0);
  });

  it('should NOT filter findings with renamed file paths', () => {
    // Finding references old path before rename — normalization can remap it later.
    const findings = [makeFinding({ file: 'src/old-name.ts', line: 10 })];
    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(1);
    expect(result.stats.filteredByLine).toBe(0);
  });

  it('should still filter self-contradicting info findings', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message: 'This is fine, no action required.',
        suggestion: undefined,
      }),
    ];
    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(0);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    expect(result.stats.filteredBySelfContradiction).toBe(1);
  });

  it('should classify inline findings (file + line)', () => {
    const findings = [makeFinding({ file: 'src/app.ts', line: 10 })];
    const result = validateFindingsSemantics(findings);
    expect(result.stats.byClassification.inline).toBe(1);
  });

  it('should classify file-level findings (file, no line)', () => {
    const findings = [makeFinding({ file: 'src/app.ts', line: undefined })];
    const result = validateFindingsSemantics(findings);
    expect(result.stats.byClassification['file-level']).toBe(1);
  });

  it('should classify global findings (no file)', () => {
    const findings = [makeFinding({ file: undefined as unknown as string, line: undefined })];
    const result = validateFindingsSemantics(findings);
    expect(result.stats.byClassification.global).toBe(1);
  });

  it('should NOT classify cross-file (no diff file set in semantic validation)', () => {
    // Semantic validation has no diff context, so it cannot identify cross-file findings.
    // Cross-file classification happens in Stage 2 (validateNormalizedFindings).
    const findings = [makeFinding({ file: 'src/other.ts', line: 5 })];
    const result = validateFindingsSemantics(findings);
    // Without diff context, this is classified as inline (has file + line)
    expect(result.stats.byClassification.inline).toBe(1);
    expect(result.stats.byClassification['cross-file']).toBe(0);
  });

  it('should handle empty findings', () => {
    const result = validateFindingsSemantics([]);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });
});

/**
 * Stage 2: Post-normalization validation tests (validateNormalizedFindings)
 *
 * Tests that Stage 2 correctly filters truly unplaceable findings after normalization.
 */
describe('validateNormalizedFindings (Stage 2)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should filter truly unplaceable findings after normalization', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10, 20])]]));
    const diffFiles = ['src/app.ts'];

    // After normalization, this finding still has line 999 (normalization couldn't fix it)
    const findings = [makeFinding({ file: 'src/app.ts', line: 999 })];
    const result = validateNormalizedFindings(findings, resolver, diffFiles);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredByLine).toBe(1);
  });

  it('should pass findings that normalization successfully placed', () => {
    const resolver = createMockLineResolver(new Map([['src/new-name.ts', new Set([10, 20])]]));
    const diffFiles = ['src/new-name.ts'];

    // After normalization remapped old-name.ts -> new-name.ts and the line is valid
    const findings = [makeFinding({ file: 'src/new-name.ts', line: 10 })];
    const result = validateNormalizedFindings(findings, resolver, diffFiles);
    expect(result.validFindings).toHaveLength(1);
    expect(result.stats.filteredByLine).toBe(0);
  });

  it('should pass file-level findings (downgraded by normalization)', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10])]]));
    const diffFiles = ['src/app.ts'];

    // Normalization downgraded this to file-level (line undefined)
    const findings = [makeFinding({ file: 'src/app.ts', line: undefined })];
    const result = validateNormalizedFindings(findings, resolver, diffFiles);
    expect(result.validFindings).toHaveLength(1);
  });

  it('edge case 3: empty diffFiles does not crash or false-filter', () => {
    // When diff is empty, validateNormalizedFindings should pass all findings through
    // (no cross-file classification, no line validation since resolver has no files)
    const resolver = createMockLineResolver(new Map());
    const emptyDiffFiles: string[] = [];

    // File-level finding should pass through
    const findings = [makeFinding({ file: 'src/app.ts', line: undefined })];
    const result = validateNormalizedFindings(findings, resolver, emptyDiffFiles);
    expect(result.validFindings).toHaveLength(1);
    expect(result.stats.filteredByLine).toBe(0);
  });

  it('edge case 3: inline findings with empty resolver are filtered (no valid lines)', () => {
    // With empty diff, resolver has no file mappings. Inline findings fail line validation.
    // This is correct: with no diff data, inline placement is impossible.
    const resolver = createMockLineResolver(new Map());
    const emptyDiffFiles: string[] = [];

    const findings = [makeFinding({ file: 'src/app.ts', line: 10 })];
    const result = validateNormalizedFindings(findings, resolver, emptyDiffFiles);
    // Inline finding is filtered because resolver has no valid lines
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredByLine).toBe(1);
  });

  it('should still catch self-contradictions in Stage 2', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10])]]));
    const diffFiles = ['src/app.ts'];

    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message: 'This can be ignored.',
        suggestion: undefined,
      }),
    ];
    const result = validateNormalizedFindings(findings, resolver, diffFiles);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredBySelfContradiction).toBe(1);
  });
});

/**
 * normalizeUnicode() unit tests (FR-015)
 *
 * Validates that invisible Unicode characters are stripped while
 * visible non-Latin characters are preserved.
 */
describe('normalizeUnicode', () => {
  it('should strip U+200B zero-width spaces', () => {
    expect(normalizeUnicode('No\u200Baction\u200Brequired')).toBe('Noactionrequired');
  });

  it('should strip U+200C zero-width non-joiner', () => {
    expect(normalizeUnicode('no\u200Caction')).toBe('noaction');
  });

  it('should strip U+200D zero-width joiner', () => {
    expect(normalizeUnicode('no\u200Daction')).toBe('noaction');
  });

  it('should strip U+200E left-to-right mark', () => {
    expect(normalizeUnicode('no\u200Eaction')).toBe('noaction');
  });

  it('should strip U+200F right-to-left mark', () => {
    expect(normalizeUnicode('no\u200Faction')).toBe('noaction');
  });

  it('should strip U+2028 line separator', () => {
    expect(normalizeUnicode('no\u2028action')).toBe('noaction');
  });

  it('should strip U+2029 paragraph separator', () => {
    expect(normalizeUnicode('no\u2029action')).toBe('noaction');
  });

  it('should strip U+FEFF byte order mark', () => {
    expect(normalizeUnicode('\uFEFFno action required')).toBe('no action required');
  });

  it('should strip multiple different invisible characters', () => {
    expect(normalizeUnicode('\u200Bno\u200C \u200Daction\uFEFF required\u2028')).toBe(
      'no action required'
    );
  });

  it('should preserve visible non-Latin characters (Chinese)', () => {
    expect(normalizeUnicode('需要操作')).toBe('需要操作');
  });

  it('should preserve visible non-Latin characters (Arabic)', () => {
    expect(normalizeUnicode('لا يلزم اتخاذ إجراء')).toBe('لا يلزم اتخاذ إجراء');
  });

  it('should return empty string unchanged', () => {
    expect(normalizeUnicode('')).toBe('');
  });

  it('should return plain ASCII unchanged', () => {
    expect(normalizeUnicode('no action required')).toBe('no action required');
  });
});

/**
 * Unicode bypass hardening tests (US4 acceptance scenarios, SC-005)
 *
 * Tests that invisible Unicode characters in finding messages do not bypass
 * the self-contradiction filter in both Stage 1 and Stage 2.
 */
describe('Unicode bypass hardening (US4)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('Stage 1 (validateFindingsSemantics)', () => {
    it('US4-AS1: should filter info finding with U+200B zero-width spaces in message', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'No\u200B action\u200B required',
          suggestion: undefined,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('US4-AS2: should filter info finding with U+2028 line separator between words', () => {
      // U+2028 inserted alongside existing space — stripping it preserves "no action required"
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'no action \u2028required',
          suggestion: undefined,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('US4-AS3: should filter info finding with U+FEFF BOM in message', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: '\uFEFFno action required',
          suggestion: undefined,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('US4-AS3 regression: should still filter standard "no action required"', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'no action required',
          suggestion: undefined,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('US4-AS4: should NOT filter warning severity with Unicode-obfuscated text', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          line: 10,
          message: 'No\u200B action\u200B required',
          suggestion: undefined,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
    });

    it('should filter info finding with multiple invisible chars across all patterns', () => {
      const patterns = [
        'no \u200Baction \u200Brequired',
        'acceptable\u200C as-is',
        'not\u200D blocking',
        'no \u2028change \u2028needed',
        'can\uFEFF be ignored',
      ];
      for (const msg of patterns) {
        const findings = [
          makeFinding({
            severity: 'info',
            line: 10,
            message: msg,
            suggestion: undefined,
          }),
        ];
        const result = validateFindingsSemantics(findings);
        expect(result.validFindings).toHaveLength(0);
        expect(result.filtered[0]?.filterType).toBe('self_contradicting');
      }
    });

    it('should filter when suggestion contains Unicode-obfuscated dismissive text', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'can be ignored',
          suggestion: 'No\u200B action\u200B required.',
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('should preserve findings with visible non-Latin characters', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: '需要操作 - this code needs attention',
          suggestion: undefined,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(1);
    });
  });

  describe('Stage 2 (validateNormalizedFindings)', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10])]]));
    const diffFiles = ['src/app.ts'];

    it('US4-AS1: should filter info finding with U+200B in Stage 2', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'No\u200B action\u200B required',
          suggestion: undefined,
        }),
      ];
      const result = validateNormalizedFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });

    it('US4-AS4: should NOT filter warning with Unicode bypass in Stage 2', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          line: 10,
          message: 'No\u200B action\u200B required',
          suggestion: undefined,
        }),
      ];
      const result = validateNormalizedFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
    });

    it('should filter info finding with U+200C/U+200D/U+200E/U+200F in Stage 2', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'no\u200C action\u200D required\u200E',
          suggestion: undefined,
        }),
      ];
      const result = validateNormalizedFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(0);
      expect(result.filtered[0]?.filterType).toBe('self_contradicting');
    });
  });
});

/**
 * PR intent contradiction filter tests (FR-112)
 *
 * Tests that filterPRIntentContradictions correctly suppresses info-severity
 * findings in eligible categories whose message contradicts the PR intent.
 */
describe('filterPRIntentContradictions', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('suppresses info + eligible category finding that contradicts PR intent', () => {
    const findings = [
      makeFinding({
        message: 'Consider removing this redundant delete handler code',
        severity: 'info',
        file: 'src/handler.ts',
        ruleId: 'semantic/documentation',
      }),
    ];
    const result = filterPRIntentContradictions(findings, 'add handler for delete operations');
    expect(result.surviving).toHaveLength(0);
    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.filterType).toBe('pr_intent_contradiction');
  });

  it('does NOT suppress info + ineligible category (security)', () => {
    const findings = [
      makeFinding({
        message: 'Consider removing this unsafe delete operation',
        severity: 'info',
        file: 'src/handler.ts',
        ruleId: 'semantic/security',
      }),
    ];
    const result = filterPRIntentContradictions(findings, 'add handler for delete operations');
    expect(result.surviving).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it('does NOT suppress warning severity even with eligible category', () => {
    const findings = [
      makeFinding({
        message: 'Consider removing this delete handler',
        severity: 'warning',
        file: 'src/handler.ts',
        ruleId: 'semantic/documentation',
      }),
    ];
    const result = filterPRIntentContradictions(findings, 'add handler for delete operations');
    expect(result.surviving).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it('does NOT suppress when finding does not reference PR subject', () => {
    const findings = [
      makeFinding({
        message: 'Consider removing the database connection',
        severity: 'info',
        file: 'src/database.ts',
        ruleId: 'semantic/documentation',
      }),
    ];
    // PR is about "handler" but finding is about "database connection" — no subject match
    const result = filterPRIntentContradictions(findings, 'add handler for events');
    expect(result.surviving).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it('does NOT suppress when kill switch is disabled', () => {
    const findings = [
      makeFinding({
        message: 'Consider removing this redundant delete handler code',
        severity: 'info',
        file: 'src/handler.ts',
        ruleId: 'semantic/documentation',
      }),
    ];
    const result = filterPRIntentContradictions(
      findings,
      'add handler for delete operations',
      false // kill switch disabled
    );
    expect(result.surviving).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it('returns all findings when PR description has no intent pattern', () => {
    const findings = [
      makeFinding({ message: 'Some finding' }),
      makeFinding({ message: 'Another finding' }),
    ];
    const result = filterPRIntentContradictions(findings, 'Bumped version to 2.0');
    expect(result.surviving).toHaveLength(2);
    expect(result.filtered).toHaveLength(0);
  });

  it('does NOT suppress when no contradiction verb is present in message', () => {
    const findings = [
      makeFinding({
        message: 'This handler code could use better documentation',
        severity: 'info',
        file: 'src/handler.ts',
        ruleId: 'semantic/documentation',
      }),
    ];
    // PR says "add handler" but finding message does not contain "remove" or "delete"
    const result = filterPRIntentContradictions(findings, 'add handler for events');
    expect(result.surviving).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });

  it('does NOT suppress finding without ruleId', () => {
    const findings = [
      makeFinding({
        message: 'Consider removing this delete handler',
        severity: 'info',
        file: 'src/handler.ts',
        // no ruleId — category parsing will yield empty string
      }),
    ];
    const result = filterPRIntentContradictions(findings, 'add handler for delete operations');
    expect(result.surviving).toHaveLength(1);
    expect(result.filtered).toHaveLength(0);
  });
});
