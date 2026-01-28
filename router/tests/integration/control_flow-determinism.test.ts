/**
 * Determinism Tests: Control Flow Analysis Agent
 *
 * Verifies AG-004: Degraded mode produces deterministic, reproducible results
 * (same input → same output across 100 runs).
 */

import { describe, it, expect } from 'vitest';
import { controlFlowAgent } from '../../src/agents/control_flow/index.js';
import {
  buildCFG,
  parseSourceFile,
  findFunctions,
} from '../../src/agents/control_flow/cfg-builder.js';
import { createMitigationDetector } from '../../src/agents/control_flow/mitigation-detector.js';
import { createPathAnalyzer } from '../../src/agents/control_flow/path-analyzer.js';
import { serializeCFG } from '../../src/agents/control_flow/cfg-types.js';
import type { AgentContext } from '../../src/agents/types.js';
import type { DiffFile } from '../../src/diff.js';

describe('Control Flow Agent Determinism (AG-004)', () => {
  // Number of runs for determinism verification
  const DETERMINISM_RUNS = 100;

  function createContext(files: DiffFile[]): AgentContext {
    return {
      files,
      config: {
        control_flow: {
          enabled: true,
          timeBudgetMs: 60000,
          sizeBudgetLines: 5000,
          maxCallDepth: 5,
        },
      },
      repoPath: '/test/repo',
    };
  }

  function createDiffFile(path: string, patch: string): DiffFile {
    return {
      path,
      patch,
      additions: patch.split('\n').filter((l) => l.startsWith('+')).length,
      deletions: patch.split('\n').filter((l) => l.startsWith('-')).length,
      status: 'modified',
    };
  }

  // ==========================================================================
  // CFG Construction Determinism
  // ==========================================================================

  describe('CFG Construction Determinism', () => {
    const testCases = [
      {
        name: 'simple function',
        code: `function add(a: number, b: number) {
  return a + b;
}`,
      },
      {
        name: 'function with conditionals',
        code: `function checkValue(x: number) {
  if (x > 0) {
    return 'positive';
  } else if (x < 0) {
    return 'negative';
  }
  return 'zero';
}`,
      },
      {
        name: 'function with loops',
        code: `function sumArray(arr: number[]) {
  let sum = 0;
  for (const num of arr) {
    sum += num;
  }
  return sum;
}`,
      },
      {
        name: 'async function with try-catch',
        code: `async function fetchData(url: string) {
  try {
    const response = await fetch(url);
    return await response.json();
  } catch (error) {
    console.error(error);
    throw error;
  }
}`,
      },
      {
        name: 'complex function with multiple control structures',
        code: `function processItems(items: Item[], options: Options) {
  if (!items || items.length === 0) {
    return [];
  }

  const results: Result[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    if (!item) continue;

    switch (item.type) {
      case 'A':
        results.push(processA(item));
        break;
      case 'B':
        results.push(processB(item));
        break;
      default:
        if (options.strict) {
          throw new Error('Unknown type');
        }
    }
  }

  return results;
}`,
      },
    ];

    for (const testCase of testCases) {
      it(`should produce identical CFG for ${testCase.name} across ${DETERMINISM_RUNS} runs`, () => {
        const sourceFile = parseSourceFile(testCase.code, 'test.ts');
        const functions = findFunctions(sourceFile);

        expect(functions.length).toBeGreaterThan(0);

        // Build CFG first time
        const firstCfg = buildCFG(functions[0]!, sourceFile, 'test.ts');
        const firstSerialized = JSON.stringify(serializeCFG(firstCfg));

        // Verify same output across multiple runs
        for (let i = 0; i < DETERMINISM_RUNS; i++) {
          const cfg = buildCFG(functions[0]!, sourceFile, 'test.ts');
          const serialized = JSON.stringify(serializeCFG(cfg));

          expect(serialized).toBe(firstSerialized);
        }
      });
    }
  });

  // ==========================================================================
  // Mitigation Detection Determinism
  // ==========================================================================

  describe('Mitigation Detection Determinism', () => {
    const testCases = [
      {
        name: 'input validation',
        code: `function handleInput(input: unknown) {
  const validated = schema.parse(input);
  return process(validated);
}`,
      },
      {
        name: 'null checks',
        code: `function safeAccess(obj: Obj | null) {
  if (obj === null) return null;
  if (obj.value === undefined) return undefined;
  return obj.value;
}`,
      },
      {
        name: 'authentication check',
        code: `function protectedAction(user: User) {
  if (!isAuthenticated(user)) {
    throw new Error('Unauthorized');
  }
  return performAction(user);
}`,
      },
      {
        name: 'multiple mitigations',
        code: `function secureProcess(input: string, user: User) {
  if (!isAuthenticated(user)) {
    throw new AuthError();
  }
  const sanitized = sanitizeInput(input);
  const validated = validator.validate(sanitized);
  return process(validated);
}`,
      },
    ];

    for (const testCase of testCases) {
      it(`should produce identical mitigations for ${testCase.name} across ${DETERMINISM_RUNS} runs`, () => {
        const sourceFile = parseSourceFile(testCase.code, 'test.ts');
        const detector = createMitigationDetector({});

        // Detect mitigations first time
        const firstMitigations = detector.detectInFile(sourceFile, 'test.ts');
        const firstSerialized = JSON.stringify(firstMitigations);

        // Verify same output across multiple runs
        for (let i = 0; i < DETERMINISM_RUNS; i++) {
          const newDetector = createMitigationDetector({});
          const mitigations = newDetector.detectInFile(sourceFile, 'test.ts');
          const serialized = JSON.stringify(mitigations);

          expect(serialized).toBe(firstSerialized);
        }
      });
    }
  });

  // ==========================================================================
  // Path Analysis Determinism
  // ==========================================================================

  describe('Path Analysis Determinism', () => {
    const testCases = [
      {
        name: 'linear path',
        code: `function linear(x: number) {
  const a = x + 1;
  const b = a * 2;
  return b;
}`,
      },
      {
        name: 'branching paths',
        code: `function branch(x: number) {
  if (x > 0) {
    return x * 2;
  } else {
    return x * -1;
  }
}`,
      },
      {
        name: 'loop paths',
        code: `function loop(n: number) {
  let result = 0;
  for (let i = 0; i < n; i++) {
    result += i;
  }
  return result;
}`,
      },
    ];

    for (const testCase of testCases) {
      it(`should produce identical path analysis for ${testCase.name} across ${DETERMINISM_RUNS} runs`, () => {
        const sourceFile = parseSourceFile(testCase.code, 'test.ts');
        const functions = findFunctions(sourceFile);
        const cfg = buildCFG(functions[0]!, sourceFile, 'test.ts');
        const analyzer = createPathAnalyzer({ maxCallDepth: 5 });

        // Get exit node as sink
        const sinkNodeId = cfg.exitNodes[0]!;

        // Analyze first time
        const firstResult = analyzer.analyzePathsToSink(cfg, sinkNodeId, 'injection');
        const firstSerialized = JSON.stringify({
          status: firstResult.status,
          coveragePercent: firstResult.coveragePercent,
          pathCount: firstResult.pathsToSink.length,
          mitigatedCount: firstResult.mitigatedPaths.length,
          unmitigatedCount: firstResult.unmitigatedPaths.length,
        });

        // Verify same output across multiple runs
        for (let i = 0; i < DETERMINISM_RUNS; i++) {
          const newAnalyzer = createPathAnalyzer({ maxCallDepth: 5 });
          const result = newAnalyzer.analyzePathsToSink(cfg, sinkNodeId, 'injection');
          const serialized = JSON.stringify({
            status: result.status,
            coveragePercent: result.coveragePercent,
            pathCount: result.pathsToSink.length,
            mitigatedCount: result.mitigatedPaths.length,
            unmitigatedCount: result.unmitigatedPaths.length,
          });

          expect(serialized).toBe(firstSerialized);
        }
      });
    }
  });

  // ==========================================================================
  // Full Agent Execution Determinism
  // ==========================================================================

  describe('Full Agent Execution Determinism', () => {
    const testFiles = [
      {
        name: 'simple module',
        path: 'src/utils.ts',
        code: `export function add(a: number, b: number) {
  return a + b;
}

export function multiply(a: number, b: number) {
  return a * b;
}`,
      },
      {
        name: 'service with validation',
        path: 'src/services/user.ts',
        code: `export class UserService {
  async getUser(id: string) {
    const validated = validateId(id);
    if (!validated) {
      throw new Error('Invalid ID');
    }
    return this.repo.find(validated);
  }

  async updateUser(id: string, data: UpdateData) {
    if (!isAuthenticated()) {
      throw new UnauthorizedError();
    }
    const sanitized = sanitize(data);
    return this.repo.update(id, sanitized);
  }
}`,
      },
      {
        name: 'API handler',
        path: 'src/api/handler.ts',
        code: `export async function handleRequest(req: Request) {
  const { body } = req;

  if (!body) {
    return { status: 400, error: 'No body' };
  }

  try {
    const parsed = schema.parse(body);
    const result = await processData(parsed);
    return { status: 200, data: result };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { status: 400, error: error.message };
    }
    throw error;
  }
}`,
      },
    ];

    for (const testFile of testFiles) {
      it(`should produce identical results for ${testFile.name} across ${DETERMINISM_RUNS} runs`, async () => {
        const file = createDiffFile(testFile.path, testFile.code);
        const context = createContext([file]);

        // Run first time
        const firstResult = await controlFlowAgent.run(context);
        const firstSerialized = JSON.stringify({
          success: firstResult.success,
          findingCount: firstResult.findings.length,
          findings: firstResult.findings.map((f) => ({
            severity: f.severity,
            message: f.message,
            file: f.file,
            line: f.line,
          })),
        });

        // Verify same output across multiple runs
        for (let i = 0; i < DETERMINISM_RUNS; i++) {
          const result = await controlFlowAgent.run(context);
          const serialized = JSON.stringify({
            success: result.success,
            findingCount: result.findings.length,
            findings: result.findings.map((f) => ({
              severity: f.severity,
              message: f.message,
              file: f.file,
              line: f.line,
            })),
          });

          expect(serialized).toBe(firstSerialized);
        }
      });
    }
  });

  // ==========================================================================
  // Edge Cases Determinism
  // ==========================================================================

  describe('Edge Cases Determinism', () => {
    it('should handle empty input deterministically', async () => {
      const context = createContext([]);

      const firstResult = await controlFlowAgent.run(context);
      const firstSerialized = JSON.stringify({
        success: firstResult.success,
        findingCount: firstResult.findings.length,
      });

      for (let i = 0; i < DETERMINISM_RUNS; i++) {
        const result = await controlFlowAgent.run(context);
        const serialized = JSON.stringify({
          success: result.success,
          findingCount: result.findings.length,
        });
        expect(serialized).toBe(firstSerialized);
      }
    });

    it('should handle multiple files deterministically', async () => {
      const files = [
        createDiffFile('src/a.ts', 'function a() { return 1; }'),
        createDiffFile('src/b.ts', 'function b() { return 2; }'),
        createDiffFile('src/c.ts', 'function c() { return 3; }'),
      ];
      const context = createContext(files);

      const firstResult = await controlFlowAgent.run(context);
      const firstSerialized = JSON.stringify({
        success: firstResult.success,
        findingCount: firstResult.findings.length,
      });

      for (let i = 0; i < DETERMINISM_RUNS; i++) {
        const result = await controlFlowAgent.run(context);
        const serialized = JSON.stringify({
          success: result.success,
          findingCount: result.findings.length,
        });
        expect(serialized).toBe(firstSerialized);
      }
    });

    it('should handle syntax errors deterministically', async () => {
      const file = createDiffFile('src/broken.ts', 'function broken( { invalid }');
      const context = createContext([file]);

      const firstResult = await controlFlowAgent.run(context);

      for (let i = 0; i < DETERMINISM_RUNS; i++) {
        const result = await controlFlowAgent.run(context);
        expect(result.success).toBe(firstResult.success);
      }
    });
  });
});
