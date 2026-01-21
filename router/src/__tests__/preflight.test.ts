/**
 * Preflight Validation Tests
 *
 * Tests for legacy key rejection, Azure bundle validation, model config validation,
 * model-provider match validation, and Ollama config validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateAgentSecrets,
  validateModelConfig,
  validateModelProviderMatch,
  validateOllamaConfig,
} from '../preflight.js';
import type { Config } from '../config.js';

function createTestConfig(agents: string[]): Config {
  return {
    version: 1,
    trusted_only: false,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [
      {
        name: 'test',
        agents: agents as Config['passes'][0]['agents'],
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
    models: { default: 'gpt-4o-mini' },
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
  };
}

describe('Preflight Validation', () => {
  describe('Legacy Key Rejection', () => {
    it('fails on PR_AGENT_API_KEY', () => {
      const config = createTestConfig(['semgrep']);
      const env = { PR_AGENT_API_KEY: 'sk-old' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Legacy');
      expect(result.errors[0]).toContain('PR_AGENT_API_KEY');
    });

    it('fails on AI_SEMANTIC_REVIEW_API_KEY', () => {
      const config = createTestConfig(['semgrep']);
      const env = { AI_SEMANTIC_REVIEW_API_KEY: 'sk-old' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('AI_SEMANTIC_REVIEW_API_KEY');
    });

    it('fails on OPENCODE_MODEL', () => {
      const config = createTestConfig(['semgrep']);
      const env = { OPENCODE_MODEL: 'gpt-4' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('OPENCODE_MODEL');
    });

    it('fails on OPENAI_MODEL', () => {
      const config = createTestConfig(['semgrep']);
      const env = { OPENAI_MODEL: 'gpt-4' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('OPENAI_MODEL');
    });

    it('does not fail on canonical keys', () => {
      const config = createTestConfig(['semgrep']);
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        MODEL: 'gpt-4o-mini',
      };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });
  });

  describe('Azure OpenAI Bundle Validation', () => {
    it('fails when only AZURE_OPENAI_API_KEY is set', () => {
      const config = createTestConfig(['semgrep']);
      const env = { AZURE_OPENAI_API_KEY: 'azure-xxx' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Azure OpenAI');
      expect(result.errors[0]).toContain('AZURE_OPENAI_ENDPOINT');
      expect(result.errors[0]).toContain('AZURE_OPENAI_DEPLOYMENT');
    });

    it('fails when only AZURE_OPENAI_ENDPOINT is set', () => {
      const config = createTestConfig(['semgrep']);
      const env = { AZURE_OPENAI_ENDPOINT: 'https://my.azure.com' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Azure OpenAI');
    });

    it('fails when AZURE_OPENAI_DEPLOYMENT is missing', () => {
      const config = createTestConfig(['semgrep']);
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
      };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('AZURE_OPENAI_DEPLOYMENT');
    });

    it('passes when all Azure keys are set', () => {
      const config = createTestConfig(['semgrep']);
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });

    it('passes when no Azure keys are set', () => {
      const config = createTestConfig(['semgrep']);
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });
  });

  describe('Agent Secret Requirements', () => {
    it('opencode requires one of OPENAI_API_KEY or ANTHROPIC_API_KEY', () => {
      const config = createTestConfig(['opencode']);
      const env = {};
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('OPENAI_API_KEY');
      expect(result.errors[0]).toContain('ANTHROPIC_API_KEY');
    });

    it('opencode passes with OPENAI_API_KEY', () => {
      const config = createTestConfig(['opencode']);
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });

    it('opencode passes with ANTHROPIC_API_KEY', () => {
      const config = createTestConfig(['opencode']);
      const env = { ANTHROPIC_API_KEY: 'sk-ant-xxx' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });

    it('pr_agent requires OPENAI or Azure', () => {
      const config = createTestConfig(['pr_agent']);
      const env = {};
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
    });

    it('pr_agent passes with OPENAI_API_KEY', () => {
      const config = createTestConfig(['pr_agent']);
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });

    it('pr_agent passes with Azure OpenAI complete bundle', () => {
      const config = createTestConfig(['pr_agent']);
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });

    it('semgrep requires no secrets', () => {
      const config = createTestConfig(['semgrep']);
      const env = {};
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });

    it('local_llm requires no secrets', () => {
      const config = createTestConfig(['local_llm']);
      const env = {};
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(true);
    });
  });
});

describe('Model Config Validation', () => {
  it('should fail when effectiveModel is empty and MODEL env is not set', () => {
    const result = validateModelConfig('', {});

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('No model configured');
  });

  it('should fail when effectiveModel is whitespace only', () => {
    const result = validateModelConfig('   ', {});

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBe(1);
  });

  it('should pass when effectiveModel is provided', () => {
    const result = validateModelConfig('gpt-4o-mini', {});

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('should pass when effectiveModel is claude model', () => {
    const result = validateModelConfig('claude-sonnet-4-20250514', {});

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('validateModelProviderMatch', () => {
  // Helper to create config with cloud AI agents enabled
  function createCloudAiConfig(): Config {
    return {
      version: 1,
      trusted_only: false,
      triggers: { on: ['pull_request'], branches: ['main'] },
      passes: [{ name: 'cloud', agents: ['opencode'], enabled: true, required: true }],
      limits: {
        max_files: 50,
        max_diff_lines: 2000,
        max_tokens_per_pr: 12000,
        max_usd_per_pr: 1.0,
        monthly_budget_usd: 100,
      },
      models: {},
      reporting: {
        github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
      },
      gating: { enabled: false, fail_on_severity: 'error' },
      path_filters: { include: ['**/*'], exclude: [] },
    };
  }

  describe('Claude models (Anthropic)', () => {
    it('should pass when claude model and ANTHROPIC_API_KEY present', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'claude-sonnet-4-20250514', {
        ANTHROPIC_API_KEY: 'sk-ant-test',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should fail when claude model but ANTHROPIC_API_KEY missing', () => {
      const result = validateModelProviderMatch(
        createCloudAiConfig(),
        'claude-sonnet-4-20250514',
        {}
      );
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('claude-');
      expect(result.errors[0]).toContain('ANTHROPIC_API_KEY');
    });

    it('should fail when claude-3 model but no Anthropic key', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'claude-3-opus', {
        OPENAI_API_KEY: 'sk-openai',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('looks like Anthropic');
    });
  });

  describe('GPT models (OpenAI)', () => {
    it('should pass when gpt model and OPENAI_API_KEY present', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'gpt-4o-mini', {
        OPENAI_API_KEY: 'sk-openai',
      });
      expect(result.valid).toBe(true);
    });

    it('should pass when gpt model and AZURE_OPENAI_API_KEY present', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'gpt-4o', {
        AZURE_OPENAI_API_KEY: 'azure-key',
      });
      expect(result.valid).toBe(true);
    });

    it('should fail when gpt model but no OpenAI key', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'gpt-4o-mini', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('gpt-');
      expect(result.errors[0]).toContain('OPENAI_API_KEY');
    });

    it('should fail when o1 model but no OpenAI key', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'o1-preview', {
        ANTHROPIC_API_KEY: 'sk-ant',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('o1-');
    });
  });

  describe('Unknown models', () => {
    it('should pass for unknown model prefix (no validation)', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'custom-model-v1', {});
      expect(result.valid).toBe(true);
    });

    it('should pass for Ollama-style models (no validation)', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'codellama:7b', {});
      expect(result.valid).toBe(true);
    });
  });
});

