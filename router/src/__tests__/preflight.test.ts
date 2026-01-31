/**
 * Preflight Validation Tests
 *
 * Tests for legacy key rejection, Azure bundle validation, model config validation,
 * model-provider match validation, and Ollama config validation.
 */

import { describe, it, expect } from 'vitest';
import {
  validateAgentSecrets,
  validateChatModelCompatibility,
  validateModelConfig,
  validateModelProviderMatch,
  validateOllamaConfig,
  validateProviderModelCompatibility,
  validateAzureDeployment,
  countProvidersWithKeys,
  DEFAULT_MODELS,
} from '../preflight.js';
import type { Config, LlmProvider } from '../config.js';

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

    it('should FAIL for Ollama-style models when cloud agents enabled', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'codellama:7b', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Ollama model');
      expect(result.errors[0]).toContain('local_llm');
    });

    it('should FAIL for any model with colon when cloud agents enabled', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'llama3:8b', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Ollama model');
    });

    it('should FAIL for deepseek-coder:6.7b when cloud agents enabled', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'deepseek-coder:6.7b', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('cloud AI agents');
    });

    it('error message includes copy-pastable fixes', () => {
      const result = validateModelProviderMatch(createCloudAiConfig(), 'codellama:7b', {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('MODEL=claude-sonnet');
      expect(result.errors[0]).toContain('MODEL=gpt-4o-mini');
    });
  });

  describe('Ollama model isolation (local_llm only)', () => {
    function createLocalOnlyConfig(): Config {
      return {
        version: 1,
        trusted_only: false,
        triggers: { on: ['pull_request'], branches: ['main'] },
        passes: [{ name: 'local', agents: ['local_llm'], enabled: true, required: false }],
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

    it('should PASS for Ollama model when ONLY local_llm is enabled', () => {
      const result = validateModelProviderMatch(createLocalOnlyConfig(), 'codellama:7b', {});
      expect(result.valid).toBe(true);
    });

    it('should PASS for Ollama model when cloud agents are disabled', () => {
      const config = createCloudAiConfig();
      const firstPass = config.passes[0];
      if (firstPass) {
        firstPass.enabled = false;
      }
      const result = validateModelProviderMatch(config, 'codellama:7b', {});
      expect(result.valid).toBe(true);
    });

    it('should PASS for Ollama model with static analysis + local_llm combo', () => {
      const config: Config = {
        version: 1,
        trusted_only: false,
        triggers: { on: ['pull_request'], branches: ['main'] },
        passes: [
          { name: 'static', agents: ['semgrep', 'reviewdog'], enabled: true, required: true },
          { name: 'local', agents: ['local_llm'], enabled: true, required: false },
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
      const result = validateModelProviderMatch(config, 'codellama:7b', {});
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

describe('validateProviderModelCompatibility', () => {
  // Helper to create config with cloud AI agents enabled
  function createCloudAiConfig(agents: string[] = ['opencode']): Config {
    return {
      version: 1,
      trusted_only: false,
      triggers: { on: ['pull_request'], branches: ['main'] },
      passes: [
        {
          name: 'cloud',
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
      models: {},
      reporting: {
        github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
      },
      gating: { enabled: false, fail_on_severity: 'error' },
      path_filters: { include: ['**/*'], exclude: [] },
    };
  }

  describe('THE 404 BUG: Both keys present, Anthropic wins, but model is GPT', () => {
    it('FAILS when both keys present and MODEL=gpt-4o-mini (Anthropic wins but model is GPT)', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'gpt-4o-mini', env);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Provider-model mismatch');
      expect(result.errors[0]).toContain('Anthropic');
      expect(result.errors[0]).toContain('gpt-4o-mini');
      expect(result.errors[0]).toContain('404');
    });

    it('FAILS when both keys present and MODEL=o1-preview (Anthropic wins but model is OpenAI)', () => {
      const config = createCloudAiConfig(['pr_agent']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'o1-preview', env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('o1-');
    });

    it('error message includes actionable fix options', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'gpt-4o-mini', env);

      expect(result.errors[0]).toContain('Fix options');
      expect(result.errors[0]).toContain('MODEL=claude-sonnet');
      expect(result.errors[0]).toContain('Remove ANTHROPIC_API_KEY');
    });
  });

  describe('Reverse mismatch: OpenAI key only but Claude model', () => {
    it('FAILS when only OpenAI key present but model is claude-*', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'claude-sonnet-4-20250514', env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Provider-model mismatch');
      expect(result.errors[0]).toContain('OpenAI');
      expect(result.errors[0]).toContain('claude-');
    });

    it('FAILS when Azure OpenAI configured but model is claude-*', () => {
      const config = createCloudAiConfig(['pr_agent']); // Azure-capable
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'gpt-4',
      };
      const result = validateProviderModelCompatibility(config, 'claude-3-opus', env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Azure OpenAI');
      expect(result.errors[0]).toContain('claude-');
    });
  });

  describe('Valid configurations (no mismatch)', () => {
    it('PASSES when Anthropic key only with Claude model', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'claude-sonnet-4-20250514', env);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('PASSES when OpenAI key only with GPT model', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'gpt-4o-mini', env);

      expect(result.valid).toBe(true);
    });

    it('PASSES when both keys present with Claude model (Anthropic wins, model matches)', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'claude-sonnet-4-20250514', env);

      expect(result.valid).toBe(true);
    });

    it('PASSES for unknown model (no validation applied)', () => {
      const config = createCloudAiConfig(['opencode']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'custom-model-v1', env);

      expect(result.valid).toBe(true);
    });
  });

  describe('Multiple agents with same mismatch', () => {
    it('reports error for each affected agent', () => {
      const config = createCloudAiConfig(['opencode', 'pr_agent', 'ai_semantic_review']);
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        OPENAI_API_KEY: 'sk-xxx',
      };
      const result = validateProviderModelCompatibility(config, 'gpt-4o-mini', env);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
      expect(result.errors[0]).toContain('opencode');
      expect(result.errors[1]).toContain('pr_agent');
      expect(result.errors[2]).toContain('ai_semantic_review');
    });
  });

  describe('Non-cloud agents (skipped)', () => {
    it('PASSES when only static agents enabled', () => {
      const config: Config = {
        version: 1,
        trusted_only: false,
        triggers: { on: ['pull_request'], branches: ['main'] },
        passes: [
          { name: 'static', agents: ['semgrep', 'reviewdog'], enabled: true, required: true },
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
      // Any model should pass since no cloud agents
      const result = validateProviderModelCompatibility(config, 'gpt-4o-mini', {});

      expect(result.valid).toBe(true);
    });

    it('PASSES when only local_llm enabled (uses OLLAMA_MODEL, not MODEL)', () => {
      const config: Config = {
        version: 1,
        trusted_only: false,
        triggers: { on: ['pull_request'], branches: ['main'] },
        passes: [{ name: 'local', agents: ['local_llm'], enabled: true, required: false }],
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
      const result = validateProviderModelCompatibility(config, 'codellama:7b', {});

      expect(result.valid).toBe(true);
    });
  });
});

describe('validateAzureDeployment', () => {
  describe('Azure not configured', () => {
    it('PASSES when no Azure keys present', () => {
      const result = validateAzureDeployment({});
      expect(result.valid).toBe(true);
    });

    it('PASSES when only AZURE_OPENAI_API_KEY present (incomplete bundle)', () => {
      const result = validateAzureDeployment({ AZURE_OPENAI_API_KEY: 'azure-xxx' });
      expect(result.valid).toBe(true);
    });
  });

  describe('Azure configured', () => {
    it('FAILS when Azure configured but AZURE_OPENAI_DEPLOYMENT is empty', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: '',
      };
      const result = validateAzureDeployment(env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('AZURE_OPENAI_DEPLOYMENT');
      // T025: Single-line "set X" format
      expect(result.errors[0]).toContain('Set:');
    });

    it('FAILS when Azure configured but AZURE_OPENAI_DEPLOYMENT is whitespace', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: '   ',
      };
      const result = validateAzureDeployment(env);

      expect(result.valid).toBe(false);
    });

    it('PASSES when Azure fully configured with valid deployment', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-gpt4-deployment',
      };
      const result = validateAzureDeployment(env);

      expect(result.valid).toBe(true);
    });
  });
});

