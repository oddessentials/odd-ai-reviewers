/**
 * Safe-Source Pattern Definitions
 *
 * Declarative registry of patterns for recognizing provably non-tainted data sources.
 * Safe sources are excluded from taint tracking to prevent false positives.
 *
 * Per contract: safe-source-patterns.md v1.0
 * Per FR-001 through FR-004: Each pattern matches a specific, provable AST shape.
 */

import type { VulnerabilityType, Confidence } from './types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * How the safe source is matched in the AST.
 */
export type SafeSourceMatchType =
  | 'constant_declaration'
  | 'builtin_reference'
  | 'safe_function_return'
  | 'constant_element_access';

/**
 * Criteria for matching a safe source pattern against AST nodes.
 */
export interface SafeSourceMatchCriteria {
  type: SafeSourceMatchType;
  /** Exact identifier names to match (e.g., ['__dirname', '__filename']) */
  identifiers?: string[];
  /** Function names whose return values are safe (e.g., ['readdirSync']) */
  callTargets?: string[];
  /** If true, declaration must be at module level */
  requireModuleScope?: boolean;
  /** If true, initializer must be a literal value */
  requireLiteralInitializer?: boolean;
}

/**
 * A declarative safe-source pattern definition.
 */
export interface SafeSourcePattern {
  id: string;
  name: string;
  description: string;
  preventsTaintFor: VulnerabilityType[];
  match: SafeSourceMatchCriteria;
  confidence: Confidence;
}

/**
 * Runtime instance of a detected safe source.
 */
export interface SafeSourceInstance {
  patternId: string;
  variableName: string;
  location: { file: string; line: number };
  confidence: Confidence;
  preventsTaintFor: VulnerabilityType[];
}

// =============================================================================
// Registry Constants
// =============================================================================

export const SAFE_SOURCE_REGISTRY_VERSION = '1.0';
export const EXPECTED_PATTERN_COUNT = 9;

/**
 * All vulnerability types for patterns that prevent taint universally.
 */
export const ALL_VULN_TYPES: VulnerabilityType[] = [
  'injection',
  'null_deref',
  'auth_bypass',
  'xss',
  'path_traversal',
  'prototype_pollution',
  'ssrf',
];

// =============================================================================
// Pattern Registry
// =============================================================================

export const SAFE_SOURCE_PATTERNS: SafeSourcePattern[] = [
  // Pattern 1: Constant Literal Declarations (FR-001)
  {
    id: 'constant-literal-string',
    name: 'Constant String Literal',
    description: 'Module-scope const with string literal initializer',
    preventsTaintFor: ALL_VULN_TYPES,
    match: {
      type: 'constant_declaration',
      requireModuleScope: true,
      requireLiteralInitializer: true,
    },
    confidence: 'high',
  },
  {
    id: 'constant-literal-number',
    name: 'Constant Number Literal',
    description: 'Module-scope const with numeric literal initializer',
    preventsTaintFor: ALL_VULN_TYPES,
    match: {
      type: 'constant_declaration',
      requireModuleScope: true,
      requireLiteralInitializer: true,
    },
    confidence: 'high',
  },
  {
    id: 'constant-literal-array',
    name: 'Constant Literal Array',
    description: 'Module-scope const with array of literal values',
    preventsTaintFor: ALL_VULN_TYPES,
    match: {
      type: 'constant_declaration',
      requireModuleScope: true,
      requireLiteralInitializer: true,
    },
    confidence: 'high',
  },

  // Pattern 2: Built-in Directory References (FR-002)
  {
    id: 'builtin-dirname',
    name: 'Built-in __dirname',
    description: 'Node.js __dirname built-in reference',
    preventsTaintFor: ['path_traversal'],
    match: {
      type: 'builtin_reference',
      identifiers: ['__dirname'],
    },
    confidence: 'high',
  },
  {
    id: 'builtin-filename',
    name: 'Built-in __filename',
    description: 'Node.js __filename built-in reference',
    preventsTaintFor: ['path_traversal'],
    match: {
      type: 'builtin_reference',
      identifiers: ['__filename'],
    },
    confidence: 'high',
  },
  {
    id: 'builtin-import-meta-dirname',
    name: 'import.meta.dirname',
    description: 'ESM import.meta.dirname reference',
    preventsTaintFor: ['path_traversal'],
    match: {
      type: 'builtin_reference',
      identifiers: ['import.meta.dirname'],
    },
    confidence: 'high',
  },
  {
    id: 'builtin-import-meta-url',
    name: 'import.meta.url',
    description: 'ESM import.meta.url reference',
    preventsTaintFor: ['path_traversal'],
    match: {
      type: 'builtin_reference',
      identifiers: ['import.meta.url'],
    },
    confidence: 'high',
  },

  // Pattern 3: Safe Directory Listing Returns (FR-003)
  {
    id: 'safe-readdir',
    name: 'Safe Directory Listing',
    description: 'fs.readdirSync/readdir with provably safe argument',
    preventsTaintFor: ['path_traversal'],
    match: {
      type: 'safe_function_return',
      callTargets: ['readdirSync', 'readdir'],
    },
    confidence: 'medium',
  },

  // Pattern 4: Constant Array Element Access (FR-004)
  {
    id: 'constant-element-access',
    name: 'Constant Array Element Access',
    description: 'Element access on a module-scope const literal array',
    preventsTaintFor: ['injection', 'xss'],
    match: {
      type: 'constant_element_access',
    },
    confidence: 'high',
  },
];
