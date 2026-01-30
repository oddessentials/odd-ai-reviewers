/**
 * Agent Types Module
 *
 * Shared types for the agent system. Extracted from agents/index.ts
 * to break circular dependencies between agent implementations and the registry.
 *
 * AgentResult Discriminated Union (011-agent-result-unions):
 * - AgentResult is a discriminated union with status: 'success' | 'failure' | 'skipped'
 * - Use constructor helpers: AgentSuccess(), AgentFailure(), AgentSkipped()
 * - Handle all variants with switch + assertNever in default
 */

import type { DiffFile, DiffSummary } from '../diff.js';
import type { Config } from '../config.js';
import { z } from 'zod';

/**
 * Severity levels for findings
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * A single finding from a review agent
 *
 * Per CONSOLIDATED.md Section E - Required Finding Schema (v1):
 * Every agent must emit findings with these fields.
 * Router dedupes using: fingerprint + path + start_line
 */
export interface Finding {
  /** Severity of the finding */
  severity: Severity;
  /** File path relative to repo root (path) */
  file: string;
  /** Line number (1-indexed), if applicable (start_line) */
  line?: number;
  /** End line for multi-line findings (end_line) */
  endLine?: number;
  /** Human-readable message */
  message: string;
  /** Suggested fix or improvement */
  suggestion?: string;
  /** Rule or check ID (rule_id) */
  ruleId?: string;
  /** Agent that produced this finding (tool) */
  sourceAgent: string;
  /**
   * Stable fingerprint for deduplication (CONSOLIDATED.md requirement)
   * Generated from: file + line + message + ruleId
   * Used by router for cross-agent deduplication
   */
  fingerprint?: string;
  /** Freeform metadata for tool-specific information */
  metadata?: Record<string, unknown>;
  /**
   * Provenance of the finding - indicates whether it came from a
   * complete agent run or a failed agent's partial results.
   * Optional for backwards compatibility; defaults to 'complete' when absent.
   * (FR-002, 012-fix-agent-result-regressions)
   */
  provenance?: 'complete' | 'partial';
}

/**
 * Metrics from an agent run
 */
export interface AgentMetrics {
  /** Time taken in milliseconds */
  durationMs: number;
  /** Number of files processed */
  filesProcessed: number;
  /** Tokens consumed (for LLM agents) */
  tokensUsed?: number;
  /** Estimated cost in USD (for LLM agents) */
  estimatedCostUsd?: number;
}

// ============================================================================
// AgentResult Discriminated Union (011-agent-result-unions)
// ============================================================================

/**
 * Possible states for an agent run result.
 * Used as the discriminant for the AgentResult union.
 */
export type AgentResultStatus = 'success' | 'failure' | 'skipped';

/**
 * Indicates when during execution the failure occurred.
 * Used by consumers to determine if partialFindings are usable.
 */
export type FailureStage = 'preflight' | 'exec' | 'postprocess';

/**
 * Common fields shared by all AgentResult variants.
 */
interface AgentResultBase {
  /** Unique identifier for the agent that produced this result */
  agentId: string;
  /** Performance and usage metrics from the run */
  metrics: AgentMetrics;
}

/**
 * Result when an agent completes successfully.
 *
 * Invariants:
 * - status is always 'success'
 * - findings array may be empty (agent found nothing)
 * - NO error field
 * - NO reason field
 */
export interface AgentResultSuccess extends AgentResultBase {
  status: 'success';
  /** Findings discovered during the review */
  findings: Finding[];
}

/**
 * Result when an agent fails to complete.
 *
 * Invariants:
 * - status is always 'failure'
 * - error message is required and non-empty
 * - failureStage indicates when failure occurred
 * - partialFindings may contain results gathered before failure
 * - NO reason field
 *
 * IMPORTANT: partialFindings MUST be labeled as partial in reports/telemetry
 * and MUST NOT count toward success metrics.
 */
export interface AgentResultFailure extends AgentResultBase {
  status: 'failure';
  /** Error message describing what went wrong */
  error: string;
  /** When during execution the failure occurred */
  failureStage: FailureStage;
  /** Partial findings gathered before failure (may be empty) */
  partialFindings: Finding[];
}

/**
 * Result when an agent is skipped (not applicable to this PR).
 *
 * Invariants:
 * - status is always 'skipped'
 * - reason explains why the agent was skipped
 * - NO error field
 * - NO findings field
 *
 * Use cases:
 * - No supported files in the diff
 * - Agent disabled in config
 * - Prerequisite not met (e.g., no API key)
 */
export interface AgentResultSkipped extends AgentResultBase {
  status: 'skipped';
  /** Human-readable explanation of why the agent was skipped */
  reason: string;
}

/**
 * Discriminated union representing all possible agent run outcomes.
 *
 * Usage:
 * ```typescript
 * switch (result.status) {
 *   case 'success':
 *     // result is AgentResultSuccess, has findings
 *     break;
 *   case 'failure':
 *     // result is AgentResultFailure, has error + partialFindings
 *     break;
 *   case 'skipped':
 *     // result is AgentResultSkipped, has reason
 *     break;
 *   default:
 *     assertNever(result);
 * }
 * ```
 */
