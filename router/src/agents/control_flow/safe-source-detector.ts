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
  declarationKey: string | null;
}

interface AssignedBinding {
  variableName: string;
  declarationKey: string | null;
  declarationLine: number;
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

  // Patterns 2-4 share declaration resolution, so handle them in one scope-aware pass.
  detectScopedSafeSources(sourceFile, filePath, safeConstArrayDecls, safeSources);

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
  const safeDeclarationKeys = new Set<string>();
  for (const ss of safeSources) {
    if (ss.declarationKey) safeDeclarationKeys.add(ss.declarationKey);
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
    if (source.declarationKey && safeDeclarationKeys.has(source.declarationKey)) {
      return false;
    }
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
          declarationKey: declKey,
          confidence: 'high',
          preventsTaintFor: ALL_VULN_TYPES,
        });
      } else if (ts.isNumericLiteral(init)) {
        safeSources.push({
          patternId: 'constant-literal-number',
          variableName: varName,
          location: { file: filePath, line: line + 1 },
          declarationKey: declKey,
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
          declarationKey: declKey,
          confidence: 'high',
          preventsTaintFor: ALL_VULN_TYPES,
        });
      } else if (ts.isArrayLiteralExpression(init) && isAllLiteralElements(init)) {
        safeConstArrayDecls.add(declKey);
        safeSources.push({
          patternId: 'constant-literal-array',
          variableName: varName,
          location: { file: filePath, line: line + 1 },
          declarationKey: declKey,
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

function detectScopedSafeSources(
  sourceFile: ts.SourceFile,
  filePath: string,
  safeConstArrayDecls: Set<string>,
  safeSources: SafeSourceInstance[]
): void {
  const scope = new ScopeStack();

  const visit = (node: ts.Node): void => {
    const isScope = isScopeNode(node);
    if (isScope) scope.enterScope(node);

    registerNodeDeclarations(node, scope);

    if (ts.isIdentifier(node)) {
      const name = node.text;
      if (name === '__dirname' || name === '__filename') {
        if (!isInsideUnsafePathCall(node)) {
          const patternId = name === '__dirname' ? 'builtin-dirname' : 'builtin-filename';
          const binding = findAssignedBinding(node, sourceFile, scope, true);
          if (binding) {
            safeSources.push({
              patternId,
              variableName: binding.variableName,
              location: { file: filePath, line: binding.declarationLine },
              declarationKey: binding.declarationKey,
              confidence: 'high',
              preventsTaintFor: ['path_traversal'],
            });
          }
        }
      }
    }

    if (ts.isPropertyAccessExpression(node) && isImportMetaProperty(node)) {
      const propName = node.name.text;
      if (propName === 'dirname' || propName === 'url') {
        if (!isInsideUnsafePathCall(node)) {
          const binding = findAssignedBinding(node, sourceFile, scope, true);
          if (binding) {
            safeSources.push({
              patternId:
                propName === 'dirname' ? 'builtin-import-meta-dirname' : 'builtin-import-meta-url',
              variableName: binding.variableName,
              location: { file: filePath, line: binding.declarationLine },
              declarationKey: binding.declarationKey,
              confidence: 'high',
              preventsTaintFor: ['path_traversal'],
            });
          }
        }
      }
    }

    if (ts.isCallExpression(node) && isReaddirCall(node)) {
      const arg = node.arguments[0];
      if (arg && isSafePathArg(arg)) {
        const binding = findAssignedBinding(node, sourceFile, scope);
        if (binding) {
          safeSources.push({
            patternId: 'safe-readdir',
            variableName: binding.variableName,
            location: { file: filePath, line: binding.declarationLine },
            declarationKey: binding.declarationKey,
            confidence: 'medium',
            preventsTaintFor: ['path_traversal'],
          });
        }
      }
    }

    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const decl = scope.resolveDeclaration(node.expression.text);
      const declKey = decl ? nodeIdentityKey(decl, sourceFile) : null;
      if (declKey && safeConstArrayDecls.has(declKey)) {
        const binding = findAssignedBinding(node, sourceFile, scope);
        if (binding) {
          safeSources.push({
            patternId: 'constant-element-access',
            variableName: binding.variableName,
            location: { file: filePath, line: binding.declarationLine },
            declarationKey: binding.declarationKey,
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

/**
 * Check if a PropertyAccessExpression is on `import.meta`.
 */
function isImportMetaProperty(node: ts.PropertyAccessExpression): boolean {
  return node.expression.kind === ts.SyntaxKind.MetaProperty;
}

/**
 * Check if a call expression is fs.readdirSync or fs.promises.readdir.
 */
function isReaddirCall(node: ts.CallExpression): boolean {
  const expr = node.expression;

  if (ts.isPropertyAccessExpression(expr)) {
    const methodName = expr.name.text;
    if (methodName === 'readdirSync' || methodName === 'readdir') {
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
 */
function isSafePathArg(node: ts.Node): boolean {
  if (ts.isStringLiteral(node)) return true;

  if (ts.isIdentifier(node) && (node.text === '__dirname' || node.text === '__filename')) {
    return true;
  }

  if (ts.isPropertyAccessExpression(node) && isImportMetaProperty(node)) {
    const propName = node.name.text;
    return propName === 'dirname' || propName === 'url';
  }

  if (ts.isCallExpression(node) && isPathJoinOrResolve(node)) {
    return node.arguments.every((arg) => isSafePathArg(arg));
  }

  return false;
}

/**
 * Check if a node is inside a path.join/resolve call that has any unsafe arguments.
 */
function isInsideUnsafePathCall(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (ts.isCallExpression(current) && isPathJoinOrResolve(current)) {
      return !current.arguments.every((arg) => isSafePathArg(arg));
    }
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
function findAssignedBinding(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  scope: ScopeStack,
  traversePathCalls = false
): AssignedBinding | null {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) {
      const declLine =
        sourceFile.getLineAndCharacterOfPosition(current.getStart(sourceFile)).line + 1;
      return {
        variableName: current.name.text,
        declarationKey: nodeIdentityKey(current, sourceFile),
        declarationLine: declLine,
      };
    }
    if (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(current.left)
    ) {
      const decl = scope.resolveDeclaration(current.left.text);
      const target = decl ?? current.left;
      const declLine =
        sourceFile.getLineAndCharacterOfPosition(target.getStart(sourceFile)).line + 1;
      return {
        variableName: current.left.text,
        declarationKey: decl ? nodeIdentityKey(decl, sourceFile) : null,
        declarationLine: declLine,
      };
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
