/**
 * Control Flow Graph Builder
 *
 * Constructs control flow graphs from TypeScript/JavaScript AST.
 * Implements FR-001 (track data flow through control structures) and
 * FR-002 (language-specific CFG construction).
 */

import ts from 'typescript';
import type { SourceLocation } from './types.js';
import {
  type CFGBuilderContext,
  type ControlFlowGraphRuntime,
  type CallSiteRuntime,
  createBuilderContext,
  generateNodeId,
  createNode,
  addEdge,
  getLineNumber,
  getEndLineNumber,
} from './cfg-types.js';

/**
 * Build a control flow graph for a function
 */
export function buildCFG(
  functionNode: ts.FunctionLikeDeclaration,
  sourceFile: ts.SourceFile,
  filePath: string
): ControlFlowGraphRuntime {
  const ctx = createBuilderContext(sourceFile, filePath);

  // Get function name and check if async
  const functionName = getFunctionName(functionNode);
  const startLine = getLineNumber(functionNode, sourceFile);
  const endLine = getEndLineNumber(functionNode, sourceFile);
  const functionId = `${filePath}:${startLine}:${functionName}`;
  const isAsync = isAsyncFunction(functionNode);

  // Track await boundaries
  const awaitBoundaries: string[] = [];

  // Create entry node
  const entryId = generateNodeId(ctx, 'entry');
  const entryNode = createNode(entryId, 'entry', startLine, startLine);
  ctx.nodes.set(entryId, entryNode);
  ctx.entryNode = entryId;

  // Process function body
  const body = functionNode.body;
  if (body) {
    if (ts.isBlock(body)) {
      const exitId = processBlock(ctx, body, entryId);
      if (exitId) {
        // Create implicit exit node if function doesn't explicitly return
        const implicitExitId = generateNodeId(ctx, 'exit');
        const implicitExit = createNode(implicitExitId, 'exit', endLine, endLine);
        ctx.nodes.set(implicitExitId, implicitExit);
        addEdge(ctx, exitId, implicitExitId, 'sequential');
        ctx.exitNodes.push(implicitExitId);
      }
    } else {
      // Arrow function with expression body - check for await
      const awaits = findAwaitExpressions(body, sourceFile);

      if (awaits.length > 0 && isAsync && awaits[0]) {
        // Create await node for the expression
        const awaitExpr = awaits[0];
        const awaitNodeId = generateNodeId(ctx, 'await');
        const awaitNode = createNode(
          awaitNodeId,
          'await',
          getLineNumber(awaitExpr, sourceFile),
          getEndLineNumber(awaitExpr, sourceFile)
        );
        awaitNode.awaitExpression = awaitExpr;
        awaitNode.isAsyncBoundary = true;
        ctx.nodes.set(awaitNodeId, awaitNode);
        addEdge(ctx, entryId, awaitNodeId, 'await');
        awaitBoundaries.push(awaitNodeId);

        // Check for call expressions in the await
        if (ts.isCallExpression(awaitExpr.expression)) {
          findCallExpressions(ctx, awaitExpr.expression, awaitNodeId);
        }

        // Create exit node
        const exitId = generateNodeId(ctx, 'exit');
        const exitNode = createNode(exitId, 'exit', endLine, endLine);
        ctx.nodes.set(exitId, exitNode);
        addEdge(ctx, awaitNodeId, exitId, 'return');
        ctx.exitNodes.push(exitId);
      } else {
        // No await - regular expression body
        const bodyNodeId = generateNodeId(ctx, 'body');
        const bodyNode = createNode(
          bodyNodeId,
          'basic',
          getLineNumber(body, sourceFile),
          getEndLineNumber(body, sourceFile)
        );
        bodyNode.statements.push(ts.factory.createReturnStatement(body as ts.Expression));
        ctx.nodes.set(bodyNodeId, bodyNode);
        addEdge(ctx, entryId, bodyNodeId, 'sequential');

        // Check for call expressions
        findCallExpressions(ctx, body, bodyNodeId);

        // Create exit node
        const exitId = generateNodeId(ctx, 'exit');
        const exitNode = createNode(exitId, 'exit', endLine, endLine);
        ctx.nodes.set(exitId, exitNode);
        addEdge(ctx, bodyNodeId, exitId, 'return');
        ctx.exitNodes.push(exitId);
      }
    }
  } else {
    // No body (declaration only)
    const exitId = generateNodeId(ctx, 'exit');
    const exitNode = createNode(exitId, 'exit', endLine, endLine);
    ctx.nodes.set(exitId, exitNode);
    addEdge(ctx, entryId, exitId, 'sequential');
    ctx.exitNodes.push(exitId);
  }

  // Collect all await boundaries from nodes
  for (const [nodeId, node] of ctx.nodes) {
    if (node.type === 'await' && !awaitBoundaries.includes(nodeId)) {
      awaitBoundaries.push(nodeId);
    }
  }

  return {
    functionId,
    functionName,
    filePath,
    startLine,
    endLine,
    nodes: ctx.nodes,
    edges: ctx.edges,
    entryNode: ctx.entryNode ?? entryId,
    exitNodes: ctx.exitNodes,
    callSites: ctx.callSites,
    functionNode,
    isAsync,
    awaitBoundaries,
  };
}

