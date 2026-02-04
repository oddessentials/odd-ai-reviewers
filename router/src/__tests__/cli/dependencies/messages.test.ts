/**
 * Unit tests for dependency error message formatting.
 * Tests formatMissingDependencyError, displayDependencyErrors functions.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import {
  formatMissingDependencyError,
  formatDependencyStatus,
  displayDependencyErrors,
} from '../../../cli/dependencies/messages.js';
import type {
  DependencyCheckResult,
  DependencyCheckSummary,
} from '../../../cli/dependencies/types.js';

// Mock platform detection
vi.mock('../../../cli/dependencies/platform.js', () => ({
  detectPlatform: vi.fn().mockReturnValue('darwin'),
}));

import { detectPlatform } from '../../../cli/dependencies/platform.js';

const mockDetectPlatform = vi.mocked(detectPlatform);

describe('message formatting', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDetectPlatform.mockReturnValue('darwin');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('formatMissingDependencyError', () => {
    it('includes dependency name in error message', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('semgrep');
    });

    it('includes platform-specific install instructions for macOS', () => {
      mockDetectPlatform.mockReturnValue('darwin');
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('brew install semgrep');
    });

    it('includes platform-specific install instructions for Windows', () => {
      mockDetectPlatform.mockReturnValue('win32');
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('pip install semgrep');
    });

    it('includes platform-specific install instructions for Linux', () => {
      mockDetectPlatform.mockReturnValue('linux');
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('pip install semgrep');
    });

    it('includes documentation URL', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('https://semgrep.dev/docs/getting-started/');
    });

    it('includes docs URL for reviewdog', () => {
      const result: DependencyCheckResult = {
        name: 'reviewdog',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('https://github.com/reviewdog/reviewdog');
    });

    it('includes "ai-review check" suggestion', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('ai-review check');
    });

    it('formats version-mismatch with required version info', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'version-mismatch',
        version: '0.99.0',
        error: 'requires 1.0.0',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('0.99.0');
      expect(message).toContain('1.0.0');
    });

    it('formats unhealthy status with troubleshooting guidance', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'unhealthy',
        version: null,
        error: 'command failed',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('semgrep');
      expect(message.toLowerCase()).toMatch(/unhealthy|fail|error|reinstall/);
    });
  });

  describe('formatDependencyStatus', () => {
    it('formats available status with checkmark and version', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'available',
        version: '1.56.0',
        error: null,
      };

      const formatted = formatDependencyStatus(result);

      expect(formatted).toContain('✓');
      expect(formatted.toLowerCase()).toContain('semgrep');
      expect(formatted).toContain('1.56.0');
    });

    it('formats missing status with X mark', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const formatted = formatDependencyStatus(result);

      expect(formatted).toContain('✗');
      expect(formatted.toLowerCase()).toContain('semgrep');
      expect(formatted).toContain('missing');
    });

    it('formats unhealthy status with warning indicator', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'unhealthy',
        version: null,
        error: 'command failed',
      };

      const formatted = formatDependencyStatus(result);

      expect(formatted.toLowerCase()).toContain('semgrep');
      expect(formatted.toLowerCase()).toContain('unhealthy');
    });

    it('formats version-mismatch with version info', () => {
      const result: DependencyCheckResult = {
        name: 'semgrep',
        status: 'version-mismatch',
        version: '0.99.0',
        error: 'requires 1.0.0',
      };

      const formatted = formatDependencyStatus(result);

      expect(formatted.toLowerCase()).toContain('semgrep');
      expect(formatted).toContain('0.99.0');
    });
  });

  describe('displayDependencyErrors', () => {
    it('writes to stderr when there are blocking issues', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [{ name: 'semgrep', status: 'missing', version: null, error: 'not found' }],
        missingRequired: ['semgrep'],
        missingOptional: [],
        unhealthy: [],
        versionWarnings: [],
        hasBlockingIssues: true,
        hasWarnings: false,
        runnablePasses: [],
        skippedPasses: [],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      expect(mockStderr.write).toHaveBeenCalled();
      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('semgrep');
    });

    it('does not write when no blocking issues', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [{ name: 'semgrep', status: 'available', version: '1.56.0', error: null }],
        missingRequired: [],
        missingOptional: [],
        unhealthy: [],
        versionWarnings: [],
        hasBlockingIssues: false,
        hasWarnings: false,
        runnablePasses: ['semgrep-pass'],
        skippedPasses: [],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      // Should not write error messages for available dependencies
      const errorCalls = mockStderr.write.mock.calls.filter((c) =>
        String(c[0]).toLowerCase().includes('error')
      );
      expect(errorCalls).toHaveLength(0);
    });

    it('consolidates multiple missing dependencies into single message', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [
          { name: 'semgrep', status: 'missing', version: null, error: 'not found' },
          { name: 'reviewdog', status: 'missing', version: null, error: 'not found' },
        ],
        missingRequired: ['semgrep', 'reviewdog'],
        missingOptional: [],
        unhealthy: [],
        versionWarnings: [],
        hasBlockingIssues: true,
        hasWarnings: false,
        runnablePasses: [],
        skippedPasses: [],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      expect(mockStderr.write).toHaveBeenCalled();
      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('semgrep');
      expect(output).toContain('reviewdog');
    });

    it('includes header indicating dependency check failed', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [{ name: 'semgrep', status: 'missing', version: null, error: 'not found' }],
        missingRequired: ['semgrep'],
        missingOptional: [],
        unhealthy: [],
        versionWarnings: [],
        hasBlockingIssues: true,
        hasWarnings: false,
        runnablePasses: [],
        skippedPasses: [],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output.toLowerCase()).toMatch(/dependency|missing|required/);
    });

    it('shows warnings for optional missing dependencies', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [
          { name: 'semgrep', status: 'available', version: '1.56.0', error: null },
          { name: 'reviewdog', status: 'missing', version: null, error: 'not found' },
        ],
        missingRequired: [],
        missingOptional: ['reviewdog'],
        unhealthy: [],
        versionWarnings: [],
        hasBlockingIssues: false,
        hasWarnings: true,
        runnablePasses: ['semgrep-pass'],
        skippedPasses: ['reviewdog-pass'],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('reviewdog');
    });

    it('shows unhealthy dependency warnings', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [{ name: 'semgrep', status: 'unhealthy', version: null, error: 'command failed' }],
        missingRequired: [],
        missingOptional: [],
        unhealthy: ['semgrep'],
        versionWarnings: [],
        hasBlockingIssues: false,
        hasWarnings: true,
        runnablePasses: [],
        skippedPasses: ['semgrep-pass'],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('semgrep');
    });

    it('shows version mismatch warnings', () => {
      const mockStderr = { write: vi.fn() };
      const summary: DependencyCheckSummary = {
        results: [
          {
            name: 'semgrep',
            status: 'version-mismatch',
            version: '0.99.0',
            error: 'requires 1.0.0',
          },
        ],
        missingRequired: [],
        missingOptional: [],
        unhealthy: [],
        versionWarnings: ['semgrep: 0.99.0 < 1.0.0'],
        hasBlockingIssues: false,
        hasWarnings: true,
        runnablePasses: ['semgrep-pass'],
        skippedPasses: [],
      };

      displayDependencyErrors(summary, mockStderr as unknown as NodeJS.WriteStream);

      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('semgrep');
      expect(output).toContain('0.99.0');
    });
  });

  describe('platform-aware formatting', () => {
    it('detects macOS and uses brew instructions', () => {
      mockDetectPlatform.mockReturnValue('darwin');
      const result: DependencyCheckResult = {
        name: 'reviewdog',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('brew install reviewdog/tap/reviewdog');
    });

    it('detects Windows and uses appropriate instructions', () => {
      mockDetectPlatform.mockReturnValue('win32');
      const result: DependencyCheckResult = {
        name: 'reviewdog',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('Download');
      expect(message).toContain('github.com/reviewdog/reviewdog/releases');
    });

    it('detects Linux and uses curl instructions', () => {
      mockDetectPlatform.mockReturnValue('linux');
      const result: DependencyCheckResult = {
        name: 'reviewdog',
        status: 'missing',
        version: null,
        error: 'not found',
      };

      const message = formatMissingDependencyError(result);

      expect(message).toContain('curl');
    });
  });

  describe('formatSkippedPassWarning', () => {
    // Need to import from messages.js
    let formatSkippedPassWarning: (
      passName: string,
      missingDep: string,
      reason: 'missing' | 'unhealthy'
    ) => string;

    beforeEach(async () => {
      const messages = await import('../../../cli/dependencies/messages.js');
      formatSkippedPassWarning = messages.formatSkippedPassWarning;
    });

    it('includes pass name in warning', () => {
      const warning = formatSkippedPassWarning('sast-pass', 'semgrep', 'missing');
      expect(warning).toContain('sast-pass');
    });

    it('includes missing dependency name', () => {
      const warning = formatSkippedPassWarning('sast-pass', 'semgrep', 'missing');
      expect(warning.toLowerCase()).toContain('semgrep');
    });

    it('indicates the pass was skipped', () => {
      const warning = formatSkippedPassWarning('sast-pass', 'semgrep', 'missing');
      expect(warning.toLowerCase()).toContain('skip');
    });

    it('explains dependency is missing', () => {
      const warning = formatSkippedPassWarning('sast-pass', 'semgrep', 'missing');
      expect(warning.toLowerCase()).toContain('missing');
    });

    it('explains dependency is unhealthy when applicable', () => {
      const warning = formatSkippedPassWarning('sast-pass', 'semgrep', 'unhealthy');
      expect(warning.toLowerCase()).toContain('unhealthy');
    });

    it('uses warning indicator symbol', () => {
      const warning = formatSkippedPassWarning('sast-pass', 'semgrep', 'missing');
      expect(warning).toContain('⚠');
    });
  });

  describe('displaySkippedPassWarnings', () => {
    let displaySkippedPassWarnings: (
      skippedPasses: { name: string; missingDep: string; reason: 'missing' | 'unhealthy' }[],
      stderr: NodeJS.WriteStream
    ) => void;

    beforeEach(async () => {
      const messages = await import('../../../cli/dependencies/messages.js');
      displaySkippedPassWarnings = messages.displaySkippedPassWarnings;
    });

    it('writes warnings for each skipped pass', () => {
      const mockStderr = { write: vi.fn() };
      const skippedPasses = [
        { name: 'sast-pass', missingDep: 'semgrep', reason: 'missing' as const },
        { name: 'lint-pass', missingDep: 'reviewdog', reason: 'missing' as const },
      ];

      displaySkippedPassWarnings(skippedPasses, mockStderr as unknown as NodeJS.WriteStream);

      expect(mockStderr.write).toHaveBeenCalled();
      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('sast-pass');
      expect(output).toContain('lint-pass');
    });

    it('does not write when no passes skipped', () => {
      const mockStderr = { write: vi.fn() };

      displaySkippedPassWarnings([], mockStderr as unknown as NodeJS.WriteStream);

      expect(mockStderr.write).not.toHaveBeenCalled();
    });

    it('includes header indicating passes were skipped', () => {
      const mockStderr = { write: vi.fn() };
      const skippedPasses = [
        { name: 'sast-pass', missingDep: 'semgrep', reason: 'missing' as const },
      ];

      displaySkippedPassWarnings(skippedPasses, mockStderr as unknown as NodeJS.WriteStream);

      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output.toLowerCase()).toMatch(/skip|pass/);
    });

    it('explains how to install missing dependencies', () => {
      const mockStderr = { write: vi.fn() };
      const skippedPasses = [
        { name: 'sast-pass', missingDep: 'semgrep', reason: 'missing' as const },
      ];

      displaySkippedPassWarnings(skippedPasses, mockStderr as unknown as NodeJS.WriteStream);

      const output = mockStderr.write.mock.calls.map((c) => c[0]).join('');
      expect(output).toContain('ai-review check');
    });
  });
});
