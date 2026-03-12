/**
 * Safe-Source Detector
 *
 * Analyzes TypeScript/JavaScript AST to identify provably non-tainted data sources.
 * Safe sources are filtered out before taint tracking to prevent false positives.
 *
 * Implements Patterns 1-4 from the safe-source contract:
 * - Pattern 1: Constant literal declarations (FR-001)
 * - Pattern 2: Built-in directory references (FR-002)
 * - Pattern 3: Safe directory listing returns (FR-003)
 * - Pattern 4: Constant array element access (FR-004)
 */

import ts from 'typescript';
import type { VulnerabilityType } from './types.js';
import { ALL_VULN_TYPES, type SafeSourceInstance } from './safe-source-patterns.js';
import {
  ScopeStack,
  isScopeNode,
  nodeIdentityKey,
  registerNodeDeclarations,
} from './scope-stack.js';

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Matches the DetectedSource shape from vulnerability-detector.ts.
 */
interface DetectedSource {
  location: { file: string; line: number; column?: number };
  expression: string;
  variableName: string;
}

// =============================================================================
// Main Detection Function
// =============================================================================

/**
 * Detect provably safe data sources in a TypeScript/JavaScript source file.
 *
 * Walks the AST and returns SafeSourceInstance entries for each variable
 * or expression that can be proven non-tainted by static analysis.
 */
export function detectSafeSources(
  sourceFile: ts.SourceFile,
  filePath: string
): SafeSourceInstance[] {
  const safeSources: SafeSourceInstance[] = [];
  const mutatedBindings = collectMutatedBindings(sourceFile);
  const safeConstArrayDecls = new Set<string>(); // identity keys (file:line:col)

  // Pattern 1: Constant literal declarations at module scope
  detectConstantLiterals(sourceFile, filePath, mutatedBindings, safeSources, safeConstArrayDecls);

  // Pattern 2: Built-in directory references
  detectBuiltinReferences(sourceFile, filePath, safeSources);

  // Pattern 3: Safe directory listing returns
  detectSafeReaddirCalls(sourceFile, filePath, safeSources);

  // Pattern 4: Constant array element access
  detectConstantElementAccess(sourceFile, filePath, safeConstArrayDecls, safeSources);

  return safeSources;
}

/**
 * Build a structured key that uniquely identifies a source declaration site.
 * Uses file:line:variableName to avoid cross-scope collisions and to make
 * a later move to true scope-aware matching straightforward.
 */
function safeSourceKey(file: string, line: number, variableName: string): string {
  return `${file}:${line}:${variableName}`;
}

/**
 * Filter out detected sources that are provably safe.
 *
 * Keys on file:line:variableName to avoid cross-scope collisions where an
 * inner-scope safe builtin (e.g. `const dir = __dirname`) would incorrectly
 * suppress an outer-scope tainted variable with the same name.
 *
 * Note: vuln-type-aware filtering is deferred — currently all vuln types are
 * suppressed for any matching safe source, which is over-conservative but
 * not a security risk.
 */
export function filterSafeSources(
  sources: DetectedSource[],
  safeSources: SafeSourceInstance[]
): DetectedSource[] {
  if (safeSources.length === 0) return sources;

  // Key on file:line:variableName to avoid cross-scope collisions.
  // Line numbers come from declaration sites, so same-name variables
  // in different scopes have different keys.
  const safeMap = new Map<string, VulnerabilityType[]>();
  for (const ss of safeSources) {
    const key = safeSourceKey(ss.location.file, ss.location.line, ss.variableName);
    const existing = safeMap.get(key);
    if (existing) {
      // Merge preventsTaintFor arrays, deduplicating
      for (const vt of ss.preventsTaintFor) {
        if (!existing.includes(vt)) existing.push(vt);
      }
    } else {
      safeMap.set(key, [...ss.preventsTaintFor]);
    }
  }

  return sources.filter((source) => {
    const key = safeSourceKey(source.location.file, source.location.line, source.variableName);
    return !safeMap.has(key);
  });
}

