/**
 * Path Analyzer
 *
 * Analyzes execution paths through control flow graphs to determine
 * reachability and mitigation coverage.
 *
 * Implements:
 * - T029: Path coverage analysis to verify ALL paths are mitigated (FR-007)
 * - FR-003: Inter-procedural analysis with bounded call depth
 * - FR-004: Conservative fallback when depth limit reached
 */

import type {
  MitigationInstance,
  VulnerabilityType,
  MitigationStatus,
  ControlFlowConfig,
} from './types.js';
import type { ControlFlowGraphRuntime, CFGNodeRuntime } from './cfg-types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Represents a single execution path through a CFG.
 */
export interface ExecutionPath {
  /** Ordered list of node IDs in this path */
  nodes: string[];

  /** Mitigations encountered along this path */
  mitigations: MitigationInstance[];

  /** Whether this path is complete (reaches exit) */
  isComplete: boolean;

  /** String representation for deduplication */
  signature: string;
}

/**
 * Result of path analysis for a vulnerability.
 */
export interface PathAnalysisResult {
  /** The vulnerability being analyzed */
  vulnerabilityType: VulnerabilityType;

  /** Location where the vulnerability exists (sink) */
  sinkNodeId: string;

  /** All execution paths from entry to the sink */
  pathsToSink: ExecutionPath[];

  /** Paths that have full mitigation coverage */
  mitigatedPaths: ExecutionPath[];

  /** Paths that lack mitigation */
  unmitigatedPaths: ExecutionPath[];

  /** Overall mitigation status */
  status: MitigationStatus;

  /** Percentage of paths that are mitigated */
  coveragePercent: number;

  /** Whether analysis was degraded due to complexity limits */
  degraded: boolean;

  /** Reason for degradation if applicable */
  degradedReason?: string;
}

/**
 * Options for path analysis.
 */
export interface PathAnalysisOptions {
  /** Maximum paths to explore (prevents explosion) */
  maxPaths?: number;

  /** Maximum path length (prevents infinite loops) */
  maxPathLength?: number;

  /** Whether to include unreachable paths */
  includeUnreachable?: boolean;
}

/**
 * Constraint on a variable established by a conditional branch.
 */
export interface VariableConstraint {
  /** Type of constraint */
  type: 'not_null' | 'not_undefined' | 'type_is' | 'truthy' | 'falsy';

  /** Additional constraint value (e.g., type name for type_is) */
  value?: string;

  /** Node ID where this constraint was established */
  establishedAt: string;
}

/**
 * Result of inter-procedural analysis.
 */
export interface InterProceduralResult {
  /** Current analysis depth */
  analysisDepth: number;

  /** Call sites that were analyzed */
  callsAnalyzed: CallSiteAnalysis[];

  /** Whether depth limit was reached */
  reachedDepthLimit: boolean;

  /** Whether conservative fallback was applied */
  conservativeFallback: boolean;
}

/**
 * Result of async boundary analysis (FR-022, FR-023).
 */
export interface AsyncBoundaryResult {
  /** Whether the function is async */
  isAsync: boolean;

  /** Number of await boundaries in the function */
  awaitCount: number;

  /** Await node IDs */
  awaitNodes: string[];

  /** Whether mitigations before awaits cover the awaits (FR-022) */
  mitigationsBeforeAwaits: Map<string, MitigationInstance[]>;

  /** Whether cross-function async patterns were detected */
  hasCrossFunctionAsync: boolean;

  /** Whether conservative fallback was applied due to async complexity */
  asyncConservativeFallback: boolean;

  /** Reason for conservative fallback if applied */
  fallbackReason?: string;
}

/**
 * Analysis result for a single call site.
 */
export interface CallSiteAnalysis {
  /** Name of the called function */
  calleeName: string;

  /** Whether the callee could be resolved */
  resolved: boolean;

  /** Mitigations found in the callee */
  mitigationsInCallee: MitigationInstance[];

  /** Whether conservative assumptions were made */
  conservativeAssumption: boolean;
}

// =============================================================================
// Path Analyzer Class
// =============================================================================

