/**
 * Config Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  getEnabledAgents,
  resolveEffectiveModel,
  resolveProvider,
  type Config,
} from '../config.js';

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
        // Static analysis is required by default
        expect(defaultPass.required).toBe(true);
      }
    }
  });

  it('should default required to false for user-defined passes', () => {
    const input = {
      passes: [{ name: 'custom', agents: ['opencode'], enabled: true }],
    };

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const pass = result.data.passes[0];
      expect(pass).toBeDefined();
      expect(pass?.required).toBe(false);
    }
  });

  it('should allow explicit required: true on user passes', () => {
    const input = {
      passes: [
        { name: 'critical', agents: ['semgrep'], enabled: true, required: true },
        { name: 'optional', agents: ['opencode'], enabled: true, required: false },
      ],
    };

    const result = ConfigSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const pass0 = result.data.passes[0];
      const pass1 = result.data.passes[1];
      expect(pass0).toBeDefined();
      expect(pass1).toBeDefined();
      expect(pass0?.required).toBe(true);
      expect(pass1?.required).toBe(false);
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
      { name: 'static', agents: ['semgrep'], enabled: true, required: true },
      { name: 'semantic', agents: ['opencode', 'pr_agent'], enabled: true, required: false },
      { name: 'disabled', agents: ['local_llm'], enabled: false, required: false },
    ],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
    },
    models: { default: 'gpt-4o-mini' },
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

describe('Model Configuration', () => {
  it('should have models object in parsed config (no default)', () => {
    const input = {};
    const result = ConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.models).toBeDefined();
      // No default anymore - preflight validation will catch missing model
      expect(result.data.models.default).toBeUndefined();
    }
  });

  it('should allow custom models.default', () => {
    const input = {
      models: { default: 'gpt-4-turbo' },
    };
    const result = ConfigSchema.safeParse(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.models.default).toBe('gpt-4-turbo');
    }
  });
});

describe('resolveEffectiveModel', () => {
  const baseConfig = ConfigSchema.parse({});

  it('uses config.models.default when MODEL env not set', () => {
    const config = ConfigSchema.parse({ models: { default: 'custom-model' } });
    const env = {};
    expect(resolveEffectiveModel(config, env)).toBe('custom-model');
  });

  it('MODEL env var overrides config.models.default', () => {
    const config = ConfigSchema.parse({ models: { default: 'config-model' } });
    const env = { MODEL: 'env-override-model' };
    expect(resolveEffectiveModel(config, env)).toBe('env-override-model');
  });

  it('returns empty string when neither env nor config set (preflight catches this)', () => {
    // No default anymore - preflight validation will catch this
    expect(resolveEffectiveModel(baseConfig, {})).toBe('');
  });

  it('ignores empty string MODEL env var', () => {
    const config = ConfigSchema.parse({ models: { default: 'config-model' } });
    const env = { MODEL: '' };
    expect(resolveEffectiveModel(config, env)).toBe('config-model');
  });

  it('ignores whitespace-only MODEL env var', () => {
    const config = ConfigSchema.parse({ models: { default: 'config-model' } });
    const env = { MODEL: '   ' };
    expect(resolveEffectiveModel(config, env)).toBe('config-model');
  });
});

describe('resolveProvider', () => {
  describe('model-based provider selection (both keys present)', () => {
    it('should select OpenAI for gpt model when both keys present', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai',
        ANTHROPIC_API_KEY: 'sk-ant-test',
      };
      expect(resolveProvider('opencode', env, 'gpt-4o-mini')).toBe('openai');
      expect(resolveProvider('pr_agent', env, 'gpt-4o-mini')).toBe('openai');
    });

    it('should select OpenAI for o1 model when both keys present', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai',
        ANTHROPIC_API_KEY: 'sk-ant-test',
      };
      expect(resolveProvider('opencode', env, 'o1-preview')).toBe('openai');
    });

    it('should select Anthropic for claude model when both keys present', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai',
        ANTHROPIC_API_KEY: 'sk-ant-test',
      };
      expect(resolveProvider('opencode', env, 'claude-sonnet-4-20250514')).toBe('anthropic');
      expect(resolveProvider('pr_agent', env, 'claude-3-opus')).toBe('anthropic');
    });
  });

  describe('single key present', () => {
    it('should select OpenAI when only OpenAI key present', () => {
      const env = { OPENAI_API_KEY: 'sk-openai' };
      expect(resolveProvider('opencode', env, 'gpt-4o-mini')).toBe('openai');
      expect(resolveProvider('opencode', env)).toBe('openai');
    });

    it('should select Anthropic when only Anthropic key present', () => {
      const env = { ANTHROPIC_API_KEY: 'sk-ant-test' };
      expect(resolveProvider('opencode', env, 'claude-sonnet-4-20250514')).toBe('anthropic');
      expect(resolveProvider('opencode', env)).toBe('anthropic');
    });
  });

  describe('fallback precedence (unknown model or no model)', () => {
    it('should fallback to Anthropic precedence for unknown model when both keys present', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai',
        ANTHROPIC_API_KEY: 'sk-ant-test',
      };
      // Unknown model prefix falls back to precedence-based selection (Anthropic wins)
      expect(resolveProvider('opencode', env, 'custom-model')).toBe('anthropic');
    });

    it('should fallback to Anthropic precedence when no model specified', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai',
        ANTHROPIC_API_KEY: 'sk-ant-test',
      };
      expect(resolveProvider('opencode', env)).toBe('anthropic');
    });
  });

  describe('special agents', () => {
    it('should return ollama for local_llm agent', () => {
      expect(resolveProvider('local_llm', {})).toBe('ollama');
      expect(resolveProvider('local_llm', {}, 'gpt-4o-mini')).toBe('ollama');
    });

    it('should return null for static analysis agents', () => {
      expect(resolveProvider('semgrep', {})).toBeNull();
      expect(resolveProvider('reviewdog', {})).toBeNull();
    });
  });

  describe('no valid provider', () => {
    it('should return null when no keys present', () => {
      expect(resolveProvider('opencode', {})).toBeNull();
      expect(resolveProvider('pr_agent', {}, 'gpt-4o-mini')).toBeNull();
    });
  });
});
