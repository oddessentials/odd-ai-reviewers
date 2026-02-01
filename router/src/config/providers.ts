/**
 * Provider Resolution Module
 *
 * Handles LLM provider resolution with strict precedence rules.
 * Extracted from config.ts to improve modularity.
 */

import type { Config, AgentId } from './schemas.js';

/**
 * COMPLETIONS-ONLY MODELS (Codex family and legacy models)
 * These models use /v1/completions, NOT /v1/chat/completions.
 * Cloud agents ONLY support chat models.
 *
 * INVARIANT: Any model matching these patterns will be rejected by preflight
 * when cloud agents are enabled, preventing 404 errors at runtime.
 */
const COMPLETIONS_ONLY_PATTERNS = [
  /codex/i, // gpt-5.2-codex, codex-davinci, gpt-4-codex, etc.
  /davinci-00[0-3]$/i, // Legacy text-davinci-001/002/003
  /curie/i, // Legacy curie models
  /babbage/i, // Legacy babbage models
  /^ada$/i, // Legacy ada model (exact match to avoid false positives with gpt-4-ada)
];

/**
 * Check if model is a completions-only model (not chat-compatible).
 * Used for preflight validation to prevent 404 errors.
 *
 * @param model - Model name to check
 * @returns true if model is completions-only and NOT compatible with chat API
 */
export function isCompletionsOnlyModel(model: string): boolean {
  return COMPLETIONS_ONLY_PATTERNS.some((pattern) => pattern.test(model));
}

/**
 * Provider type for LLM agents.
 * Router resolves provider once; agents use this without guessing.
 */
export type LlmProvider = 'anthropic' | 'openai' | 'azure-openai' | 'ollama';

/**
 * Resolved configuration tuple for logging and reproducibility (FR-011).
 * Captures the fully resolved state at preflight time.
 *
 * INVARIANT: This tuple is logged at preflight and locked for the entire run.
 * INVARIANT: keySource logs env var name, never the actual secret value.
 */
export interface ResolvedConfigTuple {
  /** Resolved LLM provider */
  provider: LlmProvider | null;

  /** Effective model name (may be auto-applied default for single-key setups) */
  model: string;

  /** Source of API key, e.g., "env:OPENAI_API_KEY" */
  keySource: string | null;

  /** Source of config: "file" (from .ai-review.yml), "defaults" (built-in), "merged" (both) */
  configSource: 'file' | 'defaults' | 'merged';

  /** Path to config file if file source */
  configPath?: string;

  /** Tuple format version - increment when fields are added/changed */
  schemaVersion: number;

  /** Resolution logic version - increment when resolution behavior changes */
  resolutionVersion: number;
}

/** Current schema version for ResolvedConfigTuple */
export const RESOLVED_CONFIG_SCHEMA_VERSION = 1;

/** Current resolution logic version */
export const RESOLVED_CONFIG_RESOLUTION_VERSION = 1;

/**
 * Maps providers to their required environment variables.
 * Mirrored from preflight.ts for use in config resolution.
 */
const PROVIDER_KEY_MAPPING: Record<LlmProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  'azure-openai': ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT'],
  ollama: ['OLLAMA_BASE_URL'],
};

/**
 * Resolve the key source string for a provider (FR-011 logging).
 *
 * INVARIANT: Returns env var name, NEVER the actual secret value.
 * INVARIANT: For Azure, returns first present key (API_KEY takes precedence).
 *
 * @param provider - The resolved provider
 * @param env - Environment variables to check
 * @returns Key source string like "env:OPENAI_API_KEY" or null if no key found
 */
export function resolveKeySource(
  provider: LlmProvider,
  env: Record<string, string | undefined>
): string | null {
  const keys = PROVIDER_KEY_MAPPING[provider];

  // Find first present key
  for (const key of keys) {
    const value = env[key];
    if (value && value.trim() !== '') {
      return `env:${key}`;
    }
  }

  return null;
}

/**
 * Resolve the config source based on whether config came from file or defaults.
 *
 * @param config - The resolved configuration
 * @param configPath - Path to config file, or undefined if no file loaded
 * @returns Config source: 'file', 'defaults', or 'merged'
 */
export function resolveConfigSource(
  config: Config,
  configPath: string | undefined
): 'file' | 'defaults' | 'merged' {
  // If no config path, config is entirely from defaults
  if (!configPath) {
    return 'defaults';
  }

  // If config path exists, check if config has non-default values
  // For simplicity, if a config file was loaded, we consider it 'file'
  // If the config file was loaded but uses many defaults, it's 'merged'
  // Detection: check if passes differ from the default single-pass
  const defaultPassCount = 1;
  const defaultAgents = ['semgrep'];

  const hasCustomPasses =
    config.passes.length !== defaultPassCount ||
    config.passes.some((p) => !defaultAgents.includes(p.agents[0] || ''));

  // If config file exists and has custom values, it's 'merged' (file + defaults)
  // If config file exists but matches defaults, it's still 'file' (explicit choice)
  return hasCustomPasses ? 'merged' : 'file';
}

/**
 * Agents that support Anthropic provider.
 * If Anthropic key is present and agent supports it, Anthropic wins.
 */
const ANTHROPIC_CAPABLE_AGENTS: AgentId[] = ['opencode', 'pr_agent', 'ai_semantic_review'];

/**
 * Agents that support Azure OpenAI provider.
 * OpenCode does NOT support Azure yet (only OpenAI and Anthropic).
 */
