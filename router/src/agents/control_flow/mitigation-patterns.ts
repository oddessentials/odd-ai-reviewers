/**
 * Built-in Mitigation Patterns
 *
 * Defines patterns for recognizing common security mitigations.
 * These patterns are matched against AST nodes during CFG construction.
 *
 * Per FR-006: Each pattern maps to specific vulnerability types it mitigates.
 * Per FR-015: All patterns are declarative and side-effect-free.
 */

import type { MitigationPattern } from './types.js';

// =============================================================================
// Input Validation Patterns (T021)
// Mitigates: injection, xss, path_traversal, ssrf
// =============================================================================

export const inputValidationPatterns: MitigationPattern[] = [
  // Zod validation
  {
    id: 'zod-parse',
    name: 'Zod Schema Parse',
    description: 'Validates input against a Zod schema, throwing on invalid input',
    mitigates: ['injection', 'xss', 'path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^parse$',
      module: 'zod',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'zod-safeParse',
    name: 'Zod Safe Parse',
    description: 'Validates input against a Zod schema, returning result object',
    mitigates: ['injection', 'xss', 'path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^safeParse$',
      module: 'zod',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Joi validation
  {
    id: 'joi-validate',
    name: 'Joi Schema Validate',
    description: 'Validates input against a Joi schema',
    mitigates: ['injection', 'xss', 'path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^validate$',
      module: 'joi',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'joi-validateAsync',
    name: 'Joi Async Validate',
    description: 'Validates input asynchronously against a Joi schema',
    mitigates: ['injection', 'xss', 'path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^validateAsync$',
      module: 'joi',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Validator.js
  {
    id: 'validator-escape',
    name: 'Validator.js Escape',
    description: 'Escapes HTML characters to prevent XSS',
    mitigates: ['xss'],
    match: {
      type: 'function_call',
      namePattern: '^escape$',
      module: 'validator',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'validator-isEmail',
    name: 'Validator.js Email Check',
    description: 'Validates email format',
    mitigates: ['injection'],
    match: {
      type: 'function_call',
      namePattern: '^isEmail$',
      module: 'validator',
      returnConstraint: 'truthy',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
  {
    id: 'validator-isURL',
    name: 'Validator.js URL Check',
    description: 'Validates URL format',
    mitigates: ['ssrf', 'injection'],
    match: {
      type: 'function_call',
      namePattern: '^isURL$',
      module: 'validator',
      returnConstraint: 'truthy',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
  {
    id: 'validator-isAlphanumeric',
    name: 'Validator.js Alphanumeric Check',
    description: 'Validates input is alphanumeric only',
    mitigates: ['injection', 'path_traversal'],
    match: {
      type: 'function_call',
      namePattern: '^isAlphanumeric$',
      module: 'validator',
      returnConstraint: 'truthy',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Parameterized queries (implicit mitigation)
  {
    id: 'sql-parameterized',
    name: 'SQL Parameterized Query',
    description: 'Uses parameterized query with placeholders ($1, ?, :param)',
    mitigates: ['injection'],
    match: {
      type: 'method_call',
      namePattern: '^(query|execute|run|prepare)$',
      parameters: [{ index: 1, constraint: 'any' }], // Second param = values array
    },
    confidence: 'high',
    isBuiltIn: true,
  },
];

// =============================================================================
// Null Safety Patterns (T022)
// Mitigates: null_deref
// =============================================================================

export const nullSafetyPatterns: MitigationPattern[] = [
  // Optional chaining
  {
    id: 'optional-chaining',
    name: 'Optional Chaining',
    description: 'Uses ?. operator for safe property access',
    mitigates: ['null_deref'],
    match: {
      type: 'type_guard',
      namePattern: '^\\?\\.', // Regex to match ?. operator
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Nullish coalescing
  {
    id: 'nullish-coalescing',
    name: 'Nullish Coalescing',
    description: 'Uses ?? operator to provide default value',
    mitigates: ['null_deref'],
    match: {
      type: 'assignment',
      namePattern: '^\\?\\?', // Regex to match ?? operator
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Nullish assignment
  {
    id: 'nullish-assignment',
    name: 'Nullish Assignment',
    description: 'Uses ??= operator for conditional assignment',
    mitigates: ['null_deref'],
    match: {
      type: 'assignment',
      namePattern: '^\\?\\?=', // Regex to match ??= operator
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Typeof check
  {
    id: 'typeof-check',
    name: 'Typeof Check',
    description: 'Uses typeof to check value type before access',
    mitigates: ['null_deref'],
    match: {
      type: 'typeof_check',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Instanceof check
  {
    id: 'instanceof-check',
    name: 'Instanceof Check',
    description: 'Uses instanceof to verify object type',
    mitigates: ['null_deref'],
    match: {
      type: 'instanceof_check',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Explicit null/undefined checks
  {
    id: 'null-check-strict',
    name: 'Strict Null Check',
    description: 'Checks value against null with strict equality',
    mitigates: ['null_deref'],
    match: {
      type: 'type_guard',
      namePattern: '^(!==?\\s*null|===?\\s*null)', // x !== null or x === null
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'undefined-check-strict',
    name: 'Strict Undefined Check',
    description: 'Checks value against undefined with strict equality',
    mitigates: ['null_deref'],
    match: {
      type: 'type_guard',
      namePattern: '^(!==?\\s*undefined|===?\\s*undefined)',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'nullish-check',
    name: 'Nullish Check (== null)',
    description: 'Checks value for null or undefined using loose equality',
    mitigates: ['null_deref'],
    match: {
      type: 'type_guard',
      namePattern: '^(!=\\s*null|==\\s*null)', // x != null (catches both null and undefined)
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Assertion functions
  {
    id: 'assert-defined',
    name: 'Assert Defined',
    description: 'Assertion function that throws if value is null/undefined',
    mitigates: ['null_deref'],
    match: {
      type: 'function_call',
      namePattern: '^(assertDefined|assertNotNull|assertNotNullish|assert)$',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
];

// =============================================================================
// Auth Check Patterns (T023)
// Mitigates: auth_bypass
// =============================================================================

export const authCheckPatterns: MitigationPattern[] = [
  // JWT verification
  {
    id: 'jwt-verify',
    name: 'JWT Verify',
    description: 'Verifies JWT token signature and claims',
    mitigates: ['auth_bypass'],
    match: {
      type: 'method_call',
      namePattern: '^verify$',
      module: 'jsonwebtoken',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'jwt-decode-verify',
    name: 'JWT Decode with Verify',
    description: 'Decodes and verifies JWT token',
    mitigates: ['auth_bypass'],
    match: {
      type: 'function_call',
      namePattern: '^(jwtVerify|verifyToken|verifyJwt)$',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },

  // Passport.js
  {
    id: 'passport-authenticate',
    name: 'Passport Authenticate',
    description: 'Passport.js authentication middleware',
    mitigates: ['auth_bypass'],
    match: {
      type: 'method_call',
      namePattern: '^authenticate$',
      module: 'passport',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'passport-isAuthenticated',
    name: 'Passport isAuthenticated',
    description: 'Checks if user is authenticated via Passport session',
    mitigates: ['auth_bypass'],
    match: {
      type: 'method_call',
      namePattern: '^isAuthenticated$',
      returnConstraint: 'truthy',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Session checks
  {
    id: 'session-user-check',
    name: 'Session User Check',
    description: 'Checks for user object in session',
    mitigates: ['auth_bypass'],
    match: {
      type: 'type_guard',
      namePattern: '^(session\\.user|req\\.session\\.user|session\\?.user)',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
  {
    id: 'session-id-check',
    name: 'Session ID Check',
    description: 'Checks for user ID in session',
    mitigates: ['auth_bypass'],
    match: {
      type: 'type_guard',
      namePattern: '^(session\\.userId|req\\.session\\.userId|session\\?.userId)',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },

  // Role/permission checks
  {
    id: 'role-check',
    name: 'Role Check',
    description: 'Checks user role for authorization',
    mitigates: ['auth_bypass'],
    match: {
      type: 'type_guard',
      namePattern: '^(user\\.role|req\\.user\\.role|\\.role\\s*===)',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
  {
    id: 'permission-check',
    name: 'Permission Check',
    description: 'Checks user permissions for authorization',
    mitigates: ['auth_bypass'],
    match: {
      type: 'function_call',
      namePattern: '^(hasPermission|checkPermission|can|authorize)$',
      returnConstraint: 'truthy',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },

  // OAuth token verification
  {
    id: 'oauth-verify',
    name: 'OAuth Token Verify',
    description: 'Verifies OAuth access token',
    mitigates: ['auth_bypass'],
    match: {
      type: 'method_call',
      namePattern: '^(verifyAccessToken|validateToken|introspect)$',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },

  // API key validation
  {
    id: 'api-key-validate',
    name: 'API Key Validation',
    description: 'Validates API key for authentication',
    mitigates: ['auth_bypass'],
    match: {
      type: 'function_call',
      namePattern: '^(validateApiKey|verifyApiKey|isValidApiKey)$',
      returnConstraint: 'truthy',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
];

// =============================================================================
// Output Encoding Patterns (T024)
// Mitigates: xss
// =============================================================================

export const outputEncodingPatterns: MitigationPattern[] = [
  // DOMPurify
  {
    id: 'dompurify-sanitize',
    name: 'DOMPurify Sanitize',
    description: 'Sanitizes HTML to prevent XSS',
    mitigates: ['xss'],
    match: {
      type: 'method_call',
      namePattern: '^sanitize$',
      module: 'dompurify',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // Built-in encoding functions
  {
    id: 'encodeURI',
    name: 'encodeURI',
    description: 'Encodes a URI',
    mitigates: ['xss', 'injection'],
    match: {
      type: 'function_call',
      name: 'encodeURI',
      returnConstraint: 'sanitized',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
  {
    id: 'encodeURIComponent',
    name: 'encodeURIComponent',
    description: 'Encodes a URI component',
    mitigates: ['xss', 'injection'],
    match: {
      type: 'function_call',
      name: 'encodeURIComponent',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // HTML entity encoding
  {
    id: 'he-encode',
    name: 'he.encode',
    description: 'Encodes HTML entities using he library',
    mitigates: ['xss'],
    match: {
      type: 'method_call',
      namePattern: '^encode$',
      module: 'he',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'he-escape',
    name: 'he.escape',
    description: 'Escapes HTML entities using he library',
    mitigates: ['xss'],
    match: {
      type: 'method_call',
      namePattern: '^escape$',
      module: 'he',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // lodash/underscore escape
  {
    id: 'lodash-escape',
    name: 'Lodash Escape',
    description: 'Escapes HTML using lodash/underscore',
    mitigates: ['xss'],
    match: {
      type: 'method_call',
      namePattern: '^escape$',
      module: 'lodash',
      returnConstraint: 'sanitized',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // React automatic escaping (JSX)
  {
    id: 'react-jsx-escape',
    name: 'React JSX Escape',
    description: 'React automatically escapes JSX content',
    mitigates: ['xss'],
    match: {
      type: 'assignment',
      namePattern: '^<[A-Z]', // JSX element assignment
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // textContent (safe DOM assignment)
  {
    id: 'textContent-assignment',
    name: 'textContent Assignment',
    description: 'Assigning to textContent is safe from XSS',
    mitigates: ['xss'],
    match: {
      type: 'assignment',
      namePattern: '\\.textContent\\s*=',
    },
    confidence: 'high',
    isBuiltIn: true,
  },

  // createTextNode (safe DOM method)
  {
    id: 'createTextNode',
    name: 'createTextNode',
    description: 'Creating text node is safe from XSS',
    mitigates: ['xss'],
    match: {
      type: 'method_call',
      name: 'createTextNode',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
];

// =============================================================================
// Path Traversal Patterns
// Mitigates: path_traversal
// =============================================================================

export const pathTraversalPatterns: MitigationPattern[] = [
  {
    id: 'path-resolve',
    name: 'Path Resolve',
    description: 'Resolves path segments to absolute path',
    mitigates: ['path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^resolve$',
      module: 'path',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
  {
    id: 'path-normalize',
    name: 'Path Normalize',
    description: 'Normalizes path by resolving . and ..',
    mitigates: ['path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^normalize$',
      module: 'path',
    },
    confidence: 'low', // normalize alone doesn't prevent traversal
    isBuiltIn: true,
  },
  {
    id: 'path-basename',
    name: 'Path Basename',
    description: 'Extracts filename only, preventing directory traversal',
    mitigates: ['path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^basename$',
      module: 'path',
    },
    confidence: 'high',
    isBuiltIn: true,
  },
  {
    id: 'startsWith-check',
    name: 'Path Prefix Check',
    description: 'Verifies path starts with allowed directory',
    mitigates: ['path_traversal'],
    match: {
      type: 'method_call',
      namePattern: '^startsWith$',
      returnConstraint: 'truthy',
    },
    confidence: 'medium',
    isBuiltIn: true,
  },
];

// =============================================================================
// Aggregate Exports
// =============================================================================

/**
 * All built-in mitigation patterns.
 * Organized by category for easy reference and testing.
 */
export const BUILTIN_PATTERNS: MitigationPattern[] = [
  ...inputValidationPatterns,
  ...nullSafetyPatterns,
  ...authCheckPatterns,
  ...outputEncodingPatterns,
  ...pathTraversalPatterns,
];

/**
 * Pattern lookup by ID for fast access.
 */
export const PATTERN_BY_ID = new Map<string, MitigationPattern>(
  BUILTIN_PATTERNS.map((p) => [p.id, p])
);

/**
 * Get patterns that mitigate a specific vulnerability type.
 */
export function getPatternsForVulnerability(vulnType: string): MitigationPattern[] {
  return BUILTIN_PATTERNS.filter((p) => p.mitigates.includes(vulnType as never));
}

/**
 * Get pattern by ID.
 */
export function getPatternById(id: string): MitigationPattern | undefined {
  return PATTERN_BY_ID.get(id);
}
