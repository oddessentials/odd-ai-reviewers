/**
 * Provider Resolution Module
 *
 * Handles LLM provider resolution with strict precedence rules.
 * Extracted from config.ts to improve modularity.
 */

import type { Config, AgentId } from './schemas.js';

/**
 * Provider type for LLM agents.
 * Router resolves provider once; agents use this without guessing.
 */
export type LlmProvider = 'anthropic' | 'openai' | 'azure-openai' | 'ollama';

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
 * INVARIANT: Anthropic wins if agent supports it and key is present.
 * INVARIANT: Azure only for Azure-capable agents.
 * INVARIANT: No silent fallback. Missing keys = preflight failure.
 *
 * @returns Provider to use, or null if no valid provider available
 */
export function resolveProvider(
  agentId: AgentId,
  env: Record<string, string | undefined>
): LlmProvider | null {
  // Ollama agents use Ollama provider
  if (agentId === 'local_llm') {
    return 'ollama';
  }

  // Static analysis agents don't need a provider
  if (agentId === 'semgrep' || agentId === 'reviewdog') {
    return null;
  }

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
