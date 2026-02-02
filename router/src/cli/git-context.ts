/**
 * Git Context Module
 *
 * Provides git repository detection and context inference for local review mode.
 * Uses the path argument as working directory for all operations, enabling
 * `ai-review /some/other/repo` from any directory.
 *
 * Security: All inputs validated via existing assertSafePath/assertSafeGitRef.
 * All git commands use execFileSync with shell: false.
 */

import { execFileSync } from 'child_process';
import { existsSync, statSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { type Result, Ok, Err } from '../types/result.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Git context for local review operations
 */
export interface GitContext {
  /** Absolute path to repository root (contains .git) */
  repoRoot: string;
  /** Current branch name (or 'HEAD' if detached) */
  currentBranch: string;
  /** Detected default branch (main/master/develop) */
  defaultBase: string;
  /** Whether working tree has uncommitted changes */
  hasUncommitted: boolean;
  /** Whether index has staged changes */
  hasStaged: boolean;
}

/**
 * Error codes for git context operations
 * Values match the contract in contracts/git-context.md
 */
export const GitContextErrorCode = {
  NOT_GIT_REPO: 'NOT_GIT_REPO',
  GIT_NOT_FOUND: 'GIT_NOT_FOUND',
  INVALID_PATH: 'INVALID_PATH',
} as const;

export type GitContextErrorCode = (typeof GitContextErrorCode)[keyof typeof GitContextErrorCode];

/**
 * Error type for git context operations
 */
export interface GitContextError {
  code: GitContextErrorCode;
  message: string;
  path?: string;
}

// =============================================================================
// Constants
// =============================================================================

/** Timeout for git commands in milliseconds */
const GIT_TIMEOUT_MS = 30_000;

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Validate a path for basic security requirements.
 *
 * Since we use execFileSync with shell: false, we don't need to block
 * all shell metacharacters. We only validate:
 * - Non-empty path
 * - Reasonable length
 * - No null bytes (which could truncate paths)
 *
 * @param filePath - The path to validate
 * @returns true if valid, false otherwise
 */
function isValidPath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }
  // Reasonable max length
  if (filePath.length > 4096) {
    return false;
  }
  // Block null bytes which could truncate paths
  if (filePath.includes('\0')) {
    return false;
  }
  return true;
}

/**
 * Find the root directory of a git repository by walking up the directory tree.
 *
 * @param cwd - Starting directory (must be absolute path)
 * @returns Result with absolute path to repo root or error
 */
export function findGitRoot(cwd: string): Result<string, GitContextError> {
  // Validate path before filesystem operations
  if (!isValidPath(cwd)) {
    return Err({
      code: GitContextErrorCode.INVALID_PATH,
      message: `Invalid path: ${cwd ? 'path is invalid' : 'path is empty or undefined'}`,
      path: cwd,
    });
  }

  const absolutePath = resolve(cwd);

  // Verify path exists
  if (!existsSync(absolutePath)) {
    return Err({
      code: GitContextErrorCode.INVALID_PATH,
      message: `Path does not exist: ${absolutePath}`,
      path: absolutePath,
    });
  }

  // If it's a file, start from its parent directory
  let currentDir = absolutePath;
  try {
    const stat = statSync(absolutePath);
    if (!stat.isDirectory()) {
      currentDir = dirname(absolutePath);
    }
  } catch {
    return Err({
      code: GitContextErrorCode.INVALID_PATH,
      message: `Cannot access path: ${absolutePath}`,
      path: absolutePath,
    });
  }

  // Walk up directory tree looking for .git
  let previousDir = '';
  while (currentDir !== previousDir) {
    const gitPath = join(currentDir, '.git');

    // Check if .git exists (can be directory or file for worktrees)
    if (existsSync(gitPath)) {
      return Ok(currentDir);
    }

    previousDir = currentDir;
    currentDir = dirname(currentDir);
  }

  // Reached filesystem root without finding .git
  return Err({
    code: GitContextErrorCode.NOT_GIT_REPO,
    message: `Not a git repository (or any parent up to root)`,
    path: absolutePath,
  });
}

