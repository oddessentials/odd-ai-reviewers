/**
 * Zero-Config Defaults Tests
 *
 * Tests for provider detection and zero-config generation.
 * Covers T077 (provider detection - 5 cases) and T078 (config generation - 3 cases).
 *
 * @module tests/unit/config/zero-config
 */

import { describe, it, expect } from 'vitest';
import {
  detectProvider,
  detectProviderWithDetails,
  generateZeroConfigDefaults,
  isZeroConfigSuccess,
  formatZeroConfigMessage,
  getZeroConfigDescription,
  ZERO_CONFIG_LIMITS,
  ZERO_CONFIG_PASS_NAME,
  type ZeroConfigResult,
  type NoCredentialsResult,
} from '../../../src/config/zero-config.js';

// =============================================================================
// T077: Provider Detection Tests (5 cases)
// =============================================================================

describe('detectProvider', () => {
  describe('T077.1: Anthropic detection', () => {
    it('should detect anthropic when ANTHROPIC_API_KEY is set', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-test-key',
      };

      expect(detectProvider(env)).toBe('anthropic');
    });

    it('should ignore empty or whitespace-only ANTHROPIC_API_KEY', () => {
      const envEmpty = { ANTHROPIC_API_KEY: '' };
      const envWhitespace = { ANTHROPIC_API_KEY: '   ' };

      expect(detectProvider(envEmpty)).toBeNull();
      expect(detectProvider(envWhitespace)).toBeNull();
    });
  });

  describe('T077.2: OpenAI detection', () => {
    it('should detect openai when OPENAI_API_KEY is set', () => {
      const env = {
        OPENAI_API_KEY: 'sk-test-key',
      };

      expect(detectProvider(env)).toBe('openai');
    });

    it('should ignore empty or whitespace-only OPENAI_API_KEY', () => {
      const envEmpty = { OPENAI_API_KEY: '' };
      const envWhitespace = { OPENAI_API_KEY: '   ' };

      expect(detectProvider(envEmpty)).toBeNull();
      expect(detectProvider(envWhitespace)).toBeNull();
    });
  });

  describe('T077.3: Azure OpenAI detection', () => {
    it('should detect azure-openai when all three env vars are set', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_ENDPOINT: 'https://myresource.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };

      expect(detectProvider(env)).toBe('azure-openai');
    });

    it('should not detect azure-openai when only API key is set', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-key',
      };

      expect(detectProvider(env)).toBeNull();
    });

    it('should not detect azure-openai when endpoint is missing', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };

      expect(detectProvider(env)).toBeNull();
    });

    it('should not detect azure-openai when deployment is missing', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_ENDPOINT: 'https://myresource.openai.azure.com',
      };

      expect(detectProvider(env)).toBeNull();
    });
  });

  describe('T077.4: Ollama detection', () => {
    it('should detect ollama when OLLAMA_BASE_URL is set', () => {
      const env = {
        OLLAMA_BASE_URL: 'http://localhost:11434',
      };

      expect(detectProvider(env)).toBe('ollama');
    });

    it('should detect ollama when OLLAMA_HOST is set', () => {
      const env = {
        OLLAMA_HOST: 'http://localhost:11434',
      };

      expect(detectProvider(env)).toBe('ollama');
    });

    it('should prefer OLLAMA_BASE_URL over OLLAMA_HOST', () => {
      const env = {
        OLLAMA_BASE_URL: 'http://localhost:11434',
        OLLAMA_HOST: 'http://other:11434',
      };

      const result = detectProviderWithDetails(env);
      expect(result.provider).toBe('ollama');
      expect(result.keySource).toBe('OLLAMA_BASE_URL');
    });
  });

  describe('T077.5: Provider priority order', () => {
    it('should return null when no credentials are found', () => {
      const env = {};
      expect(detectProvider(env)).toBeNull();
    });

    it('should prioritize anthropic over openai', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        OPENAI_API_KEY: 'sk-openai-key',
      };

      const result = detectProviderWithDetails(env);
      expect(result.provider).toBe('anthropic');
      expect(result.keySource).toBe('ANTHROPIC_API_KEY');
      expect(result.ignoredProviders).toHaveLength(1);
      expect(result.ignoredProviders[0]).toEqual({
        provider: 'openai',
        keySource: 'OPENAI_API_KEY',
      });
    });

    it('should prioritize anthropic over azure-openai', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_ENDPOINT: 'https://myresource.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };

      const result = detectProviderWithDetails(env);
      expect(result.provider).toBe('anthropic');
      expect(result.ignoredProviders).toContainEqual({
        provider: 'azure-openai',
        keySource: 'AZURE_OPENAI_API_KEY',
      });
    });

    it('should prioritize openai over azure-openai', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai-key',
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_ENDPOINT: 'https://myresource.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };

      const result = detectProviderWithDetails(env);
      expect(result.provider).toBe('openai');
    });

    it('should prioritize openai over ollama', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai-key',
        OLLAMA_BASE_URL: 'http://localhost:11434',
      };

      const result = detectProviderWithDetails(env);
      expect(result.provider).toBe('openai');
      expect(result.ignoredProviders).toContainEqual({
        provider: 'ollama',
        keySource: 'OLLAMA_BASE_URL',
      });
    });

    it('should detect all four providers and track ignored ones', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
        OPENAI_API_KEY: 'sk-openai-key',
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_ENDPOINT: 'https://myresource.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
        OLLAMA_BASE_URL: 'http://localhost:11434',
      };

      const result = detectProviderWithDetails(env);
      expect(result.provider).toBe('anthropic');
      expect(result.keySource).toBe('ANTHROPIC_API_KEY');
      expect(result.ignoredProviders).toHaveLength(3);
    });
  });
});