const AZURE_CAPABLE_AGENTS: AgentId[] = ['pr_agent', 'ai_semantic_review'];

/**
 * Infer provider from model name (heuristic, not contract).
 * Used for preflight validation to catch provider/model mismatches early.
 *
 * @param model - Model name to classify
 * @returns Inferred provider or 'unknown' if can't determine
 */
export function inferProviderFromModel(model: string): 'anthropic' | 'openai' | 'unknown' {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o1-')) return 'openai';
  return 'unknown';
}

/**
 * Resolve effective model using precedence order:
 * 1. MODEL env var (user override)
 * 2. config.models.default (repo config)
 *
 * INVARIANT: Router owns model resolution. Agents receive the resolved model.
 * INVARIANT: No hardcoded fallbacks. Misconfiguration fails preflight.
 */
export function resolveEffectiveModel(
  config: Config,
  env: Record<string, string | undefined>
): string {
  // 1. MODEL env var takes precedence (explicit user override)
  const envModel = env['MODEL'];
  if (envModel && envModel.trim() !== '') {
    return envModel;
  }

  // 2. Config default (repo-level setting)
  if (config.models.default && config.models.default.trim() !== '') {
    return config.models.default;
  }

  // No model configured - this is a preflight error
  // Return empty string so preflight can catch it
  return '';
}

/**
 * Resolve the effective LLM provider for an agent.
 *
 * PRECEDENCE ORDER:
 * 1. Explicit config.provider field (user override - T010)
 * 2. Anthropic wins if agent supports it and key is present
 * 3. Azure only for Azure-capable agents
 * 4. OpenAI as fallback
 *
 * INVARIANT: Explicit provider bypasses auto-detection.
 * INVARIANT: Azure only for Azure-capable agents.
 * INVARIANT: No silent fallback. Missing keys = preflight failure.
 *
 * @param agentId - The agent to resolve provider for
 * @param env - Environment variables to check for keys
 * @param explicitProvider - Optional explicit provider from config.provider field
 * @returns Provider to use, or null if no valid provider available
 */
export function resolveProvider(
  agentId: AgentId,
  env: Record<string, string | undefined>,
  explicitProvider?: LlmProvider
): LlmProvider | null {
  // Ollama agents use Ollama provider
  if (agentId === 'local_llm') {
    return 'ollama';
  }

  // Static analysis agents don't need a provider
  if (agentId === 'semgrep' || agentId === 'reviewdog' || agentId === 'control_flow') {
    return null;
  }

  // PRECEDENCE 1: Explicit provider from config.provider (T010)
  // This bypasses automatic detection and uses the user's explicit choice
  if (explicitProvider) {
    // Validate Azure capability for explicit provider
    if (explicitProvider === 'azure-openai' && !AZURE_CAPABLE_AGENTS.includes(agentId)) {
      // Agent doesn't support Azure - return null to trigger preflight error
      return null;
    }
    return explicitProvider;
  }

  // PRECEDENCE 2-4: Automatic detection based on available keys
  const hasAnthropic = env['ANTHROPIC_API_KEY'] && env['ANTHROPIC_API_KEY'].trim() !== '';
  const hasOpenAI = env['OPENAI_API_KEY'] && env['OPENAI_API_KEY'].trim() !== '';
  const hasAzure =
    env['AZURE_OPENAI_API_KEY'] &&
    env['AZURE_OPENAI_API_KEY'].trim() !== '' &&
    env['AZURE_OPENAI_ENDPOINT'] &&
    env['AZURE_OPENAI_ENDPOINT'].trim() !== '' &&
    env['AZURE_OPENAI_DEPLOYMENT'] &&
    env['AZURE_OPENAI_DEPLOYMENT'].trim() !== '';

  // Anthropic wins if agent supports it and key is present
  if (ANTHROPIC_CAPABLE_AGENTS.includes(agentId) && hasAnthropic) {
    return 'anthropic';
  }

  // Azure OpenAI next (only for Azure-capable agents, complete bundle required)
  if (AZURE_CAPABLE_AGENTS.includes(agentId) && hasAzure) {
    return 'azure-openai';
  }

  // OpenAI last
  if (hasOpenAI) {
    return 'openai';
  }

  // No valid provider
  return null;
}

/**
 * Build the resolved configuration tuple for logging (FR-011).
 *
 * INVARIANT: This tuple captures the fully resolved state at preflight time.
 * INVARIANT: keySource logs env var name, NEVER the actual secret value.
 * INVARIANT: Tuple is immutable after construction.
 *
 * @param provider - Resolved provider (may be null for static-only runs)
 * @param model - Effective model name
 * @param env - Environment variables for key source resolution
 * @param config - Configuration for config source resolution
 * @param configPath - Path to config file, or undefined if no file loaded
 * @returns Fully populated ResolvedConfigTuple
 */
export function buildResolvedConfigTuple(
  provider: LlmProvider | null,
  model: string,
  env: Record<string, string | undefined>,
  config: Config,
  configPath: string | undefined
): ResolvedConfigTuple {
  const keySource = provider ? resolveKeySource(provider, env) : null;
  const configSource = resolveConfigSource(config, configPath);

  const tuple: ResolvedConfigTuple = {
    provider,
    model,
    keySource,
    configSource,
    schemaVersion: RESOLVED_CONFIG_SCHEMA_VERSION,
    resolutionVersion: RESOLVED_CONFIG_RESOLUTION_VERSION,
  };

  // Only include configPath if there's actually a file
  if (configPath) {
    tuple.configPath = configPath;
  }

  return tuple;
}