describe('validateOllamaConfig', () => {
  function createOllamaConfig(enabled: boolean, required: boolean): Config {
    return {
      version: 1,
      trusted_only: false,
      triggers: { on: ['pull_request'], branches: ['main'] },
      passes: [
        {
          name: 'local-ai',
          agents: ['local_llm'] as Config['passes'][0]['agents'],
          enabled,
          required,
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
        github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
      },
      gating: { enabled: false, fail_on_severity: 'error' },
      path_filters: { include: ['**/*'], exclude: [] },
    };
  }

  // NOTE: OLLAMA_BASE_URL is NOT required because local_llm defaults to http://ollama-sidecar:11434

  it('should pass when local_llm is required and OLLAMA_BASE_URL is set', () => {
    const config = createOllamaConfig(true, true);
    const result = validateOllamaConfig(config, { OLLAMA_BASE_URL: 'http://ollama:11434' });
    expect(result.valid).toBe(true);
  });

  it('should pass when local_llm is required but OLLAMA_BASE_URL is missing (uses default)', () => {
    const config = createOllamaConfig(true, true);
    const result = validateOllamaConfig(config, {});
    expect(result.valid).toBe(true); // Defaults to http://ollama-sidecar:11434
  });

  it('should pass when local_llm is optional (not required) and OLLAMA_BASE_URL is missing', () => {
    const config = createOllamaConfig(true, false);
    const result = validateOllamaConfig(config, {});
    expect(result.valid).toBe(true);
  });

  it('should pass when local_llm is disabled', () => {
    const config = createOllamaConfig(false, true);
    const result = validateOllamaConfig(config, {});
    expect(result.valid).toBe(true);
  });

  it('should pass when no local_llm agent configured', () => {
    const config: Config = {
      version: 1,
      trusted_only: false,
      triggers: { on: ['pull_request'], branches: ['main'] },
      passes: [{ name: 'cloud', agents: ['opencode'], enabled: true, required: true }],
      limits: {
        max_files: 50,
        max_diff_lines: 2000,
        max_tokens_per_pr: 12000,
        max_usd_per_pr: 1.0,
        monthly_budget_usd: 100,
      },
      models: {},
      reporting: {
        github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
      },
      gating: { enabled: false, fail_on_severity: 'error' },
      path_filters: { include: ['**/*'], exclude: [] },
    };
    const result = validateOllamaConfig(config, {});
    expect(result.valid).toBe(true);
  });
});
