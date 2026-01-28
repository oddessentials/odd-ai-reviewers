/**
 * Mitigation Configuration Parser
 *
 * Parses and validates custom mitigation pattern configuration.
 * Implements:
 * - T052: Config parser using Zod schemas
 * - T053: Pattern validation ensuring declarative/side-effect-free per FR-015
 * - T054: Pattern override support (confidence, deprecated)
 * - T055: Pattern disable list support
 * - FR-016: Validate patterns at configuration time with clear error messages
 */

import {
  type MitigationPattern,
  type PatternOverride,
  type ControlFlowConfig,
  ControlFlowConfigSchema,
} from '../agents/control_flow/types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Result of pattern validation.
 */
export interface PatternValidationResult {
  valid: boolean;
  errors: PatternValidationError[];
  warnings: PatternValidationWarning[];
}

/**
 * Pattern validation error.
 */
export interface PatternValidationError {
  code: string;
  path: string[];
  message: string;
}

/**
 * Pattern validation warning.
 */
export interface PatternValidationWarning {
  code: string;
  path: string[];
  message: string;
}

/**
 * Result of config parsing.
 */
export interface ConfigParseResult {
  success: boolean;
  config?: ControlFlowConfig;
  errors: PatternValidationError[];
  warnings: PatternValidationWarning[];
}

// =============================================================================
// FR-015: Declarative Pattern Validation
// =============================================================================

/**
 * Reserved words that cannot be used in pattern names (security measure).
 */
const RESERVED_PATTERN_WORDS = [
  'eval',
  'Function',
  'setTimeout',
  'setInterval',
  'exec',
  'spawn',
  'require',
  'import',
];

/**
 * Maximum allowed pattern name/namePattern length.
 */
const MAX_PATTERN_NAME_LENGTH = 256;

/**
 * Maximum allowed patterns in a single configuration.
 */
const MAX_CUSTOM_PATTERNS = 100;

/**
 * Maximum allowed overrides in a single configuration.
 */
const MAX_PATTERN_OVERRIDES = 200;

/**
 * Maximum allowed disabled patterns in a single configuration.
 */
const MAX_DISABLED_PATTERNS = 200;

/**
 * Validate that a pattern is declarative and side-effect-free per FR-015.
 *
 * Patterns must only contain:
 * - Function name matching (exact or regex)
 * - Parameter constraints
 * - Return value assertions
 * - Module specifications
 *
 * No executable code, callbacks, or side effects are allowed.
 */
export function validatePatternIsDeclarative(pattern: MitigationPattern): PatternValidationResult {
  const errors: PatternValidationError[] = [];
  const warnings: PatternValidationWarning[] = [];

  // Check pattern ID is valid
  if (!pattern.id || pattern.id.trim().length === 0) {
    errors.push({
      code: 'EMPTY_PATTERN_ID',
      path: ['id'],
      message: 'Pattern ID cannot be empty',
    });
  }

  // Check for reserved words in pattern name matching
  if (pattern.match.name) {
    for (const reserved of RESERVED_PATTERN_WORDS) {
      if (pattern.match.name === reserved) {
        errors.push({
          code: 'RESERVED_PATTERN_NAME',
          path: ['match', 'name'],
          message: `Pattern name "${reserved}" is reserved and cannot be used`,
        });
      }
    }
  }

  // Validate namePattern is a valid regex
  if (pattern.match.namePattern) {
    if (pattern.match.namePattern.length > MAX_PATTERN_NAME_LENGTH) {
      errors.push({
        code: 'PATTERN_TOO_LONG',
        path: ['match', 'namePattern'],
        message: `Pattern regex exceeds maximum length of ${MAX_PATTERN_NAME_LENGTH} characters`,
      });
    }

    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- Validating user-provided pattern syntax at config time
      new RegExp(pattern.match.namePattern);
    } catch (e) {
      errors.push({
        code: 'INVALID_REGEX',
        path: ['match', 'namePattern'],
        message: `Invalid regex pattern: ${(e as Error).message}`,
      });
    }

    // Check for overly complex/dangerous regex patterns
    if (hasExponentialRegex(pattern.match.namePattern)) {
      warnings.push({
        code: 'COMPLEX_REGEX',
        path: ['match', 'namePattern'],
        message: 'Pattern contains potentially slow regex. Consider simplifying.',
      });
    }
  }

  // Either name or namePattern should be specified for function/method calls
  if (
    (pattern.match.type === 'function_call' || pattern.match.type === 'method_call') &&
    !pattern.match.name &&
    !pattern.match.namePattern
  ) {
    errors.push({
      code: 'MISSING_MATCH_CRITERIA',
      path: ['match'],
      message: 'Function/method call patterns must specify either name or namePattern',
    });
  }

  // Validate parameter constraints are reasonable
  if (pattern.match.parameters) {
    const seenIndices = new Set<number>();
    for (let i = 0; i < pattern.match.parameters.length; i++) {
      const param = pattern.match.parameters[i];
      if (!param) continue;

      if (seenIndices.has(param.index)) {
        errors.push({
          code: 'DUPLICATE_PARAM_INDEX',
          path: ['match', 'parameters', i.toString()],
          message: `Duplicate parameter index: ${param.index}`,
        });
      }
      seenIndices.add(param.index);

      if (param.index < 0 || param.index > 10) {
        warnings.push({
          code: 'UNUSUAL_PARAM_INDEX',
          path: ['match', 'parameters', i.toString()],
          message: `Parameter index ${param.index} is unusual. Most functions have fewer than 10 parameters.`,
        });
      }
    }
  }

  // Check that mitigates contains at least one entry
  if (!pattern.mitigates || pattern.mitigates.length === 0) {
    errors.push({
      code: 'EMPTY_MITIGATES',
      path: ['mitigates'],
      message: 'Pattern must mitigate at least one vulnerability type',
    });
  }

  // Warn about deprecated patterns without reason
  if (pattern.deprecated && !pattern.deprecationReason) {
    warnings.push({
      code: 'DEPRECATED_NO_REASON',
      path: ['deprecationReason'],
      message: 'Deprecated patterns should include a deprecation reason',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a regex pattern might have exponential backtracking.
 * This is a simple heuristic check, not a complete analysis.
 */
function hasExponentialRegex(pattern: string): boolean {
  // Check for nested quantifiers like (a+)+ or (a*)*
  if (/\([^)]*[+*]\)[+*]/.test(pattern)) {
    return true;
  }

  // Check for overlapping alternatives with quantifiers
  if (/\([^|)]*\|[^)]*\)[+*]/.test(pattern)) {
    return true;
  }

  return false;
}

