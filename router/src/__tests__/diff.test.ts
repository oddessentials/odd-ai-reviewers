/**
 * Diff Module Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  filterFiles,
  buildCombinedDiff,
  normalizeGitRef,
  resolveReviewRefs,
  getGitHubCheckHeadSha,
  normalizePath,
  canonicalizeDiffFiles,
  type DiffFile,
  type PathFilter,
  type ReviewIgnorePattern,
} from '../diff.js';
import { execFileSync } from 'child_process';

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

  describe('reviewIgnorePatterns integration', () => {
    it('should exclude files matching reviewignore patterns', () => {
      const reviewIgnorePatterns: ReviewIgnorePattern[] = [
        { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      ];
      const filter: PathFilter = { reviewIgnorePatterns };

      const result = filterFiles(testFiles, filter);
      expect(result).toHaveLength(5);
      expect(result.some((f) => f.path.includes('node_modules'))).toBe(false);
    });

    it('should apply reviewignore before path_filters exclude', () => {
      const reviewIgnorePatterns: ReviewIgnorePattern[] = [
        { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      ];
      const filter: PathFilter = {
        exclude: ['**/*.md'],
        reviewIgnorePatterns,
      };

      const result = filterFiles(testFiles, filter);
      expect(result).toHaveLength(4);
      expect(result.some((f) => f.path.includes('node_modules'))).toBe(false);
      expect(result.some((f) => f.path.endsWith('.md'))).toBe(false);
    });

    it('should apply reviewignore with include patterns', () => {
      const reviewIgnorePatterns: ReviewIgnorePattern[] = [
        { pattern: '**/helper.ts', negated: false, lineNumber: 1 },
      ];
      const filter: PathFilter = {
        include: ['src/**/*'],
        reviewIgnorePatterns,
      };

      const result = filterFiles(testFiles, filter);
      // Should only include src files except helper.ts
      expect(result).toHaveLength(1);
      expect(result[0]?.path).toBe('src/index.ts');
    });

    it('should handle negation patterns in reviewignore', () => {
      const reviewIgnorePatterns: ReviewIgnorePattern[] = [
        { pattern: '**/*.ts', negated: false, lineNumber: 1 },
        { pattern: '**/index.ts', negated: true, lineNumber: 2 },
      ];
      const filter: PathFilter = { reviewIgnorePatterns };

      const result = filterFiles(testFiles, filter);
      // All .ts files except index.ts should be excluded
      // Remaining: index.ts, package.json, README.md, node_modules file
      expect(result.map((f) => f.path)).toContain('src/index.ts');
      expect(result.map((f) => f.path)).not.toContain('src/utils/helper.ts');
      expect(result.map((f) => f.path)).not.toContain('tests/index.test.ts');
    });

    it('should handle empty reviewignore patterns', () => {
      const filter: PathFilter = {
        reviewIgnorePatterns: [],
        exclude: ['**/*.md'],
      };

      const result = filterFiles(testFiles, filter);
      expect(result).toHaveLength(5);
    });

    it('should combine all filter types correctly', () => {
      const reviewIgnorePatterns: ReviewIgnorePattern[] = [
        { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      ];
      const filter: PathFilter = {
        include: ['src/**/*', 'tests/**/*'],
        exclude: ['**/*.test.ts'],
        reviewIgnorePatterns,
      };

      const result = filterFiles(testFiles, filter);
      // Include: src/*, tests/* | Exclude: *.test.ts | ReviewIgnore: node_modules
      expect(result).toHaveLength(2);
      expect(result.map((f) => f.path)).toEqual(['src/index.ts', 'src/utils/helper.ts']);
    });
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
    execFileSync: vi.fn(),
  };
});

