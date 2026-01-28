/**
 * Mitigation Configuration Tests
 *
 * Tests for custom mitigation pattern configuration parsing and validation.
 * Implements T050: Unit tests for custom pattern validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validatePatternIsDeclarative,
  validatePatternOverride,
  parseControlFlowConfig,
  applyPatternOverrides,
  filterDisabledPatterns,
  getEffectivePatterns,
  formatValidationErrors,
  formatValidationWarnings,
} from '../../../../src/config/mitigation-config.js';
import type {
  MitigationPattern,
  PatternOverride,
} from '../../../../src/agents/control_flow/types.js';
import {
  companySanitizerPattern,
  companyAuthPattern,
  ALL_CUSTOM_PATTERNS,
  EXAMPLE_CONFIG,
  MINIMAL_CONFIG,
  invalidRegexPattern,
  missingFieldsPattern,
  emptyMitigatesPattern,
  invalidVulnTypePattern,
  invalidConfidencePattern,
} from './fixtures/custom-pattern.js';

// =============================================================================
// Pattern Declarative Validation Tests (FR-015)
// =============================================================================

describe('validatePatternIsDeclarative', () => {
  describe('valid patterns', () => {
    it('should accept valid function call pattern', () => {
      const result = validatePatternIsDeclarative(companySanitizerPattern);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should accept pattern with regex namePattern', () => {
      const pattern: MitigationPattern = {
        id: 'test-regex',
        name: 'Test Regex Pattern',
        description: 'Pattern with regex',
        mitigates: ['injection'],
        match: {
          type: 'function_call',
          namePattern: '^validate[A-Z]\\w*$',
        },
        confidence: 'medium',
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(true);
    });

    it('should accept pattern with parameter constraints', () => {
      const pattern: MitigationPattern = {
        id: 'test-params',
        name: 'Test Params Pattern',
        description: 'Pattern with params',
        mitigates: ['injection'],
        match: {
          type: 'function_call',
          name: 'sanitize',
          parameters: [
            { index: 0, constraint: 'string' },
            { index: 1, constraint: 'any' },
          ],
        },
        confidence: 'high',
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(true);
    });

    it('should accept pattern with return constraint', () => {
      const pattern: MitigationPattern = {
        id: 'test-return',
        name: 'Test Return Pattern',
        description: 'Pattern with return constraint',
        mitigates: ['injection'],
        match: {
          type: 'method_call',
          name: 'sanitize',
          returnConstraint: 'sanitized',
        },
        confidence: 'high',
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid patterns', () => {
    it('should reject pattern with empty ID', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        id: '',
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'EMPTY_PATTERN_ID')).toBe(true);
    });

    it('should reject pattern with reserved name "eval"', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: { type: 'function_call', name: 'eval' },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'RESERVED_PATTERN_NAME')).toBe(true);
    });

    it('should reject pattern with reserved name "Function"', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: { type: 'function_call', name: 'Function' },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'RESERVED_PATTERN_NAME')).toBe(true);
    });

    it('should reject pattern with invalid regex', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: { type: 'function_call', namePattern: '[invalid(regex' },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_REGEX')).toBe(true);
    });

    it('should reject pattern with too long regex', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: { type: 'function_call', namePattern: 'a'.repeat(300) },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'PATTERN_TOO_LONG')).toBe(true);
    });

    it('should reject function_call pattern without name or namePattern', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: { type: 'function_call' },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'MISSING_MATCH_CRITERIA')).toBe(true);
    });

    it('should reject pattern with duplicate parameter indices', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: {
          type: 'function_call',
          name: 'sanitize',
          parameters: [
            { index: 0, constraint: 'string' },
            { index: 0, constraint: 'any' },
          ],
        },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_PARAM_INDEX')).toBe(true);
    });

    it('should reject pattern with empty mitigates array', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        mitigates: [],
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'EMPTY_MITIGATES')).toBe(true);
    });
  });

  describe('warnings', () => {
    it('should warn about potentially slow regex', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: { type: 'function_call', namePattern: '(a+)+b' },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.warnings.some((w) => w.code === 'COMPLEX_REGEX')).toBe(true);
    });

    it('should warn about unusual parameter index', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        match: {
          type: 'function_call',
          name: 'sanitize',
          parameters: [{ index: 15, constraint: 'string' }],
        },
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.warnings.some((w) => w.code === 'UNUSUAL_PARAM_INDEX')).toBe(true);
    });

    it('should warn about deprecated without reason', () => {
      const pattern: MitigationPattern = {
        ...companySanitizerPattern,
        deprecated: true,
      };
      const result = validatePatternIsDeclarative(pattern);
      expect(result.warnings.some((w) => w.code === 'DEPRECATED_NO_REASON')).toBe(true);
    });
  });
});

// =============================================================================
// Pattern Override Validation Tests
// =============================================================================

describe('validatePatternOverride', () => {
  it('should accept valid override with confidence', () => {
    const override: PatternOverride = {
      patternId: 'some-pattern',
      confidence: 'high',
    };
    const result = validatePatternOverride(override);
    expect(result.valid).toBe(true);
  });

  it('should accept valid override with deprecated', () => {
    const override: PatternOverride = {
      patternId: 'some-pattern',
      deprecated: true,
      deprecationReason: 'Use newer pattern',
    };
    const result = validatePatternOverride(override);
    expect(result.valid).toBe(true);
  });

  it('should reject override with empty pattern ID', () => {
    const override: PatternOverride = {
      patternId: '',
      confidence: 'high',
    };
    const result = validatePatternOverride(override);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EMPTY_PATTERN_ID')).toBe(true);
  });

  it('should warn about override with no changes', () => {
    const override: PatternOverride = {
      patternId: 'some-pattern',
    };
    const result = validatePatternOverride(override);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.code === 'NO_OVERRIDE_CHANGES')).toBe(true);
  });

  it('should warn about deprecated without reason', () => {
    const override: PatternOverride = {
      patternId: 'some-pattern',
      deprecated: true,
    };
    const result = validatePatternOverride(override);
    expect(result.warnings.some((w) => w.code === 'DEPRECATED_NO_REASON')).toBe(true);
  });
});

// =============================================================================
// Configuration Parsing Tests
// =============================================================================

describe('parseControlFlowConfig', () => {
  describe('valid configurations', () => {
    it('should parse empty config with defaults', () => {
      const result = parseControlFlowConfig({});
      expect(result.success).toBe(true);
      expect(result.config).toBeDefined();
      expect(result.config?.enabled).toBe(true);
      expect(result.config?.maxCallDepth).toBe(5);
    });

    it('should parse minimal config', () => {
      const result = parseControlFlowConfig(MINIMAL_CONFIG);
      expect(result.success).toBe(true);
      expect(result.config?.mitigationPatterns).toHaveLength(1);
    });

    it('should parse full config', () => {
      const result = parseControlFlowConfig(EXAMPLE_CONFIG);
      expect(result.success).toBe(true);
      expect(result.config?.mitigationPatterns.length).toBeGreaterThan(0);
      expect(result.config?.patternOverrides.length).toBeGreaterThan(0);
      expect(result.config?.disabledPatterns.length).toBeGreaterThan(0);
    });

    it('should accept custom patterns array', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: ALL_CUSTOM_PATTERNS,
      });
      expect(result.success).toBe(true);
      expect(result.config?.mitigationPatterns).toHaveLength(ALL_CUSTOM_PATTERNS.length);
    });
  });

  describe('invalid configurations', () => {
    it('should reject invalid pattern in array', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: [invalidRegexPattern],
      });
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_REGEX')).toBe(true);
    });

    it('should reject pattern with missing fields', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: [missingFieldsPattern],
      });
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'SCHEMA_VALIDATION')).toBe(true);
    });

    it('should reject pattern with empty mitigates', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: [emptyMitigatesPattern],
      });
      expect(result.success).toBe(false);
    });

    it('should reject pattern with invalid vulnerability type', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: [invalidVulnTypePattern],
      });
      expect(result.success).toBe(false);
    });

    it('should reject pattern with invalid confidence', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: [invalidConfidencePattern],
      });
      expect(result.success).toBe(false);
    });

    it('should reject duplicate pattern IDs', () => {
      const result = parseControlFlowConfig({
        mitigationPatterns: [companySanitizerPattern, companySanitizerPattern],
      });
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_PATTERN_ID')).toBe(true);
    });

    it('should reject too many patterns', () => {
      const manyPatterns = Array.from({ length: 150 }, (_, i) => ({
        ...companySanitizerPattern,
        id: `pattern-${i}`,
      }));
      const result = parseControlFlowConfig({
        mitigationPatterns: manyPatterns,
      });
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.code === 'TOO_MANY_PATTERNS')).toBe(true);
    });
  });

  describe('warnings', () => {
    it('should warn about duplicate disabled patterns', () => {
      const result = parseControlFlowConfig({
        disabledPatterns: ['pattern-a', 'pattern-a'],
      });
      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.code === 'DUPLICATE_DISABLED')).toBe(true);
    });

    it('should warn about override for disabled pattern', () => {
      const result = parseControlFlowConfig({
        patternOverrides: [{ patternId: 'pattern-a', confidence: 'high' }],
        disabledPatterns: ['pattern-a'],
      });
      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.code === 'OVERRIDE_DISABLED_CONFLICT')).toBe(true);
    });

    it('should warn about duplicate overrides', () => {
      const result = parseControlFlowConfig({
        patternOverrides: [
          { patternId: 'pattern-a', confidence: 'high' },
          { patternId: 'pattern-a', confidence: 'low' },
        ],
      });
      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.code === 'DUPLICATE_OVERRIDE')).toBe(true);
    });
  });
});

// =============================================================================
// Pattern Application Tests
// =============================================================================

describe('applyPatternOverrides', () => {
  it('should apply confidence override', () => {
    const patterns: MitigationPattern[] = [{ ...companySanitizerPattern, confidence: 'low' }];
    const overrides: PatternOverride[] = [
      { patternId: companySanitizerPattern.id, confidence: 'high' },
    ];

    const result = applyPatternOverrides(patterns, overrides);

    expect(result[0]?.confidence).toBe('high');
  });

  it('should apply deprecated override', () => {
    const patterns: MitigationPattern[] = [companySanitizerPattern];
    const overrides: PatternOverride[] = [
      {
        patternId: companySanitizerPattern.id,
        deprecated: true,
        deprecationReason: 'Use new pattern',
      },
    ];

    const result = applyPatternOverrides(patterns, overrides);

    expect(result[0]?.deprecated).toBe(true);
    expect(result[0]?.deprecationReason).toBe('Use new pattern');
  });

  it('should not modify patterns without matching override', () => {
    const patterns: MitigationPattern[] = [companySanitizerPattern];
    const overrides: PatternOverride[] = [{ patternId: 'other-pattern', confidence: 'high' }];

    const result = applyPatternOverrides(patterns, overrides);

    expect(result[0]).toEqual(companySanitizerPattern);
  });

  it('should return new array without mutating original', () => {
    const patterns: MitigationPattern[] = [companySanitizerPattern];
    const overrides: PatternOverride[] = [
      { patternId: companySanitizerPattern.id, confidence: 'high' },
    ];

    const result = applyPatternOverrides(patterns, overrides);

    expect(result).not.toBe(patterns);
    expect(result[0]).not.toBe(patterns[0]);
  });
});

describe('filterDisabledPatterns', () => {
  it('should filter out disabled patterns', () => {
    const patterns: MitigationPattern[] = [companySanitizerPattern, companyAuthPattern];
    const disabled = [companySanitizerPattern.id];

    const result = filterDisabledPatterns(patterns, disabled);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe(companyAuthPattern.id);
  });

  it('should return all patterns when none disabled', () => {
    const patterns: MitigationPattern[] = [companySanitizerPattern, companyAuthPattern];

    const result = filterDisabledPatterns(patterns, []);

    expect(result).toHaveLength(2);
  });

  it('should return empty array when all disabled', () => {
    const patterns: MitigationPattern[] = [companySanitizerPattern];

    const result = filterDisabledPatterns(patterns, [companySanitizerPattern.id]);

    expect(result).toHaveLength(0);
  });
});

describe('getEffectivePatterns', () => {
  it('should combine built-in and custom patterns', () => {
    const builtIn: MitigationPattern[] = [companySanitizerPattern];
    const custom: MitigationPattern[] = [companyAuthPattern];

    const result = getEffectivePatterns(builtIn, custom, [], []);

    expect(result).toHaveLength(2);
  });

  it('should apply overrides and filter disabled', () => {
    const builtIn: MitigationPattern[] = [{ ...companySanitizerPattern, deprecated: false }];
    const custom: MitigationPattern[] = [companyAuthPattern];
    const overrides: PatternOverride[] = [
      { patternId: companySanitizerPattern.id, deprecated: true },
    ];
    const disabled = [companyAuthPattern.id];

    const result = getEffectivePatterns(builtIn, custom, overrides, disabled);

    // companySanitizerPattern deprecated, companyAuthPattern disabled
    expect(result).toHaveLength(0);
  });

  it('should filter deprecated patterns', () => {
    const builtIn: MitigationPattern[] = [{ ...companySanitizerPattern, deprecated: true }];

    const result = getEffectivePatterns(builtIn, [], [], []);

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// Error Formatting Tests
// =============================================================================

describe('formatValidationErrors', () => {
  it('should format errors for display', () => {
    const errors = [{ code: 'TEST_ERROR', path: ['a', 'b'], message: 'Test message' }];

    const result = formatValidationErrors(errors);

    expect(result).toContain('[TEST_ERROR]');
    expect(result).toContain('a.b');
    expect(result).toContain('Test message');
  });

  it('should return "No errors" for empty array', () => {
    const result = formatValidationErrors([]);
    expect(result).toBe('No errors');
  });
});

describe('formatValidationWarnings', () => {
  it('should format warnings for display', () => {
    const warnings = [{ code: 'TEST_WARNING', path: ['x', 'y'], message: 'Test warning' }];

    const result = formatValidationWarnings(warnings);

    expect(result).toContain('[TEST_WARNING]');
    expect(result).toContain('x.y');
    expect(result).toContain('Test warning');
  });

  it('should return "No warnings" for empty array', () => {
    const result = formatValidationWarnings([]);
    expect(result).toBe('No warnings');
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration: Full Configuration Flow', () => {
  it('should parse, validate, and apply full config', () => {
    // Parse config
    const parseResult = parseControlFlowConfig(EXAMPLE_CONFIG);
    expect(parseResult.success).toBe(true);

    if (!parseResult.config) {
      throw new Error('Expected config to be defined');
    }
    const config = parseResult.config;

    // Simulate getting effective patterns with built-in
    const builtInPatterns: MitigationPattern[] = [
      {
        id: 'built-in-1',
        name: 'Built-in Pattern',
        description: 'A built-in pattern',
        mitigates: ['injection'],
        match: { type: 'function_call', name: 'sanitize' },
        confidence: 'medium',
        isBuiltIn: true,
      },
    ];

    const effectivePatterns = getEffectivePatterns(
      builtInPatterns,
      config.mitigationPatterns,
      config.patternOverrides,
      config.disabledPatterns
    );

    // Should have patterns
    expect(effectivePatterns.length).toBeGreaterThan(0);

    // Should not include disabled patterns
    for (const disabled of config.disabledPatterns) {
      expect(effectivePatterns.every((p) => p.id !== disabled)).toBe(true);
    }

    // Should not include deprecated patterns
    expect(effectivePatterns.every((p) => !p.deprecated)).toBe(true);
  });
});