// =============================================================================
// T078: Config Generation Tests (3 cases)
// =============================================================================

describe('generateZeroConfigDefaults', () => {
  describe('T078.1: Successful config generation for each provider', () => {
    it('should generate config with opencode agent for anthropic', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
      };

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(true);

      const success = result as ZeroConfigResult;
      expect(success.config.provider).toBe('anthropic');
      expect(success.config.passes).toHaveLength(1);
      expect(success.config.passes[0]?.name).toBe(ZERO_CONFIG_PASS_NAME);
      expect(success.config.passes[0]?.agents).toContain('opencode');
      expect(success.config.models.default).toBe('claude-sonnet-4-20250514');
    });

    it('should generate config with opencode agent for openai', () => {
      const env = {
        OPENAI_API_KEY: 'sk-openai-key',
      };

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(true);

      const success = result as ZeroConfigResult;
      expect(success.config.provider).toBe('openai');
      expect(success.config.passes[0]?.agents).toContain('opencode');
      expect(success.config.models.default).toBe('gpt-4o');
    });

    it('should generate config with pr_agent for azure-openai (opencode does not support Azure)', () => {
      const env = {
        AZURE_OPENAI_API_KEY: 'azure-key',
        AZURE_OPENAI_ENDPOINT: 'https://myresource.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'my-deployment',
      };

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(true);

      const success = result as ZeroConfigResult;
      expect(success.config.provider).toBe('azure-openai');
      expect(success.config.passes[0]?.agents).toContain('pr_agent');
      // Azure uses deployment name, not model default - models.default is undefined
      expect(success.config.models.default).toBeUndefined();
    });

    it('should generate config with local_llm agent for ollama', () => {
      const env = {
        OLLAMA_BASE_URL: 'http://localhost:11434',
      };

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(true);

      const success = result as ZeroConfigResult;
      expect(success.config.provider).toBe('ollama');
      expect(success.config.passes[0]?.agents).toContain('local_llm');
      expect(success.config.models.default).toBe('llama3.2');
    });
  });

  describe('T078.2: Conservative limits', () => {
    it('should apply conservative budget limits', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
      };

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(true);

      const success = result as ZeroConfigResult;
      expect(success.config.limits.max_usd_per_pr).toBe(ZERO_CONFIG_LIMITS.max_usd_per_pr);
      expect(success.config.limits.max_usd_per_pr).toBe(0.1); // $0.10 budget
    });

    it('should apply conservative token limits', () => {
      const env = {
        ANTHROPIC_API_KEY: 'sk-ant-key',
      };

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(true);

      const success = result as ZeroConfigResult;
      expect(success.config.limits.max_tokens_per_pr).toBe(ZERO_CONFIG_LIMITS.max_tokens_per_pr);
      expect(success.config.limits.monthly_budget_usd).toBe(ZERO_CONFIG_LIMITS.monthly_budget_usd);
    });
  });

  describe('T078.3: Error handling when no credentials', () => {
    it('should return error result when no credentials are found', () => {
      const env = {};

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(false);

      const error = result as NoCredentialsResult;
      expect(error.config).toBeNull();
      expect(error.isZeroConfig).toBe(true);
      expect(error.error).toContain('No API credentials');
      expect(error.guidance).toBeInstanceOf(Array);
      expect(error.guidance.length).toBeGreaterThan(0);
    });

    it('should provide helpful guidance in error result', () => {
      const env = {};

      const result = generateZeroConfigDefaults(env);
      expect(isZeroConfigSuccess(result)).toBe(false);

      const error = result as NoCredentialsResult;
      expect(error.guidance.some((g) => g.includes('ANTHROPIC_API_KEY'))).toBe(true);
      expect(error.guidance.some((g) => g.includes('OPENAI_API_KEY'))).toBe(true);
      expect(error.guidance.some((g) => g.includes('AZURE_OPENAI'))).toBe(true);
      expect(error.guidance.some((g) => g.includes('OLLAMA'))).toBe(true);
    });
  });

  describe('T078.4: Agent-provider capability assertion', () => {
    it('should return an agent that supports the provider', () => {
      // Agent capability matrix - documents which agents support which providers
      // This test prevents regressions where we assign an incompatible agent
      const providerAgentCapabilities: Record<string, string[]> = {
        anthropic: ['opencode', 'pr_agent', 'ai_semantic_review'],
        openai: ['opencode', 'pr_agent', 'ai_semantic_review'],
        'azure-openai': ['pr_agent', 'ai_semantic_review'], // opencode does NOT support azure
        ollama: ['local_llm'],
      };

      // Test each provider gets a compatible agent
      for (const [provider, capableAgents] of Object.entries(providerAgentCapabilities)) {
        const env = createEnvForProvider(provider);
        const result = generateZeroConfigDefaults(env);

        expect(isZeroConfigSuccess(result)).toBe(true);
        const success = result as ZeroConfigResult;
        const assignedAgent = success.config.passes[0]?.agents[0];

        expect(
          capableAgents.includes(assignedAgent ?? ''),
          `Provider '${provider}' assigned agent '${assignedAgent}' but only ${capableAgents.join(', ')} support it`
        ).toBe(true);
      }
    });
  });
});

