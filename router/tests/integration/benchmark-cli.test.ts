/**
 * CLI integration test: verifies the benchmark command works
 * against the built dist/ output, catching import path regressions.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'child_process';
import { resolve } from 'path';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';

describe('Benchmark CLI (dist/ integration)', () => {
  const routerRoot = resolve(import.meta.dirname, '..', '..');
  const distMain = resolve(routerRoot, 'dist', 'main.js');

  it('should have dist/main.js available', () => {
    expect(existsSync(distMain)).toBe(true);
  });

  it('should have dist/benchmark/scoring.js available', () => {
    expect(existsSync(resolve(routerRoot, 'dist', 'benchmark', 'scoring.js'))).toBe(true);
  });

  it('should have dist/benchmark/adapter.js available', () => {
    expect(existsSync(resolve(routerRoot, 'dist', 'benchmark', 'adapter.js'))).toBe(true);
  });

  it('should run benchmark command without module-not-found errors', () => {
    try {
      const output = execFileSync('node', [distMain, 'benchmark', '--help'], {
        cwd: routerRoot,
        encoding: 'utf-8',
        timeout: 10000,
      });
      // Commander outputs help text - if we get here, imports resolved
      expect(output).toContain('benchmark');
    } catch (error: unknown) {
      const err = error as { status?: number; stderr?: string; stdout?: string };
      // Commander --help exits with 0, but some versions exit with 1
      // Either way, if we get stdout with help text, the imports worked
      if (err.stdout && err.stdout.includes('benchmark')) {
        expect(true).toBe(true);
      } else {
        throw new Error(`Benchmark CLI failed to load: ${err.stderr || 'unknown error'}`);
      }
    }
  });

  it('should score supported patterns and skip unsupported in mixed fixture', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'ai-review-benchmark-'));
    const fixturesPath = resolve(tempDir, 'mixed-benchmark.json');
    const payload = {
      scenarios: [
        {
          id: 'fp-a-mix',
          category: 'safe-source',
          pattern: 'A',
          description: 'Supported Pattern A scenario',
          sourceIssue: '#test',
          diff: "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,0 +1,3 @@\n+const ITEMS = ['a', 'b'];\n+const x = ITEMS[0];\n+export const value = x;",
          expectedFindings: [],
          truePositive: false,
        },
        {
          id: 'fp-b-mix',
          category: 'framework-conventions',
          pattern: 'B',
          description: 'Unsupported Pattern B scenario',
          sourceIssue: '#test',
          diff: 'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,0 +1,1 @@\n+export const b = 1;',
          expectedFindings: [],
          truePositive: false,
        },
      ],
    };

    writeFileSync(fixturesPath, JSON.stringify(payload), 'utf-8');

    try {
      const output = execFileSync(
        'node',
        [distMain, 'benchmark', '--fixtures', fixturesPath, '--verbose'],
        { cwd: routerRoot, encoding: 'utf-8', timeout: 15000 }
      );
      // Should succeed (exit 0) and report 1 scored, 1 skipped
      expect(output).toContain('1 scored, 1 skipped');
      expect(output).toContain('[SKIP] fp-b-mix');
      expect(output).toContain('[PASS] fp-a-mix');
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fail closed when fixture file has no scenarios', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'ai-review-benchmark-'));
    const fixturesPath = resolve(tempDir, 'empty-benchmark.json');
    writeFileSync(fixturesPath, JSON.stringify({ scenarios: [] }), 'utf-8');

    try {
      execFileSync('node', [distMain, 'benchmark', '--fixtures', fixturesPath], {
        cwd: routerRoot,
        encoding: 'utf-8',
        timeout: 10000,
      });
      throw new Error('Expected benchmark command to fail on empty fixtures');
    } catch (error: unknown) {
      const err = error as { status?: number; stderr?: string; stdout?: string };
      expect(err.status).toBe(2);
      expect(`${err.stdout ?? ''}\n${err.stderr ?? ''}`).toContain(
        'Fixture file contains no scenarios'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fail closed when all fixtures are unsupported benchmark scenarios', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'ai-review-benchmark-'));
    const fixturesPath = resolve(tempDir, 'unsupported-benchmark.json');
    const payload = {
      scenarios: [
        {
          id: 'fp-b-cli',
          category: 'framework-conventions',
          pattern: 'B',
          description: 'Unsupported benchmark fixture',
          sourceIssue: '#test',
          diff: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,0 +1,1 @@\n+export const value = 1;',
          expectedFindings: [],
          truePositive: false,
        },
      ],
    };

    writeFileSync(fixturesPath, JSON.stringify(payload), 'utf-8');

    try {
      execFileSync('node', [distMain, 'benchmark', '--fixtures', fixturesPath], {
        cwd: routerRoot,
        encoding: 'utf-8',
        timeout: 10000,
      });
      throw new Error('Expected benchmark command to fail when every scenario is unsupported');
    } catch (error: unknown) {
      const err = error as { status?: number; stderr?: string; stdout?: string };
      expect(err.status).toBe(2);
      expect(`${err.stdout ?? ''}\n${err.stderr ?? ''}`).toContain(
        'All benchmark scenarios were skipped as unsupported by the deterministic benchmark adapter'
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
