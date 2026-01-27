import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { filterReviewIgnoredFiles, loadReviewIgnore } from '../reviewignore.js';
import type { DiffFile } from '../diff.js';

describe('reviewignore', () => {
  it('returns null when .reviewignore is missing', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'reviewignore-missing-'));
    try {
      expect(loadReviewIgnore(repoPath)).toBeNull();
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('filters files with standard patterns and negations', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'reviewignore-basic-'));
    const reviewIgnore = `
# Ignore vendor code
node_modules/
dist/**
!dist/keep.js
**/*.log
`;
    const files: DiffFile[] = [
      { path: 'src/index.ts', status: 'modified', additions: 1, deletions: 1 },
      { path: 'node_modules/lib/index.js', status: 'modified', additions: 1, deletions: 1 },
      { path: 'dist/drop.js', status: 'modified', additions: 1, deletions: 1 },
      { path: 'dist/keep.js', status: 'modified', additions: 1, deletions: 1 },
      { path: 'logs/error.log', status: 'modified', additions: 1, deletions: 1 },
    ];

    try {
      writeFileSync(join(repoPath, '.reviewignore'), reviewIgnore);
      const reviewIgnoreConfig = loadReviewIgnore(repoPath);
      const result = filterReviewIgnoredFiles(files, reviewIgnoreConfig);

      expect(result.filtered.map((file) => file.path)).toEqual(['src/index.ts', 'dist/keep.js']);
      expect(result.ignored.map((file) => file.path)).toEqual([
        'node_modules/lib/index.js',
        'dist/drop.js',
        'logs/error.log',
      ]);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });

  it('respects rooted patterns', () => {
    const repoPath = mkdtempSync(join(tmpdir(), 'reviewignore-rooted-'));
    const reviewIgnore = `
/build
`;
    const files: DiffFile[] = [
      { path: 'build/output.js', status: 'modified', additions: 1, deletions: 1 },
      { path: 'src/build/output.js', status: 'modified', additions: 1, deletions: 1 },
    ];

    try {
      writeFileSync(join(repoPath, '.reviewignore'), reviewIgnore);
      const reviewIgnoreConfig = loadReviewIgnore(repoPath);
      const result = filterReviewIgnoredFiles(files, reviewIgnoreConfig);

      expect(result.filtered.map((file) => file.path)).toEqual(['src/build/output.js']);
      expect(result.ignored.map((file) => file.path)).toEqual(['build/output.js']);
    } finally {
      rmSync(repoPath, { recursive: true, force: true });
    }
  });
});
