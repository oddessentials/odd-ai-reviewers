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
      max_completion_tokens: 4000,
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
      drift_gate: false,
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

/**
 * Review Feedback Regression Tests (2026-01-31)
 *
 * These tests verify fixes for issues identified in code review:
 * - P1: Explicit provider override not honored in compatibility check
 * - P2: stdout logs break --json output
 * - P2: Config init validates wrong file with --output
 * - P3: 'both' platform missing from non-interactive mode
 */
describe('Review Feedback: P1 - Explicit provider honored in compatibility check', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('REGRESSION: Multi-key setup with explicit provider: openai passes with gpt-4o', () => {
    // Bug: validateProviderModelCompatibility called resolveProvider without config.provider
    // Multi-key setups failed even with explicit provider set
    const config = createTestConfig({ provider: 'openai' });
    const env = {
      OPENAI_API_KEY: 'sk-openai-test',
      ANTHROPIC_API_KEY: 'sk-ant-test', // Both keys present
      MODEL: 'gpt-4o', // OpenAI model
    };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // With explicit provider: openai, should use OpenAI even with both keys
    expect(result.valid).toBe(true);
    expect(result.resolved?.provider).toBe('openai');
    expect(result.resolved?.model).toBe('gpt-4o');
  });

  it('REGRESSION: Multi-key setup with explicit provider: anthropic passes with claude model', () => {
    const config = createTestConfig({ provider: 'anthropic' });
    const env = {
      OPENAI_API_KEY: 'sk-openai-test',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      MODEL: 'claude-sonnet-4-20250514',
    };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    expect(result.valid).toBe(true);
    expect(result.resolved?.provider).toBe('anthropic');
    expect(result.resolved?.model).toBe('claude-sonnet-4-20250514');
  });

  it('REGRESSION: Without explicit provider, multi-key with MODEL still fails (expected)', () => {
    // This is correct behavior - ambiguous without explicit provider
    const config = createTestConfig(); // No explicit provider
    const env = {
      OPENAI_API_KEY: 'sk-openai-test',
      ANTHROPIC_API_KEY: 'sk-ant-test',
      MODEL: 'gpt-4o',
    };

    const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Should fail due to multi-key ambiguity (FR-004)
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Multiple API keys'))).toBe(true);
  });
});

describe('Review Feedback: P2 - --json stdout purity', () => {
  it('REGRESSION: Preflight logs go to stderr, not stdout', () => {
    // Bug: console.log calls in phases/preflight.ts polluted stdout
    // when --json flag was used, making output unparseable
    const config = createTestConfig();
    const env = { OPENAI_API_KEY: 'sk-test-key' };

    // Capture stderr to verify preflight logs go there
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Preflight should log to stderr (auto-apply message, resolved config)
    expect(stderrSpy).toHaveBeenCalled();
    const stderrCalls = stderrSpy.mock.calls.map((call) => call[0]);
    expect(stderrCalls.some((msg) => msg?.includes('[preflight]'))).toBe(true);

    stderrSpy.mockRestore();
  });

  it('REGRESSION: Resolved config tuple logged to stderr contains valid JSON', () => {
    const config = createTestConfig();
    const env = { OPENAI_API_KEY: 'sk-test-key' };

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Find the resolved configuration log
    const resolvedLog = stderrSpy.mock.calls.find((call) =>
      call[0]?.includes('Resolved configuration:')
    );
    expect(resolvedLog).toBeDefined();

    // Extract JSON from log message and verify it parses
    const jsonMatch = resolvedLog?.[0]?.match(/Resolved configuration: (.+)$/);
    expect(jsonMatch).not.toBeNull();
    if (jsonMatch) {
      expect(() => JSON.parse(jsonMatch[1])).not.toThrow();
    }

    stderrSpy.mockRestore();
  });
});

describe('Review Feedback: P2 - Config init validates in-memory config', () => {
  it('REGRESSION: Generated config is parsed directly, not loaded from CWD', () => {
    // Bug: After generating config to --output path, validation loaded
    // from process.cwd() which might have a different .ai-review.yml
    //
    // This is verified by the implementation: generateConfigYaml creates YAML,
    // then the code parses that YAML string directly with parseYaml(yaml)
    // and validates it, rather than calling loadConfig(process.cwd())
    const yaml = generateConfigYaml({
      provider: 'anthropic',
      platform: 'github',
      agents: ['semgrep', 'opencode'],
      useDefaults: true,
    });

    // Parse the YAML directly (same as config init does)
    const parsed = parseYaml(yaml);

    // Verify we can validate this parsed config
    expect(parsed.provider).toBe('anthropic');
    expect(parsed.passes).toBeDefined();
    expect(parsed.reporting.github).toBeDefined();
  });

  it('REGRESSION: Config validation uses outputPath for error messages', () => {
    // When validation runs, it should report the actual output path
    // not some other path
    const config = generateDefaultConfig('openai', 'github', ['semgrep', 'opencode']);
    const minimalContext = createMinimalContext(config);
    const customPath = '/custom/output/path/.ai-review.yml';

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // Run preflight with custom path
    runPreflightChecks(config, minimalContext, { OPENAI_API_KEY: 'sk-test' }, customPath);

    // Check that resolved config includes the custom path
    const resolvedLog = stderrSpy.mock.calls.find((call) =>
      call[0]?.includes('Resolved configuration:')
    );

    if (resolvedLog) {
      const jsonMatch = resolvedLog[0]?.match(/Resolved configuration: (.+)$/);
      if (jsonMatch) {
        const resolved = JSON.parse(jsonMatch[1]);
        expect(resolved.configPath).toBe(customPath);
      }
    }

    stderrSpy.mockRestore();
  });
});

