/**
 * Path Filter Tests
 *
 * Tests for path filtering utilities used in agent shell commands.
 * Verifies defense-in-depth protection against command injection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { filterSafePaths } from '../agents/path-filter.js';

describe('Path Filter', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
      // Suppress console.warn in tests
    });
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('filterSafePaths', () => {
    it('should pass through safe paths unchanged', () => {
      const paths = ['src/index.ts', 'lib/utils.js', 'tests/foo.test.ts'];
      const result = filterSafePaths(paths, 'test-agent');

      expect(result.safePaths).toEqual(paths);
      expect(result.skippedCount).toBe(0);
      expect(result.skippedSamples).toEqual([]);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should skip paths with shell metacharacters', () => {
      const paths = [
        'safe.ts',
        'file$(id).ts', // command substitution
        'also-safe.js',
      ];

      const result = filterSafePaths(paths, 'semgrep');

      expect(result.safePaths).toEqual(['safe.ts', 'also-safe.js']);
      expect(result.skippedCount).toBe(1);
      // Format now includes unsafe chars: "file$(id).ts [$ ( )]"
      expect(result.skippedSamples[0]).toMatch(/file\$\(id\)\.ts \[/);
    });

    it('should skip paths with semicolon (command chaining)', () => {
      const paths = ['normal.ts', 'evil; rm -rf /.ts'];
      const result = filterSafePaths(paths, 'reviewdog');

      expect(result.safePaths).toEqual(['normal.ts']);
      expect(result.skippedCount).toBe(1);
    });

    it('should skip paths with pipe operator', () => {
      const paths = ['normal.ts', 'file | cat.ts'];
      const result = filterSafePaths(paths, 'reviewdog');

      expect(result.safePaths).toEqual(['normal.ts']);
      expect(result.skippedCount).toBe(1);
    });

    it('should skip paths with backticks', () => {
      const paths = ['normal.ts', 'file`whoami`.ts'];
      const result = filterSafePaths(paths, 'reviewdog');

      expect(result.safePaths).toEqual(['normal.ts']);
      expect(result.skippedCount).toBe(1);
    });

    it('should log warning when paths are skipped', () => {
      const paths = ['safe.ts', 'unsafe$(id).ts', 'also-safe.js'];
      filterSafePaths(paths, 'semgrep');

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[semgrep] Skipped 1 unsafe path(s)')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('unsafe$(id).ts'));
    });

    it('should limit samples to 3 paths', () => {
      const paths = [
        'safe.ts',
        'bad1$(id).ts',
        'bad2$(id).ts',
        'bad3$(id).ts',
        'bad4$(id).ts',
        'bad5$(id).ts',
      ];

      const result = filterSafePaths(paths, 'semgrep');

      expect(result.safePaths).toEqual(['safe.ts']);
      expect(result.skippedCount).toBe(5);
      expect(result.skippedSamples).toHaveLength(3);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('(and 2 more)'));
    });

    it('should truncate long paths in samples', () => {
      const longPath =
        'very/long/path/that/exceeds/fifty/characters/and/should/be/truncated$(id).ts';
      const paths = [longPath];

      const result = filterSafePaths(paths, 'agent');

      // Format: truncated path + " [unsafe chars]"
      // Path is truncated to 37 chars + "...", then " [$ ( )]" appended
      expect(result.skippedSamples[0]).toContain('...');
      expect(result.skippedSamples[0]).toMatch(/\[.*\]$/);
    });

    it('should handle empty input array', () => {
      const result = filterSafePaths([], 'agent');

      expect(result.safePaths).toEqual([]);
      expect(result.skippedCount).toBe(0);
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should handle all paths being unsafe', () => {
      const paths = ['$(id).ts', '$(whoami).js'];
      const result = filterSafePaths(paths, 'agent');

      expect(result.safePaths).toEqual([]);
      expect(result.skippedCount).toBe(2);
    });

    it('should allow paths with @ symbol (npm packages)', () => {
      const paths = ['node_modules/@types/node/index.d.ts'];
      const result = filterSafePaths(paths, 'agent');

      expect(result.safePaths).toEqual(paths);
      expect(result.skippedCount).toBe(0);
    });

    it('should allow paths with + and # (C++/C# files)', () => {
      const paths = ['src/c++/main.cpp', 'src/c#/Program.cs'];
      const result = filterSafePaths(paths, 'agent');

      expect(result.safePaths).toEqual(paths);
      expect(result.skippedCount).toBe(0);
    });

    // Additional edge case tests for shell metacharacters
    describe('additional shell metacharacter edge cases', () => {
      it('should skip paths with ampersand (command chaining)', () => {
        const paths = ['normal.ts', 'file && cat /etc/passwd.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with single ampersand (background execution)', () => {
        const paths = ['normal.ts', 'file & disown.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with newline (command injection)', () => {
        const paths = ['normal.ts', 'file\nrm -rf /.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with carriage return', () => {
        const paths = ['normal.ts', 'file\rinjection.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with null byte (truncation attack)', () => {
        const paths = ['normal.ts', 'file\0injection.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with exclamation mark (history expansion)', () => {
        const paths = ['normal.ts', 'file!.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with less-than operator (input redirection)', () => {
        const paths = ['normal.ts', 'file < /etc/passwd.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with greater-than operator (output redirection)', () => {
        const paths = ['normal.ts', 'file > /tmp/pwned.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with single quotes (string escape)', () => {
        const paths = ['normal.ts', "file'injection.ts"];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with double quotes (string escape)', () => {
        const paths = ['normal.ts', 'file"injection.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should skip paths with wildcards (glob injection)', () => {
        const paths = ['normal.ts', 'file*.ts', 'file?.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(2);
      });

      it('should skip paths with backslash (escape sequences)', () => {
        const paths = ['normal.ts', 'C:\\Windows\\system32.ts'];
        const result = filterSafePaths(paths, 'agent');

        expect(result.safePaths).toEqual(['normal.ts']);
        expect(result.skippedCount).toBe(1);
      });

      it('should log unsafe chars in sample output', () => {
        const paths = ['file&rm.ts'];
        filterSafePaths(paths, 'agent');

        // Should include the & character in the log
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('&'));
      });
    });
  });
});
