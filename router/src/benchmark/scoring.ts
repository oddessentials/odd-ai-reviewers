/**
 * Benchmark Scoring Module
 *
 * Types and scoring functions for the false-positive regression benchmark.
 * Implements dual-pool scoring (FP suppression rate + TP recall/precision)
 * per benchmark-scenario.md contract.
 */

import type { Finding } from '../agents/types.js';

// =============================================================================
// Severity Ranking
// =============================================================================

const SEVERITY_RANK: Record<string, number> = {
  info: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
  error: 5,
  warning: 3,
};

// =============================================================================
// Types
// =============================================================================

export interface BenchmarkScenario {
  id: string;
  category: string;
  pattern: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  description: string;
  sourceIssue: string;
  diff: string;
  config?: Record<string, unknown>;
  prDescription?: string;
  projectRules?: string;
  expectedFindings: ExpectedFinding[];
  truePositive: boolean;
  subcategory?: string;
  source?: string;
  /** Synthetic findings injected before validation (Pattern E scenarios). */
  syntheticFindings?: Finding[];
}

export interface ExpectedFinding {
  file: string;
  line?: number;
  severityAtLeast?: string;
  messageContains?: string;
  ruleId?: string;
}

export interface FPRegressionPool {
  total: number;
  trueNegatives: number;
  falsePositives: number;
  suppressionRate: number;
  fpRate: number;
}

export interface TPPreservationPool {
  total: number;
  truePositives: number;
  falseNegatives: number;
  extraneous: number;
  recall: number;
  precision: number;
}

export interface ScenarioResult {
  id: string;
  passed: boolean;
  category: string;
  pattern: string;
  truePositive: boolean;
  actualFindings: Finding[];
  expectedFindings: ExpectedFinding[];
  matchedCount: number;
  unmatchedExpected: ExpectedFinding[];
  extraneousFindings: Finding[];
  timedOut: boolean;
}

export interface BenchmarkReport {
  schemaVersion: string;
  timestamp: string;
  totalScenarios: number;
  pool1: FPRegressionPool;
  pool2: TPPreservationPool;
  byCategory: Record<string, { total: number; passed: number; failed: number }>;
  scenarios: ScenarioResult[];
}

// =============================================================================
// Matching Functions
// =============================================================================

/**
 * Check if an actual finding matches an expected finding.
 * File match is required; severity, message, and ruleId are optional constraints.
 */
export function matchFinding(expected: ExpectedFinding, actual: Finding): boolean {
  // File match required
  if (actual.file !== expected.file) return false;

  // Line match (if specified)
  if (expected.line !== undefined && actual.line !== expected.line) return false;

  // Severity match (if specified): actual severity must be >= expected minimum
  if (expected.severityAtLeast !== undefined) {
    const actualRank = SEVERITY_RANK[actual.severity] ?? 0;
    const expectedRank = SEVERITY_RANK[expected.severityAtLeast] ?? 0;
    if (actualRank < expectedRank) return false;
  }

  // Message match (if specified): actual message must contain expected substring
  if (expected.messageContains !== undefined) {
    if (!actual.message.toLowerCase().includes(expected.messageContains.toLowerCase()))
      return false;
  }

  // Rule match (if specified)
  if (expected.ruleId !== undefined && actual.ruleId !== expected.ruleId) return false;

  return true;
}

/**
 * Count the number of defined optional fields on an ExpectedFinding.
 * Used to sort by specificity (most fields first).
 */
function specificityScore(ef: ExpectedFinding): number {
  let score = 0;
  if (ef.line !== undefined) score++;
  if (ef.severityAtLeast !== undefined) score++;
  if (ef.messageContains !== undefined) score++;
  if (ef.ruleId !== undefined) score++;
  return score;
}

/**
 * 1:1 strict matching of expected findings against actual findings.
 * Sort expected by specificity (most fields first), then consume matched actuals.
 */
