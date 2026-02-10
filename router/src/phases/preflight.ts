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
  hasRequiredCloudAiAgent,
  hasAnyCloudAiAgent,
} from '../preflight.js';

export interface PreflightResult {
  valid: boolean;
  errors: string[];
  /** Warnings that do not block execution (FR-020: warnings never cause non-zero exit) */
  warnings: string[];
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
  const allWarnings: string[] = [];

  // 1. Agent secrets validation (respects pass.required — optional agents produce warnings)
  const secretsCheck = validateAgentSecrets(config, env);
  if (!secretsCheck.valid) {
    allErrors.push(...secretsCheck.errors);
  }
  allWarnings.push(...secretsCheck.warnings);

  // Resolve effective model with auto-apply for single-key setups (FR-001)
  const { model: resolvedModel, autoApplied } = resolveEffectiveModelWithDefaults(config, env);

  // Use auto-applied model if available, otherwise use context model
  const effectiveModel = resolvedModel || agentContext.effectiveModel;

  // Log auto-apply behavior (to stderr to keep stdout JSON-clean for --json)
  if (autoApplied && resolvedModel) {
    console.error(`[preflight] Auto-applied default model: ${resolvedModel}`);
  }

  // Cloud-agent-only checks: demote to warnings when ALL cloud agents are optional.
  // These checks are irrelevant when cloud agents will just be skipped at runtime.
  // NOTE: validateModelProviderMatch, validateProviderModelCompatibility, and
  // validateChatModelCompatibility already short-circuit internally when no cloud
  // agents are enabled. validateModelConfig does NOT have that guard, so we gate
  // it here: skip entirely when no cloud agents exist, demote when they're all optional.
  const cloudAgentsRequired = hasRequiredCloudAiAgent(config);
  const cloudTarget = cloudAgentsRequired ? allErrors : allWarnings;

  // 2. Model config validation (only relevant when cloud agents are enabled)
  if (hasAnyCloudAiAgent(config)) {
    const modelCheck = validateModelConfig(effectiveModel, env);
    if (!modelCheck.valid) {
      cloudTarget.push(...modelCheck.errors);
    }
  }

  // 3. Model-provider match validation
  const matchCheck = validateModelProviderMatch(config, effectiveModel, env);
  if (!matchCheck.valid) {
    cloudTarget.push(...matchCheck.errors);
  }

  // 4. Provider-model compatibility
  const compatCheck = validateProviderModelCompatibility(config, effectiveModel, env);
  if (!compatCheck.valid) {
    cloudTarget.push(...compatCheck.errors);
  }

  // 5. Azure deployment validation (infra — always hard error)
  const azureCheck = validateAzureDeployment(env);
  if (!azureCheck.valid) {
    allErrors.push(...azureCheck.errors);
  }

  // 6. Ollama config validation (infra — always hard error)
  const ollamaCheck = validateOllamaConfig(config, env);
  if (!ollamaCheck.valid) {
    allErrors.push(...ollamaCheck.errors);
  }

  // 7. Chat model compatibility (reject codex/completions-only models)
  const chatCheck = validateChatModelCompatibility(config, effectiveModel, env);
  if (!chatCheck.valid) {
    cloudTarget.push(...chatCheck.errors);
  }

  // 8. Multi-key ambiguity check (T024/T028 - FR-004) — always hard error (ambiguous config)
  const multiKeyCheck = validateMultiKeyAmbiguity(config, env);
  if (!multiKeyCheck.valid) {
    allErrors.push(...multiKeyCheck.errors);
  }

  // 9. Explicit provider key check (T026/T028)
  // Ollama URL format errors are structural → always hard error.
  // Non-Ollama missing-key errors are "missing prerequisite" → demote when
  // all cloud agents are optional (same logic as agent secret checks).
  const explicitProviderCheck = validateExplicitProviderKeys(config, env);
  if (!explicitProviderCheck.valid) {
    const providerTarget = config.provider === 'ollama' ? allErrors : cloudTarget;
    providerTarget.push(...explicitProviderCheck.errors);
  }

  // 10. Platform environment detection for "both" platform (T040-T042, FR-013, FR-014, FR-017)
  // When config has both reporting.github AND reporting.ado, warn if neither platform env is detected
  if (config.reporting.github && config.reporting.ado) {
    const hasGitHub = env['GITHUB_ACTIONS'] === 'true';
    const hasADO = env['TF_BUILD'] === 'True' || !!env['SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'];

    if (!hasGitHub && !hasADO) {
      // FR-017: Warning lists exact env vars checked
      // FR-014, FR-020: This is a warning, not an error (exit 0)
      allWarnings.push(
        'Dual-platform config detected but no CI environment found. ' +
          'Checked: GITHUB_ACTIONS, TF_BUILD, SYSTEM_TEAMFOUNDATIONCOLLECTIONURI. ' +
          'Reporting will be skipped unless running in a supported CI environment.'
      );
    }
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

  // FR-011 / T019: Log resolved config tuple as JSON on success (to stderr to keep stdout JSON-clean)
  if (allErrors.length === 0) {
    console.error(`[preflight] Resolved configuration: ${JSON.stringify(resolvedTuple)}`);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    resolved: resolvedTuple,
  };
}
