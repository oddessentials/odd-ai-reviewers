import { describe, expect, it, vi } from 'vitest';
import type { Finding } from '../../../src/agents/types.js';
import type { SuppressionRule } from '../../../src/config/schemas.js';
import {
  filterUserSuppressions,
  checkBreadthLimits,
  checkErrorSeverityOverrides,
  enforceBreadthLimits,
  buildSuppressionSummary,
  loadBaseBranchSuppressions,
} from '../../../src/report/user-suppressions.js';

// =============================================================================
// Helpers
// =============================================================================

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'warning',
    file: 'src/app.ts',
    line: 10,
    message: 'Missing error handling in async function',
    sourceAgent: 'opencode',
    ruleId: 'semantic/error-handling',
    ...overrides,
  };
}

function makeRule(overrides: Partial<SuppressionRule> = {}): SuppressionRule {
  return {
    reason: 'Test suppression rule',
    ...overrides,
  } as SuppressionRule;
}

// =============================================================================
// filterUserSuppressions
// =============================================================================

describe('filterUserSuppressions', () => {
  it('returns all findings when no rules are provided', () => {
    const findings = [makeFinding(), makeFinding({ file: 'src/other.ts' })];
    const result = filterUserSuppressions(findings, []);

    expect(result.filtered).toHaveLength(2);
    expect(result.suppressed).toHaveLength(0);
  });

  it('suppresses findings by rule ID glob', () => {
    const findings = [
      makeFinding({ ruleId: 'semantic/error-handling' }),
      makeFinding({ ruleId: 'security/xss' }),
    ];
    const rules = [makeRule({ rule: 'semantic/*', reason: 'Suppress semantic rules' })];

    const result = filterUserSuppressions(findings, rules);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.ruleId).toBe('security/xss');
    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0]?.rule.reason).toBe('Suppress semantic rules');
  });

  it('suppresses findings by message regex', () => {
    const findings = [
      makeFinding({ message: 'Missing error handling in async function' }),
      makeFinding({ message: 'Potential SQL injection' }),
    ];
    const rules = [makeRule({ message: '^Missing error handling', reason: 'Known pattern' })];

    const result = filterUserSuppressions(findings, rules);

    expect(result.filtered).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
  });

  it('suppresses findings by file glob', () => {
    const findings = [
      makeFinding({ file: 'tests/app.test.ts' }),
      makeFinding({ file: 'src/app.ts' }),
    ];
    const rules = [makeRule({ file: 'tests/**', reason: 'Tests are exempt' })];

    const result = filterUserSuppressions(findings, rules);

    expect(result.filtered).toHaveLength(1);
    expect(result.filtered[0]?.file).toBe('src/app.ts');
    expect(result.suppressed).toHaveLength(1);
  });

  it('suppresses findings by severity', () => {
    const findings = [
      makeFinding({ severity: 'info', file: 'scripts/build.ts' }),
      makeFinding({ severity: 'warning' }),
    ];
    const rules = [
      makeRule({ severity: 'info', file: 'scripts/**', reason: 'Info in scripts is noise' }),
    ];

    const result = filterUserSuppressions(findings, rules);

    expect(result.filtered).toHaveLength(1);
    expect(result.suppressed).toHaveLength(1);
  });

  it('uses AND logic for multi-criteria rules', () => {
    const findings = [
      makeFinding({ file: 'tests/app.test.ts', severity: 'warning' }),
      makeFinding({ file: 'tests/app.test.ts', severity: 'error' }),
      makeFinding({ file: 'src/app.ts', severity: 'warning' }),
    ];
    const rules = [
      makeRule({
        file: 'tests/**',
        severity: 'warning',
        reason: 'Only suppress warnings in tests',
      }),
    ];

    const result = filterUserSuppressions(findings, rules);

    // Only the first finding matches both criteria
    expect(result.filtered).toHaveLength(2);
    expect(result.suppressed).toHaveLength(1);
  });

  it('first matching rule wins', () => {
    const findings = [makeFinding({ ruleId: 'semantic/error-handling' })];
    const rules = [
      makeRule({ rule: 'semantic/*', reason: 'First rule' }),
      makeRule({ rule: 'semantic/error-handling', reason: 'Second rule' }),
    ];

    const result = filterUserSuppressions(findings, rules);

    expect(result.suppressed).toHaveLength(1);
    expect(result.suppressed[0]?.rule.reason).toBe('First rule');
  });

  it('tracks match counts per rule', () => {
    const findings = [
      makeFinding({ ruleId: 'semantic/a' }),
      makeFinding({ ruleId: 'semantic/b' }),
      makeFinding({ ruleId: 'security/c' }),
    ];
    const rules = [
      makeRule({ rule: 'semantic/*', reason: 'Semantic rule' }),
      makeRule({ rule: 'security/*', reason: 'Security rule' }),
    ];

    const result = filterUserSuppressions(findings, rules);

    expect(result.matchCounts.get(0)).toBe(2);
    expect(result.matchCounts.get(1)).toBe(1);
  });

  it('handles findings without ruleId', () => {
    const findings = [makeFinding({ ruleId: undefined })];
    const rules = [makeRule({ rule: 'semantic/*', reason: 'Should not match' })];

    const result = filterUserSuppressions(findings, rules);

    expect(result.filtered).toHaveLength(1);
    expect(result.suppressed).toHaveLength(0);
  });

  it('handles invalid message regex gracefully', () => {
    const findings = [makeFinding()];
    const rules = [makeRule({ message: '[invalid(regex', reason: 'Bad regex' })];

    const result = filterUserSuppressions(findings, rules);

    expect(result.filtered).toHaveLength(1);
    expect(result.suppressed).toHaveLength(0);
  });
});

