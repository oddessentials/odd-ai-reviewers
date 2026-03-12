/**
 * Safe-Source Detector Tests
 *
 * Tests for safe-source recognition (Patterns 1-4) that prevents
 * false positives by identifying provably non-tainted data sources.
 */

import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import {
  detectSafeSources,
  filterSafeSources,
} from '../../../../src/agents/control_flow/safe-source-detector.js';
import {
  SAFE_SOURCE_PATTERNS,
  SAFE_SOURCE_REGISTRY_VERSION,
  EXPECTED_PATTERN_COUNT,
} from '../../../../src/agents/control_flow/safe-source-patterns.js';

import {
  constStringLiteral,
  constNumberLiteral,
  constBooleanLiteral,
  constStringArray,
  constMixedArray,
  dirnameUsage,
  filenameUsage,
  importMetaDirname,
  importMetaUrl,
  readdirSyncBuiltinArg,
  readdirSyncStringArg,
  readdirSyncPathJoinSafeArgs,
  constArrayElementAccess,
  envVariable,
  typeAssertion,
  importedConstant,
  codeComment,
  objectLiteral,
  templateWithInterpolation,
  functionReturnValue,
  aliasedConstant,
  letMutable,
  constInsideFunction,
  mutatedConst,
  readdirUnsafeArg,
  readdirBinaryExpression,
  nestedScopeBuiltin,
  siblingScopeBuiltin,
  shadowedConstArray,
  directOuterMutation,
  propertyMutationInvalidates,
  blockScopedMutation,
  nestedFunctionOuterRef,
  callbackShadowNoPoison,
  varHoistingShadow,
  forOfLoopShadow,
  dirnamePathJoinUnsafe,
  filenamePathResolveUnsafe,
  importMetaDirnamePathJoinUnsafe,
  dirnamePathJoinAllSafe,
  nestedPathJoinUnsafe,
  dirnameTemplateLiteralUnsafe,
  dirnameStringConcatUnsafe,
  importMetaUrlNewUrlUnsafe,
} from './fixtures/safe-source-inputs.js';

// =============================================================================
// Helpers
// =============================================================================

function parse(source: string, filename = 'test.ts'): ts.SourceFile {
  return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
}

function detect(source: string, filename = 'test.ts') {
  return detectSafeSources(parse(source, filename), filename);
}

function _hasPattern(results: ReturnType<typeof detect>, patternId: string): boolean {
  return results.some((r) => r.patternId === patternId);
}

function findByVar(results: ReturnType<typeof detect>, varName: string) {
  return results.find((r) => r.variableName === varName);
}

// =============================================================================
// Registry Integrity
// =============================================================================

describe('Safe-Source Pattern Registry', () => {
  it('should export the correct registry version', () => {
    expect(SAFE_SOURCE_REGISTRY_VERSION).toBe('1.0');
  });

  it('should have exactly EXPECTED_PATTERN_COUNT patterns', () => {
    expect(SAFE_SOURCE_PATTERNS.length).toBe(EXPECTED_PATTERN_COUNT);
    expect(SAFE_SOURCE_PATTERNS.length).toBe(9);
  });

  it('should have unique IDs for all patterns', () => {
    const ids = SAFE_SOURCE_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should include all expected pattern IDs', () => {
    const ids = SAFE_SOURCE_PATTERNS.map((p) => p.id);
    expect(ids).toContain('constant-literal-string');
    expect(ids).toContain('constant-literal-number');
    expect(ids).toContain('constant-literal-array');
    expect(ids).toContain('builtin-dirname');
    expect(ids).toContain('builtin-filename');
    expect(ids).toContain('builtin-import-meta-dirname');
    expect(ids).toContain('builtin-import-meta-url');
    expect(ids).toContain('safe-readdir');
    expect(ids).toContain('constant-element-access');
  });
});

// =============================================================================
// Pattern 1: Constant Literal Declarations
// =============================================================================