// =============================================================================
// Pattern 1: Constant Literal Declarations
// =============================================================================

function detectConstantLiterals(
  sourceFile: ts.SourceFile,
  filePath: string,
  mutatedBindings: Set<string>,
  safeSources: SafeSourceInstance[],
  safeConstArrayDecls: Set<string>
): void {
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    const declList = statement.declarationList;
    // Must use const keyword
    if (!(declList.flags & ts.NodeFlags.Const)) continue;

    for (const decl of declList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;

      const varName = decl.name.text;

      // Skip if THIS declaration's binding is mutated (identity-based check)
      const declKey = nodeIdentityKey(decl, sourceFile);
      if (mutatedBindings.has(declKey)) continue;

      const init = decl.initializer;
      const { line } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());

      if (ts.isStringLiteral(init)) {
        safeSources.push({
          patternId: 'constant-literal-string',
          variableName: varName,
          location: { file: filePath, line: line + 1 },
          confidence: 'high',
          preventsTaintFor: ALL_VULN_TYPES,
        });
      } else if (ts.isNumericLiteral(init)) {
        safeSources.push({
          patternId: 'constant-literal-number',
          variableName: varName,
          location: { file: filePath, line: line + 1 },
          confidence: 'high',
          preventsTaintFor: ALL_VULN_TYPES,
        });
      } else if (
        init.kind === ts.SyntaxKind.TrueKeyword ||
        init.kind === ts.SyntaxKind.FalseKeyword
      ) {
        safeSources.push({
          patternId: 'constant-literal-string', // booleans share constant pattern
          variableName: varName,
          location: { file: filePath, line: line + 1 },
          confidence: 'high',
          preventsTaintFor: ALL_VULN_TYPES,
        });
      } else if (ts.isArrayLiteralExpression(init) && isAllLiteralElements(init)) {
        safeConstArrayDecls.add(declKey);
        safeSources.push({
          patternId: 'constant-literal-array',
          variableName: varName,
          location: { file: filePath, line: line + 1 },
          confidence: 'high',
          preventsTaintFor: ALL_VULN_TYPES,
        });
      }
    }
  }
}

/**
 * Check if every element of an array literal is a primitive literal.
 */
function isAllLiteralElements(arr: ts.ArrayLiteralExpression): boolean {
  return arr.elements.every(isLiteralNode);
}

function isLiteralNode(node: ts.Node): boolean {
  return (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword
  );
}

// =============================================================================
// Pattern 2: Built-in Directory References
// =============================================================================