/**
 * Process a block of statements, returning the last node ID or null if all paths exit
 */
function processBlock(ctx: CFGBuilderContext, block: ts.Block, entryPoint: string): string | null {
  let currentNode = entryPoint;

  for (const statement of block.statements) {
    const result = processStatement(ctx, statement, currentNode);
    if (result === null) {
      // All paths from this statement exit (return/throw)
      return null;
    }
    currentNode = result;
  }

  return currentNode;
}

/**
 * Process a single statement, returning the exit node ID or null if it exits
 */
function processStatement(
  ctx: CFGBuilderContext,
  statement: ts.Statement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(statement, sourceFile);
  const lineEnd = getEndLineNumber(statement, sourceFile);

  // Handle different statement types
  if (ts.isIfStatement(statement)) {
    return processIfStatement(ctx, statement, entryPoint);
  }

  if (ts.isSwitchStatement(statement)) {
    return processSwitchStatement(ctx, statement, entryPoint);
  }

  if (
    ts.isForStatement(statement) ||
    ts.isForInStatement(statement) ||
    ts.isForOfStatement(statement)
  ) {
    return processForLoop(ctx, statement, entryPoint);
  }

  if (ts.isWhileStatement(statement)) {
    return processWhileLoop(ctx, statement, entryPoint);
  }

  if (ts.isDoStatement(statement)) {
    return processDoWhileLoop(ctx, statement, entryPoint);
  }

  if (ts.isTryStatement(statement)) {
    return processTryStatement(ctx, statement, entryPoint);
  }

  if (ts.isReturnStatement(statement)) {
    return processReturnStatement(ctx, statement, entryPoint);
  }

  if (ts.isThrowStatement(statement)) {
    return processThrowStatement(ctx, statement, entryPoint);
  }

  if (ts.isBreakStatement(statement)) {
    return processBreakStatement(ctx, statement, entryPoint);
  }

  if (ts.isContinueStatement(statement)) {
    return processContinueStatement(ctx, statement, entryPoint);
  }

  if (ts.isBlock(statement)) {
    return processBlock(ctx, statement, entryPoint);
  }

  // Check for await expressions in the statement
  const awaits = findAwaitExpressions(statement, sourceFile);

  if (awaits.length > 0) {
    // Statement contains await - create await node(s)
    return processAwaitStatement(ctx, statement, entryPoint, awaits);
  }

  // Default: basic block statement
  const nodeId = generateNodeId(ctx, 'basic');
  const node = createNode(nodeId, 'basic', lineStart, lineEnd);
  node.statements.push(statement);
  ctx.nodes.set(nodeId, node);
  addEdge(ctx, entryPoint, nodeId, 'sequential');

  // Find call expressions in this statement
  findCallExpressions(ctx, statement, nodeId);

  return nodeId;
}

/**
 * Process a statement containing await expressions.
 * Creates await nodes to represent async boundaries.
 */