describe('Pattern 1: Constant Literal Declarations', () => {
  it('should detect module-scope const string literal', () => {
    const results = detect(constStringLiteral);
    const entry = findByVar(results, 'GREETING');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-string');
    expect(entry?.confidence).toBe('high');
  });

  it('should detect module-scope const number literal', () => {
    const results = detect(constNumberLiteral);
    const entry = findByVar(results, 'PORT');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-number');
  });

  it('should detect module-scope const boolean literal', () => {
    const results = detect(constBooleanLiteral);
    const entry = findByVar(results, 'ENABLED');
    expect(entry).toBeDefined();
    expect(entry?.confidence).toBe('high');
  });

  it('should detect module-scope const string array', () => {
    const results = detect(constStringArray);
    const entry = findByVar(results, 'ALLOWED');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');
  });

  it('should detect module-scope const mixed literal array', () => {
    const results = detect(constMixedArray);
    const entry = findByVar(results, 'MIXED');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');
  });

  it('should prevent taint for all vulnerability types', () => {
    const results = detect(constStringLiteral);
    const entry = findByVar(results, 'GREETING');
    expect(entry?.preventsTaintFor).toContain('injection');
    expect(entry?.preventsTaintFor).toContain('xss');
    expect(entry?.preventsTaintFor).toContain('path_traversal');
    expect(entry?.preventsTaintFor).toContain('ssrf');
  });

  it('should NOT detect let declarations', () => {
    const results = detect(letMutable);
    expect(findByVar(results, 'MUTABLE')).toBeUndefined();
  });

  it('should NOT detect const inside function (not module scope)', () => {
    const results = detect(constInsideFunction);
    expect(findByVar(results, 'INNER')).toBeUndefined();
  });

  it('should NOT detect mutated const arrays', () => {
    const results = detect(mutatedConst);
    expect(findByVar(results, 'ITEMS')).toBeUndefined();
  });

  it('should NOT detect object literals', () => {
    const results = detect(objectLiteral);
    expect(findByVar(results, 'OBJ')).toBeUndefined();
  });

  it('should NOT detect template literals with interpolation', () => {
    const results = detect(templateWithInterpolation);
    // "name" might be safe, but TPL (template) should not be
    expect(findByVar(results, 'TPL')).toBeUndefined();
  });

  it('should NOT detect function return values', () => {
    const results = detect(functionReturnValue);
    expect(findByVar(results, 'RET')).toBeUndefined();
  });

  it('should NOT detect aliased constants', () => {
    const results = detect(aliasedConstant);
    // ORIGINAL is safe (string literal), but ALIAS is not (variable reference)
    expect(findByVar(results, 'ORIGINAL')).toBeDefined();
    expect(findByVar(results, 'ALIAS')).toBeUndefined();
  });
});

// =============================================================================
// Pattern 2: Built-in Directory References
// =============================================================================

describe('Pattern 2: Built-in Directory References', () => {
  it('should detect __dirname usage', () => {
    const results = detect(dirnameUsage);
    const entry = findByVar(results, 'dir');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('builtin-dirname');
    expect(entry?.preventsTaintFor).toEqual(['path_traversal']);
  });

  it('should detect __filename usage', () => {
    const results = detect(filenameUsage);
    const entry = findByVar(results, 'file');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('builtin-filename');
    expect(entry?.preventsTaintFor).toEqual(['path_traversal']);
  });

  it('should detect import.meta.dirname', () => {
    const results = detect(importMetaDirname);
    const entry = findByVar(results, 'dir');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('builtin-import-meta-dirname');
  });

  it('should detect import.meta.url', () => {
    const results = detect(importMetaUrl);
    const entry = findByVar(results, 'url');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('builtin-import-meta-url');
  });

  it('should only prevent taint for path_traversal', () => {
    const results = detect(dirnameUsage);
    const entry = findByVar(results, 'dir');
    expect(entry?.preventsTaintFor).toEqual(['path_traversal']);
    expect(entry?.preventsTaintFor).not.toContain('injection');
    expect(entry?.preventsTaintFor).not.toContain('xss');
  });

  it('should NOT mark path.join(__dirname, userInput) as safe', () => {
    const results = detect(dirnamePathJoinUnsafe);
    // The result variable `p` must NOT be a safe source because user input is mixed in
    expect(findByVar(results, 'p')).toBeUndefined();
  });

  it('should NOT mark path.resolve(__filename, userInput) as safe', () => {
    const results = detect(filenamePathResolveUnsafe);
    expect(findByVar(results, 'p')).toBeUndefined();
  });

  it('should NOT mark path.join(import.meta.dirname, userInput) as safe', () => {
    const results = detect(importMetaDirnamePathJoinUnsafe);
    expect(findByVar(results, 'p')).toBeUndefined();
  });

  it('should still mark path.join(__dirname, "safe", "safe") as safe', () => {
    const results = detect(dirnamePathJoinAllSafe);
    const entry = findByVar(results, 'p');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('builtin-dirname');
  });

  it('should NOT mark nested path.join with unsafe inner args as safe', () => {
    const results = detect(nestedPathJoinUnsafe);
    expect(findByVar(results, 'p')).toBeUndefined();
  });

  it('should NOT mark template literal mixing __dirname with user input as safe', () => {
    const results = detect(dirnameTemplateLiteralUnsafe);
    expect(findByVar(results, 'p')).toBeUndefined();
  });

  it('should NOT mark string concatenation of __dirname with user input as safe', () => {
    const results = detect(dirnameStringConcatUnsafe);
    expect(findByVar(results, 'p')).toBeUndefined();
  });

  it('should NOT mark new URL(userInput, import.meta.url) as safe', () => {
    const results = detect(importMetaUrlNewUrlUnsafe);
    expect(findByVar(results, 'target')).toBeUndefined();
  });
});

