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
import { inferProviderFromModel, isCompletionsOnlyModel, resolveProvider } from './config.js';
// Note: ConfigError, ValidationError types are available from './types/errors.js'
// but this module uses string-based error collection by design (see module docs)

export interface PreflightResult {
  valid: boolean;
  errors: string[];
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

  // HARD FAIL: Reject legacy keys
  for (const key of LEGACY_KEYS) {
    if (env[key] !== undefined && env[key] !== '') {
      errors.push(
        `Legacy environment variable '${key}' detected. ` +
          `This key is no longer supported. Use canonical keys: OPENAI_API_KEY, ANTHROPIC_API_KEY, or MODEL.`
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
 * Fails if effectiveModel is empty (no MODEL env var and no config.models.default).
 *
 * INVARIANT: Router owns model resolution. No hardcoded fallbacks.
 */
export function validateModelConfig(
  effectiveModel: string,
  env: Record<string, string | undefined>
): PreflightResult {
  const errors: string[] = [];

  if (!effectiveModel || effectiveModel.trim() === '') {
    const hasModelEnv = env['MODEL'] && env['MODEL'].trim() !== '';
    if (!hasModelEnv) {
      errors.push(
        'No model configured. Set the MODEL environment variable or configure models.default in .ai-review.yml'
      );
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
        `  MODEL=claude-sonnet-4-20250514  # Anthropic\n` +
        `  MODEL=gpt-4o-mini               # OpenAI\n` +
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
    const resolvedProvider = resolveProvider(agentId, env);

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
          `  1. Use a Claude model: MODEL=claude-sonnet-4-20250514\n` +
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
  if (!deployment || deployment.trim() === '') {
    errors.push(
      'AZURE_OPENAI_DEPLOYMENT is empty. ' +
        'Set this to your Azure deployment name (e.g., "my-gpt4-deployment").'
    );
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

  if (isCompletionsOnlyModel(model)) {
    errors.push(
      `MODEL '${model}' is a completions-only model (Codex/legacy) but cloud AI agents are enabled.\n` +
        `Cloud agents require chat models that support the /v1/chat/completions endpoint.\n\n` +
        `Fix: Use a chat-compatible model:\n` +
        `  MODEL=gpt-4o-mini              # OpenAI - fast, cost-effective\n` +
        `  MODEL=gpt-4o                   # OpenAI - flagship\n` +
        `  MODEL=claude-sonnet-4-20250514 # Anthropic\n\n` +
        `Or in .ai-review.yml:\n` +
        `  models:\n` +
        `    default: gpt-4o-mini`
    );
  }

  return { valid: errors.length === 0, errors };
}
