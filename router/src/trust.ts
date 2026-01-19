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
