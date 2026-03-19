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
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {
      /* noop */
    });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* noop */
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
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
  // T019 Widened Express Error Middleware patterns (FR-014)
  // ===========================================================================

  describe('Express Error Middleware widened patterns (FR-014)', () => {
    const phrases = [
      'declared but never referenced',
      'dead code: parameter next never called',
      'parameter not referenced in function body',
    ];

    for (const phrase of phrases) {
      it(`should suppress "${phrase}" when 4-param + Express indicator present`, () => {
        const findings = [
          makeFinding({
            message: `${phrase}`,
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

      // FR-014(c): 5 negative cases per phrase
      it(`should NOT suppress "${phrase}" without 4 params`, () => {
        const findings = [makeFinding({ message: phrase, file: 'src/app.ts', line: 1 })];
        const result = filterFrameworkConventionFindings(
          findings,
          EXPRESS_DIFF_WITH_USE_BUT_3_PARAMS
        );
        expect(result.suppressed).toBe(0);
      });

      it(`should NOT suppress "${phrase}" without Express indicator`, () => {
        const findings = [makeFinding({ message: phrase, file: 'src/app.ts', line: 1 })];
        const result = filterFrameworkConventionFindings(findings, EXPRESS_DIFF_WITHOUT_USE);
        expect(result.suppressed).toBe(0);
      });

      it(`should NOT suppress "${phrase}" in non-handler context`, () => {
        const nonHandlerDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,6 @@
+function helper(a: string, b: number) {
+  return a + b;
+}
+
 export default app;`;

        const findings = [makeFinding({ message: phrase, file: 'src/app.ts', line: 1 })];
        const result = filterFrameworkConventionFindings(findings, nonHandlerDiff);
        expect(result.suppressed).toBe(0);
      });

      it(`should NOT suppress "${phrase}" with Koa framework`, () => {
        const koaDiff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,8 @@
+import Koa from 'koa';
+const app = new Koa();
+app.use(async (ctx, next) => {
+  await next();
+});
+
 export default app;`;

        const findings = [makeFinding({ message: phrase, file: 'src/app.ts', line: 3 })];
        // Koa middleware has 2 params (ctx, next) not 4, so evidence fails
        const result = filterFrameworkConventionFindings(findings, koaDiff);
        expect(result.suppressed).toBe(0);
      });

      it(`should NOT suppress "${phrase}" alongside a genuine security finding`, () => {
        const findings = [
          makeFinding({
            message: `Security: SQL injection vulnerability. Also ${phrase}`,
            file: 'src/db.ts',
            line: 5,
          }),
        ];
        // No Express evidence in wrong file
        const result = filterFrameworkConventionFindings(
          findings,
          EXPRESS_DIFF_WITH_USE_AND_4_PARAMS
        );
        expect(result.suppressed).toBe(0);
      });
    }
  });

  // ===========================================================================
  // Safe Local File Read (safe-local-file-read) — T025
  // ===========================================================================

  describe('Safe Local File Read matcher (T025)', () => {
    // 5 positive cases — one per allowed base
    const positiveBaseCases = [
      { base: '__dirname', code: `path.join(__dirname, 'template.html')` },
      { base: '__filename', code: `path.resolve(__filename, 'config.json')` },
      { base: 'import.meta.dirname', code: `path.join(import.meta.dirname, 'views')` },
      { base: 'import.meta.filename', code: `path.resolve(import.meta.filename, 'data.json')` },
      { base: 'import.meta.url', code: `path.join(import.meta.url, 'assets')` },
    ];

    for (const { base, code } of positiveBaseCases) {
      it(`should suppress path traversal finding when ${base} + string literal used`, () => {
        const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = ${code};
+const content = fs.readFileSync(filePath);
+
 export {};`;

        const findings = [
          makeFinding({
            message: 'Potential path traversal vulnerability',
            file: 'src/files.ts',
            line: 1,
          }),
        ];

        const result = filterFrameworkConventionFindings(findings, diff);
        expect(result.suppressed).toBe(1);
        expect(result.results[0]?.matcherId).toBe('safe-local-file-read');
      });
    }

    // 8 negative cases
    it('should NOT suppress when variable is used as path segment', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, filename);
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when function call is used as path segment', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, getPath());
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when property access is used as path segment', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, config.path);
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when template interpolation is used', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, \`\${userInput}\`);
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Path traversal risk with dynamic path',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when process.env is used as path segment', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, process.env.CONFIG_DIR);
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when req.* is used as path segment', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, req.params.file);
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Path traversal via user input',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when alias is used for __dirname', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,6 @@
+const dir = __dirname;
+const filePath = path.join(dir, 'template.html');
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress multi-line path.join calls', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,7 @@
+const filePath = path.join(
+  __dirname,
+  'template.html'
+);
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Path traversal risk detected',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      // Multi-line is deliberately not matched (single-line only)
      expect(result.suppressed).toBe(0);
    });

    // B1: Security — reject '..' path traversal
    it('should NOT suppress when string literal contains ".." (B1 security)', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, '../../etc/passwd');
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    // B2: Security — reject absolute paths
    it('should NOT suppress when string literal starts with "/" (B2 security)', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, '/etc/passwd');
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when string literal starts with drive letter (B2 security)', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, "C:\\Windows\\System32\\config");
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(0);
    });

    // Multiple string literal segments
    it('should suppress when multiple safe string literal segments used', () => {
      const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,5 @@
+const filePath = path.join(__dirname, 'views', 'templates', 'index.html');
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'Potential path traversal vulnerability',
          file: 'src/files.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, diff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('safe-local-file-read');
    });
  });

  // ===========================================================================
  // Exhaustive Type-Narrowed Switch (exhaustive-type-narrowed-switch) — T026
  // ===========================================================================

  describe('Exhaustive Type-Narrowed Switch matcher (T026)', () => {
    const unionSwitchDiff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,13 @@
+type Theme = 'light' | 'dark';
+
+function getColors(theme: Theme) {
+  switch (theme) {
+    case 'light':
+      return { bg: '#fff', fg: '#000' };
+    case 'dark':
+      return { bg: '#000', fg: '#fff' };
+  }
+}
+
 export {};`;

    const noUnionDiff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,11 @@
+function getColors(theme: string) {
+  switch (theme) {
+    case 'light':
+      return { bg: '#fff', fg: '#000' };
+    case 'dark':
+      return { bg: '#000', fg: '#fff' };
+  }
+}
+
 export {};`;

    const numberTypeDiff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,11 @@
+function getLevel(level: number) {
+  switch (level) {
+    case 1:
+      return 'low';
+    case 2:
+      return 'high';
+  }
+}
+
 export {};`;

    it('should suppress "missing default" when union type + switch present', () => {
      const findings = [
        makeFinding({
          message: 'missing default case in switch statement',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, unionSwitchDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-type-narrowed-switch');
    });

    it('should suppress "no default" phrasing', () => {
      const findings = [
        makeFinding({
          message: 'Switch has no default branch',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, unionSwitchDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should suppress "add default" phrasing', () => {
      const findings = [
        makeFinding({
          message: 'Consider adding a default case to the switch',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, unionSwitchDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should suppress "non-exhaustive" phrasing', () => {
      const findings = [
        makeFinding({
          message: 'Non-exhaustive switch statement',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, unionSwitchDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress when no union type visible in diff', () => {
      const findings = [
        makeFinding({
          message: 'missing default case in switch',
          file: 'src/theme.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, noUnionDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when switch target type is string', () => {
      // noUnionDiff has `: string` type — no union visible AND string safety constraint
      const findings = [
        makeFinding({
          message: 'missing default case in switch',
          file: 'src/theme.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, noUnionDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when switch target type is number', () => {
      const findings = [
        makeFinding({
          message: 'missing default case in switch',
          file: 'src/theme.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, numberTypeDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when finding file does not match diff', () => {
      const findings = [
        makeFinding({
          message: 'missing default case',
          file: 'src/other.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, unionSwitchDiff);
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
  // T023 Widened: Promise.allSettled error-handling patterns
  // ===========================================================================

  describe('Promise.allSettled widened patterns (T023)', () => {
    const allSettledWithStatusCheckDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+async function processBatch(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  for (const result of results) {
+    if (result.status === 'fulfilled') {
+      console.log(result.value.status);
+    }
+  }
+}
+
 export function batch() {}`;

    const allSettledWithForEachDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+export async function batchProcess(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  results.forEach((result, i) => {
+    console.log(\`URL \${i}: \${result.status}\`);
+  });
+}
+
 export function batch() {}`;

    const allSettledNoIterationDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,6 @@
+async function processBatch(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  return results.length;
+}
+
 export function batch() {}`;

    it('should suppress "Unhandled rejected promises" when allSettled + .status check present', () => {
      const findings = [
        makeFinding({
          message: 'Unhandled rejected promises in Promise.allSettled results.',
          file: 'src/batch.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledWithStatusCheckDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should suppress generic "additional error handling" when allSettled + forEach present', () => {
      const findings = [
        makeFinding({
          message:
            'Potential issue — verify that the fetch requests do not need any additional error handling or response processing.',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledWithForEachDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should suppress "silent rejection" when allSettled + .status check present', () => {
      const findings = [
        makeFinding({
          message: 'Silent rejection ignoring in Promise.allSettled handler',
          file: 'src/batch.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledWithStatusCheckDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress when allSettled present but no iteration AND no .status check', () => {
      const findings = [
        makeFinding({
          message: 'Unhandled rejected promises in Promise.allSettled results.',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledNoIterationDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress generic error-handling finding without allSettled in diff', () => {
      const noAllSettledDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,6 @@
+async function processBatch(urls: string[]) {
+  const results = await Promise.all(urls.map(u => fetch(u)));
+  return results;
+}
+
 export function batch() {}`;

      const findings = [
        makeFinding({
          message: 'Missing error handling for rejected promises',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, noAllSettledDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress non-allSettled error handling finding', () => {
      const findings = [
        makeFinding({
          message: 'Missing try-catch around database query',
          file: 'src/db.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, allSettledWithStatusCheckDiff);
      expect(result.suppressed).toBe(0);
    });

    // Fix 1 (T023): .status check is now MANDATORY — iteration alone is insufficient
    it('should NOT suppress when allSettled + forEach but NO .status check', () => {
      const forEachNoStatusDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,8 @@
+async function processBatch(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  results.forEach((result, i) => {
+    console.log(\`URL \${i}: done\`);
+  });
+}
+
 export function batch() {}`;

      const findings = [
        makeFinding({
          message: 'Unhandled rejected promises in Promise.allSettled results.',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, forEachNoStatusDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should suppress fp-b-003: for-of with .status check', () => {
      const fpB003Diff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+async function processBatch(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  for (const result of results) {
+    if (result.status === 'fulfilled') {
+      console.log(result.value.status);
+    }
+  }
+}
+
 export function batch() {}`;

      const findings = [
        makeFinding({
          message: 'Unhandled rejected promises in Promise.allSettled results.',
          file: 'src/batch.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, fpB003Diff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should suppress fp-b-007: forEach with result.status in template literal', () => {
      const fpB007Diff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+export async function batchProcess(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  results.forEach((result, i) => {
+    console.log(\`URL \${i}: \${result.status}\`);
+  });
+}
+
 export function batch() {}`;

      const findings = [
        makeFinding({
          message: 'allSettled results order may not match input order.',
          file: 'src/batch.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, fpB007Diff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });
  });

  // ===========================================================================
  // T026 Regression: Return type vs parameter type
  // ===========================================================================

  describe('T026 return type regression', () => {
    const unionSwitchWithReturnTypeDiff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,10 @@
+type Theme = 'light' | 'dark';
+
+function getBackground(theme: Theme): string {
+  switch (theme) {
+    case 'light': return '#ffffff';
+    case 'dark': return '#1a1a1a';
+  }
+}
+
 export function theme() {}`;

    it('should suppress when return type is string but switch target is union type', () => {
      const findings = [
        makeFinding({
          message:
            'Non-exhaustive switch statement on Theme type. The switch does not include a default case.',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, unionSwitchWithReturnTypeDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-type-narrowed-switch');
    });

    it('should still NOT suppress when switch target is typed as string', () => {
      const paramStringDiff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,13 @@
+type Theme = 'light' | 'dark';
+
+function getColors(theme: string) {
+  switch (theme) {
+    case 'light':
+      return { bg: '#fff', fg: '#000' };
+    case 'dark':
+      return { bg: '#000', fg: '#fff' };
+  }
+}
+
 export {};`;

      const findings = [
        makeFinding({
          message: 'missing default case in switch',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, paramStringDiff);
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // T026 Fix: Union member vs case branch count verification
  // ===========================================================================

  describe('T026 case coverage verification', () => {
    it('should suppress fp-f-010: Theme union with 2 members and 2 cases', () => {
      const fpF010Diff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,10 @@
+type Theme = 'light' | 'dark';
+
+function getBackground(theme: Theme): string {
+  switch (theme) {
+    case 'light': return '#ffffff';
+    case 'dark': return '#1a1a1a';
+  }
+}
+
 export function theme() {}`;

      const findings = [
        makeFinding({
          message: 'Non-exhaustive switch statement on Theme type. Missing default case.',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, fpF010Diff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-type-narrowed-switch');
    });

    it('should NOT suppress when switch is missing a union member (3 members, 2 cases)', () => {
      const missingCaseDiff = `diff --git a/src/status.ts b/src/status.ts
--- a/src/status.ts
+++ b/src/status.ts
@@ -1,3 +1,11 @@
+type Status = 'pending' | 'active' | 'done';
+
+function getLabel(status: Status): string {
+  switch (status) {
+    case 'pending': return 'Pending';
+    case 'active': return 'Active';
+  }
+}
+
 export function status() {}`;

      const findings = [
        makeFinding({
          message: 'Non-exhaustive switch: missing case for "done"',
          file: 'src/status.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, missingCaseDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should suppress when switch has more cases than union members (defensive branches)', () => {
      // 2 union members, 3 cases — still exhaustive plus a guard
      const extraCaseDiff = `diff --git a/src/theme.ts b/src/theme.ts
--- a/src/theme.ts
+++ b/src/theme.ts
@@ -1,3 +1,12 @@
+type Theme = 'light' | 'dark';
+
+function getBackground(theme: Theme): string {
+  switch (theme) {
+    case 'light': return '#ffffff';
+    case 'dark': return '#1a1a1a';
+    case 'system': return '#888888';
+  }
+}
+
 export function theme() {}`;

      const findings = [
        makeFinding({
          message: 'missing default case in switch',
          file: 'src/theme.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, extraCaseDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('exhaustive-type-narrowed-switch');
    });
  });

  // ===========================================================================
  // T025 Widened: Sync file read patterns
  // ===========================================================================

  describe('T025 widened sync file read patterns', () => {
    const safeReadFileSyncDiff = `diff --git a/src/template.ts b/src/template.ts
--- a/src/template.ts
+++ b/src/template.ts
@@ -1,3 +1,7 @@
+import fs from 'fs';
+import path from 'path';
+
+const tmpl = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf-8');
+
 export function template() {}`;

    it('should suppress "Synchronous file read" finding when path is safe', () => {
      const findings = [
        makeFinding({
          message:
            'Synchronous file read operation detected with fs.readFileSync. This can block the event loop.',
          file: 'src/template.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, safeReadFileSyncDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('safe-local-file-read');
    });

    it('should suppress "readFileSync blocks" phrasing when path is safe', () => {
      const findings = [
        makeFinding({
          message: 'readFileSync blocks the event loop during I/O',
          file: 'src/template.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, safeReadFileSyncDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress sync read finding when path has dynamic segment', () => {
      const dynamicPathDiff = `diff --git a/src/template.ts b/src/template.ts
--- a/src/template.ts
+++ b/src/template.ts
@@ -1,3 +1,5 @@
+const tmpl = fs.readFileSync(path.join(__dirname, userInput), 'utf-8');
+
 export function template() {}`;

      const findings = [
        makeFinding({
          message: 'Synchronous file read operation detected with fs.readFileSync.',
          file: 'src/template.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, dynamicPathDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress sync read finding without path.join/__dirname', () => {
      const rawPathDiff = `diff --git a/src/template.ts b/src/template.ts
--- a/src/template.ts
+++ b/src/template.ts
@@ -1,3 +1,5 @@
+const tmpl = fs.readFileSync('/etc/config.json', 'utf-8');
+
 export function template() {}`;

      const findings = [
        makeFinding({
          message: 'Synchronous file read operation detected with fs.readFileSync.',
          file: 'src/template.ts',
          line: 1,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, rawPathDiff);
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // T022 Widened: React Query generic endpoint findings
  // ===========================================================================

  describe('T022 widened React Query patterns', () => {
    const reactQueryDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,12 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    it('should suppress "verify endpoint returns format" when useQuery present', () => {
      const findings = [
        makeFinding({
          message:
            'Potential issue — verify that the /api/users endpoint returns JSON in the expected format.',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, reactQueryDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress "ensure API error handling" when useQuery present', () => {
      const findings = [
        makeFinding({
          message:
            'Ensure that the fetchUsers endpoint handles response errors and returns the expected format.',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, reactQueryDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress "verify endpoint" without query library import', () => {
      const noQueryDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,8 @@
+export function Dashboard() {
+  const data = await fetch('/api/users').then(r => r.json());
+  return <div>{data?.length} users</div>;
+}
+
 export function App() {}`;

      const findings = [
        makeFinding({
          message: 'Verify that the /api/users endpoint returns JSON in the expected format.',
          file: 'src/Dashboard.tsx',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, noQueryDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress verify-endpoint finding in non-React code', () => {
      const findings = [
        makeFinding({
          message: 'Verify that the endpoint returns the expected response format.',
          file: 'src/api.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, '');
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // T022 Fix: Error-handling findings require error destructuring
  // ===========================================================================

  describe('T022 error-handling message requires error destructuring', () => {
    const queryDataOnlyDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,12 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const queryWithErrorDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  if (error) return <div>Error: {error.message}</div>;
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const queryWithIsErrorDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,13 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  if (isError) return <div>Failed to load</div>;
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    it('should NOT suppress "missing error handling" when only { data } is destructured (fp-b-006 guard)', () => {
      const findings = [
        makeFinding({
          message: 'Missing error handling — useQuery errors are not displayed to the user.',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryDataOnlyDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should suppress "missing error handling" when error is destructured from hook result', () => {
      const findings = [
        makeFinding({
          message: 'Missing error handling — useQuery errors are not displayed to the user.',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryWithErrorDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress "missing error handling" when isError is destructured from hook result', () => {
      const findings = [
        makeFinding({
          message: 'Missing error handling for useQuery — consider using isError state.',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryWithIsErrorDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress fp-b-006: duplicate key finding (non-error-handling message) even with { data } only', () => {
      // fp-b-006 message is about duplicate fetching, NOT error handling,
      // so the error-destructuring gate does not apply.
      const findings = [
        makeFinding({
          message: 'React Query useQuery with same key is not double-fetching',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryDataOnlyDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress non-error-handling useQuery findings regardless of error destructuring', () => {
      // "duplicate data fetching" message does not match missing.*error|error.*handling
      const findings = [
        makeFinding({
          message: 'Duplicate data fetching detected',
          file: 'src/Dashboard.tsx',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryDataOnlyDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should not suppress fp-b-006 snapshot loading-state advisory in production just because the render is null-safe', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          message:
            "Missing error and loading state handling in useQuery destructuring. Component will show 'undefined users' during loading and may show stale data on errors.",
          suggestion:
            'Destructure error and isLoading from useQuery: `const { data, error, isLoading } = useQuery(...)` and handle these states in the render logic.',
          file: 'src/Dashboard.tsx',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryDataOnlyDiff);
      expect(result.suppressed).toBe(0);
      expect(result.results[0]?.suppressed).toBe(false);
    });

    it('should not suppress fetch-status advisories in production for a simple React Query fetch wrapper', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          message:
            'fetchUsers function lacks error handling for failed HTTP responses. fetch() does not reject on 4xx/5xx status codes, only on network errors.',
          suggestion:
            "Add response status validation: `return fetch('/api/users').then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })`",
          file: 'src/Dashboard.tsx',
          line: 8,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, queryDataOnlyDiff);
      expect(result.suppressed).toBe(0);
      expect(result.results[0]?.suppressed).toBe(false);
    });

    it('should not suppress fp-b-002 snapshot secondary-query error advice in production when the queried data is unused', () => {
      const multiQueryDiff = `diff --git a/src/UserProfile.tsx b/src/UserProfile.tsx
--- a/src/UserProfile.tsx
+++ b/src/UserProfile.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+function UserProfile({ userId }: { userId: string }) {
+  const { data: user, error } = useQuery({
+    queryKey: ['user', userId],
+    queryFn: () => fetchUser(userId),
+  });
+  const { data: settings } = useQuery({
+    queryKey: ['user', userId, 'settings'],
+    queryFn: () => fetchUserSettings(userId),
+  });
+  if (error) return <div>Error loading profile</div>;
+  return <div>{user?.name}</div>;
+}
+
 export function App() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message:
            'Settings query error is not handled. If fetchUserSettings fails, the user will see a successful profile load but missing settings data with no indication of the error.',
          suggestion:
            'Destructure error from the settings query (e.g., `error: settingsError`) and display appropriate error state or fallback UI when settings fail to load.',
          file: 'src/UserProfile.tsx',
          line: 8,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, multiQueryDiff);
      expect(result.suppressed).toBe(0);
      expect(result.results[0]?.suppressed).toBe(false);
    });
  });

  // ===========================================================================
  // Convention 18: Error Object XSS matcher
  // ===========================================================================

  describe('Error Object XSS matcher (Convention 18)', () => {
    const catchErrorDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,14 @@
+export function handleRequest(): string {
+  try {
+    return processData();
+  } catch (error) {
+    return \`<div class="error">
+      <h2>Something went wrong</h2>
+      <p>\${(error as Error).message}</p>
+    </div>\`;
+  }
+}
+
 export function errorPage() {}`;

    it('should suppress XSS finding for error.message in catch clause', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          message:
            'Potential XSS vulnerability by injecting error message directly into innerHTML.',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, catchErrorDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('error-object-xss');
    });

    it('should suppress "inject error message" phrasing', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS risk: error.message injected into template literal',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, catchErrorDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should suppress "error message XSS" phrasing', () => {
      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'error.message used in template could lead to XSS',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, catchErrorDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress when no catch clause visible', () => {
      const noCatchDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,6 @@
+function showError(error: unknown): string {
+  return \`<p>\${(error as Error).message}</p>\`;
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS vulnerability by injecting error message into template',
          file: 'src/error-page.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, noCatchDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when error constructed from user input', () => {
      const userInputErrorDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,8 @@
+try {
+  const err = new Error(req.body.text);
+  throw err;
+} catch (error) {
+  return \`<p>\${(error as Error).message}</p>\`;
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS vulnerability: injecting error message into template',
          file: 'src/error-page.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, userInputErrorDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should suppress error-severity findings when evidence confirms catch-origin safety', () => {
      // LLM severity is arbitrary — evidence-based checks (catch clause present,
      // no innerHTML/document.write in diff, no user-constructed error) are sufficient
      const findings = [
        makeFinding({
          severity: 'error',
          message: 'XSS vulnerability by injecting error message directly into template.',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, catchErrorDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress error-severity finding when error constructed from user input (gate 3)', () => {
      // Proves gate 3 catches user-constructed errors even at error severity,
      // so the removed severity gate is truly redundant (security-engineer mandate)
      const userInputErrorDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,8 @@
+try {
+  const err = new Error(req.body.text);
+  throw err;
+} catch (error) {
+  return \`<p>\${(error as Error).message}</p>\`;
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'error',
          message: 'XSS vulnerability: injecting error message into template',
          file: 'src/error-page.ts',
          line: 5,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, userInputErrorDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when error.message used in innerHTML assignment', () => {
      const innerHTMLDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,8 @@
+try {
+  doSomething();
+} catch (error) {
+  document.getElementById('error').innerHTML = (error as Error).message;
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS: error.message injected into innerHTML',
          file: 'src/error-page.ts',
          line: 4,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, innerHTMLDiff);
      expect(result.suppressed).toBe(0);
    });

    // FR-015: Variable-backed HTML detection tests
    it('FR-015: should NOT suppress when variable assigned template literal with HTML is passed to res.send', () => {
      const varTemplateDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,10 @@
+export function handleError(req: Request, res: Response) {
+  try {
+    doSomething();
+  } catch (err) {
+    const html = \`<p>\${(err as Error).message}</p>\`;
+    res.send(html);
+  }
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS vulnerability: error.message injected into template',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, varTemplateDiff);
      expect(result.suppressed).toBe(0);
    });

    it('FR-015: should NOT suppress when variable assigned string with HTML is passed to res.send', () => {
      const varStringDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,10 @@
+export function handleError(req: Request, res: Response) {
+  try {
+    doSomething();
+  } catch (err) {
+    const html = '<p>' + (err as Error).message + '</p>';
+    res.send(html);
+  }
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS vulnerability: error.message injected into response',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, varStringDiff);
      expect(result.suppressed).toBe(0);
    });

    it('FR-015: should still suppress when plain-text variable (no HTML) is passed to res.send', () => {
      const plainTextDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,10 @@
+export function handleError(req: Request, res: Response) {
+  try {
+    doSomething();
+  } catch (err) {
+    const msg = (err as Error).message;
+    res.send(msg);
+  }
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS vulnerability: error.message injected into response',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, plainTextDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('error-object-xss');
    });

    it('FR-015: should NOT suppress variable-backed HTML via res.write', () => {
      const varWriteDiff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,10 @@
+export function handleError(req: Request, res: Response) {
+  try {
+    doSomething();
+  } catch (err) {
+    const output = \`<div>\${(err as Error).message}</div>\`;
+    res.write(output);
+  }
+}
+
 export function errorPage() {}`;

      const findings = [
        makeFinding({
          severity: 'warning',
          message: 'XSS vulnerability: error.message injected into template',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, varWriteDiff);
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // Convention 19: Thin Wrapper Stdlib matcher
  // ===========================================================================

  describe('Thin Wrapper Stdlib matcher (Convention 19)', () => {
    const jsonParseDiff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+export function parseJSON(input: string): unknown {
+  return JSON.parse(input);
+}
+
 export function parse() {}`;

    const parseIntDiff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+export function toInt(value: string): number {
+  return parseInt(value, 10);
+}
+
 export function parse() {}`;

    const newURLDiff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+export function parseUrl(input: string): URL {
+  return new URL(input);
+}
+
 export function parse() {}`;

    it('should suppress "could throw" for JSON.parse thin wrapper', () => {
      const findings = [
        makeFinding({
          message:
            'The function parseJSON directly returns the result of JSON.parse, which could throw an error if the input is not valid JSON.',
          file: 'src/parser.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, jsonParseDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('thin-wrapper-stdlib');
    });

    it('should suppress "missing try-catch" for parseInt thin wrapper', () => {
      const findings = [
        makeFinding({
          message: 'Missing try-catch around parseInt call',
          file: 'src/parser.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, parseIntDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should suppress "may throw" for new URL thin wrapper', () => {
      const findings = [
        makeFinding({
          message: 'new URL() may throw if the input is not a valid URL',
          file: 'src/parser.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, newURLDiff);
      expect(result.suppressed).toBe(1);
    });

    it('should NOT suppress when wrapper has I/O operations', () => {
      const ioDiff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+export function loadAndParse(path: string): unknown {
+  return JSON.parse(fs.readFileSync(path, 'utf-8'));
+}
+
 export function parse() {}`;

      const findings = [
        makeFinding({
          message: 'Missing try-catch around JSON.parse call',
          file: 'src/parser.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, ioDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when wrapper is in request handler context', () => {
      const handlerDiff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+export function handleParse(req: Request): unknown {
+  return JSON.parse(req.body);
+}
+
 export function parse() {}`;

      const findings = [
        makeFinding({
          message: 'Missing try-catch around JSON.parse call',
          file: 'src/parser.ts',
          line: 2,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, handlerDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when wrapper has conditional logic', () => {
      const conditionalDiff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,7 @@
+export function safeParse(input: string): unknown {
+  if (input.length === 0) return null;
+  return JSON.parse(input);
+}
+
 export function parse() {}`;

      const findings = [
        makeFinding({
          message: 'Missing try-catch around JSON.parse',
          file: 'src/parser.ts',
          line: 3,
        }),
      ];

      const result = filterFrameworkConventionFindings(findings, conditionalDiff);
      expect(result.suppressed).toBe(0);
    });
  });

  // ===========================================================================
  // getValidFindings helper
  // ===========================================================================

  // ===========================================================================
  // T022 Fix: Aliased destructuring and optional chaining
  // ===========================================================================

  describe('T022 aliased destructuring and optional chaining', () => {
    const aliasedErrorDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error: queryError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  if (queryError) return <div>Error: {queryError.message}</div>;
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const aliasedIsErrorDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, isError: hasErr } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  if (hasErr) return <div>Failed to load</div>;
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const optionalChainingDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  return <div>{error?.message ?? data?.length + ' users'}</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const aliasedOptionalChainingDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error: fetchErr } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  return <div>{fetchErr?.message ?? data?.length + ' users'}</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const aliasedTernaryDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error: queryError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  return queryError ? <div>Error!</div> : <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const aliasedNoUsageDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error: queryError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  console.log(queryError);
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const aliasedShortCircuitDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error: queryError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  return <div>{queryError && <span>Error!</span>}{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;

    const errorHandlingMsg =
      'Missing error handling — useQuery errors are not displayed to the user.';

    it('should suppress when error is aliased and alias is used in conditional (T022 alias)', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, aliasedErrorDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress when isError is aliased and alias is used in conditional (T022 alias)', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, aliasedIsErrorDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should NOT suppress when error is only used with optional chaining (error?.message) — not a conditional guard', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, optionalChainingDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress when aliased error is only used with optional chaining (fetchErr?.message) — not a conditional guard', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, aliasedOptionalChainingDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should suppress when aliased error is used in ternary (queryError ? ... : ...)', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, aliasedTernaryDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should NOT suppress when aliased error is only logged, not used in guard (fail-open)', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, aliasedNoUsageDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should suppress when aliased error is used in short-circuit render (queryError && ...)', () => {
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, aliasedShortCircuitDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });

    it('should suppress when both error and isError are destructured but only isError is guarded (dual-binding)', () => {
      const dualBindingDiff = `diff --git a/src/Dashboard.tsx b/src/Dashboard.tsx
--- a/src/Dashboard.tsx
+++ b/src/Dashboard.tsx
@@ -1,3 +1,14 @@
+import { useQuery } from '@tanstack/react-query';
+
+export function Dashboard() {
+  const { data, error, isError } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+  if (isError) return <div>Error: {error.message}</div>;
+  return <div>{data?.length} users</div>;
+}
+
+function fetchUsers() { return fetch('/api/users').then(r => r.json()); }
+
 export function App() {}`;
      const findings = [
        makeFinding({ message: errorHandlingMsg, file: 'src/Dashboard.tsx', line: 5 }),
      ];
      const result = filterFrameworkConventionFindings(findings, dualBindingDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('react-query-dedup');
    });
  });

  // ===========================================================================
  // T023 Fix: .then() chain extraction
  // ===========================================================================

  describe('T023 .then() chain extraction', () => {
    const thenArrowDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+export function batchProcess(urls: string[]) {
+  Promise.allSettled(urls.map(u => fetch(u))).then(results => {
+    for (const result of results) {
+      if (result.status === 'fulfilled') console.log(result.value);
+    }
+  });
+}
+
 export function batch() {}`;

    const thenParenArrowDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+export function batchProcess(urls: string[]) {
+  Promise.allSettled(urls.map(u => fetch(u))).then((results) => {
+    results.forEach((r) => {
+      console.log(r.status);
+    });
+  });
+}
+
 export function batch() {}`;

    const thenFunctionDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+export function batchProcess(urls: string[]) {
+  Promise.allSettled(urls.map(u => fetch(u))).then(function(outcomes) {
+    for (const outcome of outcomes) {
+      if (outcome.status === 'rejected') console.error(outcome.reason);
+    }
+  });
+}
+
 export function batch() {}`;

    const thenNoStatusDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,8 @@
+export function batchProcess(urls: string[]) {
+  Promise.allSettled(urls.map(u => fetch(u))).then(results => {
+    results.forEach(r => console.log(r));
+  });
+}
+
 export function batch() {}`;

    const thenNamedRefDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,6 @@
+export function batchProcess(urls: string[]) {
+  Promise.allSettled(urls.map(u => fetch(u))).then(handleResults);
+}
+
 export function batch() {}`;

    const allSettledMsg = 'Unhandled rejected promises in Promise.allSettled results.';

    it('should suppress .then(results => ...) with for-of + .status (T023 .then)', () => {
      const findings = [makeFinding({ message: allSettledMsg, file: 'src/batch.ts', line: 3 })];
      const result = filterFrameworkConventionFindings(findings, thenArrowDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should suppress .then((results) => ...) with forEach + .status (T023 .then)', () => {
      const findings = [makeFinding({ message: allSettledMsg, file: 'src/batch.ts', line: 3 })];
      const result = filterFrameworkConventionFindings(findings, thenParenArrowDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should suppress .then(function(outcomes) {...}) with for-of + .status (T023 .then)', () => {
      const findings = [makeFinding({ message: allSettledMsg, file: 'src/batch.ts', line: 3 })];
      const result = filterFrameworkConventionFindings(findings, thenFunctionDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });

    it('should NOT suppress .then() chain when no .status check (fail-open)', () => {
      const findings = [makeFinding({ message: allSettledMsg, file: 'src/batch.ts', line: 3 })];
      const result = filterFrameworkConventionFindings(findings, thenNoStatusDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should NOT suppress .then(handleResults) — named function ref (fail-open)', () => {
      const findings = [makeFinding({ message: allSettledMsg, file: 'src/batch.ts', line: 3 })];
      const result = filterFrameworkConventionFindings(findings, thenNamedRefDiff);
      expect(result.suppressed).toBe(0);
    });

    it('should still suppress await pattern (regression guard)', () => {
      const awaitDiff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,10 @@
+async function processBatch(urls: string[]) {
+  const results = await Promise.allSettled(urls.map(u => fetch(u)));
+  for (const result of results) {
+    if (result.status === 'fulfilled') console.log(result.value);
+  }
+}
+
 export function batch() {}`;
      const findings = [makeFinding({ message: allSettledMsg, file: 'src/batch.ts', line: 3 })];
      const result = filterFrameworkConventionFindings(findings, awaitDiff);
      expect(result.suppressed).toBe(1);
      expect(result.results[0]?.matcherId).toBe('promise-allsettled-order');
    });
  });

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

  // ===========================================================================
  // FR-022: disable_matchers
  // ===========================================================================
  describe('disable_matchers (FR-022)', () => {
    it('should skip disabled matchers', () => {
      const findings = [makeFinding({ message: 'unused variable _a is never referenced' })];

      // Without disable: ts-unused-prefix would suppress this
      const withoutDisable = filterFrameworkConventionFindings(findings, '');
      expect(withoutDisable.suppressed).toBe(1);

      // With disable: ts-unused-prefix is skipped, finding passes through
      const withDisable = filterFrameworkConventionFindings(findings, '', ['ts-unused-prefix']);
      expect(withDisable.suppressed).toBe(0);
      expect(withDisable.passed).toBe(1);
    });

    it('should still apply non-disabled matchers', () => {
      const findings = [
        makeFinding({ message: 'unused variable _a is never referenced' }),
        makeFinding({ message: 'actual security issue found' }),
      ];

      // Disable express-error-mw (irrelevant), ts-unused-prefix should still work
      const result = filterFrameworkConventionFindings(findings, '', ['express-error-mw']);
      expect(result.suppressed).toBe(1); // ts-unused-prefix still active
      expect(result.passed).toBe(1);
    });

    it('should handle empty disable_matchers array', () => {
      const findings = [makeFinding({ message: 'unused variable _a is never referenced' })];

      const result = filterFrameworkConventionFindings(findings, '', []);
      expect(result.suppressed).toBe(1); // Normal behavior
    });

    it('writes disabled matcher diagnostics to stderr so machine-readable stdout stays clean', () => {
      const findings = [makeFinding({ message: 'unused variable _a is never referenced' })];

      const result = filterFrameworkConventionFindings(findings, '', ['ts-unused-prefix']);
      const jsonPayload = JSON.stringify({ findings: getValidFindings(result) });
      const sarifPayload = JSON.stringify({ runs: [{ results: getValidFindings(result) }] });

      expect(consoleLogSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[router] [framework-filter] Disabled matchers:')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[router] [framework-filter] Disabled matchers: ts-unused-prefix'
      );
      expect(() => JSON.parse(jsonPayload)).not.toThrow();
      expect(() => JSON.parse(sarifPayload)).not.toThrow();
    });
  });
});
