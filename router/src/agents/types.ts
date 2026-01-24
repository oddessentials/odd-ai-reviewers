/**
 * Agent Types Module
 *
 * Shared types for the agent system. Extracted from agents/index.ts
 * to break circular dependencies between agent implementations and the registry.
 */

import type { DiffFile, DiffSummary } from '../diff.js';
import type { Config } from '../config.js';

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

/**
 * Result from an agent run
 */
export interface AgentResult {
  /** Agent ID */
  agentId: string;
  /** Whether the agent ran successfully */
  success: boolean;
  /** Findings produced */
  findings: Finding[];
  /** Run metrics */
  metrics: AgentMetrics;
  /** Error message if failed */
  error?: string;
}

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
