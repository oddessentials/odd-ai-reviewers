/**
 * Reviewignore Module Tests
 *
 * Comprehensive tests for .reviewignore parsing and file filtering
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseReviewIgnoreLine,
  parseReviewIgnoreContent,
  normalizePattern,
  shouldIgnoreFile,
  filterPathsByReviewIgnore,
  loadReviewIgnore,
  type ReviewIgnorePattern,
} from '../reviewignore.js';
import { existsSync } from 'fs';
import { lstat, readFile, realpath } from 'fs/promises';

// Mock fs modules
vi.mock('fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  lstat: vi.fn(),
  realpath: vi.fn(),
}));

const mockExistsSync = vi.mocked(existsSync);
const mockReadFile = vi.mocked(readFile);
const mockLstat = vi.mocked(lstat);
const mockRealpath = vi.mocked(realpath);

function fileStat(
  overrides?: Partial<{ size: number; isFile: () => boolean; isSymbolicLink: () => boolean }>
) {
  return {
    size: 128,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

describe('parseReviewIgnoreLine', () => {
  describe('happy path - valid patterns', () => {
    it('should parse a simple file pattern', () => {
      const result = parseReviewIgnoreLine('node_modules', 1);
      expect(result).toEqual({
        pattern: '**/node_modules',
        negated: false,
        lineNumber: 1,
      });
    });

    it('should parse a glob pattern', () => {
      const result = parseReviewIgnoreLine('*.log', 2);
      expect(result).toEqual({
        pattern: '**/*.log',
        negated: false,
        lineNumber: 2,
      });
    });

    it('should parse a directory pattern with trailing slash', () => {
      const result = parseReviewIgnoreLine('build/', 3);
      expect(result).toEqual({
        pattern: '**/build/**',
        negated: false,
        lineNumber: 3,
      });
    });

    it('should parse a path pattern', () => {
      const result = parseReviewIgnoreLine('src/generated', 4);
      expect(result).toEqual({
        pattern: 'src/generated',
        negated: false,
        lineNumber: 4,
      });
    });

    it('should parse a negation pattern', () => {
      const result = parseReviewIgnoreLine('!important.js', 5);
      expect(result).toEqual({
        pattern: '**/important.js',
        negated: true,
        lineNumber: 5,
      });
    });

    it('should parse escaped leading # as a literal pattern', () => {
      const result = parseReviewIgnoreLine('\\#file', 10);
      expect(result).toEqual({
        pattern: '**/#file',
        negated: false,
        lineNumber: 10,
      });
    });

    it('should parse escaped leading ! as a literal pattern', () => {
      const result = parseReviewIgnoreLine('\\!important', 11);
      expect(result).toEqual({
        pattern: '**/!important',
        negated: false,
        lineNumber: 11,
      });
    });

    it('should parse a double-star pattern', () => {
      const result = parseReviewIgnoreLine('**/test/**', 6);
      expect(result).toEqual({
        pattern: '**/test/**',
        negated: false,
        lineNumber: 6,
      });
    });

    it('should parse a root-relative pattern (leading slash)', () => {
      // Root-relative patterns don't get **/ prefix - they match from repo root only
      const result = parseReviewIgnoreLine('/config.js', 7);
      expect(result).toEqual({
        pattern: 'config.js',
        negated: false,
        lineNumber: 7,
      });
    });

    it('should parse a pattern with brackets', () => {
      const result = parseReviewIgnoreLine('[Bb]uild/', 8);
      expect(result).toEqual({
        pattern: '**/[Bb]uild/**',
        negated: false,
        lineNumber: 8,
      });
    });

    it('should parse a pattern with question mark', () => {
      const result = parseReviewIgnoreLine('file?.txt', 9);
      expect(result).toEqual({
        pattern: '**/file?.txt',
        negated: false,
        lineNumber: 9,
      });
    });
  });

  describe('skip conditions', () => {
    it('should return null for empty lines', () => {
      expect(parseReviewIgnoreLine('', 1)).toBeNull();
      expect(parseReviewIgnoreLine('   ', 1)).toBeNull();
      expect(parseReviewIgnoreLine('\t', 1)).toBeNull();
    });

    it('should return null for comment lines', () => {
      expect(parseReviewIgnoreLine('# this is a comment', 1)).toBeNull();
      expect(parseReviewIgnoreLine('  # indented comment', 1)).toBeNull();
      expect(parseReviewIgnoreLine('#', 1)).toBeNull();
    });

    it('should return null for negation of empty pattern', () => {
      expect(parseReviewIgnoreLine('!', 1)).toBeNull();
      expect(parseReviewIgnoreLine('!  ', 1)).toBeNull();
    });
  });

  describe('whitespace handling', () => {
    it('should trim leading and trailing whitespace', () => {
      const result = parseReviewIgnoreLine('  node_modules  ', 1);
      expect(result?.pattern).toBe('**/node_modules');
    });

    it('should handle tabs', () => {
      const result = parseReviewIgnoreLine('\tnode_modules\t', 1);
      expect(result?.pattern).toBe('**/node_modules');
    });
  });
});

