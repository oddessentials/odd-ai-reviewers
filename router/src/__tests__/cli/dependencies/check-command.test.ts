/**
 * Unit tests for check command output formatting.
 * Tests success output, missing output, and JSON output format.
 */

import { execFileSync } from 'child_process';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { runCheck, formatCheckOutput, formatCheckOutputJson } from '../../../cli/commands/check.js';

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

describe('check command', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('runCheck', () => {
    it('returns success when all dependencies are available', () => {
      mockExecFileSync
        .mockReturnValueOnce('semgrep 1.56.0')
        .mockReturnValueOnce('reviewdog version: 0.17.4');

      const result = runCheck({});

      expect(result.exitCode).toBe(0);
      expect(result.summary.allAvailable).toBe(true);
    });

    it('returns failure when required dependency is missing', () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFileSync.mockImplementation(() => {
        throw error;
      });

      const result = runCheck({});

      expect(result.exitCode).toBe(1);
      expect(result.summary.allAvailable).toBe(false);
    });

    it('checks all known dependencies', () => {
      mockExecFileSync
        .mockReturnValueOnce('semgrep 1.56.0')
        .mockReturnValueOnce('reviewdog version: 0.17.4');

      const result = runCheck({});

      expect(result.results).toHaveLength(2);
      expect(result.results.map((r) => r.name)).toContain('semgrep');
      expect(result.results.map((r) => r.name)).toContain('reviewdog');
    });
  });

  describe('formatCheckOutput', () => {
    it('shows checkmark for available dependencies', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutput(results, { verbose: false });

      expect(output).toContain('✓');
      expect(output.toLowerCase()).toContain('semgrep');
      expect(output).toContain('1.56.0');
    });

    it('shows X mark for missing dependencies', () => {
      const results = [
        { name: 'semgrep', status: 'missing' as const, version: null, error: 'not found' },
      ];

      const output = formatCheckOutput(results, { verbose: false });

      expect(output).toContain('✗');
      expect(output.toLowerCase()).toContain('semgrep');
      expect(output.toLowerCase()).toContain('missing');
    });

    it('shows warning for unhealthy dependencies', () => {
      const results = [
        { name: 'semgrep', status: 'unhealthy' as const, version: null, error: 'command failed' },
      ];

      const output = formatCheckOutput(results, { verbose: false });

      expect(output).toContain('⚠');
      expect(output.toLowerCase()).toContain('semgrep');
    });

    it('shows version mismatch warning', () => {
      const results = [
        {
          name: 'semgrep',
          status: 'version-mismatch' as const,
          version: '0.99.0',
          error: 'requires 1.0.0',
        },
      ];

      const output = formatCheckOutput(results, { verbose: false });

      expect(output).toContain('0.99.0');
    });

    it('includes header in output', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutput(results, { verbose: false });

      expect(output.toLowerCase()).toMatch(/dependency|check|status/);
    });

    it('includes install instructions in verbose mode', () => {
      const results = [
        { name: 'semgrep', status: 'missing' as const, version: null, error: 'not found' },
      ];

      const output = formatCheckOutput(results, { verbose: true });

      expect(output).toMatch(/install|brew|pip/i);
    });

    it('includes docs URL in verbose mode', () => {
      const results = [
        { name: 'semgrep', status: 'missing' as const, version: null, error: 'not found' },
      ];

      const output = formatCheckOutput(results, { verbose: true });

      expect(output).toContain('https://');
    });

    it('shows minimum version in verbose mode', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutput(results, { verbose: true });

      expect(output).toContain('1.0.0'); // minimum version for semgrep
    });
  });

  describe('formatCheckOutputJson', () => {
    it('returns valid JSON', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutputJson(results);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('includes all dependency results', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
        { name: 'reviewdog', status: 'missing' as const, version: null, error: 'not found' },
      ];

      const output = formatCheckOutputJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.dependencies).toHaveLength(2);
    });

    it('includes summary with counts', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
        { name: 'reviewdog', status: 'missing' as const, version: null, error: 'not found' },
      ];

      const output = formatCheckOutputJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.summary).toBeDefined();
      expect(parsed.summary.available).toBe(1);
      expect(parsed.summary.missing).toBe(1);
    });

    it('includes allAvailable flag', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutputJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.summary.allAvailable).toBe(true);
    });

    it('sets allAvailable to false when any missing', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
        { name: 'reviewdog', status: 'missing' as const, version: null, error: 'not found' },
      ];

      const output = formatCheckOutputJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.summary.allAvailable).toBe(false);
    });

    it('includes platform information', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutputJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.platform).toBeDefined();
      expect(['darwin', 'win32', 'linux']).toContain(parsed.platform);
    });

    it('includes timestamp', () => {
      const results = [
        { name: 'semgrep', status: 'available' as const, version: '1.56.0', error: null },
      ];

      const output = formatCheckOutputJson(results);
      const parsed = JSON.parse(output);

      expect(parsed.timestamp).toBeDefined();
      expect(() => new Date(parsed.timestamp)).not.toThrow();
    });
  });

  describe('exit codes', () => {
    it('returns 0 when all available', () => {
      mockExecFileSync
        .mockReturnValueOnce('semgrep 1.56.0')
        .mockReturnValueOnce('reviewdog version: 0.17.4');

      const result = runCheck({});

      expect(result.exitCode).toBe(0);
    });

    it('returns 1 when any missing', () => {
      mockExecFileSync.mockReturnValueOnce('semgrep 1.56.0');
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFileSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = runCheck({});

      expect(result.exitCode).toBe(1);
    });

    it('returns 1 when any unhealthy', () => {
      mockExecFileSync
        .mockReturnValueOnce('unexpected output')
        .mockReturnValueOnce('reviewdog version: 0.17.4');

      const result = runCheck({});

      expect(result.exitCode).toBe(1);
    });
  });
});
