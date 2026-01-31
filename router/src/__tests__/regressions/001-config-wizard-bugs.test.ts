/**
 * Regression Tests for Feature 001: Fix Config Wizard Validation Bugs
 *
 * SC-005: All four reported bugs are verified fixed through regression tests.
 *
 * This file provides explicit regression tests for the 4 bugs fixed:
 * - Bug 1 (P1): Auto-applied model not propagated to execution
 * - Bug 2 (P2): Ollama provider incorrectly requires OLLAMA_BASE_URL
 * - Bug 3 (P2): Config init validation crashes with undefined AgentContext
 * - Bug 4 (P3): "Both" platform option drops ADO reporting configuration
 *
 * These tests are designed to prevent regressions from unrelated changes.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPreflightChecks } from '../../phases/preflight.js';
import {
  generateDefaultConfig,
  generateConfigYaml,
  AVAILABLE_PLATFORMS,
} from '../../cli/config-wizard.js';
import { validateExplicitProviderKeys } from '../../preflight.js';
import type { Config } from '../../config.js';
import type { AgentContext } from '../../agents/types.js';
import { parse as parseYaml } from 'yaml';

/**
 * Create a minimal test config for regression tests.
 */
function createTestConfig(overrides?: Partial<Config>): Config {
  return {
    version: 1,
    trusted_only: false,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [
      {
        name: 'test',
        agents: ['opencode'] as Config['passes'][0]['agents'],
        enabled: true,
        required: true,
      },
    ],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
    },
    models: {},
    reporting: {
      github: {
        mode: 'checks_and_comments',
        max_inline_comments: 20,
        summary: true,
      },
    },
    gating: {
      enabled: false,
      fail_on_severity: 'error',
    },
    path_filters: {
      include: ['**/*'],
      exclude: [],
    },
    ...overrides,
  };
}

/**
 * Create a minimal AgentContext for testing.
 */
function createMinimalContext(config: Config): AgentContext {
  return {
    repoPath: '/tmp/test-repo',
    diff: {
      files: [],
      totalAdditions: 0,
      totalDeletions: 0,
      baseSha: 'abc123',
      headSha: 'def456',
      contextLines: 3,
      source: 'local-git',
    },
    files: [],
    config,
    diffContent: '',
    prNumber: undefined,
    env: {},
    effectiveModel: '',
    provider: null,
  };
}

describe('Regression: Bug 1 (P1) - Auto-applied model propagates to execution', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('REGRESSION: Single OPENAI_API_KEY setup resolves model in preflight result', () => {
    // Bug: User with only OPENAI_API_KEY set had preflight pass but runtime fail
    // because auto-applied model wasn't propagated to AgentContext
    const config = createTestConfig();
    const env = { OPENAI_API_KEY: 'sk-test-key' };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Fixed: Preflight now returns resolved model
    expect(result.resolved).toBeDefined();
    expect(result.resolved?.model).toBe('gpt-4o');
    expect(result.resolved?.provider).toBe('openai');
  });

  it('REGRESSION: Single ANTHROPIC_API_KEY setup resolves model in preflight result', () => {
    const config = createTestConfig();
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test' };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    expect(result.resolved?.model).toBe('claude-sonnet-4-20250514');
    expect(result.resolved?.provider).toBe('anthropic');
  });

  it('REGRESSION: ResolvedConfig.model is not empty after preflight', () => {
    // The bug caused agentContext.effectiveModel to remain empty
    const config = createTestConfig();
    const env = { OPENAI_API_KEY: 'sk-test-key' };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Model must never be empty after successful preflight
    expect(result.resolved?.model).not.toBe('');
    expect(result.resolved?.model.length).toBeGreaterThan(0);
  });

  it('REGRESSION: Explicit MODEL env var takes precedence', () => {
    // Edge case: When both MODEL and API key are set, MODEL should win
    const config = createTestConfig();
    const env = {
      OPENAI_API_KEY: 'sk-test-key',
      MODEL: 'gpt-4o-mini',
    };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Explicit MODEL takes precedence over auto-apply
    expect(result.resolved?.model).toBe('gpt-4o-mini');
  });
});

