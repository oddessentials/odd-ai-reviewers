/**
 * Unit tests for platform detection utility.
 */

import os from 'os';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { detectPlatform, isSupportedPlatform } from '../../../cli/dependencies/platform.js';

describe('platform detection', () => {
  const originalPlatform = os.platform;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore original platform function
    os.platform = originalPlatform;
  });

  describe('detectPlatform', () => {
    it('returns "darwin" on macOS', () => {
      os.platform = vi.fn().mockReturnValue('darwin');
      expect(detectPlatform()).toBe('darwin');
    });

    it('returns "win32" on Windows', () => {
      os.platform = vi.fn().mockReturnValue('win32');
      expect(detectPlatform()).toBe('win32');
    });

    it('returns "linux" on Linux', () => {
      os.platform = vi.fn().mockReturnValue('linux');
      expect(detectPlatform()).toBe('linux');
    });

    it('returns "linux" for unsupported platforms (freebsd)', () => {
      os.platform = vi.fn().mockReturnValue('freebsd');
      expect(detectPlatform()).toBe('linux');
    });

    it('returns "linux" for unsupported platforms (sunos)', () => {
      os.platform = vi.fn().mockReturnValue('sunos');
      expect(detectPlatform()).toBe('linux');
    });

    it('returns "linux" for unsupported platforms (openbsd)', () => {
      os.platform = vi.fn().mockReturnValue('openbsd');
      expect(detectPlatform()).toBe('linux');
    });
  });

  describe('isSupportedPlatform', () => {
    it('returns true for darwin', () => {
      os.platform = vi.fn().mockReturnValue('darwin');
      expect(isSupportedPlatform()).toBe(true);
    });

    it('returns true for win32', () => {
      os.platform = vi.fn().mockReturnValue('win32');
      expect(isSupportedPlatform()).toBe(true);
    });

    it('returns true for linux', () => {
      os.platform = vi.fn().mockReturnValue('linux');
      expect(isSupportedPlatform()).toBe(true);
    });

    it('returns false for freebsd', () => {
      os.platform = vi.fn().mockReturnValue('freebsd');
      expect(isSupportedPlatform()).toBe(false);
    });

    it('returns false for sunos', () => {
      os.platform = vi.fn().mockReturnValue('sunos');
      expect(isSupportedPlatform()).toBe(false);
    });

    it('returns false for aix', () => {
      os.platform = vi.fn().mockReturnValue('aix');
      expect(isSupportedPlatform()).toBe(false);
    });
  });

  describe('integration with current platform', () => {
    it('returns a valid Platform type for current system', () => {
      // Restore original to test actual platform
      os.platform = originalPlatform;
      const platform = detectPlatform();
      expect(['darwin', 'win32', 'linux']).toContain(platform);
    });
  });
});
