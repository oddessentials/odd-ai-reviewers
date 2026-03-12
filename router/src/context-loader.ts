/**
 * Context Loader Module
 *
 * Loads and sanitizes contextual information (project rules, PR description)
 * for injection into agent prompts. Implements FR-006, FR-007, FR-008.
 *
 * Security: All fields are sanitized to prevent prompt injection via
 * null bytes, control characters, and oversized content.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { Octokit } from '@octokit/rest';

/**
 * Sanitize a context field by stripping dangerous characters and truncating.
 *
 * @param input - Raw input string
 * @param maxLength - Maximum allowed length (default 2000)
 * @returns Sanitized string
 */
export function sanitizeContextField(input: string, maxLength?: number): string {
  // Strip null bytes
  let sanitized = input.replace(/\0/g, '');

  // Remove control characters except \t (0x09), \n (0x0A), \r (0x0D)
  // eslint-disable-next-line no-control-regex
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // Truncate to maxLength
  if (typeof maxLength === 'number' && sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }

  return sanitized;
}

/**
 * Load project rules from CLAUDE.md in the repository root.
 *
 * @param repoPath - Path to the repository root
 * @returns Sanitized CLAUDE.md content, or undefined if not found
 */
export async function loadProjectRules(repoPath: string): Promise<string | undefined> {
  try {
    const content = await readFile(join(repoPath, 'CLAUDE.md'), 'utf-8');
    return sanitizeContextField(content);
  } catch {
    // File doesn't exist or can't be read - graceful degradation
    return undefined;
  }
}

/**
 * Load PR description from title and body fields.
 *
 * @param title - PR title
 * @param body - PR body/description
 * @returns Sanitized combined description, or undefined if both empty
 */
export async function loadPRDescription(
  title?: string,
  body?: string
): Promise<string | undefined> {
  if (!title && !body) {
    return undefined;
  }

  const parts: string[] = [];
  if (title) parts.push(title);
  if (body) parts.push(body);
  const combined = parts.join('\n\n');

  return sanitizeContextField(combined, 2000);
}

/**
 * Extract PR title and body from the GitHub Actions event payload.
 *
 * GitHub Actions sets GITHUB_EVENT_PATH to a JSON file containing the
 * full webhook event. For pull_request events, this includes title and body.
 * Returns undefined fields for non-PR events, missing files, or parse errors.
 *
 * @param eventPath - Path to the event JSON file (from GITHUB_EVENT_PATH)
 * @returns Object with optional title and body, or undefined fields on failure
 */
export async function loadGitHubEventPR(
  eventPath: string | undefined
): Promise<{ title?: string; body?: string }> {
  if (!eventPath) {
    return {};
  }

  try {
    const content = await readFile(eventPath, 'utf-8');
    const event = JSON.parse(content) as Record<string, unknown>;

    // pull_request events have the PR data directly
    const pr = event['pull_request'] as Record<string, unknown> | undefined;
    if (!pr) {
      // Not a pull_request event (e.g., push, schedule) — degrade cleanly
      return {};
    }

    return {
      title: typeof pr['title'] === 'string' ? pr['title'] : undefined,
      body: typeof pr['body'] === 'string' ? pr['body'] : undefined,
    };
  } catch {
    // File doesn't exist, can't be read, or JSON is malformed — graceful degradation
    return {};
  }
}

/**
 * Fetch PR title and body from the GitHub API using Octokit.
 *
 * This is the fallback path when GITHUB_EVENT_PATH doesn't contain PR data
 * (e.g., workflow_dispatch triggers, external CI without a pull_request event).
 * Requires owner, repo, PR number, and a valid GITHUB_TOKEN.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @param prNumber - Pull request number
 * @param token - GitHub API token
 * @returns Object with optional title and body, or empty object on failure
 */