// =============================================================================
// Pattern Override Validation
// =============================================================================

/**
 * Validate a pattern override.
 */
export function validatePatternOverride(override: PatternOverride): PatternValidationResult {
  const errors: PatternValidationError[] = [];
  const warnings: PatternValidationWarning[] = [];

  if (!override.patternId || override.patternId.trim().length === 0) {
    errors.push({
      code: 'EMPTY_PATTERN_ID',
      path: ['patternId'],
      message: 'Override must specify a pattern ID',
    });
  }

  // Warn if override has no actual changes
  if (override.confidence === undefined && override.deprecated === undefined) {
    warnings.push({
      code: 'NO_OVERRIDE_CHANGES',
      path: [],
      message: 'Override has no changes specified (confidence or deprecated)',
    });
  }

  // Warn about deprecation without reason
  if (override.deprecated && !override.deprecationReason) {
    warnings.push({
      code: 'DEPRECATED_NO_REASON',
      path: ['deprecationReason'],
      message: 'Deprecated overrides should include a deprecation reason',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// =============================================================================
// Configuration Parsing
// =============================================================================

/**
 * Parse and validate a control flow configuration.
 *
 * This function:
 * 1. Parses the config using Zod schema
 * 2. Validates each custom pattern is declarative (FR-015)
 * 3. Validates pattern overrides
 * 4. Checks for conflicts and issues
 */
export function parseControlFlowConfig(rawConfig: unknown): ConfigParseResult {
  const errors: PatternValidationError[] = [];
  const warnings: PatternValidationWarning[] = [];

  // Step 1: Parse with Zod schema
  const parseResult = ControlFlowConfigSchema.safeParse(rawConfig);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push({
        code: 'SCHEMA_VALIDATION',
        path: issue.path.map(String),
        message: issue.message,
      });
    }
    return { success: false, errors, warnings };
  }

  const config = parseResult.data;

  // Step 2: Validate custom patterns count
  if (config.mitigationPatterns.length > MAX_CUSTOM_PATTERNS) {
    errors.push({
      code: 'TOO_MANY_PATTERNS',
      path: ['mitigationPatterns'],
      message: `Too many custom patterns. Maximum is ${MAX_CUSTOM_PATTERNS}, got ${config.mitigationPatterns.length}`,
    });
  }

  // Step 3: Validate each custom pattern
  const patternIds = new Set<string>();
  for (let i = 0; i < config.mitigationPatterns.length; i++) {
    const pattern = config.mitigationPatterns[i];
    if (!pattern) continue;

    // Check for duplicate IDs
    if (patternIds.has(pattern.id)) {
      errors.push({
        code: 'DUPLICATE_PATTERN_ID',
        path: ['mitigationPatterns', i.toString()],
        message: `Duplicate pattern ID: ${pattern.id}`,
      });
    }
    patternIds.add(pattern.id);

    // Validate pattern is declarative
    const patternResult = validatePatternIsDeclarative(pattern);
    for (const error of patternResult.errors) {
      errors.push({
        ...error,
        path: ['mitigationPatterns', i.toString(), ...error.path],
      });
    }
    for (const warning of patternResult.warnings) {
      warnings.push({
        ...warning,
        path: ['mitigationPatterns', i.toString(), ...warning.path],
      });
    }
  }

  // Step 4: Validate overrides count
  if (config.patternOverrides.length > MAX_PATTERN_OVERRIDES) {
    errors.push({
      code: 'TOO_MANY_OVERRIDES',
      path: ['patternOverrides'],
      message: `Too many pattern overrides. Maximum is ${MAX_PATTERN_OVERRIDES}, got ${config.patternOverrides.length}`,
    });
  }

  // Step 5: Validate each override
  const overrideIds = new Set<string>();
  for (let i = 0; i < config.patternOverrides.length; i++) {
    const override = config.patternOverrides[i];
    if (!override) continue;

    // Check for duplicate override IDs
    if (overrideIds.has(override.patternId)) {
      warnings.push({
        code: 'DUPLICATE_OVERRIDE',
        path: ['patternOverrides', i.toString()],
        message: `Multiple overrides for pattern: ${override.patternId}. Only the last one will apply.`,
      });
    }
    overrideIds.add(override.patternId);

    // Validate override
    const overrideResult = validatePatternOverride(override);
    for (const error of overrideResult.errors) {
      errors.push({
        ...error,
        path: ['patternOverrides', i.toString(), ...error.path],
      });
    }
    for (const warning of overrideResult.warnings) {
      warnings.push({
        ...warning,
        path: ['patternOverrides', i.toString(), ...warning.path],
      });
    }
  }

  // Step 6: Validate disabled patterns count
  if (config.disabledPatterns.length > MAX_DISABLED_PATTERNS) {
    errors.push({
      code: 'TOO_MANY_DISABLED',
      path: ['disabledPatterns'],
      message: `Too many disabled patterns. Maximum is ${MAX_DISABLED_PATTERNS}, got ${config.disabledPatterns.length}`,
    });
  }

  // Step 7: Check for duplicates in disabled patterns
  const disabledSet = new Set<string>();
  for (let i = 0; i < config.disabledPatterns.length; i++) {
    const id = config.disabledPatterns[i];
    if (!id) continue;

    if (disabledSet.has(id)) {
      warnings.push({
        code: 'DUPLICATE_DISABLED',
        path: ['disabledPatterns', i.toString()],
        message: `Pattern "${id}" is listed multiple times in disabled patterns`,
      });
    }
    disabledSet.add(id);
  }

  // Step 8: Check for conflicts between overrides and disabled
  for (const override of config.patternOverrides) {
    if (config.disabledPatterns.includes(override.patternId)) {
      warnings.push({
        code: 'OVERRIDE_DISABLED_CONFLICT',
        path: ['patternOverrides'],
        message: `Pattern "${override.patternId}" has an override but is also disabled. The pattern will be disabled.`,
      });
    }
  }

  return {
    success: errors.length === 0,
    config: errors.length === 0 ? config : undefined,
    errors,
    warnings,
  };
}

// =============================================================================
// Pattern Application
// =============================================================================

/**
 * Apply pattern overrides to a set of patterns.
 *
 * Returns a new array with overrides applied.
 */
export function applyPatternOverrides(
  patterns: MitigationPattern[],
  overrides: PatternOverride[]
): MitigationPattern[] {
  const overrideMap = new Map<string, PatternOverride>();
  for (const override of overrides) {
    overrideMap.set(override.patternId, override);
  }

  return patterns.map((pattern) => {
    const override = overrideMap.get(pattern.id);
    if (!override) {
      return pattern;
    }

    return {
      ...pattern,
      confidence: override.confidence ?? pattern.confidence,
      deprecated: override.deprecated ?? pattern.deprecated,
      deprecationReason: override.deprecationReason ?? pattern.deprecationReason,
    };
  });
}

/**
 * Filter out disabled patterns.
 */
export function filterDisabledPatterns(
  patterns: MitigationPattern[],
  disabledIds: string[]
): MitigationPattern[] {
  const disabledSet = new Set(disabledIds);
  return patterns.filter((p) => !disabledSet.has(p.id));
}

/**
 * Get effective patterns after applying overrides and filtering disabled.
 */
export function getEffectivePatterns(
  builtInPatterns: MitigationPattern[],
  customPatterns: MitigationPattern[],
  overrides: PatternOverride[],
  disabledIds: string[]
): MitigationPattern[] {
  // Combine built-in and custom patterns
  const allPatterns = [...builtInPatterns, ...customPatterns];

  // Apply overrides
  const withOverrides = applyPatternOverrides(allPatterns, overrides);

  // Filter disabled
  const filtered = filterDisabledPatterns(withOverrides, disabledIds);

  // Filter deprecated
  return filtered.filter((p) => !p.deprecated);
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Format validation errors for display.
 */
export function formatValidationErrors(errors: PatternValidationError[]): string {
  if (errors.length === 0) {
    return 'No errors';
  }

  return errors.map((e) => `[${e.code}] ${e.path.join('.')}: ${e.message}`).join('\n');
}

/**
 * Format validation warnings for display.
 */
export function formatValidationWarnings(warnings: PatternValidationWarning[]): string {
  if (warnings.length === 0) {
    return 'No warnings';
  }

  return warnings.map((w) => `[${w.code}] ${w.path.join('.')}: ${w.message}`).join('\n');
}
