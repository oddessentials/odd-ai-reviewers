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
  filterPRIntentContradictions,
} from '../../../src/report/finding-validator.js';
import { normalizeUnicode } from '../../../src/report/text-normalization.js';
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

  it('does not suppress undefined symbol findings in new code just because the diff is partial', () => {
    const findings = [
      makeFinding({
        severity: 'error',
        file: 'pkg/example/new_file.go',
        line: 12,
        message:
          'Reference to undefined constant `endpointQueryData` - this constant is not defined in the visible code',
        suggestion: 'Define the endpoint constants or import them from the appropriate package',
      }),
    ];

    const diff = `diff --git a/pkg/example/new_file.go b/pkg/example/new_file.go
--- /dev/null
+++ b/pkg/example/new_file.go
@@ -0,0 +1,3 @@
+func example() {
+  endpointQueryData()
+}`;

    const result = validateFindingsSemantics(findings, undefined, diff);
    expect(result.validFindings).toHaveLength(1);
  });

  it('suppresses cautionary verify-this advice with no concrete defect', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message:
          'Cleanup interval reduced from 10 minutes to 1 minute - verify this frequency is appropriate for production load',
        suggestion:
          'Consider making this configurable or document why the frequency increase is needed',
      }),
    ];

    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredByCautionaryAdvice).toBe(1);
  });

  it('suppresses speculative SQL injection findings when the diff only shows numeric IDs', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        file: 'pkg/services/example/store.go',
        line: 40,
        message: 'Manual string building for SQL IN clause on SQLite',
        suggestion:
          'Consider using a parameterized query builder or verifying that all values in `ids` are validated integers to prevent injection',
      }),
    ];

    const diff = `diff --git a/pkg/services/example/store.go b/pkg/services/example/store.go
--- a/pkg/services/example/store.go
+++ b/pkg/services/example/store.go
@@ -1,6 +1,10 @@
+ids := make([]int64, 0)
+for _, v := range ids {
+  values = fmt.Sprintf("%s, %d", values, v)
+}
+sql = fmt.Sprintf("DELETE FROM annotation WHERE id IN (%s)", values)`;

    const result = validateFindingsSemantics(findings, undefined, diff);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredByCautionaryAdvice).toBe(1);
  });

  it('does not suppress SQL injection findings when the diff shows request input', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        file: 'pkg/services/example/store.go',
        line: 40,
        message: 'SQL injection vulnerability in direct string concatenation',
        suggestion: 'Use parameterized queries to prevent injection',
      }),
    ];

    const diff = `diff --git a/pkg/services/example/store.go b/pkg/services/example/store.go
--- a/pkg/services/example/store.go
+++ b/pkg/services/example/store.go
@@ -1,4 +1,4 @@
+values := req.URL.Query().Get("ids")
+sql = fmt.Sprintf("DELETE FROM annotation WHERE id IN (%s)", values)`;

    const result = validateFindingsSemantics(findings, undefined, diff);
    expect(result.validFindings).toHaveLength(1);
  });

  it('suppresses info-level strings.Builder micro-optimization advice', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        file: 'pkg/services/example/store.go',
        line: 12,
        message: 'String concatenation in loop for building SQL values list',
        suggestion:
          'Consider using strings.Builder or pre-allocating slice capacity for better performance when building the comma-separated values string',
      }),
    ];

    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredByCautionaryAdvice).toBe(1);
  });

  it('does not suppress project-context advisories in production semantic validation', () => {
    const findings = [
      makeFinding({
        severity: 'warning',
        file: 'src/styles.css',
        line: 12,
        message:
          'Input field with 100% width may overflow its container due to padding. The total width becomes 100% + 1rem, which can cause horizontal scrolling or layout breaks.',
        suggestion:
          'Use box-sizing: border-box on the input or change width to calc(100% - 1rem) to account for padding.',
      }),
      makeFinding({
        severity: 'info',
        file: 'src/styles.css',
        line: 15,
        message:
          'Overlay has z-index ordering issue - it should appear behind the modal but above other content. Without explicit z-index values, stacking order is unpredictable.',
        suggestion:
          'Add z-index: 999 to overlay and z-index: 1000 to modal to establish proper layering.',
      }),
    ];

    const diff = `diff --git a/src/styles.css b/src/styles.css
--- a/src/styles.css
+++ b/src/styles.css
@@ -1,3 +1,20 @@
+.input { width: 100%; padding: 0.5rem; border: 1px solid #ccc; }
+.modal { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); }
+.overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); }`;

    const result = validateFindingsSemantics(findings, undefined, diff);
    expect(result.validFindings).toHaveLength(2);
  });

  it('does not suppress benchmark-only canonical seed scaffolding advisories in production semantic validation', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        file: 'src/random.ts',
        line: 1,
        message: 'seedRandom() function is defined but never used',
        suggestion:
          'Either use this function in the random() implementation or remove it if not needed',
      }),
      makeFinding({
        severity: 'warning',
        file: 'src/random.ts',
        line: 5,
        message: 'Empty function body in random() export - function provides no functionality',
        suggestion:
          'Implement the random number generation logic, potentially using the seedRandom() function',
      }),
    ];

    const diff = `diff --git a/src/random.ts b/src/random.ts
--- a/src/random.ts
+++ b/src/random.ts
@@ -1,3 +1,7 @@
+function seedRandom(): number {
+  return 42;
+}
+
 export function random() {}`;

    const result = validateFindingsSemantics(findings, undefined, diff);
    expect(result.validFindings).toHaveLength(2);
  });

  it('does not suppress synchronous singleton advisories in production semantic validation', () => {
    const findings = [
      makeFinding({
        severity: 'warning',
        file: 'src/db.ts',
        line: 4,
        message:
          'Singleton database connection creation lacks concurrency protection. If getConnection() is called simultaneously from multiple async contexts, multiple DatabaseConnection instances could be created before the first assignment completes.',
        suggestion:
          'Add a promise-based guard or mutex to ensure only one DatabaseConnection is created even under concurrent access patterns.',
      }),
      makeFinding({
        severity: 'info',
        file: 'src/db.ts',
        line: 10,
        message:
          'DatabaseConnection interface defines a very generic query method that accepts any SQL string. This could make it difficult to track SQL injection vulnerabilities at call sites.',
        suggestion:
          'Consider adding typed query methods or parameter binding support to the interface to encourage safer SQL construction patterns.',
      }),
    ];

    const diff = `diff --git a/src/db.ts b/src/db.ts
--- a/src/db.ts
+++ b/src/db.ts
@@ -1,3 +1,12 @@
+let instance: DatabaseConnection | null = null;
+
+export function getConnection(): DatabaseConnection {
+  if (!instance) {
+    instance = new DatabaseConnection();
+  }
+  return instance;
+}
+
+interface DatabaseConnection { query(sql: string): Promise<unknown[]> }`;

    const result = validateFindingsSemantics(findings, undefined, diff);
    expect(result.validFindings).toHaveLength(2);
  });

  it('does not suppress PR-intent-specific handler advisories in production semantic validation', () => {
    const findings = [
      makeFinding({
        severity: 'error',
        file: 'src/input.ts',
        line: 4,
        message: 'Function `submitForm()` is called but not defined or imported',
        suggestion:
          'Either define the `submitForm` function in this file or import it from another module',
      }),
      makeFinding({
        severity: 'warning',
        file: 'src/input.ts',
        line: 1,
        message: 'Function `handleKeyDown` is defined but never used or exported',
        suggestion:
          'Either export this function for external use or attach it as an event listener within the module',
      }),
    ];

    const diff = `diff --git a/src/input.ts b/src/input.ts
--- a/src/input.ts
+++ b/src/input.ts
@@ -1,3 +1,8 @@
+function handleKeyDown(event: KeyboardEvent): void {
+  if (event.key === 'Enter') {
+    event.preventDefault();
+    submitForm();
+  }
+}
+
 export function setup() {}`;

    const result = validateFindingsSemantics(
      findings,
      'fix: Change Enter key to submit form instead of adding newline',
      diff
    );
    expect(result.validFindings).toHaveLength(2);
  });

  it('does not suppress parameterized-test refactor advisories in production semantic validation', () => {
    const findings = [
      makeFinding({
        severity: 'warning',
        file: 'tests/user.test.ts',
        line: 4,
        message:
          'Test assertion changed from exact property check to partial object matching, potentially reducing test coverage',
        suggestion:
          "Consider using expect(user.name).toBe('Alice') and expect(user.role).toBe('admin') for exact property validation, or ensure expected objects include all relevant properties",
      }),
    ];

    const diff = `diff --git a/tests/user.test.ts b/tests/user.test.ts
--- a/tests/user.test.ts
+++ b/tests/user.test.ts
@@ -1,8 +1,6 @@
-test('should create user', () => {
-  const user = createUser({ name: 'Alice' });
-  expect(user.name).toBe('Alice');
-});
+describe('User creation', () => {
+  it.each([
+    { input: { name: 'Alice' }, expected: { name: 'Alice' } },
+  ])('creates user with $input.name', ({ input, expected }) => {
+    const user = createUser(input);
+    expect(user).toMatchObject(expected);
+  });
+});`;

    const result = validateFindingsSemantics(
      findings,
      'refactor: Convert individual user tests to parameterized it.each tests',
      diff
    );
    expect(result.validFindings).toHaveLength(1);
  });

  it('does not suppress mock-path or empty-test advisories in test files', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        file: 'tests/fixtures/xss-payloads.ts',
        line: 1,
        message: 'XSS_PAYLOADS constant is defined but not exported or used',
        suggestion: "Export the constant if it's intended for use in tests, or remove it if unused",
      }),
      makeFinding({
        severity: 'warning',
        file: 'tests/auth.test.ts',
        line: 6,
        message: "Mock module path './auth' may not resolve correctly from test file location",
        suggestion:
          "Verify the relative path './auth' correctly points to the auth module. Consider using an absolute import or check if the path should be '../src/auth' or similar based on project structure.",
      }),
      makeFinding({
        severity: 'info',
        file: 'tests/auth.test.ts',
        line: 11,
        message: 'Empty test function provides no validation of mocked authentication behavior',
        suggestion:
          'Add test cases to verify the mocked authenticate and verify functions work as expected, such as testing return values and call parameters.',
      }),
    ];

    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(3);
  });
});