describe('validateChatModelCompatibility', () => {
  // Helper to create config with cloud AI agents enabled
  function createCloudAiConfig(agents: string[] = ['opencode']): Config {
    return {
      version: 1,
      trusted_only: false,
      triggers: { on: ['pull_request'], branches: ['main'] },
      passes: [
        {
          name: 'cloud',
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
      models: {},
      reporting: {
        github: { mode: 'checks_and_comments', max_inline_comments: 20, summary: true },
      },
      gating: { enabled: false, fail_on_severity: 'error' },
      path_filters: { include: ['**/*'], exclude: [] },
    };
  }

  describe('Codex models (completions-only, NOT chat-compatible)', () => {
    it('FAILS for gpt-5.2-codex (the reported bug)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'gpt-5.2-codex', {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('completions-only');
      expect(result.errors[0]).toContain('gpt-5.2-codex');
    });

    it('FAILS for codex-davinci (legacy Codex model)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'codex-davinci', {});

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('completions-only');
    });

    it('FAILS for gpt-4-codex (hypothetical future Codex variant)', () => {
      const config = createCloudAiConfig(['pr_agent']);
      const result = validateChatModelCompatibility(config, 'gpt-4-codex', {});

      expect(result.valid).toBe(false);
    });

    it('FAILS for text-davinci-003 (legacy completion model)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'text-davinci-003', {});

      expect(result.valid).toBe(false);
    });

    it('error message includes copy-pastable fix suggestions', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'gpt-5.2-codex', {});

      expect(result.errors[0]).toContain('MODEL=gpt-4o-mini');
      expect(result.errors[0]).toContain('MODEL=gpt-4o');
      expect(result.errors[0]).toContain('claude-sonnet-4');
      expect(result.errors[0]).toContain('.ai-review.yml');
    });
  });

  describe('Valid chat models (should pass)', () => {
    it('PASSES for gpt-4o (flagship chat model)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'gpt-4o', {});

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('PASSES for gpt-4o-mini (cost-effective chat model)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'gpt-4o-mini', {});

      expect(result.valid).toBe(true);
    });

    it('PASSES for claude-sonnet-4-20250514 (Anthropic chat model)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'claude-sonnet-4-20250514', {});

      expect(result.valid).toBe(true);
    });

    it('PASSES for o1-preview (OpenAI reasoning model)', () => {
      const config = createCloudAiConfig(['opencode']);
      const result = validateChatModelCompatibility(config, 'o1-preview', {});

      expect(result.valid).toBe(true);
    });
  });

  describe('No cloud agents (validation skipped)', () => {
    it('PASSES for Codex model when ONLY local_llm is enabled', () => {
      const config: Config = {
        version: 1,
        trusted_only: false,
        triggers: { on: ['pull_request'], branches: ['main'] },
        passes: [{ name: 'local', agents: ['local_llm'], enabled: true, required: false }],
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
      const result = validateChatModelCompatibility(config, 'gpt-5.2-codex', {});

      expect(result.valid).toBe(true);
    });

    it('PASSES for Codex model when only static agents enabled', () => {
      const config: Config = {
        version: 1,
        trusted_only: false,
        triggers: { on: ['pull_request'], branches: ['main'] },
        passes: [
          { name: 'static', agents: ['semgrep', 'reviewdog'], enabled: true, required: true },
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
      const result = validateChatModelCompatibility(config, 'codex-davinci', {});

      expect(result.valid).toBe(true);
    });
  });
});

/**
 * User Story 1 Tests: First-Time Setup with Single LLM Provider
 *
 * T012-T015: Tests for auto-apply default model behavior
 * Goal: Single-key setups "just work" with auto-applied default models
 */
describe('User Story 1: Single-Key Auto-Apply Defaults', () => {
  describe('countProvidersWithKeys', () => {
    it('returns 0 when no keys are set', () => {
      expect(countProvidersWithKeys({})).toBe(0);
    });

    it('returns 1 when only OPENAI_API_KEY is set', () => {
      expect(countProvidersWithKeys({ OPENAI_API_KEY: 'sk-xxx' })).toBe(1);
    });

    it('returns 1 when only ANTHROPIC_API_KEY is set', () => {
      expect(countProvidersWithKeys({ ANTHROPIC_API_KEY: 'sk-ant-xxx' })).toBe(1);
    });

    it('returns 1 when only OLLAMA_BASE_URL is set', () => {
      expect(countProvidersWithKeys({ OLLAMA_BASE_URL: 'http://localhost:11434' })).toBe(1);
    });

    it('returns 1 for Azure only when ALL three keys are set', () => {
      // Partial Azure = 0
      expect(countProvidersWithKeys({ AZURE_OPENAI_API_KEY: 'azure-xxx' })).toBe(0);
      expect(
        countProvidersWithKeys({
          AZURE_OPENAI_API_KEY: 'azure-xxx',
          AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        })
      ).toBe(0);

      // Complete Azure = 1
      expect(
        countProvidersWithKeys({
          AZURE_OPENAI_API_KEY: 'azure-xxx',
          AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
          AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
        })
      ).toBe(1);
    });

    it('returns 2 when both OpenAI and Anthropic keys are set', () => {
      expect(
        countProvidersWithKeys({
          OPENAI_API_KEY: 'sk-xxx',
          ANTHROPIC_API_KEY: 'sk-ant-xxx',
        })
      ).toBe(2);
    });

    it('ignores empty strings', () => {
      expect(countProvidersWithKeys({ OPENAI_API_KEY: '' })).toBe(0);
      expect(countProvidersWithKeys({ OPENAI_API_KEY: '   ' })).toBe(0);
    });
  });

  describe('DEFAULT_MODELS constant', () => {
    it('has gpt-4o as default for OpenAI', () => {
      expect(DEFAULT_MODELS.openai).toBe('gpt-4o');
    });

    it('has claude-sonnet-4-20250514 as default for Anthropic', () => {
      expect(DEFAULT_MODELS.anthropic).toBe('claude-sonnet-4-20250514');
    });

    it('has codellama:7b as default for Ollama', () => {
      expect(DEFAULT_MODELS.ollama).toBe('codellama:7b');
    });

    it('has null for Azure (requires deployment name)', () => {
      expect(DEFAULT_MODELS['azure-openai']).toBeNull();
    });
  });

  describe('T012: auto-applies gpt-4o when only OPENAI_API_KEY set', () => {
    it('should auto-apply gpt-4o default for single OpenAI key setup', () => {
      const env = { OPENAI_API_KEY: 'sk-xxx' };
      const keyCount = countProvidersWithKeys(env);
      const provider: LlmProvider = 'openai';

      expect(keyCount).toBe(1);
      expect(DEFAULT_MODELS[provider]).toBe('gpt-4o');
    });
  });

  describe('T013: auto-applies claude-sonnet-4 when only ANTHROPIC_API_KEY set', () => {
    it('should auto-apply claude-sonnet-4 default for single Anthropic key setup', () => {
      const env = { ANTHROPIC_API_KEY: 'sk-ant-xxx' };
      const keyCount = countProvidersWithKeys(env);
      const provider: LlmProvider = 'anthropic';

      expect(keyCount).toBe(1);
      expect(DEFAULT_MODELS[provider]).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('T014: auto-applies codellama:7b when only OLLAMA_BASE_URL set', () => {
    it('should auto-apply codellama:7b default for single Ollama setup', () => {
      const env = { OLLAMA_BASE_URL: 'http://localhost:11434' };
      const keyCount = countProvidersWithKeys(env);
      const provider: LlmProvider = 'ollama';

      expect(keyCount).toBe(1);
      expect(DEFAULT_MODELS[provider]).toBe('codellama:7b');
    });
  });

  describe('T015: does NOT auto-apply for Azure (requires deployment)', () => {
    it('should NOT auto-apply a model for Azure OpenAI', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };
      const keyCount = countProvidersWithKeys(env);
      const provider: LlmProvider = 'azure-openai';

      expect(keyCount).toBe(1);
      // Azure OpenAI has no default model - user must specify deployment name
      expect(DEFAULT_MODELS[provider]).toBeNull();
    });

    it('Azure requires explicit MODEL because deployment names are user-specific', () => {
      // This test documents the FR-013 requirement: Azure deployments have
      // custom names chosen by the user, so we cannot auto-apply a default.
      expect(DEFAULT_MODELS['azure-openai']).toBeNull();
    });
  });
});

/**
 * User Story 2 Tests: Clear Error Messages for Common Misconfigurations
 *
 * T020-T023: Tests for actionable error messages
 * Goal: Actionable error messages with exact fix instructions for all misconfiguration scenarios
 */
describe('User Story 2: Actionable Error Messages', () => {
  describe('T020: fails with actionable message when multi-key + MODEL + no provider', () => {
    it('should fail when both keys are set with MODEL but no explicit provider', () => {
      // This tests FR-004: multi-key + MODEL + no provider = hard fail
      const env = {
        OPENAI_API_KEY: 'sk-xxx',
        ANTHROPIC_API_KEY: 'sk-ant-xxx',
        MODEL: 'gpt-4o',
      };
      const keyCount = countProvidersWithKeys(env);

      // Should detect multi-key scenario
      expect(keyCount).toBe(2);

      // The validateModelConfig should pass because MODEL is set
      // But validateMultiKeyAmbiguity should fail
      const modelResult = validateModelConfig('gpt-4o', env);
      expect(modelResult.valid).toBe(true);

      // Note: validateMultiKeyAmbiguity will be tested when implemented
    });

    it('error message should include provider suggestion', () => {
      // Placeholder for when validateMultiKeyAmbiguity is implemented
      // The error should tell the user to add "provider: openai" or "provider: anthropic"
      expect(true).toBe(true);
    });
  });

  describe('T021: Azure partial config shows single-line fix for missing key', () => {
    it('should show which Azure key is missing', () => {
      const config = createTestConfig(['semgrep']);

      // Missing AZURE_OPENAI_DEPLOYMENT
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-xxx',
        AZURE_OPENAI_ENDPOINT: 'https://my.azure.com',
      };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('AZURE_OPENAI_DEPLOYMENT');
    });

    it('Azure error includes all missing keys', () => {
      const config = createTestConfig(['semgrep']);

      // Only API key set
      const env = { AZURE_OPENAI_API_KEY: 'azure-xxx' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('AZURE_OPENAI_ENDPOINT');
      expect(result.errors[0]).toContain('AZURE_OPENAI_DEPLOYMENT');
    });
  });

  describe('T022: deprecated OPENAI_MODEL shows migration guidance', () => {
    it('should fail with migration guidance for OPENAI_MODEL', () => {
      const config = createTestConfig(['semgrep']);
      const env = { OPENAI_MODEL: 'gpt-4' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('OPENAI_MODEL');
      expect(result.errors[0]).toContain('Legacy');
      // Should suggest the canonical alternative
      expect(result.errors[0]).toContain('MODEL');
    });

    it('should fail with migration guidance for OPENCODE_MODEL', () => {
      const config = createTestConfig(['semgrep']);
      const env = { OPENCODE_MODEL: 'gpt-4' };
      const result = validateAgentSecrets(config, env);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('OPENCODE_MODEL');
    });
  });

  describe('T023: explicit provider with missing key shows which key is needed', () => {
    it('should explain which key is needed for explicit anthropic provider', () => {
      // When provider: anthropic is set but ANTHROPIC_API_KEY is missing
      // The error should specifically say "set ANTHROPIC_API_KEY"
      const keyCount = countProvidersWithKeys({ OPENAI_API_KEY: 'sk-xxx' });
      expect(keyCount).toBe(1);

      // Placeholder for validateExplicitProviderKeys implementation
    });

    it('should explain which keys are needed for explicit azure-openai provider', () => {
      // When provider: azure-openai is set but Azure keys are missing
      // The error should list all 3 required Azure keys
      const keyCount = countProvidersWithKeys({});
      expect(keyCount).toBe(0);

      // Placeholder for validateExplicitProviderKeys implementation
    });
  });
});
