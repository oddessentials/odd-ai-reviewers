/**
 * Diff Line Validator Tests
 *
 * These tests ensure that the diff line validation logic correctly:
 * 1. Parses unified diff hunks to extract valid line ranges
 * 2. Validates finding line numbers against diff context
 * 3. Suggests nearest valid lines when validation fails
 * 4. Handles edge cases (empty diffs, deleted files, etc.)
 */

import { describe, it, expect } from 'vitest';
import {
  parseDiffHunks,
  buildDiffLineMap,
  validateFindingLine,
  filterValidFindings,
  findNearestValidLine,
  getFileDiffSummary,
} from '../diff_line_validator.js';
import type { DiffFile } from '../diff.js';

describe('parseDiffHunks', () => {
  it('should parse a simple hunk with additions and deletions', () => {
    const patch = `diff --git a/src/utils.ts b/src/utils.ts
index abc123..def456 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -10,5 +10,6 @@ function helper() {
   const a = 1;
-  const b = 2;
+  const b = 3;
+  const c = 4;
   return a + b;
 }`;

    const hunks = parseDiffHunks(patch);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      oldStart: 10,
      oldCount: 5,
      newStart: 10,
      newCount: 6,
    });

    // Context line 10 (const a = 1)
    // Line 11 was deleted (const b = 2) - not in new file
    // Line 11 in new file is the addition (const b = 3)
    // Line 12 in new file is the addition (const c = 4)
    // Line 13 in new file is context (return a + b)
    // Line 14 in new file is context (})
    expect(hunks[0]?.newFileLines).toEqual([10, 11, 12, 13, 14]);
    expect(hunks[0]?.addedLines).toEqual([11, 12]);
    expect(hunks[0]?.contextLines).toEqual([10, 13, 14]);
  });

  it('should parse multiple hunks', () => {
    const patch = `@@ -1,3 +1,4 @@
+// Header comment
 const a = 1;
 const b = 2;
 const c = 3;
@@ -20,3 +21,4 @@ function test() {
   return true;
+  // New line
 }`;

    const hunks = parseDiffHunks(patch);

    expect(hunks).toHaveLength(2);

    // First hunk: adding header comment
    expect(hunks[0]).toMatchObject({
      oldStart: 1,
      oldCount: 3,
      newStart: 1,
      newCount: 4,
    });
    expect(hunks[0]?.addedLines).toEqual([1]);

    // Second hunk: adding comment in function
    // @@ -20,3 +21,4 @@ means: starts at line 21 in new file
    // Line 21: context (  return true;)
    // Line 22: added (+  // New line)
    // Line 23: context (})
    expect(hunks[1]).toMatchObject({
      oldStart: 20,
      oldCount: 3,
      newStart: 21,
      newCount: 4,
    });
    expect(hunks[1]?.addedLines).toEqual([22]);
  });

  it('should handle hunks with only additions (new file)', () => {
    const patch = `@@ -0,0 +1,5 @@
+// New file
+export function newFunc() {
+  return 42;
+}
+`;

    const hunks = parseDiffHunks(patch);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      oldStart: 0,
      oldCount: 0,
      newStart: 1,
      newCount: 5,
    });
    expect(hunks[0]?.addedLines).toEqual([1, 2, 3, 4, 5]);
    expect(hunks[0]?.contextLines).toEqual([]);
  });

  it('should handle hunks with only deletions', () => {
    const patch = `@@ -1,5 +1,2 @@
 const a = 1;
-const b = 2;
-const c = 3;
-const d = 4;
 const e = 5;`;

    const hunks = parseDiffHunks(patch);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.newFileLines).toEqual([1, 2]);
    expect(hunks[0]?.addedLines).toEqual([]);
    expect(hunks[0]?.contextLines).toEqual([1, 2]);
  });

  it('should handle single-line hunk headers without count', () => {
    // When count is 1, git omits it: @@ -10 +10 @@ instead of @@ -10,1 +10,1 @@
    const patch = `@@ -10 +10 @@
-old line
+new line`;

    const hunks = parseDiffHunks(patch);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({
      oldStart: 10,
      oldCount: 1,
      newStart: 10,
      newCount: 1,
    });
    expect(hunks[0]?.addedLines).toEqual([10]);
  });

  it('should return empty array for empty patch', () => {
    expect(parseDiffHunks('')).toEqual([]);
    expect(parseDiffHunks(undefined as unknown as string)).toEqual([]);
  });

  it('should handle "No newline at end of file" marker', () => {
    const patch = `@@ -1,2 +1,2 @@
 const a = 1;
-const b = 2;
\\ No newline at end of file
+const b = 3;
\\ No newline at end of file`;

    const hunks = parseDiffHunks(patch);

    expect(hunks).toHaveLength(1);
    expect(hunks[0]?.newFileLines).toEqual([1, 2]);
    expect(hunks[0]?.addedLines).toEqual([2]);
  });
});

