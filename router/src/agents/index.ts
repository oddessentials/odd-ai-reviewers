/**
 * Agent Interface and Registry
 *
 * Re-exports types from ./types.ts for backward compatibility.
 * Manages agent registration and lookup.
 */

// Re-export all types from types.ts for backward compatibility
export type {
  Severity,
  Finding,
  AgentMetrics,
  AgentResult,
  AgentContext,
  ReviewAgent,
} from './types.js';

// Import types for internal use
import type { ReviewAgent } from './types.js';

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
import { aiSemanticReviewAgent } from './ai_semantic_review.js';

registerAgent(semgrepAgent);
registerAgent(opencodeAgent); // Uses fictional API - to be updated for real OpenCode CLI
registerAgent(reviewdogAgent);
registerAgent(prAgentAgent);
registerAgent(localLlmAgent);
registerAgent(aiSemanticReviewAgent); // Direct OpenAI SDK integration