function processAwaitStatement(
  ctx: CFGBuilderContext,
  statement: ts.Statement,
  entryPoint: string,
  awaits: ts.AwaitExpression[]
): string {
  const sourceFile = ctx.sourceFile;
  const firstAwait = awaits[0];

  // Guard against empty awaits array (should not happen based on call sites)
  if (!firstAwait) {
    // Fall back to basic node
    const nodeId = generateNodeId(ctx, 'basic');
    const node = createNode(
      nodeId,
      'basic',
      getLineNumber(statement, sourceFile),
      getEndLineNumber(statement, sourceFile)
    );
    node.statements.push(statement);
    ctx.nodes.set(nodeId, node);
    addEdge(ctx, entryPoint, nodeId, 'sequential');
    return nodeId;
  }

  // For simplicity, we create a single await node for the statement
  // In a more sophisticated implementation, we could split around each await
  const lineStart = getLineNumber(statement, sourceFile);
  const lineEnd = getEndLineNumber(statement, sourceFile);

  // Create the await node
  const awaitNodeId = generateNodeId(ctx, 'await');
  const awaitNode = createNode(awaitNodeId, 'await', lineStart, lineEnd);
  awaitNode.statements.push(statement);
  awaitNode.awaitExpression = firstAwait;
  awaitNode.isAsyncBoundary = true;
  ctx.nodes.set(awaitNodeId, awaitNode);
  addEdge(ctx, entryPoint, awaitNodeId, 'await');

  // Find call expressions in the await (the awaited expression)
  for (const awaitExpr of awaits) {
    if (ts.isCallExpression(awaitExpr.expression)) {
      findCallExpressions(ctx, awaitExpr.expression, awaitNodeId);
    }
  }

  // Also find other call expressions in the statement
  findCallExpressions(ctx, statement, awaitNodeId);

  return awaitNodeId;
}

/**
 * Process an if statement
 */
function processIfStatement(
  ctx: CFGBuilderContext,
  stmt: ts.IfStatement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);

  // Create branch node for the condition
  const branchId = generateNodeId(ctx, 'branch');
  const branchNode = createNode(branchId, 'branch', lineStart, lineStart);
  ctx.nodes.set(branchId, branchNode);
  addEdge(ctx, entryPoint, branchId, 'sequential');

  // Find call expressions in condition
  findCallExpressions(ctx, stmt.expression, branchId);

  // Create merge node for after the if
  const mergeId = generateNodeId(ctx, 'merge');
  const mergeNode = createNode(
    mergeId,
    'merge',
    getEndLineNumber(stmt, sourceFile),
    getEndLineNumber(stmt, sourceFile)
  );
  ctx.nodes.set(mergeId, mergeNode);

  // Process then branch
  const thenEntry = generateNodeId(ctx, 'then');
  const thenNode = createNode(
    thenEntry,
    'basic',
    getLineNumber(stmt.thenStatement, sourceFile),
    getLineNumber(stmt.thenStatement, sourceFile)
  );
  ctx.nodes.set(thenEntry, thenNode);
  addEdge(ctx, branchId, thenEntry, 'branch_true', stmt.expression, true);

  let thenExit: string | null;
  if (ts.isBlock(stmt.thenStatement)) {
    thenExit = processBlock(ctx, stmt.thenStatement, thenEntry);
  } else {
    thenExit = processStatement(ctx, stmt.thenStatement, thenEntry);
  }

  if (thenExit !== null) {
    addEdge(ctx, thenExit, mergeId, 'sequential');
  }

  // Process else branch
  let elseExit: string | null = null;
  if (stmt.elseStatement) {
    const elseEntry = generateNodeId(ctx, 'else');
    const elseNode = createNode(
      elseEntry,
      'basic',
      getLineNumber(stmt.elseStatement, sourceFile),
      getLineNumber(stmt.elseStatement, sourceFile)
    );
    ctx.nodes.set(elseEntry, elseNode);
    addEdge(ctx, branchId, elseEntry, 'branch_false', stmt.expression, false);

    if (ts.isBlock(stmt.elseStatement)) {
      elseExit = processBlock(ctx, stmt.elseStatement, elseEntry);
    } else {
      elseExit = processStatement(ctx, stmt.elseStatement, elseEntry);
    }

    if (elseExit !== null) {
      addEdge(ctx, elseExit, mergeId, 'sequential');
    }
  } else {
    // No else branch - false condition goes directly to merge
    addEdge(ctx, branchId, mergeId, 'branch_false', stmt.expression, false);
    elseExit = mergeId;
  }

  // If both branches exit, the merge is unreachable
  if (thenExit === null && (stmt.elseStatement ? elseExit === null : false)) {
    return null;
  }

  return mergeId;
}

