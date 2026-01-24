/**
 * Pass Execution Module
 *
 * Handles execution of all agent passes with proper caching, budget checks,
 * and error handling. Extracted from main.ts lines 315-427.
 */

import type { Config } from '../config.js';
import type { AgentContext, AgentResult, Finding } from '../agents/types.js';
import { getAgentsByIds } from '../agents/index.js';
import { resolveProvider } from '../config.js';
import { buildAgentEnv, isKnownAgentId } from '../agents/security.js';
import { getCached, setCache } from '../cache/store.js';
import { generateCacheKey } from '../cache/key.js';
import { isMainBranchPush, isAgentForbiddenOnMain } from '../policy.js';
import type { BudgetCheck } from '../budget.js';

export interface SkippedAgent {
  id: string;
  name: string;
  reason: string;
}

export interface ExecuteOptions {
  pr?: number;
  head?: string;
  configHash: string;
}

export interface ExecuteResult {
  allFindings: Finding[];
  allResults: AgentResult[];
  skippedAgents: SkippedAgent[];
}

/**
 * Execute all enabled passes and their agents.
 *
 * Handles:
 * - Pass-level budget enforcement (skip optional paid LLM passes when over budget)
 * - Agent-level caching (cache hits skip execution)
 * - Policy enforcement (forbid in-process LLM on main branch push)
 * - Error handling (required agents fail fast, optional agents continue)
 */
export async function executeAllPasses(
  config: Config,
  agentContext: AgentContext,
  routerEnv: Record<string, string | undefined>,
  budgetCheck: BudgetCheck,
  options: ExecuteOptions
): Promise<ExecuteResult> {
  const allFindings: Finding[] = [];
  const allResults: AgentResult[] = [];
  const skippedAgents: SkippedAgent[] = [];

  for (const pass of config.passes) {
    if (!pass.enabled) {
      console.log(`[router] Skipping disabled pass: ${pass.name}`);
      continue;
    }

    console.log(`[router] Running pass: ${pass.name} (required: ${pass.required})`);
    const agents = getAgentsByIds(pass.agents);

    // Check if this pass uses PAID LLM services and we're over budget
    // Local LLM (Ollama) is exempt from budget checks since it's free
    const usesPaidLlm = agents.some((a) => a.usesLlm && a.id !== 'local_llm');
    if (usesPaidLlm && !budgetCheck.allowed) {
      if (pass.required) {
        console.error(`[router] ❌ Required pass ${pass.name} blocked by budget limit`);
        process.exit(1);
      }
      console.log(`[router] Skipping optional paid LLM pass due to budget: ${pass.name}`);
      for (const agent of agents) {
        skippedAgents.push({ id: agent.id, name: agent.name, reason: 'Budget limit exceeded' });
      }
      continue;
    }

    for (const agent of agents) {
      console.log(`[router] Running agent: ${agent.name} (${agent.id})`);

      try {
        if (!isKnownAgentId(agent.id)) {
          throw new Error(`Unknown agent id "${agent.id}" has no allowlisted environment`);
        }

        // Check if LLM agent is forbidden on main branch pushes
        // Note: PRs targeting main are allowed (isMainBranchPush returns false for PRs)
        if (isMainBranchPush(routerEnv) && isAgentForbiddenOnMain(agent.id)) {
          console.error(
            `[router] Policy violation: in-process LLM agent "${agent.id}" is forbidden on direct main push`
          );
          process.exit(1);
        }

        const scopedContext: AgentContext = {
          ...agentContext,
          env: buildAgentEnv(agent.id, routerEnv),
          provider: resolveProvider(agent.id as Parameters<typeof resolveProvider>[0], routerEnv),
        };

        let result: AgentResult | null = null;

        // Check cache
        if (options.pr && options.head) {
          const cacheKey = generateCacheKey({
            prNumber: options.pr,
            headSha: options.head,
            configHash: options.configHash,
            agentId: agent.id,
          });
          const cached = await getCached(cacheKey);
          if (cached) {
            console.log(`[router] Cache hit for ${agent.id}`);
            result = cached;
          }
        }

        // Execute agent if not cached
        if (!result) {
          result = await agent.run(scopedContext);

          // Cache successful results
          if (options.pr && options.head && result.success) {
            const cacheKey = generateCacheKey({
              prNumber: options.pr,
              headSha: options.head,
              configHash: options.configHash,
              agentId: agent.id,
            });
            await setCache(cacheKey, result);
          }
        }
        allResults.push(result);

        if (result.success) {
          console.log(
            `[router] ${agent.name}: ${result.findings.length} findings in ${result.metrics.durationMs}ms`
          );
          allFindings.push(...result.findings);
        } else {
          // Agent failed - check if pass is required
          if (pass.required) {
            console.error(`[router] ❌ Required agent ${agent.name} failed: ${result.error}`);
            process.exit(1);
          }
          // Optional agent failed - log skip reason and continue
          console.log(`[router] ⏭️  Optional agent ${agent.name} skipped: ${result.error}`);
          skippedAgents.push({
            id: agent.id,
            name: agent.name,
            reason: result.error || 'Unknown error',
          });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (pass.required) {
          console.error(`[router] ❌ Required agent ${agent.name} crashed: ${errorMsg}`);
          process.exit(1);
        }
        console.error(`[router] ⏭️  Optional agent ${agent.name} crashed: ${errorMsg}`);
        skippedAgents.push({ id: agent.id, name: agent.name, reason: errorMsg });
      }
    }
  }

  return {
    allFindings,
    allResults,
    skippedAgents,
  };
}
