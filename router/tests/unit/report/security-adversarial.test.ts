/**
 * Security Engineer Phase 3: Adversarial Test Battery
 *
 * Tests that real vulnerabilities SURVIVE each new/modified matcher.
 * These scenarios are designed to break matchers that are too permissive.
 */

import { describe, it, expect } from 'vitest';
import { filterFrameworkConventionFindings } from '../../../src/report/framework-pattern-filter.js';
import type { Finding } from '../../../src/agents/types.js';

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

describe('Security Adversarial Tests — Convention 18 (Error Object XSS)', () => {
  it('ADV-18-001: MUST NOT suppress user-constructed Error XSS', () => {
    const diff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,10 @@
+function handleUpload(req) {
+  try {
+    processFile(req.body.file);
+  } catch (error) {
+    const userError = new Error(req.body.errorMessage);
+    document.getElementById('status').innerHTML = userError.message;
+  }
+}
+
 export function errorPage() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'XSS vulnerability — error message injected into innerHTML',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-18-002: MUST NOT suppress error param without catch clause', () => {
    const diff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,6 @@
+function displayError(error) {
+  return \`<div>\${error.message}</div>\`;
+}
+
 export function errorPage() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Potential XSS — error message in template literal',
          file: 'src/error-page.ts',
          line: 2,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-18-003: MUST NOT suppress named handleError function without catch', () => {
    const diff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,6 @@
+function handleError(err) {
+  document.getElementById('error-display').innerHTML = err.message;
+}
+
 export function errorPage() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'XSS via error message in innerHTML',
          file: 'src/error-page.ts',
          line: 2,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-18-005: MUST NOT suppress catch present but innerHTML + req.body nearby', () => {
    const diff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,10 @@
+try {
+  processData();
+} catch (caughtErr) {
+  const customError = buildErrorFromInput(req.body);
+  div.innerHTML = customError.message;
+}
+
 export function errorPage() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'XSS — error.message in innerHTML',
          file: 'src/error-page.ts',
          line: 5,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-18-006: MUST NOT suppress nested catch with tainted re-throw', () => {
    const diff = `diff --git a/src/error-page.ts b/src/error-page.ts
--- a/src/error-page.ts
+++ b/src/error-page.ts
@@ -1,3 +1,12 @@
+try {
+  try { riskyOp(); } catch (inner) {
+    throw new Error(req.query.context + ': ' + inner.message);
+  }
+} catch (outer) {
+  el.innerHTML = outer.message;
+}
+
 export function errorPage() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'XSS — error message in innerHTML',
          file: 'src/error-page.ts',
          line: 6,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });
});

describe('Security Adversarial Tests — Convention 19 (Thin Wrapper Stdlib)', () => {
  it('ADV-19-001: MUST NOT suppress fs.readFileSync wrapper', () => {
    const diff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+function readConfig(path) {
+  return fs.readFileSync(path, 'utf-8');
+}
+
 export function parse() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Missing try-catch around readFileSync',
          file: 'src/parser.ts',
          line: 2,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-19-002: MUST NOT suppress child_process.execSync wrapper', () => {
    const diff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+function runShell(cmd) {
+  return child_process.execSync(cmd).toString();
+}
+
 export function parse() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Unhandled exception in execSync wrapper',
          file: 'src/parser.ts',
          line: 2,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-19-004: MUST NOT suppress fetch wrapper', () => {
    const diff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+function fetchJSON(url) {
+  return fetch(url).then(r => r.json());
+}
+
 export function parse() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Unhandled network error in fetch wrapper',
          file: 'src/parser.ts',
          line: 2,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-19-005: MUST NOT suppress database.query wrapper', () => {
    const diff = `diff --git a/src/parser.ts b/src/parser.ts
--- a/src/parser.ts
+++ b/src/parser.ts
@@ -1,3 +1,6 @@
+function getUser(id) {
+  return database.query('SELECT * FROM users WHERE id = ' + id);
+}
+
 export function parse() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Missing try-catch around database query',
          file: 'src/parser.ts',
          line: 2,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });
});

describe('Security Adversarial Tests — T023 (Promise.allSettled)', () => {
  it('ADV-23-001: MUST NOT suppress Promise.all (not allSettled)', () => {
    const diff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,7 @@
+async function batchFetch(urls) {
+  const results = await Promise.all(urls.map(u => fetch(u)));
+  return results;
+}
+
 export function batch() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Unhandled rejection in Promise.all',
          file: 'src/batch.ts',
          line: 3,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('ADV-23-002: MUST NOT suppress allSettled with no status check', () => {
    const diff = `diff --git a/src/batch.ts b/src/batch.ts
--- a/src/batch.ts
+++ b/src/batch.ts
@@ -1,3 +1,6 @@
+async function fireAndForget(tasks) {
+  const results = await Promise.allSettled(tasks);
+  console.log('Done, processed', results.length);
+}
+
 export function batch() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Missing error handling — rejected promises ignored',
          file: 'src/batch.ts',
          line: 3,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });
});

describe('Security Adversarial Tests — TP Preservation', () => {
  it('TP-XSS-001: innerHTML from req.query.content MUST survive', () => {
    const diff = `diff --git a/src/render.ts b/src/render.ts
--- a/src/render.ts
+++ b/src/render.ts
@@ -1,3 +1,8 @@
+function renderContent(req) {
+  const content = req.query.content;
+  const el = document.getElementById('output');
+  el.innerHTML = content;
+}
+
 export function render() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'XSS vulnerability: innerHTML assigned from req.query.content',
          file: 'src/render.ts',
          line: 4,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('TP-XSS-002: document.write with user input MUST survive', () => {
    const diff = `diff --git a/src/page.ts b/src/page.ts
--- a/src/page.ts
+++ b/src/page.ts
@@ -1,3 +1,8 @@
+function renderPage(req) {
+  const userInput = req.query.content;
+  document.write(userInput);
+}
+
 export function page() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'document.write with user input — XSS vulnerability',
          file: 'src/page.ts',
          line: 3,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('TP-PATH-001: readFile with user-controlled path MUST survive', () => {
    const diff = `diff --git a/src/files.ts b/src/files.ts
--- a/src/files.ts
+++ b/src/files.ts
@@ -1,3 +1,9 @@
+import fs from 'fs';
+
+function serveFile(req, res) {
+  const filePath = req.params.file;
+  fs.readFile(filePath, 'utf-8', (err, data) => {
+    res.send(data);
+  });
+}
+
 export function files() {}`;

    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'Path traversal — file path from user input req.params',
          file: 'src/files.ts',
          line: 5,
        }),
      ],
      diff
    );
    expect(r.suppressed).toBe(0);
  });

  it('TP-INJ-001: SQL injection MUST survive', () => {
    const r = filterFrameworkConventionFindings(
      [
        makeFinding({
          message: 'SQL injection via unsanitized user input in db.query',
          file: 'src/api.ts',
          line: 3,
        }),
      ],
      ''
    );
    expect(r.suppressed).toBe(0);
  });
});