/**
 * Process a switch statement
 */
function processSwitchStatement(
  ctx: CFGBuilderContext,
  stmt: ts.SwitchStatement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);

  // Create branch node for the switch expression
  const branchId = generateNodeId(ctx, 'switch');
  const branchNode = createNode(branchId, 'branch', lineStart, lineStart);
  ctx.nodes.set(branchId, branchNode);
  addEdge(ctx, entryPoint, branchId, 'sequential');

  findCallExpressions(ctx, stmt.expression, branchId);

  // Create merge node for after switch
  const mergeId = generateNodeId(ctx, 'merge');
  const mergeNode = createNode(
    mergeId,
    'merge',
    getEndLineNumber(stmt, sourceFile),
    getEndLineNumber(stmt, sourceFile)
  );
  ctx.nodes.set(mergeId, mergeNode);

  // Push break target
  ctx.breakTargets.push(mergeId);

  let hasDefault = false;
  let allCasesExit = true;
  let fallthrough: string | null = null;

  for (const clause of stmt.caseBlock.clauses) {
    const caseId = generateNodeId(ctx, ts.isDefaultClause(clause) ? 'default' : 'case');
    const caseNode = createNode(
      caseId,
      'basic',
      getLineNumber(clause, sourceFile),
      getLineNumber(clause, sourceFile)
    );
    ctx.nodes.set(caseId, caseNode);

    if (ts.isDefaultClause(clause)) {
      hasDefault = true;
    }

    // Edge from branch to case (or fallthrough from previous case)
    if (fallthrough) {
      addEdge(ctx, fallthrough, caseId, 'sequential');
    }
    addEdge(ctx, branchId, caseId, ts.isDefaultClause(clause) ? 'branch_false' : 'branch_true');

    // Process case statements
    let caseExit: string | null = caseId;
    for (const statement of clause.statements) {
      if (caseExit === null) break;
      caseExit = processStatement(ctx, statement, caseExit);
    }

    if (caseExit !== null) {
      fallthrough = caseExit;
      allCasesExit = false;
    } else {
      fallthrough = null;
    }
  }

  // Connect last fallthrough to merge
  if (fallthrough) {
    addEdge(ctx, fallthrough, mergeId, 'sequential');
  }

  // If no default case, switch can fall through without matching
  if (!hasDefault) {
    addEdge(ctx, branchId, mergeId, 'branch_false');
    allCasesExit = false;
  }

  ctx.breakTargets.pop();

  return allCasesExit ? null : mergeId;
}

/**
 * Process a for loop (for, for-in, for-of)
 */
