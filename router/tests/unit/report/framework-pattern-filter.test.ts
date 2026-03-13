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
  // React Query Dedup (react-query-dedup) — T022
  // ===========================================================================

  describe('React Query Dedup matcher', () => {
    const reactQueryDiff = `diff --git a/src/hooks/useData.tsx b/src/hooks/useData.tsx
--- a/src/hooks/useData.tsx
+++ b/src/hooks/useData.tsx
@@ -1,10 +1,12 @@
+import { useQuery } from '@tanstack/react-query';
+
 export function useData() {
-  const data = fetch('/api/data');
+  const { data } = useQuery(['data'], () => fetch('/api/data'));
   return data;
 }
`;

    const swrDiff = `diff --git a/src/hooks/useData.tsx b/src/hooks/useData.tsx
--- a/src/hooks/useData.tsx
+++ b/src/hooks/useData.tsx
@@ -1,10 +1,12 @@
+import useSWR from 'swr';
+
 export function useData() {
-  const data = fetch('/api/data');
+  const { data } = useSWR('/api/data', fetcher);
   return data;
 }
`;

    const noQueryImportDiff = `diff --git a/src/api.ts b/src/api.ts
--- a/src/api.ts
+++ b/src/api.ts
@@ -1,5 +1,5 @@
 export async function fetchData() {
-  return fetch('/api/data');
+  return fetch('/api/data').then(r => r.json());
 }
`;

    const queryImportNoHookDiff = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -1,5 +1,5 @@
+import { QueryClient } from '@tanstack/react-query';
+
 export const config = {
   timeout: 5000,
 };
`;

    it('should suppress when react-query import + useQuery hook near line', () => {
      const findings = [
        makeFinding({
          message: 'Duplicate data fetching detected',
          file: 'src/hooks/useData.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, reactQueryDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress when swr import + useSWR hook near line', () => {
      const findings = [
        makeFinding({
          message: 'Redundant query call detected',
          file: 'src/hooks/useData.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, swrDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should NOT suppress when no query library import', () => {
      const findings = [
        makeFinding({
          message: 'Duplicate data fetching call',
          file: 'src/api.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, noQueryImportDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });

    it('should NOT suppress when message mentions raw fetch() (HTTP exclusion)', () => {
      const findings = [
        makeFinding({
          message: 'Duplicate fetch() call in component',
          file: 'src/hooks/useData.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, reactQueryDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });

    it('should NOT suppress when react-query import but no hook call near line', () => {
      const findings = [
        makeFinding({
          message: 'Duplicate database connection',
          file: 'src/config.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryImportNoHookDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });

    it('should NOT suppress duplicate-fetch finding near useMutation', () => {
      const mutationDiff = `diff --git a/src/hooks/useSubmit.tsx b/src/hooks/useSubmit.tsx
--- a/src/hooks/useSubmit.tsx
+++ b/src/hooks/useSubmit.tsx
@@ -1,10 +1,12 @@
+import { useMutation } from '@tanstack/react-query';
+
 export function useSubmit() {
-  const submit = fetch('/api/submit', { method: 'POST' });
+  const { mutate } = useMutation(() => fetch('/api/submit', { method: 'POST' }));
   return mutate;
 }
`;

      const findings = [
        makeFinding({
          message: 'Duplicate data fetching detected',
          file: 'src/hooks/useSubmit.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, mutationDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });

    it('should NOT suppress duplicate-fetch finding near useSubscription', () => {
      const subscriptionDiff = `diff --git a/src/hooks/useFeed.tsx b/src/hooks/useFeed.tsx
--- a/src/hooks/useFeed.tsx
+++ b/src/hooks/useFeed.tsx
@@ -1,10 +1,12 @@
+import { useSubscription } from '@apollo/client';
+
 export function useFeed() {
-  const data = fetch('/api/feed');
+  const { data } = useSubscription(FEED_SUBSCRIPTION);
   return data;
 }
`;

      const findings = [
        makeFinding({
          message: 'Redundant query call detected',
          file: 'src/hooks/useFeed.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, subscriptionDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });
  });

  // ===========================================================================
  // Promise.allSettled Order (promise-allsettled-order) — T023
  // ===========================================================================

  describe('Promise.allSettled Order matcher', () => {
    const allSettledWithForEachDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,10 +1,10 @@
 async function processBatch(items: string[]) {
   const promises = items.map(item => processItem(item));
   const results = await Promise.allSettled(promises);
-  return results;
+  results.forEach((result, i) => {
+    console.log(items[i], result.status);
+  });
 }
`;

    const allSettledFarAwayDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,5 +1,5 @@
 // Promise.allSettled is used elsewhere in this file
 function unrelated() {
-  return 42;
+  return 43;
 }
`;

    const allSettledNoIterationDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,8 +1,8 @@
 async function processBatch(promises: Promise<unknown>[]) {
   const results = await Promise.allSettled(promises);
-  return results;
+  return results.length;
 }
`;

    it('should suppress when allSettled call + forEach near line', () => {
      const findings = [
        makeFinding({
          message: 'allSettled results order not guaranteed',
          file: 'src/batch.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledWithForEachDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should NOT suppress when allSettled NOT near finding line', () => {
      const findings = [
        makeFinding({
          message: 'allSettled results may not match order',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledFarAwayDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
    });

    it('should NOT suppress when allSettled near line but no result iteration', () => {
      const findings = [
        makeFinding({
          message: 'allSettled results order may not match',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledNoIterationDiff);
      expect(result.suppressed).toBe(0);
      expect(result.passed).toBe(1);
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