/**
 * Helper to create environment variables for a given provider
 */
function createEnvForProvider(provider: string): Record<string, string> {
  switch (provider) {
    case 'anthropic':
      return { ANTHROPIC_API_KEY: 'test-key' };
    case 'openai':
      return { OPENAI_API_KEY: 'test-key' };
    case 'azure-openai':
      return {
        AZURE_OPENAI_API_KEY: 'test-key',
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        AZURE_OPENAI_DEPLOYMENT: 'test-deployment',
      };
    case 'ollama':
      return { OLLAMA_BASE_URL: 'http://localhost:11434' };
    default:
      return {};
  }
}

// =============================================================================
// Additional Utility Tests
// =============================================================================

describe('formatZeroConfigMessage', () => {
  it('should format a basic message', () => {
    const result: ZeroConfigResult = {
      config: {} as ZeroConfigResult['config'],
      isZeroConfig: true,
      provider: 'anthropic',
      keySource: 'ANTHROPIC_API_KEY',
      ignoredProviders: [],
    };

    const lines = formatZeroConfigMessage(result);
    expect(lines[0]).toContain('anthropic');
    expect(lines[0]).toContain('ANTHROPIC_API_KEY');
  });

  it('should include note about ignored providers', () => {
    const result: ZeroConfigResult = {
      config: {} as ZeroConfigResult['config'],
      isZeroConfig: true,
      provider: 'anthropic',
      keySource: 'ANTHROPIC_API_KEY',
      ignoredProviders: [{ provider: 'openai', keySource: 'OPENAI_API_KEY' }],
    };

    const lines = formatZeroConfigMessage(result);
    expect(lines.some((l) => l.includes('OPENAI_API_KEY'))).toBe(true);
    expect(lines.some((l) => l.includes('ignored'))).toBe(true);
  });
});

describe('getZeroConfigDescription', () => {
  it('should return formatted description for each provider', () => {
    expect(getZeroConfigDescription('anthropic')).toBe('zero-config (anthropic)');
    expect(getZeroConfigDescription('openai')).toBe('zero-config (openai)');
    expect(getZeroConfigDescription('azure-openai')).toBe('zero-config (azure-openai)');
    expect(getZeroConfigDescription('ollama')).toBe('zero-config (ollama)');
  });
});

describe('ZERO_CONFIG_LIMITS constants', () => {
  it('should have expected budget values', () => {
    expect(ZERO_CONFIG_LIMITS.max_usd_per_pr).toBe(0.1);
    expect(ZERO_CONFIG_LIMITS.monthly_budget_usd).toBe(10);
  });

  it('should have expected file and line limits', () => {
    expect(ZERO_CONFIG_LIMITS.max_files).toBe(50);
    expect(ZERO_CONFIG_LIMITS.max_diff_lines).toBe(2000);
  });
});
