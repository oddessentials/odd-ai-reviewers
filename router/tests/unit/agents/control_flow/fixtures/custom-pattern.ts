/**
 * Test Fixtures: Custom Mitigation Patterns
 *
 * Code samples demonstrating custom company-specific sanitizers
 * and mitigation patterns that can be configured by security teams.
 */

import type {
  MitigationPattern,
  PatternOverride,
} from '../../../../../src/agents/control_flow/types.js';

// =============================================================================
// Custom Company Sanitizers
// =============================================================================

/**
 * Example code using a company-specific sanitizer function.
 */
export const companySanitizerExample = `
import { sanitizeInput, validateUserInput } from '@company/security';

async function processUserData(rawInput: string) {
  // Company-specific sanitization
  const cleanInput = sanitizeInput(rawInput);

  // Now safe to use
  return executeQuery(\`SELECT * FROM users WHERE name = '\${cleanInput}'\`);
}
`;

/**
 * Example code using company auth middleware.
 */
export const companyAuthMiddlewareExample = `
import { requireAuth, requireRole } from '@company/auth';

async function getSecretData(req: Request) {
  // Company-specific auth check
  await requireAuth(req);
  await requireRole(req, 'admin');

  return fetchSecretData();
}
`;

/**
 * Example code using company null-safety utilities.
 */
export const companyNullSafetyExample = `
import { assertDefined, ensureNotNull } from '@company/utils';

function processUser(user: User | null) {
  // Company-specific null assertion
  const validUser = ensureNotNull(user, 'User is required');

  return validUser.name;
}
`;

/**
 * Example code using company XSS protection.
 */
export const companyXssProtectionExample = `
import { renderSafeHtml, escapeUserContent } from '@company/ui';

function displayMessage(message: string) {
  // Company-specific HTML sanitization
  const safeHtml = renderSafeHtml(message);
  document.getElementById('output').innerHTML = safeHtml;
}
`;

// =============================================================================
// Custom Pattern Definitions
// =============================================================================

/**
 * Custom pattern for company-specific input sanitizer.
 */
export const companySanitizerPattern: MitigationPattern = {
  id: 'company-sanitize-input',
  name: 'Company Input Sanitizer',
  description: 'Company-specific sanitizeInput function that removes dangerous characters',
  mitigates: ['injection', 'xss'],
  match: {
    type: 'function_call',
    name: 'sanitizeInput',
    module: '@company/security',
  },
  confidence: 'high',
};

/**
 * Custom pattern for company validation library.
 */
export const companyValidatePattern: MitigationPattern = {
  id: 'company-validate-input',
  name: 'Company Input Validator',
  description: 'Company-specific validateUserInput that validates and sanitizes input',
  mitigates: ['injection', 'xss', 'path_traversal'],
  match: {
    type: 'function_call',
    name: 'validateUserInput',
    module: '@company/security',
  },
  confidence: 'high',
};

/**
 * Custom pattern for company auth middleware.
 */
export const companyAuthPattern: MitigationPattern = {
  id: 'company-require-auth',
  name: 'Company Auth Middleware',
  description: 'Company-specific requireAuth that ensures user is authenticated',
  mitigates: ['auth_bypass'],
  match: {
    type: 'function_call',
    name: 'requireAuth',
    module: '@company/auth',
  },
  confidence: 'high',
};

/**
 * Custom pattern for company role check.
 */
export const companyRolePattern: MitigationPattern = {
  id: 'company-require-role',
  name: 'Company Role Check',
  description: 'Company-specific requireRole that ensures user has required role',
  mitigates: ['auth_bypass'],
  match: {
    type: 'function_call',
    name: 'requireRole',
    module: '@company/auth',
  },
  confidence: 'high',
};

/**
 * Custom pattern for company null assertion.
 */
export const companyNullAssertPattern: MitigationPattern = {
  id: 'company-ensure-not-null',
  name: 'Company Null Assertion',
  description: 'Company-specific ensureNotNull that throws if value is null',
  mitigates: ['null_deref'],
  match: {
    type: 'function_call',
    name: 'ensureNotNull',
    module: '@company/utils',
  },
  confidence: 'high',
};

/**
 * Custom pattern for company defined assertion.
 */
export const companyAssertDefinedPattern: MitigationPattern = {
  id: 'company-assert-defined',
  name: 'Company Defined Assertion',
  description: 'Company-specific assertDefined that throws if value is undefined',
  mitigates: ['null_deref'],
  match: {
    type: 'function_call',
    name: 'assertDefined',
    module: '@company/utils',
  },
  confidence: 'high',
};

/**
 * Custom pattern for company HTML sanitizer.
 */
export const companyHtmlSanitizePattern: MitigationPattern = {
  id: 'company-render-safe-html',
  name: 'Company HTML Sanitizer',
  description: 'Company-specific renderSafeHtml that sanitizes HTML content',
  mitigates: ['xss'],
  match: {
    type: 'function_call',
    name: 'renderSafeHtml',
    module: '@company/ui',
  },
  confidence: 'high',
};

/**
 * Custom pattern using regex matching for family of functions.
 */
export const companyValidatorFamilyPattern: MitigationPattern = {
  id: 'company-validator-family',
  name: 'Company Validator Family',
  description: 'Company validators matching validate* pattern',
  mitigates: ['injection', 'xss'],
  match: {
    type: 'function_call',
    namePattern: '^validate[A-Z]\\w*$',
    module: '@company/validators',
  },
  confidence: 'medium',
};