export function matchFindings(
  expected: ExpectedFinding[],
  actual: Finding[]
): {
  matched: number;
  unmatchedExpected: ExpectedFinding[];
  extraneous: Finding[];
} {
  // Sort expected by specificity descending (most specific matched first)
  const sortedExpected = [...expected].sort((a, b) => specificityScore(b) - specificityScore(a));

  const consumed = new Set<number>();
  const unmatchedExpected: ExpectedFinding[] = [];
  let matched = 0;

  for (const exp of sortedExpected) {
    let found = false;
    for (let i = 0; i < actual.length; i++) {
      if (consumed.has(i)) continue;
      const actualFinding = actual[i];
      if (actualFinding && matchFinding(exp, actualFinding)) {
        consumed.add(i);
        matched++;
        found = true;
        break;
      }
    }
    if (!found) {
      unmatchedExpected.push(exp);
    }
  }

  const extraneous = actual.filter((_, i) => !consumed.has(i));

  return { matched, unmatchedExpected, extraneous };
}

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Score a single benchmark scenario.
 *
 * - FP scenario (truePositive: false): passed = actualFindings.length === 0
 * - TP scenario (truePositive: true): passed = all expectedFindings matched
 */
export function scoreScenario(
  scenario: BenchmarkScenario,
  actualFindings: Finding[],
  timedOut = false
): ScenarioResult {
  if (!scenario.truePositive) {
    // FP scenario: no findings expected
    return {
      id: scenario.id,
      passed: actualFindings.length === 0,
      category: scenario.category,
      pattern: scenario.pattern,
      truePositive: false,
      actualFindings,
      expectedFindings: scenario.expectedFindings,
      matchedCount: 0,
      unmatchedExpected: [],
      extraneousFindings: actualFindings,
      timedOut,
    };
  }

  // TP scenario: all expected findings must match
  const { matched, unmatchedExpected, extraneous } = matchFindings(
    scenario.expectedFindings,
    actualFindings
  );

  return {
    id: scenario.id,
    passed: unmatchedExpected.length === 0,
    category: scenario.category,
    pattern: scenario.pattern,
    truePositive: true,
    actualFindings,
    expectedFindings: scenario.expectedFindings,
    matchedCount: matched,
    unmatchedExpected,
    extraneousFindings: extraneous,
    timedOut,
  };
}

/**
 * Compute the aggregate benchmark report from individual scenario results.
 * Pool 1 (FP) and Pool 2 (TP) are scored independently.
 */
export function computeReport(results: ScenarioResult[]): BenchmarkReport {
  const fpResults = results.filter((r) => !r.truePositive);
  const tpResults = results.filter((r) => r.truePositive);

  // Pool 1: FP Regression
  const trueNegatives = fpResults.filter((r) => r.passed).length;
  const falsePositives = fpResults.length - trueNegatives;
  const suppressionRate = fpResults.length > 0 ? trueNegatives / fpResults.length : 1;

  // Pool 2: TP Preservation
  const totalTpExpected = tpResults.reduce((sum, r) => sum + r.expectedFindings.length, 0);
  const totalTpMatched = tpResults.reduce((sum, r) => sum + r.matchedCount, 0);
  const totalTpFN = totalTpExpected - totalTpMatched;
  const totalExtraneous = tpResults.reduce((sum, r) => sum + r.extraneousFindings.length, 0);
  const recall = totalTpExpected > 0 ? totalTpMatched / totalTpExpected : 1;
  const precision =
    totalTpMatched + totalExtraneous > 0 ? totalTpMatched / (totalTpMatched + totalExtraneous) : 1;

  // By category
  const byCategory: Record<string, { total: number; passed: number; failed: number }> = {};
  for (const r of results) {
    const key = r.category;
    if (!byCategory[key]) {
      byCategory[key] = { total: 0, passed: 0, failed: 0 };
    }
    byCategory[key].total++;
    if (r.passed) {
      byCategory[key].passed++;
    } else {
      byCategory[key].failed++;
    }
  }

  return {
    schemaVersion: '1.0.0',
    timestamp: new Date().toISOString(),
    totalScenarios: results.length,
    pool1: {
      total: fpResults.length,
      trueNegatives,
      falsePositives,
      suppressionRate,
      fpRate: 1 - suppressionRate,
    },
    pool2: {
      total: tpResults.length,
      truePositives: totalTpMatched,
      falseNegatives: totalTpFN,
      extraneous: totalExtraneous,
      recall,
      precision,
    },
    byCategory,
    scenarios: results,
  };
}
