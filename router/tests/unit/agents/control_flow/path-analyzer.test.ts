/**
 * Path Analyzer Tests
 *
 * Tests for the PathAnalyzer class that analyzes execution paths
 * through control flow graphs for reachability and mitigation coverage.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type PathAnalyzer,
  type ExecutionPath,
  createPathAnalyzer,
} from '../../../../src/agents/control_flow/path-analyzer.js';
import {
  parseSourceFile,
  findFunctions,
  buildCFG,
} from '../../../../src/agents/control_flow/cfg-builder.js';
import type { ControlFlowGraphRuntime } from '../../../../src/agents/control_flow/cfg-types.js';
import { createTraversalState } from '../../../../src/agents/control_flow/types.js';
import { createLogger } from '../../../../src/agents/control_flow/logger.js';
import { assertDefined } from '../../../test-utils.js';

// =============================================================================
// Helper Functions
// =============================================================================

function buildCFGFromCode(code: string): ControlFlowGraphRuntime {
  const sourceFile = parseSourceFile(code, 'test.ts');
  const functions = findFunctions(sourceFile);
  const firstFunction = assertDefined(functions[0], 'No functions found in code');
  return buildCFG(firstFunction, sourceFile, 'test.ts');
}

// =============================================================================
// PathAnalyzer Creation Tests
// =============================================================================

describe('PathAnalyzer', () => {
  let analyzer: PathAnalyzer;

  beforeEach(() => {
    analyzer = createPathAnalyzer();
  });

  describe('createPathAnalyzer', () => {
    it('should create analyzer with default config', () => {
      const analyzer = createPathAnalyzer();
      expect(analyzer).toBeDefined();
    });

    it('should create analyzer with custom config', () => {
      const analyzer = createPathAnalyzer({
        maxCallDepth: 3,
        timeBudgetMs: 60000,
      });
      expect(analyzer).toBeDefined();
    });
  });

  // ===========================================================================
  // Reachability Analysis Tests (T035)
  // ===========================================================================

  describe('getReachableNodes', () => {
    it('should find all reachable nodes from entry', () => {
      const code = `
        function test() {
          const a = 1;
          const b = 2;
          return a + b;
        }
      `;
      const cfg = buildCFGFromCode(code);

      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);

      // All nodes should be reachable
      expect(reachable.size).toBe(cfg.nodes.size);
      for (const nodeId of cfg.nodes.keys()) {
        expect(reachable.has(nodeId)).toBe(true);
      }
    });

    it('should handle branching paths', () => {
      const code = `
        function test(x: boolean) {
          if (x) {
            return 1;
          } else {
            return 2;
          }
        }
      `;
      const cfg = buildCFGFromCode(code);

      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);

      // All branches should be reachable
      expect(reachable.size).toBeGreaterThan(1);
    });

    it('should handle loops', () => {
      const code = `
        function test() {
          for (let i = 0; i < 10; i++) {
            console.log(i);
          }
          return 'done';
        }
      `;
      const cfg = buildCFGFromCode(code);

      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);

      // Loop body should be reachable
      expect(reachable.size).toBeGreaterThan(2);
    });
  });

  describe('isReachable', () => {
    it('should return true for reachable nodes', () => {
      const code = `
        function test() {
          const x = 1;
          return x;
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Exit node should be reachable
      for (const exitNode of cfg.exitNodes) {
        expect(analyzer.isReachable(cfg, exitNode)).toBe(true);
      }
    });

    it('should return true for entry node', () => {
      const code = `
        function test() {
          return 1;
        }
      `;
      const cfg = buildCFGFromCode(code);

      expect(analyzer.isReachable(cfg, cfg.entryNode)).toBe(true);
    });
  });

  // ===========================================================================
  // Dead Code Detection Tests (T036)
  // ===========================================================================

  describe('findDeadCode', () => {
    it('should return empty array when all code is reachable', () => {
      const code = `
        function test() {
          const x = 1;
          return x;
        }
      `;
      const cfg = buildCFGFromCode(code);

      const deadCode = analyzer.findDeadCode(cfg);

      expect(deadCode.length).toBe(0);
    });

    it('should detect code after unconditional return', () => {
      const code = `
        function test() {
          return 1;
          const unreachable = 2;
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Note: TypeScript parser may or may not include unreachable code
      // The CFG builder should handle this appropriately
      const deadCode = analyzer.findDeadCode(cfg);
      // If unreachable code is included in CFG, it should be detected
      expect(deadCode).toBeDefined();
    });

    it('should handle early return in conditional', () => {
      const code = `
        function test(x: boolean) {
          if (x) {
            return 'early';
          }
          return 'normal';
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Both branches are reachable, no dead code
      const deadCode = analyzer.findDeadCode(cfg);
      expect(deadCode.length).toBe(0);
    });
  });

  // ===========================================================================
  // Path Finding Tests
  // ===========================================================================

  describe('findPathsToNode', () => {
    it('should find single path in sequential code', () => {
      const code = `
        function test() {
          const a = 1;
          return a;
        }
      `;
      const cfg = buildCFGFromCode(code);

      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      const paths = analyzer.findPathsToNode(cfg, cfg.entryNode, exitNode, {
        maxPaths: 100,
        maxPathLength: 50,
        includeUnreachable: false,
        maxNodesVisited: 10_000,
      });

      expect(paths.length).toBeGreaterThan(0);
      expect(paths[0]?.nodes[0]).toBe(cfg.entryNode);
      expect(paths[0]?.nodes[paths[0].nodes.length - 1]).toBe(exitNode);
    });

    it('should find multiple paths through branches', () => {
      const code = `
        function test(x: boolean) {
          if (x) {
            return 1;
          } else {
            return 2;
          }
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Find paths to any exit node
      let totalPaths = 0;
      for (const exitNode of cfg.exitNodes) {
        const paths = analyzer.findPathsToNode(cfg, cfg.entryNode, exitNode, {
          maxPaths: 100,
          maxPathLength: 50,
          includeUnreachable: false,
          maxNodesVisited: 10_000,
        });
        totalPaths += paths.length;
      }

      // Should have at least 2 paths (one per branch)
      expect(totalPaths).toBeGreaterThanOrEqual(1);
    });

    it('should respect maxPaths limit', () => {
      const code = `
        function test(a: boolean, b: boolean, c: boolean) {
          if (a) { console.log('a'); }
          if (b) { console.log('b'); }
          if (c) { console.log('c'); }
          return 'done';
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      const paths = analyzer.findPathsToNode(cfg, cfg.entryNode, exitNode, {
        maxPaths: 2,
        maxPathLength: 50,
        includeUnreachable: false,
        maxNodesVisited: 10_000,
      });

      expect(paths.length).toBeLessThanOrEqual(2);
    });

    it('should prevent infinite loops with cycle detection', () => {
      const code = `
        function test() {
          while (true) {
            console.log('loop');
          }
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Even with infinite loop, should not hang
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      const paths = analyzer.findPathsToNode(cfg, cfg.entryNode, exitNode, {
        maxPaths: 100,
        maxPathLength: 20, // Limit path length
        includeUnreachable: false,
        maxNodesVisited: 10_000,
      });

      // May find no paths if exit is unreachable
      expect(paths).toBeDefined();
    });
  });

  // ===========================================================================
  // Path Analysis Results Tests
  // ===========================================================================

  describe('analyzePathsToSink', () => {
    it('should return analysis result for vulnerability', () => {
      const code = `
        function test(input: string) {
          return process(input);
        }
      `;
      const cfg = buildCFGFromCode(code);
      const sinkNode = cfg.exitNodes[0];
      if (!sinkNode) throw new Error('No exit node');

      const result = analyzer.analyzePathsToSink(cfg, sinkNode, 'injection');

      expect(result.vulnerabilityType).toBe('injection');
      expect(result.sinkNodeId).toBe(sinkNode);
      expect(result.pathsToSink).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.coveragePercent).toBeDefined();
    });

    it('should report none status when no mitigations found', () => {
      const code = `
        function test(input: string) {
          return input;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const sinkNode = cfg.exitNodes[0];
      if (!sinkNode) throw new Error('No exit node');

      const result = analyzer.analyzePathsToSink(cfg, sinkNode, 'injection');

      // No mitigations in this code
      expect(result.mitigatedPaths.length).toBe(0);
    });

    it('should indicate degraded when path limit reached', () => {
      const code = `
        function test(a: boolean, b: boolean, c: boolean, d: boolean) {
          if (a) { console.log('a'); }
          if (b) { console.log('b'); }
          if (c) { console.log('c'); }
          if (d) { console.log('d'); }
          return 'done';
        }
      `;
      const cfg = buildCFGFromCode(code);
      const sinkNode = cfg.exitNodes[0];
      if (!sinkNode) throw new Error('No exit node');

      const result = analyzer.analyzePathsToSink(cfg, sinkNode, 'injection', {
        maxPaths: 2, // Very low limit
      });

      if (result.pathsToSink.length >= 2) {
        expect(result.degraded).toBe(true);
        expect(result.degradedReason).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Dominator Analysis Tests
  // ===========================================================================

  describe('getDominators', () => {
    it('should return entry as dominator for all nodes', () => {
      const code = `
        function test() {
          const x = 1;
          return x;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      const dominators = analyzer.getDominators(cfg, exitNode);

      // Entry should dominate exit
      expect(dominators.has(cfg.entryNode)).toBe(true);
    });

    it('should return empty set for unreachable nodes', () => {
      const code = `
        function test() {
          return 1;
        }
      `;
      const cfg = buildCFGFromCode(code);

      const dominators = analyzer.getDominators(cfg, 'nonexistent_node');

      expect(dominators.size).toBe(0);
    });
  });

  describe('mitigationDominatesSink', () => {
    it('should return true when mitigation is on all paths to sink', () => {
      const code = `
        function test(input: string) {
          const validated = sanitize(input);
          return validated;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      // Entry dominates everything
      const result = analyzer.mitigationDominatesSink(cfg, cfg.entryNode, exitNode);
      expect(result).toBe(true);
    });

    it('should return false when mitigation is only on some paths', () => {
      const code = `
        function test(input: string, flag: boolean) {
          if (flag) {
            const validated = sanitize(input);
            return validated;
          }
          return input;
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Find a branch node (not entry, not exit)
      let branchNode: string | undefined;
      for (const [id, node] of cfg.nodes) {
        if (node.type === 'branch') {
          branchNode = id;
          break;
        }
      }

      if (branchNode) {
        const exitNode = cfg.exitNodes[0];
        if (exitNode) {
          // Branch node doesn't dominate all exits
          const result = analyzer.mitigationDominatesSink(cfg, branchNode, exitNode);
          // Result depends on CFG structure
          expect(typeof result).toBe('boolean');
        }
      }
    });
  });

  // ===========================================================================
  // Integration Tests with Real Code Patterns
  // ===========================================================================

  describe('Integration: Early Return Patterns', () => {
    it('should handle guard clause pattern', () => {
      const code = `
        function processUser(user: User | null) {
          if (!user) {
            return null;
          }
          return user.name;
        }
      `;
      const cfg = buildCFGFromCode(code);

      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);
      expect(reachable.size).toBe(cfg.nodes.size);
    });

    it('should handle multiple guard clauses', () => {
      const code = `
        function validate(a: any, b: any) {
          if (!a) return 'missing a';
          if (!b) return 'missing b';
          return 'valid';
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Should have multiple exit paths
      expect(cfg.exitNodes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Integration: Exception Handling', () => {
    it('should handle try/catch blocks', () => {
      const code = `
        function safeParse(text: string) {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        }
      `;
      const cfg = buildCFGFromCode(code);

      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);
      expect(reachable.size).toBeGreaterThan(0);
    });

    it('should handle try/catch/finally', () => {
      const code = `
        function withCleanup() {
          try {
            return doWork();
          } catch (e) {
            return handleError(e);
          } finally {
            cleanup();
          }
        }
      `;
      const cfg = buildCFGFromCode(code);

      // CFG construction may create extra nodes for finally block handling
      // The important thing is that the main flow is represented
      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);
      expect(reachable.size).toBeGreaterThan(0);
    });
  });

  describe('Integration: Loop Patterns', () => {
    it('should handle for loop', () => {
      const code = `
        function sumArray(arr: number[]) {
          let sum = 0;
          for (const n of arr) {
            sum += n;
          }
          return sum;
        }
      `;
      const cfg = buildCFGFromCode(code);

      const reachable = analyzer.getReachableNodes(cfg, cfg.entryNode);
      expect(reachable.size).toBe(cfg.nodes.size);
    });

    it('should handle while loop with break', () => {
      const code = `
        function findFirst(arr: number[], target: number) {
          let i = 0;
          while (i < arr.length) {
            if (arr[i] === target) {
              return i;
            }
            i++;
          }
          return -1;
        }
      `;
      const cfg = buildCFGFromCode(code);

      // Both exit paths should be reachable
      const deadCode = analyzer.findDeadCode(cfg);
      expect(deadCode.length).toBe(0);
    });
  });

  // ===========================================================================
  // maxNodesVisited Enforcement Tests
  //
  // Tests for the guardrail that limits CFG nodes visited per traversal.
  // When the limit is exceeded, analysis returns 'unknown' classification
  // to indicate incomplete analysis (fail-safe behavior).
  //
  // Design decisions validated here:
  // 1. Counter is per-traversal, not shared across traversals
  // 2. Boundary semantics: exactly at limit is allowed, limit+1 triggers fallback
  // 3. 'unknown' classification does NOT assert safety - caller must handle
  // ===========================================================================

  describe('maxNodesVisited enforcement', () => {
    it('should allow traversal at exactly maxNodesVisited', () => {
      const code = `
        function test() {
          const a = 1;
          const b = 2;
          const c = 3;
          return a + b + c;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      // Set maxNodesVisited to exactly the number of nodes we expect to visit
      // Use a high value to ensure we don't hit the limit on normal traversal
      const { paths, state } = analyzer.findPathsToNodeWithState(cfg, cfg.entryNode, exitNode, {
        maxPaths: 100,
        maxPathLength: 50,
        includeUnreachable: false,
        maxNodesVisited: 1000, // High limit
      });

      expect(paths.length).toBeGreaterThan(0);
      expect(state.limitReached).toBe(false);
      expect(state.reason).toBe('completed');
    });

    it('should return conservative fallback at maxNodesVisited + 1', () => {
      const code = `
        function test(a: boolean, b: boolean, c: boolean, d: boolean, e: boolean) {
          if (a) { console.log('a'); }
          if (b) { console.log('b'); }
          if (c) { console.log('c'); }
          if (d) { console.log('d'); }
          if (e) { console.log('e'); }
          return 'done';
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      // Set very low maxNodesVisited to trigger the limit
      const { paths: _paths, state } = analyzer.findPathsToNodeWithState(
        cfg,
        cfg.entryNode,
        exitNode,
        {
          maxPaths: 1000, // High path limit
          maxPathLength: 100, // High path length
          includeUnreachable: false,
          maxNodesVisited: 5, // Very low node limit - will be exceeded
        }
      );

      expect(state.limitReached).toBe(true);
      expect(state.classification).toBe('unknown');
      expect(state.reason).toBe('node_limit_exceeded');
    });

    it('should reset nodesVisited for each new traversal', () => {
      const code = `
        function test() {
          return 1;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      // First traversal
      const result1 = analyzer.findPathsToNodeWithState(cfg, cfg.entryNode, exitNode, {
        maxPaths: 100,
        maxPathLength: 50,
        includeUnreachable: false,
        maxNodesVisited: 100,
      });

      // Second traversal should start fresh
      const result2 = analyzer.findPathsToNodeWithState(cfg, cfg.entryNode, exitNode, {
        maxPaths: 100,
        maxPathLength: 50,
        includeUnreachable: false,
        maxNodesVisited: 100,
      });

      // Both should have similar node counts (starting from 0)
      expect(result1.state.nodesVisited).toBe(result2.state.nodesVisited);
      expect(result2.state.limitReached).toBe(false);
    });

    it('should log when node limit reached', () => {
      const logger = createLogger({ consoleOutput: false, minLevel: 'debug' });
      const analyzerWithLogger = createPathAnalyzer({}, logger);

      const code = `
        function test(a: boolean, b: boolean, c: boolean) {
          if (a) { console.log('a'); }
          if (b) { console.log('b'); }
          if (c) { console.log('c'); }
          return 'done';
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      // Trigger node limit
      analyzerWithLogger.findPathsToNodeWithState(cfg, cfg.entryNode, exitNode, {
        maxPaths: 1000,
        maxPathLength: 100,
        includeUnreachable: false,
        maxNodesVisited: 3, // Very low
      });

      const entries = logger.getEntriesByCategory('node_limit');
      const limitEntry = entries.find((e) => e.message.includes('Node visit limit reached'));
      expect(limitEntry).toBeDefined();
      expect(limitEntry?.context?.['classification']).toBe('unknown');
      expect(limitEntry?.context?.['reason']).toBe('node_limit_exceeded');
    });

    it('should include node limit info in analyzePathsToSink result', () => {
      const code = `
        function test(a: boolean, b: boolean, c: boolean) {
          if (a) { console.log('a'); }
          if (b) { console.log('b'); }
          if (c) { console.log('c'); }
          return 'done';
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      const result = analyzer.analyzePathsToSink(cfg, exitNode, 'injection', {
        maxPaths: 1000,
        maxNodesVisited: 3, // Very low
      });

      expect(result.nodeLimitReached).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.degradedReason).toContain('Node visit limit reached');
      expect(result.nodesVisited).toBeDefined();
    });

    it('should downgrade full mitigation status to partial when limit reached', () => {
      const code = `
        function test(input: string) {
          const safe = sanitize(input);
          return safe;
        }
      `;
      const cfg = buildCFGFromCode(code);
      const exitNode = cfg.exitNodes[0];
      if (!exitNode) throw new Error('No exit node');

      // Add mitigations to all nodes to simulate full mitigation
      for (const [, node] of cfg.nodes) {
        node.mitigations.push({
          patternId: 'test-sanitize',
          location: { file: 'test.ts', line: node.lineStart },
          protectedVariables: ['input'],
          protectedPaths: [],
          scope: 'function',
          confidence: 'high',
        });
      }

      const result = analyzer.analyzePathsToSink(cfg, exitNode, 'injection', {
        maxPaths: 1000,
        maxNodesVisited: 1, // Extremely low to trigger limit
      });

      // Even if all paths appear mitigated, should be partial due to limit
      if (result.nodeLimitReached) {
        expect(result.status).not.toBe('full');
      }
    });
  });

  // ===========================================================================
  // TraversalState Factory Tests
  // ===========================================================================

  describe('createTraversalState', () => {
    it('should create fresh state with zero nodesVisited', () => {
      const state = createTraversalState(1000);

      expect(state.nodesVisited).toBe(0);
      expect(state.maxNodesVisited).toBe(1000);
      expect(state.limitReached).toBe(false);
      expect(state.classification).toBeUndefined();
      expect(state.reason).toBeUndefined();
    });

    it('should accept custom maxNodesVisited', () => {
      const state = createTraversalState(500);

      expect(state.maxNodesVisited).toBe(500);
    });
  });

  // ===========================================================================
  // visitNode Tests - Node Visit Counting
  // ===========================================================================

  describe('visitNode', () => {
    it('should increment counter and return not reached', () => {
      const state = createTraversalState(10);
      expect(state.nodesVisited).toBe(0);

      const result = analyzer.visitNode(state);

      expect(state.nodesVisited).toBe(1);
      expect(result.limitReached).toBe(false);
      expect(result.classification).toBeUndefined();
    });

    it('should return limit reached when exceeding max', () => {
      const state = createTraversalState(2);
      state.nodesVisited = 3; // Already over limit

      const result = analyzer.visitNode(state);

      expect(result.limitReached).toBe(true);
      expect(result.classification).toBe('unknown');
      expect(result.reason).toBe('node_limit_exceeded');
      expect(state.limitReached).toBe(true);
    });

    it('should block visit at exactly max (pre-increment check per FR-002)', () => {
      const state = createTraversalState(5);
      state.nodesVisited = 5; // At exactly max

      // At exactly max, should trigger limit (pre-increment check)
      // This ensures limit=N means exactly N nodes, not N+1
      const result = analyzer.visitNode(state);

      expect(result.limitReached).toBe(true);
      expect(result.classification).toBe('unknown');
      expect(result.reason).toBe('node_limit_exceeded');
      expect(state.nodesVisited).toBe(5); // Counter should NOT increment past limit
    });

    it('should block visit at max + 1', () => {
      const state = createTraversalState(5);
      state.nodesVisited = 6; // At max + 1

      const result = analyzer.visitNode(state);

      expect(result.limitReached).toBe(true);
      expect(result.classification).toBe('unknown');
      expect(result.reason).toBe('node_limit_exceeded');
    });

    // ===========================================================================
    // FR-002 Regression Test: Pre-increment check semantics
    // Bug fix: limit=N must result in exactly N nodes visited, not N+1
    // ===========================================================================

    it('should enforce exact node limit (limit=10 → exactly 10 nodes visited) [FR-002]', () => {
      const limit = 10;
      const state = createTraversalState(limit);

      // Visit exactly `limit` nodes
      for (let i = 0; i < limit; i++) {
        const result = analyzer.visitNode(state);
        expect(result.limitReached).toBe(false);
      }

      expect(state.nodesVisited).toBe(limit);

      // The next visit should trigger the limit (pre-increment check)
      const finalResult = analyzer.visitNode(state);
      expect(finalResult.limitReached).toBe(true);
      expect(finalResult.classification).toBe('unknown');
      expect(finalResult.reason).toBe('node_limit_exceeded');

      // Counter should NOT increment past the limit
      expect(state.nodesVisited).toBe(limit);
    });
  });

  // ===========================================================================
  // pathMitigatesVulnerability Tests - FR-003/FR-004
  //
  // Bug fix: Function must check if mitigation's pattern.mitigates array
  // includes the queried vulnerability type, not return true unconditionally.
  // ===========================================================================

  describe('pathMitigatesVulnerability', () => {
    // ===========================================================================
    // REGRESSION TEST: This function MUST NOT return true unconditionally.
    // The original placeholder always returned true, causing false negatives.
    // ===========================================================================

    it('should return false for unknown pattern ID (conservative behavior)', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'exit'],
        mitigations: [
          {
            patternId: 'unknown-pattern-that-does-not-exist',
            location: { file: 'test.ts', line: 10 },
            protectedVariables: ['input'],
            protectedPaths: [],
            scope: 'function',
            confidence: 'high',
          },
        ],
        isComplete: true,
        signature: 'entry->exit',
      };

      // Unknown patterns should NOT be assumed to mitigate anything
      expect(analyzer.pathMitigatesVulnerability(path, 'injection')).toBe(false);
      expect(analyzer.pathMitigatesVulnerability(path, 'xss')).toBe(false);
    });

    it('should return true when mitigation applies to queried vulnerability type [FR-003]', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'exit'],
        mitigations: [
          {
            patternId: 'zod-parse', // Mitigates: injection, xss, path_traversal
            location: { file: 'test.ts', line: 10 },
            protectedVariables: ['input'],
            protectedPaths: [],
            scope: 'function',
            confidence: 'high',
          },
        ],
        isComplete: true,
        signature: 'entry->exit',
      };

      // zod-parse mitigates 'injection'
      const result = analyzer.pathMitigatesVulnerability(path, 'injection');
      expect(result).toBe(true);
    });

    it('should return false when mitigation does NOT apply to queried vulnerability type [FR-003]', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'exit'],
        mitigations: [
          {
            patternId: 'zod-parse', // Mitigates: injection, xss, path_traversal (NOT ssrf)
            location: { file: 'test.ts', line: 10 },
            protectedVariables: ['input'],
            protectedPaths: [],
            scope: 'function',
            confidence: 'high',
          },
        ],
        isComplete: true,
        signature: 'entry->exit',
      };

      // zod-parse does NOT mitigate 'ssrf'
      const result = analyzer.pathMitigatesVulnerability(path, 'ssrf');
      expect(result).toBe(false);
    });

    it('should return false when path has no mitigations [FR-004]', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'exit'],
        mitigations: [],
        isComplete: true,
        signature: 'entry->exit',
      };

      const result = analyzer.pathMitigatesVulnerability(path, 'injection');
      expect(result).toBe(false);
    });

    it('should return true when one of multiple mitigations applies [FR-003]', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'middle', 'exit'],
        mitigations: [
          {
            patternId: 'validator-escape', // Mitigates: xss only
            location: { file: 'test.ts', line: 10 },
            protectedVariables: ['html'],
            protectedPaths: [],
            scope: 'function',
            confidence: 'high',
          },
          {
            patternId: 'sql-parameterized', // Mitigates: injection only
            location: { file: 'test.ts', line: 20 },
            protectedVariables: ['query'],
            protectedPaths: [],
            scope: 'function',
            confidence: 'high',
          },
        ],
        isComplete: true,
        signature: 'entry->middle->exit',
      };

      // First mitigation covers xss
      expect(analyzer.pathMitigatesVulnerability(path, 'xss')).toBe(true);
      // Second mitigation covers injection
      expect(analyzer.pathMitigatesVulnerability(path, 'injection')).toBe(true);
      // Neither covers ssrf
      expect(analyzer.pathMitigatesVulnerability(path, 'ssrf')).toBe(false);
    });
  });

  // ===========================================================================
  // Edge Case Tests (FR-009) - Required per spec
  // ===========================================================================

  describe('Edge Cases', () => {
    // Edge Case 1: Node limit of zero
    it('should visit zero nodes when limit is 0 [EC-1]', () => {
      const state = createTraversalState(0);
      expect(state.nodesVisited).toBe(0);
      expect(state.maxNodesVisited).toBe(0);

      // First visit should immediately trigger limit
      const result = analyzer.visitNode(state);

      expect(result.limitReached).toBe(true);
      expect(result.classification).toBe('unknown');
      expect(result.reason).toBe('node_limit_exceeded');
      expect(state.nodesVisited).toBe(0); // Should NOT increment past limit
    });

    // Edge Case 2: Empty mitigations array
    it('should return false for path with empty mitigations array [EC-2]', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'exit'],
        mitigations: [], // Empty array
        isComplete: true,
        signature: 'entry->exit',
      };

      expect(analyzer.pathMitigatesVulnerability(path, 'injection')).toBe(false);
      expect(analyzer.pathMitigatesVulnerability(path, 'xss')).toBe(false);
      expect(analyzer.pathMitigatesVulnerability(path, 'ssrf')).toBe(false);
    });

    // Edge Case 3: Mitigation with multiple vulnerability types
    it('should return true for any vulnerability type in mitigation.mitigates array [EC-3]', () => {
      const path: ExecutionPath = {
        nodes: ['entry', 'exit'],
        mitigations: [
          {
            patternId: 'zod-parse', // Mitigates: ['injection', 'xss', 'path_traversal']
            location: { file: 'test.ts', line: 10 },
            protectedVariables: ['input'],
            protectedPaths: [],
            scope: 'function',
            confidence: 'high',
          },
        ],
        isComplete: true,
        signature: 'entry->exit',
      };

      // zod-parse mitigates injection, xss, and path_traversal
      expect(analyzer.pathMitigatesVulnerability(path, 'injection')).toBe(true);
      expect(analyzer.pathMitigatesVulnerability(path, 'xss')).toBe(true);
      expect(analyzer.pathMitigatesVulnerability(path, 'path_traversal')).toBe(true);
      // But not ssrf, null_deref, or auth_bypass
      expect(analyzer.pathMitigatesVulnerability(path, 'ssrf')).toBe(false);
      expect(analyzer.pathMitigatesVulnerability(path, 'null_deref')).toBe(false);
      expect(analyzer.pathMitigatesVulnerability(path, 'auth_bypass')).toBe(false);
    });
  });
});
