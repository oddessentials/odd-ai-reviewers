/**
 * Contract: Framework Pattern Filter (FR-013)
 *
 * Deterministic post-processing filter that catches Pattern B false positives
 * using a closed, default-deny matcher table. Runs in Stage 1 validation
 * (after self-contradiction filter, before Stage 2 diff-bound validation).
 *
 * This file defines the interface contract only — not the implementation.
 */

import type { Finding } from '../../router/src/agents/types.js';

// --- Matcher Table Contract ---

export interface FrameworkPatternMatcher {
  /** Unique matcher identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Regex that triggers evaluation when matched against finding.message */
  readonly messagePattern: RegExp;
  /**
   * Validates structural evidence in diff content.
   * Returns true if evidence confirms the framework pattern (suppress finding).
   * Returns false if evidence is missing or ambiguous (pass finding through).
   */
  evidenceValidator(finding: Finding, diffContent: string): boolean;
  /** Diagnostic reason logged when finding is suppressed */
  readonly suppressionReason: string;
}

// --- Filter Result Contract ---

export interface FrameworkFilterResult {
  finding: Finding;
  suppressed: boolean;
  matcherId?: string;
  reason?: string;
}

export interface FrameworkFilterSummary {
  total: number;
  suppressed: number;
  passed: number;
  results: FrameworkFilterResult[];
}

// --- Public API Contract ---

/**
 * Evaluate findings against the closed matcher table.
 * Default-deny: only exact matches with validated evidence are suppressed.
 *
 * @param findings - Findings that passed Stage 1 semantic validation
 * @param diffContent - Raw diff content for evidence validation
 * @returns Summary with suppressed/passed findings and diagnostic details
 */
export type FilterFrameworkConventionFindings = (
  findings: Finding[],
  diffContent: string
) => FrameworkFilterSummary;

// --- Closed Matcher Table (3 matchers — spec amendment required to add) ---

/**
 * Matcher: Express Error Middleware
 * Recognizes: 4-parameter Express error handler registered via .use()
 * Suppresses: "unused parameter" findings on params 3-4
 */

/**
 * Matcher: TypeScript Unused Prefix
 * Recognizes: Parameters matching /^_\w+$/
 * Suppresses: "unused variable/parameter" findings
 */

/**
 * Matcher: Exhaustive Switch
 * Recognizes: default case containing assertNever() or exhaustive throw
 * Suppresses: "missing case" findings on the default
 */
