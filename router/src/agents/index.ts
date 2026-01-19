/**
 * Agent Interface and Registry
 * Defines the contract for all review agents
 */

import type { DiffFile, DiffSummary } from '../diff.js';
import type { Config } from '../config.js';

/**
 * Severity levels for findings
 */
export type Severity = 'error' | 'warning' | 'info';

/**
 * A single finding from a review agent
 */
export interface Finding {
    /** Severity of the finding */
    severity: Severity;
    /** File path relative to repo root */
    file: string;
    /** Line number (1-indexed), if applicable */
    line?: number;
    /** End line for multi-line findings */
    endLine?: number;
    /** Human-readable message */
    message: string;
    /** Suggested fix or improvement */
    suggestion?: string;
    /** Rule or check ID */
    ruleId?: string;
    /** Agent that produced this finding */
    sourceAgent: string;
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

/**
 * Agent registry
 */
const agents = new Map<string, ReviewAgent>();

/**
 * Register an agent
 */
export function registerAgent(agent: ReviewAgent): void {
    agents.set(agent.id, agent);
}

/**
 * Get an agent by ID
 */
export function getAgent(id: string): ReviewAgent | undefined {
    return agents.get(id);
}

/**
 * Get all registered agents
 */
export function getAllAgents(): ReviewAgent[] {
    return Array.from(agents.values());
}

/**
 * Filter agents by IDs
 */
export function getAgentsByIds(ids: string[]): ReviewAgent[] {
    return ids.map((id) => agents.get(id)).filter((a): a is ReviewAgent => a !== undefined);
}

// Import and register agents
import { semgrepAgent } from './semgrep.js';
import { opencodeAgent } from './opencode.js';
import { reviewdogAgent } from './reviewdog.js';
import { prAgentAgent } from './pr_agent.js';
import { localLlmAgent } from './local_llm.js';

registerAgent(semgrepAgent);
registerAgent(opencodeAgent);
registerAgent(reviewdogAgent);
registerAgent(prAgentAgent);
registerAgent(localLlmAgent);
