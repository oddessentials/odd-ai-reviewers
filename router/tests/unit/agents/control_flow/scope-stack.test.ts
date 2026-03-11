/**
 * ScopeStack Unit Tests
 *
 * Tests for the lexical scope stack that provides declaration-identity
 * resolution for scope-aware variable tracking.
 */

import { describe, it, expect, assert } from 'vitest';
import ts from 'typescript';
import {
  ScopeStack,
  isScopeNode,
  nodeIdentityKey,
  walkWithScope,
  buildDeclarationMap,
  extractBindingNames,
} from '../../../../src/agents/control_flow/scope-stack.js';

// =============================================================================
// Helpers
// =============================================================================

function parse(source: string, filename = 'test.ts'): ts.SourceFile {
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
}

// =============================================================================
// nodeIdentityKey
// =============================================================================

describe('nodeIdentityKey', () => {
  it('should produce deterministic file:line:col strings', () => {
    const sf = parse('const x = 1;\nconst y = 2;');
    const stmts = sf.statements;
    const decl0 = (stmts[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl0, 'expected decl0');
    const decl1 = (stmts[1] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl1, 'expected decl1');

    const key0 = nodeIdentityKey(decl0, sf);
    const key1 = nodeIdentityKey(decl1, sf);

    expect(key0).toBe('test.ts:1:6');
    expect(key1).toBe('test.ts:2:6');
    // Calling again produces the same result
    expect(nodeIdentityKey(decl0, sf)).toBe(key0);
  });

  it('should differentiate nodes on the same line at different columns', () => {
    // Two declarations on the same line: `const a = 1, b = 2;`
    const sf = parse('const a = 1, b = 2;');
    const declList = (sf.statements[0] as ts.VariableStatement).declarationList;
    const declA = declList.declarations[0];
    assert(declA, 'expected declA');
    const declB = declList.declarations[1];
    assert(declB, 'expected declB');
    const keyA = nodeIdentityKey(declA, sf);
    const keyB = nodeIdentityKey(declB, sf);

    expect(keyA).not.toBe(keyB);
  });
});

// =============================================================================
// isScopeNode
// =============================================================================

describe('isScopeNode', () => {
  it('should recognize function declarations', () => {
    const sf = parse('function foo() {}');
    const fn = sf.statements[0];
    assert(fn, 'expected statement');
    expect(isScopeNode(fn)).toBe(true);
  });

  it('should recognize arrow functions', () => {
    const sf = parse('const f = () => {};');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const arrow = decl.initializer;
    assert(arrow, 'expected initializer');
    expect(isScopeNode(arrow)).toBe(true);
  });

  it('should recognize blocks', () => {
    const sf = parse('{ const x = 1; }');
    const block = sf.statements[0];
    assert(block, 'expected statement');
    expect(isScopeNode(block)).toBe(true);
  });

  it('should recognize for statements', () => {
    const sf = parse('for (let i = 0; i < 10; i++) {}');
    const forStmt = sf.statements[0];
    assert(forStmt, 'expected statement');
    expect(isScopeNode(forStmt)).toBe(true);
  });

  it('should recognize source files', () => {
    const sf = parse('const x = 1;');
    expect(isScopeNode(sf)).toBe(true);
  });

  it('should NOT recognize variable statements', () => {
    const sf = parse('const x = 1;');
    const varStmt = sf.statements[0];
    assert(varStmt, 'expected statement');
    expect(isScopeNode(varStmt)).toBe(false);
  });

  it('should recognize catch clauses', () => {
    const sf = parse('try {} catch (e) {}');
    let foundCatch = false;
    const visit = (node: ts.Node): void => {
      if (ts.isCatchClause(node)) {
        foundCatch = true;
        expect(isScopeNode(node)).toBe(true);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    expect(foundCatch).toBe(true);
  });

  it('should recognize function expressions', () => {
    const sf = parse('const f = function() {};');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const funcExpr = decl.initializer;
    assert(funcExpr, 'expected initializer');
    expect(isScopeNode(funcExpr)).toBe(true);
  });

  it('should recognize class expressions', () => {
    const sf = parse('const C = class {};');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const classExpr = decl.initializer;
    assert(classExpr, 'expected initializer');
    expect(isScopeNode(classExpr)).toBe(true);
  });

  it('should recognize for-of statements', () => {
    const sf = parse('for (const x of []) {}');
    const forOf = sf.statements[0];
    assert(forOf, 'expected statement');
    expect(isScopeNode(forOf)).toBe(true);
  });

  it('should recognize for-in statements', () => {
    const sf = parse('for (const x in {}) {}');
    const forIn = sf.statements[0];
    assert(forIn, 'expected statement');
    expect(isScopeNode(forIn)).toBe(true);
  });
});

// =============================================================================
// ScopeStack — enterScope / leaveScope
// =============================================================================

describe('ScopeStack — enterScope / leaveScope', () => {
  it('should track depth correctly', () => {
    const scope = new ScopeStack();
    const sf = parse('const x = 1;');

    expect(scope.depth).toBe(0);

    scope.enterScope(sf);
    expect(scope.depth).toBe(1);

    scope.enterScope(sf); // inner scope
    expect(scope.depth).toBe(2);

    scope.leaveScope();
    expect(scope.depth).toBe(1);

    scope.leaveScope();
    expect(scope.depth).toBe(0);
  });
});

// =============================================================================
// ScopeStack — addDeclaration / resolveDeclaration
// =============================================================================

describe('ScopeStack — addDeclaration / resolveDeclaration', () => {
  it('should find declarations in the current scope', () => {
    const scope = new ScopeStack();
    const sf = parse('const x = 1;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');

    scope.enterScope(sf);
    scope.addDeclaration('x', decl);

    const resolved = scope.resolveDeclaration('x');
    expect(resolved).toBe(decl);
  });

  it('should find declarations in outer scopes', () => {
    const scope = new ScopeStack();
    const sf = parse('const x = 1;\nfunction f() {}');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const fn = sf.statements[1];
    assert(fn, 'expected function statement');

    scope.enterScope(sf);
    scope.addDeclaration('x', decl);
    scope.enterScope(fn); // inner scope without x

    const resolved = scope.resolveDeclaration('x');
    expect(resolved).toBe(decl);
  });

  it('should resolve to innermost declaration when shadowed', () => {
    const sf = parse(`
const x = 1;
function f() {
  const x = 2;
}
`);
    const outerDecl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(outerDecl, 'expected outer declaration');
    const fn = sf.statements[1] as ts.FunctionDeclaration;
    // The inner const x = 2 is inside the function body block
    const innerBlock = fn.body;
    assert(innerBlock, 'expected function body');
    const innerDecl = (innerBlock.statements[0] as ts.VariableStatement).declarationList
      .declarations[0];
    assert(innerDecl, 'expected inner declaration');

    const scope = new ScopeStack();
    scope.enterScope(sf);
    scope.addDeclaration('x', outerDecl);
    scope.enterScope(fn);
    scope.enterScope(innerBlock);
    scope.addDeclaration('x', innerDecl);

    // Should resolve to inner
    const resolved = scope.resolveDeclaration('x');
    expect(resolved).toBe(innerDecl);
    expect(resolved).not.toBe(outerDecl);
  });

  it('should resolve to outer after leaving inner scope', () => {
    const sf = parse(`
const x = 1;
function f() {
  const x = 2;
}
`);
    const outerDecl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(outerDecl, 'expected outer declaration');
    const fn = sf.statements[1] as ts.FunctionDeclaration;
    const innerBlock = fn.body;
    assert(innerBlock, 'expected function body');
    const innerDecl = (innerBlock.statements[0] as ts.VariableStatement).declarationList
      .declarations[0];
    assert(innerDecl, 'expected inner declaration');

    const scope = new ScopeStack();
    scope.enterScope(sf);
    scope.addDeclaration('x', outerDecl);
    scope.enterScope(fn);
    scope.enterScope(innerBlock);
    scope.addDeclaration('x', innerDecl);

    // Currently resolves to inner
    expect(scope.resolveDeclaration('x')).toBe(innerDecl);

    // Leave inner scopes
    scope.leaveScope(); // block
    scope.leaveScope(); // function

    // Now resolves to outer
    expect(scope.resolveDeclaration('x')).toBe(outerDecl);
  });

  it('should return undefined for undeclared names', () => {
    const scope = new ScopeStack();
    const sf = parse('const x = 1;');
    scope.enterScope(sf);

    expect(scope.resolveDeclaration('y')).toBeUndefined();
  });
});

// =============================================================================
// ScopeStack — isInScope
// =============================================================================

describe('ScopeStack — isInScope', () => {
  it('should return true for declarations in current scope chain', () => {
    const sf = parse('const x = 1;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');

    const scope = new ScopeStack();
    scope.enterScope(sf);
    scope.addDeclaration('x', decl);

    expect(scope.isInScope(decl)).toBe(true);
  });

  it('should return false for declarations not in scope chain', () => {
    const sf = parse('const x = 1;\nconst y = 2;');
    const declX = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(declX, 'expected declX');
    const declY = (sf.statements[1] as ts.VariableStatement).declarationList.declarations[0];
    assert(declY, 'expected declY');

    const scope = new ScopeStack();
    scope.enterScope(sf);
    scope.addDeclaration('x', declX);
    // y is NOT added to scope

    expect(scope.isInScope(declX)).toBe(true);
    expect(scope.isInScope(declY)).toBe(false);
  });
});

// =============================================================================
// walkWithScope
// =============================================================================

describe('walkWithScope', () => {
  it('should invoke callback for every node with scope context', () => {
    const sf = parse(`
const outer = 1;
function f() {
  const inner = 2;
}
`);

    const identifiers: { name: string; resolvedKey: string | undefined }[] = [];

    walkWithScope(sf, (node, scope, sourceFile) => {
      if (ts.isIdentifier(node) && node.text !== 'f') {
        const decl = scope.resolveDeclaration(node.text);
        identifiers.push({
          name: node.text,
          resolvedKey: decl ? nodeIdentityKey(decl, sourceFile) : undefined,
        });
      }
    });

    // 'outer' identifier should resolve to its declaration
    const outerRef = identifiers.find((id) => id.name === 'outer');
    expect(outerRef).toBeDefined();
    expect(outerRef?.resolvedKey).toBeDefined();

    // 'inner' identifier should resolve to its declaration
    const innerRef = identifiers.find((id) => id.name === 'inner');
    expect(innerRef).toBeDefined();
    expect(innerRef?.resolvedKey).toBeDefined();

    // Their keys should be different
    expect(outerRef?.resolvedKey).not.toBe(innerRef?.resolvedKey);
  });

  it('should resolve shadowed variables to inner declaration', () => {
    const sf = parse(`
const x = "outer";
function f() {
  const x = "inner";
  console.log(x);
}
`);

    const xRefs: string[] = [];

    walkWithScope(sf, (node, scope, sourceFile) => {
      if (ts.isIdentifier(node) && node.text === 'x') {
        const decl = scope.resolveDeclaration('x');
        if (decl) {
          xRefs.push(nodeIdentityKey(decl, sourceFile));
        }
      }
    });

    // There should be references to x: at least the outer declaration, inner declaration, and the console.log(x) reference
    // The console.log(x) reference should resolve to the inner declaration
    expect(xRefs.length).toBeGreaterThanOrEqual(2);

    // Get unique keys
    const unique = [...new Set(xRefs)];
    expect(unique.length).toBe(2); // two distinct declarations
  });
});

// =============================================================================
// buildDeclarationMap
// =============================================================================

describe('buildDeclarationMap', () => {
  it('should collect all declarations in the file', () => {
    const sf = parse(`
const a = 1;
let b = 2;
function f(c: number) {
  const d = 3;
}
`);

    const map = buildDeclarationMap(sf);

    // Should have declarations for a, b, f, c, d
    expect(map.size).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// extractBindingNames — Destructuring
// =============================================================================

describe('extractBindingNames', () => {
  it('should extract simple identifier', () => {
    const sf = parse('const x = 1;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names).toHaveLength(1);
    expect(names[0]?.name).toBe('x');
  });

  it('should extract from object destructuring', () => {
    const sf = parse('const { a, b } = obj;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names.map((n) => n.name)).toEqual(['a', 'b']);
  });

  it('should extract renamed bindings from object destructuring', () => {
    const sf = parse('const { a: x, b: y } = obj;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names.map((n) => n.name)).toEqual(['x', 'y']);
  });

  it('should extract from array destructuring', () => {
    const sf = parse('const [a, b] = arr;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names.map((n) => n.name)).toEqual(['a', 'b']);
  });

  it('should skip holes in array destructuring', () => {
    const sf = parse('const [, , c] = arr;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names.map((n) => n.name)).toEqual(['c']);
  });

  it('should handle nested destructuring', () => {
    const sf = parse('const { a: [b, c] } = obj;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names.map((n) => n.name)).toEqual(['b', 'c']);
  });

  it('should handle rest elements in array destructuring', () => {
    const sf = parse('const [a, ...rest] = arr;');
    const decl = (sf.statements[0] as ts.VariableStatement).declarationList.declarations[0];
    assert(decl, 'expected declaration');
    const names = extractBindingNames(decl.name);
    expect(names.map((n) => n.name)).toEqual(['a', 'rest']);
  });
});

// =============================================================================
// var Hoisting
// =============================================================================

describe('var hoisting', () => {
  it('should hoist var to function scope, not block scope', () => {
    const sf = parse(`
function f() {
  if (true) {
    var ITEMS = [];
    ITEMS[0] = 'x';
  }
  console.log(ITEMS);
}
`);

    // Walk with scope and verify ITEMS resolves outside the if-block
    const resolvedOutsideBlock: boolean[] = [];

    walkWithScope(sf, (node, scope) => {
      if (ts.isIdentifier(node) && node.text === 'ITEMS') {
        const decl = scope.resolveDeclaration('ITEMS');
        resolvedOutsideBlock.push(decl !== undefined);
      }
    });

    // All references to ITEMS should resolve (even the one in console.log outside the block)
    expect(resolvedOutsideBlock.every((r) => r === true)).toBe(true);
    expect(resolvedOutsideBlock.length).toBeGreaterThanOrEqual(2);
  });

  it('should NOT hoist let/const to function scope', () => {
    const sf = parse(`
function f() {
  {
    const x = 1;
  }
  console.log(x);
}
`);

    let resolvedOutside = false;

    walkWithScope(sf, (node, scope) => {
      // The console.log(x) reference — x is at the function body scope, outside the block
      if (
        ts.isIdentifier(node) &&
        node.text === 'x' &&
        node.parent &&
        ts.isCallExpression(node.parent)
      ) {
        const decl = scope.resolveDeclaration('x');
        resolvedOutside = decl !== undefined;
      }
    });

    // x declared with const should NOT be visible outside its block
    expect(resolvedOutside).toBe(false);
  });

  it('should scope var to source file when not inside a function', () => {
    const sf = parse(`
if (true) {
  var GLOBAL = 1;
}
console.log(GLOBAL);
`);

    let resolvedAtTopLevel = false;

    walkWithScope(sf, (node, scope) => {
      // Match the GLOBAL identifier that is an argument to console.log()
      if (
        ts.isIdentifier(node) &&
        node.text === 'GLOBAL' &&
        node.parent &&
        ts.isCallExpression(node.parent)
      ) {
        resolvedAtTopLevel = scope.resolveDeclaration('GLOBAL') !== undefined;
      }
    });

    expect(resolvedAtTopLevel).toBe(true);
  });
});

// =============================================================================
// Catch Clause Scoping
// =============================================================================

describe('catch clause scoping', () => {
  it('should scope catch variable to catch block', () => {
    const sf = parse(`
const e = "outer";
try {
  throw new Error();
} catch (e) {
  console.log(e);
}
console.log(e);
`);

    const eKeys: string[] = [];

    walkWithScope(sf, (node, scope, sourceFile) => {
      if (ts.isIdentifier(node) && node.text === 'e') {
        const decl = scope.resolveDeclaration('e');
        if (decl) {
          eKeys.push(nodeIdentityKey(decl, sourceFile));
        }
      }
    });

    // Should have at least 2 different declaration keys (outer const e vs catch e)
    const unique = [...new Set(eKeys)];
    expect(unique.length).toBe(2);
  });
});

// =============================================================================
// For-of/for-in Loop Variable Scoping
// =============================================================================

describe('for-of/for-in loop variable scoping', () => {
  it('should scope for-of loop variable to loop body', () => {
    const sf = parse(`
const ITEMS = ["safe"];
for (const ITEMS of someArray) {
  console.log(ITEMS);
}
console.log(ITEMS);
`);

    const itemsKeys: string[] = [];

    walkWithScope(sf, (node, scope, sourceFile) => {
      if (ts.isIdentifier(node) && node.text === 'ITEMS') {
        const decl = scope.resolveDeclaration('ITEMS');
        if (decl) {
          itemsKeys.push(nodeIdentityKey(decl, sourceFile));
        }
      }
    });

    // Should have two different declaration keys
    const unique = [...new Set(itemsKeys)];
    expect(unique.length).toBe(2);
  });
});

// =============================================================================
// Destructuring in walkWithScope
// =============================================================================

describe('destructuring in walkWithScope', () => {
  it('should register destructured object bindings', () => {
    const sf = parse(`
const { a, b } = obj;
console.log(a);
`);

    let resolved = false;

    walkWithScope(sf, (node, scope) => {
      // Match `a` identifier when it's an argument to console.log()
      if (
        ts.isIdentifier(node) &&
        node.text === 'a' &&
        node.parent &&
        ts.isCallExpression(node.parent)
      ) {
        resolved = scope.resolveDeclaration('a') !== undefined;
      }
    });

    expect(resolved).toBe(true);
  });

  it('should register destructured array bindings', () => {
    const sf = parse(`
const [x, y] = arr;
console.log(x);
`);

    let resolved = false;

    walkWithScope(sf, (node, scope) => {
      // Match `x` identifier when it's an argument to console.log()
      if (
        ts.isIdentifier(node) &&
        node.text === 'x' &&
        node.parent &&
        ts.isCallExpression(node.parent)
      ) {
        resolved = scope.resolveDeclaration('x') !== undefined;
      }
    });

    expect(resolved).toBe(true);
  });
});

// =============================================================================
// Namespace imports / re-exports (graceful handling)
// =============================================================================

describe('graceful handling of unresolvable identifiers', () => {
  it('should return undefined for imported identifiers not declared locally', () => {
    const sf = parse(`
import * as fs from 'fs';
fs.readFileSync('test');
`);

    let resolvedFs = false;

    walkWithScope(sf, (node, scope) => {
      if (ts.isIdentifier(node) && node.text === 'fs') {
        // Import declarations are not variable declarations, so fs won't resolve
        if (scope.resolveDeclaration('fs') !== undefined) {
          resolvedFs = true;
        }
      }
    });

    // fs should NOT resolve (import * is not a variable declaration)
    expect(resolvedFs).toBe(false);
  });

  it('should not crash when same name is used as import and variable', () => {
    // This is invalid TS but shouldn't crash the scope stack
    const sf = parse(`
const fs = require('fs');
fs.readFileSync('test');
`);

    let resolved = false;

    walkWithScope(sf, (node, scope) => {
      if (
        ts.isIdentifier(node) &&
        node.text === 'fs' &&
        ts.isPropertyAccessExpression(node.parent)
      ) {
        resolved = scope.resolveDeclaration('fs') !== undefined;
      }
    });

    expect(resolved).toBe(true);
  });
});