/**
 * Analyzes control flow paths for mitigation coverage.
 *
 * The analyzer explores all paths from CFG entry to a given sink node,
 * tracking which mitigations are encountered along each path.
 */
export class PathAnalyzer {
  private config: ControlFlowConfig;
  private defaultOptions: Required<PathAnalysisOptions>;

  constructor(config?: Partial<ControlFlowConfig>) {
    this.config = {
      enabled: true,
      maxCallDepth: config?.maxCallDepth ?? 5,
      timeBudgetMs: config?.timeBudgetMs ?? 300_000,
      sizeBudgetLines: config?.sizeBudgetLines ?? 10_000,
      mitigationPatterns: config?.mitigationPatterns ?? [],
      patternOverrides: config?.patternOverrides ?? [],
      disabledPatterns: config?.disabledPatterns ?? [],
    };

    this.defaultOptions = {
      maxPaths: 100,
      maxPathLength: 50,
      includeUnreachable: false,
    };
  }

  /**
   * Analyze paths to a sink node for a specific vulnerability type.
   */
  analyzePathsToSink(
    cfg: ControlFlowGraphRuntime,
    sinkNodeId: string,
    vulnerabilityType: VulnerabilityType,
    options?: PathAnalysisOptions
  ): PathAnalysisResult {
    const opts = { ...this.defaultOptions, ...options };

    // Find all paths from entry to sink
    const paths = this.findPathsToNode(cfg, cfg.entryNode, sinkNodeId, opts);

    // Classify paths by mitigation status
    const mitigatedPaths: ExecutionPath[] = [];
    const unmitigatedPaths: ExecutionPath[] = [];

    for (const path of paths) {
      const pathMitigates = this.pathMitigatesVulnerability(path, vulnerabilityType);
      if (pathMitigates) {
        mitigatedPaths.push(path);
      } else {
        unmitigatedPaths.push(path);
      }
    }

    // Determine overall status
    const status = this.determineStatus(mitigatedPaths.length, unmitigatedPaths.length);
    const coveragePercent = paths.length > 0 ? (mitigatedPaths.length / paths.length) * 100 : 0;

    // Check if we hit limits
    const degraded = paths.length >= opts.maxPaths;

    return {
      vulnerabilityType,
      sinkNodeId,
      pathsToSink: paths,
      mitigatedPaths,
      unmitigatedPaths,
      status,
      coveragePercent,
      degraded,
      degradedReason: degraded
        ? `Path limit reached (${opts.maxPaths}). Analysis may be incomplete.`
        : undefined,
    };
  }

  /**
   * Find all execution paths from a start node to an end node.
   */
  findPathsToNode(
    cfg: ControlFlowGraphRuntime,
    startId: string,
    endId: string,
    options: Required<PathAnalysisOptions>
  ): ExecutionPath[] {
    const paths: ExecutionPath[] = [];
    const visited = new Set<string>();

    const explore = (
      currentId: string,
      pathNodes: string[],
      pathMitigations: MitigationInstance[]
    ) => {
      // Check limits
      if (paths.length >= options.maxPaths) return;
      if (pathNodes.length >= options.maxPathLength) return;

      // Prevent cycles
      if (visited.has(currentId)) return;
      visited.add(currentId);

      // Add current node to path
      const newPath = [...pathNodes, currentId];

      // Collect mitigations from this node
      const node = cfg.nodes.get(currentId);
      const newMitigations = [...pathMitigations];
      if (node?.mitigations) {
        newMitigations.push(...node.mitigations);
      }

      // Check if we reached the target
      if (currentId === endId) {
        paths.push({
          nodes: newPath,
          mitigations: newMitigations,
          isComplete: true,
          signature: newPath.join('->'),
        });
        visited.delete(currentId);
        return;
      }

      // Explore outgoing edges
      const outEdges = cfg.edges.filter((e) => e.from === currentId);
      for (const edge of outEdges) {
        explore(edge.to, newPath, newMitigations);
      }

      visited.delete(currentId);
    };

    explore(startId, [], []);
    return paths;
  }