// =============================================================================
// Pattern 3: Safe Directory Listing Returns
// =============================================================================

describe('Pattern 3: Safe Directory Listing Returns', () => {
  it('should detect readdirSync with __dirname arg', () => {
    const results = detect(readdirSyncBuiltinArg);
    const entry = findByVar(results, 'files');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('safe-readdir');
    expect(entry?.confidence).toBe('medium');
  });

  it('should detect readdirSync with string literal arg', () => {
    const results = detect(readdirSyncStringArg);
    const entry = findByVar(results, 'files');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('safe-readdir');
  });

  it('should detect readdirSync with path.join of safe args', () => {
    const results = detect(readdirSyncPathJoinSafeArgs);
    const entry = findByVar(results, 'files');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('safe-readdir');
  });

  it('should NOT detect readdirSync with variable arg', () => {
    const results = detect(readdirUnsafeArg);
    expect(results.filter((r) => r.patternId === 'safe-readdir')).toHaveLength(0);
  });

  it('should NOT detect readdirSync with binary expression arg', () => {
    const results = detect(readdirBinaryExpression);
    expect(results.filter((r) => r.patternId === 'safe-readdir')).toHaveLength(0);
  });
});

// =============================================================================
// Pattern 4: Constant Array Element Access
// =============================================================================

describe('Pattern 4: Constant Array Element Access', () => {
  it('should detect element access on safe const array', () => {
    const results = detect(constArrayElementAccess);
    const entry = findByVar(results, 'picked');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-element-access');
    expect(entry?.preventsTaintFor).toContain('injection');
    expect(entry?.preventsTaintFor).toContain('xss');
  });

  it('should NOT detect element access on aliased array', () => {
    const source = `
const ITEMS = ["a", "b"];
const alias = ITEMS;
const picked = alias[0];
`;
    const results = detect(source);
    // alias is not in safeConstArrayNames (it's a variable reference, not a literal array)
    expect(
      results.find((r) => r.variableName === 'picked' && r.patternId === 'constant-element-access')
    ).toBeUndefined();
  });
});

// =============================================================================
// Scope Isolation (Regression: cross-scope name collision)
// =============================================================================