/**
 * Custom pattern with parameter constraints.
 */
export const companySafeQueryPattern: MitigationPattern = {
  id: 'company-safe-query',
  name: 'Company Safe Query Builder',
  description: 'Company query builder that prevents SQL injection',
  mitigates: ['injection'],
  match: {
    type: 'method_call',
    name: 'safeQuery',
    parameters: [
      { index: 0, constraint: 'string' },
      { index: 1, constraint: 'any' },
    ],
    returnConstraint: 'sanitized',
  },
  confidence: 'high',
};

/**
 * All custom patterns for testing.
 */
export const ALL_CUSTOM_PATTERNS: MitigationPattern[] = [
  companySanitizerPattern,
  companyValidatePattern,
  companyAuthPattern,
  companyRolePattern,
  companyNullAssertPattern,
  companyAssertDefinedPattern,
  companyHtmlSanitizePattern,
  companyValidatorFamilyPattern,
  companySafeQueryPattern,
];

// =============================================================================
// Pattern Override Examples
// =============================================================================

/**
 * Override to increase confidence of a built-in pattern.
 */
export const boostConfidenceOverride: PatternOverride = {
  patternId: 'validator-escape',
  confidence: 'high',
};

/**
 * Override to deprecate an old pattern.
 */
export const deprecatePatternOverride: PatternOverride = {
  patternId: 'lodash-escape',
  deprecated: true,
  deprecationReason: 'Use company-render-safe-html instead for consistent XSS protection',
};

/**
 * Override to lower confidence of a pattern.
 */
export const lowerConfidenceOverride: PatternOverride = {
  patternId: 'path-normalize',
  confidence: 'low',
  deprecationReason: 'path.normalize alone is not sufficient for path traversal protection',
};

/**
 * All pattern overrides for testing.
 */
export const ALL_PATTERN_OVERRIDES: PatternOverride[] = [
  boostConfidenceOverride,
  deprecatePatternOverride,
  lowerConfidenceOverride,
];

// =============================================================================
// Disabled Patterns
// =============================================================================

/**
 * Patterns to disable for security policy compliance.
 */
export const DISABLED_PATTERNS: string[] = [
  'encodeURI', // Not sufficient for XSS protection
  'path-normalize', // Not sufficient for path traversal
];

// =============================================================================
// Invalid Pattern Examples (for error testing)
// =============================================================================

/**
 * Pattern with invalid regex in namePattern.
 */
export const invalidRegexPattern = {
  id: 'invalid-regex',
  name: 'Invalid Regex Pattern',
  description: 'Pattern with invalid regex',
  mitigates: ['injection'],
  match: {
    type: 'function_call',
    namePattern: '[invalid(regex',
  },
  confidence: 'high',
};

/**
 * Pattern missing required fields.
 */
export const missingFieldsPattern = {
  id: 'missing-fields',
  // Missing: name, description, mitigates, match, confidence
};

/**
 * Pattern with empty mitigates array.
 */
export const emptyMitigatesPattern = {
  id: 'empty-mitigates',
  name: 'Empty Mitigates',
  description: 'Pattern with no vulnerability types',
  mitigates: [],
  match: {
    type: 'function_call',
    name: 'something',
  },
  confidence: 'high',
};

/**
 * Pattern with invalid vulnerability type.
 */
export const invalidVulnTypePattern = {
  id: 'invalid-vuln-type',
  name: 'Invalid Vuln Type',
  description: 'Pattern with unknown vulnerability type',
  mitigates: ['unknown_vuln_type'],
  match: {
    type: 'function_call',
    name: 'something',
  },
  confidence: 'high',
};

/**
 * Pattern with invalid confidence level.
 */
export const invalidConfidencePattern = {
  id: 'invalid-confidence',
  name: 'Invalid Confidence',
  description: 'Pattern with unknown confidence level',
  mitigates: ['injection'],
  match: {
    type: 'function_call',
    name: 'something',
  },
  confidence: 'super_high',
};

/**
 * Pattern with invalid match type.
 */
export const invalidMatchTypePattern = {
  id: 'invalid-match-type',
  name: 'Invalid Match Type',
  description: 'Pattern with unknown match type',
  mitigates: ['injection'],
  match: {
    type: 'invalid_type',
    name: 'something',
  },
  confidence: 'high',
};

// =============================================================================
// Full Configuration Examples
// =============================================================================

/**
 * Example full configuration with custom patterns.
 */
export const EXAMPLE_CONFIG = {
  enabled: true,
  maxCallDepth: 5,
  timeBudgetMs: 300000,
  sizeBudgetLines: 10000,
  mitigationPatterns: ALL_CUSTOM_PATTERNS,
  patternOverrides: ALL_PATTERN_OVERRIDES,
  disabledPatterns: DISABLED_PATTERNS,
};

/**
 * Minimal configuration with just custom patterns.
 */
export const MINIMAL_CONFIG = {
  mitigationPatterns: [companySanitizerPattern],
};

/**
 * Configuration with only overrides.
 */
export const OVERRIDES_ONLY_CONFIG = {
  patternOverrides: ALL_PATTERN_OVERRIDES,
};

/**
 * Configuration with only disabled patterns.
 */
export const DISABLED_ONLY_CONFIG = {
  disabledPatterns: DISABLED_PATTERNS,
};