describe('buildDiffLineMap', () => {
  it('should build line map from multiple diff files', () => {
    const files: DiffFile[] = [
      {
        path: 'src/index.ts',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: `@@ -5,3 +5,4 @@
 const x = 1;
-const y = 2;
+const y = 3;
+const z = 4;
 return x;`,
      },
      {
        path: 'src/utils.ts',
        status: 'added',
        additions: 3,
        deletions: 0,
        patch: `@@ -0,0 +1,3 @@
+export const PI = 3.14;
+export const E = 2.71;
+export const PHI = 1.61;`,
      },
    ];

    const lineMap = buildDiffLineMap(files);

    expect(lineMap.files.size).toBe(2);

    // Check index.ts
    const indexLines = lineMap.files.get('src/index.ts');
    expect(indexLines).toBeDefined();
    expect(indexLines?.allLines.has(5)).toBe(true); // context
    expect(indexLines?.allLines.has(6)).toBe(true); // added
    expect(indexLines?.allLines.has(7)).toBe(true); // added
    expect(indexLines?.allLines.has(8)).toBe(true); // context
    expect(indexLines?.addedLines.has(6)).toBe(true);
    expect(indexLines?.addedLines.has(7)).toBe(true);
    expect(indexLines?.addedLines.has(5)).toBe(false);

    // Check utils.ts (all added)
    const utilsLines = lineMap.files.get('src/utils.ts');
    expect(utilsLines?.allLines.size).toBe(3);
    expect(utilsLines?.addedLines.size).toBe(3);
  });

  it('should skip deleted files', () => {
    const files: DiffFile[] = [
      {
        path: 'deleted.ts',
        status: 'deleted',
        additions: 0,
        deletions: 10,
        patch: `@@ -1,10 +0,0 @@
-// All content deleted`,
      },
    ];

    const lineMap = buildDiffLineMap(files);

    expect(lineMap.files.has('deleted.ts')).toBe(false);
  });

  it('should skip files without patches', () => {
    const files: DiffFile[] = [
      {
        path: 'binary.png',
        status: 'modified',
        additions: 0,
        deletions: 0,
        // No patch for binary files
      },
    ];

    const lineMap = buildDiffLineMap(files);

    expect(lineMap.files.has('binary.png')).toBe(false);
  });
});