describe('Regression: Bug 2 (P2) - Ollama URL is optional', () => {
  it('REGRESSION: provider: ollama validates without OLLAMA_BASE_URL', () => {
    // Bug: Ollama provider incorrectly required OLLAMA_BASE_URL
    const config = createTestConfig({ provider: 'ollama' });
    const env = {}; // No OLLAMA_BASE_URL set

    const result = validateExplicitProviderKeys(config, env);

    // Fixed: Ollama doesn't require OLLAMA_BASE_URL
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('REGRESSION: Invalid OLLAMA_BASE_URL format fails with clear error', () => {
    const config = createTestConfig({ provider: 'ollama' });
    const env = { OLLAMA_BASE_URL: 'not-a-url' };

    const result = validateExplicitProviderKeys(config, env);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Invalid OLLAMA_BASE_URL'))).toBe(true);
  });

  it('REGRESSION: Valid but unreachable OLLAMA_BASE_URL passes preflight', () => {
    // Connectivity is runtime concern, not preflight
    const config = createTestConfig({ provider: 'ollama' });
    const env = { OLLAMA_BASE_URL: 'http://unreachable-host:11434' };

    const result = validateExplicitProviderKeys(config, env);

    expect(result.valid).toBe(true);
  });

  it('REGRESSION: config init --defaults --provider ollama generates valid config', () => {
    // US2 Scenario 5: Generated Ollama config should validate
    const config = generateDefaultConfig('ollama', 'github', ['semgrep', 'local_llm']);

    expect(config.provider).toBe('ollama');

    // Validate the generated config (no API keys needed for Ollama)
    const result = validateExplicitProviderKeys(config, {});
    expect(result.valid).toBe(true);
  });
});

describe('Regression: Bug 3 (P2) - Config init validation completes', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('REGRESSION: Config init validation does not throw', () => {
    // Bug: Config init passed undefined as AgentContext, causing crash
    const config = generateDefaultConfig('openai', 'github', ['semgrep', 'opencode']);

    // Build minimal context (same pattern as validate command)
    const minimalContext = createMinimalContext(config);

    // This must not throw
    expect(() => {
      runPreflightChecks(config, minimalContext, {}, '/tmp/test');
    }).not.toThrow();
  });

  it('REGRESSION: Config init with no API keys shows warnings, not crash', () => {
    const config = generateDefaultConfig('openai', 'github', ['semgrep', 'opencode']);
    const minimalContext = createMinimalContext(config);

    const result = runPreflightChecks(config, minimalContext, {}, '/tmp/test');

    // Should return result (not throw)
    expect(result).toBeDefined();
    expect(result.errors).toBeDefined();
    expect(result.warnings).toBeDefined();
  });

  it('REGRESSION: Config init with valid API key succeeds', () => {
    const config = generateDefaultConfig('openai', 'github', ['semgrep', 'opencode']);
    const minimalContext = createMinimalContext(config);
    const env = { OPENAI_API_KEY: 'sk-test-key' };

    const result = runPreflightChecks(config, minimalContext, env, '/tmp/test');

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });
});

describe('Regression: Bug 4 (P3) - Both platform generates dual reporting', () => {
  it('REGRESSION: "both" platform generates reporting.github AND reporting.ado', () => {
    // Bug: "Both" platform was converted to "github", dropping ADO config
    const config = generateDefaultConfig('openai', 'both', ['semgrep']);

    expect(config.reporting.github).toBeDefined();
    expect(config.reporting.ado).toBeDefined();
  });

  it('REGRESSION: Generated dual-platform config has correct defaults', () => {
    const config = generateDefaultConfig('openai', 'both', ['semgrep']);

    // GitHub: checks_and_comments (recommended)
    expect(config.reporting.github?.mode).toBe('checks_and_comments');

    // ADO: threads_and_status (matches schema default)
    expect(config.reporting.ado?.mode).toBe('threads_and_status');
  });

  it('REGRESSION: YAML output contains both reporting sections', () => {
    const yaml = generateConfigYaml({
      provider: 'openai',
      platform: 'both',
      agents: ['semgrep', 'opencode'],
      useDefaults: true,
    });

    const parsed = parseYaml(yaml);

    expect(parsed.reporting.github).toBeDefined();
    expect(parsed.reporting.ado).toBeDefined();
    expect(parsed.reporting.github.mode).toBe('checks_and_comments');
    expect(parsed.reporting.ado.mode).toBe('threads_and_status');
  });

  it('REGRESSION: Validation warns when no CI env detected for both platforms', () => {
    const config = generateDefaultConfig('openai', 'both', ['semgrep']);
    const minimalContext = createMinimalContext(config);
    const env = { OPENAI_API_KEY: 'sk-test-key' }; // No GITHUB_ACTIONS or TF_BUILD

    const result = runPreflightChecks(config, minimalContext, env, '/tmp/test');

    // Should warn about missing platform env
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('GITHUB_ACTIONS'))).toBe(true);
    expect(result.warnings.some((w) => w.includes('TF_BUILD'))).toBe(true);

    // But still valid (exit 0)
    expect(result.valid).toBe(true);
  });

  it('REGRESSION: "both" is available in platform options', () => {
    // Verify the wizard offers "both" as an option
    const bothOption = AVAILABLE_PLATFORMS.find((p) => p.id === 'both');
    expect(bothOption).toBeDefined();
    expect(bothOption?.name).toBe('Both');
  });
});

