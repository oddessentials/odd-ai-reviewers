/**
 * Preflight Validation Module
 *
 * Validates that required secrets are configured for enabled agents.
 * Fails fast with clear error messages before any agent execution.
 *
 * INVARIANTS ENFORCED:
 * - Legacy keys cause hard failure (no backwards compatibility)
 * - Azure OpenAI keys validated as atomic bundle
 */

import type { Config, AgentId } from './config.js';

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
    // PR-Agent requires OpenAI or Azure OpenAI
    oneOf: ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY'],
  },
  ai_semantic_review: {
    // Similar to PR-Agent
    oneOf: ['OPENAI_API_KEY', 'AZURE_OPENAI_API_KEY'],
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
