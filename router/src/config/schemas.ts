/**
 * Configuration Schema Module
 *
 * All Zod schema definitions for configuration validation.
 * Extracted from config.ts to improve modularity.
 */

import { z } from 'zod';
import { ControlFlowConfigSchema } from '../agents/control_flow/types.js';

// Schema definitions
export const AgentSchema = z.enum([
  'semgrep',
  'reviewdog',
  'opencode',
  'pr_agent',
  'local_llm',
  'ai_semantic_review',
  'control_flow',
]);

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
});

// Type exports
export type Config = z.infer<typeof ConfigSchema>;
export type Pass = z.infer<typeof PassSchema>;
export type Limits = z.infer<typeof LimitsSchema>;
export type Models = z.infer<typeof ModelsSchema>;
export type AgentId = z.infer<typeof AgentSchema>;
export type Provider = z.infer<typeof ProviderSchema>;