describe('Edge Cases: Additional Protection', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('MODEL + single API key: MODEL takes precedence over auto-apply', () => {
    const config = createTestConfig();
    const env = {
      OPENAI_API_KEY: 'sk-test-key',
      MODEL: 'gpt-4-turbo',
    };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Explicit MODEL wins over auto-applied default
    expect(result.resolved?.model).toBe('gpt-4-turbo');
  });

  it('Config with explicit provider + matching key succeeds', () => {
    const config = createTestConfig({ provider: 'anthropic' });
    const env = { ANTHROPIC_API_KEY: 'sk-ant-test' };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    expect(result.valid).toBe(true);
    expect(result.resolved?.provider).toBe('anthropic');
  });

  it('Empty MODEL env var (whitespace) is ignored', () => {
    const config = createTestConfig();
    const env = {
      OPENAI_API_KEY: 'sk-test-key',
      MODEL: '   ', // Whitespace only
    };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Should auto-apply default, not use empty MODEL
    expect(result.resolved?.model).toBe('gpt-4o');
  });

  it('OLLAMA_BASE_URL with wrong scheme fails validation', () => {
    const config = createTestConfig({ provider: 'ollama' });
    const env = { OLLAMA_BASE_URL: 'ftp://localhost:11434' }; // Wrong scheme

    const result = validateExplicitProviderKeys(config, env);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('http://'))).toBe(true);
  });

  it('generateDefaultConfig with each platform type works', () => {
    // Verify all three platform types generate valid configs
    const platforms = ['github', 'ado', 'both'] as const;

    for (const platform of platforms) {
      const config = generateDefaultConfig('openai', platform, ['semgrep']);
      expect(config.version).toBe(1);
      expect(config.provider).toBe('openai');

      if (platform === 'github') {
        expect(config.reporting.github).toBeDefined();
        expect(config.reporting.ado).toBeUndefined();
      } else if (platform === 'ado') {
        expect(config.reporting.ado).toBeDefined();
        expect(config.reporting.github).toBeUndefined();
      } else {
        expect(config.reporting.github).toBeDefined();
        expect(config.reporting.ado).toBeDefined();
      }
    }
  });
});