describe('Scope Isolation', () => {
  it('should NOT filter outer tainted var when inner scope has safe builtin with same name', () => {
    const results = detect(nestedScopeBuiltin);
    // The inner `const dir = __dirname` should be detected as safe
    const safeDir = results.find((r) => r.patternId === 'builtin-dirname');
    expect(safeDir).toBeDefined();

    // But filtering should NOT remove the outer `dir` from sources
    // because it's at a different declaration site (different line)
    const sources = [
      { location: { file: 'test.ts', line: 2 }, expression: 'req.query.dir', variableName: 'dir' },
    ];
    const filtered = filterSafeSources(sources, results);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.variableName).toBe('dir');
  });

  it('should NOT filter tainted var in sibling scope when other sibling has safe builtin', () => {
    const results = detect(siblingScopeBuiltin);
    const safeDir = results.find((r) => r.patternId === 'builtin-dirname');
    expect(safeDir).toBeDefined();

    // Tainted `dir` in handler() should NOT be filtered
    const sources = [
      { location: { file: 'test.ts', line: 3 }, expression: 'req.query.dir', variableName: 'dir' },
    ];
    const filtered = filterSafeSources(sources, results);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.variableName).toBe('dir');
  });

  it('should still filter the exact safe declaration at matching line', () => {
    const results = detect(nestedScopeBuiltin);
    const safeDir = results.find((r) => r.patternId === 'builtin-dirname');
    expect(safeDir).toBeDefined();

    // A source at the SAME line as the safe detection SHOULD be filtered
    const sources = [
      {
        location: { file: 'test.ts', line: safeDir?.location.line ?? 0 },
        expression: '__dirname',
        variableName: 'dir',
      },
    ];
    const filtered = filterSafeSources(sources, results);
    expect(filtered).toHaveLength(0);
  });

  it('should record safe-source line from declaration site, not from a later reference', () => {
    // This fixture has:
    //   line 2: const dir = req.query.dir;    (taint source — declaration)
    //   line 4: const dir = __dirname;        (safe source — declaration)
    //   line 5: console.log(dir);             (reference, NOT a declaration)
    //   line 7: console.log(dir);             (reference, NOT a declaration)
    //
    // The safe-source detector MUST record line 4 (the __dirname declaration),
    // not line 5 or 7 (reference sites). This proves filterSafeSources keys
    // on actual declarations, making it safe to pair with a taint detector that
    // also records declaration-site lines.
    const results = detect(nestedScopeBuiltin);
    const safeDir = results.find((r) => r.patternId === 'builtin-dirname');
    expect(safeDir).toBeDefined();

    // Safe source must be at line 4 (the `const dir = __dirname` declaration)
    expect(safeDir?.location.line).toBe(4);

    // A taint source at line 2 (`const dir = req.query.dir`) must NOT collide
    const taintSource = {
      location: { file: 'test.ts', line: 2 },
      expression: 'req.query.dir',
      variableName: 'dir',
    };
    const filtered = filterSafeSources([taintSource], results);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.location.line).toBe(2);

    // A source at line 4 (same as safe declaration) DOES get filtered
    const sameLineSource = {
      location: { file: 'test.ts', line: 4 },
      expression: '__dirname',
      variableName: 'dir',
    };
    const filteredSame = filterSafeSources([sameLineSource], results);
    expect(filteredSame).toHaveLength(0);
  });
});

// =============================================================================
// Intentional Exclusions
// =============================================================================

describe('Intentional Exclusions (must remain tainted)', () => {
  it('should NOT detect environment variables', () => {
    const results = detect(envVariable);
    expect(findByVar(results, 'SECRET')).toBeUndefined();
  });

  it('should NOT detect type assertions', () => {
    const results = detect(typeAssertion);
    expect(findByVar(results, 'safe')).toBeUndefined();
  });

  it('should NOT detect imported constants', () => {
    const results = detect(importedConstant);
    expect(results).toHaveLength(0);
  });

  it('should NOT detect code comment annotations', () => {
    const results = detect(codeComment);
    expect(findByVar(results, 'value')).toBeUndefined();
  });

  it('should NOT detect object literals', () => {
    const results = detect(objectLiteral);
    expect(findByVar(results, 'OBJ')).toBeUndefined();
  });

  it('should NOT detect template literals with interpolation', () => {
    const results = detect(templateWithInterpolation);
    expect(findByVar(results, 'TPL')).toBeUndefined();
  });

  it('should NOT detect function return values', () => {
    const results = detect(functionReturnValue);
    expect(findByVar(results, 'RET')).toBeUndefined();
  });

  it('should NOT detect aliased constants as safe', () => {
    const results = detect(aliasedConstant);
    expect(findByVar(results, 'ALIAS')).toBeUndefined();
  });
});

// =============================================================================
// filterSafeSources
// =============================================================================

describe('filterSafeSources', () => {
  it('should remove sources that are safe', () => {
    const sources = [
      { location: { file: 'test.ts', line: 1 }, expression: 'GREETING', variableName: 'GREETING' },
      { location: { file: 'test.ts', line: 2 }, expression: 'req.body', variableName: 'userInput' },
    ];
    const safeSources = [
      {
        patternId: 'constant-literal-string',
        variableName: 'GREETING',
        location: { file: 'test.ts', line: 1 },
        confidence: 'high' as const,
        preventsTaintFor: [
          'injection' as const,
          'xss' as const,
          'path_traversal' as const,
          'ssrf' as const,
          'null_deref' as const,
          'auth_bypass' as const,
          'prototype_pollution' as const,
        ],
      },
    ];

    const filtered = filterSafeSources(sources, safeSources);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.variableName).toBe('userInput');
  });

  it('should return all sources when no safe sources exist', () => {
    const sources = [
      { location: { file: 'test.ts', line: 1 }, expression: 'req.body', variableName: 'input' },
    ];
    const filtered = filterSafeSources(sources, []);
    expect(filtered).toHaveLength(1);
  });
});

// =============================================================================
// Scope-Aware Mutation Tracking (Regression: identity-based tracking)
// =============================================================================