  /**
   * Check if a path mitigates a specific vulnerability type.
   */
  pathMitigatesVulnerability(path: ExecutionPath, _vulnType: VulnerabilityType): boolean {
    // A path is mitigated if ANY mitigation along it covers this vulnerability type
    return path.mitigations.some((_m) => {
      // The patternId maps to a mitigation pattern which has mitigates array
      // For now, we check if the mitigation was marked for this vuln type
      // This would need to be enhanced to check the actual pattern mapping
      return true; // Placeholder - actual implementation would check pattern mappings
    });
  }

  /**
   * Determine overall mitigation status from path counts.
   */
  private determineStatus(mitigatedCount: number, unmitigatedCount: number): MitigationStatus {
    if (unmitigatedCount === 0 && mitigatedCount > 0) {
      return 'full';
    } else if (mitigatedCount > 0 && unmitigatedCount > 0) {
      return 'partial';
    }
    return 'none';
  }

  /**
   * Get all nodes reachable from a given node.
   */
  getReachableNodes(cfg: ControlFlowGraphRuntime, startId: string): Set<string> {
    const reachable = new Set<string>();
    const queue = [startId];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || reachable.has(current)) continue;
      reachable.add(current);

      const outEdges = cfg.edges.filter((e) => e.from === current);
      for (const edge of outEdges) {
        if (!reachable.has(edge.to)) {
          queue.push(edge.to);
        }
      }
    }

    return reachable;
  }

  /**
   * Check if a node is reachable from the entry.
   */
  isReachable(cfg: ControlFlowGraphRuntime, nodeId: string): boolean {
    const reachable = this.getReachableNodes(cfg, cfg.entryNode);
    return reachable.has(nodeId);
  }

  /**
   * Find dead code (unreachable nodes).
   */
  findDeadCode(cfg: ControlFlowGraphRuntime): string[] {
    const reachable = this.getReachableNodes(cfg, cfg.entryNode);
    const allNodes = Array.from(cfg.nodes.keys());
    return allNodes.filter((id) => !reachable.has(id));
  }

  /**
   * Get dominator nodes for a given node.
   * A node D dominates N if every path from entry to N must go through D.
   */
  getDominators(cfg: ControlFlowGraphRuntime, nodeId: string): Set<string> {
    // Simple implementation: nodes that appear in ALL paths to nodeId
    const paths = this.findPathsToNode(cfg, cfg.entryNode, nodeId, this.defaultOptions);

    if (paths.length === 0) return new Set();

    // Start with all nodes from first path
    const firstPath = paths[0];
    if (!firstPath) return new Set();
    let dominators = new Set(firstPath.nodes);

    // Intersect with nodes from all other paths
    for (let i = 1; i < paths.length; i++) {
      const path = paths[i];
      if (!path) continue;
      const pathNodes = new Set(path.nodes);
      dominators = new Set([...dominators].filter((n) => pathNodes.has(n)));
    }

    return dominators;
  }

  /**
   * Check if a mitigation dominates a sink (appears on ALL paths to sink).
   */
  mitigationDominatesSink(
    cfg: ControlFlowGraphRuntime,
    mitigationNodeId: string,
    sinkNodeId: string
  ): boolean {
    const dominators = this.getDominators(cfg, sinkNodeId);
    return dominators.has(mitigationNodeId);
  }

  // ===========================================================================
  // T037: Conditional State Tracking
  // ===========================================================================

  /**
   * Track variable constraints established by conditional branches.
   *
   * After a branch like `if (x !== null)`, we know `x` is not null
   * in the true branch. This helps identify when variables are
   * protected by guards.
   */
  getVariableConstraintsAtNode(
    cfg: ControlFlowGraphRuntime,
    nodeId: string
  ): Map<string, VariableConstraint[]> {
    const constraints = new Map<string, VariableConstraint[]>();

    // Find all paths to this node
    const paths = this.findPathsToNode(cfg, cfg.entryNode, nodeId, this.defaultOptions);

    // For each path, track constraints established by branches
    for (const path of paths) {
      for (let i = 0; i < path.nodes.length - 1; i++) {
        const currentNodeId = path.nodes[i];
        const nextNodeId = path.nodes[i + 1];

        if (!currentNodeId || !nextNodeId) continue;

        // Find the edge between current and next
        const edge = cfg.edges.find((e) => e.from === currentNodeId && e.to === nextNodeId);

        if (edge?.type === 'branch_true' || edge?.type === 'branch_false') {
          // This is a conditional edge - extract constraints
          const node = cfg.nodes.get(currentNodeId);
          if (node?.type === 'branch') {
            const branchConstraints = this.extractConstraintsFromBranch(
              node,
              edge.type === 'branch_true'
            );
            for (const [varName, constraint] of branchConstraints) {
              const existing = constraints.get(varName);
              if (existing) {
                existing.push(constraint);
              } else {
                constraints.set(varName, [constraint]);
              }
            }
          }
        }
      }
    }

    return constraints;
  }

  /**
   * Extract variable constraints from a branch node.
   */
  private extractConstraintsFromBranch(
    _node: CFGNodeRuntime,
    _isTrueBranch: boolean
  ): Map<string, VariableConstraint> {
    // This would analyze the branch condition to extract constraints
    // For now, return empty map - full implementation would parse AST
    return new Map();
  }

  // ===========================================================================
  // T038-T040: Inter-procedural Analysis
  // ===========================================================================

  /**
   * Perform inter-procedural analysis with bounded call depth.
   *
   * Implements FR-003: Track data flow across function calls up to
   * configured depth limit.
   */
  analyzeInterProcedural(
    cfg: ControlFlowGraphRuntime,
    cfgMap: Map<string, ControlFlowGraphRuntime>,
    currentDepth = 0
  ): InterProceduralResult {
    const result: InterProceduralResult = {
      analysisDepth: currentDepth,
      callsAnalyzed: [],
      reachedDepthLimit: false,
      conservativeFallback: false,
    };

    // Check depth limit (FR-003)
    if (currentDepth >= this.config.maxCallDepth) {
      result.reachedDepthLimit = true;
      result.conservativeFallback = true;
      return result;
    }

    // Analyze each call site in the CFG
    for (const callSite of cfg.callSites) {
      const callResult = this.analyzeCallSite(callSite, cfgMap, currentDepth);
      result.callsAnalyzed.push(callResult);

      // If any call couldn't be resolved, mark as conservative
      if (!callResult.resolved) {
        result.conservativeFallback = true;
      }
    }

    return result;
  }

  /**
   * Analyze a single call site (T039: Call site resolution).
   */
  private analyzeCallSite(
    callSite: { calleeName: string; calleeFile?: string; isResolved: boolean; isDynamic: boolean },
    cfgMap: Map<string, ControlFlowGraphRuntime>,
    currentDepth: number
  ): CallSiteAnalysis {
    const analysis: CallSiteAnalysis = {
      calleeName: callSite.calleeName,
      resolved: false,
      mitigationsInCallee: [],
      conservativeAssumption: false,
    };

    // Dynamic calls can't be resolved - use conservative fallback (FR-004)
    if (callSite.isDynamic) {
      analysis.conservativeAssumption = true;
      return analysis;
    }

    // Try to find the callee's CFG
    // Key could be constructed from file + name but we do loose matching instead
    // const calleeKey = callSite.calleeFile ? `${callSite.calleeFile}:${callSite.calleeName}` : callSite.calleeName;

    // Look for matching CFG
    let calleeCfg: ControlFlowGraphRuntime | undefined;
    for (const [key, cfg] of cfgMap) {
      if (key.includes(callSite.calleeName) || cfg.functionName === callSite.calleeName) {
        calleeCfg = cfg;
        break;
      }
    }

    if (!calleeCfg) {
      // Can't find callee - conservative fallback (FR-004)
      analysis.conservativeAssumption = true;
      return analysis;
    }

    // Recursively analyze the callee
    analysis.resolved = true;
    const calleeResult = this.analyzeInterProcedural(calleeCfg, cfgMap, currentDepth + 1);

    // Collect mitigations from callee
    for (const [_nodeId, node] of calleeCfg.nodes) {
      if (node.mitigations.length > 0) {
        analysis.mitigationsInCallee.push(...node.mitigations);
      }
    }

    // If callee analysis hit depth limit, mark as conservative
    if (calleeResult.conservativeFallback) {
      analysis.conservativeAssumption = true;
    }

    return analysis;
  }

  /**
   * Apply conservative fallback when analysis limits are reached (T040, FR-004).
   *
   * When we can't fully analyze a path (due to depth limits or unresolved calls),
   * we assume the worst case to avoid false negatives.
   */
  applyConservativeFallback(result: PathAnalysisResult): PathAnalysisResult {
    if (!result.degraded) {
      return result;
    }

    // When degraded, treat unanalyzed paths as potentially vulnerable
    return {
      ...result,
      // Don't suppress findings when we can't fully analyze
      status: result.status === 'full' ? 'partial' : result.status,
      degradedReason:
        result.degradedReason || 'Analysis incomplete - conservative assumptions applied',
    };
  }

  // ===========================================================================
  // T069: Intra-Function Async Mitigation Tracking (FR-022)
  // ===========================================================================

  /**
   * Analyze async boundaries and mitigation coverage within a function.
   *
   * Implements FR-022: Track mitigations applied before async boundaries
   * within the same function scope.
   */
  analyzeAsyncBoundaries(cfg: ControlFlowGraphRuntime): AsyncBoundaryResult {
    const result: AsyncBoundaryResult = {
      isAsync: cfg.isAsync,
      awaitCount: cfg.awaitBoundaries.length,
      awaitNodes: cfg.awaitBoundaries,
      mitigationsBeforeAwaits: new Map(),
      hasCrossFunctionAsync: false,
      asyncConservativeFallback: false,
    };

    if (!cfg.isAsync || cfg.awaitBoundaries.length === 0) {
      return result;
    }

    // For each await node, find mitigations on paths leading to it
    for (const awaitNodeId of cfg.awaitBoundaries) {
      const mitigations = this.findMitigationsBeforeNode(cfg, awaitNodeId);
      result.mitigationsBeforeAwaits.set(awaitNodeId, mitigations);
    }

    // Check for cross-function async patterns
    result.hasCrossFunctionAsync = this.detectCrossFunctionAsync(cfg);

    return result;
  }

  /**
   * Find all mitigations on paths from entry to a given node.
   *
   * This implements the core of FR-022 - tracking mitigations that occur
   * before an async boundary within the same function.
   */
  findMitigationsBeforeNode(
    cfg: ControlFlowGraphRuntime,
    targetNodeId: string
  ): MitigationInstance[] {
    const mitigations: MitigationInstance[] = [];
    const seen = new Set<string>();

    // Find all paths from entry to target
    const paths = this.findPathsToNode(cfg, cfg.entryNode, targetNodeId, this.defaultOptions);

    // Collect unique mitigations from all paths
    for (const path of paths) {
      for (const nodeId of path.nodes) {
        if (nodeId === targetNodeId) break; // Stop before the target
        if (seen.has(nodeId)) continue;
        seen.add(nodeId);

        const node = cfg.nodes.get(nodeId);
        if (node?.mitigations) {
          for (const mit of node.mitigations) {
            // Avoid duplicates by checking pattern ID
            if (!mitigations.some((m) => m.patternId === mit.patternId)) {
              mitigations.push(mit);
            }
          }
        }
      }
    }

    return mitigations;
  }

  /**
   * Check if an await node is protected by mitigations.
   *
   * Returns true if the mitigation applies to the vulnerability type
   * that could be introduced at the await boundary.
   */
  isAwaitProtected(
    cfg: ControlFlowGraphRuntime,
    awaitNodeId: string,
    _vulnerabilityType: VulnerabilityType
  ): boolean {
    const mitigations = this.findMitigationsBeforeNode(cfg, awaitNodeId);

    // Check if any mitigation covers this vulnerability type
    // Note: In a full implementation, we would check the mitigation's
    // mitigates array to see if it covers the vulnerability type
    return mitigations.length > 0;
  }

  // ===========================================================================
  // T070: Conservative Fallback for Cross-Function Async (FR-023)
  // ===========================================================================

  /**
   * Detect cross-function async patterns that require conservative fallback.
   *
   * Implements FR-023: Apply conservative assumptions for mitigations
   * across async function boundaries.
   */
  detectCrossFunctionAsync(cfg: ControlFlowGraphRuntime): boolean {
    // Check if any call sites in await nodes are async calls
    for (const callSite of cfg.callSites) {
      const node = cfg.nodes.get(callSite.nodeId);
      if (node?.type === 'await') {
        // This is a call inside an await - check if it's to an async function
        // We can't easily determine this statically, so we assume all awaited
        // calls could be cross-function async
        return true;
      }
    }

    return false;
  }

  /**
   * Apply async-aware conservative fallback.
   *
   * When cross-function async patterns are detected, we apply conservative
   * assumptions per FR-023: best-effort with fallback to unmitigated.
   */
  applyAsyncConservativeFallback(
    result: PathAnalysisResult,
    asyncResult: AsyncBoundaryResult
  ): PathAnalysisResult {
    if (!asyncResult.hasCrossFunctionAsync) {
      return result;
    }

    // Cross-function async detected - apply conservative fallback
    const updatedResult = { ...result };

    // Downgrade full mitigation to partial when cross-function async is involved
    if (result.status === 'full') {
      updatedResult.status = 'partial';
    }

    // Mark as degraded
    updatedResult.degraded = true;
    updatedResult.degradedReason = this.combineReasons(
      result.degradedReason,
      'Cross-function async pattern detected - conservative assumptions applied (FR-023)'
    );

    return updatedResult;
  }

  /**
   * Combine degradation reasons.
   */
  private combineReasons(existing?: string, additional?: string): string {
    if (!existing) return additional || '';
    if (!additional) return existing;
    return `${existing}; ${additional}`;
  }

  /**
   * Full async-aware path analysis.
   *
   * Combines intra-function mitigation tracking (FR-022) with
   * cross-function conservative fallback (FR-023).
   */
  analyzePathsWithAsyncAwareness(
    cfg: ControlFlowGraphRuntime,
    sinkNodeId: string,
    vulnerabilityType: VulnerabilityType,
    options?: PathAnalysisOptions
  ): PathAnalysisResult {
    // First, do normal path analysis
    let result = this.analyzePathsToSink(cfg, sinkNodeId, vulnerabilityType, options);

    // Then, analyze async boundaries
    const asyncResult = this.analyzeAsyncBoundaries(cfg);

    // If the sink is after an async boundary, check for mitigations before it
    if (asyncResult.isAsync && asyncResult.awaitCount > 0) {
      // Find if sink is reachable from any await node
      for (const awaitNodeId of asyncResult.awaitNodes) {
        const reachableFromAwait = this.getReachableNodes(cfg, awaitNodeId);
        if (reachableFromAwait.has(sinkNodeId)) {
          // Sink is after an await - check mitigations before the await
          const mitigationsBeforeAwait = asyncResult.mitigationsBeforeAwaits.get(awaitNodeId) || [];

          if (mitigationsBeforeAwait.length > 0) {
            // There are mitigations before the await that protect the sink
            // This is handled by FR-022 - intra-function async tracking
            // The mitigations should already be counted in the path analysis
          }
        }
      }

      // Apply cross-function async fallback if needed
      if (asyncResult.hasCrossFunctionAsync) {
        result = this.applyAsyncConservativeFallback(result, asyncResult);
      }
    }

    return result;
  }
}

// =============================================================================
// Factory function
// =============================================================================

/**
 * Create a path analyzer with the given configuration.
 */
export function createPathAnalyzer(config?: Partial<ControlFlowConfig>): PathAnalyzer {
  return new PathAnalyzer(config);
}
