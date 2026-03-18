/**
 * User-Configurable Suppressions (FR-022)
 *
 * Stage 1.25 in the finding pipeline: applies user-defined suppression rules
 * from .ai-review.yml configuration. Runs after semantic validation (Stage 1)
 * and before framework convention filter (Stage 1.5).
 *
 * Security: In CI mode, rules are loaded from the BASE branch config to prevent
 * attackers from smuggling suppressions into fork PRs.
 */

import { execFileSync } from 'child_process';
import { parse as parseYaml } from 'yaml';
import { minimatch } from 'minimatch';
import type { Finding } from '../agents/types.js';
import { SuppressionsSchema, type SuppressionRule, type Suppressions } from '../config/schemas.js';
import { ConfigError, ConfigErrorCode } from '../types/errors.js';
import { SafeGitRefHelpers } from '../types/branded.js';
import { isOk } from '../types/result.js';

// =============================================================================
// Types
// =============================================================================

export interface SuppressionMatchResult {
  finding: Finding;
  rule: SuppressionRule;
  ruleIndex: number;
}

export interface UserSuppressionResult {
  /** Findings that passed all suppression rules */
  filtered: Finding[];
  /** Findings that were suppressed with their matching rule */
  suppressed: SuppressionMatchResult[];
  /** Per-rule match count (keyed by rule index) */
  matchCounts: Map<number, number>;
}

export type SuppressionMode = 'ci' | 'local';

export interface BreadthViolation {
  ruleIndex: number;
  reason: string;
  matchCount: number;
  limit: number;
  hasOverride: boolean;
}

// =============================================================================
// Matching Logic
// =============================================================================

/**
 * Test if a suppression rule matches a finding.
 * All specified criteria must match (AND logic).
 */
function ruleMatchesFinding(rule: SuppressionRule, finding: Finding): boolean {
  // Rule ID: glob match
  if (rule.rule !== undefined) {
    const ruleId = finding.ruleId ?? '';
    if (!minimatch(ruleId, rule.rule)) return false;
  }

  // Message: anchored regex (validated at config load: must start with ^ and end with $)
  if (rule.message !== undefined) {
    try {
      // SAFETY: rule.message is validated by SuppressionRuleSchema to be fully anchored (^...$).
      // eslint-disable-next-line security/detect-non-literal-regexp
      const regex = new RegExp(rule.message);
      if (!regex.test(finding.message)) return false;
    } catch {
      // Invalid regex — treat as non-match (validated at config time)
      return false;
    }
  }

  // File: glob match
  if (rule.file !== undefined) {
    const filePath = finding.file ?? '';
    if (!minimatch(filePath, rule.file)) return false;
  }

  // Severity: exact match
  if (rule.severity !== undefined) {
    if (finding.severity !== rule.severity) return false;
  }

  return true;
}

/**
 * Filter findings through user-defined suppression rules.
 * First matching rule wins (no multi-rule accumulation).
 */
export function filterUserSuppressions(
  findings: Finding[],
  rules: SuppressionRule[]
): UserSuppressionResult {
  if (rules.length === 0) {
    return { filtered: [...findings], suppressed: [], matchCounts: new Map() };
  }

  const filtered: Finding[] = [];
  const suppressed: SuppressionMatchResult[] = [];
  const matchCounts = new Map<number, number>();

  // Initialize counts
  for (let i = 0; i < rules.length; i++) {
    matchCounts.set(i, 0);
  }

  for (const finding of findings) {
    let wasSuppressed = false;

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as SuppressionRule;
      if (ruleMatchesFinding(rule, finding)) {
        suppressed.push({ finding, rule, ruleIndex: i });
        matchCounts.set(i, (matchCounts.get(i) ?? 0) + 1);
        wasSuppressed = true;
        // Diagnostics go to stderr to avoid corrupting JSON/SARIF stdout output
        console.error(
          `[router] [user-suppression] Suppressed: ${finding.file}:${finding.line ?? '?'} — rule: "${rule.reason}"`
        );
        break; // First matching rule wins
      }
    }

    if (!wasSuppressed) {
      filtered.push(finding);
    }
  }

  return { filtered, suppressed, matchCounts };
}

