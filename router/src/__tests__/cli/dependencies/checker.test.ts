/**
 * Unit tests for dependency checker.
 * Tests checkDependency function for available, missing, unhealthy, version-mismatch states.
 */

import { execFileSync } from 'child_process';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  checkDependency,
  checkAllDependencies,
  getDependenciesForPasses,
  checkDependenciesForPasses,
} from '../../../cli/dependencies/checker.js';
import type { DependencyCheckResult } from '../../../cli/dependencies/types.js';

// Mock child_process
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

describe('dependency checker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkDependency', () => {
    describe('available state', () => {
      it('returns available when dependency exists with valid version', () => {
        mockExecFileSync.mockReturnValue('semgrep 1.56.0');

        const result = checkDependency('semgrep');

        expect(result.status).toBe('available');
        expect(result.name).toBe('semgrep');
        expect(result.version).toBe('1.56.0');
        expect(result.error).toBeNull();
      });

      it('returns available for reviewdog with valid version', () => {
        mockExecFileSync.mockReturnValue('reviewdog version: 0.17.4');

        const result = checkDependency('reviewdog');

        expect(result.status).toBe('available');
        expect(result.name).toBe('reviewdog');
        expect(result.version).toBe('0.17.4');
        expect(result.error).toBeNull();
      });

      it('calls execFileSync with correct arguments for semgrep', () => {
        mockExecFileSync.mockReturnValue('semgrep 1.56.0');

        checkDependency('semgrep');

        expect(mockExecFileSync).toHaveBeenCalledWith('semgrep', ['--version'], {
          timeout: 5000,
          encoding: 'utf8',
        });
      });

      it('calls execFileSync with correct arguments for reviewdog', () => {
        mockExecFileSync.mockReturnValue('reviewdog version: 0.17.4');

        checkDependency('reviewdog');

        expect(mockExecFileSync).toHaveBeenCalledWith('reviewdog', ['--version'], {
          timeout: 5000,
          encoding: 'utf8',
        });
      });

      it('returns available when version exceeds minimum', () => {
        mockExecFileSync.mockReturnValue('semgrep 2.0.0');

        const result = checkDependency('semgrep');

        expect(result.status).toBe('available');
        expect(result.version).toBe('2.0.0');
      });

      it('returns available when version equals minimum', () => {
        mockExecFileSync.mockReturnValue('semgrep 1.0.0');

        const result = checkDependency('semgrep');

        expect(result.status).toBe('available');
        expect(result.version).toBe('1.0.0');
      });
    });

    describe('missing state', () => {
      it('returns missing when binary is not found (ENOENT)', () => {
        const error = new Error('spawn semgrep ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockExecFileSync.mockImplementation(() => {
          throw error;
        });

        const result = checkDependency('semgrep');

        expect(result.status).toBe('missing');
        expect(result.name).toBe('semgrep');
        expect(result.version).toBeNull();
        expect(result.error).toContain('not found');
      });

      it('returns missing when reviewdog binary is not found', () => {
        const error = new Error('spawn reviewdog ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        mockExecFileSync.mockImplementation(() => {
          throw error;
        });

        const result = checkDependency('reviewdog');

        expect(result.status).toBe('missing');
        expect(result.name).toBe('reviewdog');
        expect(result.version).toBeNull();
      });
    });

    describe('unhealthy state', () => {
      it('returns unhealthy when binary exists but version command fails', () => {
        const error = new Error('Command failed with exit code 1');
        mockExecFileSync.mockImplementation(() => {
          throw error;
        });

        const result = checkDependency('semgrep');

        expect(result.status).toBe('unhealthy');
        expect(result.name).toBe('semgrep');
        expect(result.version).toBeNull();
        expect(result.error).toBeDefined();
      });

      it('returns unhealthy when version command times out', () => {
        const error = new Error('ETIMEDOUT') as NodeJS.ErrnoException;
        error.code = 'ETIMEDOUT';
        mockExecFileSync.mockImplementation(() => {
          throw error;
        });

        const result = checkDependency('semgrep');

        expect(result.status).toBe('unhealthy');
        expect(result.error).toContain('timed out');
      });

      it('returns unhealthy when version output cannot be parsed', () => {
        mockExecFileSync.mockReturnValue('unexpected output format');

        const result = checkDependency('semgrep');

        expect(result.status).toBe('unhealthy');
        expect(result.version).toBeNull();
        expect(result.error).toContain('parse');
      });

      it('returns unhealthy when version output is empty', () => {
        mockExecFileSync.mockReturnValue('');

        const result = checkDependency('semgrep');

        expect(result.status).toBe('unhealthy');
        expect(result.version).toBeNull();
      });
    });

    describe('version-mismatch state', () => {
      it('returns version-mismatch when semgrep version is below minimum', () => {
        mockExecFileSync.mockReturnValue('semgrep 0.99.0');

        const result = checkDependency('semgrep');

        expect(result.status).toBe('version-mismatch');
        expect(result.name).toBe('semgrep');
        expect(result.version).toBe('0.99.0');
        expect(result.error).toContain('1.0.0');
      });

      it('returns version-mismatch when reviewdog version is below minimum', () => {
        mockExecFileSync.mockReturnValue('reviewdog version: 0.13.0');

        const result = checkDependency('reviewdog');

        expect(result.status).toBe('version-mismatch');
        expect(result.name).toBe('reviewdog');
        expect(result.version).toBe('0.13.0');
        expect(result.error).toContain('0.14.0');
      });
    });

    describe('unknown dependency', () => {
      it('throws error for unknown dependency name', () => {
        expect(() => checkDependency('unknown-tool')).toThrow();
      });
    });
  });

  describe('checkAllDependencies', () => {
    it('checks multiple dependencies and returns all results', () => {
      mockExecFileSync
        .mockReturnValueOnce('semgrep 1.56.0')
        .mockReturnValueOnce('reviewdog version: 0.17.4');

      const results = checkAllDependencies(['semgrep', 'reviewdog']);

      expect(results).toHaveLength(2);
      expect(results[0]?.name).toBe('semgrep');
      expect(results[0]?.status).toBe('available');
      expect(results[1]?.name).toBe('reviewdog');
      expect(results[1]?.status).toBe('available');
    });

    it('returns empty array for empty input', () => {
      const results = checkAllDependencies([]);

      expect(results).toEqual([]);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('handles mixed availability states', () => {
      mockExecFileSync.mockReturnValueOnce('semgrep 1.56.0');

      const missingError = new Error('ENOENT') as NodeJS.ErrnoException;
      missingError.code = 'ENOENT';
      mockExecFileSync.mockImplementationOnce(() => {
        throw missingError;
      });

      const results = checkAllDependencies(['semgrep', 'reviewdog']);

      expect(results).toHaveLength(2);
      expect(results[0]?.status).toBe('available');
      expect(results[1]?.status).toBe('missing');
    });

    it('continues checking remaining dependencies after one fails', () => {
      const missingError = new Error('ENOENT') as NodeJS.ErrnoException;
      missingError.code = 'ENOENT';
      mockExecFileSync.mockImplementationOnce(() => {
        throw missingError;
      });

      mockExecFileSync.mockReturnValueOnce('reviewdog version: 0.17.4');

      const results = checkAllDependencies(['semgrep', 'reviewdog']);

      expect(results).toHaveLength(2);
      expect(results[0]?.status).toBe('missing');
      expect(results[1]?.status).toBe('available');
    });
  });

  describe('DependencyCheckResult contract', () => {
    it('returns result matching DependencyCheckResult interface for available state', () => {
      mockExecFileSync.mockReturnValue('semgrep 1.56.0');

      const result: DependencyCheckResult = checkDependency('semgrep');

      // Verify all required fields exist
      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('error');

      // Verify types
      expect(typeof result.name).toBe('string');
      expect(['available', 'missing', 'unhealthy', 'version-mismatch']).toContain(result.status);
    });

    it('returns result matching DependencyCheckResult interface for missing state', () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFileSync.mockImplementation(() => {
        throw error;
      });

      const result: DependencyCheckResult = checkDependency('semgrep');

      expect(result).toHaveProperty('name');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('error');
    });
  });

  describe('getDependenciesForPasses', () => {
    it('returns empty array for empty passes', () => {
      const result = getDependenciesForPasses([]);
      expect(result).toEqual([]);
    });

    it('returns dependencies for semgrep agent', () => {
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: true, required: false },
      ];
      const result = getDependenciesForPasses(passes);
      expect(result).toContain('semgrep');
    });

    it('returns dependencies for reviewdog agent', () => {
      const passes = [
        { name: 'test', agents: ['reviewdog' as const], enabled: true, required: false },
      ];
      const result = getDependenciesForPasses(passes);
      expect(result).toContain('semgrep');
      expect(result).toContain('reviewdog');
    });

    it('returns empty array for AI agents with no external deps', () => {
      const passes = [
        { name: 'test', agents: ['opencode' as const], enabled: true, required: false },
      ];
      const result = getDependenciesForPasses(passes);
      expect(result).toEqual([]);
    });

    it('skips disabled passes', () => {
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: false, required: false },
      ];
      const result = getDependenciesForPasses(passes);
      expect(result).toEqual([]);
    });

    it('deduplicates dependencies across passes', () => {
      const passes = [
        { name: 'pass1', agents: ['semgrep' as const], enabled: true, required: false },
        { name: 'pass2', agents: ['reviewdog' as const], enabled: true, required: false },
      ];
      const result = getDependenciesForPasses(passes);
      // Both semgrep and reviewdog need semgrep, but it should only appear once
      const semgrepCount = result.filter((d) => d === 'semgrep').length;
      expect(semgrepCount).toBe(1);
    });

    it('handles mixed enabled and disabled passes', () => {
      const passes = [
        { name: 'enabled', agents: ['semgrep' as const], enabled: true, required: false },
        { name: 'disabled', agents: ['reviewdog' as const], enabled: false, required: false },
      ];
      const result = getDependenciesForPasses(passes);
      expect(result).toContain('semgrep');
      expect(result).not.toContain('reviewdog');
    });

    it('handles passes with multiple agents', () => {
      const passes = [
        {
          name: 'multi',
          agents: ['semgrep' as const, 'opencode' as const],
          enabled: true,
          required: false,
        },
      ];
      const result = getDependenciesForPasses(passes);
      expect(result).toContain('semgrep');
      // opencode has no deps, so result should only be semgrep
      expect(result).toHaveLength(1);
    });
  });

  describe('checkDependenciesForPasses', () => {
    it('returns summary with no blocking issues when all deps available', () => {
      mockExecFileSync.mockReturnValue('semgrep 1.56.0');
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: true, required: true },
      ];

      const summary = checkDependenciesForPasses(passes);

      expect(summary.hasBlockingIssues).toBe(false);
      expect(summary.missingRequired).toEqual([]);
      expect(summary.results).toHaveLength(1);
      expect(summary.results[0]?.status).toBe('available');
    });

    it('returns blocking issues when required pass has missing deps', () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFileSync.mockImplementation(() => {
        throw error;
      });
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: true, required: true },
      ];

      const summary = checkDependenciesForPasses(passes);

      expect(summary.hasBlockingIssues).toBe(true);
      expect(summary.missingRequired).toContain('semgrep');
    });

    it('returns no blocking issues when optional pass has missing deps', () => {
      const error = new Error('ENOENT') as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      mockExecFileSync.mockImplementation(() => {
        throw error;
      });
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: true, required: false },
      ];

      const summary = checkDependenciesForPasses(passes);

      expect(summary.hasBlockingIssues).toBe(false);
      expect(summary.missingOptional).toContain('semgrep');
      expect(summary.hasWarnings).toBe(true);
    });

    it('returns empty results for passes with no external deps', () => {
      const passes = [
        { name: 'test', agents: ['opencode' as const], enabled: true, required: true },
      ];

      const summary = checkDependenciesForPasses(passes);

      expect(summary.results).toHaveLength(0);
      expect(summary.hasBlockingIssues).toBe(false);
    });

    it('categorizes unhealthy deps correctly', () => {
      mockExecFileSync.mockReturnValue('unexpected output');
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: true, required: true },
      ];

      const summary = checkDependenciesForPasses(passes);

      expect(summary.unhealthy).toContain('semgrep');
      expect(summary.hasBlockingIssues).toBe(true); // unhealthy from required pass is blocking
    });

    it('categorizes version mismatches as warnings', () => {
      mockExecFileSync.mockReturnValue('semgrep 0.99.0');
      const passes = [
        { name: 'test', agents: ['semgrep' as const], enabled: true, required: false },
      ];

      const summary = checkDependenciesForPasses(passes);

      expect(summary.versionWarnings).toHaveLength(1);
      expect(summary.hasWarnings).toBe(true);
      expect(summary.hasBlockingIssues).toBe(false);
    });

    it('handles mixed required and optional passes', () => {
      mockExecFileSync.mockReturnValueOnce('semgrep 1.56.0').mockImplementationOnce(() => {
        const error = new Error('ENOENT') as NodeJS.ErrnoException;
        error.code = 'ENOENT';
        throw error;
      });
      const passes = [
        { name: 'required', agents: ['semgrep' as const], enabled: true, required: true },
        { name: 'optional', agents: ['reviewdog' as const], enabled: true, required: false },
      ];

      const summary = checkDependenciesForPasses(passes);

      // semgrep is available, reviewdog is missing but optional
      expect(summary.hasBlockingIssues).toBe(false);
      expect(summary.missingOptional).toContain('reviewdog');
      expect(summary.hasWarnings).toBe(true);
    });
  });
});
