/**
 * Scope Stack — Lexical scope tracking for declaration-identity resolution.
 *
 * Provides a scope stack that maps variable names to their declaring AST nodes,
 * enabling scope-aware variable resolution without a full TypeChecker.
 *
 * Used by safe-source-detector and vulnerability-detector to replace name-based
 * tracking with declaration-identity tracking.
 */

import ts from 'typescript';

// =============================================================================
// Identity Key Helper
// =============================================================================

/**
 * Produce a deterministic identity string for an AST node.
 * Format: `file:line:col` (1-based line, 0-based column).
 *
 * IMPORTANT: Never embed ts.Node references in serializable data structures.
 * Use this helper to produce a stable key for maps, sets, and stored state.
 */
export function nodeIdentityKey(node: ts.Node, sourceFile: ts.SourceFile): string {
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${sourceFile.fileName}:${line + 1}:${character}`;
}

// =============================================================================
// DestructuringBinding — Assignment target binding metadata
// =============================================================================

/**
 * A variable name extracted from a destructuring assignment target
 * (BinaryExpression LHS). This is the Expression-based counterpart to the
 * simple `{ name, node }` returned by `extractBindingNames()` for
 * BindingPattern nodes in VariableDeclarations.
 */
export interface DestructuringBinding {
  /** Local binding name (after rename resolution) */
  name: string;
  /** AST node representing the binding */
  node: ts.Node;
  /** Position in array destructuring (for per-element taint) */
  index?: number;
  /** Original property key (for renamed destructuring, e.g. `{ orig: renamed }`) */
  propertyKey?: string;
  /** Whether this is a rest element (`...rest`) */
  isRest: boolean;
  /** Nesting depth (0 = top-level, max 10) */
  depth: number;
}

/**
 * Extract binding names from a destructuring assignment target.
 *
 * Handles `ArrayLiteralExpression` and `ObjectLiteralExpression` patterns
 * used on the LHS of a `BinaryExpression` (assignment targets).
 *
 * This is the Expression-based counterpart to `extractBindingNames()` which
 * handles `BindingPattern` nodes in `VariableDeclarations`.
 *
 * For simple identifiers: `x = 1` → [{ name: 'x', ... }]
 * For array destructuring: `[a, b] = arr` → [{ name: 'a', index: 0 }, { name: 'b', index: 1 }]
 * For object destructuring: `({ a, b: c } = obj)` → [{ name: 'a' }, { name: 'c', propertyKey: 'b' }]
 * For rest elements: `[a, ...rest] = arr` → [{ name: 'a', index: 0 }, { name: 'rest', isRest: true }]
 * For nested: `[{ a }] = arr` → [{ name: 'a', depth: 1 }]
 *
 * @param target - The LHS of a destructuring assignment
 * @param maxDepth - Maximum recursion depth (default 10)
 * @returns Array of extracted bindings with metadata
 */
export function extractBindingsFromAssignmentTarget(
  target: ts.Expression,
  maxDepth = 10
): DestructuringBinding[] {
  return extractAssignmentBindings(target, 0, maxDepth);
}

function extractAssignmentBindings(
  node: ts.Node,
  depth: number,
  maxDepth: number
): DestructuringBinding[] {
  if (depth > maxDepth) return [];

  const result: DestructuringBinding[] = [];

  if (ts.isIdentifier(node)) {
    result.push({
      name: node.text,
      node,
      isRest: false,
      depth,
    });
  } else if (ts.isArrayLiteralExpression(node)) {
    for (let i = 0; i < node.elements.length; i++) {
      const element = node.elements[i];
      if (!element) continue;
      // Holes: OmittedExpression
      if (element.kind === ts.SyntaxKind.OmittedExpression) continue;
      // Rest element: ...rest
      if (ts.isSpreadElement(element)) {
        // Identifiers directly in this array stay at current depth;
        // nested containers increment depth.
        const childDepth = isContainerNode(element.expression) ? depth + 1 : depth;
        const inner = extractAssignmentBindings(element.expression, childDepth, maxDepth);
        for (const binding of inner) {
          binding.isRest = true;
          if (binding.depth === childDepth) binding.index = i;
        }
        result.push(...inner);
      } else {
        const childDepth = isContainerNode(element) ? depth + 1 : depth;
        const inner = extractAssignmentBindings(element, childDepth, maxDepth);
        for (const binding of inner) {
          // Set index on direct children of this array
          if (binding.depth === depth && binding.index === undefined) {
            binding.index = i;
          }
        }
        result.push(...inner);
      }
    }
  } else if (ts.isObjectLiteralExpression(node)) {
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        // { key: value } — value is the binding target
        const propKey = ts.isIdentifier(prop.name)
          ? prop.name.text
          : ts.isStringLiteral(prop.name)
            ? prop.name.text
            : undefined;
        const childDepth = isContainerNode(prop.initializer) ? depth + 1 : depth;
        const inner = extractAssignmentBindings(prop.initializer, childDepth, maxDepth);
        for (const binding of inner) {
          // If the value is a simple identifier and the key differs, record the rename
          if (propKey && ts.isIdentifier(prop.initializer) && propKey !== binding.name) {
            binding.propertyKey = propKey;
          }
        }
        result.push(...inner);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        // { a } — shorthand: name is both key and binding
        result.push({
          name: prop.name.text,
          node: prop.name,
          isRest: false,
          depth,
        });
      } else if (ts.isSpreadAssignment(prop)) {
        // { ...rest }
        const childDepth = isContainerNode(prop.expression) ? depth + 1 : depth;
        const inner = extractAssignmentBindings(prop.expression, childDepth, maxDepth);
        for (const binding of inner) {
          binding.isRest = true;
        }
        result.push(...inner);
      }
    }
  }

  return result;
}

/** Returns true for array/object literal expressions that represent nested destructuring. */
function isContainerNode(node: ts.Node): boolean {
  return ts.isArrayLiteralExpression(node) || ts.isObjectLiteralExpression(node);
}

// =============================================================================
// Scope Entry
// =============================================================================

interface ScopeEntry {
  /** The AST node that creates this scope (block, function, class, for-loop, source file). */
  node: ts.Node;
  /** Declarations visible in this scope: name -> declaring identifier node. */
  declarations: Map<string, ts.Node>;
  /** Nesting depth (0 = file scope). */
  depth: number;
}

// =============================================================================
// Scope-Creating Node Detection
// =============================================================================

/**
 * Returns true if `node` introduces a new lexical scope.
 */
export function isScopeNode(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isClassDeclaration(node) ||
    ts.isClassExpression(node) ||
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isCatchClause(node)
  );
}

/**
 * Returns true if `node` introduces a function-level scope (not block-level).
 * Used to determine the correct scope for `var` declarations, which are hoisted
 * to the enclosing function (or source file) rather than the enclosing block.
 */
export function isFunctionScopeNode(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

/**
 * Extract all binding identifiers from a BindingName (handles destructuring).
 *
 * For simple identifiers: `const x = 1` -> ['x']
 * For object destructuring: `const { a, b: c } = obj` -> ['a', 'c']
 * For array destructuring: `const [a, , b] = arr` -> ['a', 'b']
 * For nested: `const { a: [b, c] } = obj` -> ['b', 'c']
 */
export function extractBindingNames(name: ts.BindingName): { name: string; node: ts.Node }[] {
  const result: { name: string; node: ts.Node }[] = [];

  if (ts.isIdentifier(name)) {
    result.push({ name: name.text, node: name });
  } else if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      result.push(...extractBindingNames(element.name));
    }
  } else if (ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        result.push(...extractBindingNames(element.name));
      }
      // OmittedExpression (holes like `[, , x]`) are skipped
    }
  }

  return result;
}

// =============================================================================
// ScopeStack Class
// =============================================================================

/**
 * A lexical scope stack for resolving identifier names to declaration nodes.
 *
 * Usage:
 * 1. Walk the AST. On entering a scope-creating node, call `enterScope(node)`.
 * 2. For each variable/const/let declaration, call `addDeclaration(name, declNode)`.
 * 3. To resolve an identifier, call `resolveDeclaration(name)` — returns the
 *    innermost declaration node for that name, or undefined if not found.
 * 4. On leaving a scope-creating node, call `leaveScope()`.
 */
export class ScopeStack {
  private stack: ScopeEntry[] = [];

  /** Current nesting depth (0 when no scope is entered). */
  get depth(): number {
    return this.stack.length;
  }

  /** Enter a new lexical scope. */
  enterScope(node: ts.Node): void {
    this.stack.push({
      node,
      declarations: new Map(),
      depth: this.stack.length,
    });
  }

  /** Leave the innermost scope. */
  leaveScope(): void {
    this.stack.pop();
  }

  /** Register a declaration in the current (innermost) scope. */
  addDeclaration(name: string, node: ts.Node): void {
    const top = this.stack[this.stack.length - 1];
    if (top) {
      top.declarations.set(name, node);
    }
  }

  /**
   * Register a `var` declaration in the nearest function-level scope.
   * `var` is hoisted to the enclosing function (or source file), not
   * the enclosing block.
   */
  addVarDeclaration(name: string, node: ts.Node): void {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const frame = this.stack[i];
      if (!frame) continue;
      if (isFunctionScopeNode(frame.node)) {
        frame.declarations.set(name, node);
        return;
      }
    }
    // Fallback: if no function scope found, use the outermost scope
    const outermost = this.stack[0];
    if (outermost) {
      outermost.declarations.set(name, node);
    }
  }

  /**
   * Resolve a name to its declaring node by walking the stack from innermost
   * scope outward. Returns the declaring node, or undefined if the name is
   * not declared in any enclosing scope.
   */
  resolveDeclaration(name: string): ts.Node | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const frame = this.stack[i];
      if (!frame) continue;
      const decl = frame.declarations.get(name);
      if (decl !== undefined) {
        return decl;
      }
    }
    return undefined;
  }

  /** Check whether a given declaration node is visible in the current scope chain. */
  isInScope(declarationNode: ts.Node): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const frame = this.stack[i];
      if (!frame) continue;
      for (const node of frame.declarations.values()) {
        if (node === declarationNode) {
          return true;
        }
      }
    }
    return false;
  }
}

// =============================================================================
// Scope-Walking Helpers
// =============================================================================

/**
 * Determine if a variable declaration uses `var` (function-scoped hoisting).
 */
function isVarDeclaration(node: ts.VariableDeclaration): boolean {
  const declList = node.parent;
  if (!ts.isVariableDeclarationList(declList)) return false;
  // Neither Const nor Let flag means `var`
  return !(declList.flags & ts.NodeFlags.Const) && !(declList.flags & ts.NodeFlags.Let);
}

/**
 * Register a variable declaration in the scope stack, handling:
 * - Simple identifiers (`const x`)
 * - Destructuring patterns (`const { a, b } = obj`, `const [a, b] = arr`)
 * - `var` hoisting (registers in the nearest function scope, not block scope)
 * - Catch clause variable binding
 */
export function registerDeclaration(
  node: ts.VariableDeclaration,
  scope: ScopeStack,
  sourceFile?: ts.SourceFile,
  declarationsByKey?: Map<string, ts.Node>
): void {
  const isVar = isVarDeclaration(node);
  const bindings = extractBindingNames(node.name);

  for (const { name, node: _bindingNode } of bindings) {
    if (isVar) {
      scope.addVarDeclaration(name, node);
    } else {
      scope.addDeclaration(name, node);
    }
    if (sourceFile && declarationsByKey) {
      const key = nodeIdentityKey(node, sourceFile);
      declarationsByKey.set(key, node);
    }
  }
}

/**
 * Register function parameters (including destructured) in the scope stack.
 */
function registerParams(
  node: ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration,
  scope: ScopeStack,
  sourceFile?: ts.SourceFile,
  declarationsByKey?: Map<string, ts.Node>
): void {
  for (const param of node.parameters) {
    const bindings = extractBindingNames(param.name);
    for (const { name } of bindings) {
      scope.addDeclaration(name, param);
      if (sourceFile && declarationsByKey) {
        const key = nodeIdentityKey(param, sourceFile);
        declarationsByKey.set(key, param);
      }
    }
  }
}

/**
 * Register a catch clause variable in the scope stack.
 */
function registerCatchBinding(node: ts.CatchClause, scope: ScopeStack): void {
  if (node.variableDeclaration) {
    const bindings = extractBindingNames(node.variableDeclaration.name);
    for (const { name } of bindings) {
      scope.addDeclaration(name, node.variableDeclaration);
    }
  }
}

/**
 * Register all declaration types for a given node in the scope stack.
 * This is the canonical helper used by all scope-walking code.
 */
export function registerNodeDeclarations(
  node: ts.Node,
  scope: ScopeStack,
  sourceFile?: ts.SourceFile,
  declarationsByKey?: Map<string, ts.Node>
): void {
  if (ts.isVariableDeclaration(node)) {
    registerDeclaration(node, scope, sourceFile, declarationsByKey);
  }

  if (ts.isFunctionDeclaration(node) && node.name) {
    scope.addDeclaration(node.name.text, node);
    if (sourceFile && declarationsByKey) {
      const key = nodeIdentityKey(node, sourceFile);
      declarationsByKey.set(key, node);
    }
  }

  if (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  ) {
    registerParams(node, scope, sourceFile, declarationsByKey);
  }

  if (ts.isCatchClause(node)) {
    registerCatchBinding(node, scope);
  }
}

/**
 * Build a ScopeStack that is populated with all declarations in `sourceFile`.
 * This performs a full AST walk and registers every variable/const/let/var
 * declaration, function parameter, catch variable, and function declaration name.
 *
 * Returns a Map from each AST node to the ScopeStack state at that point,
 * keyed by node identity string. This is used for point-in-time resolution.
 *
 * For simpler use cases, use `walkWithScope()` instead.
 */
export function buildDeclarationMap(sourceFile: ts.SourceFile): Map<string, ts.Node> {
  const declarationsByKey = new Map<string, ts.Node>();
  const scope = new ScopeStack();

  const visit = (node: ts.Node): void => {
    const isScope = isScopeNode(node);
    if (isScope) {
      scope.enterScope(node);
    }

    registerNodeDeclarations(node, scope, sourceFile, declarationsByKey);

    ts.forEachChild(node, visit);

    if (isScope) {
      scope.leaveScope();
    }
  };

  visit(sourceFile);
  return declarationsByKey;
}

/**
 * Walk an AST with scope tracking, invoking a callback for each node.
 * The callback receives the current ScopeStack, which can be used to
 * resolve identifiers at any point during the walk.
 *
 * Declarations are registered automatically for:
 * - Variable declarations (`const x`, `let y`, `var z` with hoisting)
 * - Destructuring patterns (`const { a } = obj`, `const [a] = arr`)
 * - Function declaration names
 * - Function/method/arrow parameters (including destructured)
 * - Catch clause variables
 */
export function walkWithScope(
  sourceFile: ts.SourceFile,
  callback: (node: ts.Node, scope: ScopeStack, sourceFile: ts.SourceFile) => void
): void {
  const scope = new ScopeStack();

  const visit = (node: ts.Node): void => {
    const isScope = isScopeNode(node);
    if (isScope) {
      scope.enterScope(node);
    }

    registerNodeDeclarations(node, scope);

    // Invoke user callback
    callback(node, scope, sourceFile);

    // Visit children
    ts.forEachChild(node, visit);

    if (isScope) {
      scope.leaveScope();
    }
  };

  visit(sourceFile);
}
