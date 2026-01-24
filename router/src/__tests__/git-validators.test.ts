/**
 * Git Input Validators Tests
 *
 * Comprehensive tests for command injection protection.
 * Per INVARIANT #6: PR code, diffs, repo contents, and filenames MUST be treated as hostile.
 */

import { describe, it, expect } from 'vitest';
import { assertSafeGitRef, assertSafePath, assertSafeRepoPath } from '../git-validators.js';

describe('Git Input Validators (Security)', () => {
  describe('assertSafeGitRef', () => {
    describe('valid refs', () => {
      it('should accept valid SHA-1 commit hash', () => {
        expect(() =>
          assertSafeGitRef('abc123def456789012345678901234567890abcd', 'sha')
        ).not.toThrow();
      });

      it('should accept short SHA', () => {
        expect(() => assertSafeGitRef('abc123d', 'sha')).not.toThrow();
      });

      it('should accept refs/heads/main format', () => {
        expect(() => assertSafeGitRef('refs/heads/main', 'ref')).not.toThrow();
      });

      it('should accept origin/main format', () => {
        expect(() => assertSafeGitRef('origin/main', 'ref')).not.toThrow();
      });

      it('should accept branch names with hyphens', () => {
        expect(() => assertSafeGitRef('feature/add-new-feature', 'ref')).not.toThrow();
      });

      it('should accept branch names with underscores', () => {
        expect(() => assertSafeGitRef('fix_bug_123', 'ref')).not.toThrow();
      });

      it('should accept branch names with dots', () => {
        expect(() => assertSafeGitRef('release/v1.2.3', 'ref')).not.toThrow();
      });

      it('should accept HEAD', () => {
        expect(() => assertSafeGitRef('HEAD', 'ref')).not.toThrow();
      });

      it('should accept HEAD~1 style refs', () => {
        // Note: ~ is not in our allowlist, this should fail
        // This is intentional - use resolved SHAs instead
        expect(() => assertSafeGitRef('HEAD~1', 'ref')).toThrow();
      });
    });

    describe('command injection attempts', () => {
      it('should reject command substitution with $()', () => {
        expect(() => assertSafeGitRef('$(whoami)', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject command substitution with backticks', () => {
        expect(() => assertSafeGitRef('ref`id`', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject command chaining with semicolon', () => {
        expect(() => assertSafeGitRef('main; rm -rf /', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject command chaining with &&', () => {
        expect(() => assertSafeGitRef('main && cat /etc/passwd', 'ref')).toThrow(
          /unsafe characters/
        );
      });

      it('should reject pipe operator', () => {
        expect(() => assertSafeGitRef('main | cat', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject environment variable expansion', () => {
        expect(() => assertSafeGitRef('$HOME', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject shell globbing', () => {
        expect(() => assertSafeGitRef('main*', 'ref')).toThrow(/unsafe characters/);
        expect(() => assertSafeGitRef('main?', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject redirection operators', () => {
        expect(() => assertSafeGitRef('main > /tmp/out', 'ref')).toThrow(/unsafe characters/);
        expect(() => assertSafeGitRef('main < /etc/passwd', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject quotes', () => {
        expect(() => assertSafeGitRef("main'", 'ref')).toThrow(/unsafe characters/);
        expect(() => assertSafeGitRef('main"', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject backslash escapes', () => {
        expect(() => assertSafeGitRef('main\\ntest', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject newlines', () => {
        expect(() => assertSafeGitRef('main\nrm -rf /', 'ref')).toThrow(/unsafe characters/);
      });

      it('should reject carriage returns', () => {
        expect(() => assertSafeGitRef('main\rtest', 'ref')).toThrow(/unsafe characters/);
      });
    });

    describe('edge cases', () => {
      it('should reject empty string', () => {
        expect(() => assertSafeGitRef('', 'ref')).toThrow(/empty/);
      });

      it('should reject excessively long refs', () => {
        const longRef = 'a'.repeat(600);
        expect(() => assertSafeGitRef(longRef, 'ref')).toThrow(/maximum length/);
      });

      it('should include parameter name in error message', () => {
        expect(() => assertSafeGitRef('$(id)', 'baseSha')).toThrow(/baseSha/);
      });
    });
  });

  describe('assertSafePath', () => {
    describe('valid paths', () => {
      it('should accept simple file path', () => {
        expect(() => assertSafePath('src/diff.ts', 'path')).not.toThrow();
      });

      it('should accept paths with dots', () => {
        expect(() => assertSafePath('src/config.test.ts', 'path')).not.toThrow();
      });

      it('should accept paths with hyphens and underscores', () => {
        expect(() => assertSafePath('src/my-module_v2/file.ts', 'path')).not.toThrow();
      });

      it('should accept absolute paths', () => {
        expect(() => assertSafePath('/home/user/project/file.ts', 'path')).not.toThrow();
      });

      it('should accept Windows-style paths with forward slashes', () => {
        // Note: backslashes are blocked for security
        expect(() => assertSafePath('C:/Users/project/file.ts', 'path')).not.toThrow();
      });

      it('should accept paths with spaces', () => {
        expect(() => assertSafePath('src/my file.ts', 'path')).not.toThrow();
      });

      it('should accept paths with @ symbol', () => {
        expect(() => assertSafePath('node_modules/@types/node/index.d.ts', 'path')).not.toThrow();
      });

      it('should accept paths with + symbol', () => {
        expect(() => assertSafePath('src/c++/file.cpp', 'path')).not.toThrow();
      });

      it('should accept paths with # symbol', () => {
        expect(() => assertSafePath('src/c#/file.cs', 'path')).not.toThrow();
      });
    });

    describe('command injection attempts', () => {
      it('should reject command substitution', () => {
        expect(() => assertSafePath('file$(id).ts', 'path')).toThrow(/unsafe/);
      });

      it('should reject command chaining', () => {
        expect(() => assertSafePath('file; cat /etc/passwd', 'path')).toThrow(/unsafe/);
      });

      it('should reject pipe operator', () => {
        expect(() => assertSafePath('file | tee /tmp/out', 'path')).toThrow(/unsafe/);
      });

      it('should reject backticks', () => {
        expect(() => assertSafePath('file`whoami`.ts', 'path')).toThrow(/unsafe/);
      });

      it('should reject backslash', () => {
        // Backslash can be used for escape sequences
        expect(() => assertSafePath('C:\\Users\\file.ts', 'path')).toThrow(/unsafe/);
      });

      it('should reject null bytes', () => {
        expect(() => assertSafePath('file\0.ts', 'path')).toThrow(/unsafe/);
      });
    });

    describe('edge cases', () => {
      it('should reject empty string', () => {
        expect(() => assertSafePath('', 'path')).toThrow(/empty/);
      });

      it('should reject excessively long paths', () => {
        const longPath = 'a/'.repeat(2500);
        expect(() => assertSafePath(longPath, 'path')).toThrow(/maximum length/);
      });
    });
  });

  describe('assertSafeRepoPath', () => {
    it('should accept valid repository paths', () => {
      expect(() => assertSafeRepoPath('/home/runner/work/repo')).not.toThrow();
      expect(() => assertSafeRepoPath('D:/a/repo/repo')).not.toThrow();
    });

    it('should accept relative paths (legitimate CI use case)', () => {
      // CI uses "../target" pattern - this is legitimate
      expect(() => assertSafeRepoPath('../target')).not.toThrow();
      expect(() => assertSafeRepoPath('./repo')).not.toThrow();
      expect(() => assertSafeRepoPath('relative/path')).not.toThrow();
      expect(() => assertSafeRepoPath('/home/user/../../../etc')).not.toThrow();
    });

    it('should reject command injection in repo path', () => {
      // Real protection: shell metacharacter blocking
      expect(() => assertSafeRepoPath('/repo$(id)')).toThrow(/unsafe/);
    });

    it('should reject backslash paths (Windows style)', () => {
      // Backslash is a shell metacharacter - blocked for security
      expect(() => assertSafeRepoPath('C:\\Users\\repo')).toThrow(/unsafe/);
    });
  });
});

describe('Git Validators Integration', () => {
  it('should provide clear, actionable error messages', () => {
    try {
      assertSafeGitRef('$(whoami)', 'baseSha');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('baseSha');
      expect(message).toContain('unsafe characters');
      expect(message).toContain('alphanumeric');
    }
  });
});
