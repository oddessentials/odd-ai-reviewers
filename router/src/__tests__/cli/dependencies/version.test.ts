/**
 * Unit tests for version parsing utilities.
 */

import { describe, expect, it } from 'vitest';

import {
  parseVersion,
  compareVersions,
  meetsMinimum,
  extractVersionString,
} from '../../../cli/dependencies/version.js';

describe('version utilities', () => {
  describe('parseVersion', () => {
    it('parses semgrep version output', () => {
      const result = parseVersion('semgrep 1.56.0');
      expect(result).toEqual({
        major: 1,
        minor: 56,
        patch: 0,
        raw: '1.56.0',
      });
    });

    it('parses reviewdog version output', () => {
      const result = parseVersion('reviewdog version: 0.17.4');
      expect(result).toEqual({
        major: 0,
        minor: 17,
        patch: 4,
        raw: '0.17.4',
      });
    });

    it('parses version with v prefix', () => {
      const result = parseVersion('v2.3.4');
      expect(result).toEqual({
        major: 2,
        minor: 3,
        patch: 4,
        raw: '2.3.4',
      });
    });

    it('parses version embedded in text', () => {
      const result = parseVersion('Tool version is 10.20.30 (stable)');
      expect(result).toEqual({
        major: 10,
        minor: 20,
        patch: 30,
        raw: '10.20.30',
      });
    });

    it('parses multiline output taking first version', () => {
      const result = parseVersion('git version 2.39.0\nsome other text 1.0.0');
      expect(result).toEqual({
        major: 2,
        minor: 39,
        patch: 0,
        raw: '2.39.0',
      });
    });

    it('returns null for invalid version string', () => {
      expect(parseVersion('no version here')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseVersion('')).toBeNull();
    });

    it('returns null for partial version (major.minor only)', () => {
      // Our regex requires major.minor.patch
      expect(parseVersion('version 1.2')).toBeNull();
    });

    it('uses custom regex when provided', () => {
      const customRegex = /version: (\d+)\.(\d+)\.(\d+)/;
      const result = parseVersion('tool version: 5.6.7', customRegex);
      expect(result).toEqual({
        major: 5,
        minor: 6,
        patch: 7,
        raw: '5.6.7',
      });
    });

    it('handles single capture group regex', () => {
      const customRegex = /v([\d.]+)/;
      const result = parseVersion('tool v1.2.3-beta', customRegex);
      expect(result).toEqual({
        major: 1,
        minor: 2,
        patch: 3,
        raw: '1.2.3',
      });
    });
  });

  describe('compareVersions', () => {
    it('returns 0 for equal versions', () => {
      const v1 = { major: 1, minor: 2, patch: 3, raw: '1.2.3' };
      const v2 = { major: 1, minor: 2, patch: 3, raw: '1.2.3' };
      expect(compareVersions(v1, v2)).toBe(0);
    });

    it('returns 1 when first version is greater (major)', () => {
      const v1 = { major: 2, minor: 0, patch: 0, raw: '2.0.0' };
      const v2 = { major: 1, minor: 9, patch: 9, raw: '1.9.9' };
      expect(compareVersions(v1, v2)).toBe(1);
    });

    it('returns -1 when first version is less (major)', () => {
      const v1 = { major: 1, minor: 9, patch: 9, raw: '1.9.9' };
      const v2 = { major: 2, minor: 0, patch: 0, raw: '2.0.0' };
      expect(compareVersions(v1, v2)).toBe(-1);
    });

    it('returns 1 when first version is greater (minor)', () => {
      const v1 = { major: 1, minor: 5, patch: 0, raw: '1.5.0' };
      const v2 = { major: 1, minor: 4, patch: 9, raw: '1.4.9' };
      expect(compareVersions(v1, v2)).toBe(1);
    });

    it('returns -1 when first version is less (minor)', () => {
      const v1 = { major: 1, minor: 4, patch: 9, raw: '1.4.9' };
      const v2 = { major: 1, minor: 5, patch: 0, raw: '1.5.0' };
      expect(compareVersions(v1, v2)).toBe(-1);
    });

    it('returns 1 when first version is greater (patch)', () => {
      const v1 = { major: 1, minor: 2, patch: 4, raw: '1.2.4' };
      const v2 = { major: 1, minor: 2, patch: 3, raw: '1.2.3' };
      expect(compareVersions(v1, v2)).toBe(1);
    });

    it('returns -1 when first version is less (patch)', () => {
      const v1 = { major: 1, minor: 2, patch: 3, raw: '1.2.3' };
      const v2 = { major: 1, minor: 2, patch: 4, raw: '1.2.4' };
      expect(compareVersions(v1, v2)).toBe(-1);
    });
  });

  describe('meetsMinimum', () => {
    it('returns true when installed equals minimum', () => {
      const installed = { major: 1, minor: 0, patch: 0, raw: '1.0.0' };
      expect(meetsMinimum(installed, '1.0.0')).toBe(true);
    });

    it('returns true when installed exceeds minimum', () => {
      const installed = { major: 2, minor: 5, patch: 3, raw: '2.5.3' };
      expect(meetsMinimum(installed, '1.0.0')).toBe(true);
    });

    it('returns false when installed is below minimum', () => {
      const installed = { major: 0, minor: 9, patch: 9, raw: '0.9.9' };
      expect(meetsMinimum(installed, '1.0.0')).toBe(false);
    });

    it('returns true when minimum cannot be parsed (fail open)', () => {
      const installed = { major: 1, minor: 0, patch: 0, raw: '1.0.0' };
      expect(meetsMinimum(installed, 'invalid')).toBe(true);
    });

    it('handles semgrep minimum version requirement', () => {
      const installed = { major: 1, minor: 56, patch: 0, raw: '1.56.0' };
      expect(meetsMinimum(installed, '1.0.0')).toBe(true);
    });

    it('handles reviewdog minimum version requirement', () => {
      const installed = { major: 0, minor: 17, patch: 4, raw: '0.17.4' };
      expect(meetsMinimum(installed, '0.14.0')).toBe(true);
    });

    it('fails when reviewdog is below minimum', () => {
      const installed = { major: 0, minor: 13, patch: 0, raw: '0.13.0' };
      expect(meetsMinimum(installed, '0.14.0')).toBe(false);
    });
  });

  describe('extractVersionString', () => {
    it('extracts version string from output', () => {
      expect(extractVersionString('semgrep 1.56.0')).toBe('1.56.0');
    });

    it('returns null for invalid output', () => {
      expect(extractVersionString('no version')).toBeNull();
    });

    it('uses custom regex', () => {
      const result = extractVersionString('ver: 1.2.3', /ver: (\d+\.\d+\.\d+)/);
      expect(result).toBe('1.2.3');
    });
  });
});
