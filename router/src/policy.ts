/**
 * Policy Module
 * Enforces security policies for agent execution
 */

/**
 * Environment variables for branch detection
 */
export interface BranchEnv {
  GITHUB_REF_NAME?: string;
  GITHUB_REF?: string;
  GITHUB_BASE_REF?: string;
  GITHUB_EVENT_NAME?: string;
}

/**
 * Determine if this is a direct push to main branch (not a PR targeting main).
 *
 * IMPORTANT: This must NOT trigger for pull_request events targeting main.
 * PRs that target main still have GITHUB_BASE_REF=main, but we want LLM
 * agents to run on PRs. We only block direct pushes to main.
 *
 * @returns true if this is a direct push to main (LLM agents should be blocked)
 */
export function isMainBranchPush(env: BranchEnv): boolean {
  // If this is a pull_request event, it's NOT a main branch push
  // (even if the PR targets main)
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    return false;
  }

  // Check if we're directly on main branch
  return env.GITHUB_REF_NAME === 'main' || env.GITHUB_REF === 'refs/heads/main';
}

/**
 * List of LLM agents that are forbidden on direct main branch pushes.
 * These agents run code in-process and could be exploited if run on main.
 */
export const MAIN_BRANCH_FORBIDDEN_AGENTS = ['pr_agent', 'ai_semantic_review'];

/**
 * Check if an agent is forbidden on main branch pushes.
 */
export function isAgentForbiddenOnMain(agentId: string): boolean {
  return MAIN_BRANCH_FORBIDDEN_AGENTS.includes(agentId);
}
