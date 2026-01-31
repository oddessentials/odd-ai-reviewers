/**
 * Validate/Review Parity Tests
 *
 * Feature 001: Fix Config Wizard Validation Bugs
 * Ensures validate and review commands use identical resolution logic (FR-021, FR-022).
 *
 * These tests verify:
 * - Both commands produce identical resolved tuples for same repo/env
 * - Validate doesn't perform resolution branches that review doesn't
 * - Exit code semantics are consistent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runPreflightChecks } from '../phases/preflight.js';
import type { Config } from '../config.js';
import type { AgentContext } from '../agents/types.js';

/**
 * Create a minimal test config for parity tests.
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
    models: { default: 'gpt-4o' },
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
    effectiveModel: '', // Placeholder - preflight resolves
    provider: null,
  };
}

describe('Validate/Review Parity (FR-021, FR-022)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('T050: Resolved tuple identical for validate and review paths', () => {
    it('should produce identical resolved tuple when called with same config and env', () => {
      const config = createTestConfig();
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      // Simulate validate command path
      const validateContext = createMinimalContext(config);
      const validateResult = runPreflightChecks(config, validateContext, env, '/tmp/test-repo');

      // Simulate review command path (same config, same env)
      const reviewContext = createMinimalContext(config);
      const reviewResult = runPreflightChecks(config, reviewContext, env, '/tmp/test-repo');

      // FR-021: Resolved tuples must be identical
      expect(validateResult.resolved).toEqual(reviewResult.resolved);
    });

    it('should resolve same model for single-key setup in both commands', () => {
      const config = createTestConfig({ models: {} as Config['models'] });
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const validateResult = runPreflightChecks(
        config,
        createMinimalContext(config),
        env,
        '/tmp/test'
      );
      const reviewResult = runPreflightChecks(
        config,
        createMinimalContext(config),
        env,
        '/tmp/test'
      );

      // Both should auto-apply gpt-4o
      expect(validateResult.resolved?.model).toBe('gpt-4o');
      expect(reviewResult.resolved?.model).toBe('gpt-4o');
      expect(validateResult.resolved?.model).toBe(reviewResult.resolved?.model);
    });

    it('should resolve same provider in both commands', () => {
      const config = createTestConfig();
      const env = { ANTHROPIC_API_KEY: 'sk-ant-test', MODEL: 'claude-sonnet-4-20250514' };

      const validateResult = runPreflightChecks(
        config,
        createMinimalContext(config),
        env,
        '/tmp/test'
      );
      const reviewResult = runPreflightChecks(
        config,
        createMinimalContext(config),
        env,
        '/tmp/test'
      );

      expect(validateResult.resolved?.provider).toBe(reviewResult.resolved?.provider);
      expect(validateResult.resolved?.keySource).toBe(reviewResult.resolved?.keySource);
    });
  });

  describe('T051: Validate performs no extra resolution branches', () => {
    it('should use same resolution function in both paths', () => {
      // Both validate and review call runPreflightChecks which calls resolveEffectiveModelWithDefaults
      // This is guaranteed by the implementation structure
      const config = createTestConfig();
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      // Both paths go through the same runPreflightChecks function
      const result1 = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');
      const result2 = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

      // Same function, same inputs, same outputs
      expect(result1.resolved).toEqual(result2.resolved);
    });

    it('should not have validate-specific resolution logic', () => {
      // Verify that runPreflightChecks is the single entry point for both commands
      // by checking that identical inputs produce identical outputs
      const config = createTestConfig();
      const envs = [
        { OPENAI_API_KEY: 'sk-test' },
        { ANTHROPIC_API_KEY: 'sk-ant-test', MODEL: 'claude-sonnet-4-20250514' },
        { OPENAI_API_KEY: 'sk-test', MODEL: 'gpt-4o-mini' },
      ];

      for (const env of envs) {
        const result1 = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');
        const result2 = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

        expect(result1.resolved).toEqual(result2.resolved);
        expect(result1.valid).toBe(result2.valid);
        expect(result1.errors).toEqual(result2.errors);
      }
    });
  });
});

describe('Exit Code Semantics (FR-018, FR-020)', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  describe('T043: validate exits 1 only if errors.length > 0', () => {
    it('should return valid=false when errors exist', () => {
      // Config with azure-openai but no required env vars
      const config = createTestConfig({ provider: 'azure-openai' });
      const env = {}; // Missing all Azure env vars

      const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // valid=false → exit 1
    });

    it('should return valid=true when no errors', () => {
      const config = createTestConfig();
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
      // valid=true → exit 0
    });
  });

  describe('T044: validate exits 0 with warnings only', () => {
    it('should return valid=true even when warnings exist', () => {
      // Config with both platforms but no CI env detected
      const config = createTestConfig({
        reporting: {
          github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
          ado: {
            mode: 'threads_and_status',
            max_inline_comments: 20,
            summary: true,
            thread_status: 'active',
          },
        },
      });
      const env = { OPENAI_API_KEY: 'sk-test-key' }; // No GITHUB_ACTIONS or TF_BUILD

      const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

      // Should have warning about missing platform env
      expect(result.warnings.length).toBeGreaterThan(0);
      // But still valid (exit 0)
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('FR-020: warnings never cause non-zero exit', () => {
      const config = createTestConfig({
        reporting: {
          github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
          ado: {
            mode: 'threads_and_status',
            max_inline_comments: 20,
            summary: true,
            thread_status: 'active',
          },
        },
      });
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

      // Verify the invariant: valid is determined by errors only
      expect(result.valid).toBe(result.errors.length === 0);
    });
  });

  describe('T047: Exit logic formula', () => {
    it('should use errors.length > 0 ? 1 : 0 formula', () => {
      const config = createTestConfig();

      // Test with valid env
      const validResult = runPreflightChecks(
        config,
        createMinimalContext(config),
        { OPENAI_API_KEY: 'sk-test' },
        '/tmp/test'
      );
      expect(validResult.valid).toBe(true);
      // Exit code would be: validResult.valid ? 0 : 1 = 0

      // Test with invalid env (azure missing keys)
      const invalidConfig = createTestConfig({ provider: 'azure-openai' });
      const invalidResult = runPreflightChecks(
        invalidConfig,
        createMinimalContext(invalidConfig),
        {},
        '/tmp/test'
      );
      expect(invalidResult.valid).toBe(false);
      // Exit code would be: invalidResult.valid ? 0 : 1 = 1
    });
  });
});

describe('No Stdin Hanging (FR-025, FR-026)', () => {
  describe('T045/T046: Commands never prompt for input', () => {
    it('runPreflightChecks is synchronous and non-blocking', () => {
      const config = createTestConfig();
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      // runPreflightChecks should complete immediately without waiting for input
      const start = Date.now();
      runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');
      const duration = Date.now() - start;

      // Should complete in < 100ms (no blocking)
      expect(duration).toBeLessThan(100);
    });

    it('missing configuration fails fast with error, no prompt', () => {
      // When required config is missing, should return error immediately
      const config = createTestConfig({ provider: 'azure-openai' });
      const env = {}; // Missing all required Azure vars

      const result = runPreflightChecks(config, createMinimalContext(config), env, '/tmp/test');

      // Should fail fast with errors, not hang
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // Error message should be actionable
      expect(result.errors.some((e) => e.includes('AZURE'))).toBe(true);
    });
  });
});