describe('normalizePattern', () => {
  describe('prefix handling', () => {
    it('should remove leading ./', () => {
      expect(normalizePattern('./src/file.ts')).toBe('src/file.ts');
    });

    it('should remove leading / (root-relative, no **/ prefix)', () => {
      // Root-relative patterns don't get **/ prefix - they match from root only
      expect(normalizePattern('/config.json')).toBe('config.json');
    });
  });

  describe('directory patterns', () => {
    it('should convert trailing / to /**', () => {
      expect(normalizePattern('dist/')).toBe('**/dist/**');
    });

    it('should handle nested directory patterns', () => {
      expect(normalizePattern('src/generated/')).toBe('src/generated/**');
    });
  });

  describe('simple name patterns', () => {
    it('should add **/ prefix to simple names', () => {
      expect(normalizePattern('node_modules')).toBe('**/node_modules');
    });

    it('should add **/ prefix to simple file names', () => {
      expect(normalizePattern('package-lock.json')).toBe('**/package-lock.json');
    });
  });

  describe('wildcard patterns', () => {
    it('should not modify patterns with *', () => {
      expect(normalizePattern('*.log')).toBe('**/*.log');
    });

    it('should not modify patterns with **', () => {
      expect(normalizePattern('**/test/**')).toBe('**/test/**');
    });

    it('should not modify patterns with ?', () => {
      expect(normalizePattern('file?.txt')).toBe('**/file?.txt');
    });

    it('should not modify patterns with []', () => {
      expect(normalizePattern('[Bb]uild')).toBe('**/[Bb]uild');
    });
  });

  describe('path patterns (with /)', () => {
    it('should not add **/ prefix to path patterns', () => {
      expect(normalizePattern('src/generated')).toBe('src/generated');
    });

    it('should preserve nested paths', () => {
      expect(normalizePattern('tests/fixtures/data')).toBe('tests/fixtures/data');
    });
  });
});

describe('parseReviewIgnoreContent', () => {
  it('should parse multiple patterns', () => {
    const content = `
# Dependencies
node_modules
vendor/

# Build outputs
dist/
*.min.js

# But keep important files
!important.min.js
`;

    const patterns = parseReviewIgnoreContent(content);
    expect(patterns).toHaveLength(5);
    expect(patterns[0]).toEqual({
      pattern: '**/node_modules',
      negated: false,
      lineNumber: 3,
    });
    expect(patterns[1]).toEqual({
      pattern: '**/vendor/**',
      negated: false,
      lineNumber: 4,
    });
    expect(patterns[4]).toEqual({
      pattern: '**/important.min.js',
      negated: true,
      lineNumber: 11,
    });
  });

  it('should handle empty content', () => {
    expect(parseReviewIgnoreContent('')).toEqual([]);
  });

  it('should handle content with only comments', () => {
    const content = `
# Comment 1
# Comment 2
# Comment 3
`;
    expect(parseReviewIgnoreContent(content)).toEqual([]);
  });

  it('should handle Windows-style line endings', () => {
    const content = 'node_modules\r\ndist\r\n';
    const patterns = parseReviewIgnoreContent(content);
    expect(patterns).toHaveLength(2);
  });
});

