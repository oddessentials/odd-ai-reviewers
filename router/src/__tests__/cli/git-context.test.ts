/**
 * Tests for Git Context Module
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execFileSync } from 'child_process';
import {
  findGitRoot,
  getCurrentBranch,
  detectDefaultBranch,
  hasUncommittedChanges,
  hasStagedChanges,
  inferGitContext,
} from '../../cli/git-context.js';

/**
 * Helper to create a temporary git repository
 */
function createTempRepo(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'git-context-test-'));

  // Initialize git repo
  execFileSync('git', ['init'], { cwd: tempDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tempDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir, stdio: 'pipe' });

  // Create initial commit so we have a valid repo
  writeFileSync(join(tempDir, 'README.md'), '# Test\n');
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

describe('findGitRoot', () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  it('returns repo root when in root directory', () => {
    const result = findGitRoot(tempRepo);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(tempRepo);
    }
  });

  it('returns repo root when in subdirectory', () => {
    const subDir = join(tempRepo, 'src', 'nested');
    mkdirSync(subDir, { recursive: true });

    const result = findGitRoot(subDir);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(tempRepo);
    }
  });

  it('returns error when not in git repository', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));

    try {
      const result = findGitRoot(nonGitDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_GIT_REPO');
      }
    } finally {
      cleanupTempDir(nonGitDir);
    }
  });

  it('returns error when path does not exist', () => {
    const result = findGitRoot('/nonexistent/path/that/does/not/exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PATH');
    }
  });

  it('handles paths with spaces', () => {
    const dirWithSpaces = mkdtempSync(join(tmpdir(), 'git context test '));
    execFileSync('git', ['init'], { cwd: dirWithSpaces, stdio: 'pipe' });

    try {
      const result = findGitRoot(dirWithSpaces);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(dirWithSpaces);
      }
    } finally {
      cleanupTempDir(dirWithSpaces);
    }
  });
});

describe('getCurrentBranch', () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  it('returns branch name on normal branch', () => {
    // Default branch after init is usually main or master
    const branch = getCurrentBranch(tempRepo);
    expect(['main', 'master']).toContain(branch);
  });

  it('returns HEAD in detached HEAD state', () => {
    // Get current commit SHA and checkout
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: tempRepo,
      encoding: 'utf-8',
    }).trim();
    execFileSync('git', ['checkout', sha], { cwd: tempRepo, stdio: 'pipe' });

    const branch = getCurrentBranch(tempRepo);
    expect(branch).toBe('HEAD');
  });

  it('works with branch names containing slashes', () => {
    execFileSync('git', ['checkout', '-b', 'feature/test-branch'], {
      cwd: tempRepo,
      stdio: 'pipe',
    });

    const branch = getCurrentBranch(tempRepo);
    expect(branch).toBe('feature/test-branch');
  });
});

describe('detectDefaultBranch', () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  it('detects main when available', () => {
    // Rename current branch to main if not already
    const currentBranch = getCurrentBranch(tempRepo);
    if (currentBranch !== 'main') {
      execFileSync('git', ['branch', '-m', currentBranch, 'main'], {
        cwd: tempRepo,
        stdio: 'pipe',
      });
    }

    const defaultBranch = detectDefaultBranch(tempRepo);
    expect(defaultBranch).toBe('main');
  });

  it('falls back to master when no main', () => {
    // Rename to master
    const currentBranch = getCurrentBranch(tempRepo);
    execFileSync('git', ['branch', '-m', currentBranch, 'master'], {
      cwd: tempRepo,
      stdio: 'pipe',
    });

    const defaultBranch = detectDefaultBranch(tempRepo);
    expect(defaultBranch).toBe('master');
  });

  it('handles repos with only feature branches', () => {
    // Rename to feature branch only
    const currentBranch = getCurrentBranch(tempRepo);
    execFileSync('git', ['branch', '-m', currentBranch, 'feature/only-branch'], {
      cwd: tempRepo,
      stdio: 'pipe',
    });

    const defaultBranch = detectDefaultBranch(tempRepo);
    // Should fall back to first available or 'main'
    expect(defaultBranch).toBeDefined();
  });
});

describe('hasUncommittedChanges', () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  it('returns false when working tree is clean', () => {
    const result = hasUncommittedChanges(tempRepo);
    expect(result).toBe(false);
  });

  it('returns true when files are modified', () => {
    writeFileSync(join(tempRepo, 'README.md'), '# Modified\n');

    const result = hasUncommittedChanges(tempRepo);
    expect(result).toBe(true);
  });

  it('returns true when files are staged', () => {
    writeFileSync(join(tempRepo, 'new-file.txt'), 'content\n');
    execFileSync('git', ['add', 'new-file.txt'], { cwd: tempRepo, stdio: 'pipe' });

    const result = hasUncommittedChanges(tempRepo);
    expect(result).toBe(true);
  });

  it('ignores untracked files', () => {
    writeFileSync(join(tempRepo, 'untracked.txt'), 'untracked\n');

    const result = hasUncommittedChanges(tempRepo);
    expect(result).toBe(false);
  });
});

describe('hasStagedChanges', () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  it('returns false when nothing is staged', () => {
    const result = hasStagedChanges(tempRepo);
    expect(result).toBe(false);
  });

  it('returns true when files are staged', () => {
    writeFileSync(join(tempRepo, 'new-file.txt'), 'content\n');
    execFileSync('git', ['add', 'new-file.txt'], { cwd: tempRepo, stdio: 'pipe' });

    const result = hasStagedChanges(tempRepo);
    expect(result).toBe(true);
  });

  it('distinguishes staged from unstaged', () => {
    // Modify but don't stage
    writeFileSync(join(tempRepo, 'README.md'), '# Modified but not staged\n');

    const result = hasStagedChanges(tempRepo);
    expect(result).toBe(false);
  });

  it('returns true for partially staged file', () => {
    writeFileSync(join(tempRepo, 'README.md'), '# Line 1\n');
    execFileSync('git', ['add', 'README.md'], { cwd: tempRepo, stdio: 'pipe' });

    // Modify again without staging
    writeFileSync(join(tempRepo, 'README.md'), '# Line 1\n# Line 2\n');

    const result = hasStagedChanges(tempRepo);
    expect(result).toBe(true); // First change is staged
  });
});

describe('inferGitContext', () => {
  let tempRepo: string;

  beforeEach(() => {
    tempRepo = createTempRepo();
  });

  afterEach(() => {
    cleanupTempDir(tempRepo);
  });

  it('returns complete context for valid repo', () => {
    const result = inferGitContext(tempRepo);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repoRoot).toBe(tempRepo);
      expect(result.value.currentBranch).toBeDefined();
      expect(result.value.defaultBase).toBeDefined();
      expect(typeof result.value.hasUncommitted).toBe('boolean');
      expect(typeof result.value.hasStaged).toBe('boolean');
    }
  });

  it('returns error for non-git directory', () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'non-git-'));

    try {
      const result = inferGitContext(nonGitDir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('NOT_GIT_REPO');
      }
    } finally {
      cleanupTempDir(nonGitDir);
    }
  });

  it('works from subdirectory', () => {
    const subDir = join(tempRepo, 'src');
    mkdirSync(subDir, { recursive: true });

    const result = inferGitContext(subDir);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.repoRoot).toBe(tempRepo);
    }
  });
});