// =============================================================================
// Breadth Limits
// =============================================================================

describe('checkBreadthLimits', () => {
  it('returns no violations when counts are within default limit', () => {
    const rules = [makeRule({ reason: 'Rule A' })];
    const counts = new Map([[0, 15]]);

    const violations = checkBreadthLimits(rules, counts);

    expect(violations).toHaveLength(0);
  });

  it('returns violation when count exceeds default limit (20)', () => {
    const rules = [makeRule({ reason: 'Rule A' })];
    const counts = new Map([[0, 25]]);

    const violations = checkBreadthLimits(rules, counts);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe('Rule A');
    expect(violations[0]?.limit).toBe(20);
    expect(violations[0]?.hasOverride).toBe(false);
  });

  it('uses 200 limit for rules with breadth_override', () => {
    const rules = [
      makeRule({
        reason: 'Broad rule',
        breadth_override: true,
        breadth_override_reason: 'Needed',
        approved_by: 'admin',
      }),
    ];
    const counts = new Map([[0, 150]]);

    const violations = checkBreadthLimits(rules, counts);

    expect(violations).toHaveLength(0);
  });

  it('violations when override count exceeds 200', () => {
    const rules = [
      makeRule({
        reason: 'Very broad rule',
        breadth_override: true,
        breadth_override_reason: 'Needed',
        approved_by: 'admin',
      }),
    ];
    const counts = new Map([[0, 250]]);

    const violations = checkBreadthLimits(rules, counts);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.limit).toBe(200);
    expect(violations[0]?.hasOverride).toBe(true);
  });
});

describe('checkErrorSeverityOverrides', () => {
  it('returns no violations when no error-severity findings are suppressed', () => {
    const rules = [
      makeRule({
        reason: 'Broad rule',
        breadth_override: true,
        breadth_override_reason: 'Needed',
        approved_by: 'admin',
      }),
    ];
    const suppressed = [
      {
        finding: makeFinding({ severity: 'warning' }),
        rule: rules[0] as SuppressionRule,
        ruleIndex: 0,
      },
    ];

    const violations = checkErrorSeverityOverrides(rules, suppressed, []);

    expect(violations).toHaveLength(0);
  });

  it('returns violation when error-severity is suppressed without allowlist', () => {
    const rules = [
      makeRule({
        reason: 'Broad rule',
        breadth_override: true,
        breadth_override_reason: 'Needed',
        approved_by: 'admin',
      }),
    ];
    const suppressed = [
      {
        finding: makeFinding({ severity: 'error' }),
        rule: rules[0] as SuppressionRule,
        ruleIndex: 0,
      },
    ];

    const violations = checkErrorSeverityOverrides(rules, suppressed, []);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.reason).toBe('Broad rule');
  });

  it('allows error-severity suppression when reason is in allowlist', () => {
    const rules = [
      makeRule({
        reason: 'legacy auth module - tracked in JIRA-1234',
        breadth_override: true,
        breadth_override_reason: 'Needed',
        approved_by: 'admin',
      }),
    ];
    const suppressed = [
      {
        finding: makeFinding({ severity: 'error' }),
        rule: rules[0] as SuppressionRule,
        ruleIndex: 0,
      },
    ];

    const violations = checkErrorSeverityOverrides(rules, suppressed, [
      'legacy auth module - tracked in JIRA-1234',
    ]);

    expect(violations).toHaveLength(0);
  });
});