function processForLoop(
  ctx: CFGBuilderContext,
  stmt: ts.ForStatement | ts.ForInStatement | ts.ForOfStatement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);

  // Create loop header node
  const headerId = generateNodeId(ctx, 'loop_header');
  const headerNode = createNode(headerId, 'loop_header', lineStart, lineStart);
  ctx.nodes.set(headerId, headerNode);

  // For standard for loop, process initializer first
  if (ts.isForStatement(stmt) && stmt.initializer) {
    const initId = generateNodeId(ctx, 'for_init');
    const initNode = createNode(initId, 'basic', lineStart, lineStart);
    if (ts.isVariableDeclarationList(stmt.initializer)) {
      // Convert to statement for storage
      initNode.statements.push(ts.factory.createVariableStatement(undefined, stmt.initializer));
    }
    ctx.nodes.set(initId, initNode);
    addEdge(ctx, entryPoint, initId, 'sequential');
    addEdge(ctx, initId, headerId, 'sequential');
  } else {
    addEdge(ctx, entryPoint, headerId, 'sequential');
  }

  // Create exit node for after loop
  const exitId = generateNodeId(ctx, 'merge');
  const exitNode = createNode(
    exitId,
    'merge',
    getEndLineNumber(stmt, sourceFile),
    getEndLineNumber(stmt, sourceFile)
  );
  ctx.nodes.set(exitId, exitNode);

  // Edge from header to exit (loop condition false)
  addEdge(ctx, headerId, exitId, 'loop_exit');

  // Push break/continue targets
  ctx.breakTargets.push(exitId);
  ctx.continueTargets.push(headerId);

  // Create loop body node
  const bodyId = generateNodeId(ctx, 'loop_body');
  const bodyNode = createNode(
    bodyId,
    'loop_body',
    getLineNumber(stmt.statement, sourceFile),
    getLineNumber(stmt.statement, sourceFile)
  );
  ctx.nodes.set(bodyId, bodyNode);
  addEdge(ctx, headerId, bodyId, 'branch_true');

  // Process body
  let bodyExit: string | null;
  if (ts.isBlock(stmt.statement)) {
    bodyExit = processBlock(ctx, stmt.statement, bodyId);
  } else {
    bodyExit = processStatement(ctx, stmt.statement, bodyId);
  }

  // For standard for loop, process incrementor
  if (ts.isForStatement(stmt) && stmt.incrementor && bodyExit !== null) {
    const incId = generateNodeId(ctx, 'for_inc');
    const incNode = createNode(
      incId,
      'basic',
      getLineNumber(stmt.incrementor, sourceFile),
      getLineNumber(stmt.incrementor, sourceFile)
    );
    ctx.nodes.set(incId, incNode);
    addEdge(ctx, bodyExit, incId, 'sequential');
    addEdge(ctx, incId, headerId, 'loop_back');
  } else if (bodyExit !== null) {
    addEdge(ctx, bodyExit, headerId, 'loop_back');
  }

  ctx.breakTargets.pop();
  ctx.continueTargets.pop();

  return exitId;
}

/**
 * Process a while loop
 */
function processWhileLoop(
  ctx: CFGBuilderContext,
  stmt: ts.WhileStatement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);

  // Create loop header
  const headerId = generateNodeId(ctx, 'loop_header');
  const headerNode = createNode(headerId, 'loop_header', lineStart, lineStart);
  ctx.nodes.set(headerId, headerNode);
  addEdge(ctx, entryPoint, headerId, 'sequential');

  findCallExpressions(ctx, stmt.expression, headerId);

  // Create exit node
  const exitId = generateNodeId(ctx, 'merge');
  const exitNode = createNode(
    exitId,
    'merge',
    getEndLineNumber(stmt, sourceFile),
    getEndLineNumber(stmt, sourceFile)
  );
  ctx.nodes.set(exitId, exitNode);
  addEdge(ctx, headerId, exitId, 'loop_exit', stmt.expression, false);

  // Push targets
  ctx.breakTargets.push(exitId);
  ctx.continueTargets.push(headerId);

  // Create body entry
  const bodyId = generateNodeId(ctx, 'loop_body');
  const bodyNode = createNode(
    bodyId,
    'loop_body',
    getLineNumber(stmt.statement, sourceFile),
    getLineNumber(stmt.statement, sourceFile)
  );
  ctx.nodes.set(bodyId, bodyNode);
  addEdge(ctx, headerId, bodyId, 'branch_true', stmt.expression, true);

  // Process body
  let bodyExit: string | null;
  if (ts.isBlock(stmt.statement)) {
    bodyExit = processBlock(ctx, stmt.statement, bodyId);
  } else {
    bodyExit = processStatement(ctx, stmt.statement, bodyId);
  }

  if (bodyExit !== null) {
    addEdge(ctx, bodyExit, headerId, 'loop_back');
  }

  ctx.breakTargets.pop();
  ctx.continueTargets.pop();

  return exitId;
}

/**
 * Process a do-while loop
 */
