/**
 * Git Context Module
 *
 * Provides git repository detection and context inference for local review mode.
 * All git operations use the path argument as working directory, not process cwd.
 *
 * Security: Uses execFileSync with shell: false and validates all inputs.
 *
 * @module cli/git-context
 */

import { execFileSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { resolve, dirname, parse as parsePath } from 'path';
import { Ok, Err, type Result } from '../types/result.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Git context error codes
 */
export type GitContextErrorCode = 'NOT_GIT_REPO' | 'GIT_NOT_FOUND' | 'INVALID_PATH' | 'GIT_ERROR';

/**
 * Git context error with code and message
 */
export interface GitContextError {
  readonly code: GitContextErrorCode;
  readonly message: string;
  readonly path?: string;
}

/**
 * Represents the inferred git repository context for local review.
 * Immutable snapshot, regenerated per command invocation.
 */
export interface GitContext {
  /** Absolute path to repository root (contains .git directory) */
  readonly repoRoot: string;
  /** Current branch name (or 'HEAD' if detached) */
  readonly currentBranch: string;
  /** Detected default branch (main/master/develop) */
  readonly defaultBase: string;
  /** Whether working tree has uncommitted changes */
  readonly hasUncommitted: boolean;
  /** Whether index has staged changes */
  readonly hasStaged: boolean;
}

// =============================================================================
// Constants
// =============================================================================

/** Git command timeout in milliseconds */
const GIT_TIMEOUT_MS = 30_000;

/** Default branches to check in priority order */
const DEFAULT_BRANCHES = ['main', 'master', 'develop'] as const;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Execute a git command safely with shell: false
 */
function execGit(args: string[], cwd: string): Result<string, GitContextError> {
  try {
    const result = execFileSync('git', args, {
      cwd,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      shell: false, // Security: never use shell
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return Ok(result.trim());
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { status?: number };

    // Check if git is not found
    if (err.code === 'ENOENT') {
      return Err({
        code: 'GIT_NOT_FOUND',
        message: 'git command not found. Please install git and ensure it is in your PATH.',
      });
    }

    // Git command failed
    return Err({
      code: 'GIT_ERROR',
      message: err.message || 'Git command failed',
      path: cwd,
    });
  }
}

/**
 * Check if a path contains a .git directory or file
 */
function hasGitDir(dirPath: string): boolean {
  const gitPath = resolve(dirPath, '.git');
  return existsSync(gitPath);
}

// =============================================================================
// Public Functions
// =============================================================================

/**
 * Find the root directory of a git repository.
 *
 * Walks up the directory tree from cwd until it finds a .git directory/file.
 *
 * @param cwd - Starting directory
 * @returns Repository root path or error
 */
export function findGitRoot(cwd: string): Result<string, GitContextError> {
  // Validate path exists
  const absolutePath = resolve(cwd);

  if (!existsSync(absolutePath)) {
    return Err({
      code: 'INVALID_PATH',
      message: `Path does not exist: ${cwd}`,
      path: cwd,
    });
  }

  // Start from the provided path
  let currentDir = absolutePath;

  // If it's a file, start from its directory
  try {
    const stats = statSync(absolutePath);
    if (!stats.isDirectory()) {
      currentDir = dirname(absolutePath);
    }
  } catch {
    return Err({
      code: 'INVALID_PATH',
      message: `Cannot access path: ${cwd}`,
      path: cwd,
    });
  }

  // Walk up the directory tree
  const { root } = parsePath(currentDir);

  while (currentDir !== root) {
    if (hasGitDir(currentDir)) {
      return Ok(currentDir);
    }
    const parent = dirname(currentDir);
    if (parent === currentDir) break; // Reached filesystem root
    currentDir = parent;
  }

  // Check root itself
  if (hasGitDir(currentDir)) {
    return Ok(currentDir);
  }

  return Err({
    code: 'NOT_GIT_REPO',
    message: `Not a git repository (or any parent up to mount point ${root})`,
    path: cwd,
  });
}

/**
 * Get the current branch name.
 *
 * @param repoPath - Repository root path
 * @returns Branch name, or 'HEAD' if in detached state
 */
export function getCurrentBranch(repoPath: string): string {
  const result = execGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);

  if (!result.ok) {
    return 'HEAD';
  }

  return result.value || 'HEAD';
}

/**
 * Detect the default/base branch for the repository.
 *
 * Priority:
 * 1. origin/HEAD target (e.g., "origin/main")
 * 2. Local main branch
 * 3. Remote origin/main branch
 * 4. Local master branch
 * 5. Remote origin/master branch
 * 6. Local develop branch
 * 7. First available branch
 *
 * @param repoPath - Repository root path
 * @returns Default branch name
 */
export function detectDefaultBranch(repoPath: string): string {
  // Try to get origin/HEAD reference
  const originHead = execGit(['symbolic-ref', 'refs/remotes/origin/HEAD'], repoPath);
  if (originHead.ok && originHead.value) {
    // Extract branch name from refs/remotes/origin/main
    const match = originHead.value.match(/refs\/remotes\/origin\/(.+)$/);
    if (match?.[1]) {
      return match[1];
    }
  }

  // Check each default branch in priority order
  for (const branch of DEFAULT_BRANCHES) {
    // Check local branch
    const localRef = execGit(['rev-parse', '--verify', `refs/heads/${branch}`], repoPath);
    if (localRef.ok) {
      return branch;
    }

    // Check remote branch
    const remoteRef = execGit(['rev-parse', '--verify', `refs/remotes/origin/${branch}`], repoPath);
    if (remoteRef.ok) {
      return `origin/${branch}`;
    }
  }

  // Fallback: get first branch from git branch
  const branches = execGit(['branch', '--format=%(refname:short)'], repoPath);
  if (branches.ok && branches.value) {
    const firstBranch = branches.value.split('\n')[0]?.trim();
    if (firstBranch) {
      return firstBranch;
    }
  }

  // Ultimate fallback
  return 'main';
}

/**
 * Check if working tree has uncommitted changes.
 *
 * Includes both staged and unstaged changes, but excludes untracked files.
 *
 * @param repoPath - Repository root path
 * @returns true if there are uncommitted changes
 */
export function hasUncommittedChanges(repoPath: string): boolean {
  // git status --porcelain returns non-empty if there are changes
  const result = execGit(['status', '--porcelain', '-uno'], repoPath);

  if (!result.ok) {
    return false;
  }

  return result.value.length > 0;
}

/**
 * Check if index has staged changes.
 *
 * @param repoPath - Repository root path
 * @returns true if there are staged changes
 */
export function hasStagedChanges(repoPath: string): boolean {
  // git diff --cached --name-only returns non-empty if there are staged changes
  const result = execGit(['diff', '--cached', '--name-only'], repoPath);

  if (!result.ok) {
    return false;
  }

  return result.value.length > 0;
}

/**
 * Infer full git context for local review.
 *
 * @param cwd - Starting directory (can be any path within the repository)
 * @returns Full GitContext or error
 */
export function inferGitContext(cwd: string): Result<GitContext, GitContextError> {
  // Find repository root
  const rootResult = findGitRoot(cwd);
  if (!rootResult.ok) {
    return rootResult;
  }

  const repoRoot = rootResult.value;

  // Gather all context
  const currentBranch = getCurrentBranch(repoRoot);
  const defaultBase = detectDefaultBranch(repoRoot);
  const hasUncommitted = hasUncommittedChanges(repoRoot);
  const hasStaged = hasStagedChanges(repoRoot);

  return Ok({
    repoRoot,
    currentBranch,
    defaultBase,
    hasUncommitted,
    hasStaged,
  });
}