function detectBuiltinReferences(
  sourceFile: ts.SourceFile,
  filePath: string,
  safeSources: SafeSourceInstance[]
): void {
  const visit = (node: ts.Node): void => {
    // __dirname and __filename as standalone identifiers
    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (name === '__dirname' || name === '__filename') {
        // Skip if this builtin ref is inside a path.join/resolve with unsafe args
        if (!isInsideUnsafePathCall(node)) {
          const patternId = name === '__dirname' ? 'builtin-dirname' : 'builtin-filename';
          const varName = findAssignedVariableName(node, true);
          if (varName) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            safeSources.push({
              patternId,
              variableName: varName,
              location: { file: filePath, line: line + 1 },
              confidence: 'high',
              preventsTaintFor: ['path_traversal'],
            });
          }
        }
      }
    }

    // import.meta.dirname and import.meta.url as PropertyAccessExpression
    if (ts.isPropertyAccessExpression(node) && isImportMetaProperty(node)) {
      const propName = node.name.text;
      if (propName === 'dirname' || propName === 'url') {
        // Skip if this builtin ref is inside a path.join/resolve with unsafe args
        if (!isInsideUnsafePathCall(node)) {
          const varName = findAssignedVariableName(node, true);
          if (varName) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            safeSources.push({
              patternId:
                propName === 'dirname' ? 'builtin-import-meta-dirname' : 'builtin-import-meta-url',
              variableName: varName,
              location: { file: filePath, line: line + 1 },
              confidence: 'high',
              preventsTaintFor: ['path_traversal'],
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

/**
 * Check if a PropertyAccessExpression is on `import.meta`.
 */
function isImportMetaProperty(node: ts.PropertyAccessExpression): boolean {
  // import.meta.X → node.expression is MetaProperty (import.meta)
  return node.expression.kind === ts.SyntaxKind.MetaProperty;
}

// =============================================================================
// Pattern 3: Safe Directory Listing Returns
// =============================================================================

function detectSafeReaddirCalls(
  sourceFile: ts.SourceFile,
  filePath: string,
  safeSources: SafeSourceInstance[]
): void {
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isReaddirCall(node)) {
      const arg = node.arguments[0];
      if (arg && isSafePathArg(arg)) {
        const varName = findAssignedVariableName(node);
        if (varName) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          safeSources.push({
            patternId: 'safe-readdir',
            variableName: varName,
            location: { file: filePath, line: line + 1 },
            confidence: 'medium',
            preventsTaintFor: ['path_traversal'],
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
}

/**
 * Check if a call expression is fs.readdirSync or fs.promises.readdir.
 */
function isReaddirCall(node: ts.CallExpression): boolean {
  const expr = node.expression;

  // fs.readdirSync(...)
  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    if (methodName === 'readdirSync' || methodName === 'readdir') {
      // Check for fs.X or fs.promises.X
      if (ts.isIdentifier(expr.expression)) {
        return expr.expression.text === 'fs';
      }
      if (ts.isPropertyAccessExpression(expr.expression)) {
        return (
          ts.isIdentifier(expr.expression.expression) &&
          expr.expression.expression.text === 'fs' &&
          expr.expression.name.text === 'promises'
        );
      }
    }
  }

  return false;
}

/**
 * Check if an AST node is a provably safe path argument.
 * Must be ONE of: string literal, built-in ref (__dirname/__filename/import.meta.dirname/url),
 * or a nested path.join/resolve call where ALL arguments are themselves safe.
 *
 * Used by both Pattern 2 (built-in references) and Pattern 3 (safe readdir args).
 */
function isSafePathArg(node: ts.Node): boolean {
  // String literal
  if (ts.isStringLiteral(node)) return true;

  // __dirname or __filename
  if (ts.isIdentifier(node) && (node.text === '__dirname' || node.text === '__filename')) {
    return true;
  }

  // import.meta.dirname or import.meta.url
  if (ts.isPropertyAccessExpression(node) && isImportMetaProperty(node)) {
    const propName = node.name.text;
    return propName === 'dirname' || propName === 'url';
  }

  // path.join(...) or path.resolve(...) where ALL args are safe
  if (ts.isCallExpression(node) && isPathJoinOrResolve(node)) {
    return node.arguments.every((arg) => isSafePathArg(arg));
  }

  return false;
}

/**
 * Check if a node is inside a path.join/resolve call that has any unsafe arguments.
 * Returns true when the builtin ref is mixed with non-safe args (e.g., user input),
 * meaning the result variable should NOT be marked as a safe source.
 */
function isInsideUnsafePathCall(node: ts.Node): boolean {
  // Walk up to find the nearest CallExpression ancestor
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && isPathJoinOrResolve(current)) {
      // Found a path.join/resolve call containing this node.
      // Check if ALL arguments are safe — if not, the result is unsafe.
      return !current.arguments.every((arg) => isSafePathArg(arg));
    }
    // Stop walking up if we hit a statement or declaration boundary
    if (ts.isVariableDeclaration(current) || ts.isBinaryExpression(current)) {
      break;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Check if a call is path.join() or path.resolve().
 */
function isPathJoinOrResolve(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) return false;
  const methodName = node.expression.name.text;
  if (methodName !== 'join' && methodName !== 'resolve') return false;
  if (!ts.isIdentifier(node.expression.expression)) return false;
  return node.expression.expression.text === 'path';
}

// =============================================================================
// Pattern 4: Constant Array Element Access
// =============================================================================

function detectConstantElementAccess(
  sourceFile: ts.SourceFile,
  filePath: string,
  safeConstArrayDecls: Set<string>,
  safeSources: SafeSourceInstance[]
): void {
  if (safeConstArrayDecls.size === 0) return;

  // Build a scope stack to resolve element access expressions to their declarations
  const scope = new ScopeStack();

  const visit = (node: ts.Node): void => {
    const isScope = isScopeNode(node);
    if (isScope) scope.enterScope(node);

    // Register all declaration types (var/let/const, destructuring, params, catch)
    registerNodeDeclarations(node, scope);

    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      // Resolve the identifier to its declaration and check if THAT declaration is safe
      const decl = scope.resolveDeclaration(node.expression.text);
      const declKey = decl ? nodeIdentityKey(decl, sourceFile) : null;
      if (declKey && safeConstArrayDecls.has(declKey)) {
        const varName = findAssignedVariableName(node);
        if (varName) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          safeSources.push({
            patternId: 'constant-element-access',
            variableName: varName,
            location: { file: filePath, line: line + 1 },
            confidence: 'high',
            preventsTaintFor: ['injection', 'xss'],
          });
        }
      }
    }

    ts.forEachChild(node, visit);

    if (isScope) scope.leaveScope();
  };

  visit(sourceFile);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Collect declaration identity keys for bindings that appear on the LHS of
 * any assignment expression. Uses the scope stack to resolve each mutated
 * identifier to its declaring node, so that an inner shadowed variable
 * does not poison the outer declaration.
 *
 * Returns a Set of identity strings (file:line:col) — NOT raw names.
 */
function collectMutatedBindings(sourceFile: ts.SourceFile): Set<string> {
  const mutated = new Set<string>();
  const scope = new ScopeStack();

  const visit = (node: ts.Node): void => {
    const isScope = isScopeNode(node);
    if (isScope) scope.enterScope(node);

    // Register all declaration types (var/let/const, destructuring, params, catch)
    registerNodeDeclarations(node, scope);

    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      // Direct assignment: ITEMS = ...
      if (ts.isIdentifier(node.left)) {
        const decl = scope.resolveDeclaration(node.left.text);
        if (decl) {
          mutated.add(nodeIdentityKey(decl, sourceFile));
        }
      }
      // Element assignment: ITEMS[0] = ...
      if (ts.isElementAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) {
        const decl = scope.resolveDeclaration(node.left.expression.text);
        if (decl) {
          mutated.add(nodeIdentityKey(decl, sourceFile));
        }
      }
      // Property assignment: ITEMS.prop = ...
      if (ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression)) {
        const decl = scope.resolveDeclaration(node.left.expression.text);
        if (decl) {
          mutated.add(nodeIdentityKey(decl, sourceFile));
        }
      }
    }

    ts.forEachChild(node, visit);

    if (isScope) scope.leaveScope();
  };

  visit(sourceFile);
  return mutated;
}

/**
 * Walk up the AST to find the variable name a node is assigned to.
 *
 * When `traversePathCalls` is true, continues traversal through safe path
 * utility calls (path.join, path.resolve) but stops at arbitrary calls.
 * Used for built-in refs that may be arguments to path.join() etc.
 */
function findAssignedVariableName(node: ts.Node, traversePathCalls = false): string | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      return current.name.text;
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(current.left)
    ) {
      return current.left.text;
    }
    // Bail at expression types that combine values — the safe builtin
    // may be mixed with unsafe data (template literals, string concat, constructors)
    if (ts.isBinaryExpression(current)) return null; // non-= binary (+ etc.) — = already handled above
    if (ts.isTemplateExpression(current)) return null;
    if (ts.isNewExpression(current)) return null;
    if (ts.isCallExpression(current)) {
      if (traversePathCalls && isPathJoinOrResolve(current)) {
        current = current.parent;
        continue;
      }
      return null;
    }
    current = current.parent;
  }

  return null;
}