export async function fetchGitHubPRDetails(
  owner: string,
  repo: string,
  prNumber: number,
  token: string
): Promise<{ title?: string; body?: string }> {
  try {
    const octokit = new Octokit({ auth: token });
    const { data } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      title: typeof data.title === 'string' ? data.title : undefined,
      body: typeof data.body === 'string' ? data.body : undefined,
    };
  } catch (error) {
    console.warn(
      '[router] [context-loader] Failed to fetch PR details from GitHub API:',
      error instanceof Error ? error.message : String(error)
    );
    return {};
  }
}

/**
 * Truncate context fields to fit within a token budget while preserving diff content.
 *
 * Strategy: diff is always preserved; projectRules is truncated first, then prDescription.
 *
 * @param projectRules - Project rules content (may be truncated)
 * @param prDescription - PR description content (may be truncated)
 * @param diffContent - Diff content (always preserved)
 * @param maxTokens - Maximum token budget
 * @returns Truncated fields and whether truncation occurred
 */
export function truncateContext(
  projectRules: string | undefined,
  prDescription: string | undefined,
  diffContent: string,
  maxTokens: number
): {
  projectRules: string | undefined;
  prDescription: string | undefined;
  truncated: boolean;
} {
  // Estimate: 1 token ~ 4 characters
  const budget = maxTokens * 4;
  const total = (projectRules?.length ?? 0) + (prDescription?.length ?? 0) + diffContent.length;

  // If total fits within 90% of budget, no truncation needed
  if (total <= budget * 0.9) {
    return { projectRules, prDescription, truncated: false };
  }

  // Context budget = 90% of total budget minus diff (diff is always preserved)
  const contextBudget = budget * 0.9 - diffContent.length;

  if (contextBudget <= 0) {
    // No room for context at all
    if (projectRules || prDescription) {
      console.log(
        '[router] [context-loader] No budget remaining for context fields after diff allocation'
      );
    }
    return { projectRules: undefined, prDescription: undefined, truncated: true };
  }

  let truncatedRules = projectRules;
  let truncatedDesc = prDescription;
  let truncated = false;

  // Truncate projectRules first
  const TRUNCATION_MARKER = ' [truncated]';
  if (truncatedRules && truncatedRules.length > contextBudget) {
    const originalSize = truncatedRules.length;
    if (contextBudget < TRUNCATION_MARKER.length) {
      // Budget too small for even the marker — drop the field entirely
      truncatedRules = undefined;
      console.log(
        `[router] [context-loader] Truncated projectRules: ${originalSize} -> 0 chars (budget too small for marker)`
      );
    } else {
      const sliceLimit = contextBudget - TRUNCATION_MARKER.length;
      truncatedRules = truncatedRules.slice(0, sliceLimit) + TRUNCATION_MARKER;
      console.log(
        `[router] [context-loader] Truncated projectRules: ${originalSize} -> ${truncatedRules.length} chars`
      );
    }
    truncated = true;
  }

  // Calculate remaining budget after projectRules
  const rulesSize = truncatedRules?.length ?? 0;
  const remainingBudget = contextBudget - rulesSize;

  // Truncate prDescription if needed
  if (truncatedDesc && truncatedDesc.length > remainingBudget) {
    if (remainingBudget <= 0) {
      console.log(
        `[router] [context-loader] Truncated prDescription: ${truncatedDesc.length} -> 0 chars (no budget)`
      );
      truncatedDesc = undefined;
    } else if (remainingBudget < TRUNCATION_MARKER.length) {
      // Budget too small for even the marker — drop the field entirely
      console.log(
        `[router] [context-loader] Truncated prDescription: ${truncatedDesc.length} -> 0 chars (budget too small for marker)`
      );
      truncatedDesc = undefined;
    } else {
      const originalSize = truncatedDesc.length;
      const descSliceLimit = remainingBudget - TRUNCATION_MARKER.length;
      truncatedDesc = truncatedDesc.slice(0, descSliceLimit) + TRUNCATION_MARKER;
      console.log(
        `[router] [context-loader] Truncated prDescription: ${originalSize} -> ${truncatedDesc.length} chars`
      );
    }
    truncated = true;
  }

  return { projectRules: truncatedRules, prDescription: truncatedDesc, truncated };
}
