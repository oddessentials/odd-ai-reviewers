/**
 * Control Flow Graph Runtime Types
 *
 * Runtime representations of CFG nodes and edges used during analysis.
 * These extend the serializable types from ./types.ts with runtime-specific
 * fields like AST node references.
 */

import type ts from 'typescript';
import type { CFGNodeType, CFGEdgeType, MitigationInstance, SourceLocation } from './types.js';

/**
 * A node in the control flow graph (runtime representation)
 */
export interface CFGNodeRuntime {
  /** Unique identifier for this node */
  id: string;

  /** Type of control flow construct */
  type: CFGNodeType;

  /** AST statements contained in this node */
  statements: ts.Statement[];

  /** Starting line number (1-indexed) */
  lineStart: number;

  /** Ending line number (1-indexed) */
  lineEnd: number;

  /** Mitigations detected at this node */
  mitigations: MitigationInstance[];

  /** Variables that contain tainted (user-controlled) data at this node */
  taintedVariables: Set<string>;

  /** Whether this node is an async boundary (contains await) */
  isAsyncBoundary: boolean;

  /** The await expression if this is an await node */
  awaitExpression?: ts.AwaitExpression;
}

/**
 * An edge connecting two CFG nodes
 */
export interface CFGEdgeRuntime {
  /** Source node ID */
  from: string;

  /** Target node ID */
  to: string;

  /** Type of edge (sequential, branch, etc.) */
  type: CFGEdgeType;

  /** For branch edges, the condition expression */
  condition?: ts.Expression;

  /** For branch edges, whether this is the true or false branch */
  conditionValue?: boolean;
}

/**
 * A function call site within the CFG
 */
export interface CallSiteRuntime {
  /** The CFG node containing this call */
  nodeId: string;

  /** Name of the called function */
  calleeName: string;

  /** File containing the callee (if resolved) */
  calleeFile?: string;

  /** Whether the callee was successfully resolved */
  isResolved: boolean;

  /** Whether this is a dynamic call (e.g., computed property) */
  isDynamic: boolean;

  /** Source location of the call */
  location: SourceLocation;

  /** The call expression AST node */
  callExpression: ts.CallExpression;
}

/**
 * A control flow graph for a single function
 */
export interface ControlFlowGraphRuntime {
  /** Unique identifier: file:line:functionName */
  functionId: string;

  /** Function name (or '<anonymous>') */
  functionName: string;

  /** Source file path */
  filePath: string;

  /** Function start line */
  startLine: number;

  /** Function end line */
  endLine: number;

  /** All nodes in the graph */
  nodes: Map<string, CFGNodeRuntime>;

  /** All edges in the graph */
  edges: CFGEdgeRuntime[];

  /** Entry node ID */
  entryNode: string;

  /** Exit node IDs (multiple for functions with multiple return points) */
  exitNodes: string[];

  /** Call sites within this function */
  callSites: CallSiteRuntime[];

  /** The original function AST node */
  functionNode: ts.FunctionLikeDeclaration;

  /** Whether this is an async function */
  isAsync: boolean;

  /** Await boundaries within this function (node IDs) */
  awaitBoundaries: string[];
}

/**
 * Context for building a CFG
 */
export interface CFGBuilderContext {
  /** Source file being analyzed */
  sourceFile: ts.SourceFile;

  /** File path */
  filePath: string;

  /** Counter for generating unique node IDs */
  nodeIdCounter: number;

  /** Current node being built */
  currentNode: CFGNodeRuntime | null;

  /** Stack of pending nodes (for nested structures) */
  pendingNodes: CFGNodeRuntime[];

  /** Accumulated edges */
  edges: CFGEdgeRuntime[];

  /** All nodes created */
  nodes: Map<string, CFGNodeRuntime>;

  /** Entry node ID */
  entryNode: string | null;

  /** Exit nodes */
  exitNodes: string[];

  /** Break targets (for loops and switches) */
  breakTargets: string[];

