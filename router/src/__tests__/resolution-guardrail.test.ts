/**
 * Resolution Guardrail Tests
 *
 * Feature 001: Fix Config Wizard Validation Bugs
 * Ensures model resolution happens exactly once per command (FR-015, FR-016).
 *
 * These tests verify the "single source of truth" invariant:
 * - Preflight resolves the model once
 * - AgentContext uses the resolved model from preflight
 * - No re-resolution occurs after preflight
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as preflightModule from '../preflight.js';
import { runPreflightChecks } from '../phases/preflight.js';
import type { Config } from '../config.js';
import type { AgentContext } from '../agents/types.js';

/**
 * Create a minimal test config for resolution tests.
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
function createMinimalContext(effectiveModel: string): AgentContext {
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
    config: createTestConfig(),
    diffContent: '',
    prNumber: undefined,
    env: {},
    effectiveModel,
    provider: null,
  };
}

describe('Resolution Guardrail (FR-015, FR-016)', () => {
  let resolverSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Spy on the resolver function to count calls
    resolverSpy = vi.spyOn(preflightModule, 'resolveEffectiveModelWithDefaults');
  });

  afterEach(() => {
    resolverSpy.mockRestore();
  });

  describe('T010: Single resolution per runPreflightChecks call', () => {
    it('should call resolveEffectiveModelWithDefaults exactly once per preflight check', () => {
      const config = createTestConfig();
      const context = createMinimalContext('gpt-4o');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      // Run preflight checks
      runPreflightChecks(config, context, env, '/tmp/test-repo');

      // FR-015: Resolver should be called exactly once
      expect(resolverSpy).toHaveBeenCalledTimes(1);
    });

    it('should call resolver with correct config and env', () => {
      const config = createTestConfig();
      const context = createMinimalContext('gpt-4o');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      runPreflightChecks(config, context, env, '/tmp/test-repo');

      expect(resolverSpy).toHaveBeenCalledWith(config, env);
    });
  });

  describe('T011: Validate command uses single resolution', () => {
    it('should resolve model exactly once for validate command path', () => {
      // Simulate validate command: create config + context, run preflight
      const config = createTestConfig();
      const context = createMinimalContext('gpt-4o');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      // This simulates the validate command path
      runPreflightChecks(config, context, env, '/tmp/test-repo');

      // Validate should trigger exactly one resolution
      expect(resolverSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('T012: AgentContext.effectiveModel matches ResolvedConfig.model', () => {
    it('should return resolved model in PreflightResult.resolved', () => {
      const config = createTestConfig();
      const context = createMinimalContext('placeholder-will-be-replaced');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      // FR-016: PreflightResult.resolved should contain the model
      expect(result.resolved).toBeDefined();
      expect(result.resolved?.model).toBe('gpt-4o');
    });

    it('should use auto-applied model when MODEL env not set (single-key setup)', () => {
      // Config with no default model, relying on auto-apply
      const config = createTestConfig({ models: {} as Config['models'] });
      const context = createMinimalContext('');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      // Auto-apply should set the default OpenAI model
      expect(result.resolved).toBeDefined();
      expect(result.resolved?.model).toBe('gpt-4o');
    });

    it('should use config default model when set', () => {
      const config = createTestConfig({ models: { default: 'gpt-4o-mini' } });
      const context = createMinimalContext('gpt-4o-mini');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      expect(result.resolved?.model).toBe('gpt-4o-mini');
    });

    it('should use MODEL env var when explicitly set', () => {
      const config = createTestConfig();
      const context = createMinimalContext('claude-sonnet-4-20250514');
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-test',
        MODEL: 'claude-sonnet-4-20250514',
      };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      expect(result.resolved?.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('FR-016: AgentContext must be derived from ResolvedConfig', () => {
    it('should include resolved provider in PreflightResult', () => {
      const config = createTestConfig();
      const context = createMinimalContext('gpt-4o');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      expect(result.resolved?.provider).toBe('openai');
      // keySource format is "env:VAR_NAME"
      expect(result.resolved?.keySource).toBe('env:OPENAI_API_KEY');
    });

    it('should include configSource in resolved tuple', () => {
      const config = createTestConfig();
      const context = createMinimalContext('gpt-4o');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      expect(result.resolved?.configSource).toBeDefined();
      expect(['file', 'defaults', 'merged']).toContain(result.resolved?.configSource);
    });

    it('should include schema and resolution versions', () => {
      const config = createTestConfig();
      const context = createMinimalContext('gpt-4o');
      const env = { OPENAI_API_KEY: 'sk-test-key' };

      const result = runPreflightChecks(config, context, env, '/tmp/test-repo');

      expect(result.resolved?.schemaVersion).toBe(1);
      expect(result.resolved?.resolutionVersion).toBe(1);
    });
  });
});