// =============================================================================
// Breadth Enforcement
// =============================================================================

const DEFAULT_BREADTH_LIMIT = 20;
const OVERRIDE_BREADTH_LIMIT = 200;

/**
 * Check breadth limits on suppression match counts.
 * Returns violations that should cause failures (CI) or warnings (local).
 */
export function checkBreadthLimits(
  rules: SuppressionRule[],
  matchCounts: Map<number, number>
): BreadthViolation[] {
  const violations: BreadthViolation[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as SuppressionRule;
    const count = matchCounts.get(i) ?? 0;
    if (count === 0) continue;

    const hasOverride = rule.breadth_override === true;
    const limit = hasOverride ? OVERRIDE_BREADTH_LIMIT : DEFAULT_BREADTH_LIMIT;

    if (count > limit) {
      violations.push({
        ruleIndex: i,
        reason: rule.reason,
        matchCount: count,
        limit,
        hasOverride,
      });
    }
  }

  return violations;
}

/**
 * Check if a breadth-override rule is authorized to suppress error-severity findings.
 * Returns violations for unauthorized error-severity suppressions.
 */
export function checkErrorSeverityOverrides(
  rules: SuppressionRule[],
  suppressedResults: SuppressionMatchResult[],
  securityOverrideAllowlist: string[]
): BreadthViolation[] {
  const violations: BreadthViolation[] = [];

  // Group suppressed findings by rule index
  const suppressedByRule = new Map<number, SuppressionMatchResult[]>();
  for (const result of suppressedResults) {
    const existing = suppressedByRule.get(result.ruleIndex) ?? [];
    existing.push(result);
    suppressedByRule.set(result.ruleIndex, existing);
  }

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as SuppressionRule;
    if (!rule.breadth_override) continue;

    const ruleSuppressions = suppressedByRule.get(i) ?? [];
    const hasErrorSeverity = ruleSuppressions.some((s) => s.finding.severity === 'error');

    if (hasErrorSeverity && !securityOverrideAllowlist.includes(rule.reason)) {
      violations.push({
        ruleIndex: i,
        reason: rule.reason,
        matchCount: ruleSuppressions.length,
        limit: DEFAULT_BREADTH_LIMIT,
        hasOverride: true,
      });
    }
  }

  return violations;
}

/**
 * Enforce breadth limits based on mode.
 * In CI mode: throws Error for violations.
 * In local mode: logs warnings only.
 */
export function enforceBreadthLimits(
  rules: SuppressionRule[],
  result: UserSuppressionResult,
  mode: SuppressionMode,
  securityOverrideAllowlist: string[]
): void {
  const breadthViolations = checkBreadthLimits(rules, result.matchCounts);
  const errorSeverityViolations = checkErrorSeverityOverrides(
    rules,
    result.suppressed,
    securityOverrideAllowlist
  );

  const allViolations = [...breadthViolations, ...errorSeverityViolations];

  if (allViolations.length === 0) {
    // Log overrides that are within limits
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i] as SuppressionRule;
      const count = result.matchCounts.get(i) ?? 0;
      if (rule.breadth_override && count > DEFAULT_BREADTH_LIMIT) {
        console.error(
          `[router] [user-suppression] Broad suppression override: '${rule.reason}' approved by ${rule.approved_by ?? 'unknown'} — matched ${count} findings`
        );
      }
    }
    return;
  }

  if (mode === 'local') {
    for (const v of allViolations) {
      console.warn(
        `[router] [user-suppression] Warning: Suppression rule '${v.reason}' matched ${v.matchCount} findings (limit: ${v.limit})`
      );
    }
    return;
  }

  // CI mode: fail on violations — error-severity violations take precedence
  // FR-022: Breadth violations produce exit code 2 (config_error) via ConfigError
  if (errorSeverityViolations.length > 0) {
    const v = errorSeverityViolations[0] as BreadthViolation;
    throw new ConfigError(
      `Breadth override on rule '${v.reason}' cannot suppress error-severity findings — add to security_override_allowlist to authorize`,
      ConfigErrorCode.INVALID_VALUE,
      { field: 'suppressions.rules' }
    );
  }

  const firstViolation = allViolations[0] as BreadthViolation;
  if (firstViolation.hasOverride) {
    throw new ConfigError(
      `Suppression rule '${firstViolation.reason}' matched ${firstViolation.matchCount} findings (limit: ${firstViolation.limit}). Override limit exceeded.`,
      ConfigErrorCode.INVALID_VALUE,
      { field: 'suppressions.rules' }
    );
  }

  throw new ConfigError(
    `Suppression rule '${firstViolation.reason}' matched ${firstViolation.matchCount} findings (limit: ${firstViolation.limit}). Add \`breadth_override: true\` to this rule to allow broad suppression.`,
    ConfigErrorCode.INVALID_VALUE,
    { field: 'suppressions.rules' }
  );
}