describe('validateFindingLine', () => {
  const files: DiffFile[] = [
    {
      path: 'src/app.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      patch: `@@ -10,4 +10,6 @@ class App {
   constructor() {
-    this.init();
+    this.setup();
+    this.configure();
+    this.start();
   }
 }`,
    },
  ];

  const lineMap = buildDiffLineMap(files);

  it('should validate a line that exists in the diff', () => {
    // Line 11 is an added line (this.setup())
    const result = validateFindingLine('src/app.ts', 11, lineMap);

    expect(result.valid).toBe(true);
    expect(result.line).toBe(11);
    expect(result.isAddition).toBe(true);
  });

  it('should validate a context line', () => {
    // Line 10 is a context line (constructor() {)
    const result = validateFindingLine('src/app.ts', 10, lineMap);

    expect(result.valid).toBe(true);
    expect(result.line).toBe(10);
    expect(result.isAddition).toBe(false);
  });

  it('should reject a line not in the diff', () => {
    // Line 5 is not in the diff context
    const result = validateFindingLine('src/app.ts', 5, lineMap, { suggestNearest: true });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Line 5 is not in the diff');
    expect(result.nearestValidLine).toBe(10); // Nearest valid line
  });

  it('should reject undefined line number', () => {
    const result = validateFindingLine('src/app.ts', undefined, lineMap);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('undefined');
  });

  it('should reject zero or negative line numbers', () => {
    const result0 = validateFindingLine('src/app.ts', 0, lineMap);
    const resultNeg = validateFindingLine('src/app.ts', -5, lineMap);

    expect(result0.valid).toBe(false);
    expect(result0.reason).toContain('Invalid line number');

    expect(resultNeg.valid).toBe(false);
    expect(resultNeg.reason).toContain('Invalid line number');
  });

  it('should reject file not in diff', () => {
    const result = validateFindingLine('src/other.ts', 10, lineMap);

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not found in diff');
  });

  it('should enforce additionsOnly option', () => {
    // Line 10 is context, not an addition
    const result = validateFindingLine('src/app.ts', 10, lineMap, { additionsOnly: true });

    expect(result.valid).toBe(false);
    expect(result.reason).toContain('not an added line');
  });

  it('should pass with additionsOnly for added lines', () => {
    // Line 12 is an added line (this.configure())
    const result = validateFindingLine('src/app.ts', 12, lineMap, { additionsOnly: true });

    expect(result.valid).toBe(true);
  });
});

describe('findNearestValidLine', () => {
  it('should return the same line if valid', () => {
    const validLines = new Set([5, 10, 15, 20]);
    expect(findNearestValidLine(10, validLines)).toBe(10);
  });

  it('should find nearest line below', () => {
    const validLines = new Set([5, 10, 20]);
    expect(findNearestValidLine(12, validLines)).toBe(10);
  });

  it('should find nearest line above', () => {
    const validLines = new Set([5, 10, 20]);
    expect(findNearestValidLine(18, validLines)).toBe(20);
  });

  it('should prefer closer line when equidistant', () => {
    const validLines = new Set([10, 20]);
    // Line 15 is equidistant from 10 and 20, should return 10 (first found)
    const result = findNearestValidLine(15, validLines);
    expect([10, 20]).toContain(result);
  });

  it('should return undefined for empty set', () => {
    const validLines = new Set<number>();
    expect(findNearestValidLine(10, validLines)).toBeUndefined();
  });

  it('should handle single valid line', () => {
    const validLines = new Set([100]);
    expect(findNearestValidLine(1, validLines)).toBe(100);
    expect(findNearestValidLine(200, validLines)).toBe(100);
  });
});

describe('filterValidFindings', () => {
  const files: DiffFile[] = [
    {
      path: 'src/test.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      patch: `@@ -10,2 +10,4 @@
 context line 10
+added line 11
+added line 12
 context line 13`,
    },
  ];

  const lineMap = buildDiffLineMap(files);

  it('should filter out findings with invalid lines', () => {
    const findings = [
      { file: 'src/test.ts', line: 10, message: 'valid context' },
      { file: 'src/test.ts', line: 11, message: 'valid added' },
      { file: 'src/test.ts', line: 5, message: 'invalid - not in diff' },
      { file: 'src/other.ts', line: 10, message: 'invalid - wrong file' },
    ];

    const result = filterValidFindings(findings, lineMap);

    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(2);
    expect(result.stats).toEqual({
      total: 4,
      valid: 2,
      invalid: 2,
      autoFixed: 0,
    });
  });

  it('should auto-fix lines when option enabled', () => {
    const findings = [{ file: 'src/test.ts', line: 5, message: 'should be moved to line 10' }];

    const result = filterValidFindings(findings, lineMap, { autoFixLines: true });

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.line).toBe(10); // Auto-fixed to nearest valid
    expect(result.invalid).toHaveLength(0);
    expect(result.stats.autoFixed).toBe(1);
  });

  it('should enforce additionsOnly when filtering', () => {
    const findings = [
      { file: 'src/test.ts', line: 10, message: 'context line' },
      { file: 'src/test.ts', line: 11, message: 'added line' },
    ];

    const result = filterValidFindings(findings, lineMap, { additionsOnly: true });

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]?.line).toBe(11);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0]?.finding.line).toBe(10);
  });

  it('should handle empty findings array', () => {
    const result = filterValidFindings([], lineMap);

    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });
});

describe('getFileDiffSummary', () => {
  it('should generate readable summary', () => {
    const files: DiffFile[] = [
      {
        path: 'src/app.ts',
        status: 'modified',
        additions: 3,
        deletions: 0,
        patch: `@@ -10,2 +10,5 @@
 line 10
+line 11
+line 12
+line 13
 line 14`,
      },
    ];

    const lineMap = buildDiffLineMap(files);
    const summary = getFileDiffSummary('src/app.ts', lineMap);

    expect(summary).toContain('src/app.ts');
    expect(summary).toContain('10-14');
    expect(summary).toContain('11-13');
    expect(summary).toContain('Hunks: 1');
  });

  it('should handle file not in diff', () => {
    const lineMap = buildDiffLineMap([]);
    const summary = getFileDiffSummary('not-found.ts', lineMap);

    expect(summary).toContain('not in diff');
  });
});

describe('real-world diff scenarios', () => {
  it('should handle multi-hunk TypeScript diff', () => {
    // Simplified two-hunk diff
    const patch = `@@ -10,3 +10,5 @@ function helper() {
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 return a;
@@ -50,2 +52,3 @@ function other() {
 const x = 1;
+const y = 2;
 return x;`;

    const files: DiffFile[] = [
      {
        path: 'src/utils.ts',
        status: 'modified',
        additions: 3,
        deletions: 1,
        patch,
      },
    ];

    const lineMap = buildDiffLineMap(files);
    const fileLines = lineMap.files.get('src/utils.ts');

    expect(fileLines).toBeDefined();

    // First hunk starts at line 10
    expect(fileLines?.allLines.has(10)).toBe(true); // context
    expect(fileLines?.addedLines.has(11)).toBe(true); // const b = 3
    expect(fileLines?.addedLines.has(12)).toBe(true); // const c = 4
    expect(fileLines?.allLines.has(13)).toBe(true); // context

    // Second hunk starts at line 52
    expect(fileLines?.allLines.has(52)).toBe(true); // context
    expect(fileLines?.addedLines.has(53)).toBe(true); // const y = 2
    expect(fileLines?.allLines.has(54)).toBe(true); // context

    // Line 30 should NOT be valid (between hunks)
    expect(fileLines?.allLines.has(30)).toBe(false);

    const validation = validateFindingLine('src/utils.ts', 30, lineMap, { suggestNearest: true });
    expect(validation.valid).toBe(false);
    expect(validation.nearestValidLine).toBeDefined();
  });

  it('should handle renamed file with modifications', () => {
    // Simpler renamed file patch
    const patch = `@@ -1,3 +1,4 @@
 export class MyClass {
+  private initialized = false;
   constructor() {}
 }`;

    const files: DiffFile[] = [
      {
        path: 'new_name.ts',
        status: 'renamed',
        additions: 1,
        deletions: 0,
        patch,
      },
    ];

    const lineMap = buildDiffLineMap(files);

    expect(lineMap.files.has('new_name.ts')).toBe(true);

    const fileLines = lineMap.files.get('new_name.ts');
    // Line 1: context (export class MyClass {)
    // Line 2: added (private initialized = false;)
    // Line 3: context (constructor() {})
    // Line 4: context (})
    expect(fileLines?.contextLines.has(1)).toBe(true);
    expect(fileLines?.addedLines.has(2)).toBe(true);
    expect(fileLines?.contextLines.has(3)).toBe(true);
    expect(fileLines?.contextLines.has(4)).toBe(true);
  });

  it('should handle diff with large gap between hunks', () => {
    const patch = `@@ -1,2 +1,3 @@
+// File header
 const VERSION = "1.0";
 const NAME = "app";
@@ -100,2 +101,3 @@
 // EOF
+// End marker
 const LAST = true;`;

    const files: DiffFile[] = [
      {
        path: 'large_file.ts',
        status: 'modified',
        additions: 2,
        deletions: 0,
        patch,
      },
    ];

    const lineMap = buildDiffLineMap(files);
    const fileLines = lineMap.files.get('large_file.ts');

    // First hunk: lines 1-3
    expect(fileLines?.addedLines.has(1)).toBe(true); // // File header
    expect(fileLines?.contextLines.has(2)).toBe(true); // const VERSION
    expect(fileLines?.contextLines.has(3)).toBe(true); // const NAME

    // Second hunk: lines 101-103
    expect(fileLines?.contextLines.has(101)).toBe(true); // // EOF
    expect(fileLines?.addedLines.has(102)).toBe(true); // // End marker
    expect(fileLines?.contextLines.has(103)).toBe(true); // const LAST

    // Lines in the gap should NOT be valid
    expect(fileLines?.allLines.has(50)).toBe(false);

    const validation = validateFindingLine('large_file.ts', 50, lineMap, {
      suggestNearest: true,
    });
    expect(validation.valid).toBe(false);
    expect(validation.nearestValidLine).toBeDefined();
  });
});
