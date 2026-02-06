/**
 * Preflight Validation Module
 *
 * Validates that required secrets are configured for enabled agents.
 * Fails fast with clear error messages before any agent execution.
 *
 * INVARIANTS ENFORCED:
 * - Legacy keys cause hard failure (no backwards compatibility)
 * - Azure OpenAI keys validated as atomic bundle
 * - Model must be compatible with resolved provider (no 404s)
 * - Provider isolation: Anthropic key + GPT model = error, OpenAI key + Claude model = error
 *
 * NOTE: This module uses a collect-all-errors pattern (PreflightResult.errors: string[])
 * rather than fail-fast throwing. The string messages are intentionally human-readable
 * and actionable. ConfigError/ValidationError types are available for cases where
 * structured error handling is needed.
 */

import type { Config, AgentId } from './config.js';
import {
  inferProviderFromModel,
  isCodexFamilyModel,
  isCompletionsOnlyModel,
  resolveProvider,
  type LlmProvider,
  type ResolvedConfigTuple,
} from './config.js';
// Note: ConfigError, ValidationError types are available from './types/errors.js'
// but this module uses string-based error collection by design (see module docs)

/**
 * Maps providers to their required environment variables.
 * Used for multi-key detection and key source logging.
 */
export const PROVIDER_KEY_MAPPING: Record<LlmProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  'azure-openai': ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT'],
  ollama: ['OLLAMA_BASE_URL'], // Optional, has default
};

/**
 * Default models for each provider.
 * Auto-applied for single-key setups when MODEL is not configured.
 *
 * INVARIANT: Azure OpenAI has no default (deployment names are user-specific per FR-013).
 */
export const DEFAULT_MODELS: Record<LlmProvider, string | null> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  'azure-openai': null, // User must specify deployment name (no auto-apply)
  ollama: 'codellama:7b',
};

/**
 * Count how many providers have valid API keys configured.
 * Used for multi-key ambiguity detection (FR-004).
 *
 * INVARIANT: Azure counts as one provider only when ALL three keys are present.
 * INVARIANT: Ollama counts if OLLAMA_BASE_URL is set (optional, has default).
 *
 * @param env - Environment variables to check
 * @returns Number of providers with valid keys (0-4)
 */
export function countProvidersWithKeys(env: Record<string, string | undefined>): number {
  let count = 0;

  // Anthropic: single key
  if (env['ANTHROPIC_API_KEY'] && env['ANTHROPIC_API_KEY'].trim() !== '') {
    count++;
  }

  // OpenAI: single key
  if (env['OPENAI_API_KEY'] && env['OPENAI_API_KEY'].trim() !== '') {
    count++;
  }

  // Azure OpenAI: requires all three keys as atomic bundle
  const hasAzure =
    env['AZURE_OPENAI_API_KEY'] &&
    env['AZURE_OPENAI_API_KEY'].trim() !== '' &&
    env['AZURE_OPENAI_ENDPOINT'] &&
    env['AZURE_OPENAI_ENDPOINT'].trim() !== '' &&
    env['AZURE_OPENAI_DEPLOYMENT'] &&
    env['AZURE_OPENAI_DEPLOYMENT'].trim() !== '';
  if (hasAzure) {
    count++;
  }

  // Ollama: base URL (optional, has default - but explicit setting counts)
  if (env['OLLAMA_BASE_URL'] && env['OLLAMA_BASE_URL'].trim() !== '') {
    count++;
  }

  return count;
}

export interface PreflightResult {
  valid: boolean;
  errors: string[];
  /** Resolved config tuple when valid, undefined when invalid */
  resolved?: ResolvedConfigTuple;
}

/**
 * Detect the single provider when exactly one provider has keys configured.
 * Used for auto-apply default model behavior.
 *
 * @param env - Environment variables to check
 * @returns The single provider, or null if 0 or 2+ providers have keys
 */
