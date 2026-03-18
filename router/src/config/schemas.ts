/**
 * Configuration Schema Module
 *
 * All Zod schema definitions for configuration validation.
 * Extracted from config.ts to improve modularity.
 */

import { z } from 'zod';
import { ControlFlowConfigSchema } from '../agents/control_flow/types.js';

// =============================================================================
// Agent Registry (Single Source of Truth — FR-009)
// =============================================================================

/**
 * Metadata for a single agent in the canonical registry.
 * Schema validation, CLI help, docs tables, and error messages all derive from this.
 */
export interface AgentRegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiresExternalTool: boolean;
  readonly requiresApiKey: boolean;
  readonly builtIn: boolean;
  readonly compatibleProviders: readonly string[] | 'all';
}

/**
 * Canonical agent registry — the sole authority for agent identity.
 * Adding a new agent without updating this registry is impossible because
 * AgentSchema is derived from it.
 */
export const AGENT_REGISTRY: readonly AgentRegistryEntry[] = [
  {
    id: 'semgrep',
    name: 'Semgrep',
    description: 'Static analysis via Semgrep CLI',
    requiresExternalTool: true,
    requiresApiKey: false,
    builtIn: false,
    compatibleProviders: 'all',
  },
  {
    id: 'reviewdog',
    name: 'Reviewdog',
    description: 'Lint aggregation via Reviewdog CLI',
    requiresExternalTool: true,
    requiresApiKey: false,
    builtIn: false,
    compatibleProviders: 'all',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    description: 'AI code review via cloud LLM',
    requiresExternalTool: false,
    requiresApiKey: true,
    builtIn: false,
    compatibleProviders: ['anthropic', 'openai', 'azure-openai'],
  },
  {
    id: 'pr_agent',
    name: 'PR Agent',
    description: 'AI pull request analysis via cloud LLM',
    requiresExternalTool: false,
    requiresApiKey: true,
    builtIn: false,
    compatibleProviders: ['anthropic', 'openai', 'azure-openai'],
  },
  {
    id: 'local_llm',
    name: 'Local LLM',
    description: 'AI code review via local Ollama model',
    requiresExternalTool: false,
    requiresApiKey: false,
    builtIn: false,
    compatibleProviders: ['ollama'],
  },
  {
    id: 'ai_semantic_review',
    name: 'AI Semantic Review',
    description: 'Semantic analysis via cloud LLM',
    requiresExternalTool: false,
    requiresApiKey: true,
    builtIn: false,
    compatibleProviders: ['anthropic', 'openai', 'azure-openai'],
  },
  {
    id: 'control_flow',
    name: 'Control Flow',
    description: 'Built-in TypeScript control flow analysis',
    requiresExternalTool: false,
    requiresApiKey: false,
    builtIn: true,
    compatibleProviders: 'all',
  },
] as const;

/** All valid agent IDs, derived from the registry */
const AGENT_IDS = AGENT_REGISTRY.map((a) => a.id) as [string, ...string[]];

/**
 * Look up an agent by ID from the registry.
 */
export function getAgentById(id: string): AgentRegistryEntry | undefined {
  return AGENT_REGISTRY.find((a) => a.id === id);
}

/**
 * Get agents compatible with a given provider.
 * Returns all agents if provider is null/undefined.
 */
export function getCompatibleAgents(provider: string | null | undefined): AgentRegistryEntry[] {
  if (!provider) return [...AGENT_REGISTRY];
  return AGENT_REGISTRY.filter(
    (a) => a.compatibleProviders === 'all' || a.compatibleProviders.includes(provider)
  );
}

// Schema definitions — AgentSchema derived from registry
export const AgentSchema = z.enum(AGENT_IDS);

