/**
 * Preflight Checks Module
 *
 * Consolidates all validation that must pass before agent execution.
 * Extracted from main.ts lines 238-313.
 *
 * FR-011: Logs the resolved configuration tuple for debugging and reproducibility.
 */

import {
  type Config,
  type ResolvedConfigTuple,
  resolveProvider,
  buildResolvedConfigTuple,
} from '../config.js';
import type { AgentContext } from '../agents/types.js';
import {
  validateAgentSecrets,
  validateModelConfig,
  validateModelProviderMatch,
  validateProviderModelCompatibility,
  validateAzureDeployment,
  validateOllamaConfig,
  validateChatModelCompatibility,
  validateMultiKeyAmbiguity,
  validateExplicitProviderKeys,
  resolveEffectiveModelWithDefaults,
} from '../preflight.js';

export interface PreflightResult {
  valid: boolean;
  errors: string[];
  /** Resolved config tuple for logging (FR-011) */
  resolved?: ResolvedConfigTuple;
}

/**
 * Run all preflight validation checks.
 * Returns a consolidated result with all errors collected.
 *
 * Order of checks:
 * 1. Agent secrets (API keys for enabled agents)
 * 2. Model configuration (MODEL env or config.models.default or auto-apply)
 * 3. Model-provider match (cloud AI agents have available provider)
 * 4. Provider-model compatibility (resolved provider matches model family)
 * 5. Azure deployment validation (if Azure configured)
 * 6. Ollama config validation (if local_llm enabled)
 * 7. Chat model compatibility (reject completions-only models for cloud agents)
 *
 * FR-011: On success, builds and logs the resolved configuration tuple.
 *
 * @param config - Loaded configuration
 * @param agentContext - Agent context with effective model
 * @param env - Environment variables
 * @param configPath - Optional path to config file (for resolved tuple logging)
 */
export function runPreflightChecks(
  config: Config,
  agentContext: AgentContext,
  env: Record<string, string | undefined>,
  configPath?: string
): PreflightResult {
  const allErrors: string[] = [];

  // 1. Agent secrets validation
  const secretsCheck = validateAgentSecrets(config, env);
  if (!secretsCheck.valid) {
    allErrors.push(...secretsCheck.errors);
  }

  // Resolve effective model with auto-apply for single-key setups (FR-001)
  const { model: resolvedModel, autoApplied } = resolveEffectiveModelWithDefaults(config, env);

  // Use auto-applied model if available, otherwise use context model
  const effectiveModel = resolvedModel || agentContext.effectiveModel;

  // Log auto-apply behavior
  if (autoApplied && resolvedModel) {
    console.log(`[preflight] Auto-applied default model: ${resolvedModel}`);
  }

  // 2. Model config validation
  const modelCheck = validateModelConfig(effectiveModel, env);
  if (!modelCheck.valid) {
    allErrors.push(...modelCheck.errors);
  }

  // 3. Model-provider match validation
  const matchCheck = validateModelProviderMatch(config, effectiveModel, env);
  if (!matchCheck.valid) {
    allErrors.push(...matchCheck.errors);
  }

  // 4. Provider-model compatibility
  const compatCheck = validateProviderModelCompatibility(config, effectiveModel, env);
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

  // 7. Chat model compatibility (reject codex/completions-only models)
  const chatCheck = validateChatModelCompatibility(config, effectiveModel, env);
  if (!chatCheck.valid) {
    allErrors.push(...chatCheck.errors);
  }

  // 8. Multi-key ambiguity check (T024/T028 - FR-004)
  const multiKeyCheck = validateMultiKeyAmbiguity(config, env);
  if (!multiKeyCheck.valid) {
    allErrors.push(...multiKeyCheck.errors);
  }

  // 9. Explicit provider key check (T026/T028)
  const explicitProviderCheck = validateExplicitProviderKeys(config, env);
  if (!explicitProviderCheck.valid) {
    allErrors.push(...explicitProviderCheck.errors);
  }

  // Build resolved config tuple (T018)
  // For provider resolution, pick the first cloud AI agent or fallback to opencode
  const cloudAgents = ['opencode', 'pr_agent', 'ai_semantic_review'] as const;
  const firstCloudAgent = config.passes
    .filter((p) => p.enabled)
    .flatMap((p) => p.agents)
    .find((a) => cloudAgents.includes(a as (typeof cloudAgents)[number]));

  const resolvedProvider = firstCloudAgent
    ? resolveProvider(firstCloudAgent, env, config.provider)
    : null;

  const resolvedTuple = buildResolvedConfigTuple(
    resolvedProvider,
    effectiveModel,
    env,
    config,
    configPath
  );

  // FR-011 / T019: Log resolved config tuple as JSON on success
  if (allErrors.length === 0) {
    console.log(`[preflight] Resolved configuration: ${JSON.stringify(resolvedTuple)}`);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    resolved: resolvedTuple,
  };
}
