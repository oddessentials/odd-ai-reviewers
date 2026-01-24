/**
 * Diff Module Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterFiles,
  buildCombinedDiff,
  normalizeGitRef,
  normalizePath,
  canonicalizeDiffFiles,
  type DiffFile,
  type PathFilter,
} from '../diff.js';
import { execSync } from 'child_process';

const testFiles: DiffFile[] = [
  { path: 'src/index.ts', status: 'modified', additions: 10, deletions: 5, patch: '+ added' },
  {
    path: 'src/utils/helper.ts',
    status: 'added',
    additions: 50,
    deletions: 0,
    patch: '+ new file',
  },
  {
    path: 'tests/index.test.ts',
    status: 'modified',
    additions: 20,
    deletions: 10,
    patch: '+ test',
  },
  { path: 'package.json', status: 'modified', additions: 2, deletions: 1, patch: '+ version' },
  { path: 'docs/README.md', status: 'modified', additions: 5, deletions: 3, patch: '+ docs' },
  { path: 'node_modules/dep/index.js', status: 'modified', additions: 1, deletions: 1 },
];

describe('filterFiles', () => {
  it('should include files matching include patterns', () => {
    const filter: PathFilter = {
      include: ['src/**/*.ts'],
    };

    const result = filterFiles(testFiles, filter);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(['src/index.ts', 'src/utils/helper.ts']);
  });

  it('should exclude files matching exclude patterns', () => {
    const filter: PathFilter = {
      exclude: ['node_modules/**', '**/*.md'],
    };

    const result = filterFiles(testFiles, filter);
    expect(result).toHaveLength(4);
    expect(result.some((f) => f.path.includes('node_modules'))).toBe(false);
    expect(result.some((f) => f.path.endsWith('.md'))).toBe(false);
  });

  it('should apply both include and exclude patterns', () => {
    const filter: PathFilter = {
      include: ['src/**/*', 'tests/**/*'],
      exclude: ['**/*.test.ts'],
    };

    const result = filterFiles(testFiles, filter);
    expect(result).toHaveLength(2);
    expect(result.map((f) => f.path)).toEqual(['src/index.ts', 'src/utils/helper.ts']);
  });

  it('should return all files when no filter provided', () => {
    const result = filterFiles(testFiles, undefined);
    expect(result).toHaveLength(6);
  });

  it('should return all files when filter is empty', () => {
    const result = filterFiles(testFiles, {});
    expect(result).toHaveLength(6);
  });
});

describe('buildCombinedDiff', () => {
  it('should concatenate patches with headers', () => {
    const files: DiffFile[] = [
      { path: 'file1.ts', status: 'modified', additions: 1, deletions: 0, patch: '+ line1' },
      { path: 'file2.ts', status: 'added', additions: 1, deletions: 0, patch: '+ line2' },
    ];

    const result = buildCombinedDiff(files, 1000);
    expect(result).toContain('--- file1.ts (modified) ---');
    expect(result).toContain('--- file2.ts (added) ---');
    expect(result).toContain('+ line1');
    expect(result).toContain('+ line2');
  });

  it('should truncate at max lines', () => {
    const files: DiffFile[] = [
      {
        path: 'file1.ts',
        status: 'modified',
        additions: 100,
        deletions: 0,
        patch: Array(100).fill('+ line').join('\n'),
      },
      {
        path: 'file2.ts',
        status: 'added',
        additions: 100,
        deletions: 0,
        patch: Array(100).fill('+ line').join('\n'),
      },
    ];

    const result = buildCombinedDiff(files, 50);
    expect(result).toContain('truncated');
    expect(result).not.toContain('file2.ts');
  });

  it('should skip files without patches', () => {
    const files: DiffFile[] = [
      { path: 'file1.ts', status: 'modified', additions: 1, deletions: 0 }, // No patch
      { path: 'file2.ts', status: 'added', additions: 1, deletions: 0, patch: '+ content' },
    ];

    const result = buildCombinedDiff(files, 1000);
    expect(result).not.toContain('file1.ts');
    expect(result).toContain('file2.ts');
  });
});

// Mock child_process for normalizeGitRef tests
vi.mock('child_process', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    execSync: vi.fn(),
  };
});

