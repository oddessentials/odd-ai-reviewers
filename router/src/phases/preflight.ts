/**
 * Preflight Checks Module
 *
 * Consolidates all validation that must pass before agent execution.
 * Extracted from main.ts lines 238-313.
 */

import type { Config } from '../config.js';
import type { AgentContext } from '../agents/types.js';
import {
  validateAgentSecrets,
  validateModelConfig,
  validateModelProviderMatch,
  validateProviderModelCompatibility,
  validateAzureDeployment,
  validateOllamaConfig,
} from '../preflight.js';

export interface PreflightResult {
  valid: boolean;
  errors: string[];
}

/**
 * Run all preflight validation checks.
 * Returns a consolidated result with all errors collected.
 *
 * Order of checks:
 * 1. Agent secrets (API keys for enabled agents)
 * 2. Model configuration (MODEL env or config.models.default)
 * 3. Model-provider match (cloud AI agents have available provider)
 * 4. Provider-model compatibility (resolved provider matches model family)
 * 5. Azure deployment validation (if Azure configured)
 * 6. Ollama config validation (if local_llm enabled)
 */
export function runPreflightChecks(
  config: Config,
  agentContext: AgentContext,
  env: Record<string, string | undefined>
): PreflightResult {
  const allErrors: string[] = [];

  // 1. Agent secrets validation
  const secretsCheck = validateAgentSecrets(config, env);
  if (!secretsCheck.valid) {
    allErrors.push(...secretsCheck.errors);
  }

  // 2. Model config validation
  const modelCheck = validateModelConfig(agentContext.effectiveModel, env);
  if (!modelCheck.valid) {
    allErrors.push(...modelCheck.errors);
  }

  // 3. Model-provider match validation
  const matchCheck = validateModelProviderMatch(config, agentContext.effectiveModel, env);
  if (!matchCheck.valid) {
    allErrors.push(...matchCheck.errors);
  }

  // 4. Provider-model compatibility
  const compatCheck = validateProviderModelCompatibility(config, agentContext.effectiveModel, env);
  if (!compatCheck.valid) {
    allErrors.push(...compatCheck.errors);
  }

  // 5. Azure deployment validation
  const azureCheck = validateAzureDeployment(env);
  if (!azureCheck.valid) {
    allErrors.push(...azureCheck.errors);
  }

  // 6. Ollama config validation
  const ollamaCheck = validateOllamaConfig(config, env);
  if (!ollamaCheck.valid) {
    allErrors.push(...ollamaCheck.errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}