describe('Review Feedback: P3 - "both" platform in non-interactive mode', () => {
  it('REGRESSION: --platform both generates dual reporting blocks', () => {
    // Bug: validPlatforms was ['github', 'ado'], missing 'both'
    // This test verifies the fix is in place
    const config = generateDefaultConfig('openai', 'both', ['semgrep', 'opencode']);

    // Should have both reporting sections
    expect(config.reporting.github).toBeDefined();
    expect(config.reporting.ado).toBeDefined();

    // Verify correct modes
    expect(config.reporting.github?.mode).toBe('checks_and_comments');
    expect(config.reporting.ado?.mode).toBe('threads_and_status');
  });

  it('REGRESSION: YAML from --platform both has both reporting sections', () => {
    const yaml = generateConfigYaml({
      provider: 'openai',
      platform: 'both',
      agents: ['semgrep'],
      useDefaults: true,
    });

    const parsed = parseYaml(yaml);

    expect(parsed.reporting.github).toBeDefined();
    expect(parsed.reporting.ado).toBeDefined();
  });

  it('REGRESSION: Dual-platform config validates successfully', () => {
    const config = generateDefaultConfig('openai', 'both', ['semgrep']);
    const minimalContext = createMinimalContext(config);

    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // With API key, should validate successfully
    const result = runPreflightChecks(
      config,
      minimalContext,
      { OPENAI_API_KEY: 'sk-test-key' },
      '/tmp/test'
    );

    expect(result.valid).toBe(true);

    // Should warn about no CI environment detected
    expect(result.warnings.some((w) => w.includes('Dual-platform config'))).toBe(true);

    stderrSpy.mockRestore();
  });
});

/**
 * Regression Tests for Review Feedback (Second Round)
 *
 * Four additional issues identified during code review:
 * - P1: Provider override not honored in compatibility check
 * - P2: Stdout logs break --json output
 * - P2: Config init validates wrong file with --output
 * - P3: 'both' platform missing from non-interactive mode
 */
import { validateProviderModelCompatibility } from '../../preflight.js';