function processDoWhileLoop(
  ctx: CFGBuilderContext,
  stmt: ts.DoStatement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);

  // Create body entry (executed first in do-while)
  const bodyId = generateNodeId(ctx, 'loop_body');
  const bodyNode = createNode(bodyId, 'loop_body', lineStart, lineStart);
  ctx.nodes.set(bodyId, bodyNode);
  addEdge(ctx, entryPoint, bodyId, 'sequential');

  // Create loop header (condition check at end)
  const headerId = generateNodeId(ctx, 'loop_header');
  const headerNode = createNode(
    headerId,
    'loop_header',
    getLineNumber(stmt.expression, sourceFile),
    getEndLineNumber(stmt.expression, sourceFile)
  );
  ctx.nodes.set(headerId, headerNode);

  findCallExpressions(ctx, stmt.expression, headerId);

  // Create exit node
  const exitId = generateNodeId(ctx, 'merge');
  const exitNode = createNode(
    exitId,
    'merge',
    getEndLineNumber(stmt, sourceFile),
    getEndLineNumber(stmt, sourceFile)
  );
  ctx.nodes.set(exitId, exitNode);

  // Push targets
  ctx.breakTargets.push(exitId);
  ctx.continueTargets.push(headerId);

  // Process body
  let bodyExit: string | null;
  if (ts.isBlock(stmt.statement)) {
    bodyExit = processBlock(ctx, stmt.statement, bodyId);
  } else {
    bodyExit = processStatement(ctx, stmt.statement, bodyId);
  }

  if (bodyExit !== null) {
    addEdge(ctx, bodyExit, headerId, 'sequential');
  }

  // Loop back or exit from header
  addEdge(ctx, headerId, bodyId, 'loop_back', stmt.expression, true);
  addEdge(ctx, headerId, exitId, 'loop_exit', stmt.expression, false);

  ctx.breakTargets.pop();
  ctx.continueTargets.pop();

  return exitId;
}

/**
 * Process a try statement
 */
function processTryStatement(
  ctx: CFGBuilderContext,
  stmt: ts.TryStatement,
  entryPoint: string
): string | null {
  const sourceFile = ctx.sourceFile;
  const lineEnd = getEndLineNumber(stmt, sourceFile);

  // Create merge node for after try/catch/finally
  const mergeId = generateNodeId(ctx, 'merge');
  const mergeNode = createNode(mergeId, 'merge', lineEnd, lineEnd);
  ctx.nodes.set(mergeId, mergeNode);

  // Process try block
  const tryExit = processBlock(ctx, stmt.tryBlock, entryPoint);

  // Process catch clause
  let catchExit: string | null = null;
  if (stmt.catchClause) {
    const catchId = generateNodeId(ctx, 'catch');
    const catchNode = createNode(
      catchId,
      'basic',
      getLineNumber(stmt.catchClause, sourceFile),
      getLineNumber(stmt.catchClause, sourceFile)
    );
    ctx.nodes.set(catchId, catchNode);

    // Exception edge from try entry to catch
    addEdge(ctx, entryPoint, catchId, 'exception');

    catchExit = processBlock(ctx, stmt.catchClause.block, catchId);
  }

  // Process finally clause
  if (stmt.finallyBlock) {
    const finallyId = generateNodeId(ctx, 'finally');
    const finallyNode = createNode(
      finallyId,
      'basic',
      getLineNumber(stmt.finallyBlock, sourceFile),
      getLineNumber(stmt.finallyBlock, sourceFile)
    );
    ctx.nodes.set(finallyId, finallyNode);

    // Connect try exit to finally
    if (tryExit !== null) {
      addEdge(ctx, tryExit, finallyId, 'sequential');
    }

    // Connect catch exit to finally
    if (catchExit !== null) {
      addEdge(ctx, catchExit, finallyId, 'sequential');
    }

    const finallyExit = processBlock(ctx, stmt.finallyBlock, finallyId);
    if (finallyExit !== null) {
      addEdge(ctx, finallyExit, mergeId, 'sequential');
    }

    return finallyExit !== null ? mergeId : null;
  } else {
    // No finally - connect try/catch exits to merge
    if (tryExit !== null) {
      addEdge(ctx, tryExit, mergeId, 'sequential');
    }
    if (catchExit !== null) {
      addEdge(ctx, catchExit, mergeId, 'sequential');
    }

    return tryExit !== null || catchExit !== null ? mergeId : null;
  }
}

