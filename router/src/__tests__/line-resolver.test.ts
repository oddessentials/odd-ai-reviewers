import { describe, it, expect } from 'vitest';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';
import {
  parseDiffHunks,
  buildLineResolver,
  normalizeFindingsForDiff,
} from '../report/line-resolver.js';

describe('Line Resolver', () => {
  describe('parseDiffHunks', () => {
    it('should parse single hunk with additions', () => {
      const patch = `@@ -1,3 +1,4 @@
 export class Foo {
+  private initialized = false;
   constructor() {}
 }`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]?.newFileStart).toBe(1);
      expect(hunks[0]?.newFileLines).toEqual([1, 2, 3, 4]);
      expect(hunks[0]?.addedLines).toEqual([2]);
      expect(hunks[0]?.contextLines).toEqual([1, 3, 4]);
    });

    it('should parse single hunk with deletions only', () => {
      const patch = `@@ -1,4 +1,3 @@
 export class Foo {
-  private initialized = false;
   constructor() {}
 }`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]?.newFileStart).toBe(1);
      expect(hunks[0]?.newFileLines).toEqual([1, 2, 3]);
      expect(hunks[0]?.addedLines).toEqual([]);
      expect(hunks[0]?.contextLines).toEqual([1, 2, 3]);
    });

    it('should parse multiple hunks', () => {
      const patch = `@@ -1,3 +1,4 @@
 export class Foo {
+  private initialized = false;
   constructor() {}
 }
@@ -10,2 +11,3 @@
   doWork() {
+    console.log('working');
     return true;`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(2);

      // First hunk
      expect(hunks[0]?.newFileStart).toBe(1);
      expect(hunks[0]?.addedLines).toEqual([2]);

      // Second hunk
      expect(hunks[1]?.newFileStart).toBe(11);
      expect(hunks[1]?.addedLines).toEqual([12]);
    });

    it('should handle multi-hunk file with large gaps', () => {
      const patch = `@@ -1,2 +1,3 @@
+// File header
 const VERSION = "1.0";
 const NAME = "app";
@@ -100,2 +101,3 @@
 // EOF
+// End marker
 const LAST = true;`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(2);
      expect(hunks[0]?.newFileStart).toBe(1);
      expect(hunks[0]?.addedLines).toEqual([1]);
      expect(hunks[0]?.contextLines).toEqual([2, 3]);

      expect(hunks[1]?.newFileStart).toBe(101);
      expect(hunks[1]?.addedLines).toEqual([102]);
      expect(hunks[1]?.contextLines).toEqual([101, 103]);
    });

    it('should handle "No newline at end of file" marker', () => {
      const patch = `@@ -1,2 +1,3 @@
 const foo = 1;
+const bar = 2;
 const baz = 3;
\\ No newline at end of file`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]?.newFileLines).toEqual([1, 2, 3]);
      expect(hunks[0]?.addedLines).toEqual([2]);
    });

    it('should skip metadata lines', () => {
      const patch = `diff --git a/src/test.ts b/src/test.ts
index 1234567..89abcde 100644
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,2 +1,3 @@
 const foo = 1;
+const bar = 2;
 const baz = 3;`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]?.newFileLines).toEqual([1, 2, 3]);
    });

    it('should handle empty patch', () => {
      const hunks = parseDiffHunks('');
      expect(hunks).toEqual([]);
    });

    it('should handle real-world TypeScript file', () => {
      const patch = `@@ -10,6 +10,7 @@ export class UserService {
   constructor(private db: Database) {}
 
   async getUser(id: string): Promise<User | null> {
+    this.logger.debug(\`Fetching user \${id}\`);
     const result = await this.db.query('SELECT * FROM users WHERE id = ?', [id]);
     return result.rows[0] ?? null;
   }`;

      const hunks = parseDiffHunks(patch);

      expect(hunks).toHaveLength(1);
      expect(hunks[0]?.newFileStart).toBe(10);
      expect(hunks[0]?.addedLines).toContain(13);
      expect(hunks[0]?.contextLines).toContain(10);
      expect(hunks[0]?.contextLines).toContain(12);
    });
  });

  describe('buildLineResolver', () => {
    it('should build resolver from diff files', () => {
      const files: DiffFile[] = [
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: `@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;`,
        },
      ];

      const resolver = buildLineResolver(files);

      expect(resolver.hasFile('src/test.ts')).toBe(true);
      expect(resolver.hasFile('nonexistent.ts')).toBe(false);
    });

    it('should skip deleted files', () => {
      const files: DiffFile[] = [
        {
          path: 'deleted.ts',
          status: 'deleted',
          additions: 0,
          deletions: 10,
          patch: undefined,
        },
      ];

      const resolver = buildLineResolver(files);
      expect(resolver.hasFile('deleted.ts')).toBe(false);
    });

    it('should handle files without patches', () => {
      const files: DiffFile[] = [
        {
          path: 'binary.png',
          status: 'modified',
          additions: 0,
          deletions: 0,
          patch: undefined,
        },
      ];

      const resolver = buildLineResolver(files);
      expect(resolver.hasFile('binary.png')).toBe(false);
    });

    it('should normalize file paths (remove leading slash)', () => {
      const files: DiffFile[] = [
        {
          path: '/src/test.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: `@@ -1,1 +1,2 @@
+const a = 1;
 const b = 2;`,
        },
      ];

      const resolver = buildLineResolver(files);

      expect(resolver.hasFile('src/test.ts')).toBe(true);
      expect(resolver.hasFile('/src/test.ts')).toBe(true);
    });
  });

  describe('LineResolver.validateLine', () => {
    const files: DiffFile[] = [
      {
        path: 'src/test.ts',
        status: 'modified',
        additions: 2,
        deletions: 1,
        patch: `@@ -1,3 +1,4 @@
-const a = 1;
+const a = 1;
+const b = 2;
 const c = 3;`,
      },
    ];

    const resolver = buildLineResolver(files);

    it('should validate valid added line', () => {
      const result = resolver.validateLine('src/test.ts', 2);

      expect(result.valid).toBe(true);
      expect(result.line).toBe(2);
      expect(result.isAddition).toBe(true);
    });

    it('should validate valid context line', () => {
      const result = resolver.validateLine('src/test.ts', 3);

      expect(result.valid).toBe(true);
      expect(result.line).toBe(3);
      expect(result.isAddition).toBe(false);
    });

    it('should reject invalid line number', () => {
      const result = resolver.validateLine('src/test.ts', 99);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not in the diff context');
    });

    it('should reject undefined line', () => {
      const result = resolver.validateLine('src/test.ts', undefined);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('undefined');
    });

    it('should reject negative line', () => {
      const result = resolver.validateLine('src/test.ts', -1);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be positive');
    });

    it('should reject zero line', () => {
      const result = resolver.validateLine('src/test.ts', 0);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('must be positive');
    });

    it('should reject file not in diff', () => {
      const result = resolver.validateLine('nonexistent.ts', 1);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not found in diff');
    });

    it('should suggest nearest valid line when requested', () => {
      const result = resolver.validateLine('src/test.ts', 99, { suggestNearest: true });

      expect(result.valid).toBe(false);
      expect(result.nearestValidLine).toBeDefined();
      expect(result.nearestValidLine).toBeGreaterThan(0);
    });

    it('should respect additionsOnly option', () => {
      const contextResult = resolver.validateLine('src/test.ts', 3, { additionsOnly: false });
      expect(contextResult.valid).toBe(true);

      const additionsOnlyResult = resolver.validateLine('src/test.ts', 3, { additionsOnly: true });
      expect(additionsOnlyResult.valid).toBe(false);
      expect(additionsOnlyResult.reason).toContain('not an added line');
    });
  });

  describe('LineResolver.getFileSummary', () => {
    it('should generate summary for file in diff', () => {
      const files: DiffFile[] = [
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 1,
          deletions: 0,
          patch: `@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;`,
        },
      ];

      const resolver = buildLineResolver(files);
      const summary = resolver.getFileSummary('src/test.ts');

      expect(summary).toContain('File: src/test.ts');
      expect(summary).toContain('All valid lines:');
      expect(summary).toContain('Added lines:');
      expect(summary).toContain('Hunks: 1');
    });

    it('should handle file not in diff', () => {
      const resolver = buildLineResolver([]);
      const summary = resolver.getFileSummary('nonexistent.ts');

      expect(summary).toContain('not in diff');
    });
  });

  describe('normalizeFindingsForDiff', () => {
    const files: DiffFile[] = [
      {
        path: 'src/test.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: `@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const c = 3;`,
      },
    ];

    const resolver = buildLineResolver(files);

    it('should pass through valid findings', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 2,
          message: 'Test issue',
          sourceAgent: 'test',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.line).toBe(2);
      expect(result.stats.valid).toBe(1);
      expect(result.stats.downgraded).toBe(0);
    });

    it('should drop invalid line numbers', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 99,
          message: 'Invalid line',
          sourceAgent: 'test',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.line).toBeUndefined();
      expect(result.stats.downgraded).toBe(1);
      expect(result.invalidDetails).toHaveLength(1);
    });

    it('should handle file-level findings (no line)', () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/test.ts',
          message: 'File-level issue',
          sourceAgent: 'test',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver);

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.line).toBeUndefined();
      expect(result.stats.valid).toBe(1);
      expect(result.stats.downgraded).toBe(0);
    });

    it('should auto-fix invalid lines when enabled', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 99,
          message: 'Far away line',
          sourceAgent: 'test',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver, { autoFix: true });

      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.line).toBeDefined();
      expect(result.findings[0]?.line).not.toBe(99);
      expect(result.stats.normalized).toBe(1);
      expect(result.invalidDetails).toHaveLength(1);
      expect(result.invalidDetails[0]?.nearestValidLine).toBeDefined();
    });

    it('should handle mixed valid and invalid findings', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 2,
          message: 'Valid',
          sourceAgent: 'test',
        },
        {
          severity: 'warning',
          file: 'src/test.ts',
          line: 99,
          message: 'Invalid',
          sourceAgent: 'test',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver);

      expect(result.findings).toHaveLength(2);
      expect(result.stats.valid).toBe(1);
      expect(result.stats.downgraded).toBe(1);
    });

    it('should collect invalid line details', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 99,
          message: 'Invalid',
          sourceAgent: 'semgrep',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver);

      expect(result.invalidDetails).toHaveLength(1);
      expect(result.invalidDetails[0]?.file).toBe('src/test.ts');
      expect(result.invalidDetails[0]?.line).toBe(99);
      expect(result.invalidDetails[0]?.reason).toBeDefined();
      expect(result.invalidDetails[0]?.sourceAgent).toBe('semgrep');
    });
  });

  describe('Edge Cases', () => {
    it('should handle renamed file with modifications', () => {
      const files: DiffFile[] = [
        {
          path: 'new_name.ts',
          status: 'renamed',
          additions: 1,
          deletions: 0,
          patch: `@@ -1,3 +1,4 @@
 export class MyClass {
+  private initialized = false;
   constructor() {}
 }`,
        },
      ];

      const resolver = buildLineResolver(files);

      expect(resolver.hasFile('new_name.ts')).toBe(true);
      const result = resolver.validateLine('new_name.ts', 2);
      expect(result.valid).toBe(true);
      expect(result.isAddition).toBe(true);
    });

    it('should handle files with gaps between hunks', () => {
      const files: DiffFile[] = [
        {
          path: 'large_file.ts',
          status: 'modified',
          additions: 2,
          deletions: 0,
          patch: `@@ -1,2 +1,3 @@
+// File header
 const VERSION = "1.0";
 const NAME = "app";
@@ -100,2 +101,3 @@
 // EOF
+// End marker
 const LAST = true;`,
        },
      ];

      const resolver = buildLineResolver(files);

      // Lines in first hunk should be valid
      expect(resolver.validateLine('large_file.ts', 1).valid).toBe(true);
      expect(resolver.validateLine('large_file.ts', 2).valid).toBe(true);
      expect(resolver.validateLine('large_file.ts', 3).valid).toBe(true);

      // Lines in second hunk should be valid
      expect(resolver.validateLine('large_file.ts', 101).valid).toBe(true);
      expect(resolver.validateLine('large_file.ts', 102).valid).toBe(true);
      expect(resolver.validateLine('large_file.ts', 103).valid).toBe(true);

      // Lines in the gap should be invalid
      expect(resolver.validateLine('large_file.ts', 50).valid).toBe(false);

      // Nearest line should be suggested
      const gapResult = resolver.validateLine('large_file.ts', 50, { suggestNearest: true });
      expect(gapResult.nearestValidLine).toBeDefined();
    });

    it('should handle empty diff files array', () => {
      const resolver = buildLineResolver([]);

      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'any.ts',
          line: 1,
          message: 'Test',
          sourceAgent: 'test',
        },
      ];

      const result = normalizeFindingsForDiff(findings, resolver);

      expect(result.findings[0]?.line).toBeUndefined();
      expect(result.stats.downgraded).toBe(1);
    });
  });
});
