/**
 * Configuration Module
 * Loads and validates .ai-review.yml files
 */

import { z } from 'zod';
import { readFile } from 'fs/promises';
import { parse as parseYaml } from 'yaml';
import { existsSync } from 'fs';
import { join } from 'path';

// Schema definitions
const AgentSchema = z.enum([
  'semgrep',
  'reviewdog',
  'opencode',
  'pr_agent',
  'local_llm',
  'ai_semantic_review',
]);

const PassSchema = z.object({
  name: z.string(),
  agents: z.array(AgentSchema),
  enabled: z.boolean().default(true),
  /**
   * When true: missing prerequisites (API keys, CLI tools) cause fail-fast with actionable error.
   * When false: missing prerequisites cause skip with clear reason, continue to next agent.
   * Default: false (optional) for backward compatibility.
   */
  required: z.boolean().default(false),
});

const LimitsSchema = z.object({
  max_files: z.number().default(50),
  max_diff_lines: z.number().default(2000),
  max_tokens_per_pr: z.number().default(12000),
  max_usd_per_pr: z.number().default(1.0),
  monthly_budget_usd: z.number().default(100),
});

const GithubReportingSchema = z.object({
  mode: z
    .enum(['checks_only', 'comments_only', 'checks_and_comments'])
    .default('checks_and_comments'),
  max_inline_comments: z.number().default(20),
  summary: z.boolean().default(true),
});

const ADOReportingSchema = z.object({
  mode: z.enum(['threads_only', 'status_only', 'threads_and_status']).default('threads_and_status'),
  max_inline_comments: z.number().default(20),
  summary: z.boolean().default(true),
  /** Thread status for new findings: Active (1), Pending (6) */
  thread_status: z.enum(['active', 'pending']).default('active'),
});

const ReportingSchema = z.object({
  github: GithubReportingSchema.optional(),
  ado: ADOReportingSchema.optional(),
});

const GatingSchema = z.object({
  enabled: z.boolean().default(false),
  fail_on_severity: z.enum(['error', 'warning', 'info']).default('error'),
});

const TriggersSchema = z.object({
  on: z.array(z.enum(['pull_request', 'push'])).default(['pull_request']),
  branches: z.array(z.string()).default(['main']),
});

const PathFiltersSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/**
 * Model configuration.
 * No default - must be explicitly configured via MODEL env or config.models.default
 */
const ModelsSchema = z.object({
  /** Default model for AI agents when MODEL env var is not set */
  default: z.string().optional(),
});

export const ConfigSchema = z.object({
  version: z.number().default(1),
  trusted_only: z.boolean().default(true),
  triggers: TriggersSchema.default({}),
  passes: z.array(PassSchema).default([
    // Safe default: static analysis only (no AI agents, no API keys required)
    // Static analysis is required by default - if semgrep fails, the review fails
    // To enable AI agents, create .ai-review.yml in your repository
    { name: 'static', agents: ['semgrep'], enabled: true, required: true },
  ]),
  limits: LimitsSchema.default({}),
  models: ModelsSchema.default({}),
  reporting: ReportingSchema.default({}),
  gating: GatingSchema.default({}),
  path_filters: PathFiltersSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Pass = z.infer<typeof PassSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type Models = z.infer<typeof ModelsSchema>;
export type AgentId = z.infer<typeof AgentSchema>;

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
 * INVARIANT: Model takes precedence when both keys are present.
 * INVARIANT: If model is gpt-* or o1-* and OpenAI key exists, use OpenAI.
 * INVARIANT: If model is claude-* and Anthropic key exists, use Anthropic.
 * INVARIANT: Azure only for Azure-capable agents.
 * INVARIANT: No silent fallback. Missing keys = preflight failure.
 *
 * @param agentId - Agent to resolve provider for
 * @param env - Environment variables
 * @param model - Optional model name to consider for provider selection
 * @returns Provider to use, or null if no valid provider available
 */
export function resolveProvider(
  agentId: AgentId,
  env: Record<string, string | undefined>,
  model?: string
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

  // When model is specified and both keys are present, use the provider that matches the model
  if (model) {
    const inferredProvider = inferProviderFromModel(model);

    // Model-based selection when both keys are present
    if (inferredProvider === 'openai' && hasOpenAI) {
      return 'openai';
    }
    if (inferredProvider === 'openai' && hasAzure && AZURE_CAPABLE_AGENTS.includes(agentId)) {
      return 'azure-openai';
    }
    if (
      inferredProvider === 'anthropic' &&
      hasAnthropic &&
      ANTHROPIC_CAPABLE_AGENTS.includes(agentId)
    ) {
      return 'anthropic';
    }
  }

  // Fallback to precedence-based selection (when model is unknown or not specified)
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

const CONFIG_FILENAME = '.ai-review.yml';
const DEFAULTS_PATH = join(import.meta.dirname, '../../config/defaults.ai-review.yml');

/**
 * Load configuration from the target repository
 * Falls back to defaults if no config file exists
 */
export async function loadConfig(repoRoot: string): Promise<Config> {
  const configPath = join(repoRoot, CONFIG_FILENAME);

  let userConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    const content = await readFile(configPath, 'utf-8');
    userConfig = parseYaml(content) as Record<string, unknown>;
    console.log(`[config] Loaded ${CONFIG_FILENAME} from repository`);
  } else {
    // Enterprise-grade warning: explicit opt-in for AI agents
    console.warn(
      `[config] ⚠️  No ${CONFIG_FILENAME} found. Running static analysis (Semgrep) only.`
    );
    console.warn(
      `[config] To enable AI agents (local_llm, OpenCode, PR-Agent), add ${CONFIG_FILENAME} to your repository.`
    );
    console.warn(`[config] See: https://github.com/oddessentials/odd-ai-reviewers#configuration`);
  }

  // Load defaults and merge with user config
  let defaults: Record<string, unknown> = {};
  if (existsSync(DEFAULTS_PATH)) {
    const defaultsContent = await readFile(DEFAULTS_PATH, 'utf-8');
    defaults = parseYaml(defaultsContent) as Record<string, unknown>;
  }

  const merged = deepMerge(defaults, userConfig);

  // Validate and return
  const result = ConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${result.error.message}`);
  }

  return result.data;
}

/**
 * Deep merge two objects, with source taking precedence
 */
function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    if (
      sourceVal &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Get the list of enabled agents for a specific pass
 */
export function getEnabledAgents(config: Config, passName: string): AgentId[] {
  const pass = config.passes.find((p) => p.name === passName);
  if (!pass || !pass.enabled) {
    return [];
  }
  return pass.agents;
}
