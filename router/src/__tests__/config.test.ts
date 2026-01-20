/**
 * Config Module Tests
 */

import { describe, it, expect } from 'vitest';
import { ConfigSchema, getEnabledAgents, type Config } from '../config.js';

describe('ConfigSchema', () => {
  it('should parse valid config with all fields', () => {
    const input = {
      version: 1,
      trusted_only: true,
      triggers: {
        on: ['pull_request'],
        branches: ['main', 'develop'],
      },
      passes: [
        { name: 'static', agents: ['semgrep'], enabled: true },
        { name: 'semantic', agents: ['opencode', 'pr_agent'], enabled: true },
      ],
      limits: {
        max_files: 100,
        max_diff_lines: 5000,
        max_tokens_per_pr: 20000,
        max_usd_per_pr: 2.0,
        monthly_budget_usd: 200,
      },
      reporting: {
        github: {
          mode: 'checks_and_comments',
          max_inline_comments: 30,
          summary: true,
        },
      },
      gating: {
        enabled: true,
        fail_on_severity: 'warning',
      },
    };

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.limits.max_files).toBe(100);
      expect(result.data.gating.enabled).toBe(true);
    }
  });

  it('should apply default values when fields are missing', () => {
    const input = {};

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe(1);
      expect(result.data.trusted_only).toBe(true);
      expect(result.data.limits.max_files).toBe(50);
      expect(result.data.limits.max_diff_lines).toBe(2000);
      expect(result.data.limits.max_tokens_per_pr).toBe(12000);
      expect(result.data.gating.enabled).toBe(false);
      // Enterprise-safe default: only static analysis (semgrep) runs without explicit config
      // AI agents require opt-in via .ai-review.yml
      expect(result.data.passes).toHaveLength(1);
      const defaultPass = result.data.passes[0];
      expect(defaultPass).toBeDefined();
      if (defaultPass) {
        expect(defaultPass.name).toBe('static');
        expect(defaultPass.agents).toEqual(['semgrep']);
      }
    }
  });

  it('should fail validation for invalid agent names', () => {
    const input = {
      passes: [{ name: 'test', agents: ['invalid_agent'], enabled: true }],
    };

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should fail validation for invalid gating severity', () => {
    const input = {
      gating: {
        enabled: true,
        fail_on_severity: 'critical', // Invalid, should be error/warning/info
      },
    };

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it('should accept partial limits', () => {
    const input = {
      limits: {
        max_files: 25,
      },
    };

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limits.max_files).toBe(25);
      expect(result.data.limits.max_diff_lines).toBe(2000); // Default
    }
  });
});

describe('getEnabledAgents', () => {
  const config: Config = {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [
      { name: 'static', agents: ['semgrep'], enabled: true },
      { name: 'semantic', agents: ['opencode', 'pr_agent'], enabled: true },
      { name: 'disabled', agents: ['local_llm'], enabled: false },
    ],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
    },
    reporting: {},
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  it('should return agents for enabled pass', () => {
    expect(getEnabledAgents(config, 'static')).toEqual(['semgrep']);
    expect(getEnabledAgents(config, 'semantic')).toEqual(['opencode', 'pr_agent']);
  });

  it('should return empty array for disabled pass', () => {
    expect(getEnabledAgents(config, 'disabled')).toEqual([]);
  });

  it('should return empty array for non-existent pass', () => {
    expect(getEnabledAgents(config, 'nonexistent')).toEqual([]);
  });
});
