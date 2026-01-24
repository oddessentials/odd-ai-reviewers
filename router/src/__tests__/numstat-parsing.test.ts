/**
 * Numstat Parsing Tests
 *
 * Tests for robust NUL-delimited numstat parsing (--numstat -z)
 * Covers: binary files, renames, malformed input, edge cases
 */

import { describe, it, expect } from 'vitest';
import { parseNumstatZ, safePathsForGit, normalizePath } from '../diff.js';
import type { DiffFile } from '../diff.js';

// NUL character for test strings (avoids legacy octal escape error)
const NUL = '\x00';

describe('parseNumstatZ', () => {
  // Helper to create status map
  const makeStatusMap = (entries: [string, DiffFile['status']][] = []) =>
    new Map<string, DiffFile['status']>(entries);

  describe('Normal files', () => {
    it('should parse single file with additions and deletions', () => {
      // Format: ADD\tDEL\tPATH\0
      const output = `10\t5\tsrc/file.ts${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap([['src/file.ts', 'modified']]));

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'src/file.ts',
        additions: 10,
        deletions: 5,
        status: 'modified',
        isBinary: false,
      });
      expect(result.errors.count).toBe(0);
    });

    it('should parse multiple files', () => {
      const output = `1\t2\tfile1.ts${NUL}100\t0\tfile2.ts${NUL}0\t50\tfile3.ts${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files).toHaveLength(3);
      expect(result.files[0]?.additions).toBe(1);
      expect(result.files[1]?.additions).toBe(100);
      expect(result.files[2]?.deletions).toBe(50);
    });

    it('should normalize paths (remove a/, b/, ./, / prefixes)', () => {
      const output = `1\t0\ta/src/file.ts${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files[0]?.path).toBe('src/file.ts');
    });
  });

  describe('Binary files', () => {
    it('should handle binary files with -/- stats', () => {
      const output = `-\t-\timage.png${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap([['image.png', 'added']]));

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'image.png',
        additions: 0,
        deletions: 0,
        status: 'added',
        isBinary: true,
      });
    });

    it('should handle multiple binary files', () => {
      const output = `-\t-\timage1.png${NUL}-\t-\timage2.jpg${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files).toHaveLength(2);
      expect(result.files.every((f) => f.isBinary)).toBe(true);
    });
  });

  describe('Renamed files', () => {
    it('should parse rename with NUL-separated old/new paths', () => {
      // Rename format: ADD\tDEL\t\0OLDPATH\0NEWPATH\0
      const output = `5\t3\t${NUL}src/old.ts${NUL}src/new.ts${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'src/new.ts',
        oldPath: 'src/old.ts',
        status: 'renamed',
        additions: 5,
        deletions: 3,
      });
    });

    it('should handle binary rename', () => {
      const output = `-\t-\t${NUL}old.png${NUL}new.png${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files[0]).toMatchObject({
        path: 'new.png',
        oldPath: 'old.png',
        status: 'renamed',
        isBinary: true,
      });
    });
  });

  describe('Error handling', () => {
    it('should skip malformed lines and track errors', () => {
      const output = `garbage_line${NUL}10\t5\tvalid.ts${NUL}another_garbage${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files).toHaveLength(1);
      expect(result.files[0]?.path).toBe('valid.ts');
      expect(result.errors.count).toBe(2);
      expect(result.errors.samples).toContain('garbage_line');
    });

    it('should skip files with empty paths', () => {
      const output = `1\t0\t${NUL}`; // Empty path without rename follow-up
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files).toHaveLength(0);
      expect(result.errors.count).toBe(1);
    });

    it('should cap error samples at 5', () => {
      const output = Array.from({ length: 10 }, (_, i) => `bad${i}${NUL}`).join('');
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.errors.count).toBe(10);
      expect(result.errors.samples).toHaveLength(5);
    });

    it('should handle empty output', () => {
      const result = parseNumstatZ('', makeStatusMap());
      expect(result.files).toHaveLength(0);
      expect(result.errors.count).toBe(0);
    });
  });

  describe('Edge cases', () => {
    it('should handle filenames with spaces', () => {
      const output = `1\t0\tpath with spaces/file name.ts${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files[0]?.path).toBe('path with spaces/file name.ts');
    });

    it('should handle filenames with special characters', () => {
      const output = `1\t0\tpath/file[1](2){3}.ts${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files[0]?.path).toBe('path/file[1](2){3}.ts');
    });

    it('should handle very long paths', () => {
      const longPath = 'a/'.repeat(100) + 'file.ts';
      const output = `1\t0\t${longPath}${NUL}`;
      const result = parseNumstatZ(output, makeStatusMap());

      expect(result.files[0]?.path).toBe(normalizePath(longPath));
    });
  });
});

describe('safePathsForGit', () => {
  it('should filter out empty paths', () => {
    const files: DiffFile[] = [
      { path: 'valid.ts', status: 'modified', additions: 1, deletions: 0 },
      { path: '', status: 'modified', additions: 1, deletions: 0 },
      { path: 'another.ts', status: 'modified', additions: 1, deletions: 0 },
    ];

    const result = safePathsForGit(files);

    expect(result).toEqual(['valid.ts', 'another.ts']);
  });

  it('should filter out whitespace-only paths', () => {
    const files: DiffFile[] = [
      { path: '  ', status: 'modified', additions: 1, deletions: 0 },
      { path: 'valid.ts', status: 'modified', additions: 1, deletions: 0 },
    ];

    const result = safePathsForGit(files);

    expect(result).toEqual(['valid.ts']);
  });

  it('should deduplicate paths', () => {
    const files: DiffFile[] = [
      { path: 'file.ts', status: 'modified', additions: 1, deletions: 0 },
      { path: 'file.ts', status: 'added', additions: 1, deletions: 0 },
      { path: 'other.ts', status: 'modified', additions: 1, deletions: 0 },
    ];

    const result = safePathsForGit(files);

    expect(result).toEqual(['file.ts', 'other.ts']);
  });

  it('should handle empty input', () => {
    expect(safePathsForGit([])).toEqual([]);
  });

  it('should handle all-empty input', () => {
    const files: DiffFile[] = [
      { path: '', status: 'modified', additions: 1, deletions: 0 },
      { path: '   ', status: 'modified', additions: 1, deletions: 0 },
    ];

    expect(safePathsForGit(files)).toEqual([]);
  });
});
