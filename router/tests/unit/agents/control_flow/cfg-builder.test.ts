/**
 * CFG Builder Unit Tests
 *
 * Tests control flow graph construction for all TypeScript/JavaScript
 * control structures per FR-001 and FR-002.
 */

import { describe, it, expect } from 'vitest';
import {
  buildAllCFGs,
  parseSourceFile,
  findFunctions,
  buildCFG,
} from '../../../../src/agents/control_flow/cfg-builder.js';
import type { ControlFlowGraphRuntime } from '../../../../src/agents/control_flow/cfg-types.js';

describe('CFG Builder', () => {
  describe('parseSourceFile', () => {
    it('should parse TypeScript file', () => {
      const content = `function hello(): void { console.log("hello"); }`;
      const sourceFile = parseSourceFile(content, 'test.ts');
      expect(sourceFile).toBeDefined();
      expect(sourceFile.fileName).toBe('test.ts');
    });

    it('should parse JavaScript file', () => {
      const content = `function hello() { console.log("hello"); }`;
      const sourceFile = parseSourceFile(content, 'test.js');
      expect(sourceFile).toBeDefined();
    });

    it('should parse TSX file', () => {
      const content = `function Component() { return <div>Hello</div>; }`;
      const sourceFile = parseSourceFile(content, 'test.tsx');
      expect(sourceFile).toBeDefined();
    });
  });

  describe('findFunctions', () => {
    it('should find function declarations', () => {
      const content = `
        function foo() {}
        function bar() {}
      `;
      const sourceFile = parseSourceFile(content, 'test.ts');
      const functions = findFunctions(sourceFile);
      expect(functions).toHaveLength(2);
    });

    it('should find arrow functions', () => {
      const content = `
        const foo = () => {};
        const bar = (x: number) => x * 2;
      `;
      const sourceFile = parseSourceFile(content, 'test.ts');
      const functions = findFunctions(sourceFile);
      expect(functions).toHaveLength(2);
    });

    it('should find method declarations', () => {
      const content = `
        class Foo {
          bar() {}
          baz() {}
        }
      `;
      const sourceFile = parseSourceFile(content, 'test.ts');
      const functions = findFunctions(sourceFile);
      expect(functions).toHaveLength(2);
    });

    it('should find nested functions', () => {
      const content = `
        function outer() {
          function inner() {}
        }
      `;
      const sourceFile = parseSourceFile(content, 'test.ts');
      const functions = findFunctions(sourceFile);
      expect(functions).toHaveLength(2);
    });
  });

  describe('buildCFG - Basic Blocks', () => {
    it('should create entry and exit nodes', () => {
      const content = `function empty() {}`;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs).toHaveLength(1);

      const cfg = cfgs[0];
      expect(cfg.entryNode).toBeDefined();
      expect(cfg.exitNodes.length).toBeGreaterThan(0);
    });

    it('should handle sequential statements', () => {
      const content = `
        function seq() {
          const a = 1;
          const b = 2;
          const c = 3;
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have entry, basic blocks, and exit
      expect(cfg.nodes.size).toBeGreaterThan(2);
      expect(cfg.edges.length).toBeGreaterThan(0);
    });

    it('should track call expressions', () => {
      const content = `
        function withCalls() {
          console.log("hello");
          fetch("/api");
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      expect(cfg.callSites.length).toBe(2);
      expect(cfg.callSites.map((cs) => cs.calleeName)).toContain('log');
      expect(cfg.callSites.map((cs) => cs.calleeName)).toContain('fetch');
    });
  });

  describe('buildCFG - Conditionals', () => {
    it('should handle if statement', () => {
      const content = `
        function withIf(x: number) {
          if (x > 0) {
            console.log("positive");
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have branch and merge nodes
      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('branch');
      expect(nodeTypes).toContain('merge');

      // Should have true and false branch edges
      const branchEdges = cfg.edges.filter(
        (e) => e.type === 'branch_true' || e.type === 'branch_false'
      );
      expect(branchEdges.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle if-else statement', () => {
      const content = `
        function withIfElse(x: number) {
          if (x > 0) {
            console.log("positive");
          } else {
            console.log("non-positive");
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Both branches should have nodes
      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('branch');

      // Should merge back
      expect(nodeTypes).toContain('merge');
    });

    it('should handle nested if statements', () => {
      const content = `
        function nestedIf(x: number, y: number) {
          if (x > 0) {
            if (y > 0) {
              console.log("both positive");
            }
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have multiple branch nodes
      const branchNodes = Array.from(cfg.nodes.values()).filter((n) => n.type === 'branch');
      expect(branchNodes.length).toBe(2);
    });

    it('should handle switch statement', () => {
      const content = `
        function withSwitch(x: string) {
          switch (x) {
            case "a":
              console.log("a");
              break;
            case "b":
              console.log("b");
              break;
            default:
              console.log("other");
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have branch node for switch
      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('branch');
    });
  });

  describe('buildCFG - Loops', () => {
    it('should handle for loop', () => {
      const content = `
        function withFor() {
          for (let i = 0; i < 10; i++) {
            console.log(i);
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have loop header
      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('loop_header');
      expect(nodeTypes).toContain('loop_body');

      // Should have loop back edge
      const loopBackEdges = cfg.edges.filter((e) => e.type === 'loop_back');
      expect(loopBackEdges.length).toBeGreaterThan(0);

      // Should have loop exit edge
      const loopExitEdges = cfg.edges.filter((e) => e.type === 'loop_exit');
      expect(loopExitEdges.length).toBeGreaterThan(0);
    });

    it('should handle while loop', () => {
      const content = `
        function withWhile(x: number) {
          while (x > 0) {
            x--;
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('loop_header');
    });

    it('should handle do-while loop', () => {
      const content = `
        function withDoWhile(x: number) {
          do {
            x--;
          } while (x > 0);
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('loop_header');
      expect(nodeTypes).toContain('loop_body');
    });

    it('should handle for-of loop', () => {
      const content = `
        function withForOf(items: string[]) {
          for (const item of items) {
            console.log(item);
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('loop_header');
    });

    it('should handle for-in loop', () => {
      const content = `
        function withForIn(obj: Record<string, number>) {
          for (const key in obj) {
            console.log(key);
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('loop_header');
    });
  });

  describe('buildCFG - Try/Catch/Finally', () => {
    it('should handle try-catch', () => {
      const content = `
        function withTryCatch() {
          try {
            riskyOperation();
          } catch (e) {
            handleError(e);
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have exception edge
      const exceptionEdges = cfg.edges.filter((e) => e.type === 'exception');
      expect(exceptionEdges.length).toBeGreaterThan(0);
    });

    it('should handle try-catch-finally', () => {
      const content = `
        function withFinally() {
          try {
            riskyOperation();
          } catch (e) {
            handleError(e);
          } finally {
            cleanup();
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have finally node (basic type)
      expect(cfg.nodes.size).toBeGreaterThan(3);

      // Should have paths through try, catch, and finally
      expect(cfg.edges.length).toBeGreaterThan(3);
    });
  });

  describe('buildCFG - Early Returns and Throws', () => {
    it('should handle return statement', () => {
      const content = `
        function earlyReturn(x: number): number {
          if (x < 0) {
            return -1;
          }
          return x * 2;
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have multiple exit nodes
      expect(cfg.exitNodes.length).toBeGreaterThanOrEqual(2);

      // Should have return edges
      const returnEdges = cfg.edges.filter((e) => e.type === 'return');
      expect(returnEdges.length).toBeGreaterThanOrEqual(1);
    });

    it('should handle throw statement', () => {
      const content = `
        function throwsError(x: number) {
          if (x < 0) {
            throw new Error("negative");
          }
          return x;
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Should have throw node
      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes).toContain('throw');
    });

    it('should handle break statement', () => {
      const content = `
        function withBreak() {
          for (let i = 0; i < 10; i++) {
            if (i === 5) {
              break;
            }
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Break should connect to loop exit (merge node)
      // Check that we have the expected structure
      expect(cfg.nodes.size).toBeGreaterThan(3);
    });

    it('should handle continue statement', () => {
      const content = `
        function withContinue() {
          for (let i = 0; i < 10; i++) {
            if (i % 2 === 0) {
              continue;
            }
            console.log(i);
          }
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Continue should have loop_back edge
      const loopBackEdges = cfg.edges.filter((e) => e.type === 'loop_back');
      expect(loopBackEdges.length).toBeGreaterThan(0);
    });
  });

  describe('buildCFG - Arrow Functions', () => {
    it('should handle arrow function with expression body', () => {
      const content = `const double = (x: number) => x * 2;`;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs).toHaveLength(1);

      const cfg = cfgs[0];
      expect(cfg.functionName).toBe('double');
      expect(cfg.exitNodes.length).toBeGreaterThan(0);
    });

    it('should handle arrow function with block body', () => {
      const content = `
        const process = (x: number) => {
          if (x > 0) {
            return x * 2;
          }
          return 0;
        };
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs).toHaveLength(1);

      const cfg = cfgs[0];
      expect(cfg.functionName).toBe('process');
    });
  });

  describe('buildCFG - Function metadata', () => {
    it('should capture function name', () => {
      const content = `function myFunction() {}`;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs[0].functionName).toBe('myFunction');
    });

    it('should capture file path', () => {
      const content = `function foo() {}`;
      const cfgs = buildAllCFGs(content, 'src/utils/helper.ts');
      expect(cfgs[0].filePath).toBe('src/utils/helper.ts');
    });

    it('should capture line numbers', () => {
      const content = `
        function foo() {
          console.log("hello");
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs[0].startLine).toBeGreaterThan(0);
      expect(cfgs[0].endLine).toBeGreaterThan(cfgs[0].startLine);
    });

    it('should generate unique function ID', () => {
      const content = `function foo() {}`;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs[0].functionId).toMatch(/test\.ts:\d+:foo/);
    });
  });

  describe('buildCFG - Complex scenarios', () => {
    it('should handle multiple nested control structures', () => {
      const content = `
        function complex(x: number, y: number) {
          if (x > 0) {
            for (let i = 0; i < y; i++) {
              if (i % 2 === 0) {
                try {
                  riskyOp(i);
                } catch (e) {
                  if (e instanceof Error) {
                    throw e;
                  }
                }
              }
            }
          }
          return x + y;
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      expect(cfgs).toHaveLength(1);

      const cfg = cfgs[0];
      // Should have multiple branch, loop, and merge nodes
      const nodeTypes = Array.from(cfg.nodes.values()).map((n) => n.type);
      expect(nodeTypes.filter((t) => t === 'branch').length).toBeGreaterThan(1);
      expect(nodeTypes).toContain('loop_header');
    });

    it('should handle guard clauses', () => {
      const content = `
        function guardedFunction(x: number | null) {
          if (x === null) {
            return;
          }
          if (x < 0) {
            throw new Error("negative");
          }
          console.log(x);
        }
      `;
      const cfgs = buildAllCFGs(content, 'test.ts');
      const cfg = cfgs[0];

      // Multiple exit points from guards
      expect(cfg.exitNodes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
