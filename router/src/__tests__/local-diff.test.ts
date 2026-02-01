/**
 * Tests for Local Diff Generation (getLocalDiff)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import { getLocalDiff, type LocalDiffOptions } from '../diff.js';

/**
 * Helper to create a temporary git repository with initial commit
 */
function createTempRepo(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'local-diff-test-'));

  execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir, stdio: 'pipe' });

  // Create initial commit
  writeFileSync(join(tempDir, 'README.md'), '# Test Project\n');
  execFileSync('git', ['add', 'README.md'], { cwd: tempDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'Initial commit'], { cwd: tempDir, stdio: 'pipe' });

  return tempDir;
}

/**
 * Helper to cleanup temp directory
 */
function cleanupTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get current branch name
 */
function getCurrentBranch(repoPath: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf-8',
  }).trim();
}

describe('getLocalDiff', () => {
  let tempRepo: string;
  let baseBranch: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
    baseBranch = getCurrentBranch(tempRepo);
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  describe('uncommitted changes', () => {
    it('detects modified files', () => {
      // Modify existing file
      writeFileSync(join(tempRepo, 'README.md'), '# Modified Content\n');

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.length).toBe(1);
      expect(diff.files[0]?.path).toBe('README.md');
      expect(diff.files[0]?.status).toBe('modified');
      expect(diff.totalAdditions).toBeGreaterThan(0);
    });

    it('detects new files', () => {
      // Create and stage a new file
      writeFileSync(join(tempRepo, 'new-file.ts'), 'export const x = 1;\n');
      execFileSync('git', ['add', 'new-file.ts'], { cwd: tempRepo, stdio: 'pipe' });

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.some((f) => f.path === 'new-file.ts')).toBe(true);
      const newFile = diff.files.find((f) => f.path === 'new-file.ts');
      expect(newFile?.status).toBe('added');
    });

    it('returns empty diff when no changes', () => {
      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.length).toBe(0);
      expect(diff.totalAdditions).toBe(0);
      expect(diff.totalDeletions).toBe(0);
    });
  });

  describe('staged-only changes', () => {
    it('includes only staged changes', () => {
      // Create and stage a file
      writeFileSync(join(tempRepo, 'staged.ts'), 'export const staged = true;\n');
      execFileSync('git', ['add', 'staged.ts'], { cwd: tempRepo, stdio: 'pipe' });

      // Create but don't stage another file
      writeFileSync(join(tempRepo, 'unstaged.ts'), 'export const unstaged = true;\n');

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        stagedOnly: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.some((f) => f.path === 'staged.ts')).toBe(true);
      expect(diff.files.some((f) => f.path === 'unstaged.ts')).toBe(false);
    });

    it('returns empty diff when nothing staged', () => {
      // Modify but don't stage
      writeFileSync(join(tempRepo, 'README.md'), '# Not staged\n');

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        stagedOnly: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.length).toBe(0);
    });
  });

  describe('base ref handling', () => {
    it('diffs against specified base ref', () => {
      // Get initial commit SHA
      const initialSha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: tempRepo,
        encoding: 'utf-8',
      }).trim();

      // Create a new commit
      writeFileSync(join(tempRepo, 'new-commit.ts'), 'export const v = 1;\n');
      execFileSync('git', ['add', 'new-commit.ts'], { cwd: tempRepo, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', 'Add new file'], { cwd: tempRepo, stdio: 'pipe' });

      // Make another change in working tree to the committed file
      appendFileSync(join(tempRepo, 'new-commit.ts'), 'export const v2 = 2;\n');

      const options: LocalDiffOptions = {
        baseRef: initialSha, // Compare against initial commit
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      // Should include the new file (added since initial commit + working tree changes)
      expect(diff.files.some((f) => f.path === 'new-commit.ts')).toBe(true);
      expect(diff.baseSha).toBe(initialSha);
    });
  });

  describe('diff output', () => {
    it('includes patches for files', () => {
      // Make a clear modification to the tracked file
      writeFileSync(join(tempRepo, 'README.md'), '# Modified Title\n\nNew content added here.\n');

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.length).toBeGreaterThan(0);
      const readmeFile = diff.files.find((f) => f.path === 'README.md');
      expect(readmeFile).toBeDefined();
      expect(readmeFile?.patch).toBeDefined();
      expect(readmeFile?.patch).toContain('Modified');
    });

    it('includes additions and deletions counts', () => {
      // Replace content to ensure both additions and deletions
      writeFileSync(
        join(tempRepo, 'README.md'),
        '# Completely Different Content\nLine 2\nLine 3\n'
      );

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      // Original was "# Test\n" (1 line), new is 3 lines
      expect(diff.files.length).toBeGreaterThan(0);
      expect(diff.totalAdditions + diff.totalDeletions).toBeGreaterThan(0);
    });

    it('sets correct source field', () => {
      // Modify to create a diff
      writeFileSync(join(tempRepo, 'README.md'), '# Changed for source test\n');

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        uncommitted: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.source).toBe('local-git');
    });
  });

  describe('edge cases', () => {
    it('handles files with dashes in names', () => {
      const filename = 'file-with-dash.ts';
      writeFileSync(join(tempRepo, filename), 'export const x = 1;\n');
      execFileSync('git', ['add', filename], { cwd: tempRepo, stdio: 'pipe' });

      // Use staged-only since the file is new and staged
      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        stagedOnly: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.some((f) => f.path === filename)).toBe(true);
    });

    it('handles empty staged changes correctly', () => {
      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        stagedOnly: true,
      };

      // Should not throw
      const diff = getLocalDiff(tempRepo, options);
      expect(diff.files).toEqual([]);
    });

    it('handles multiple file types', () => {
      // Create and stage multiple files
      writeFileSync(join(tempRepo, 'script.ts'), 'export const ts = true;\n');
      writeFileSync(join(tempRepo, 'style.css'), '.class { color: red; }\n');
      execFileSync('git', ['add', 'script.ts', 'style.css'], { cwd: tempRepo, stdio: 'pipe' });

      const options: LocalDiffOptions = {
        baseRef: baseBranch,
        stagedOnly: true,
      };

      const diff = getLocalDiff(tempRepo, options);

      expect(diff.files.length).toBe(2);
      expect(diff.files.some((f) => f.path === 'script.ts')).toBe(true);
      expect(diff.files.some((f) => f.path === 'style.css')).toBe(true);
    });
  });
});