/**
 * Get the current branch name.
 *
 * @param repoPath - Path to repository root
 * @returns Branch name or 'HEAD' if detached
 */
export function getCurrentBranch(repoPath: string): string {
  try {
    const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    return branch || 'HEAD';
  } catch {
    // Return 'HEAD' on any error (detached state or command failure)
    return 'HEAD';
  }
}

/**
 * Detect the default/base branch for the repository.
 *
 * Priority order:
 * 1. origin/HEAD target (e.g., "origin/main")
 * 2. Local or remote 'main' branch
 * 3. Local or remote 'master' branch
 * 4. Local or remote 'develop' branch
 * 5. First available branch
 *
 * @param repoPath - Path to repository root
 * @returns Branch name (always returns something)
 */
export function detectDefaultBranch(repoPath: string): string {
  // Try to get origin/HEAD target first
  try {
    const originHead = execFileSync(
      'git',
      ['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'],
      {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    ).trim();

    if (originHead) {
      // Returns something like "origin/main" - extract branch name
      return originHead.replace(/^origin\//, '');
    }
  } catch {
    // origin/HEAD not set, continue with fallbacks
  }

  // Helper to check if a ref exists
  const refExists = (ref: string): boolean => {
    try {
      execFileSync('git', ['rev-parse', '--verify', ref], {
        cwd: repoPath,
        encoding: 'utf-8',
        timeout: GIT_TIMEOUT_MS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return true;
    } catch {
      return false;
    }
  };

  // Check common branch names in priority order
  const candidates = ['main', 'master', 'develop'];

  for (const branch of candidates) {
    // Check local branch first
    if (refExists(branch)) {
      return branch;
    }
    // Check remote branch
    if (refExists(`origin/${branch}`)) {
      return branch;
    }
  }

  // Fall back to first available branch
  try {
    const branches = execFileSync('git', ['branch', '--format=%(refname:short)'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split('\n')
      .filter((b) => b.length > 0);

    if (branches.length > 0 && branches[0]) {
      return branches[0];
    }
  } catch {
    // Ignore errors
  }

  // Ultimate fallback - return 'main' and let downstream error if invalid
  return 'main';
}

/**
 * Check if the working tree has uncommitted changes.
 *
 * @param repoPath - Path to repository root
 * @returns true if there are uncommitted changes (staged or unstaged)
 */
export function hasUncommittedChanges(repoPath: string): boolean {
  try {
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return status.trim().length > 0;
  } catch {
    // Assume no changes on error
    return false;
  }
}

/**
 * Check if the index has staged changes.
 *
 * @param repoPath - Path to repository root
 * @returns true if there are staged changes
 */
export function hasStagedChanges(repoPath: string): boolean {
  try {
    const staged = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return staged.trim().length > 0;
  } catch {
    // Assume no staged changes on error
    return false;
  }
}

/**
 * Infer complete git context for local review.
 *
 * @param cwd - Starting directory (path argument from CLI)
 * @returns Result with GitContext or error
 */
export function inferGitContext(cwd: string): Result<GitContext, GitContextError> {
  // Find repository root
  const rootResult = findGitRoot(cwd);
  if (!rootResult.ok) {
    return rootResult;
  }

  const repoRoot = rootResult.value;

  // Verify git is available
  try {
    execFileSync('git', ['--version'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    return Err({
      code: GitContextErrorCode.GIT_NOT_FOUND,
      message: 'git command not found. Please install git and ensure it is in your PATH.',
      path: repoRoot,
    });
  }

  // Build context
  const context: GitContext = {
    repoRoot,
    currentBranch: getCurrentBranch(repoRoot),
    defaultBase: detectDefaultBranch(repoRoot),
    hasUncommitted: hasUncommittedChanges(repoRoot),
    hasStaged: hasStagedChanges(repoRoot),
  };

  return Ok(context);
}