export function detectSingleProvider(env: Record<string, string | undefined>): LlmProvider | null {
  const hasAnthropic = env['ANTHROPIC_API_KEY'] && env['ANTHROPIC_API_KEY'].trim() !== '';
  const hasOpenAI = env['OPENAI_API_KEY'] && env['OPENAI_API_KEY'].trim() !== '';
  const hasAzure =
    env['AZURE_OPENAI_API_KEY'] &&
    env['AZURE_OPENAI_API_KEY'].trim() !== '' &&
    env['AZURE_OPENAI_ENDPOINT'] &&
    env['AZURE_OPENAI_ENDPOINT'].trim() !== '' &&
    env['AZURE_OPENAI_DEPLOYMENT'] &&
    env['AZURE_OPENAI_DEPLOYMENT'].trim() !== '';
  const hasOllama = env['OLLAMA_BASE_URL'] && env['OLLAMA_BASE_URL'].trim() !== '';

  const providers: LlmProvider[] = [];
  if (hasAnthropic) providers.push('anthropic');
  if (hasOpenAI) providers.push('openai');
  if (hasAzure) providers.push('azure-openai');
  if (hasOllama) providers.push('ollama');

  if (providers.length === 1) {
    const provider = providers[0];
    return provider !== undefined ? provider : null;
  }
  return null;
}

/**
 * Resolve effective model with auto-apply defaults for single-key setups (FR-001).
 *
 * PRECEDENCE:
 * 1. MODEL env var (explicit user override)
 * 2. config.models.default (repo-level setting)
 * 3. Auto-apply DEFAULT_MODELS[provider] for single-key setups
 *
 * INVARIANT: Azure OpenAI has no default (deployment names are user-specific).
 * INVARIANT: Multi-key setups DO NOT auto-apply (requires explicit config).
 *
 * @param config - Loaded configuration
 * @param env - Environment variables
 * @returns Object with model and whether it was auto-applied
 */
export function resolveEffectiveModelWithDefaults(
  config: Config,
  env: Record<string, string | undefined>
): { model: string; autoApplied: boolean; provider: LlmProvider | null } {
  // 1. MODEL env var takes precedence (explicit user override)
  const envModel = env['MODEL'];
  if (envModel && envModel.trim() !== '') {
    return { model: envModel, autoApplied: false, provider: null };
  }

  // 2. Config default (repo-level setting)
  if (config.models.default && config.models.default.trim() !== '') {
    return { model: config.models.default, autoApplied: false, provider: null };
  }

  // 3. Auto-apply default for single-key setups
  const keyCount = countProvidersWithKeys(env);
  if (keyCount === 1) {
    const provider = detectSingleProvider(env);
    if (provider) {
      const defaultModel = DEFAULT_MODELS[provider];
      if (defaultModel) {
        // Auto-apply the default model for this provider
        return { model: defaultModel, autoApplied: true, provider };
      }
      // Azure has no default (null) - fall through to fail
    }
  }

  // No model configured and cannot auto-apply
  return { model: '', autoApplied: false, provider: null };
}

/**
 * Legacy keys that are no longer supported.
 * Presence of any of these causes hard failure.
 */
const LEGACY_KEYS = [
  'PR_AGENT_API_KEY',
  'AI_SEMANTIC_REVIEW_API_KEY',
  'OPENCODE_MODEL',
  'OPENAI_MODEL',
];

/**
 * Azure OpenAI keys that must be present as a complete set.
 */
const AZURE_OPENAI_KEYS = [
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_DEPLOYMENT',
];

/**
 * Agent secret requirements mapping.
 * Key: agent ID
 * Value: { required: secrets that MUST be present, oneOf: at least ONE must be present }
 */
