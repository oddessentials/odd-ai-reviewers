/**
 * Unicode Support Detection Tests
 *
 * Tests for supportsUnicode() function in colors.ts.
 * Covers Phase 6 task T070a.
 */

import { describe, it, expect } from 'vitest';
import { supportsUnicode } from '../../../../src/cli/output/colors.js';

// =============================================================================
// T070a: supportsUnicode() Tests (6 cases)
// =============================================================================

describe('supportsUnicode (T070a)', () => {
  describe('Windows Terminal detection', () => {
    it('should return true when WT_SESSION is set (Windows Terminal)', () => {
      const env = { WT_SESSION: 'some-session-id' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true when WT_SESSION is empty string (still present)', () => {
      const env = { WT_SESSION: '' };
      expect(supportsUnicode(env)).toBe(true);
    });
  });

  describe('ConEmu detection', () => {
    it('should return true when ConEmuANSI=ON', () => {
      const env = { ConEmuANSI: 'ON' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return false when ConEmuANSI is other value', () => {
      const env = { ConEmuANSI: 'OFF' };
      expect(supportsUnicode(env)).toBe(false);
    });
  });

  describe('TERM-based detection', () => {
    it('should return true for xterm-256color', () => {
      const env = { TERM: 'xterm-256color' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true for xterm', () => {
      const env = { TERM: 'xterm' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true for screen-256color', () => {
      const env = { TERM: 'screen-256color' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true for truecolor terminals', () => {
      const env = { TERM: 'xterm-truecolor' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return false for dumb terminal', () => {
      const env = { TERM: 'dumb' };
      expect(supportsUnicode(env)).toBe(false);
    });

    it('should be case-insensitive for TERM', () => {
      const env = { TERM: 'XTERM-256COLOR' };
      expect(supportsUnicode(env)).toBe(true);
    });
  });

  describe('Locale-based UTF-8 detection', () => {
    it('should return true when LANG contains UTF-8', () => {
      const env = { LANG: 'en_US.UTF-8' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true when LC_ALL contains utf8 (lowercase)', () => {
      const env = { LC_ALL: 'en_US.utf8' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true when LC_CTYPE contains UTF-8', () => {
      const env = { LC_CTYPE: 'C.UTF-8' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should be case-insensitive for UTF-8 detection', () => {
      const env = { LANG: 'en_US.utf-8' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return false for non-UTF-8 locale', () => {
      const env = { LANG: 'C', LC_ALL: 'POSIX' };
      expect(supportsUnicode(env)).toBe(false);
    });
  });

  describe('cmd.exe/dumb terminal fallback', () => {
    it('should return false for dumb TERM', () => {
      const env = { TERM: 'dumb' };
      expect(supportsUnicode(env)).toBe(false);
    });

    it('should return false for empty environment', () => {
      const env = {};
      expect(supportsUnicode(env)).toBe(false);
    });

    it('should return false for minimal environment without indicators', () => {
      const env = {
        PATH: '/usr/bin',
        HOME: '/home/user',
      };
      expect(supportsUnicode(env)).toBe(false);
    });
  });

  describe('CI environment detection', () => {
    it('should return true in GitHub Actions', () => {
      const env = { GITHUB_ACTIONS: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true when CI=true', () => {
      const env = { CI: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true in GitLab CI', () => {
      const env = { GITLAB_CI: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true in CircleCI', () => {
      const env = { CIRCLECI: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true in Travis CI', () => {
      const env = { TRAVIS: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true in Azure DevOps', () => {
      const env = { TF_BUILD: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return true when CI is set (any truthy value)', () => {
      const env = { CI: 'true' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('should return false when CI is not "true"', () => {
      const env = { CI: 'false' };
      expect(supportsUnicode(env)).toBe(false);
    });
  });

  describe('Priority order', () => {
    it('Windows Terminal takes priority over dumb TERM', () => {
      const env = { WT_SESSION: 'session', TERM: 'dumb' };
      expect(supportsUnicode(env)).toBe(true);
    });

    it('dumb TERM overrides UTF-8 locale', () => {
      const env = { TERM: 'dumb', LANG: 'en_US.UTF-8' };
      expect(supportsUnicode(env)).toBe(false);
    });

    it('ConEmu takes priority over dumb TERM', () => {
      const env = { ConEmuANSI: 'ON', TERM: 'dumb' };
      expect(supportsUnicode(env)).toBe(true);
    });
  });
});
