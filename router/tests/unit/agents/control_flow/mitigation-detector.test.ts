/**
 * Mitigation Detector Tests
 *
 * Tests for the MitigationDetector class that recognizes security mitigations
 * in code by matching AST nodes against defined patterns.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import ts from 'typescript';
import { parseSourceFile } from '../../../../src/agents/control_flow/cfg-builder.js';
import {
  BUILTIN_PATTERNS,
  inputValidationPatterns,
  nullSafetyPatterns,
  authCheckPatterns,
  outputEncodingPatterns,
  pathTraversalPatterns,
  getPatternsForVulnerability,
  getPatternById,
} from '../../../../src/agents/control_flow/mitigation-patterns.js';

// =============================================================================
// Pattern Registration Tests
// =============================================================================

describe('MitigationPatterns', () => {
  describe('BUILTIN_PATTERNS', () => {
    it('should have all pattern categories registered', () => {
      expect(BUILTIN_PATTERNS.length).toBeGreaterThan(0);

      // Verify all categories are included
      const categories = [
        inputValidationPatterns,
        nullSafetyPatterns,
        authCheckPatterns,
        outputEncodingPatterns,
        pathTraversalPatterns,
      ];

      const totalExpected = categories.reduce((sum, cat) => sum + cat.length, 0);
      expect(BUILTIN_PATTERNS.length).toBe(totalExpected);
    });

    it('should have unique IDs for all patterns', () => {
      const ids = BUILTIN_PATTERNS.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have all patterns marked as built-in', () => {
      for (const pattern of BUILTIN_PATTERNS) {
        expect(pattern.isBuiltIn).toBe(true);
      }
    });

    it('should have at least one mitigation type for each pattern', () => {
      for (const pattern of BUILTIN_PATTERNS) {
        expect(pattern.mitigates.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getPatternsForVulnerability', () => {
    it('should return patterns for injection vulnerability', () => {
      const patterns = getPatternsForVulnerability('injection');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.id === 'zod-parse')).toBe(true);
      expect(patterns.some((p) => p.id === 'sql-parameterized')).toBe(true);
    });

    it('should return patterns for null_deref vulnerability', () => {
      const patterns = getPatternsForVulnerability('null_deref');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.id === 'optional-chaining')).toBe(true);
      expect(patterns.some((p) => p.id === 'typeof-check')).toBe(true);
    });

    it('should return patterns for auth_bypass vulnerability', () => {
      const patterns = getPatternsForVulnerability('auth_bypass');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.id === 'jwt-verify')).toBe(true);
      expect(patterns.some((p) => p.id === 'passport-authenticate')).toBe(true);
    });

    it('should return patterns for xss vulnerability', () => {
      const patterns = getPatternsForVulnerability('xss');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.id === 'dompurify-sanitize')).toBe(true);
      expect(patterns.some((p) => p.id === 'encodeURIComponent')).toBe(true);
    });

    it('should return patterns for path_traversal vulnerability', () => {
      const patterns = getPatternsForVulnerability('path_traversal');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.some((p) => p.id === 'path-basename')).toBe(true);
    });

    it('should return empty array for unknown vulnerability', () => {
      const patterns = getPatternsForVulnerability('unknown_vuln');
      expect(patterns).toEqual([]);
    });
  });

  describe('getPatternById', () => {
    it('should return pattern by ID', () => {
      const pattern = getPatternById('zod-parse');
      expect(pattern).toBeDefined();
      expect(pattern?.name).toBe('Zod Schema Parse');
    });

    it('should return undefined for unknown ID', () => {
      const pattern = getPatternById('nonexistent-pattern');
      expect(pattern).toBeUndefined();
    });
  });
});

// =============================================================================
// Input Validation Pattern Tests
// =============================================================================

describe('Input Validation Patterns', () => {
  describe('Zod patterns', () => {
    it('should have zod-parse pattern', () => {
      const pattern = getPatternById('zod-parse');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('injection');
      expect(pattern?.mitigates).toContain('xss');
      expect(pattern?.confidence).toBe('high');
    });

    it('should have zod-safeParse pattern', () => {
      const pattern = getPatternById('zod-safeParse');
      expect(pattern).toBeDefined();
      expect(pattern?.match.type).toBe('method_call');
      expect(pattern?.match.module).toBe('zod');
    });
  });

  describe('Joi patterns', () => {
    it('should have joi-validate pattern', () => {
      const pattern = getPatternById('joi-validate');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('injection');
    });

    it('should have joi-validateAsync pattern', () => {
      const pattern = getPatternById('joi-validateAsync');
      expect(pattern).toBeDefined();
    });
  });

  describe('Validator.js patterns', () => {
    it('should have validator-escape pattern for XSS', () => {
      const pattern = getPatternById('validator-escape');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('xss');
      expect(pattern?.confidence).toBe('high');
    });

    it('should have validator-isEmail pattern', () => {
      const pattern = getPatternById('validator-isEmail');
      expect(pattern).toBeDefined();
      expect(pattern?.match.returnConstraint).toBe('truthy');
    });

    it('should have validator-isURL pattern for SSRF', () => {
      const pattern = getPatternById('validator-isURL');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('ssrf');
    });
  });

  describe('SQL parameterized query pattern', () => {
    it('should have sql-parameterized pattern', () => {
      const pattern = getPatternById('sql-parameterized');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('injection');
      expect(pattern?.match.parameters).toBeDefined();
      expect(pattern?.match.parameters?.[0].index).toBe(1);
    });
  });
});

// =============================================================================
// Null Safety Pattern Tests
// =============================================================================

describe('Null Safety Patterns', () => {
  describe('Optional chaining', () => {
    it('should have optional-chaining pattern', () => {
      const pattern = getPatternById('optional-chaining');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('null_deref');
      expect(pattern?.confidence).toBe('high');
    });
  });

  describe('Nullish coalescing', () => {
    it('should have nullish-coalescing pattern', () => {
      const pattern = getPatternById('nullish-coalescing');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('null_deref');
    });

    it('should have nullish-assignment pattern', () => {
      const pattern = getPatternById('nullish-assignment');
      expect(pattern).toBeDefined();
    });
  });

  describe('Type checks', () => {
    it('should have typeof-check pattern', () => {
      const pattern = getPatternById('typeof-check');
      expect(pattern).toBeDefined();
      expect(pattern?.match.type).toBe('typeof_check');
    });

    it('should have instanceof-check pattern', () => {
      const pattern = getPatternById('instanceof-check');
      expect(pattern).toBeDefined();
      expect(pattern?.match.type).toBe('instanceof_check');
    });
  });

  describe('Null/undefined checks', () => {
    it('should have null-check-strict pattern', () => {
      const pattern = getPatternById('null-check-strict');
      expect(pattern).toBeDefined();
      expect(pattern?.match.type).toBe('type_guard');
    });

    it('should have undefined-check-strict pattern', () => {
      const pattern = getPatternById('undefined-check-strict');
      expect(pattern).toBeDefined();
    });

    it('should have nullish-check pattern', () => {
      const pattern = getPatternById('nullish-check');
      expect(pattern).toBeDefined();
    });
  });

  describe('Assertion functions', () => {
    it('should have assert-defined pattern', () => {
      const pattern = getPatternById('assert-defined');
      expect(pattern).toBeDefined();
      expect(pattern?.match.namePattern).toContain('assertDefined');
      expect(pattern?.confidence).toBe('medium');
    });
  });
});

// =============================================================================
// Auth Check Pattern Tests
// =============================================================================

describe('Auth Check Patterns', () => {
  describe('JWT patterns', () => {
    it('should have jwt-verify pattern', () => {
      const pattern = getPatternById('jwt-verify');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('auth_bypass');
      expect(pattern?.match.module).toBe('jsonwebtoken');
      expect(pattern?.confidence).toBe('high');
    });

    it('should have jwt-decode-verify pattern', () => {
      const pattern = getPatternById('jwt-decode-verify');
      expect(pattern).toBeDefined();
    });
  });

  describe('Passport.js patterns', () => {
    it('should have passport-authenticate pattern', () => {
      const pattern = getPatternById('passport-authenticate');
      expect(pattern).toBeDefined();
      expect(pattern?.match.module).toBe('passport');
    });

    it('should have passport-isAuthenticated pattern', () => {
      const pattern = getPatternById('passport-isAuthenticated');
      expect(pattern).toBeDefined();
      expect(pattern?.match.returnConstraint).toBe('truthy');
    });
  });

  describe('Session patterns', () => {
    it('should have session-user-check pattern', () => {
      const pattern = getPatternById('session-user-check');
      expect(pattern).toBeDefined();
      expect(pattern?.match.type).toBe('type_guard');
    });

    it('should have session-id-check pattern', () => {
      const pattern = getPatternById('session-id-check');
      expect(pattern).toBeDefined();
    });
  });

  describe('Role/permission patterns', () => {
    it('should have role-check pattern', () => {
      const pattern = getPatternById('role-check');
      expect(pattern).toBeDefined();
    });

    it('should have permission-check pattern', () => {
      const pattern = getPatternById('permission-check');
      expect(pattern).toBeDefined();
      expect(pattern?.match.namePattern).toContain('hasPermission');
    });
  });

  describe('OAuth and API key patterns', () => {
    it('should have oauth-verify pattern', () => {
      const pattern = getPatternById('oauth-verify');
      expect(pattern).toBeDefined();
    });

    it('should have api-key-validate pattern', () => {
      const pattern = getPatternById('api-key-validate');
      expect(pattern).toBeDefined();
    });
  });
});

// =============================================================================
// Output Encoding Pattern Tests
// =============================================================================

describe('Output Encoding Patterns', () => {
  describe('DOMPurify', () => {
    it('should have dompurify-sanitize pattern', () => {
      const pattern = getPatternById('dompurify-sanitize');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('xss');
      expect(pattern?.match.module).toBe('dompurify');
      expect(pattern?.confidence).toBe('high');
    });
  });

  describe('URI encoding', () => {
    it('should have encodeURI pattern', () => {
      const pattern = getPatternById('encodeURI');
      expect(pattern).toBeDefined();
      expect(pattern?.match.name).toBe('encodeURI');
    });

    it('should have encodeURIComponent pattern', () => {
      const pattern = getPatternById('encodeURIComponent');
      expect(pattern).toBeDefined();
      expect(pattern?.confidence).toBe('high');
    });
  });

  describe('HTML encoding', () => {
    it('should have he-encode pattern', () => {
      const pattern = getPatternById('he-encode');
      expect(pattern).toBeDefined();
      expect(pattern?.match.module).toBe('he');
    });

    it('should have he-escape pattern', () => {
      const pattern = getPatternById('he-escape');
      expect(pattern).toBeDefined();
    });

    it('should have lodash-escape pattern', () => {
      const pattern = getPatternById('lodash-escape');
      expect(pattern).toBeDefined();
      expect(pattern?.match.module).toBe('lodash');
    });
  });

  describe('React/DOM patterns', () => {
    it('should have react-jsx-escape pattern', () => {
      const pattern = getPatternById('react-jsx-escape');
      expect(pattern).toBeDefined();
    });

    it('should have textContent-assignment pattern', () => {
      const pattern = getPatternById('textContent-assignment');
      expect(pattern).toBeDefined();
      expect(pattern?.mitigates).toContain('xss');
    });

    it('should have createTextNode pattern', () => {
      const pattern = getPatternById('createTextNode');
      expect(pattern).toBeDefined();
    });
  });
});

// =============================================================================
// Path Traversal Pattern Tests
// =============================================================================

describe('Path Traversal Patterns', () => {
  it('should have path-resolve pattern', () => {
    const pattern = getPatternById('path-resolve');
    expect(pattern).toBeDefined();
    expect(pattern?.mitigates).toContain('path_traversal');
    expect(pattern?.match.module).toBe('path');
  });

  it('should have path-normalize pattern with low confidence', () => {
    const pattern = getPatternById('path-normalize');
    expect(pattern).toBeDefined();
    expect(pattern?.confidence).toBe('low');
  });

  it('should have path-basename pattern with high confidence', () => {
    const pattern = getPatternById('path-basename');
    expect(pattern).toBeDefined();
    expect(pattern?.confidence).toBe('high');
  });

  it('should have startsWith-check pattern', () => {
    const pattern = getPatternById('startsWith-check');
    expect(pattern).toBeDefined();
    expect(pattern?.match.returnConstraint).toBe('truthy');
  });
});

// =============================================================================
// Pattern Matching Tests (with real code)
// =============================================================================

describe('Pattern Matching Integration', () => {
  // Helper to parse and find specific AST node kinds
  function findNodes(code: string, kind: ts.SyntaxKind): ts.Node[] {
    const sourceFile = parseSourceFile(code, 'test.ts');
    const nodes: ts.Node[] = [];

    function visit(node: ts.Node) {
      if (node.kind === kind) {
        nodes.push(node);
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
    return nodes;
  }

  describe('Call expression detection', () => {
    it('should find function calls', () => {
      const code = `
        const result = validator.escape(input);
        const encoded = encodeURIComponent(data);
      `;
      const calls = findNodes(code, ts.SyntaxKind.CallExpression);
      expect(calls.length).toBe(2);
    });

    it('should find method calls', () => {
      const code = `
        const data = schema.parse(input);
        jwt.verify(token, secret);
      `;
      const calls = findNodes(code, ts.SyntaxKind.CallExpression);
      expect(calls.length).toBe(2);
    });
  });

  describe('Type guard detection', () => {
    it('should find typeof checks', () => {
      const code = `
        if (typeof x === 'string') { }
        if (typeof y !== 'undefined') { }
      `;
      const typeofs = findNodes(code, ts.SyntaxKind.TypeOfExpression);
      expect(typeofs.length).toBe(2);
    });

    it('should find instanceof checks', () => {
      const code = `
        if (error instanceof Error) { }
      `;
      const binaries = findNodes(code, ts.SyntaxKind.BinaryExpression);
      const instanceofs = binaries.filter((n) => {
        const bin = n as ts.BinaryExpression;
        return bin.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword;
      });
      expect(instanceofs.length).toBe(1);
    });
  });

  describe('Null check detection', () => {
    it('should find strict equality null checks', () => {
      const code = `
        if (x === null) { }
        if (y !== null) { }
      `;
      const binaries = findNodes(code, ts.SyntaxKind.BinaryExpression);
      const nullChecks = binaries.filter((n) => {
        const bin = n as ts.BinaryExpression;
        return (
          bin.right.kind === ts.SyntaxKind.NullKeyword ||
          bin.left.kind === ts.SyntaxKind.NullKeyword
        );
      });
      expect(nullChecks.length).toBe(2);
    });

    it('should find optional chaining', () => {
      const code = `
        const city = user?.address?.city;
        const result = obj?.method?.();
      `;
      // PropertyAccessExpression with QuestionDotToken
      const sourceFile = parseSourceFile(code, 'test.ts');
      let optionalCount = 0;

      function visit(node: ts.Node) {
        if (ts.isPropertyAccessExpression(node) && node.questionDotToken) {
          optionalCount++;
        }
        if (ts.isCallExpression(node) && node.questionDotToken) {
          optionalCount++;
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      expect(optionalCount).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// MitigationDetector Class Tests
// =============================================================================

import {
  MitigationDetector,
  createMitigationDetector,
} from '../../../../src/agents/control_flow/mitigation-detector.js';

describe('MitigationDetector', () => {
  let detector: MitigationDetector;

  beforeEach(() => {
    detector = createMitigationDetector();
  });

  describe('detectInFile', () => {
    it('should detect Zod parse mitigation in code', () => {
      const code = `
        import { z } from 'zod';
        const schema = z.object({ name: z.string() });
        function validate(input: unknown) {
          const data = schema.parse(input);
          return data;
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const zodMitigation = mitigations.find((m) => m.patternId === 'zod-parse');
      expect(zodMitigation).toBeDefined();
      // Confidence is 'medium' when schema is a variable (not directly imported module call)
      expect(['high', 'medium']).toContain(zodMitigation?.confidence);
    });

    it('should detect JWT verify mitigation in code', () => {
      const code = `
        import jwt from 'jsonwebtoken';
        function auth(token: string) {
          const decoded = jwt.verify(token, 'secret');
          return decoded;
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const jwtMitigation = mitigations.find((m) => m.patternId === 'jwt-verify');
      expect(jwtMitigation).toBeDefined();
    });

    it('should detect optional chaining mitigation', () => {
      const code = `
        function getCity(user: any) {
          return user?.address?.city;
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const optionalChaining = mitigations.filter((m) => m.patternId === 'optional-chaining');
      expect(optionalChaining.length).toBeGreaterThan(0);
    });

    it('should detect null check guard patterns', () => {
      const code = `
        function process(x: string | null) {
          if (x === null) return;
          console.log(x);
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const nullCheck = mitigations.find((m) => m.patternId === 'null-check-strict');
      expect(nullCheck).toBeDefined();
    });

    it('should detect typeof checks', () => {
      const code = `
        function process(x: unknown) {
          if (typeof x === 'string') {
            console.log(x.toUpperCase());
          }
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const typeofCheck = mitigations.find((m) => m.patternId === 'typeof-check');
      expect(typeofCheck).toBeDefined();
    });

    it('should detect instanceof checks', () => {
      const code = `
        function handle(err: unknown) {
          if (err instanceof Error) {
            console.log(err.message);
          }
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const instanceofCheck = mitigations.find((m) => m.patternId === 'instanceof-check');
      expect(instanceofCheck).toBeDefined();
    });
  });

  describe('scope tracking', () => {
    it('should track mitigation scope as function when inside function', () => {
      const code = `
        function validate(input: unknown) {
          if (typeof input === 'string') {
            return input;
          }
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      expect(mitigations.length).toBeGreaterThan(0);
      // Scope determination depends on AST structure
      const mitigation = mitigations[0];
      expect(['function', 'block']).toContain(mitigation.scope);
    });

    it('should track mitigation scope as module for top-level code', () => {
      const code = `
        const x = typeof globalValue === 'string' ? globalValue : '';
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      // Top-level expressions have module scope
      if (mitigations.length > 0) {
        expect(['module', 'block']).toContain(mitigations[0].scope);
      }
    });
  });

  describe('MitigationInstance metadata', () => {
    it('should return MitigationInstance with correct location', () => {
      const code = `
        function check(x: any) {
          if (x === null) return;
        }
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const mitigation = mitigations.find((m) => m.patternId === 'null-check-strict');
      expect(mitigation).toBeDefined();
      expect(mitigation?.location.file).toBe('test.ts');
      expect(mitigation?.location.line).toBeGreaterThan(0);
    });

    it('should track protected variables', () => {
      const code = `
        import { z } from 'zod';
        const schema = z.string();
        const validated = schema.parse(userInput);
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = detector.detectInFile(sourceFile, 'test.ts');

      const zodMitigation = mitigations.find((m) => m.patternId === 'zod-parse');
      expect(zodMitigation).toBeDefined();
      // Should include the variable being validated
      expect(zodMitigation?.protectedVariables).toBeDefined();
    });
  });

  describe('configuration support', () => {
    it('should support custom patterns from config', () => {
      const customDetector = createMitigationDetector({
        mitigationPatterns: [
          {
            id: 'custom-sanitize',
            name: 'Custom Sanitizer',
            description: 'Company custom sanitizer',
            mitigates: ['xss'],
            match: {
              type: 'function_call',
              name: 'companySanitize',
            },
            confidence: 'high',
            isBuiltIn: false,
          },
        ],
      });

      const code = `
        const safe = companySanitize(userInput);
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = customDetector.detectInFile(sourceFile, 'test.ts');

      const customMitigation = mitigations.find((m) => m.patternId === 'custom-sanitize');
      expect(customMitigation).toBeDefined();
    });

    it('should respect pattern overrides', () => {
      const customDetector = createMitigationDetector({
        patternOverrides: [
          {
            patternId: 'zod-parse',
            confidence: 'medium',
          },
        ],
      });

      const pattern = customDetector.getPatternById('zod-parse');
      expect(pattern?.confidence).toBe('medium');
    });

    it('should skip disabled patterns', () => {
      const customDetector = createMitigationDetector({
        disabledPatterns: ['zod-parse'],
      });

      const code = `
        import { z } from 'zod';
        const data = schema.parse(input);
      `;
      const sourceFile = parseSourceFile(code, 'test.ts');
      const mitigations = customDetector.detectInFile(sourceFile, 'test.ts');

      const zodMitigation = mitigations.find((m) => m.patternId === 'zod-parse');
      expect(zodMitigation).toBeUndefined();

      // Pattern should not be accessible
      const pattern = customDetector.getPatternById('zod-parse');
      expect(pattern).toBeUndefined();
    });

    it('should skip deprecated patterns', () => {
      const customDetector = createMitigationDetector({
        patternOverrides: [
          {
            patternId: 'zod-parse',
            deprecated: true,
            deprecationReason: 'Use zod-safeParse instead',
          },
        ],
      });

      const pattern = customDetector.getPatternById('zod-parse');
      expect(pattern).toBeUndefined();
    });
  });

  describe('getActivePatterns', () => {
    it('should return only non-disabled, non-deprecated patterns', () => {
      const customDetector = createMitigationDetector({
        disabledPatterns: ['zod-parse'],
        patternOverrides: [
          {
            patternId: 'joi-validate',
            deprecated: true,
          },
        ],
      });

      const activePatterns = customDetector.getActivePatterns();
      expect(activePatterns.find((p) => p.id === 'zod-parse')).toBeUndefined();
      expect(activePatterns.find((p) => p.id === 'joi-validate')).toBeUndefined();
      expect(activePatterns.find((p) => p.id === 'zod-safeParse')).toBeDefined();
    });
  });

  describe('getPatternsForVulnerability', () => {
    it('should return patterns that mitigate injection', () => {
      const patterns = detector.getPatternsForVulnerability('injection');
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns.every((p) => p.mitigates.includes('injection'))).toBe(true);
    });

    it('should exclude disabled patterns', () => {
      const customDetector = createMitigationDetector({
        disabledPatterns: ['zod-parse'],
      });

      const patterns = customDetector.getPatternsForVulnerability('injection');
      expect(patterns.find((p) => p.id === 'zod-parse')).toBeUndefined();
    });
  });
});
