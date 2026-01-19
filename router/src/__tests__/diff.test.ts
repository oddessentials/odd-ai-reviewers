/**
 * Diff Module Tests
 */

import { describe, it, expect } from 'vitest';
import { filterFiles, buildCombinedDiff, type DiffFile, type PathFilter } from '../diff.js';

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