describe('Scope-Aware Mutation Tracking', () => {
  it('should keep outer safe const array when inner shadowed variable is mutated', () => {
    const results = detect(shadowedConstArray);
    // The outer ITEMS is a const literal array — should be detected as safe
    // even though the inner `let ITEMS` is mutated
    const entry = findByVar(results, 'ITEMS');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');
  });

  it('should detect element access on outer safe array despite inner shadow mutation', () => {
    const results = detect(shadowedConstArray);
    const picked = findByVar(results, 'picked');
    expect(picked).toBeDefined();
    expect(picked?.patternId).toBe('constant-element-access');
  });

  it('should still invalidate outer const array when IT is directly mutated', () => {
    const results = detect(directOuterMutation);
    // ITEMS[0] = "b" mutates the outer const array directly
    expect(findByVar(results, 'ITEMS')).toBeUndefined();
  });

  it('should invalidate const array when property is mutated on same binding', () => {
    const results = detect(propertyMutationInvalidates);
    // DATA.length = 0 mutates the outer const array
    expect(findByVar(results, 'DATA')).toBeUndefined();
  });

  it('should keep outer safe const array when block-scoped let shadows it', () => {
    const results = detect(blockScopedMutation);
    // Outer const ITEMS should remain safe
    const entry = findByVar(results, 'ITEMS');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');

    // Element access on outer ITEMS should also be detected
    const picked = findByVar(results, 'picked');
    expect(picked).toBeDefined();
    expect(picked?.patternId).toBe('constant-element-access');
  });

  it('should detect element access from nested function referencing outer binding', () => {
    const results = detect(nestedFunctionOuterRef);
    // Outer SAFE is a const literal array
    const safeArr = findByVar(results, 'SAFE');
    expect(safeArr).toBeDefined();
    expect(safeArr?.patternId).toBe('constant-literal-array');
  });

  it('should keep outer safe const array when callback parameter shadows it', () => {
    const results = detect(callbackShadowNoPoison);
    // Outer const ITEMS should remain safe even though a callback param is named ITEMS
    const entry = findByVar(results, 'ITEMS');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');

    // Element access on outer ITEMS should also work
    const picked = findByVar(results, 'picked');
    expect(picked).toBeDefined();
    expect(picked?.patternId).toBe('constant-element-access');
  });

  it('should keep outer safe const array when inner var (hoisted) shadows it', () => {
    const results = detect(varHoistingShadow);
    // Outer const ITEMS should remain safe — the var ITEMS inside the function
    // is hoisted to function scope, not module scope
    const entry = findByVar(results, 'ITEMS');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');

    // Element access on outer ITEMS should also work
    const picked = findByVar(results, 'picked');
    expect(picked).toBeDefined();
    expect(picked?.patternId).toBe('constant-element-access');
  });

  it('should keep outer safe const array when for-of loop variable shadows it', () => {
    const results = detect(forOfLoopShadow);
    // Outer const ITEMS should remain safe
    const entry = findByVar(results, 'ITEMS');
    expect(entry).toBeDefined();
    expect(entry?.patternId).toBe('constant-literal-array');

    // Element access on outer ITEMS should also work
    const picked = findByVar(results, 'picked');
    expect(picked).toBeDefined();
    expect(picked?.patternId).toBe('constant-element-access');
  });
});

// =============================================================================
// Performance
// =============================================================================

describe('Performance', () => {
  it('should complete within 100ms for a ~500 line file', () => {
    // Generate a large file with many declarations
    const lines: string[] = [];
    for (let i = 0; i < 100; i++) {
      lines.push(`const STR_${i} = "value_${i}";`);
      lines.push(`const NUM_${i} = ${i};`);
      lines.push(`const ARR_${i} = ["a", "b", "c"];`);
      lines.push(`let mut_${i} = "mutable";`);
      lines.push(`const obj_${i} = { key: ${i} };`);
    }
    const source = lines.join('\n');
    const sf = parse(source);

    const start = performance.now();
    detectSafeSources(sf, 'perf-test.ts');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('should complete within 100ms with scope-aware tracking on a file with many scopes', () => {
    const lines: string[] = [];
    for (let i = 0; i < 50; i++) {
      lines.push(`const ARR_${i} = ["a", "b", "c"];`);
      lines.push(`function scope_${i}() {`);
      lines.push(`  let ARR_${i} = [];`);
      lines.push(`  ARR_${i}[0] = "mutated";`);
      lines.push(`}`);
    }
    const source = lines.join('\n');
    const sf = parse(source);

    const start = performance.now();
    detectSafeSources(sf, 'perf-test.ts');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