describe('shouldIgnoreFile', () => {
  describe('simple patterns', () => {
    it('should match exact file names anywhere in path', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/package-lock.json', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('package-lock.json', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/package-lock.json', patterns)).toBe(true);
      expect(shouldIgnoreFile('deep/nested/package-lock.json', patterns)).toBe(true);
      expect(shouldIgnoreFile('package.json', patterns)).toBe(false);
    });

    it('should match directory patterns', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('node_modules/lodash/index.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/node_modules/local/file.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('node_modules_backup/file.js', patterns)).toBe(false);
    });
  });

  describe('glob patterns', () => {
    it('should match wildcard patterns', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/*.log', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('app.log', patterns)).toBe(true);
      expect(shouldIgnoreFile('logs/debug.log', patterns)).toBe(true);
      expect(shouldIgnoreFile('app.log.bak', patterns)).toBe(false);
    });

    it('should match double-star patterns', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/test/**', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('test/unit.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/test/unit.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('testing/file.ts', patterns)).toBe(false);
    });
  });

  describe('negation patterns', () => {
    it('should re-include files with negation', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/*.generated.ts', negated: false, lineNumber: 1 },
        { pattern: '**/important.generated.ts', negated: true, lineNumber: 2 },
      ];

      expect(shouldIgnoreFile('models.generated.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('important.generated.ts', patterns)).toBe(false);
    });

    it('should apply patterns in order', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/logs/**', negated: false, lineNumber: 1 },
        { pattern: '**/logs/important.log', negated: true, lineNumber: 2 },
        { pattern: '**/logs/important.log', negated: false, lineNumber: 3 },
      ];

      // Last matching pattern wins
      expect(shouldIgnoreFile('logs/important.log', patterns)).toBe(true);
    });
  });

  describe('path patterns', () => {
    it('should match specific paths', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: 'src/generated', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('src/generated', patterns)).toBe(true);
      expect(shouldIgnoreFile('lib/src/generated', patterns)).toBe(false);
    });

    it('should match nested path patterns', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: 'src/generated/**', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('src/generated/models.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/generated/deep/nested.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/other/file.ts', patterns)).toBe(false);
    });
  });

  describe('empty patterns', () => {
    it('should not ignore any files with empty patterns', () => {
      expect(shouldIgnoreFile('any/file.ts', [])).toBe(false);
    });
  });

  describe('dotfiles', () => {
    it('should match dotfiles', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/.env', negated: false, lineNumber: 1 },
      ];

      expect(shouldIgnoreFile('.env', patterns)).toBe(true);
      expect(shouldIgnoreFile('config/.env', patterns)).toBe(true);
    });
  });
});

