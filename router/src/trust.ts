/**
 * Trust Module
 * Validates whether a PR should be reviewed based on trust rules
 */

import type { Config } from './config.js';

export interface PullRequestContext {
  /** PR number */
  number: number;
  /** Source repository full name (owner/repo) */
  headRepo: string;
  /** Target repository full name (owner/repo) */
  baseRepo: string;
  /** Author's username */
  author: string;
  /** Whether the PR is from a fork */
  isFork: boolean;
  /** Whether the PR is marked as draft */
  isDraft: boolean;
}

export interface TrustResult {
  trusted: boolean;
  reason?: string;
}

/**
 * Check if a PR is trusted and should be reviewed
 */
export function checkTrust(context: PullRequestContext, config: Config): TrustResult {
  // Skip draft PRs
  if (context.isDraft) {
    return {
      trusted: false,
      reason: 'Skipping draft PR',
    };
  }

  // If trusted_only is enabled, block fork PRs
  if (config.trusted_only && context.isFork) {
    return {
      trusted: false,
      reason: `Fork PRs are not trusted (${context.headRepo} → ${context.baseRepo})`,
    };
  }

  // All checks passed
  return { trusted: true };
}

/**
 * Build PR context from GitHub event payload
 */
export function buildPRContext(payload: GitHubPullRequestPayload): PullRequestContext {
  const pr = payload.pull_request;

  return {
    number: pr.number,
    headRepo: pr.head.repo?.full_name ?? '',
    baseRepo: pr.base.repo.full_name,
    author: pr.user.login,
    isFork: pr.head.repo?.full_name !== pr.base.repo.full_name,
    isDraft: pr.draft ?? false,
  };
}

// GitHub API types (simplified)
export interface GitHubPullRequestPayload {
  pull_request: {
    number: number;
    draft?: boolean;
    user: { login: string };
    head: {
      sha: string;
      ref: string;
      repo?: { full_name: string };
    };
    base: {
      sha: string;
      ref: string;
      repo: { full_name: string };
    };
  };
}

/**
 * Build PR context from Azure DevOps environment variables
 * Returns null if not running in an ADO PR context
 */
export function buildADOPRContext(
  env: Record<string, string | undefined>
): PullRequestContext | null {
  const prId = env['SYSTEM_PULLREQUEST_PULLREQUESTID'];
  if (!prId) return null; // Not a PR build

  const sourceRepoUri = env['SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI'] ?? '';
  const targetRepoUri = env['BUILD_REPOSITORY_URI'] ?? '';

  return {
    number: parseInt(prId, 10),
    headRepo: sourceRepoUri,
    baseRepo: targetRepoUri,
    author: env['BUILD_REQUESTEDFOR'] ?? 'unknown',
    isFork: sourceRepoUri !== '' && sourceRepoUri !== targetRepoUri,
    isDraft: false, // Default - requires API call to enrich
  };
}

/**
 * Check if a PR is in draft status via ADO API
 * ADO doesn't expose draft status in environment variables
 */
export async function isPRDraft(
  organization: string,
  project: string,
  repositoryId: string,
  pullRequestId: number,
  token: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repositoryId}/pullRequests/${pullRequestId}?api-version=7.1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      console.warn(`[trust] Failed to fetch PR details: ${response.status}`);
      return false; // Fail open - assume not draft
    }

    const pr = (await response.json()) as { isDraft?: boolean };
    return pr.isDraft === true;
  } catch (error) {
    console.warn(`[trust] Error checking draft status: ${error}`);
    return false; // Fail open - assume not draft
  }
}