// =============================================================================
// enforceBreadthLimits
// =============================================================================

describe('enforceBreadthLimits', () => {
  it('throws in CI mode when breadth limit exceeded', () => {
    const rules = [makeRule({ reason: 'Overly broad' })];
    const result = {
      filtered: [],
      suppressed: Array.from({ length: 25 }, () => ({
        finding: makeFinding(),
        rule: rules[0] as SuppressionRule,
        ruleIndex: 0,
      })),
      matchCounts: new Map([[0, 25]]),
    };

    expect(() => enforceBreadthLimits(rules, result, 'ci', [])).toThrow(/breadth_override: true/);
  });

  it('only warns in local mode when breadth limit exceeded', () => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rules = [makeRule({ reason: 'Overly broad' })];
    const result = {
      filtered: [],
      suppressed: Array.from({ length: 25 }, () => ({
        finding: makeFinding(),
        rule: rules[0] as SuppressionRule,
        ruleIndex: 0,
      })),
      matchCounts: new Map([[0, 25]]),
    };

    expect(() => enforceBreadthLimits(rules, result, 'local', [])).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('matched 25 findings'));
    warnSpy.mockRestore();
  });

  it('throws for error-severity override without allowlist in CI', () => {
    const rules = [
      makeRule({
        reason: 'Unauthorized error suppression',
        breadth_override: true,
        breadth_override_reason: 'Needed',
        approved_by: 'admin',
      }),
    ];
    const result = {
      filtered: [],
      suppressed: [
        {
          finding: makeFinding({ severity: 'error' }),
          rule: rules[0] as SuppressionRule,
          ruleIndex: 0,
        },
      ],
      matchCounts: new Map([[0, 1]]),
    };

    expect(() => enforceBreadthLimits(rules, result, 'ci', [])).toThrow(
      /security_override_allowlist/
    );
  });
});

// =============================================================================
// buildSuppressionSummary
// =============================================================================

describe('buildSuppressionSummary', () => {
  it('returns summary with counts > 0', () => {
    const rules = [
      makeRule({ reason: 'Rule A' }),
      makeRule({ reason: 'Rule B' }),
      makeRule({ reason: 'Rule C' }),
    ];
    const counts = new Map([
      [0, 5],
      [1, 0],
      [2, 3],
    ]);

    const summary = buildSuppressionSummary(rules, counts);

    expect(summary).toEqual([
      { reason: 'Rule A', matched: 5 },
      { reason: 'Rule C', matched: 3 },
    ]);
  });

  it('returns empty array when no matches', () => {
    const rules = [makeRule({ reason: 'Rule A' })];
    const counts = new Map([[0, 0]]);

    const summary = buildSuppressionSummary(rules, counts);

    expect(summary).toEqual([]);
  });
});

// =============================================================================
// loadBaseBranchSuppressions
// =============================================================================

describe('loadBaseBranchSuppressions', () => {
  it('returns empty suppressions when git show fails (no config on base)', () => {
    // This test uses a nonexistent ref, so git show will fail
    const result = loadBaseBranchSuppressions('.', 'nonexistent-ref-abc123');

    expect(result.rules).toEqual([]);
    expect(result.disable_matchers).toEqual([]);
    expect(result.security_override_allowlist).toEqual([]);
  });

  it('returns empty suppressions when base config has no suppressions section', () => {
    // Use HEAD which has a config but may not have suppressions
    const result = loadBaseBranchSuppressions('.', 'HEAD');

    // The current repo config may or may not have suppressions
    // But the function should not throw
    expect(result).toBeDefined();
    expect(Array.isArray(result.rules)).toBe(true);
    expect(Array.isArray(result.disable_matchers)).toBe(true);
  });
});
