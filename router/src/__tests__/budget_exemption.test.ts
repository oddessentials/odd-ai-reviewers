/**
 * Budget Exemption Tests
 *
 * Tests that verify local_llm (Ollama) is exempt from budget limits
 * while paid LLM agents (opencode, pr_agent) are correctly blocked.
 *
 * This is a critical invariant to prevent regressions - local LLM
 * is free and should never be blocked by cost limits.
 */

import { describe, it, expect } from 'vitest';

/**
 * Helper function to check if an agent would be blocked by budget.
 * This replicates the logic from main.ts for testability.
 */
function shouldSkipDueToBudget(
  agents: { id: string; usesLlm: boolean }[],
  budgetAllowed: boolean
): boolean {
  // Check if this pass uses PAID LLM services and we're over budget
  // Local LLM (Ollama) is exempt from budget checks since it's free
  const usesPaidLlm = agents.some((a) => a.usesLlm && a.id !== 'local_llm');
  return usesPaidLlm && !budgetAllowed;
}

describe('Local LLM Budget Exemption', () => {
  describe('shouldSkipDueToBudget logic', () => {
    it('should NOT skip local_llm when budget is exceeded', () => {
      const agents = [{ id: 'local_llm', usesLlm: true }];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(false);
    });

    it('should skip pr_agent when budget is exceeded', () => {
      const agents = [{ id: 'pr_agent', usesLlm: true }];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(true);
    });

    it('should skip opencode when budget is exceeded', () => {
      const agents = [{ id: 'opencode', usesLlm: true }];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(true);
    });

    it('should skip ai_semantic_review when budget is exceeded', () => {
      const agents = [{ id: 'ai_semantic_review', usesLlm: true }];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(true);
    });

    it('should NOT skip semgrep when budget is exceeded (not LLM)', () => {
      const agents = [{ id: 'semgrep', usesLlm: false }];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(false);
    });

    it('should NOT skip local_llm even when mixed with non-LLM agents', () => {
      const agents = [
        { id: 'semgrep', usesLlm: false },
        { id: 'local_llm', usesLlm: true },
      ];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(false);
    });

    it('should skip pass with mixed paid LLM and local_llm when budget exceeded', () => {
      // If a pass has both local_llm and pr_agent, it should still skip
      // because pr_agent is a paid LLM
      const agents = [
        { id: 'local_llm', usesLlm: true },
        { id: 'pr_agent', usesLlm: true },
      ];
      const budgetAllowed = false; // Budget exceeded

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(true);
    });

    it('should NOT skip any agent when budget is within limits', () => {
      const agents = [
        { id: 'pr_agent', usesLlm: true },
        { id: 'opencode', usesLlm: true },
      ];
      const budgetAllowed = true; // Budget OK

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(false);
    });

    it('should NOT skip local_llm when budget is within limits', () => {
      const agents = [{ id: 'local_llm', usesLlm: true }];
      const budgetAllowed = true; // Budget OK

      const shouldSkip = shouldSkipDueToBudget(agents, budgetAllowed);

      expect(shouldSkip).toBe(false);
    });
  });

  describe('Exhaustive agent ID coverage', () => {
    /**
     * CRITICAL: This test ensures all known LLM agent IDs are covered.
     * If a new paid LLM agent is added, this test should be updated.
     */
    const paidLlmAgents = ['opencode', 'pr_agent', 'ai_semantic_review'];
    const freeLlmAgents = ['local_llm'];
    const nonLlmAgents = ['semgrep', 'reviewdog'];

    it.each(paidLlmAgents)('should block %s when budget exceeded', (agentId) => {
      const agents = [{ id: agentId, usesLlm: true }];
      const shouldSkip = shouldSkipDueToBudget(agents, false);
      expect(shouldSkip).toBe(true);
    });

    it.each(freeLlmAgents)('should allow %s when budget exceeded', (agentId) => {
      const agents = [{ id: agentId, usesLlm: true }];
      const shouldSkip = shouldSkipDueToBudget(agents, false);
      expect(shouldSkip).toBe(false);
    });

    it.each(nonLlmAgents)('should allow %s when budget exceeded (not LLM)', (agentId) => {
      const agents = [{ id: agentId, usesLlm: false }];
      const shouldSkip = shouldSkipDueToBudget(agents, false);
      expect(shouldSkip).toBe(false);
    });
  });
});
