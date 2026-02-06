/**
 * Provider Resolution Tests
 *
 * Tests for LLM provider resolution with strict precedence rules.
 * Covers edge cases identified by AI reviewer feedback.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveProvider,
  resolveEffectiveModel,
  inferProviderFromModel,
  isCompletionsOnlyModel,
} from '../config/providers.js';
import type { Config } from '../config/schemas.js';

// Minimal valid config for testing
const minimalConfig: Config = {
  version: 1,
  trusted_only: true,
  triggers: { on: ['pull_request'], branches: ['main'] },
  passes: [],
  limits: {
    max_files: 50,
    max_diff_lines: 2000,
    max_tokens_per_pr: 12000,
    max_usd_per_pr: 1.0,
    monthly_budget_usd: 100,
    max_completion_tokens: 4000,
  },
  models: { default: 'gpt-4o-mini' },
  reporting: {},
  gating: { enabled: false, fail_on_severity: 'error', drift_gate: false },
};

describe('resolveProvider', () => {
  describe('precedence rules', () => {
    it('Anthropic wins when both Anthropic and OpenAI keys present', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };

      expect(resolveProvider('opencode', env)).toBe('anthropic');
      expect(resolveProvider('pr_agent', env)).toBe('anthropic');
      expect(resolveProvider('ai_semantic_review', env)).toBe('anthropic');
    });

    it('Azure wins over OpenAI for Azure-capable agents', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };

      // pr_agent and ai_semantic_review support Azure
      expect(resolveProvider('pr_agent', env)).toBe('azure-openai');
      expect(resolveProvider('ai_semantic_review', env)).toBe('azure-openai');
    });

    it('OpenAI used when only OpenAI key present', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };

      expect(resolveProvider('opencode', env)).toBe('openai');
      expect(resolveProvider('pr_agent', env)).toBe('openai');
    });

    it('Anthropic beats Azure for Anthropic-capable agents', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };

      expect(resolveProvider('pr_agent', env)).toBe('anthropic');
    });
  });

  describe('agent capabilities', () => {
    it('opencode does not use Azure even when Azure configured', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };

      // opencode is NOT Azure-capable, should return null
      expect(resolveProvider('opencode', env)).toBeNull();
    });

    it('local_llm always returns ollama', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      };

      expect(resolveProvider('local_llm', env)).toBe('ollama');
    });

    it('semgrep returns null (no LLM needed)', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      expect(resolveProvider('semgrep', env)).toBeNull();
    });

    it('reviewdog returns null (no LLM needed)', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      expect(resolveProvider('reviewdog', env)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('empty string API key treated as missing', () => {
      const env = {
        ANTHROPIC_API_KEY: '',
        OPENAI_API_KEY: 'sk-xxx',
      };

      expect(resolveProvider('opencode', env)).toBe('openai');
    });

    it('whitespace-only API key treated as missing', () => {
      const env = {
        ANTHROPIC_API_KEY: '   ',
        OPENAI_API_KEY: 'sk-xxx',
      };

      expect(resolveProvider('opencode', env)).toBe('openai');
    });

    it('partial Azure config returns null for Azure-capable agents', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        // Missing AZURE_OPENAI_DEPLOYMENT
      };

      expect(resolveProvider('pr_agent', env)).toBeNull();
    });

    it('returns null when no valid provider available', () => {
      const env = {};
      expect(resolveProvider('opencode', env)).toBeNull();
      expect(resolveProvider('pr_agent', env)).toBeNull();
    });

    it('undefined API key treated as missing', () => {
      const env = {
        ANTHROPIC_API_KEY: undefined,
        OPENAI_API_KEY: 'sk-xxx',
      };

      expect(resolveProvider('opencode', env)).toBe('openai');
    });
  });
});

describe('resolveEffectiveModel', () => {
  it('MODEL env var takes precedence over config', () => {
    const config = { ...minimalConfig, models: { default: 'gpt-4o' } };
    const env = { MODEL: 'claude-sonnet-4-20250514' };

    expect(resolveEffectiveModel(config, env)).toBe('claude-sonnet-4-20250514');
  });

  it('falls back to config default when MODEL not set', () => {
    const config = { ...minimalConfig, models: { default: 'gpt-4o-mini' } };
    const env = {};

    expect(resolveEffectiveModel(config, env)).toBe('gpt-4o-mini');
  });

  it('returns empty string when no model configured', () => {
    const config = { ...minimalConfig, models: { default: '' } };
    const env = {};

    expect(resolveEffectiveModel(config, env)).toBe('');
  });

  it('whitespace-only MODEL env var ignored', () => {
    const config = { ...minimalConfig, models: { default: 'gpt-4o' } };
    const env = { MODEL: '   ' };

    expect(resolveEffectiveModel(config, env)).toBe('gpt-4o');
  });
});

describe('inferProviderFromModel', () => {
  it('identifies Claude models as Anthropic', () => {
    expect(inferProviderFromModel('claude-3-opus')).toBe('anthropic');
    expect(inferProviderFromModel('claude-sonnet-4-20250514')).toBe('anthropic');
    expect(inferProviderFromModel('claude-3.5-sonnet')).toBe('anthropic');
  });

  it('identifies GPT models as OpenAI', () => {
    expect(inferProviderFromModel('gpt-4o')).toBe('openai');
    expect(inferProviderFromModel('gpt-4o-mini')).toBe('openai');
    expect(inferProviderFromModel('gpt-3.5-turbo')).toBe('openai');
  });

  it('identifies o1 models as OpenAI', () => {
    expect(inferProviderFromModel('o1-preview')).toBe('openai');
    expect(inferProviderFromModel('o1-mini')).toBe('openai');
  });

  it('returns unknown for unrecognized models', () => {
    expect(inferProviderFromModel('llama3:8b')).toBe('unknown');
    expect(inferProviderFromModel('mistral-7b')).toBe('unknown');
    expect(inferProviderFromModel('custom-model')).toBe('unknown');
  });
});

describe('isCompletionsOnlyModel', () => {
  it('rejects codex models', () => {
    expect(isCompletionsOnlyModel('gpt-5.2-codex')).toBe(true);
    expect(isCompletionsOnlyModel('codex-davinci')).toBe(true);
    expect(isCompletionsOnlyModel('gpt-4-codex')).toBe(true);
  });

  it('rejects legacy davinci models', () => {
    expect(isCompletionsOnlyModel('text-davinci-001')).toBe(true);
    expect(isCompletionsOnlyModel('text-davinci-002')).toBe(true);
    expect(isCompletionsOnlyModel('text-davinci-003')).toBe(true);
  });

  it('rejects legacy curie/babbage/ada models', () => {
    expect(isCompletionsOnlyModel('curie')).toBe(true);
    expect(isCompletionsOnlyModel('babbage')).toBe(true);
    expect(isCompletionsOnlyModel('ada')).toBe(true);
  });

  it('accepts chat-compatible models', () => {
    expect(isCompletionsOnlyModel('gpt-4o')).toBe(false);
    expect(isCompletionsOnlyModel('gpt-4o-mini')).toBe(false);
    expect(isCompletionsOnlyModel('claude-sonnet-4-20250514')).toBe(false);
    expect(isCompletionsOnlyModel('o1-preview')).toBe(false);
  });

  it('does not false-positive on similar names', () => {
    // gpt-4-ada shouldn't match ^ada$ pattern
    expect(isCompletionsOnlyModel('gpt-4-ada-tuned')).toBe(false);
  });
});

/**
 * User Story 4 Tests: Simplified Provider Selection
 *
 * T039-T041: Tests for explicit provider field behavior
 * Goal: Explicit `provider` field overrides automatic detection
 */