export const PassSchema = z.object({
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

export const LimitsSchema = z.object({
  max_files: z.number().default(50),
  max_diff_lines: z.number().default(2000),
  max_tokens_per_pr: z.number().default(12000),
  max_usd_per_pr: z.number().default(1.0),
  monthly_budget_usd: z.number().default(100),
  /**
   * Maximum tokens for AI completion responses (T035).
   * Used by withTokenCompatibility() for OpenAI API calls.
   * Minimum: 16 (smallest meaningful response)
   * Default: 4000 (sufficient for most code review responses)
   */
  max_completion_tokens: z.number().int().min(16).optional().default(4000),
});

export const GithubReportingSchema = z.object({
  mode: z
    .enum(['checks_only', 'comments_only', 'checks_and_comments'])
    .default('checks_and_comments'),
  max_inline_comments: z.number().default(20),
  summary: z.boolean().default(true),
});

export const ADOReportingSchema = z.object({
  mode: z.enum(['threads_only', 'status_only', 'threads_and_status']).default('threads_and_status'),
  max_inline_comments: z.number().default(20),
  summary: z.boolean().default(true),
  /** Thread status for new findings: Active (1), Pending (6) */
  thread_status: z.enum(['active', 'pending']).default('active'),
});

export const ReportingSchema = z.object({
  github: GithubReportingSchema.optional(),
  ado: ADOReportingSchema.optional(),
});

export const GatingSchema = z.object({
  enabled: z.boolean().default(false),
  fail_on_severity: z.enum(['error', 'warning', 'info']).default('error'),
  /** Suppress inline comments when line validation drift reaches 'fail' level (≥50% degradation). */
  drift_gate: z.boolean().default(false),
});

export const TriggersSchema = z.object({
  on: z.array(z.enum(['pull_request', 'push'])).default(['pull_request']),
  branches: z.array(z.string()).default(['main']),
});

export const PathFiltersSchema = z.object({
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

/**
 * Model configuration.
 * No default - must be explicitly configured via MODEL env or config.models.default
 */
export const ModelsSchema = z.object({
  /** Default model for AI agents when MODEL env var is not set */
  default: z.string().optional(),
});

/**
 * LLM Provider configuration.
 * When set, overrides automatic provider detection.
 * Required when multiple provider keys are present with MODEL set.
 */
export const ProviderSchema = z.enum(['anthropic', 'openai', 'azure-openai', 'ollama']);

// =============================================================================
// Suppression Schema (FR-022)
// =============================================================================

/** Valid matcher IDs for disable_matchers */
const VALID_MATCHER_IDS = [
  'express-error-mw',
  'ts-unused-prefix',
  'exhaustive-switch',
  'react-query-dedup',
  'promise-allsettled-order',
  'safe-local-file-read',
  'exhaustive-type-narrowed-switch',
  'error-object-xss',
  'thin-wrapper-stdlib',
] as const;

export const SuppressionRuleSchema = z
  .object({
    /** Glob pattern against finding.ruleId */
    rule: z.string().optional(),
    /** Anchored regex pattern against finding.message */
    message: z.string().optional(),
    /** Glob pattern against finding.file */
    file: z.string().optional(),
    /** Exact match against finding.severity */
    severity: z.enum(['error', 'warning', 'info']).optional(),
    /** Mandatory audit reason */
    reason: z.string().min(1),
    /** Allow broad suppression (>20 matches in CI) */
    breadth_override: z.boolean().optional(),
    /** Justification for breadth override */
    breadth_override_reason: z.string().optional(),
    /** Person or team who approved the override */
    approved_by: z.string().optional(),
  })
  .refine(
    (rule) => rule.rule !== undefined || rule.message !== undefined || rule.file !== undefined,
    { message: 'Suppression rule must specify at least one of: rule, message, file' }
  )
  .refine(
    (rule) => {
      if (rule.message === undefined) return true;
      if (rule.message.length === 0) return false;
      // FR-022: Message patterns MUST be fully anchored (^ and $).
      if (!(rule.message.startsWith('^') && rule.message.endsWith('$'))) return false;
      // Reject blanket patterns that match everything (^.*$, ^.+$, ^.{0,}$)
      const blanketPatterns = ['^.*$', '^.+$', '^.{0,}$'];
      if (blanketPatterns.includes(rule.message)) return false;
      return true;
    },
    {
      message:
        "Message pattern must be fully anchored (^...$) and not a blanket match. Use '^specific pattern$' for exact match or '^.*specific.*$' for substring.",
    }
  )
  .refine(
    (rule) => {
      if (rule.rule === undefined) return true;
      // Reject blanket rule globs that match all rule IDs
      const blanketGlobs = ['*', '**', '**/*'];
      return !blanketGlobs.includes(rule.rule);
    },
    { message: "Rule glob must be scoped (e.g., 'semantic/*'), not a blanket '*'." }
  )
  .refine(
    (rule) => {
      if (rule.file === undefined) return true;
      // Reject blanket file globs that match all files
      const blanketGlobs = ['*', '**', '**/*', '**/**'];
      return !blanketGlobs.includes(rule.file);
    },
    { message: "File glob must be scoped (e.g., 'tests/**'), not a blanket '**'." }
  )
  .refine(
    (rule) => {
      if (!rule.breadth_override) return true;
      return (
        rule.breadth_override_reason !== undefined &&
        rule.breadth_override_reason.length > 0 &&
        rule.approved_by !== undefined &&
        rule.approved_by.length > 0
      );
    },
    {
      message:
        'breadth_override requires both breadth_override_reason and approved_by to be specified',
    }
  );

export const SuppressionsSchema = z
  .object({
    rules: z.array(SuppressionRuleSchema).default([]),
    /** Matcher IDs to disable in the framework convention filter */
    disable_matchers: z.array(z.enum(VALID_MATCHER_IDS)).default([]),
    /** Rule reasons authorized to suppress error-severity findings with breadth override */
    security_override_allowlist: z.array(z.string()).default([]),
  })
  .refine((s) => s.rules.length <= 50, {
    message: 'Maximum 50 suppression rules allowed',
  });

export type SuppressionRule = z.infer<typeof SuppressionRuleSchema>;
export type Suppressions = z.infer<typeof SuppressionsSchema>;

export const ConfigSchema = z.object({
  version: z.number().default(1),
  trusted_only: z.boolean().default(true),
  triggers: TriggersSchema.default({ on: ['pull_request'], branches: ['main'] }),
  passes: z.array(PassSchema).default([
    // Safe default: static analysis only (no AI agents, no API keys required)
    // Static analysis is required by default - if semgrep fails, the review fails
    // To enable AI agents, create .ai-review.yml in your repository
    { name: 'static', agents: ['semgrep'], enabled: true, required: true },
  ]),
  limits: LimitsSchema.default({
    max_files: 50,
    max_diff_lines: 2000,
    max_tokens_per_pr: 12000,
    max_usd_per_pr: 1.0,
    monthly_budget_usd: 100,
    max_completion_tokens: 4000,
  }),
  models: ModelsSchema.default({}),
  reporting: ReportingSchema.default({}),
  gating: GatingSchema.default({ enabled: false, fail_on_severity: 'error', drift_gate: false }),
  path_filters: PathFiltersSchema.optional(),
  /** Control flow analysis agent configuration (T058) */
  control_flow: ControlFlowConfigSchema.optional(),
  /**
   * Explicit LLM provider selection.
   * When set, overrides automatic provider detection based on API key precedence.
   * REQUIRED when multiple provider keys are present AND MODEL is set (prevents ambiguity).
   */
  provider: ProviderSchema.optional(),
  /** User-configurable finding suppressions (FR-022) */
  suppressions: SuppressionsSchema.optional(),
});

// Type exports
export type Config = z.infer<typeof ConfigSchema>;
export type Pass = z.infer<typeof PassSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type Models = z.infer<typeof ModelsSchema>;
export type AgentId = z.infer<typeof AgentSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