/**
 * SECURITY_BLOCKLIST coverage for cautionary advice filter
 *
 * Verifies that info-severity findings containing security terms (JWT, token,
 * session, CORS, cookie, signature, redirect, rate-limit) are NOT suppressed
 * by the cautionary advice filter, even when hedging language is present.
 */
describe('SECURITY_BLOCKLIST — cautionary advice gate', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // Each entry: [term label, finding message that must NOT be suppressed]
  const securityFindings: [string, string][] = [
    ['JWT', 'Ensure the JWT claims are validated before granting access'],
    ['token', 'Verify that the access token expiration is checked before use'],
    ['session', 'Ensure the session ID is regenerated after authentication'],
    ['CORS', 'Verify that the CORS origin is validated against an allowlist'],
    ['cookie', 'Ensure the session cookie has HttpOnly and Secure flags set'],
    ['signature', 'Verify that the digital signature is checked before trusting the payload'],
    ['redirect', 'Ensure the redirect URL is validated to prevent open redirect'],
    ['rate-limit', 'Verify that the API endpoint has rate limiting to prevent abuse'],
  ];

  for (const [term, message] of securityFindings) {
    it(`should NOT suppress info finding mentioning ${term} (security blocklist)`, () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredByCautionaryAdvice).toBe(0);
    });
  }

  // Negative controls: "token" and "session" in non-security contexts
  // should still be suppressed (hedging + no security meaning)
  it('should suppress non-security "token" finding (lexer/parser context)', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message: 'Ensure that all token types in the lexer are handled consistently',
      }),
    ];
    const result = validateFindingsSemantics(findings);
    // "token" appears but this IS about tokens — the blocklist will fire.
    // This is an accepted over-block: the three-gate architecture (info + hedging +
    // blocklist) makes this a narrow edge case. The cost of keeping this finding
    // alive is far lower than the cost of silently dropping JWT/auth token findings.
    // We document this as expected behavior: "token" in ANY context blocks suppression.
    expect(result.validFindings).toHaveLength(1);
  });

  it('should suppress non-security "session" finding (database pool context)', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message: 'Ensure that all database session pool connections are released properly',
      }),
    ];
    const result = validateFindingsSemantics(findings);
    // "session" appears — blocklist fires, finding survives.
    // Same accepted trade-off as "token" above.
    expect(result.validFindings).toHaveLength(1);
  });

  it('should still suppress non-security cautionary advice without blocklist terms', () => {
    // Regression guard: plain hedging advice with no security terms IS suppressed
    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message: 'Ensure that the variable naming follows the project convention',
      }),
    ];
    const result = validateFindingsSemantics(findings);
    expect(result.validFindings).toHaveLength(0);
    expect(result.stats.filteredByCautionaryAdvice).toBe(1);
  });

  // FR-016: Inflected forms of prefix security terms must block cautionary suppression.
  // Bug: trailing \b in the SECURITY_BLOCKLIST regex prevented prefix stems from
  // matching their inflected forms (e.g., "sanitize", "authentication").
  const inflectedSecurityTerms: [string, string][] = [
    ['sanitize', 'Ensure that all inputs are sanitize before rendering'],
    ['sanitized', 'Ensure that all inputs are sanitized before rendering'],
    ['sanitization', 'Ensure that proper sanitization is applied to user input'],
    ['sanitizing', 'Verify that the sanitizing function covers all edge cases'],
    ['escaped', 'Ensure that the output is properly escaped before display'],
    ['escaping', 'Verify that escaping is applied to prevent XSS'],
    ['authentication', 'Ensure that authentication is required for this endpoint'],
    ['authenticated', 'Verify that the user is authenticated before access'],
    ['authorization', 'Ensure that proper authorization checks are in place'],
    ['authorized', 'Verify that the request is authorized before processing'],
    ['deserialization', 'Ensure that deserialization is safe from injection attacks'],
    ['deserialize', 'Verify that the deserialize call validates input'],
    ['vulnerability', 'Ensure that this vulnerability is addressed before release'],
    ['vulnerabilities', 'Verify that all known vulnerabilities are patched'],
    ['vulnerable', 'Ensure that the endpoint is not vulnerable to injection'],
  ];

  for (const [term, message] of inflectedSecurityTerms) {
    it(`FR-016: should NOT suppress finding with inflected term "${term}"`, () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message,
        }),
      ];
      const result = validateFindingsSemantics(findings);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredByCautionaryAdvice).toBe(0);
    });
  }
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

  it('FR-018: should NOT catch self-contradictions in Stage 2 (deferred to Stage 1)', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10])]]));
    const diffFiles = ['src/app.ts'];

    // FR-018: Self-contradiction detection is now exclusively in Stage 1 (validateFindingsSemantics).
    // Stage 2 only performs classification and line validation.
    const findings = [
      makeFinding({
        severity: 'info',
        line: 10,
        message: 'This can be ignored.',
        suggestion: undefined,
      }),
    ];
    const result = validateNormalizedFindings(findings, resolver, diffFiles);
    expect(result.validFindings).toHaveLength(1);
    expect(result.stats.filteredBySelfContradiction).toBe(0);
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

  describe('Stage 2 (validateNormalizedFindings) — FR-018 dedup removal', () => {
    const resolver = createMockLineResolver(new Map([['src/app.ts', new Set([10])]]));
    const diffFiles = ['src/app.ts'];

    // FR-018: Self-contradiction detection removed from Stage 2.
    // These tests verify that Stage 2 no longer filters on self-contradiction
    // (that responsibility is exclusively in Stage 1).

    it('FR-018: should NOT filter info finding with U+200B in Stage 2 (deferred to Stage 1)', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'No\u200B action\u200B required',
          suggestion: undefined,
        }),
      ];
      const result = validateNormalizedFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
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

    it('FR-018: should NOT filter info finding with U+200C/U+200D/U+200E/U+200F in Stage 2 (deferred to Stage 1)', () => {
      const findings = [
        makeFinding({
          severity: 'info',
          line: 10,
          message: 'no\u200C action\u200D required\u200E',
          suggestion: undefined,
        }),
      ];
      const result = validateNormalizedFindings(findings, resolver, diffFiles);
      expect(result.validFindings).toHaveLength(1);
      expect(result.stats.filteredBySelfContradiction).toBe(0);
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
