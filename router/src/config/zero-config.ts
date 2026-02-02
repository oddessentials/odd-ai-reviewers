/**
 * Zero-Config Defaults Module
 *
 * Provides sensible defaults when no .ai-review.yml configuration file exists.
 * Enables "first review in 60 seconds" developer experience without manual config.
 *
 * Auto-Detection Priority (from data-model.md):
 * 1. ANTHROPIC_API_KEY → provider: 'anthropic'
 * 2. OPENAI_API_KEY → provider: 'openai'
 * 3. AZURE_OPENAI_* set → provider: 'azure-openai'
 * 4. OLLAMA_* set → provider: 'ollama'
 * 5. Otherwise → null (no credentials)
 *
 * @module config/zero-config
 */

import type { Config, Pass, Limits } from './schemas.js';
import type { LlmProvider } from './providers.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Default limits for zero-config mode (conservative by design)
 * From data-model.md: 10 findings, $0.10 budget
 */
export const ZERO_CONFIG_LIMITS: Limits = {
  max_files: 50,
  max_diff_lines: 2000,
  max_tokens_per_pr: 4000, // Conservative for zero-config
  max_usd_per_pr: 0.1, // $0.10 budget (from spec)
  monthly_budget_usd: 10, // Conservative monthly budget
};

/**
 * Zero-config pass name
 */
export const ZERO_CONFIG_PASS_NAME = 'ai-review';

// =============================================================================
// Provider Detection
// =============================================================================

/**
 * Provider detection result with priority information
 */
export interface ProviderDetectionResult {
  /** Detected provider or null if none found */
  provider: LlmProvider | null;
  /** Environment variable that was used for detection */
  keySource: string | null;
  /** Other providers that were found but ignored due to priority */
  ignoredProviders: { provider: LlmProvider; keySource: string }[];
}

/**
 * Check if Azure OpenAI is fully configured (requires all three values)
 */
function hasAzureOpenAI(env: Record<string, string | undefined>): boolean {
  return !!(
    env['AZURE_OPENAI_API_KEY']?.trim() &&
    env['AZURE_OPENAI_ENDPOINT']?.trim() &&
    env['AZURE_OPENAI_DEPLOYMENT']?.trim()
  );
}

/**
 * Check if Ollama is configured
 */
function hasOllama(env: Record<string, string | undefined>): boolean {
  return !!(env['OLLAMA_BASE_URL']?.trim() || env['OLLAMA_HOST']?.trim());
}

/**
 * Detect LLM provider from environment variables.
 *
 * Priority order (highest to lowest):
 * 1. Anthropic (ANTHROPIC_API_KEY)
 * 2. OpenAI (OPENAI_API_KEY)
 * 3. Azure OpenAI (AZURE_OPENAI_API_KEY + ENDPOINT + DEPLOYMENT)
 * 4. Ollama (OLLAMA_BASE_URL or OLLAMA_HOST)
 *
 * @param env - Environment variables to check
 * @returns Detected provider or null if no credentials found
 */
export function detectProvider(env: Record<string, string | undefined>): LlmProvider | null {
  const result = detectProviderWithDetails(env);
  return result.provider;
}

/**
 * Detect LLM provider with detailed information about detection results.
 * Use this when you need to show users which providers were detected.
 *
 * @param env - Environment variables to check
 * @returns Detection result with provider, key source, and ignored providers
 */
export function detectProviderWithDetails(
  env: Record<string, string | undefined>
): ProviderDetectionResult {
  const foundProviders: { provider: LlmProvider; keySource: string }[] = [];

  // Check each provider in priority order
  if (env['ANTHROPIC_API_KEY']?.trim()) {
    foundProviders.push({ provider: 'anthropic', keySource: 'ANTHROPIC_API_KEY' });
  }

  if (env['OPENAI_API_KEY']?.trim()) {
    foundProviders.push({ provider: 'openai', keySource: 'OPENAI_API_KEY' });
  }

  if (hasAzureOpenAI(env)) {
    foundProviders.push({ provider: 'azure-openai', keySource: 'AZURE_OPENAI_API_KEY' });
  }

  if (hasOllama(env)) {
    const keySource = env['OLLAMA_BASE_URL']?.trim() ? 'OLLAMA_BASE_URL' : 'OLLAMA_HOST';
    foundProviders.push({ provider: 'ollama', keySource });
  }

  if (foundProviders.length === 0) {
    return {
      provider: null,
      keySource: null,
      ignoredProviders: [],
    };
  }

  // First provider wins (highest priority)
  // Safe: we already returned early if foundProviders.length === 0
  const [selected, ...ignored] = foundProviders;

  // TypeScript needs this check even though we know selected exists
  if (!selected) {
    return {
      provider: null,
      keySource: null,
      ignoredProviders: [],
    };
  }

  return {
    provider: selected.provider,
    keySource: selected.keySource,
    ignoredProviders: ignored,
  };
}