/**
 * Build suppression match count summary for JSON output.
 */
export function buildSuppressionSummary(
  rules: SuppressionRule[],
  matchCounts: Map<number, number>
): { reason: string; matched: number }[] {
  const summary: { reason: string; matched: number }[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i] as SuppressionRule;
    const count = matchCounts.get(i) ?? 0;
    if (count > 0) {
      summary.push({ reason: rule.reason, matched: count });
    }
  }
  return summary;
}

// =============================================================================
// Base-Branch Suppression Loading (CI Security)
// =============================================================================

/**
 * Load suppressions from the base branch config via `git show`.
 *
 * Security (FR-022): In CI mode, suppression rules MUST be loaded from the
 * BASE branch configuration only, never from the PR branch. This prevents
 * attackers from smuggling suppressions into fork PRs to hide vulnerabilities.
 *
 * @param repoPath - Path to the git repository
 * @param baseRef - Base branch ref (e.g., 'origin/main', a SHA)
 * @returns Parsed suppressions, or empty defaults if base has no config/suppressions
 */
export function loadBaseBranchSuppressions(repoPath: string, baseRef: string): Suppressions {
  const emptySuppressions: Suppressions = {
    rules: [],
    disable_matchers: [],
    security_override_allowlist: [],
  };

  // Defense-in-depth: validate baseRef before passing to git
  const refResult = SafeGitRefHelpers.parse(baseRef);
  if (!isOk(refResult)) {
    console.warn(
      `[router] [user-suppression] Invalid base ref, skipping suppression loading: ${baseRef}`
    );
    return emptySuppressions;
  }

  try {
    const configContent = execFileSync('git', ['show', `${refResult.value}:.ai-review.yml`], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });

    const parsed = parseYaml(configContent) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || !('suppressions' in parsed)) {
      console.error('[router] [user-suppression] Base branch config has no suppressions section');
      return emptySuppressions;
    }

    const result = SuppressionsSchema.safeParse(parsed['suppressions']);
    if (!result.success) {
      console.warn(
        `[router] [user-suppression] Base branch suppressions invalid, ignoring: ${result.error.message}`
      );
      return emptySuppressions;
    }

    console.error(
      `[router] [user-suppression] Loaded ${result.data.rules.length} suppression rule(s) from base branch (${baseRef})`
    );
    return result.data;
  } catch (error) {
    // git show fails when config doesn't exist on base branch — expected
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('does not exist') || message.includes('fatal:')) {
      console.error(
        '[router] [user-suppression] No .ai-review.yml on base branch — no suppressions active'
      );
    } else {
      console.warn(`[router] [user-suppression] Failed to load base branch config: ${message}`);
    }
    return emptySuppressions;
  }
}
