/**
 * CLI Local Review Pipeline Tests (FR-018)
 *
 * Verifies that the shared applyFindingsPipeline function applies all 4 stages:
 *   1. Sanitize
 *   2. Stage 1 — Semantic validation (self-contradiction filter)
 *   3. Framework convention filter
 *   4. Stage 2 — Diff-bound validation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyFindingsPipeline } from '../../../src/phases/report.js';
import type { Finding } from '../../../src/agents/types.js';
import type { DiffFile } from '../../../src/diff.js';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'warning',
    file: 'src/app.ts',
    line: 5,
    message: 'Test finding',
    sourceAgent: 'test-agent',
    ...overrides,
  };
}

function makeDiffFile(path: string, patch: string): DiffFile {
  return {
    path,
    status: 'modified' as const,
    additions: 10,
    deletions: 2,
    patch,
  };
}

describe('CLI Local Review Pipeline (FR-018)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // Stage 1: Sanitize
  it('should sanitize findings (strip HTML/control chars)', () => {
    const findings = [
      makeFinding({
        message: 'Finding with <script>alert("xss")</script> content',
        file: 'src/app.ts',
        line: 5,
      }),
    ];

    const diffFiles = [
      makeDiffFile(
        'src/app.ts',
        '@@ -1,3 +1,8 @@\n+const x = 1;\n+const y = 2;\n+const z = 3;\n+const a = 4;\n+const b = 5;\n'
      ),
    ];

    const result = applyFindingsPipeline(findings, diffFiles);
    // Finding should survive but message should be sanitized
    expect(result.length).toBe(1);
    expect(result[0]?.message).not.toContain('<script>');
  });

  // Stage 2: Self-contradiction filter
  it('should filter self-contradicting findings (info severity + dismissive + no suggestion)', () => {
    const findings = [
      makeFinding({
        severity: 'info',
        message: 'This is acceptable as-is and needs no changes.',
        suggestion: undefined,
        file: 'src/app.ts',
        line: 5,
      }),
    ];

    const diffFiles = [
      makeDiffFile(
        'src/app.ts',
        '@@ -1,3 +1,8 @@\n+const x = 1;\n+const y = 2;\n+const z = 3;\n+const a = 4;\n+const b = 5;\n'
      ),
    ];

    const result = applyFindingsPipeline(findings, diffFiles);
    expect(result.length).toBe(0);
  });

  // Stage 3: Framework convention filter
  it('should filter framework convention findings with valid evidence', () => {
    const findings = [
      makeFinding({
        message: 'unused variable _temp is never referenced',
        file: 'src/app.ts',
        line: 5,
      }),
    ];

    const diffFiles = [
      makeDiffFile(
        'src/app.ts',
        '@@ -1,3 +1,8 @@\n+const _temp = 42;\n+const y = 2;\n+const z = 3;\n+const a = 4;\n+const b = 5;\n'
      ),
    ];

    const result = applyFindingsPipeline(findings, diffFiles);
    expect(result.length).toBe(0);
  });

  // Pass-through: real findings survive all stages
  it('should pass through genuine findings that match no suppression rules', () => {
    const findings = [
      makeFinding({
        severity: 'warning',
        message: 'SQL injection vulnerability detected in query builder',
        file: 'src/app.ts',
        line: 5,
      }),
    ];

    const diffFiles = [
      makeDiffFile(
        'src/app.ts',
        '@@ -1,3 +1,8 @@\n+const query = `SELECT * FROM ${input}`;\n+const y = 2;\n+const z = 3;\n+const a = 4;\n+const b = 5;\n'
      ),
    ];

    const result = applyFindingsPipeline(findings, diffFiles);
    expect(result.length).toBe(1);
    expect(result[0]?.message).toContain('SQL injection');
  });

  // Multiple stages filter independently
  it('should apply all stages independently — mixed findings', () => {
    const findings = [
      // Should be filtered by self-contradiction (Stage 1)
      makeFinding({
        severity: 'info',
        message: 'No action required for this pattern.',
        suggestion: undefined,
        file: 'src/app.ts',
        line: 5,
      }),
      // Should be filtered by framework filter (Stage 3)
      makeFinding({
        severity: 'warning',
        message: 'unused parameter _callback in setup function',
        file: 'src/app.ts',
        line: 3,
      }),
      // Should survive all stages
      makeFinding({
        severity: 'error',
        message: 'Hardcoded credentials detected',
        file: 'src/app.ts',
        line: 7,
      }),
    ];

    const diffFiles = [
      makeDiffFile(
        'src/app.ts',
        '@@ -1,3 +1,10 @@\n+const setup = (_callback: () => void) => {};\n+const x = 1;\n+const y = 2;\n+const api = "abc";\n+const z = 3;\n+const a = 4;\n+const b = 5;\n'
      ),
    ];

    const result = applyFindingsPipeline(findings, diffFiles);
    expect(result.length).toBe(1);
    expect(result[0]?.message).toContain('Hardcoded credentials');
  });

  // PR description is not used in CLI mode
  it('should not use PR description filtering when prDescription is omitted', () => {
    const findings = [
      makeFinding({
        severity: 'warning',
        message: 'Environment-dependent behavior detected',
        file: 'src/app.ts',
        line: 5,
      }),
    ];

    const diffFiles = [
      makeDiffFile(
        'src/app.ts',
        '@@ -1,3 +1,8 @@\n+if (process.env.DEBUG) console.log("debug");\n+const y = 2;\n+const z = 3;\n+const a = 4;\n+const b = 5;\n'
      ),
    ];

    // Without prDescription, PR intent filtering doesn't run — finding survives
    const result = applyFindingsPipeline(findings, diffFiles);
    expect(result.length).toBe(1);
  });
});
