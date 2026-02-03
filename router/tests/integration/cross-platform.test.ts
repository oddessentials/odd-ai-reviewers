/**
 * Cross-Platform Integration Tests (Phase 12)
 *
 * Tests for platform-specific behavior and compatibility.
 *
 * Tests covered:
 * - T137: Unicode box drawing compatibility
 * - T138: Path handling with backslashes on Windows
 * - T139: ANSI color codes compatibility
 * - T140: Git command execution
 *
 * @module tests/integration/cross-platform
 */

import { describe, it, expect } from 'vitest';
import { supportsUnicode, supportsColor, ANSI } from '../../src/cli/output/colors.js';
import { getBoxChars } from '../../src/report/terminal.js';
import { normalizePath, findGitRoot } from '../../src/cli/git-context.js';
import { isOk } from '../../src/types/result.js';
import { fileURLToPath } from 'url';
import * as path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

describe('T137: Unicode Box Drawing Compatibility', () => {
  describe('Box Character Sets', () => {
    it('should provide Unicode box characters when supported', () => {
      const chars = getBoxChars(true);

      // Unicode box drawing characters
      expect(chars.topLeft).toBe('┌');
      expect(chars.topRight).toBe('┐');
      expect(chars.bottomLeft).toBe('└');
      expect(chars.bottomRight).toBe('┘');
      expect(chars.horizontal).toBe('─');
      expect(chars.vertical).toBe('│');
    });

    it('should provide ASCII fallback when Unicode not supported', () => {
      const chars = getBoxChars(false);

      // ASCII fallback characters
      expect(chars.topLeft).toBe('+');
      expect(chars.topRight).toBe('+');
      expect(chars.bottomLeft).toBe('+');
      expect(chars.bottomRight).toBe('+');
      expect(chars.horizontal).toBe('-');
      expect(chars.vertical).toBe('|');
    });

    it('should detect Unicode support based on environment', () => {
      // The function should return a boolean
      const result = supportsUnicode();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Terminal Detection', () => {
    it('should detect terminal capabilities', () => {
      // Color support detection
      const colorSupport = supportsColor();
      expect(typeof colorSupport).toBe('boolean');
    });

    it('should have ANSI codes defined', () => {
      // ANSI escape codes should be defined
      expect(ANSI.reset).toBeDefined();
      expect(ANSI.bold).toBeDefined();
      expect(ANSI.red).toBeDefined();
      expect(ANSI.green).toBeDefined();
      expect(ANSI.yellow).toBeDefined();
      expect(ANSI.blue).toBeDefined();
    });
  });
});

describe('T138: Path Handling with Backslashes on Windows', () => {
  describe('Path Normalization', () => {
    it('should convert backslashes to forward slashes', () => {
      const windowsPath = 'C:\\Users\\test\\project\\src\\file.ts';
      const normalized = normalizePath(windowsPath);

      expect(normalized).toBe('C:/Users/test/project/src/file.ts');
      expect(normalized).not.toContain('\\');
    });

    it('should preserve forward slashes', () => {
      const unixPath = '/home/user/project/src/file.ts';
      const normalized = normalizePath(unixPath);

      expect(normalized).toBe(unixPath);
    });

    it('should handle mixed slashes', () => {
      const mixedPath = 'C:\\Users/test\\project/src\\file.ts';
      const normalized = normalizePath(mixedPath);

      expect(normalized).toBe('C:/Users/test/project/src/file.ts');
      expect(normalized).not.toContain('\\');
    });

    it('should handle empty string', () => {
      expect(normalizePath('')).toBe('');
    });

    it('should handle relative paths', () => {
      const relativePath = '..\\..\\src\\file.ts';
      const normalized = normalizePath(relativePath);

      expect(normalized).toBe('../../src/file.ts');
    });
  });

  describe('Git Root Detection', () => {
    it('should return normalized path on Windows', () => {
      const result = findGitRoot(REPO_ROOT);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Path should use forward slashes
        expect(result.value).not.toContain('\\');
      }
    });

    it('should handle Windows-style input paths', () => {
      // This test is only meaningful on Windows where backslash paths are valid
      // On Unix, converting /home/runner to \home\runner creates an invalid path
      if (process.platform !== 'win32') {
        // On non-Windows, just verify findGitRoot works with the normal path
        const result = findGitRoot(REPO_ROOT);
        expect(isOk(result)).toBe(true);
        return;
      }

      // On Windows, path.resolve might return backslashes
      const windowsStylePath = REPO_ROOT.replace(/\//g, '\\');
      const result = findGitRoot(windowsStylePath);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Output should be normalized
        expect(result.value).not.toContain('\\');
      }
    });
  });
});

describe('T139: ANSI Color Codes Compatibility', () => {
  describe('Color Codes', () => {
    it('should have standard ANSI color codes', () => {
      // Standard ANSI escape codes
      /* eslint-disable no-control-regex */
      expect(ANSI.red).toMatch(/^\x1b\[/);
      expect(ANSI.green).toMatch(/^\x1b\[/);
      expect(ANSI.yellow).toMatch(/^\x1b\[/);
      expect(ANSI.blue).toMatch(/^\x1b\[/);
      expect(ANSI.reset).toMatch(/^\x1b\[/);
      /* eslint-enable no-control-regex */
    });

    it('should have proper reset code', () => {
      // Reset should be \x1b[0m
      expect(ANSI.reset).toBe('\x1b[0m');
    });

    it('should have bold modifier', () => {
      expect(ANSI.bold).toBeDefined();
      // eslint-disable-next-line no-control-regex
      expect(ANSI.bold).toMatch(/^\x1b\[/);
    });
  });

  describe('Environment Detection', () => {
    it('should respect NO_COLOR environment variable', () => {
      // Save original
      const originalNoColor = process.env['NO_COLOR'];

      try {
        process.env['NO_COLOR'] = '1';
        // Force re-detection
        const result = supportsColor();
        // When NO_COLOR is set, should return false
        expect(result).toBe(false);
      } finally {
        // Restore
        if (originalNoColor !== undefined) {
          process.env['NO_COLOR'] = originalNoColor;
        } else {
          delete process.env['NO_COLOR'];
        }
      }
    });
  });
});

describe('T140: Git Command Execution', () => {
  describe('Git Availability', () => {
    it('should be able to find git root from repo', () => {
      const result = findGitRoot(REPO_ROOT);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should return a valid path
        expect(result.value.length).toBeGreaterThan(0);
      }
    });

    it('should detect that this is a git repository', async () => {
      const { inferGitContext } = await import('../../src/cli/git-context.js');
      const result = inferGitContext(REPO_ROOT);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        // Should have git context
        expect(result.value.repoRoot).toBeDefined();
        expect(result.value.currentBranch).toBeDefined();
        expect(result.value.defaultBase).toBeDefined();
      }
    });
  });

  describe('Branch Detection', () => {
    it('should detect current branch', async () => {
      const { getCurrentBranch } = await import('../../src/cli/git-context.js');
      const result = findGitRoot(REPO_ROOT);

      if (isOk(result)) {
        const branch = getCurrentBranch(result.value);

        // Should return a branch name (or 'HEAD' if detached)
        expect(typeof branch).toBe('string');
        expect(branch.length).toBeGreaterThan(0);
      }
    });

    it('should detect default branch', async () => {
      const { detectDefaultBranch } = await import('../../src/cli/git-context.js');
      const result = findGitRoot(REPO_ROOT);

      if (isOk(result)) {
        const defaultBranch = detectDefaultBranch(result.value);

        // Should return a branch name (main, master, or similar)
        expect(typeof defaultBranch).toBe('string');
        expect(defaultBranch.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Change Detection', () => {
    it('should detect uncommitted changes status', async () => {
      const { hasUncommittedChanges } = await import('../../src/cli/git-context.js');
      const result = findGitRoot(REPO_ROOT);

      if (isOk(result)) {
        const hasChanges = hasUncommittedChanges(result.value);

        // Should return boolean
        expect(typeof hasChanges).toBe('boolean');
      }
    });

    it('should detect staged changes status', async () => {
      const { hasStagedChanges } = await import('../../src/cli/git-context.js');
      const result = findGitRoot(REPO_ROOT);

      if (isOk(result)) {
        const hasStaged = hasStagedChanges(result.value);

        // Should return boolean
        expect(typeof hasStaged).toBe('boolean');
      }
    });
  });
});

describe('Platform Detection', () => {
  it('should correctly identify current platform', () => {
    const platform = process.platform;

    // Should be one of the known platforms
    expect(['win32', 'darwin', 'linux', 'freebsd', 'openbsd', 'sunos', 'aix']).toContain(platform);
  });

  it('should handle platform-specific paths', () => {
    const testPath =
      process.platform === 'win32' ? 'C:\\Users\\test\\project' : '/home/user/project';

    const normalized = normalizePath(testPath);

    // Should not contain backslashes in normalized output
    expect(normalized).not.toContain('\\');
  });
});
