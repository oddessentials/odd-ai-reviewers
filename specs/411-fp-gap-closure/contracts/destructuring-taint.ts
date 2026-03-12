/**
 * Contract: Destructuring Taint Tracking (FR-001 through FR-009)
 *
 * Extends taint propagation to handle destructuring assignment targets
 * (ArrayLiteralExpression and ObjectLiteralExpression on BinaryExpression LHS).
 *
 * This file defines the interface contract only — not the implementation.
 */

import type * as ts from 'typescript';

// --- Binding Extraction Contract ---

export interface DestructuringBinding {
  /** Local binding name (after rename resolution) */
  name: string;
  /** AST node for the binding */
  node: ts.Node;
  /** Position in array destructuring */
  index?: number;
  /** Original property key (for renamed: `{ orig: renamed }`) */
  propertyKey?: string;
  /** Whether this is a rest element (`...rest`) */
  isRest: boolean;
  /** Nesting depth (0 = top-level, max 10) */
  depth: number;
}

/**
 * Extract binding names from a destructuring assignment target.
 * Handles ArrayLiteralExpression and ObjectLiteralExpression patterns
 * used on the LHS of BinaryExpression (assignment targets).
 *
 * This is the Expression-based counterpart to extractBindingNames()
 * which handles BindingPattern nodes in VariableDeclarations.
 *
 * @param target - The LHS of a destructuring assignment (ArrayLiteralExpression or ObjectLiteralExpression)
 * @param maxDepth - Maximum recursion depth (default 10)
 * @returns Array of extracted bindings with metadata
 */
export type ExtractBindingsFromAssignmentTarget = (
  target: ts.Expression,
  maxDepth?: number
) => DestructuringBinding[];

// --- Taint Semantics Contract ---

/**
 * Binding-Level Taint Semantics:
 *
 * Tier 1 — Per-element for literals:
 *   When RHS is ArrayLiteralExpression or ObjectLiteralExpression,
 *   evaluate each element individually.
 *   Example: [a, b] = [req.body.x, "safe"] → a: tainted, b: safe
 *
 * Tier 2 — Conservative-all for expressions:
 *   When RHS is any non-literal expression (PropertyAccessExpression,
 *   CallExpression, Identifier, etc.), ALL extracted bindings are tainted.
 *   Example: { a, b } = req.body → both tainted
 *
 * Tier 3 — Safe for Pattern 1:
 *   When RHS resolves to a safe constant (per safe-source-detector),
 *   extracted bindings inherit safe classification.
 *   Example: [x, y] = SAFE_CONST_ARRAY → both safe
 */

export type TaintTier = 'per-element' | 'conservative-all' | 'safe';

export interface TaintResolution {
  binding: DestructuringBinding;
  tier: TaintTier;
  tainted: boolean;
  /** Source expression that determined taint (for diagnostics) */
  sourceExpression?: ts.Expression;
}

/**
 * Resolve taint for destructuring bindings based on the RHS expression.
 *
 * @param bindings - Extracted bindings from the LHS
 * @param rhs - The right-hand side expression
 * @param taintedSet - Currently tainted variable names in scope
 * @param safeSourceSet - Currently safe source variable names
 * @returns Per-binding taint resolution
 */
export type ResolveDestructuringTaint = (
  bindings: DestructuringBinding[],
  rhs: ts.Expression,
  taintedSet: Set<string>,
  safeSourceSet: Set<string>
) => TaintResolution[];

// --- Mutation Tracking Extension Contract ---

/**
 * Detect mutations via destructuring assignment targets.
 * Extends collectMutatedBindings() to handle:
 *   [x, y] = value  → marks x, y as mutated
 *   ({ a, b } = obj) → marks a, b as mutated
 *
 * @param target - The LHS expression (ArrayLiteralExpression or ObjectLiteralExpression)
 * @returns Set of variable names that were mutated
 */
export type CollectDestructuredMutations = (target: ts.Expression) => Set<string>;