// =============================================================================
// Zero-Config Generation
// =============================================================================

/**
 * Zero-config generation result
 */
export interface ZeroConfigResult {
  /** Generated configuration */
  config: Config;
  /** Whether this is zero-config mode */
  isZeroConfig: true;
  /** Detected provider */
  provider: LlmProvider;
  /** Provider key source for logging */
  keySource: string;
  /** Providers that were ignored due to priority */
  ignoredProviders: { provider: LlmProvider; keySource: string }[];
}

/**
 * Error result when no provider is detected
 */
export interface NoCredentialsResult {
  /** No configuration available */
  config: null;
  /** Indicates zero-config mode was attempted */
  isZeroConfig: true;
  /** Error message for the user */
  error: string;
  /** Guidance for the user */
  guidance: string[];
}

/**
 * Union type for zero-config generation result
 */
export type GenerateZeroConfigResult = ZeroConfigResult | NoCredentialsResult;

/**
 * Check if result is a successful zero-config result
 */
export function isZeroConfigSuccess(result: GenerateZeroConfigResult): result is ZeroConfigResult {
  return result.config !== null;
}

/**
 * Get the default AI agent for a provider
 */
function getDefaultAgentForProvider(provider: LlmProvider): 'opencode' | 'local_llm' {
  // Ollama uses local_llm agent
  if (provider === 'ollama') {
    return 'local_llm';
  }
  // Cloud providers use opencode agent
  return 'opencode';
}

/**
 * Get the default model for a provider
 */
function getDefaultModelForProvider(provider: LlmProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514';
    case 'openai':
      return 'gpt-4o';
    case 'azure-openai':
      // For Azure, model is specified via deployment
      return '';
    case 'ollama':
      return 'llama3.2';
    default:
      return '';
  }
}

/**
 * Generate zero-config defaults when no .ai-review.yml exists.
 *
 * Behavior:
 * - Detects API provider from environment variables
 * - Creates minimal config with single AI review pass
 * - Applies conservative limits ($0.10 budget, 10 findings)
 * - Returns error guidance if no credentials found
 *
 * @param env - Environment variables to check
 * @returns Zero-config result or error result
 */
export function generateZeroConfigDefaults(
  env: Record<string, string | undefined>
): GenerateZeroConfigResult {
  const detection = detectProviderWithDetails(env);

  if (!detection.provider || !detection.keySource) {
    return {
      config: null,
      isZeroConfig: true,
      error: 'No API credentials found in environment',
      guidance: [
        'Set one of the following environment variables:',
        '  - ANTHROPIC_API_KEY (recommended)',
        '  - OPENAI_API_KEY',
        '  - AZURE_OPENAI_API_KEY + AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_DEPLOYMENT',
        '  - OLLAMA_BASE_URL or OLLAMA_HOST (for local models)',
        '',
        'Or create .ai-review.yml in your repository root.',
        'See: https://github.com/oddessentials/odd-ai-reviewers#configuration',
      ],
    };
  }

  const agent = getDefaultAgentForProvider(detection.provider);
  const defaultModel = getDefaultModelForProvider(detection.provider);

  // Create single AI pass with detected provider's default agent
  const aiPass: Pass = {
    name: ZERO_CONFIG_PASS_NAME,
    agents: [agent],
    enabled: true,
    required: false, // Zero-config passes are not required (graceful degradation)
  };

  const config: Config = {
    version: 1,
    trusted_only: true,
    triggers: {
      on: ['pull_request'],
      branches: ['main'],
    },
    passes: [aiPass],
    limits: ZERO_CONFIG_LIMITS,
    models: defaultModel ? { default: defaultModel } : {},
    reporting: {},
    gating: {
      enabled: false,
      fail_on_severity: 'error',
    },
    provider: detection.provider,
  };

  return {
    config,
    isZeroConfig: true,
    provider: detection.provider,
    keySource: detection.keySource,
    ignoredProviders: detection.ignoredProviders,
  };
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format a user-friendly message about zero-config mode activation.
 * Used by terminal reporter to show config source.
 *
 * @param result - Zero-config generation result
 * @returns Formatted message lines
 */
export function formatZeroConfigMessage(result: ZeroConfigResult): string[] {
  const lines: string[] = [];

  lines.push(`Using ${result.provider} (${result.keySource} found)`);

  if (result.ignoredProviders.length > 0) {
    for (const ignored of result.ignoredProviders) {
      lines.push(`Note: ${ignored.keySource} also set but ignored due to priority order`);
    }
  }

  lines.push('');
  lines.push('To customize, create .ai-review.yml in your repository root.');

  return lines;
}

/**
 * Get a short description of zero-config mode for terminal output
 */
export function getZeroConfigDescription(provider: LlmProvider): string {
  return `zero-config (${provider})`;
}
