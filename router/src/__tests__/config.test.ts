/**
 * Config Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigSchema,
  getEnabledAgents,
  resolveEffectiveModel,
  inferProviderFromModel,
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

describe('inferProviderFromModel', () => {
  describe('Anthropic models (claude-*)', () => {
    it('identifies claude-sonnet-4-20250514 as anthropic', () => {
      expect(inferProviderFromModel('claude-sonnet-4-20250514')).toBe('anthropic');
    });

    it('identifies claude-3-opus as anthropic', () => {
      expect(inferProviderFromModel('claude-3-opus')).toBe('anthropic');
    });

    it('identifies claude-3.5-sonnet as anthropic', () => {
      expect(inferProviderFromModel('claude-3.5-sonnet')).toBe('anthropic');
    });

    it('identifies claude-instant as anthropic', () => {
      expect(inferProviderFromModel('claude-instant')).toBe('anthropic');
    });
  });

  describe('OpenAI models (gpt-* and o1-*)', () => {
    it('identifies gpt-4o-mini as openai', () => {
      expect(inferProviderFromModel('gpt-4o-mini')).toBe('openai');
    });

    it('identifies gpt-4-turbo as openai', () => {
      expect(inferProviderFromModel('gpt-4-turbo')).toBe('openai');
    });

    it('identifies gpt-3.5-turbo as openai', () => {
      expect(inferProviderFromModel('gpt-3.5-turbo')).toBe('openai');
    });

    it('identifies o1-preview as openai', () => {
      expect(inferProviderFromModel('o1-preview')).toBe('openai');
    });

    it('identifies o1-mini as openai', () => {
      expect(inferProviderFromModel('o1-mini')).toBe('openai');
    });
  });

  describe('Unknown models', () => {
    it('returns unknown for custom model names', () => {
      expect(inferProviderFromModel('custom-model-v1')).toBe('unknown');
    });

    it('returns unknown for Ollama models', () => {
      expect(inferProviderFromModel('codellama:7b')).toBe('unknown');
    });

    it('returns unknown for empty string', () => {
      expect(inferProviderFromModel('')).toBe('unknown');
    });
  });
});

describe('resolveProvider', () => {
  describe('Provider precedence (Anthropic wins)', () => {
    it('returns anthropic when both keys present for anthropic-capable agent', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      expect(resolveProvider('opencode', env)).toBe('anthropic');
    });

    it('returns anthropic when both keys present for pr_agent', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      expect(resolveProvider('pr_agent', env)).toBe('anthropic');
    });

    it('returns anthropic when both keys present for ai_semantic_review', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      expect(resolveProvider('ai_semantic_review', env)).toBe('anthropic');
    });
  });

  describe('Single key scenarios', () => {
    it('returns openai when only OPENAI_API_KEY present', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      expect(resolveProvider('opencode', env)).toBe('openai');
    });

    it('returns anthropic when only ANTHROPIC_API_KEY present', () => {
      const env = { ANTHROPIC_API_KEY: 'sk-ant-xxx' };
      expect(resolveProvider('opencode', env)).toBe('anthropic');
    });
  });

  describe('Azure OpenAI', () => {
    it('returns azure-openai when all Azure keys present for azure-capable agent', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      expect(resolveProvider('pr_agent', env)).toBe('azure-openai');
    });

    it('returns null for opencode with only Azure keys (opencode not Azure-capable)', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      expect(resolveProvider('opencode', env)).toBe(null);
    });

    it('Anthropic takes precedence over Azure', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      expect(resolveProvider('pr_agent', env)).toBe('anthropic');
    });
  });

  describe('Special agents', () => {
    it('returns ollama for local_llm regardless of keys', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      expect(resolveProvider('local_llm', env)).toBe('ollama');
    });

    it('returns null for semgrep (static analysis)', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      expect(resolveProvider('semgrep', env)).toBe(null);
    });

    it('returns null for reviewdog (static analysis)', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      expect(resolveProvider('reviewdog', env)).toBe(null);
    });
  });

  describe('No keys', () => {
    it('returns null when no keys present', () => {
      expect(resolveProvider('opencode', {})).toBe(null);
    });
  });
});