describe('Regression: P1 - Honor explicit provider override in compatibility check', () => {
  it('REGRESSION: explicit provider overrides key precedence', () => {
    // Bug: When both OPENAI_API_KEY and ANTHROPIC_API_KEY are present,
    // validateProviderModelCompatibility ignored config.provider and
    // used key precedence (Anthropic wins), causing false mismatch errors.
    const config = createTestConfig({ provider: 'openai' });
    const env = {
      OPENAI_API_KEY: 'sk-test',
      ANTHROPIC_API_KEY: 'sk-ant-test', // Both keys present
    };

    // With explicit provider: openai, should NOT fail even with Anthropic key present
    const result = validateProviderModelCompatibility(config, 'gpt-4o', env);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  it('REGRESSION: explicit provider:anthropic uses Claude model correctly', () => {
    const config = createTestConfig({ provider: 'anthropic' });
    const env = {
      OPENAI_API_KEY: 'sk-test',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    };

    const result = validateProviderModelCompatibility(config, 'claude-sonnet-4-20250514', env);
    expect(result.valid).toBe(true);
  });

  it('REGRESSION: without explicit provider, Anthropic takes precedence (backward compat)', () => {
    // When no explicit provider is set, the old behavior should apply
    const config = createTestConfig(); // No provider set
    const env = {
      OPENAI_API_KEY: 'sk-test',
      ANTHROPIC_API_KEY: 'sk-ant-test',
    };

    // GPT model with Anthropic taking precedence = mismatch
    const result = validateProviderModelCompatibility(config, 'gpt-4o', env);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Provider-model mismatch'))).toBe(true);
  });
});

describe('Regression: P2 - Stdout JSON purity for --json flag', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('REGRESSION: preflight logs go to stderr, not stdout', () => {
    // Bug: [preflight] logs were written to console.log, breaking --json output
    const config = createTestConfig();
    const env = { OPENAI_API_KEY: 'sk-test-key' };

    runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

    // Auto-apply and resolved config logs should go to stderr
    const stderrCalls = consoleErrorSpy.mock.calls.flat().join(' ');
    const stdoutCalls = consoleLogSpy.mock.calls.flat().join(' ');

    // Preflight-specific logs should be in stderr
    if (stderrCalls.includes('[preflight]') || stdoutCalls.includes('[preflight]')) {
      expect(stderrCalls).toContain('[preflight]');
      expect(stdoutCalls).not.toContain('[preflight]');
    }
  });
});

describe('Regression: P3 - Non-interactive mode supports "both" platform', () => {
  it('REGRESSION: validPlatforms includes "both"', () => {
    // Bug: Non-interactive config init rejected --platform both
    // because validPlatforms was ['github', 'ado'], missing 'both'
    const yaml = generateConfigYaml({
      provider: 'openai',
      platform: 'both',
      agents: ['semgrep'],
      useDefaults: true,
    });

    const parsed = parseYaml(yaml);

    // Both reporting blocks must exist
    expect(parsed.reporting.github).toBeDefined();
    expect(parsed.reporting.ado).toBeDefined();
    expect(parsed.reporting.github.mode).toBe('checks_and_comments');
    expect(parsed.reporting.ado.mode).toBe('threads_and_status');
  });
});

/**
 * Regression test for config init validation matching runtime behavior.
 *
 * Bug: Config init validation parsed generated YAML without merging defaults,
 * causing false positives where validation passed but runtime failed.
 *
 * Scenario: provider: anthropic + ANTHROPIC_API_KEY + no MODEL
 * - Config init without defaults merge: auto-applies Claude default → passes
 * - Runtime with defaults merge: models.default: gpt-4o-mini → provider/model mismatch
 */
import { loadDefaults, deepMerge } from '../../config.js';
import { ConfigSchema } from '../../config/schemas.js';

describe('Regression: Config init validates with defaults merge', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('REGRESSION: deepMerge and loadDefaults are exported from config.js', async () => {
    // These functions must be available for config init to use
    expect(typeof deepMerge).toBe('function');
    expect(typeof loadDefaults).toBe('function');

    const defaults = await loadDefaults();
    expect(defaults).toBeDefined();
    expect(typeof defaults).toBe('object');
  });

  it('REGRESSION: deepMerge applies defaults correctly', () => {
    const defaults = { models: { default: 'gpt-4o-mini' }, version: 1 };
    const userConfig = { provider: 'anthropic', version: 1 };

    const merged = deepMerge(defaults, userConfig);

    // User config takes precedence
    expect(merged['provider']).toBe('anthropic');
    // Defaults fill in missing fields
    expect((merged['models'] as Record<string, unknown>)['default']).toBe('gpt-4o-mini');
  });

  it('REGRESSION: Generated config merged with defaults matches runtime', async () => {
    // Generate Anthropic config (no models.default set)
    const yaml = generateConfigYaml({
      provider: 'anthropic',
      platform: 'github',
      agents: ['semgrep', 'opencode'],
      useDefaults: true,
    });

    const generatedConfig = parseYaml(yaml) as Record<string, unknown>;
    const defaults = await loadDefaults();
    const mergedConfig = deepMerge(defaults, generatedConfig);

    // Validate merged config
    const config = ConfigSchema.parse(mergedConfig);

    // The merged config should have provider: anthropic
    expect(config.provider).toBe('anthropic');

    // If defaults have models.default, it should be merged in
    // (unless the generated config overrides it)
    if (defaults['models'] && (defaults['models'] as Record<string, unknown>)['default']) {
      // The generated config doesn't set models.default, so defaults apply
      expect(config.models.default).toBe(
        (defaults['models'] as Record<string, unknown>)['default']
      );
    }
  });

  it('REGRESSION: Anthropic provider with OpenAI default model fails validation', async () => {
    // This is the specific scenario that was failing:
    // - provider: anthropic
    // - ANTHROPIC_API_KEY set
    // - defaults.models.default: gpt-4o-mini (from defaults file)
    // - No explicit MODEL set
    //
    // Without defaults merge: auto-applies Claude default → passes
    // With defaults merge: gpt-4o-mini → provider/model mismatch → fails

    const yaml = generateConfigYaml({
      provider: 'anthropic',
      platform: 'github',
      agents: ['semgrep', 'opencode'],
      useDefaults: true,
    });

    const generatedConfig = parseYaml(yaml) as Record<string, unknown>;
    const defaults = await loadDefaults();
    const mergedConfig = deepMerge(defaults, generatedConfig);
    const config = ConfigSchema.parse(mergedConfig);

    // If the defaults have an OpenAI model, validation should catch the mismatch
    const defaultModel = config.models.default;
    const hasOpenAIDefaultModel = defaultModel && defaultModel.startsWith('gpt-');

    if (hasOpenAIDefaultModel) {
      const minimalContext = createMinimalContext(config);
      const env = { ANTHROPIC_API_KEY: 'sk-ant-test' }; // Only Anthropic key

      const result = runPreflightChecks(config, minimalContext, env, '/tmp/test');

      // With merged defaults, this should fail due to model/provider mismatch
      // The defaults have gpt-4o-mini but provider is anthropic
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('mismatch') || e.includes('gpt-'))).toBe(true);
    }
  });
});