describe('User Story 4: Explicit Provider Selection', () => {
  describe('T039: explicit provider: openai uses OpenAI with both keys', () => {
    it('should use OpenAI when explicit provider is openai, even with Anthropic key', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      };

      // Without explicit provider, Anthropic wins
      expect(resolveProvider('opencode', env)).toBe('anthropic');

      // With explicit provider, OpenAI is used
      expect(resolveProvider('opencode', env, 'openai')).toBe('openai');
    });

    it('should use OpenAI for all cloud agents when explicit', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      };

      expect(resolveProvider('opencode', env, 'openai')).toBe('openai');
      expect(resolveProvider('pr_agent', env, 'openai')).toBe('openai');
      expect(resolveProvider('ai_semantic_review', env, 'openai')).toBe('openai');
    });
  });

  describe('T040: explicit provider: anthropic uses Anthropic with both keys', () => {
    it('should use Anthropic when explicit provider is anthropic', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      };

      // Anthropic wins by default anyway, but explicit should also work
      expect(resolveProvider('opencode', env, 'anthropic')).toBe('anthropic');
    });

    it('should use Anthropic even when only OpenAI key present (explicit takes precedence)', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        // No ANTHROPIC_API_KEY - but explicit provider should still return anthropic
        // The missing key will be caught by validateExplicitProviderKeys
      };

      // Explicit provider returns the requested provider
      // Key validation happens separately in preflight
      expect(resolveProvider('opencode', env, 'anthropic')).toBe('anthropic');
    });
  });

  describe('T041: single key still auto-detects without explicit provider', () => {
    it('should auto-detect OpenAI when only OpenAI key present', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };

      // No explicit provider - should auto-detect
      expect(resolveProvider('opencode', env)).toBe('openai');
    });

    it('should auto-detect Anthropic when only Anthropic key present', () => {
      const env = { ANTHROPIC_API_KEY: 'sk-ant-xxx' };

      expect(resolveProvider('opencode', env)).toBe('anthropic');
    });

    it('should auto-detect Azure when only Azure keys present', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };

      // Azure-capable agents should auto-detect Azure
      expect(resolveProvider('pr_agent', env)).toBe('azure-openai');
    });

    it('explicit provider overrides Anthropic precedence', () => {
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };

      // Without explicit, Anthropic wins
      expect(resolveProvider('pr_agent', env)).toBe('anthropic');

      // With explicit, the specified provider is used
      expect(resolveProvider('pr_agent', env, 'openai')).toBe('openai');
      expect(resolveProvider('pr_agent', env, 'azure-openai')).toBe('azure-openai');
    });
  });

  describe('explicit provider with agent capability checks', () => {
    it('should return null for explicit azure-openai with non-Azure agent', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };

      // opencode doesn't support Azure, so explicit azure-openai should return null
      expect(resolveProvider('opencode', env, 'azure-openai')).toBeNull();
    });

    it('local_llm always returns ollama regardless of explicit provider', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };

      // local_llm uses ollama, explicit provider is ignored
      expect(resolveProvider('local_llm', env, 'openai')).toBe('ollama');
    });

    it('static agents return null regardless of explicit provider', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };

      expect(resolveProvider('semgrep', env, 'openai')).toBeNull();
      expect(resolveProvider('reviewdog', env, 'anthropic')).toBeNull();
    });
  });
});