const AGENT_SECRET_REQUIREMENTS: Record<string, { oneOf?: string[]; required?: string[] }> = {
  opencode: {
    // OpenCode needs at least one LLM provider key
    oneOf: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
  },
  pr_agent: {
    // PR-Agent requires OpenAI, Azure OpenAI, or Anthropic
    oneOf: ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
  },
  ai_semantic_review: {
    // Requires OpenAI, Azure OpenAI, or Anthropic
    oneOf: ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
  },
  local_llm: {
    // local_llm uses OLLAMA_BASE_URL but it's a URL, not a secret
    // Validation for Ollama connectivity happens at runtime
  },
  semgrep: {
    // No secrets required
  },
  reviewdog: {
    // No secrets required
  },
};

/**
 * Validate that all required secrets are present for enabled agents.
 * Call this after config load and before agent execution.
 *
 * @param config - Loaded configuration with enabled passes
 * @param env - Environment variables to check for secrets
 * @returns Validation result with detailed error messages
 */
export function validateAgentSecrets(
  config: Config,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  // HARD FAIL: Reject legacy keys with specific migration guidance (T027)
  for (const key of LEGACY_KEYS) {
    if (env[key] !== undefined && env[key] !== '') {
      let migrationExample = '';
      if (key === 'OPENAI_MODEL' || key === 'OPENCODE_MODEL') {
        migrationExample =
          '\n\nMigration:\n' +
          `  Remove: ${key}=${env[key]}\n` +
          `  Add: MODEL=${env[key]}\n\n` +
          'Or in .ai-review.yml:\n' +
          '  models:\n' +
          `    default: ${env[key]}`;
      } else if (key === 'PR_AGENT_API_KEY' || key === 'AI_SEMANTIC_REVIEW_API_KEY') {
        migrationExample =
          '\n\nMigration:\n' +
          `  Remove: ${key}\n` +
          '  Use canonical keys instead:\n' +
          '    OPENAI_API_KEY=sk-xxx     # For OpenAI\n' +
          '    ANTHROPIC_API_KEY=sk-xxx  # For Anthropic';
      }
      errors.push(
        `Legacy environment variable '${key}' detected. ` +
          `This key is no longer supported. Use canonical keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, or MODEL.` +
          migrationExample
      );
    }
  }

  // HARD FAIL: Azure OpenAI keys must be a complete bundle
  const azureKeysPresent = AZURE_OPENAI_KEYS.filter(
    (key) => env[key] !== undefined && env[key] !== ''
  );
  if (azureKeysPresent.length > 0 && azureKeysPresent.length < AZURE_OPENAI_KEYS.length) {
    const missing = AZURE_OPENAI_KEYS.filter((key) => !azureKeysPresent.includes(key));
    errors.push(
      `Azure OpenAI configuration is incomplete. When using Azure OpenAI, all keys are required: ` +
        `${AZURE_OPENAI_KEYS.join(', ')}. Missing: ${missing.join(', ')}`
    );
  }

  // Collect all enabled agents across all enabled passes
  const enabledAgents = new Set<AgentId>();
  for (const pass of config.passes) {
    if (!pass.enabled) continue;
    for (const agentId of pass.agents) {
      enabledAgents.add(agentId);
    }
  }

  // Check each enabled agent's requirements
  for (const agentId of enabledAgents) {
    const requirements = AGENT_SECRET_REQUIREMENTS[agentId];
    if (!requirements) continue;

    // Check "oneOf" requirements (at least one must be present)
    if (requirements.oneOf) {
      const hasAny = requirements.oneOf.some((key) => env[key] !== undefined && env[key] !== '');
      if (!hasAny) {
        errors.push(
          `Agent '${agentId}' is enabled but missing required API key. ` +
            `Set one of: ${requirements.oneOf.join(', ')}`
        );
      }
    }

    // Check "required" requirements (all must be present)
    if (requirements.required) {
      const missing = requirements.required.filter(
        (key) => env[key] === undefined || env[key] === ''
      );
      if (missing.length > 0) {
        errors.push(
          `Agent '${agentId}' is enabled but missing required secret(s): ${missing.join(', ')}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate model configuration.
 * Fails if effectiveModel is empty (no MODEL env var, no config.models.default,
 * and auto-apply couldn't be used).
 *
 * INVARIANT: Router owns model resolution.
 * INVARIANT: Single-key setups can auto-apply default models (FR-001).
 * INVARIANT: Azure OpenAI requires explicit MODEL (no auto-apply).
 * INVARIANT: Multi-key setups require explicit MODEL or config.models.default.
 */
export function validateModelConfig(
  effectiveModel: string,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  if (!effectiveModel || effectiveModel.trim() === '') {
    const hasModelEnv = env['MODEL'] && env['MODEL'].trim() !== '';
    if (!hasModelEnv) {
      const keyCount = countProvidersWithKeys(env);
      const singleProvider = detectSingleProvider(env);

      if (keyCount === 0) {
        errors.push(
          'No model configured and no API keys found. ' +
            'Set an API key (e.g., OPENAI_API_KEY) and the model will be auto-applied, ' +
            'or set MODEL explicitly.'
        );
      } else if (keyCount === 1 && singleProvider === 'azure-openai') {
        // Azure requires explicit model - no auto-apply
        errors.push(
          'Azure OpenAI requires an explicit MODEL. ' +
            'Set MODEL to your deployment name (e.g., MODEL=my-gpt4-deployment).'
        );
      } else if (keyCount > 1) {
        // Multi-key - ambiguous, need explicit model
        errors.push(
          'Multiple API keys detected but no MODEL configured. ' +
            'Set MODEL explicitly or configure models.default in .ai-review.yml.'
        );
      } else {
        // Single key but auto-apply didn't work (shouldn't happen normally)
        errors.push(
          'No model configured. Set the MODEL environment variable or configure models.default in .ai-review.yml'
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Agents that use MODEL for cloud LLM providers (OpenAI/Anthropic).
 * local_llm uses OLLAMA_MODEL instead, so it's excluded from model-provider validation.
 */
const CLOUD_AI_AGENTS: AgentId[] = ['opencode', 'pr_agent', 'ai_semantic_review'];

/**
 * Validate model-provider match based on model name heuristic.
 * Fails if model looks like it requires a specific provider but key is missing.
 *
 * ONLY validates when cloud AI agents (opencode, pr_agent, ai_semantic_review) are enabled.
 * local_llm uses OLLAMA_MODEL, not MODEL, so it's excluded.
 *
 * This is a heuristic, not a contract. Error messages are explicit about the inference.
 */
export function validateModelProviderMatch(
  config: Config,
  model: string,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  // Only validate if cloud AI agents are enabled
  const hasCloudAiAgent = config.passes.some(
    (pass) => pass.enabled && pass.agents.some((a) => CLOUD_AI_AGENTS.includes(a))
  );

  if (!hasCloudAiAgent) {
    // No cloud AI agents enabled, skip model-provider validation
    return { valid: true, errors: [] };
  }

  // INVARIANT: Ollama-style models (containing ':') are ONLY for local_llm
  // Cloud agents (opencode, pr_agent, ai_semantic_review) cannot use them
  if (model.includes(':')) {
    errors.push(
      `MODEL '${model}' is an Ollama model but cloud AI agents are enabled.\n` +
        `Fix: Either set a cloud model or disable cloud agents:\n` +
        `  MODEL=claude-opus-4-6  # Anthropic\n` +
        `  MODEL=gpt-4o-mini     # OpenAI\n` +
        `Or in .ai-review.yml, disable cloud agents and keep only local_llm.`
    );
    return { valid: false, errors };
  }

  // Heuristic: infer provider from model prefix
  if (model.startsWith('claude-')) {
    if (!env['ANTHROPIC_API_KEY']) {
      errors.push(
        `MODEL '${model}' looks like Anthropic (claude-*) but ANTHROPIC_API_KEY is missing`
      );
    }
  } else if (model.startsWith('gpt-') || model.startsWith('o1-')) {
    const hasOpenAI = env['OPENAI_API_KEY'] || env['AZURE_OPENAI_API_KEY'];
    if (!hasOpenAI) {
      errors.push(`MODEL '${model}' looks like OpenAI (gpt-*/o1-*) but OPENAI_API_KEY is missing`);
    }
  }
  // Unknown model prefix - no validation, allow it to proceed

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that the model is compatible with the RESOLVED provider for each agent.
 *
 * CRITICAL: This catches the 404 bug where both keys are present, Anthropic wins
 * (per resolveProvider invariant), but the model is GPT-style.
 *
 * INVARIANT: If provider resolves to Anthropic but model is gpt-X/o1-X, fail.
 * INVARIANT: If provider resolves to OpenAI/Azure but model is claude-X, fail.
 * INVARIANT: No hidden fallbacks - misconfiguration fails preflight with actionable error.
 *
 * @param config - Loaded configuration with enabled passes
 * @param model - Effective model to use
 * @param env - Environment variables for provider resolution
 * @returns Validation result with detailed error messages
 */
export function validateProviderModelCompatibility(
  config: Config,
  model: string,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  // Only validate cloud AI agents that use MODEL (not local_llm which uses OLLAMA_MODEL)
  const cloudAgents = new Set<AgentId>();
  for (const pass of config.passes) {
    if (!pass.enabled) continue;
    for (const agentId of pass.agents) {
      if (CLOUD_AI_AGENTS.includes(agentId)) {
        cloudAgents.add(agentId);
      }
    }
  }

  if (cloudAgents.size === 0) {
    // No cloud AI agents enabled, skip validation
    return { valid: true, errors: [] };
  }

  // Infer intended provider from model name
  const modelProvider = inferProviderFromModel(model);

  // Check each cloud agent's resolved provider against the model
  for (const agentId of cloudAgents) {
    const resolvedProvider = resolveProvider(agentId, env, config.provider);

    // Skip if no provider resolved (will fail elsewhere)
    if (!resolvedProvider) continue;

    // Check for mismatch: resolved provider vs model intent
    if (resolvedProvider === 'anthropic' && modelProvider === 'openai') {
      errors.push(
        `Provider-model mismatch for agent '${agentId}':\n` +
          `  - Resolved provider: Anthropic (ANTHROPIC_API_KEY present, takes precedence)\n` +
          `  - Model: '${model}' (looks like OpenAI: gpt-*/o1-*)\n` +
          `  - This will cause a 404 error - Anthropic API doesn't recognize '${model}'\n\n` +
          `Fix options:\n` +
          `  1. Use a Claude model: MODEL=claude-opus-4-6\n` +
          `  2. Remove ANTHROPIC_API_KEY to use OpenAI instead\n` +
          `  3. Set both keys but ensure MODEL matches ANTHROPIC_API_KEY (Anthropic wins)`
      );
    } else if (
      (resolvedProvider === 'openai' || resolvedProvider === 'azure-openai') &&
      modelProvider === 'anthropic'
    ) {
      const providerName = resolvedProvider === 'azure-openai' ? 'Azure OpenAI' : 'OpenAI';
      errors.push(
        `Provider-model mismatch for agent '${agentId}':\n` +
          `  - Resolved provider: ${providerName}\n` +
          `  - Model: '${model}' (looks like Anthropic: claude-*)\n` +
          `  - This will cause a 404 error - ${providerName} API doesn't recognize '${model}'\n\n` +
          `Fix options:\n` +
          `  1. Use an OpenAI model: MODEL=gpt-4o-mini\n` +
          `  2. Add ANTHROPIC_API_KEY to use Anthropic (takes precedence over OpenAI)\n` +
          `  3. Remove OPENAI_API_KEY${resolvedProvider === 'azure-openai' ? ' and Azure keys' : ''}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate Azure OpenAI deployment naming.
 *
 * When Azure OpenAI is configured, the deployment name should be validated:
 * - Must not be empty
 * - Warning if it looks like a standard model name (user might be confused)
 *
 * Azure deployments are custom-named and don't have to match model names,
 * but common misconfiguration is using the model name as deployment name
 * when the Azure deployment has a different name.
 */
export function validateAzureDeployment(env: Record<string, string | undefined>): PreflightResult {
  const errors: string[] = [];

  const hasAzure =
    env['AZURE_OPENAI_API_KEY'] &&
    env['AZURE_OPENAI_API_KEY'].trim() !== '' &&
    env['AZURE_OPENAI_ENDPOINT'] &&
    env['AZURE_OPENAI_ENDPOINT'].trim() !== '';

  if (!hasAzure) {
    // Not using Azure, skip validation
    return { valid: true, errors: [] };
  }

  const deployment = env['AZURE_OPENAI_DEPLOYMENT'];

  // Deployment is required when using Azure (already checked in validateAgentSecrets)
  // but double-check here for empty string edge case
  // T025: Single-line "set X" format for actionable fixes
  if (!deployment || deployment.trim() === '') {
    errors.push('Set: AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate multi-key ambiguity (FR-004).
 *
 * When multiple provider keys are present AND MODEL is set BUT no explicit
 * provider is specified in config, this is ambiguous and must fail.
 *
 * INVARIANT: Multi-key + MODEL + no explicit provider = hard fail with actionable error.
 *
 * @param config - Loaded configuration
 * @param env - Environment variables
 * @returns Validation result with actionable error message
 */
export function validateMultiKeyAmbiguity(
  config: Config,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  // Only validate if MODEL is explicitly set
  const hasModel = env['MODEL'] && env['MODEL'].trim() !== '';
  if (!hasModel) {
    // No MODEL set - auto-apply will handle this or fail elsewhere
    return { valid: true, errors: [] };
  }

  // Count providers with keys
  const keyCount = countProvidersWithKeys(env);

  // Only problematic if multiple keys AND no explicit provider
  if (keyCount > 1 && !config.provider) {
    // Determine which providers are configured
    const hasAnthropic = env['ANTHROPIC_API_KEY'] && env['ANTHROPIC_API_KEY'].trim() !== '';
    const hasOpenAI = env['OPENAI_API_KEY'] && env['OPENAI_API_KEY'].trim() !== '';

    let suggestion = '';
    if (hasAnthropic && hasOpenAI) {
      suggestion =
        'Add to your .ai-review.yml:\n' +
        '  provider: openai    # Use OpenAI\n' +
        'Or:\n' +
        '  provider: anthropic # Use Anthropic (takes precedence by default)';
    }

    errors.push(
      `Multiple API keys detected with MODEL set but no explicit provider.\n` +
        `This is ambiguous - please specify which provider to use.\n\n` +
        `${suggestion}`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that explicit provider has corresponding API keys (T026).
 *
 * When config.provider is explicitly set, the corresponding keys must be present.
 * Error messages specify exactly which key(s) to set.
 *
 * @param config - Loaded configuration with optional provider field
 * @param env - Environment variables
 * @returns Validation result with actionable error message
 */
export function validateExplicitProviderKeys(
  config: Config,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  if (!config.provider) {
    // No explicit provider - other validation handles this
    return { valid: true, errors: [] };
  }

  const provider = config.provider;

  // FR-005, FR-006: Ollama provider has special handling - OLLAMA_BASE_URL is optional
  // because it defaults to http://localhost:11434
  if (provider === 'ollama') {
    const ollamaUrl = env['OLLAMA_BASE_URL'];

    // FR-007: If OLLAMA_BASE_URL is set, validate URL format (scheme + host)
    if (ollamaUrl && ollamaUrl.trim() !== '') {
      try {
        const parsed = new URL(ollamaUrl);
        // Ensure it has a valid scheme (http or https)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          errors.push(
            `Invalid OLLAMA_BASE_URL: '${ollamaUrl}'\n` +
              `  Must use http:// or https:// scheme (e.g., http://localhost:11434)`
          );
        }
      } catch {
        // URL parsing failed - invalid format
        errors.push(
          `Invalid OLLAMA_BASE_URL format: '${ollamaUrl}'\n` +
            `  Must be a valid URL (e.g., http://localhost:11434)`
        );
      }
    }
    // FR-008: Connectivity is checked at runtime, not preflight

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Non-Ollama providers: check required keys
  const requiredKeys = PROVIDER_KEY_MAPPING[provider];

  // Check if all required keys are present
  const missingKeys = requiredKeys.filter((key) => {
    const value = env[key];
    return !value || value.trim() === '';
  });

  if (missingKeys.length > 0) {
    if (provider === 'azure-openai') {
      errors.push(
        `Provider 'azure-openai' requires all three Azure keys:\n` +
          `  Set: ${missingKeys.join(', ')}`
      );
    } else {
      errors.push(
        `Provider '${provider}' requires: ${missingKeys.join(', ')}\n` + `  Set: ${missingKeys[0]}`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate Ollama configuration when local_llm is enabled.
 *
 * NOTE: OLLAMA_BASE_URL is NOT required because local_llm defaults to
 * http://ollama-sidecar:11434 when unset (see router/src/agents/local_llm.ts).
 * Model availability is a runtime concern, not preflight.
 *
 * This function now just validates configuration, not connectivity.
 * Connectivity failures are handled at runtime by the local_llm agent.
 */
export function validateOllamaConfig(
  _config: Config,
  _env: Record<string, string | undefined>
): PreflightResult {
  // No preflight validation required for Ollama:
  // - OLLAMA_BASE_URL defaults to http://ollama-sidecar:11434
  // - OLLAMA_MODEL defaults to codellama:7b
  // - Connectivity is validated at runtime (fail-closed behavior)
  return { valid: true, errors: [] };
}

/**
 * Validate that model supports the chat completions API.
 *
 * INVARIANT: Cloud agents (opencode, pr_agent, ai_semantic_review) use the
 * chat completions API (/v1/chat/completions). Codex and other completions-only
 * models use the legacy /v1/completions endpoint and are NOT supported.
 *
 * This prevents the 404 error: "This is not a chat model and thus not
 * supported in the v1/chat/completions endpoint."
 */
export function validateChatModelCompatibility(
  config: Config,
  model: string,
  _env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  // Only validate if cloud AI agents are enabled
  const hasCloudAiAgent = config.passes.some(
    (pass) => pass.enabled && pass.agents.some((a) => CLOUD_AI_AGENTS.includes(a))
  );

  if (!hasCloudAiAgent) {
    return { valid: true, errors: [] };
  }

  if (isCodexFamilyModel(model)) {
    // Codex models use a specialized API, not the chat completions endpoint
    errors.push(
      `MODEL '${model}' is a Codex-family model. Codex models use a specialized API ` +
        `that is not compatible with the chat completions endpoint used by cloud AI agents.\n\n` +
        `Fix: Use a chat-compatible model:\n` +
        `  MODEL=gpt-4o-mini    # OpenAI - fast, cost-effective\n` +
        `  MODEL=gpt-4o         # OpenAI - flagship\n` +
        `  MODEL=claude-opus-4-6 # Anthropic\n\n` +
        `Or in .ai-review.yml:\n` +
        `  models:\n` +
        `    default: gpt-4o-mini`
    );
  } else if (isCompletionsOnlyModel(model)) {
    // Legacy completions-only models (davinci, curie, babbage, ada)
    errors.push(
      `MODEL '${model}' is a legacy completions-only model that does not support ` +
        `the chat completions endpoint used by cloud AI agents.\n\n` +
        `Fix: Use a chat-compatible model:\n` +
        `  MODEL=gpt-4o-mini    # OpenAI - fast, cost-effective\n` +
        `  MODEL=gpt-4o         # OpenAI - flagship\n` +
        `  MODEL=claude-opus-4-6 # Anthropic\n\n` +
        `Or in .ai-review.yml:\n` +
        `  models:\n` +
        `    default: gpt-4o-mini`
    );
  }

  return { valid: errors.length === 0, errors };
}