describe('filterPathsByReviewIgnore', () => {
  const testPaths = [
    'src/index.ts',
    'src/utils/helper.ts',
    'node_modules/lodash/index.js',
    'package.json',
    'package-lock.json',
    'dist/bundle.js',
    'tests/unit.test.ts',
  ];

  it('should filter out ignored paths', () => {
    const patterns: ReviewIgnorePattern[] = [
      { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      { pattern: '**/dist/**', negated: false, lineNumber: 2 },
    ];

    const result = filterPathsByReviewIgnore(testPaths, patterns);
    expect(result.included).toEqual([
      'src/index.ts',
      'src/utils/helper.ts',
      'package.json',
      'package-lock.json',
      'tests/unit.test.ts',
    ]);
    expect(result.ignoredCount).toBe(2);
  });

  it('should return all paths when no patterns', () => {
    const result = filterPathsByReviewIgnore(testPaths, []);
    expect(result.included).toEqual(testPaths);
    expect(result.ignoredCount).toBe(0);
  });

  it('should handle complex pattern combinations', () => {
    const patterns: ReviewIgnorePattern[] = [
      { pattern: '**/*.json', negated: false, lineNumber: 1 },
      { pattern: '**/package.json', negated: true, lineNumber: 2 },
    ];

    const result = filterPathsByReviewIgnore(testPaths, patterns);
    expect(result.included).toContain('package.json');
    expect(result.included).not.toContain('package-lock.json');
    expect(result.ignoredCount).toBe(1);
  });
});

describe('loadReviewIgnore', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockLstat.mockResolvedValue(fileStat() as never);
    mockRealpath.mockImplementation(async (path) => path as string);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should load and parse .reviewignore file', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(`
node_modules
dist/
*.log
`);

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(true);
    expect(result.filePath).toBe('/repo/.reviewignore');
    expect(result.patterns).toHaveLength(3);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[reviewignore] Loaded 3 patterns from .reviewignore'
    );
  });

  it('should return empty result when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(false);
    expect(result.patterns).toEqual([]);
    expect(result.filePath).toBeUndefined();
  });

  it('should handle read errors gracefully', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockRejectedValue(new Error('Permission denied'));

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(false);
    expect(result.patterns).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read .reviewignore')
    );
  });

  it('should not log when file has no patterns', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFile.mockResolvedValue(`
# Only comments
# No actual patterns
`);

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(true);
    expect(result.patterns).toEqual([]);
    expect(consoleLogSpy).not.toHaveBeenCalled();
  });

  it('should ignore non-file paths', async () => {
    mockExistsSync.mockReturnValue(true);
    mockLstat.mockResolvedValue(fileStat({ isFile: () => false }) as never);

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(false);
    expect(result.patterns).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith('[reviewignore] Ignoring non-file .reviewignore');
  });

  it('should refuse symlinks outside repo root', async () => {
    mockExistsSync.mockReturnValue(true);
    mockLstat
      .mockResolvedValueOnce(fileStat({ isFile: () => false, isSymbolicLink: () => true }) as never)
      .mockResolvedValueOnce(fileStat() as never);
    mockRealpath.mockImplementation(async (path) => {
      if (path === '/repo/.reviewignore') return '/outside/.reviewignore';
      return '/repo';
    });

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[reviewignore] Refusing to follow symlink outside repo root'
    );
  });

  it('should ignore oversized files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockLstat.mockResolvedValue(fileStat({ size: 2 * 1024 * 1024 }) as never);

    const result = await loadReviewIgnore('/repo');
    expect(result.found).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[reviewignore] Ignoring .reviewignore larger than 1048576 bytes'
    );
  });
});

describe('real-world scenarios', () => {
  describe('node project', () => {
    const nodePatterns: ReviewIgnorePattern[] = [
      { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      { pattern: '**/package-lock.json', negated: false, lineNumber: 2 },
      { pattern: '**/yarn.lock', negated: false, lineNumber: 3 },
      { pattern: '**/dist/**', negated: false, lineNumber: 4 },
      { pattern: '**/coverage/**', negated: false, lineNumber: 5 },
    ];

    it('should ignore common node artifacts', () => {
      expect(shouldIgnoreFile('node_modules/express/index.js', nodePatterns)).toBe(true);
      expect(shouldIgnoreFile('package-lock.json', nodePatterns)).toBe(true);
      expect(shouldIgnoreFile('dist/bundle.js', nodePatterns)).toBe(true);
      expect(shouldIgnoreFile('coverage/lcov.info', nodePatterns)).toBe(true);
    });

    it('should include source files', () => {
      expect(shouldIgnoreFile('src/index.ts', nodePatterns)).toBe(false);
      expect(shouldIgnoreFile('package.json', nodePatterns)).toBe(false);
      expect(shouldIgnoreFile('tsconfig.json', nodePatterns)).toBe(false);
    });
  });

  describe('python project', () => {
    const pythonPatterns: ReviewIgnorePattern[] = [
      { pattern: '**/__pycache__/**', negated: false, lineNumber: 1 },
      { pattern: '**/*.pyc', negated: false, lineNumber: 2 },
      { pattern: '**/venv/**', negated: false, lineNumber: 3 },
      { pattern: '**/.venv/**', negated: false, lineNumber: 4 },
      { pattern: '**/*.egg-info/**', negated: false, lineNumber: 5 },
    ];

    it('should ignore common python artifacts', () => {
      expect(shouldIgnoreFile('src/__pycache__/module.cpython-39.pyc', pythonPatterns)).toBe(true);
      expect(shouldIgnoreFile('app.pyc', pythonPatterns)).toBe(true);
      expect(
        shouldIgnoreFile('venv/lib/python3.9/site-packages/requests/api.py', pythonPatterns)
      ).toBe(true);
      expect(shouldIgnoreFile('.venv/bin/activate', pythonPatterns)).toBe(true);
    });

    it('should include source files', () => {
      expect(shouldIgnoreFile('src/main.py', pythonPatterns)).toBe(false);
      expect(shouldIgnoreFile('requirements.txt', pythonPatterns)).toBe(false);
    });
  });

  describe('monorepo', () => {
    const monoRepoPatterns: ReviewIgnorePattern[] = [
      { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      { pattern: '**/dist/**', negated: false, lineNumber: 2 },
      { pattern: 'packages/deprecated/**', negated: false, lineNumber: 3 },
      { pattern: '**/packages/deprecated/**', negated: false, lineNumber: 4 },
    ];

    it('should ignore nested node_modules in workspaces', () => {
      expect(shouldIgnoreFile('packages/api/node_modules/express/index.js', monoRepoPatterns)).toBe(
        true
      );
      expect(shouldIgnoreFile('packages/web/node_modules/react/index.js', monoRepoPatterns)).toBe(
        true
      );
    });

    it('should ignore deprecated packages', () => {
      expect(shouldIgnoreFile('packages/deprecated/old-lib/index.js', monoRepoPatterns)).toBe(true);
    });

    it('should include active packages', () => {
      expect(shouldIgnoreFile('packages/api/src/server.ts', monoRepoPatterns)).toBe(false);
      expect(shouldIgnoreFile('packages/web/src/App.tsx', monoRepoPatterns)).toBe(false);
    });
  });
});

describe('edge cases', () => {
  describe('pattern matching edge cases', () => {
    it('should handle empty file path', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/node_modules/**', negated: false, lineNumber: 1 },
      ];
      expect(shouldIgnoreFile('', patterns)).toBe(false);
    });

    it('should handle patterns that could match root', () => {
      const patterns: ReviewIgnorePattern[] = [{ pattern: '**/*', negated: false, lineNumber: 1 }];
      expect(shouldIgnoreFile('file.ts', patterns)).toBe(true);
    });

    it('should handle case-sensitive matching', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/README.md', negated: false, lineNumber: 1 },
      ];
      expect(shouldIgnoreFile('README.md', patterns)).toBe(true);
      expect(shouldIgnoreFile('readme.md', patterns)).toBe(false);
    });

    it('should handle special characters in file names', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/file-with-dashes.ts', negated: false, lineNumber: 1 },
        { pattern: '**/file_with_underscores.ts', negated: false, lineNumber: 2 },
      ];
      expect(shouldIgnoreFile('src/file-with-dashes.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/file_with_underscores.ts', patterns)).toBe(true);
    });

    it('should handle Unicode in file names', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/文档.md', negated: false, lineNumber: 1 },
      ];
      expect(shouldIgnoreFile('docs/文档.md', patterns)).toBe(true);
    });
  });

  describe('negation edge cases', () => {
    it('should handle multiple negations', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/*.ts', negated: false, lineNumber: 1 },
        { pattern: '**/important.ts', negated: true, lineNumber: 2 },
        { pattern: '**/really-important.ts', negated: true, lineNumber: 3 },
      ];
      expect(shouldIgnoreFile('file.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('important.ts', patterns)).toBe(false);
      expect(shouldIgnoreFile('really-important.ts', patterns)).toBe(false);
    });

    it('should handle negation without prior exclusion', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/keep-this.ts', negated: true, lineNumber: 1 },
      ];
      // Negation of a file that wasn't excluded - file should not be ignored
      expect(shouldIgnoreFile('keep-this.ts', patterns)).toBe(false);
      expect(shouldIgnoreFile('other.ts', patterns)).toBe(false);
    });

    it('should handle re-exclusion after negation', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/test/**', negated: false, lineNumber: 1 },
        { pattern: '**/test/important/**', negated: true, lineNumber: 2 },
        { pattern: '**/test/important/actually-ignore.ts', negated: false, lineNumber: 3 },
      ];
      expect(shouldIgnoreFile('test/unit.ts', patterns)).toBe(true);
      expect(shouldIgnoreFile('test/important/keep.ts', patterns)).toBe(false);
      expect(shouldIgnoreFile('test/important/actually-ignore.ts', patterns)).toBe(true);
    });
  });

  describe('pattern parsing edge cases', () => {
    it('should handle patterns with spaces', () => {
      const result = parseReviewIgnoreLine('file with spaces.txt', 1);
      expect(result?.pattern).toBe('**/file with spaces.txt');
    });

    it('should handle escaped characters', () => {
      const result = parseReviewIgnoreLine('file\\[1\\].txt', 1);
      expect(result?.pattern).toBe('**/file\\[1\\].txt');
    });

    it('should handle very long patterns', () => {
      const longPath = 'a/'.repeat(50) + 'file.txt';
      const result = parseReviewIgnoreLine(longPath, 1);
      expect(result?.pattern).toBe(longPath);
    });
  });

  describe('integration with filterPathsByReviewIgnore', () => {
    it('should handle empty paths array', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/*.ts', negated: false, lineNumber: 1 },
      ];
      const result = filterPathsByReviewIgnore([], patterns);
      expect(result.included).toEqual([]);
      expect(result.ignoredCount).toBe(0);
    });

    it('should handle when all files are ignored', () => {
      const patterns: ReviewIgnorePattern[] = [{ pattern: '**/*', negated: false, lineNumber: 1 }];
      const paths = ['file1.ts', 'file2.ts', 'file3.ts'];
      const result = filterPathsByReviewIgnore(paths, patterns);
      expect(result.included).toEqual([]);
      expect(result.ignoredCount).toBe(3);
    });

    it('should handle when no files are ignored', () => {
      const patterns: ReviewIgnorePattern[] = [
        { pattern: '**/nonexistent/**', negated: false, lineNumber: 1 },
      ];
      const paths = ['src/file1.ts', 'src/file2.ts'];
      const result = filterPathsByReviewIgnore(paths, patterns);
      expect(result.included).toEqual(paths);
      expect(result.ignoredCount).toBe(0);
    });
  });
});
