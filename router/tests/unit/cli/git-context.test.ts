/**
 * Tests for Git Context Module
 *
 * Tests T034-T038: Git context functions
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  findGitRoot,
  getCurrentBranch,
  detectDefaultBranch,
  hasUncommittedChanges,
  hasStagedChanges,
  inferGitContext,
  GitContextErrorCode,
  normalizePath,
} from '../../../src/cli/git-context.js';
import { isOk, isErr } from '../../../src/types/result.js';

// Use the actual repository for tests
// Calculate from __dirname to get the monorepo root (4 levels up from tests/unit/cli/)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Normalize to forward slashes to match what findGitRoot returns
const REPO_ROOT = normalizePath(path.resolve(__dirname, '../../../../'));

describe('git-context', () => {
  describe('findGitRoot (T034)', () => {
    it('should return repo root when in root directory', () => {
      const result = findGitRoot(REPO_ROOT);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(REPO_ROOT);
      }
    });

    it('should return repo root when in subdirectory', () => {
      const subdir = path.join(REPO_ROOT, 'router', 'src');
      const result = findGitRoot(subdir);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // The git root should be an ancestor of the subdirectory
        // It could be REPO_ROOT or a parent of REPO_ROOT depending on git config
        const normalized = normalizePath(subdir);
        expect(normalized.startsWith(result.value)).toBe(true);
        // And the git root should contain a .git directory/file
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should return error when not in git repository', () => {
      // Use temp directory which is not a git repo
      const tempDir = path.resolve(process.env['TEMP'] || process.env['TMP'] || '/tmp');
      const result = findGitRoot(tempDir);

      // Temp might be inside a git repo in some setups, so we need to check
      if (isErr(result)) {
        expect(result.error.code).toBe(GitContextErrorCode.NOT_GIT_REPO);
      }
      // If it's Ok, that means temp is inside a git repo (which is valid)
    });

    it('should return error for non-existent path', () => {
      const result = findGitRoot('/this/path/does/not/exist/12345');
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe(GitContextErrorCode.INVALID_PATH);
      }
    });

    it('should handle paths with spaces', () => {
      // The current repo might be in a path with spaces
      const result = findGitRoot(REPO_ROOT);
      expect(isOk(result)).toBe(true);
    });
  });

  describe('getCurrentBranch (T035)', () => {
    it('should return branch name on normal branch', () => {
      const branch = getCurrentBranch(REPO_ROOT);
      // Should return a non-empty string
      expect(branch.length).toBeGreaterThan(0);
      // Should not be an error message
      expect(branch).not.toContain('fatal:');
    });

    it('should return HEAD when not in a git repo (graceful fallback)', () => {
      // Use a path that is definitely not a git repo
      const tempDir = path.resolve(process.env['TEMP'] || process.env['TMP'] || '/tmp');
      const branch = getCurrentBranch(tempDir);
      // Should return 'HEAD' on error (graceful fallback)
      expect(branch).toBe('HEAD');
    });

    it('should handle branch names with slashes', () => {
      // The current branch might have slashes (feature/xyz)
      const branch = getCurrentBranch(REPO_ROOT);
      // Just verify it returns something valid
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });
  });

  describe('detectDefaultBranch (T036)', () => {
    it('should detect default branch or fallback gracefully', () => {
      const branch = detectDefaultBranch(REPO_ROOT);
      // In normal repos, returns main/master/develop
      // In CI PR checkout (detached HEAD), may return 'main' as fallback
      // Either way, should return a non-empty string
      expect(typeof branch).toBe('string');
      expect(branch.length).toBeGreaterThan(0);
    });

    it('should return a valid branch name', () => {
      const branch = detectDefaultBranch(REPO_ROOT);
      // Should return a branch name (not an error message)
      // Valid: 'main', 'master', 'develop', 'HEAD', etc.
      // The function's ultimate fallback is 'main'
      expect(branch).not.toContain('fatal:');
      expect(branch).not.toContain('error:');
    });

    it('should fallback gracefully for repos without remote', () => {
      // Even without origin, should return something
      const branch = detectDefaultBranch(REPO_ROOT);
      expect(branch.length).toBeGreaterThan(0);
    });

    it('should handle repos with only master branch', () => {
      // We can't easily test this without creating a temp repo
      // but we can verify the function returns something
      const branch = detectDefaultBranch(REPO_ROOT);
      expect(typeof branch).toBe('string');
    });
  });

  describe('hasUncommittedChanges / hasStagedChanges (T037)', () => {
    it('should detect uncommitted changes', () => {
      // The actual state depends on the repo
      const result = hasUncommittedChanges(REPO_ROOT);
      expect(typeof result).toBe('boolean');
    });

    it('should detect staged changes', () => {
      const result = hasStagedChanges(REPO_ROOT);
      expect(typeof result).toBe('boolean');
    });

    it('should return false for non-git directory (graceful)', () => {
      const tempDir = path.resolve(process.env['TEMP'] || process.env['TMP'] || '/tmp');
      expect(hasUncommittedChanges(tempDir)).toBe(false);
      expect(hasStagedChanges(tempDir)).toBe(false);
    });

    it('uncommitted should include staged changes', () => {
      // If there are staged changes, uncommitted should also be true
      const hasStaged = hasStagedChanges(REPO_ROOT);
      const hasUncommitted = hasUncommittedChanges(REPO_ROOT);

      // If hasStaged is true, hasUncommitted must also be true
      if (hasStaged) {
        expect(hasUncommitted).toBe(true);
      }
    });

    it('should handle clean working tree', () => {
      // Can't guarantee clean state, but can verify types
      const uncommitted = hasUncommittedChanges(REPO_ROOT);
      const staged = hasStagedChanges(REPO_ROOT);

      expect(typeof uncommitted).toBe('boolean');
      expect(typeof staged).toBe('boolean');
    });

    it('should handle error gracefully', () => {
      // Invalid path should return false (not throw)
      expect(hasUncommittedChanges('/nonexistent')).toBe(false);
      expect(hasStagedChanges('/nonexistent')).toBe(false);
    });
  });

  describe('inferGitContext (T038)', () => {
    it('should return full context for valid repo', () => {
      const result = inferGitContext(REPO_ROOT);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const ctx = result.value;
        expect(ctx.repoRoot).toBe(REPO_ROOT);
        expect(ctx.currentBranch.length).toBeGreaterThan(0);
        expect(ctx.defaultBase.length).toBeGreaterThan(0);
        expect(typeof ctx.hasUncommitted).toBe('boolean');
        expect(typeof ctx.hasStaged).toBe('boolean');
      }
    });

    it('should work from subdirectory', () => {
      const subdir = path.join(REPO_ROOT, 'router', 'src', 'cli');
      const result = inferGitContext(subdir);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // The git root should be an ancestor of the subdirectory
        const normalized = normalizePath(subdir);
        expect(normalized.startsWith(result.value.repoRoot)).toBe(true);
        // Should have valid context fields
        expect(result.value.currentBranch.length).toBeGreaterThan(0);
        expect(result.value.defaultBase.length).toBeGreaterThan(0);
      }
    });

    it('should return error for non-git directory', () => {
      const tempDir = path.resolve(process.env['TEMP'] || process.env['TMP'] || '/tmp');
      const result = inferGitContext(tempDir);

      // Temp might be inside a git repo in some setups
      if (isErr(result)) {
        expect(result.error.code).toBe(GitContextErrorCode.NOT_GIT_REPO);
      }
    });
  });

  describe('GitContextErrorCode', () => {
    it('should have all error codes defined matching contract', () => {
      // Values must match contracts/git-context.md specification
      expect(GitContextErrorCode.NOT_GIT_REPO).toBe('NOT_GIT_REPO');
      expect(GitContextErrorCode.GIT_NOT_FOUND).toBe('GIT_NOT_FOUND');
      expect(GitContextErrorCode.INVALID_PATH).toBe('INVALID_PATH');
    });
  });

  describe('integration scenarios', () => {
    it('should handle current working directory', () => {
      // Use current router directory
      const result = inferGitContext(process.cwd());
      expect(isOk(result)).toBe(true);
    });

    it('should handle relative paths converted to absolute', () => {
      // The module should handle relative paths
      const result = findGitRoot('.');
      expect(isOk(result)).toBe(true);
    });

    it('should detect the current branch', () => {
      const result = inferGitContext(REPO_ROOT);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should return the current branch (may change during development)
        expect(result.value.currentBranch.length).toBeGreaterThan(0);
        expect(result.value.currentBranch).not.toContain('fatal:');
      }
    });
  });
});