describe('normalizeGitRef', () => {
  const mockExecSync = vi.mocked(execSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return SHA directly if it resolves', () => {
    // SHA resolves successfully on first try
    mockExecSync.mockReturnValue('abc123def456789\n');

    const result = normalizeGitRef('/repo', 'abc123def456');
    expect(result).toBe('abc123def456789');
    expect(mockExecSync).toHaveBeenCalledWith(
      expect.stringContaining('git rev-parse --verify'),
      expect.any(Object)
    );
  });

  it('should resolve refs/heads/main to origin/main SHA', () => {
    // First call (direct ref) fails
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('refs/heads/main')) {
        throw new Error('unknown revision');
      }
      if (cmd.includes('origin/main')) {
        return 'resolved-sha-12345\n';
      }
      throw new Error('unexpected call');
    });

    const result = normalizeGitRef('/repo', 'refs/heads/main');
    expect(result).toBe('resolved-sha-12345');
  });

  it('should try origin/* as fallback for branch names', () => {
    // Direct ref fails, origin/* succeeds
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('"feature-branch"')) {
        throw new Error('unknown revision');
      }
      if (cmd.includes('origin/feature-branch')) {
        return 'feature-sha-67890\n';
      }
      throw new Error('unexpected call');
    });

    const result = normalizeGitRef('/repo', 'feature-branch');
    expect(result).toBe('feature-sha-67890');
  });

  it('should return original ref if all resolutions fail', () => {
    // All attempts fail
    mockExecSync.mockImplementation(() => {
      throw new Error('unknown revision');
    });

    const result = normalizeGitRef('/repo', 'nonexistent-ref');
    expect(result).toBe('nonexistent-ref');
  });

  it('should handle GitHub-style SHAs unchanged', () => {
    // Standard SHA resolves directly
    mockExecSync.mockReturnValue('7a3f80cfb32f57fc25c32d9c07b4d36b145b9e4b\n');

    const result = normalizeGitRef('/repo', '7a3f80cfb32f57fc25c32d9c07b4d36b145b9e4b');
    expect(result).toBe('7a3f80cfb32f57fc25c32d9c07b4d36b145b9e4b');
  });
});

describe('normalizePath', () => {
  it('should remove a/ prefix', () => {
    expect(normalizePath('a/src/file.ts')).toBe('src/file.ts');
  });

  it('should remove b/ prefix', () => {
    expect(normalizePath('b/src/file.ts')).toBe('src/file.ts');
  });

  it('should remove ./ prefix', () => {
    expect(normalizePath('./src/file.ts')).toBe('src/file.ts');
  });

  it('should remove leading slash', () => {
    expect(normalizePath('/src/file.ts')).toBe('src/file.ts');
  });

  it('should handle already-normalized paths', () => {
    expect(normalizePath('src/file.ts')).toBe('src/file.ts');
  });

  it('should not modify internal slashes', () => {
    expect(normalizePath('a/src/utils/helper.ts')).toBe('src/utils/helper.ts');
  });
});

describe('canonicalizeDiffFiles', () => {
  it('should normalize all path and oldPath fields', () => {
    const nonCanonicalFiles: DiffFile[] = [
      { path: 'a/src/file.ts', status: 'modified', additions: 5, deletions: 2 },
      {
        path: 'b/src/renamed.ts',
        oldPath: 'a/src/original.ts',
        status: 'renamed',
        additions: 3,
        deletions: 1,
      },
      { path: './relative/file.ts', status: 'added', additions: 10, deletions: 0 },
      { path: '/absolute/file.ts', status: 'deleted', additions: 0, deletions: 5 },
    ];

    const result = canonicalizeDiffFiles(nonCanonicalFiles);

    expect(result[0]?.path).toBe('src/file.ts');
    expect(result[1]?.path).toBe('src/renamed.ts');
    expect(result[1]?.oldPath).toBe('src/original.ts');
    expect(result[2]?.path).toBe('relative/file.ts');
    expect(result[3]?.path).toBe('absolute/file.ts');
  });

  it('should handle undefined oldPath', () => {
    const files: DiffFile[] = [
      { path: 'a/file.ts', status: 'modified', additions: 1, deletions: 0 },
    ];

    const result = canonicalizeDiffFiles(files);
    expect(result[0]?.oldPath).toBeUndefined();
  });

  it('should preserve all other file properties', () => {
    const files: DiffFile[] = [
      {
        path: 'a/file.ts',
        status: 'modified',
        additions: 10,
        deletions: 5,
        patch: '+ new content',
      },
    ];

    const result = canonicalizeDiffFiles(files);
    expect(result[0]).toEqual({
      path: 'file.ts',
      status: 'modified',
      additions: 10,
      deletions: 5,
      patch: '+ new content',
      oldPath: undefined,
    });
  });

  it('should return empty array for empty input', () => {
    expect(canonicalizeDiffFiles([])).toEqual([]);
  });
});