export type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;

// ============================================================================
// Constructor Helpers (FR-002, FR-012)
// Use these instead of object literals to ensure valid field combinations
// ============================================================================

/**
 * Create a successful agent result.
 */
export function AgentSuccess(params: {
  agentId: string;
  findings: Finding[];
  metrics: AgentMetrics;
}): AgentResultSuccess {
  return { status: 'success', ...params };
}

/**
 * Create a failed agent result.
 */
export function AgentFailure(params: {
  agentId: string;
  error: string;
  failureStage: FailureStage;
  partialFindings?: Finding[];
  metrics: AgentMetrics;
}): AgentResultFailure {
  return {
    status: 'failure',
    agentId: params.agentId,
    error: params.error,
    failureStage: params.failureStage,
    partialFindings: params.partialFindings ?? [],
    metrics: params.metrics,
  };
}

/**
 * Create a skipped agent result.
 */
export function AgentSkipped(params: {
  agentId: string;
  reason: string;
  metrics: AgentMetrics;
}): AgentResultSkipped {
  return { status: 'skipped', ...params };
}

// ============================================================================
// Type Guards (FR-001)
// ============================================================================

/**
 * Type guard for success results.
 */
export function isSuccess(result: AgentResult): result is AgentResultSuccess {
  return result.status === 'success';
}

/**
 * Type guard for failure results.
 */
export function isFailure(result: AgentResult): result is AgentResultFailure {
  return result.status === 'failure';
}

/**
 * Type guard for skipped results.
 */
export function isSkipped(result: AgentResult): result is AgentResultSkipped {
  return result.status === 'skipped';
}

// ============================================================================
// Zod Serialization Schema (FR-025)
// Required for cache round-trip safety in cache/store.ts
// ============================================================================

/** Zod schema for AgentMetrics */
export const AgentMetricsSchema = z.object({
  durationMs: z.number(),
  filesProcessed: z.number(),
  tokensUsed: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
});

/** Zod schema for Finding */
export const FindingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  file: z.string(),
  line: z.number().optional(),
  endLine: z.number().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string().optional(),
  sourceAgent: z.string(),
  fingerprint: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  provenance: z.enum(['complete', 'partial']).optional(),
});

/** Zod schema for AgentResultSuccess */
export const AgentResultSuccessSchema = z.object({
  status: z.literal('success'),
  agentId: z.string(),
  findings: z.array(FindingSchema),
  metrics: AgentMetricsSchema,
});

/** Zod schema for AgentResultFailure */
export const AgentResultFailureSchema = z.object({
  status: z.literal('failure'),
  agentId: z.string(),
  error: z.string(),
  failureStage: z.enum(['preflight', 'exec', 'postprocess']),
  partialFindings: z.array(FindingSchema),
  metrics: AgentMetricsSchema,
});

/** Zod schema for AgentResultSkipped */
export const AgentResultSkippedSchema = z.object({
  status: z.literal('skipped'),
  agentId: z.string(),
  reason: z.string(),
  metrics: AgentMetricsSchema,
});

/** Discriminated union schema - validates exact shape */
export const AgentResultSchema = z.discriminatedUnion('status', [
  AgentResultSuccessSchema,
  AgentResultFailureSchema,
  AgentResultSkippedSchema,
]);

/**
 * Cache schema version - bump when AgentResultSchema changes shape.
 * Included in cache keys to invalidate legacy entries.
 * (012-fix-agent-result-regressions, FR-005)
 *
 * History:
 * - v1: Original format (success: boolean, no status field) - DEPRECATED
 * - v2: Discriminated union (status: 'success'|'failure'|'skipped')
 */
export const CACHE_SCHEMA_VERSION = 2;

/**
 * Context provided to agents during review
 */
export interface AgentContext {
  /** Repository root path */
  repoPath: string;
  /** Diff summary */
  diff: DiffSummary;
  /** Filtered files to review */
  files: DiffFile[];
  /** Full configuration */
  config: Config;
  /** Combined diff content for LLM context */
  diffContent: string;
  /** PR number */
  prNumber?: number;
  /** Environment variables (for API keys, etc.) */
  env: Record<string, string | undefined>;
  /**
   * Effective model resolved by router.
   * Precedence: MODEL env > config.models.default
   * INVARIANT: Agents MUST use this. No per-agent defaults.
   */
  effectiveModel: string;
  /**
   * Provider resolved by router.
   * INVARIANT: Anthropic wins if key present and agent supports it.
   * Agents switch on this, never guess provider themselves.
   */
  provider: 'anthropic' | 'openai' | 'azure-openai' | 'ollama' | null;
}

/**
 * Agent interface that all review agents must implement
 */
export interface ReviewAgent {
  /** Unique agent identifier */
  id: string;

  /** Human-readable name */
  name: string;

  /** Whether this agent makes LLM API calls */
  usesLlm: boolean;

  /**
   * Check if this agent supports the given file
   */
  supports(file: DiffFile): boolean;

  /**
   * Run the review on the provided context
   */
  run(context: AgentContext): Promise<AgentResult>;
}
