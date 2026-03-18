import { describe, expect, it } from 'vitest';
import {
  SuppressionsSchema,
  SuppressionRuleSchema,
  ConfigSchema,
} from '../../../src/config/schemas.js';

describe('SuppressionRuleSchema', () => {
  it('accepts valid rule with rule glob', () => {
    const result = SuppressionRuleSchema.safeParse({
      rule: 'semantic/*',
      reason: 'Suppress semantic rules',
    });
    expect(result.success).toBe(true);
  });

  it('accepts fully anchored message pattern', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: '^Missing error handling$',
      reason: 'Known pattern',
    });
    expect(result.success).toBe(true);
  });

  it('accepts explicit substring message pattern', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: '^.*missing error handling.*$',
      reason: 'Explicit substring opt-in',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid rule with file glob', () => {
    const result = SuppressionRuleSchema.safeParse({
      file: 'tests/**',
      reason: 'Tests are exempt',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid rule with all criteria', () => {
    const result = SuppressionRuleSchema.safeParse({
      rule: 'semantic/*',
      message: '^Missing.*$',
      file: 'tests/**',
      severity: 'info',
      reason: 'Full criteria rule',
    });
    expect(result.success).toBe(true);
  });

  it('rejects rule without any of rule/message/file', () => {
    const result = SuppressionRuleSchema.safeParse({
      severity: 'info',
      reason: 'Severity only — too broad',
    });
    expect(result.success).toBe(false);
  });

  it('rejects rule without reason', () => {
    const result = SuppressionRuleSchema.safeParse({
      rule: 'semantic/*',
    });
    expect(result.success).toBe(false);
  });

  // === Mandatory regression tests: unanchored message patterns rejected (FR-022) ===

  it('rejects unanchored message pattern — no anchors at all', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: 'error handling',
      reason: 'Should fail — bare substring',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      expect(firstIssue).toBeDefined();
      expect(firstIssue?.message).toContain('fully anchored');
    }
  });

  it('rejects start-only anchored message pattern — missing $', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: '^error handling',
      reason: 'Should fail — no end anchor',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      expect(firstIssue).toBeDefined();
      expect(firstIssue?.message).toContain('fully anchored');
    }
  });

  it('rejects end-only anchored message pattern — missing ^', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: 'error handling$',
      reason: 'Should fail — no start anchor',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      expect(firstIssue).toBeDefined();
      expect(firstIssue?.message).toContain('fully anchored');
    }
  });

  it('rejects bare .* message pattern', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: '.*',
      reason: 'Should fail — no anchors',
    });
    expect(result.success).toBe(false);
  });

  it('accepts ^.*$ as explicit breadth acknowledgement', () => {
    // ^.*$ is intentionally allowed — runtime breadth limits catch overly broad matches
    const result = SuppressionRuleSchema.safeParse({
      message: '^.*$',
      reason: 'Explicit breadth opt-in',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty message pattern', () => {
    const result = SuppressionRuleSchema.safeParse({
      message: '',
      reason: 'Should fail',
    });
    expect(result.success).toBe(false);
  });

  it('rejects breadth_override without reason and approved_by', () => {
    const result = SuppressionRuleSchema.safeParse({
      rule: 'semantic/*',
      reason: 'Broad rule',
      breadth_override: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects breadth_override with reason but no approved_by', () => {
    const result = SuppressionRuleSchema.safeParse({
      rule: 'semantic/*',
      reason: 'Broad rule',
      breadth_override: true,
      breadth_override_reason: 'Needed for migration',
    });
    expect(result.success).toBe(false);
  });

  it('accepts breadth_override with all required fields', () => {
    const result = SuppressionRuleSchema.safeParse({
      rule: 'semantic/*',
      reason: 'Broad rule',
      breadth_override: true,
      breadth_override_reason: 'Needed for migration',
      approved_by: 'team-lead',
    });
    expect(result.success).toBe(true);
  });
});

describe('SuppressionsSchema', () => {
  it('accepts empty suppressions', () => {
    const result = SuppressionsSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rules).toEqual([]);
      expect(result.data.disable_matchers).toEqual([]);
      expect(result.data.security_override_allowlist).toEqual([]);
    }
  });

  it('accepts valid rules and disable_matchers', () => {
    const result = SuppressionsSchema.safeParse({
      rules: [{ rule: 'semantic/*', reason: 'Suppress semantic rules' }],
      disable_matchers: ['ts-unused-prefix'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid matcher ID in disable_matchers', () => {
    const result = SuppressionsSchema.safeParse({
      disable_matchers: ['invalid-matcher-id'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts all valid matcher IDs', () => {
    const validIds = [
      'express-error-mw',
      'ts-unused-prefix',
      'exhaustive-switch',
      'react-query-dedup',
      'promise-allsettled-order',
      'safe-local-file-read',
      'exhaustive-type-narrowed-switch',
      'error-object-xss',
      'thin-wrapper-stdlib',
    ];
    const result = SuppressionsSchema.safeParse({
      disable_matchers: validIds,
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 50 rules', () => {
    const rules = Array.from({ length: 51 }, (_, i) => ({
      rule: `rule-${i}`,
      reason: `Rule ${i}`,
    }));
    const result = SuppressionsSchema.safeParse({ rules });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 50 rules', () => {
    const rules = Array.from({ length: 50 }, (_, i) => ({
      rule: `rule-${i}`,
      reason: `Rule ${i}`,
    }));
    const result = SuppressionsSchema.safeParse({ rules });
    expect(result.success).toBe(true);
  });

  it('accepts security_override_allowlist', () => {
    const result = SuppressionsSchema.safeParse({
      security_override_allowlist: ['legacy auth module - tracked in JIRA-1234'],
    });
    expect(result.success).toBe(true);
  });
});

describe('ConfigSchema with suppressions', () => {
  it('accepts config without suppressions', () => {
    const result = ConfigSchema.safeParse({
      passes: [{ name: 'static', agents: ['semgrep'] }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts config with valid suppressions', () => {
    const result = ConfigSchema.safeParse({
      passes: [{ name: 'static', agents: ['semgrep'] }],
      suppressions: {
        rules: [{ rule: 'semantic/documentation', reason: 'We use JSDoc, not TSDoc' }],
        disable_matchers: ['ts-unused-prefix'],
      },
    });
    expect(result.success).toBe(true);
  });
});