  /** Continue targets (for loops) */
  continueTargets: string[];

  /** Call sites found */
  callSites: CallSiteRuntime[];
}

/**
 * Create an empty CFG builder context
 */
export function createBuilderContext(
  sourceFile: ts.SourceFile,
  filePath: string
): CFGBuilderContext {
  return {
    sourceFile,
    filePath,
    nodeIdCounter: 0,
    currentNode: null,
    pendingNodes: [],
    edges: [],
    nodes: new Map(),
    entryNode: null,
    exitNodes: [],
    breakTargets: [],
    continueTargets: [],
    callSites: [],
  };
}

/**
 * Generate a unique node ID
 */
export function generateNodeId(ctx: CFGBuilderContext, prefix = 'n'): string {
  return `${prefix}_${++ctx.nodeIdCounter}`;
}

/**
 * Create a new CFG node
 */
export function createNode(
  id: string,
  type: CFGNodeType,
  lineStart: number,
  lineEnd: number
): CFGNodeRuntime {
  return {
    id,
    type,
    statements: [],
    lineStart,
    lineEnd,
    mitigations: [],
    taintedVariables: new Set(),
    isAsyncBoundary: type === 'await',
    awaitExpression: undefined,
  };
}

/**
 * Add an edge between two nodes
 */
export function addEdge(
  ctx: CFGBuilderContext,
  from: string,
  to: string,
  type: CFGEdgeType,
  condition?: ts.Expression,
  conditionValue?: boolean
): void {
  ctx.edges.push({
    from,
    to,
    type,
    condition,
    conditionValue,
  });
}

/**
 * Get line number from AST node
 */
export function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

/**
 * Get end line number from AST node
 */
export function getEndLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
}

/**
 * Convert runtime CFG to serializable format
 */
export function serializeCFG(cfg: ControlFlowGraphRuntime): {
  functionId: string;
  functionName: string;
  filePath: string;
  startLine: number;
  endLine: number;
  nodes: Record<
    string,
    {
      id: string;
      type: CFGNodeType;
      lineStart: number;
      lineEnd: number;
      mitigations: MitigationInstance[];
      taintedVariables: string[];
      isAsyncBoundary: boolean;
    }
  >;
  edges: {
    from: string;
    to: string;
    type: CFGEdgeType;
    conditionValue?: boolean;
  }[];
  entryNode: string;
  exitNodes: string[];
  callSites: {
    nodeId: string;
    calleeName: string;
    calleeFile?: string;
    isResolved: boolean;
    isDynamic: boolean;
    location: SourceLocation;
  }[];
} {
  const nodes: Record<
    string,
    {
      id: string;
      type: CFGNodeType;
      lineStart: number;
      lineEnd: number;
      mitigations: MitigationInstance[];
      taintedVariables: string[];
      isAsyncBoundary: boolean;
    }
  > = {};

  for (const [id, node] of cfg.nodes) {
    nodes[id] = {
      id: node.id,
      type: node.type,
      lineStart: node.lineStart,
      lineEnd: node.lineEnd,
      mitigations: node.mitigations,
      taintedVariables: Array.from(node.taintedVariables),
      isAsyncBoundary: node.isAsyncBoundary,
    };
  }

  return {
    functionId: cfg.functionId,
    functionName: cfg.functionName,
    filePath: cfg.filePath,
    startLine: cfg.startLine,
    endLine: cfg.endLine,
    nodes,
    edges: cfg.edges.map((e) => ({
      from: e.from,
      to: e.to,
      type: e.type,
      conditionValue: e.conditionValue,
    })),
    entryNode: cfg.entryNode,
    exitNodes: cfg.exitNodes,
    callSites: cfg.callSites.map((cs) => ({
      nodeId: cs.nodeId,
      calleeName: cs.calleeName,
      calleeFile: cs.calleeFile,
      isResolved: cs.isResolved,
      isDynamic: cs.isDynamic,
      location: cs.location,
    })),
  };
}
