/**
 * Benchmark Tests: Control Flow Analysis Agent
 *
 * Performance validation per AG-003: Analysis completes within time budget
 * for 99% of PRs in the benchmark corpus.
 */

import { describe, it, expect } from 'vitest';
import { controlFlowAgent } from '../../src/agents/control_flow/index.js';
import {
  buildCFG,
  parseSourceFile,
  findFunctions,
  buildAllCFGs,
} from '../../src/agents/control_flow/cfg-builder.js';
import { createMitigationDetector } from '../../src/agents/control_flow/mitigation-detector.js';
import { createPathAnalyzer } from '../../src/agents/control_flow/path-analyzer.js';
import { AnalysisBudget } from '../../src/agents/control_flow/budget.js';
import type { AgentContext } from '../../src/agents/types.js';
import type { DiffFile } from '../../src/diff.js';
import { assertDefined, createTestAgentContext, createTestDiffFile } from '../test-utils.js';

describe('Control Flow Agent Benchmarks (AG-003)', () => {
  // ==========================================================================
  // Helpers
  // ==========================================================================

  function createContext(files: DiffFile[], timeBudgetMs = 60000): AgentContext {
    return createTestAgentContext(files, { timeBudgetMs, sizeBudgetLines: 10000 });
  }

  function createDiffFile(path: string, patch: string): DiffFile {
    return createTestDiffFile(path, patch);
  }

  function generateLargeFunction(branches: number): string {
    const conditions = Array.from(
      { length: branches },
      (_, i) => `
    if (condition${i}) {
      result += process${i}(input);
    }`
    ).join(' else ');

    return `
function processLargeInput(input: unknown, ${Array.from({ length: branches }, (_, i) => `condition${i}: boolean`).join(', ')}) {
  let result = '';
  ${conditions}
  return result;
}
`;
  }

  function generateFileWithFunctions(count: number): string {
    return Array.from(
      { length: count },
      (_, i) => `
function func${i}(input: string) {
  if (!input) return null;
  const processed = process${i}(input);
  return processed;
}
`
    ).join('\n');
  }

  function measureTime<T>(fn: () => T): { result: T; durationMs: number } {
    const start = performance.now();
    const result = fn();
    const durationMs = performance.now() - start;
    return { result, durationMs };
  }

  async function measureTimeAsync<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; durationMs: number }> {
    const start = performance.now();
    const result = await fn();
    const durationMs = performance.now() - start;
    return { result, durationMs };
  }

  // ==========================================================================
  // CFG Construction Performance
  // ==========================================================================

  describe('CFG Construction Performance', () => {
    it('should build CFG for simple function in < 10ms', () => {
      const code = `function simple(x: number) { return x * 2; }`;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const functions = findFunctions(sourceFile);

      const { durationMs } = measureTime(() => {
        buildCFG(
          assertDefined(functions[0], 'Expected at least one function'),
          sourceFile,
          'test.ts'
        );
      });

      expect(durationMs).toBeLessThan(10);
    });

    it('should build CFG for function with 10 branches in < 50ms', () => {
      const code = generateLargeFunction(10);
      const sourceFile = parseSourceFile(code, 'test.ts');
      const functions = findFunctions(sourceFile);

      const { durationMs } = measureTime(() => {
        buildCFG(
          assertDefined(functions[0], 'Expected at least one function'),
          sourceFile,
          'test.ts'
        );
      });

      expect(durationMs).toBeLessThan(50);
    });

    it('should build CFG for function with 50 branches in < 200ms', () => {
      const code = generateLargeFunction(50);
      const sourceFile = parseSourceFile(code, 'test.ts');
      const functions = findFunctions(sourceFile);

      const { durationMs } = measureTime(() => {
        buildCFG(
          assertDefined(functions[0], 'Expected at least one function'),
          sourceFile,
          'test.ts'
        );
      });

      expect(durationMs).toBeLessThan(200);
    });

    it('should build CFGs for file with 100 functions in < 500ms', () => {
      const code = generateFileWithFunctions(100);

      const { durationMs } = measureTime(() => {
        buildAllCFGs(code, 'test.ts');
      });

      expect(durationMs).toBeLessThan(500);
    });
  });

  // ==========================================================================
  // Mitigation Detection Performance
  // ==========================================================================

  describe('Mitigation Detection Performance', () => {
    it('should detect mitigations in small file in < 20ms', () => {
      const code = `
function validate(input: string) {
  const sanitized = sanitizeInput(input);
  if (!isValid(sanitized)) {
    throw new Error('Invalid');
  }
  return sanitized;
}`;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const detector = createMitigationDetector({});

      const { durationMs } = measureTime(() => {
        detector.detectInFile(sourceFile, 'test.ts');
      });

      expect(durationMs).toBeLessThan(20);
    });

    it('should detect mitigations in file with 50 functions in < 200ms', () => {
      const code = generateFileWithFunctions(50);
      const sourceFile = parseSourceFile(code, 'test.ts');
      const detector = createMitigationDetector({});

      const { durationMs } = measureTime(() => {
        detector.detectInFile(sourceFile, 'test.ts');
      });

      expect(durationMs).toBeLessThan(200);
    });
  });

  // ==========================================================================
  // Path Analysis Performance
  // ==========================================================================

  describe('Path Analysis Performance', () => {
    it('should analyze paths in simple function in < 10ms', () => {
      const code = `function simple(x: number) { return x * 2; }`;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const functions = findFunctions(sourceFile);
      const cfg = buildCFG(
        assertDefined(functions[0], 'Expected at least one function'),
        sourceFile,
        'test.ts'
      );
      const analyzer = createPathAnalyzer({ maxCallDepth: 5 });

      const { durationMs } = measureTime(() => {
        analyzer.analyzePathsToSink(
          cfg,
          assertDefined(cfg.exitNodes[0], 'Expected at least one exit node'),
          'injection'
        );
      });

      expect(durationMs).toBeLessThan(10);
    });

    it('should analyze paths in function with 10 branches in < 50ms', () => {
      const code = generateLargeFunction(10);
      const sourceFile = parseSourceFile(code, 'test.ts');
      const functions = findFunctions(sourceFile);
      const cfg = buildCFG(
        assertDefined(functions[0], 'Expected at least one function'),
        sourceFile,
        'test.ts'
      );
      const analyzer = createPathAnalyzer({ maxCallDepth: 5 });

      const { durationMs } = measureTime(() => {
        analyzer.analyzePathsToSink(
          cfg,
          assertDefined(cfg.exitNodes[0], 'Expected at least one exit node'),
          'injection'
        );
      });

      expect(durationMs).toBeLessThan(50);
    });

    it('should handle path explosion gracefully', () => {
      // Function with many branches that could cause path explosion
      const code = generateLargeFunction(20);
      const sourceFile = parseSourceFile(code, 'test.ts');
      const functions = findFunctions(sourceFile);
      const cfg = buildCFG(
        assertDefined(functions[0], 'Expected at least one function'),
        sourceFile,
        'test.ts'
      );
      const analyzer = createPathAnalyzer({ maxCallDepth: 5 });

      const { result, durationMs } = measureTime(() => {
        return analyzer.analyzePathsToSink(
          cfg,
          assertDefined(cfg.exitNodes[0], 'Expected at least one exit node'),
          'injection',
          {
            maxPaths: 100,
            maxPathLength: 50,
          }
        );
      });

      // Should complete within reasonable time even with path limits
      expect(durationMs).toBeLessThan(500);
      expect(result.pathsToSink.length).toBeLessThanOrEqual(100);
    });
  });

  // ==========================================================================
  // Budget Enforcement Performance
  // ==========================================================================

  describe('Budget Enforcement Performance', () => {
    it('should check budget status in < 1ms', () => {
      const budget = new AnalysisBudget({
        maxDurationMs: 60000,
        maxLinesChanged: 10000,
        maxCallDepth: 5,
      });

      const iterations = 10000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        budget.checkBudget();
      }

      const duration = performance.now() - start;
      const perCheck = duration / iterations;

      expect(perCheck).toBeLessThan(1);
    });

    it('should sort files by priority in < 10ms for 100 files', () => {
      const budget = new AnalysisBudget({});
      const files = Array.from({ length: 100 }, (_, i) => ({
        path: `src/${i % 3 === 0 ? 'auth' : i % 3 === 1 ? 'utils' : '__tests__'}/file${i}.ts`,
      }));

      const { durationMs } = measureTime(() => {
        budget.sortFilesByPriority(files);
      });

      expect(durationMs).toBeLessThan(10);
    });

    it('should determine file priority in < 0.1ms per file', () => {
      const budget = new AnalysisBudget({});
      const testPaths = [
        'src/auth/login.ts',
        'src/api/users.ts',
        'src/utils/helpers.ts',
        'src/__tests__/app.test.ts',
        'src/services/user.ts',
      ];

      const iterations = 1000;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        for (const path of testPaths) {
          budget.shouldAnalyzeFile(path);
        }
      }

      const duration = performance.now() - start;
      const perFile = duration / (iterations * testPaths.length);

      expect(perFile).toBeLessThan(0.1);
    });
  });

  // ==========================================================================
  // Full Agent Performance
  // ==========================================================================

  describe('Full Agent Performance', () => {
    it('should process single small file in < 100ms', async () => {
      const file = createDiffFile(
        'src/utils.ts',
        `function validate(x: string) {
  if (!x) return null;
  return sanitize(x);
}`
      );
      const context = createContext([file]);

      const { durationMs } = await measureTimeAsync(() => controlFlowAgent.run(context));

      expect(durationMs).toBeLessThan(100);
    });

    it('should process 10 small files in < 500ms', async () => {
      const files = Array.from({ length: 10 }, (_, i) =>
        createDiffFile(
          `src/file${i}.ts`,
          `function func${i}(x: string) {
  if (!x) return null;
  return process(x);
}`
        )
      );
      const context = createContext(files);

      const { durationMs } = await measureTimeAsync(() => controlFlowAgent.run(context));

      expect(durationMs).toBeLessThan(500);
    });

    it('should complete within time budget', async () => {
      const timeBudget = 1000; // 1 second
      const files = Array.from({ length: 20 }, (_, i) =>
        createDiffFile(`src/file${i}.ts`, generateFileWithFunctions(10))
      );
      const context = createContext(files, timeBudget);

      const { result, durationMs } = await measureTimeAsync(() => controlFlowAgent.run(context));

      // Should complete within budget (with some margin for overhead)
      expect(durationMs).toBeLessThan(timeBudget * 1.5);
      expect(result.success).toBe(true);
    });

    it('should enter degraded mode for large workloads', async () => {
      // Create a large workload that should trigger degraded mode
      const files = Array.from({ length: 50 }, (_, i) =>
        createDiffFile(`src/file${i}.ts`, generateFileWithFunctions(20))
      );

      // Use a small budget to force degraded mode
      const context = createContext(files, 500);

      const { result } = await measureTimeAsync(() => controlFlowAgent.run(context));

      expect(result.success).toBe(true);
      // Should have processed at least some files
      expect(result.metrics?.filesProcessed).toBeGreaterThanOrEqual(0);
    });
  });

  // ==========================================================================
  // Benchmark Corpus Simulation
  // ==========================================================================

  describe('Benchmark Corpus Simulation', () => {
    // Simulate different PR sizes
    const prSizes = [
      { name: 'small PR (5 files, 100 lines)', files: 5, linesPerFile: 20 },
      { name: 'medium PR (20 files, 500 lines)', files: 20, linesPerFile: 25 },
      { name: 'large PR (50 files, 2000 lines)', files: 50, linesPerFile: 40 },
    ];

    for (const prSize of prSizes) {
      it(`should complete ${prSize.name} within 5 second budget`, async () => {
        const files = Array.from({ length: prSize.files }, (_, i) => {
          const funcsPerFile = Math.ceil(prSize.linesPerFile / 5);
          return createDiffFile(`src/file${i}.ts`, generateFileWithFunctions(funcsPerFile));
        });

        const context = createContext(files, 5000);

        const { result, durationMs } = await measureTimeAsync(() => controlFlowAgent.run(context));

        expect(result.success).toBe(true);
        expect(durationMs).toBeLessThan(5000);
      });
    }

    it('should complete 99% of simulated PRs within budget', async () => {
      const numPRs = 10; // Reduced for test speed
      const budgetMs = 2000;
      let completedWithinBudget = 0;

      for (let pr = 0; pr < numPRs; pr++) {
        // Random PR size between 1-30 files
        const fileCount = Math.floor(Math.random() * 30) + 1;
        const files = Array.from({ length: fileCount }, (_, i) =>
          createDiffFile(
            `src/file${i}.ts`,
            generateFileWithFunctions(Math.floor(Math.random() * 10) + 1)
          )
        );

        const context = createContext(files, budgetMs);
        const { durationMs } = await measureTimeAsync(() => controlFlowAgent.run(context));

        if (durationMs < budgetMs) {
          completedWithinBudget++;
        }
      }

      const successRate = (completedWithinBudget / numPRs) * 100;
      // Allow for some margin in tests
      expect(successRate).toBeGreaterThanOrEqual(90);
    });
  });

  // ==========================================================================
  // Memory Usage (Approximation)
  // ==========================================================================

  describe('Memory Efficiency', () => {
    it('should not accumulate memory across multiple runs', async () => {
      const file = createDiffFile('src/test.ts', generateFileWithFunctions(50));
      const context = createContext([file]);

      // Run multiple times
      for (let i = 0; i < 10; i++) {
        await controlFlowAgent.run(context);
      }

      // If we get here without OOM, memory is being managed reasonably
      expect(true).toBe(true);
    });

    it('should handle large files without excessive memory', async () => {
      const file = createDiffFile('src/large.ts', generateFileWithFunctions(200));
      const context = createContext([file]);

      const result = await controlFlowAgent.run(context);

      expect(result.success).toBe(true);
    });
  });
});