/**
 * Process a return statement
 */
function processReturnStatement(
  ctx: CFGBuilderContext,
  stmt: ts.ReturnStatement,
  entryPoint: string
): null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);
  const lineEnd = getEndLineNumber(stmt, sourceFile);

  // Check for await in the return expression (e.g., return await foo())
  if (stmt.expression) {
    const awaits = findAwaitExpressions(stmt.expression, sourceFile);
    if (awaits.length > 0) {
      // Create await node before exit
      const awaitNodeId = generateNodeId(ctx, 'await');
      const awaitNode = createNode(awaitNodeId, 'await', lineStart, lineEnd);
      awaitNode.statements.push(stmt);
      awaitNode.awaitExpression = awaits[0];
      awaitNode.isAsyncBoundary = true;
      ctx.nodes.set(awaitNodeId, awaitNode);
      addEdge(ctx, entryPoint, awaitNodeId, 'await');

      // Find call expressions in the await
      for (const awaitExpr of awaits) {
        if (ts.isCallExpression(awaitExpr.expression)) {
          findCallExpressions(ctx, awaitExpr.expression, awaitNodeId);
        }
      }

      // Create exit node connected from await
      const exitId = generateNodeId(ctx, 'exit');
      const exitNode = createNode(exitId, 'exit', lineStart, lineEnd);
      ctx.nodes.set(exitId, exitNode);
      addEdge(ctx, awaitNodeId, exitId, 'return');
      ctx.exitNodes.push(exitId);

      return null;
    }
  }

  // No await - normal return processing
  const exitId = generateNodeId(ctx, 'exit');
  const exitNode = createNode(exitId, 'exit', lineStart, lineEnd);
  exitNode.statements.push(stmt);
  ctx.nodes.set(exitId, exitNode);
  addEdge(ctx, entryPoint, exitId, 'return');
  ctx.exitNodes.push(exitId);

  if (stmt.expression) {
    findCallExpressions(ctx, stmt.expression, exitId);
  }

  return null; // Return always exits
}

/**
 * Process a throw statement
 */
function processThrowStatement(
  ctx: CFGBuilderContext,
  stmt: ts.ThrowStatement,
  entryPoint: string
): null {
  const sourceFile = ctx.sourceFile;
  const lineStart = getLineNumber(stmt, sourceFile);
  const lineEnd = getEndLineNumber(stmt, sourceFile);

  // Create throw node
  const throwId = generateNodeId(ctx, 'throw');
  const throwNode = createNode(throwId, 'throw', lineStart, lineEnd);
  throwNode.statements.push(stmt);
  ctx.nodes.set(throwId, throwNode);
  addEdge(ctx, entryPoint, throwId, 'exception');
  ctx.exitNodes.push(throwId);

  findCallExpressions(ctx, stmt.expression, throwId);

  return null; // Throw always exits
}

/**
 * Process a break statement
 */
function processBreakStatement(
  ctx: CFGBuilderContext,
  stmt: ts.BreakStatement,
  entryPoint: string
): null {
  const target = ctx.breakTargets[ctx.breakTargets.length - 1];
  if (target) {
    addEdge(ctx, entryPoint, target, 'sequential');
  }
  return null;
}

/**
 * Process a continue statement
 */
function processContinueStatement(
  ctx: CFGBuilderContext,
  stmt: ts.ContinueStatement,
  entryPoint: string
): null {
  const target = ctx.continueTargets[ctx.continueTargets.length - 1];
  if (target) {
    addEdge(ctx, entryPoint, target, 'loop_back');
  }
  return null;
}

/**
 * Find and record call expressions in a node
 */
function findCallExpressions(ctx: CFGBuilderContext, node: ts.Node, cfgNodeId: string): void {
  const sourceFile = ctx.sourceFile;

  function visit(n: ts.Node): void {
    if (ts.isCallExpression(n)) {
      const callSite = createCallSite(n, cfgNodeId, sourceFile, ctx.filePath);
      ctx.callSites.push(callSite);
    }

    ts.forEachChild(n, visit);
  }

  visit(node);
}