describe('normalizeGitRef', () => {
  const mockExecSync = vi.mocked(execFileSync);

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
      'git',
      ['rev-parse', '--verify', 'abc123def456'],
      expect.any(Object)
    );
  });

  it('should resolve refs/heads/main to origin/main SHA', () => {
    // First call (direct ref) fails
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'refs/heads/main') {
        throw new Error('unknown revision');
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'origin/main') {
        return 'resolved-sha-12345\n';
      }
      throw new Error('unexpected call');
    });

    const result = normalizeGitRef('/repo', 'refs/heads/main');
    expect(result).toBe('resolved-sha-12345');
  });

  it('should try origin/* as fallback for branch names', () => {
    // Direct ref fails, origin/* succeeds
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'feature-branch') {
        throw new Error('unknown revision');
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'origin/feature-branch') {
        return 'feature-sha-67890\n';
      }
      throw new Error('unexpected call');
    });

    const result = normalizeGitRef('/repo', 'feature-branch');
    expect(result).toBe('feature-sha-67890');
  });

  it('should resolve origin/<branch> directly', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'origin/feature-branch') {
        return 'resolved-origin-sha\n';
      }
      throw new Error('unexpected call');
    });

    const result = normalizeGitRef('/repo', 'origin/feature-branch');
    expect(result).toBe('resolved-origin-sha');
  });

  it('should resolve tags directly', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'refs/tags/v1.2.3') {
        return 'tag-sha-123\n';
      }
      throw new Error('unexpected call');
    });

    const result = normalizeGitRef('/repo', 'refs/tags/v1.2.3');
    expect(result).toBe('tag-sha-123');
  });

  it('should reject unsafe refs', () => {
    expect(() => normalizeGitRef('/repo', 'main;rm -rf /')).toThrow(/ref/);
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

describe('resolveReviewRefs', () => {
  const mockExecSync = vi.mocked(execFileSync);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use merge queue second parent when base matches first parent', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'base-sha') {
        return 'base-sha\n';
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'merge-sha') {
        return 'merge-sha\n';
      }
      if (safeArgs[0] === 'rev-list' && safeArgs[safeArgs.length - 1] === 'merge-sha') {
        return 'merge-sha base-sha head-sha\n';
      }
      throw new Error(`Unexpected command: ${cmd} ${safeArgs.join(' ')}`);
    });

    const result = resolveReviewRefs('/repo', 'base-sha', 'merge-sha');
    expect(result).toEqual({
      baseSha: 'base-sha',
      headSha: 'head-sha',
      inputHeadSha: 'merge-sha',
      headSource: 'merge-parent',
    });
  });

  it('should resolve merge queue head when base is refs/heads/main', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'refs/heads/main') {
        throw new Error('unknown revision');
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'origin/main') {
        return 'base-sha\n';
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'merge-sha') {
        return 'merge-sha\n';
      }
      if (safeArgs[0] === 'rev-list' && safeArgs[safeArgs.length - 1] === 'merge-sha') {
        return 'merge-sha base-sha head-sha\n';
      }
      throw new Error(`Unexpected command: ${cmd} ${safeArgs.join(' ')}`);
    });

    const result = resolveReviewRefs('/repo', 'refs/heads/main', 'merge-sha');
    expect(result).toEqual({
      baseSha: 'base-sha',
      headSha: 'head-sha',
      inputHeadSha: 'merge-sha',
      headSource: 'merge-parent',
    });
  });

  it('should keep head when base does not match merge first parent', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'base-sha') {
        return 'base-sha\n';
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'merge-sha') {
        return 'merge-sha\n';
      }
      if (safeArgs[0] === 'rev-list' && safeArgs[safeArgs.length - 1] === 'merge-sha') {
        return 'merge-sha other-base head-sha\n';
      }
      throw new Error(`Unexpected command: ${cmd} ${safeArgs.join(' ')}`);
    });

    const result = resolveReviewRefs('/repo', 'base-sha', 'merge-sha');
    expect(result).toEqual({
      baseSha: 'base-sha',
      headSha: 'merge-sha',
      inputHeadSha: 'merge-sha',
      headSource: 'input',
    });
  });

  it('should keep head for rebase merges (single parent)', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'base-sha') {
        return 'base-sha\n';
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'head-sha') {
        return 'head-sha\n';
      }
      if (safeArgs[0] === 'rev-list' && safeArgs[safeArgs.length - 1] === 'head-sha') {
        return 'head-sha parent-only\n';
      }
      throw new Error(`Unexpected command: ${cmd} ${safeArgs.join(' ')}`);
    });

    const result = resolveReviewRefs('/repo', 'base-sha', 'head-sha');
    expect(result).toEqual({
      baseSha: 'base-sha',
      headSha: 'head-sha',
      inputHeadSha: 'head-sha',
      headSource: 'input',
    });
  });

  it('should keep head for non-PR runs (regular commit range)', () => {
    mockExecSync.mockImplementation((cmd: string, args?: readonly string[]) => {
      const safeArgs = args ?? [];
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'base-sha') {
        return 'base-sha\n';
      }
      if (safeArgs[0] === 'rev-parse' && safeArgs[2] === 'feature-sha') {
        return 'feature-sha\n';
      }
      if (safeArgs[0] === 'rev-list' && safeArgs[safeArgs.length - 1] === 'feature-sha') {
        return 'feature-sha parent-only\n';
      }
      throw new Error(`Unexpected command: ${cmd} ${safeArgs.join(' ')}`);
    });

    const result = resolveReviewRefs('/repo', 'base-sha', 'feature-sha');
    expect(result).toEqual({
      baseSha: 'base-sha',
      headSha: 'feature-sha',
      inputHeadSha: 'feature-sha',
      headSource: 'input',
    });
  });

  it('should throw on unsafe base SHA', () => {
    expect(() => resolveReviewRefs('/repo', 'base;rm -rf /', 'head-sha')).toThrow(/baseSha/);
  });

  it('should throw on unsafe repo path', () => {
    expect(() => resolveReviewRefs('/repo;rm -rf /', 'base-sha', 'head-sha')).toThrow(/repoPath/);
  });
});

describe('getGitHubCheckHeadSha', () => {
  it('should use input head SHA for merge-parent reviews', () => {
    const result = getGitHubCheckHeadSha({
      baseSha: 'base-sha',
      headSha: 'pr-head-sha',
      inputHeadSha: 'merge-head-sha',
      headSource: 'merge-parent',
    });

    expect(result).toBe('merge-head-sha');
  });

  it('should use review head SHA for non-merge reviews', () => {
    const result = getGitHubCheckHeadSha({
      baseSha: 'base-sha',
      headSha: 'head-sha',
      inputHeadSha: 'head-sha',
      headSource: 'input',
    });

    expect(result).toBe('head-sha');
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
