/**
 * Framework Pattern Filter Tests (FR-013)
 *
 * Tests the closed, default-deny matcher table that suppresses known framework
 * convention false positives. Each matcher requires both message pattern match
 * AND structural evidence validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterFrameworkConventionFindings,
  getValidFindings,
} from '../../../src/report/framework-pattern-filter.js';
import type { Finding } from '../../../src/agents/types.js';

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Express Error Middleware diff fixtures
// =============================================================================

const EXPRESS_DIFF_WITH_USE_AND_4_PARAMS = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,12 @@
+import express from 'express';
+const app = express();
+
+app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
+  console.error(err);
+  res.status(500).send('error');
+});
+
+app.use((err, _req, _res, _next) => {
+  res.status(500).send(err.message);
+});
+
 export default app;`;

const EXPRESS_DIFF_WITHOUT_USE = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,8 @@
+function handler(err, req, res, next) {
+  console.error(err);
+  res.status(500).send('error');
+}
+
 export default app;`;

const EXPRESS_DIFF_WITH_IMPORT_NO_USE = `diff --git a/src/middleware.ts b/src/middleware.ts
--- a/src/middleware.ts
+++ b/src/middleware.ts
@@ -1,3 +1,9 @@
+import { Request, Response, NextFunction } from 'express';
+
+function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
+  console.error(err.message);
+  res.status(500).json({ error: 'Internal Server Error' });
+}
+
 export function setup() {}`;

const EXPRESS_DIFF_WITH_USE_BUT_3_PARAMS = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,8 @@
+app.use((req, res, next) => {
+  res.status(200).send('ok');
+});
+
 export default app;`;

// =============================================================================
// Exhaustive Switch diff fixtures
// =============================================================================

const SWITCH_DIFF_WITH_ASSERT_NEVER = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,3 +1,15 @@
+type Status = 'success' | 'failure';
+
+function handle(status: Status): string {
+  switch (status) {
+    case 'success':
+      return 'ok';
+    case 'failure':
+      return 'fail';
+    default:
+      assertNever(status);
+  }
+}
+
 export {};`;

const SWITCH_DIFF_WITH_EXHAUSTIVE_THROW = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,3 +1,15 @@
+function handle(status: string): string {
+  switch (status) {
+    case 'a':
+      return 'ok';
+    case 'b':
+      return 'fail';
+    default:
+      throw new Error('exhaustive check failed');
+  }
+}
+
 export {};`;

const SWITCH_DIFF_WITHOUT_ASSERT_NEVER = `diff --git a/src/handler.ts b/src/handler.ts
--- a/src/handler.ts
+++ b/src/handler.ts
@@ -1,3 +1,13 @@
+function handle(status: string): string {
+  switch (status) {
+    case 'a':
+      return 'ok';
+    case 'b':
+      return 'fail';
+    default:
+      return 'unknown';
+  }
+}
+
 export {};`;

describe('Framework Pattern Filter (FR-013)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  // ===========================================================================
  // Default-deny behavior
  // ===========================================================================

  describe('default-deny behavior', () => {
    it('should pass through findings that do not match any pattern', () => {
      const findings = [
        makeFinding({ message: 'SQL injection vulnerability detected' }),
        makeFinding({ message: 'XSS via innerHTML assignment' }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.total).toBe(2);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(2);
      expect(getValidFindings(result)).toHaveLength(2);
    });

    it('should return empty results for empty input', () => {
      const result = filterFrameworkConventionFindings([], '');
      expect(result.total).toBe(0);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should NOT suppress findings when message matches but evidence is missing', () => {
      // "missing case for variant" matches exhaustive-switch messagePattern
      // but with empty diff, evidence validation fails
      const findings = [makeFinding({ message: 'missing case for unknown variant' })];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });
  });

  // ===========================================================================
  // Express Error Middleware (express-error-mw)
  // ===========================================================================

  describe('Express Error Middleware matcher', () => {
    it('should suppress "unused param" finding when .use() and 4-param function present', () => {
      const findings = [
        makeFinding({
          message: 'unused parameter _next in error handler',
          file: 'src/app.ts',
          line: 9,
        }),
      ];

      const result = filterFrameworkConventionFindings(
        findings,
        EXPRESS_DIFF_WITH_USE_AND_4_PARAMS
      );

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('express-error-mw');
      expect(result.results[0]?.reason).toContain('Express');
    });

    it('should suppress "unused param" variant with Express evidence', () => {
      const findings = [
        makeFinding({
          message: 'unused param res is never read',
          file: 'src/app.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(
        findings,
        EXPRESS_DIFF_WITH_USE_AND_4_PARAMS
      );

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('express-error-mw');
    });

    it('should NOT suppress when no Express indicator is present (no .use(), import, or types)', () => {
      // Plain 4-param function with no .use(), no Express import, no Express type annotations
      const findings = [
        makeFinding({
          message: 'unused param next in function handler',
          file: 'src/app.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, EXPRESS_DIFF_WITHOUT_USE);

      // No Express indicator — evidence validation fails; "next" without _ doesn't match TS-prefix
      expect(result.suppressed).toBe(0);
    });

    it('should suppress when Express import present but no .use() (fp-b-001 pattern)', () => {
      // Error handler declared/exported in one file, registered elsewhere
      const findings = [
        makeFinding({
          message: 'unused param _next in error handler',
          file: 'src/middleware.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, EXPRESS_DIFF_WITH_IMPORT_NO_USE);

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('express-error-mw');
    });

    it('should NOT suppress when function has only 3 params', () => {
      const findings = [
        makeFinding({
          message: 'unused parameter next',
          file: 'src/app.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(
        findings,
        EXPRESS_DIFF_WITH_USE_BUT_3_PARAMS
      );

      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when finding file does not match diff file', () => {
      // Use "unused param" without _ to avoid TS-prefix fallback
      const findings = [
        makeFinding({
          message: 'unused param next in handler',
          file: 'src/other.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(
        findings,
        EXPRESS_DIFF_WITH_USE_AND_4_PARAMS
      );

      // File mismatch — evidence validator cannot find the file section
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // TypeScript Unused Prefix (ts-unused-prefix)
  // ===========================================================================

  describe('TypeScript Unused Prefix matcher', () => {
    it('should suppress finding about _prefixed unused variable', () => {
      const findings = [
        makeFinding({
          message: 'unused variable _temp is never referenced',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('ts-unused-prefix');
      expect(result.results[0]?.reason).toContain('_prefix convention');
    });

    it('should suppress finding about _prefixed unused parameter', () => {
      const findings = [
        makeFinding({
          message: 'unused parameter _event — consider removing',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('ts-unused-prefix');
    });

    it('should suppress finding about _prefixed unused binding', () => {
      const findings = [
        makeFinding({
          message: 'unused binding _result from destructuring',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('ts-unused-prefix');
    });

    it('should suppress finding about _prefixed unused import', () => {
      const findings = [
        makeFinding({
          message: 'unused import _logger is never used',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('ts-unused-prefix');
    });

    it('should NOT suppress finding about non-prefixed unused variable', () => {
      const findings = [
        makeFinding({
          message: 'unused variable temp is never referenced',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress finding about non-unused message that mentions _prefix', () => {
      // The message must match the messagePattern (unused.*variable|parameter|binding|import)
      const findings = [
        makeFinding({
          message: 'variable _temp should be const',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // Exhaustive Switch (exhaustive-switch)
  // ===========================================================================

  describe('Exhaustive Switch matcher', () => {
    it('should suppress "missing case" finding when assertNever is present', () => {
      const findings = [
        makeFinding({
          message: 'missing case for new enum variant',
          file: 'src/handler.ts',
          line: 10,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, SWITCH_DIFF_WITH_ASSERT_NEVER);

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-switch');
      expect(result.results[0]?.reason).toContain('assertNever');
    });

    it('should suppress "unhandled case" finding when exhaustive throw present', () => {
      const findings = [
        makeFinding({
          message: 'unhandled case in switch statement',
          file: 'src/handler.ts',
          line: 8,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, SWITCH_DIFF_WITH_EXHAUSTIVE_THROW);

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-switch');
    });

    it('should suppress "default unreachable" finding when assertNever is present', () => {
      const findings = [
        makeFinding({
          message: 'default case is unreachable code',
          file: 'src/handler.ts',
          line: 10,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, SWITCH_DIFF_WITH_ASSERT_NEVER);

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-switch');
    });

    it('should NOT suppress when no assertNever or exhaustive throw in diff', () => {
      const findings = [
        makeFinding({
          message: 'missing case for enum variant',
          file: 'src/handler.ts',
          line: 8,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, SWITCH_DIFF_WITHOUT_ASSERT_NEVER);

      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when finding file does not match diff', () => {
      const findings = [
        makeFinding({
          message: 'missing case for variant',
          file: 'src/other.ts',
          line: 10,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, SWITCH_DIFF_WITH_ASSERT_NEVER);

      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // Mixed scenarios and edge cases
  // ===========================================================================

  describe('mixed scenarios', () => {
    it('should process mix of suppressable and non-suppressable findings', () => {
      const findings = [
        makeFinding({
          message: 'unused parameter _next in error handler',
          file: 'src/app.ts',
          line: 9,
        }),
        makeFinding({
          message: 'SQL injection via user input',
          file: 'src/db.ts',
          line: 5,
        }),
        makeFinding({
          message: 'unused variable _cache is never referenced',
          file: 'src/app.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(
        findings,
        EXPRESS_DIFF_WITH_USE_AND_4_PARAMS
      );

      expect(result.total).toBe(3);
      expect(result.suppressed).toBe(2); // Express + TS prefix
      expect(result.passed).toBe(1); // SQL injection passes through

      const valid = getValidFindings(result);
      expect(valid).toHaveLength(1);
      expect(valid[0]?.message).toContain('SQL injection');
    });

    it('should log diagnostic messages for each suppression', () => {
      const findings = [
        makeFinding({
          message: 'unused parameter _next in error handler',
          file: 'src/app.ts',
          line: 9,
        }),
      ];

      filterFrameworkConventionFindings(findings, EXPRESS_DIFF_WITH_USE_AND_4_PARAMS);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[router] [framework-filter] Suppressed')
      );
    });

    it('first matching matcher wins — no double-counting', () => {
      // This finding could match both Express and TS-prefix
      // Express should win since it's first in the matcher list
      const findings = [
        makeFinding({
          message: 'unused parameter _next',
          file: 'src/app.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(
        findings,
        EXPRESS_DIFF_WITH_USE_AND_4_PARAMS
      );

      expect(result.suppressed).toBe(1);
      // Express matcher is first and should match
      expect(result.results[0]?.matcherId).toBe('express-error-mw');
    });
  });

  // ===========================================================================
  // Windows path handling (MEDIUM-4)
  // ===========================================================================

  describe('Windows path handling', () => {
    it('should match finding with backslash path against forward-slash diff headers', () => {
      const findings = [
        makeFinding({
          message: 'missing case for enum variant',
          file: 'src\\handler.ts',
          line: 10,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, SWITCH_DIFF_WITH_ASSERT_NEVER);

      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-switch');
    });
  });

  // ===========================================================================
  // TS Unused Prefix evidence strength (HIGH-1)
  // ===========================================================================

  describe('TS Unused Prefix evidence validation', () => {
    it('should NOT suppress when message says unused variable but no _prefix identifier', () => {
      // "unused variable" matches messagePattern but no _-prefixed word in message
      const findings = [
        makeFinding({
          message: 'unused variable count is never referenced',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(0);
    });

    it('should suppress only when an actual _prefixed binding name appears in message', () => {
      const findings = [
        makeFinding({
          message: 'unused parameter _callback in function setup',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('ts-unused-prefix');
    });

    it('should NOT suppress bare underscore _ without trailing chars', () => {
      // A single underscore _ should not match ^_\w+$ — must have at least one trailing char
      const findings = [
        makeFinding({
          message: 'unused variable _ is not a valid name',
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      // _ alone does not match /^_\w+$/ since \w+ requires 1+ chars after _
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // getValidFindings helper
  // ===========================================================================

  describe('getValidFindings', () => {
    it('should return only non-suppressed findings', () => {
      const findings = [
        makeFinding({ message: 'unused variable _a is never referenced' }),
        makeFinding({ message: 'actual security issue found' }),
        makeFinding({ message: 'unused parameter _b is never used' }),
      ];

      const summary = filterFrameworkConventionFindings(findings, '');
      const valid = getValidFindings(summary);

      expect(valid).toHaveLength(1);
      expect(valid[0]?.message).toBe('actual security issue found');
    });
  });
});