/**
 * Find await expressions in a node and record them.
 * Returns array of await expression locations for creating await nodes.
 */
function findAwaitExpressions(node: ts.Node, _sourceFile: ts.SourceFile): ts.AwaitExpression[] {
  const awaits: ts.AwaitExpression[] = [];

  function visit(n: ts.Node): void {
    if (ts.isAwaitExpression(n)) {
      awaits.push(n);
    }
    ts.forEachChild(n, visit);
  }

  visit(node);
  return awaits;
}

/**
 * Check if a function is async
 */
function isAsyncFunction(node: ts.FunctionLikeDeclaration): boolean {
  if (!node.modifiers) return false;
  return node.modifiers.some((mod) => mod.kind === ts.SyntaxKind.AsyncKeyword);
}

/**
 * Create a call site record
 */
function createCallSite(
  call: ts.CallExpression,
  nodeId: string,
  sourceFile: ts.SourceFile,
  filePath: string
): CallSiteRuntime {
  const location: SourceLocation = {
    file: filePath,
    line: getLineNumber(call, sourceFile),
    column:
      call.getStart(sourceFile) -
      sourceFile.getLineAndCharacterOfPosition(call.getStart(sourceFile)).character,
    endLine: getEndLineNumber(call, sourceFile),
  };

  let calleeName = '<unknown>';
  let isDynamic = false;

  if (ts.isIdentifier(call.expression)) {
    calleeName = call.expression.text;
  } else if (ts.isPropertyAccessExpression(call.expression)) {
    calleeName = call.expression.name.text;
  } else if (ts.isElementAccessExpression(call.expression)) {
    isDynamic = true;
    calleeName = '<computed>';
  } else {
    isDynamic = true;
  }

  return {
    nodeId,
    calleeName,
    calleeFile: undefined, // Resolved later during inter-procedural analysis
    isResolved: false,
    isDynamic,
    location,
    callExpression: call,
  };
}

/**
 * Get the name of a function
 */
function getFunctionName(node: ts.FunctionLikeDeclaration): string {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    return node.name?.getText() ?? '<anonymous>';
  }
  if (ts.isFunctionExpression(node)) {
    return node.name?.text ?? '<anonymous>';
  }
  if (ts.isArrowFunction(node)) {
    // Try to get name from parent variable declaration
    if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
      return node.parent.name.text;
    }
    return '<arrow>';
  }
  if (ts.isConstructorDeclaration(node)) {
    return 'constructor';
  }
  if (ts.isGetAccessorDeclaration(node)) {
    return `get ${node.name.getText()}`;
  }
  if (ts.isSetAccessorDeclaration(node)) {
    return `set ${node.name.getText()}`;
  }
  return '<anonymous>';
}

/**
 * Find all functions in a source file
 */
export function findFunctions(sourceFile: ts.SourceFile): ts.FunctionLikeDeclaration[] {
  const functions: ts.FunctionLikeDeclaration[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isFunctionExpression(node) ||
      ts.isArrowFunction(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isConstructorDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node)
    ) {
      functions.push(node);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

/**
 * Parse a source file
 */
export function parseSourceFile(
  content: string,
  filePath: string,
  scriptKind?: ts.ScriptKind
): ts.SourceFile {
  // Determine script kind from file extension if not provided
  if (scriptKind === undefined) {
    if (filePath.endsWith('.tsx')) {
      scriptKind = ts.ScriptKind.TSX;
    } else if (filePath.endsWith('.ts')) {
      scriptKind = ts.ScriptKind.TS;
    } else if (filePath.endsWith('.jsx')) {
      scriptKind = ts.ScriptKind.JSX;
    } else {
      scriptKind = ts.ScriptKind.JS;
    }
  }

  return ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true, // setParentNodes
    scriptKind
  );
}

/**
 * Build CFGs for all functions in a source file
 */
export function buildAllCFGs(content: string, filePath: string): ControlFlowGraphRuntime[] {
  const sourceFile = parseSourceFile(content, filePath);
  const functions = findFunctions(sourceFile);

  return functions.map((fn) => buildCFG(fn, sourceFile, filePath));
}
