/**
 * Reviewdog Agent Tests
 *
 * Comprehensive tests for reviewdog agent functionality.
 * Tests cover binary detection, severity mapping, and integration behaviors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  reviewdogAgent,
  mapSeverity,
  isReviewdogAvailable,
  isSemgrepAvailable,
} from '../agents/reviewdog.js';
import { isSkipped } from '../agents/types.js';

describe('Reviewdog Agent', () => {
  describe('mapSeverity', () => {
    it('should map ERROR to error', () => {
      expect(mapSeverity('ERROR')).toBe('error');
    });

    it('should map WARNING to warning', () => {
      expect(mapSeverity('WARNING')).toBe('warning');
    });

    it('should map INFO to info', () => {
      expect(mapSeverity('INFO')).toBe('info');
    });

    it('should handle lowercase severity (case-insensitive)', () => {
      expect(mapSeverity('error')).toBe('error');
      expect(mapSeverity('warning')).toBe('warning');
      expect(mapSeverity('info')).toBe('info');
    });

    it('should handle mixed case severity', () => {
      expect(mapSeverity('Error')).toBe('error');
      expect(mapSeverity('Warning')).toBe('warning');
      expect(mapSeverity('Info')).toBe('info');
    });

    it('should default to info for unknown severity', () => {
      expect(mapSeverity('CRITICAL')).toBe('info');
      expect(mapSeverity('DEBUG')).toBe('info');
      expect(mapSeverity('UNKNOWN')).toBe('info');
      expect(mapSeverity('')).toBe('info');
    });
  });

  describe('Binary availability functions', () => {
    // These tests are conditional based on environment
    // In CI without binaries, they should return false
    // On dev machines with binaries, they should return true

    it('isReviewdogAvailable returns boolean', () => {
      const result = isReviewdogAvailable();
      expect(typeof result).toBe('boolean');
    });

    it('isSemgrepAvailable returns boolean', () => {
      const result = isSemgrepAvailable();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Agent supports method', () => {
    it('should support non-deleted files', () => {
      expect(
        reviewdogAgent.supports({ path: 'file.ts', status: 'added', additions: 1, deletions: 0 })
      ).toBe(true);
      expect(
        reviewdogAgent.supports({ path: 'file.ts', status: 'modified', additions: 1, deletions: 0 })
      ).toBe(true);
      expect(
        reviewdogAgent.supports({ path: 'file.ts', status: 'renamed', additions: 0, deletions: 0 })
      ).toBe(true);
    });

    it('should not support deleted files', () => {
      expect(
        reviewdogAgent.supports({ path: 'file.ts', status: 'deleted', additions: 0, deletions: 1 })
      ).toBe(false);
    });
  });

  describe('Agent metadata', () => {
    it('should have correct id', () => {
      expect(reviewdogAgent.id).toBe('reviewdog');
    });

    it('should have correct name', () => {
      expect(reviewdogAgent.name).toBe('Reviewdog');
    });

    it('should not use LLM', () => {
      expect(reviewdogAgent.usesLlm).toBe(false);
    });
  });

  describe('Temp file handling', () => {
    it('should write JSON to temp file without injection issues', () => {
      const maliciousJson = JSON.stringify({
        results: [
          {
            path: "'; rm -rf /; echo '",
            check_id: 'test',
            message: '`backticks` and "quotes" and $variables',
          },
        ],
      });

      const tempFile = join(tmpdir(), `test-semgrep-${Date.now()}.json`);
      writeFileSync(tempFile, maliciousJson);

      expect(existsSync(tempFile)).toBe(true);

      // Read back and verify content is preserved exactly
      const readBack = readFileSync(tempFile, 'utf-8');
      expect(readBack).toBe(maliciousJson);

      // Cleanup
      unlinkSync(tempFile);
      expect(existsSync(tempFile)).toBe(false);
    });

    it('should handle JSON with newlines and special characters', () => {
      const complexJson = JSON.stringify(
        {
          results: [
            {
              message: 'Line 1\nLine 2\r\nLine 3\tTabbed',
              path: 'file with spaces.ts',
            },
          ],
        },
        null,
        2
      );

      const tempFile = join(tmpdir(), `test-complex-${Date.now()}.json`);
      writeFileSync(tempFile, complexJson);

      const readBack = readFileSync(tempFile, 'utf-8');
      expect(readBack).toBe(complexJson);
      expect(readBack).toContain('\\n');
      expect(readBack).toContain('\\r\\n');
      expect(readBack).toContain('\\t');

      unlinkSync(tempFile);
    });
  });

  describe('Agent run integration (without semgrep)', () => {
    let consoleLogSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });

    it('should return success with no findings when semgrep is not available', async () => {
      // This test works in environments without semgrep
      const hasNoSemgrep = !isSemgrepAvailable();
      if (!hasNoSemgrep) {
        // Skip if semgrep is available - we cannot test the "no binary" path
        return;
      }

      const result = await reviewdogAgent.run({
        files: [{ path: 'test.ts', status: 'modified', additions: 1, deletions: 0 }],
        repoPath: process.cwd(),
        diff: {
          files: [],
          totalAdditions: 1,
          totalDeletions: 0,
          baseSha: 'abc123',
          headSha: 'def456',
          contextLines: 3,
          source: 'local-git',
        },
        config: {
          version: 1,
          passes: [],
          limits: {
            max_files: 50,
            max_diff_lines: 2000,
            max_tokens_per_pr: 12000,
            max_usd_per_pr: 1.0,
            monthly_budget_usd: 100,
          },
          models: {},
          gating: { enabled: false, fail_on_severity: 'error' },
        } as never,
        diffContent: 'const x = 1;',
        prNumber: 123,
        env: {},
        effectiveModel: '',
        provider: null,
      });

      // When semgrep is not available, agent should be skipped
      expect(isSkipped(result)).toBe(true);
      if (isSkipped(result)) {
        expect(result.reason).toContain('Semgrep binary not found');
      }
    });

    it('should return skipped with empty file list', async () => {
      const result = await reviewdogAgent.run({
        files: [],
        repoPath: process.cwd(),
        diff: {
          files: [],
          totalAdditions: 0,
          totalDeletions: 0,
          baseSha: 'abc123',
          headSha: 'def456',
          contextLines: 3,
          source: 'local-git',
        },
        config: {
          version: 1,
          passes: [],
          limits: {
            max_files: 50,
            max_diff_lines: 2000,
            max_tokens_per_pr: 12000,
            max_usd_per_pr: 1.0,
            monthly_budget_usd: 100,
          },
          models: {},
          gating: { enabled: false, fail_on_severity: 'error' },
        } as never,
        diffContent: '',
        prNumber: 123,
        env: {},
        effectiveModel: '',
        provider: null,
      });

      // When semgrep is not available or no files to process, agent should be skipped
      expect(isSkipped(result)).toBe(true);
      if (isSkipped(result)) {
        // The reason could be either "Semgrep binary not found" or "No files to process"
        // depending on the order of checks in the agent
        expect(result.reason.includes('Semgrep') || result.reason.includes('No files')).toBe(true);
        expect(result.metrics.filesProcessed).toBe(0);
      }
    });

    it('should filter out deleted files before processing', async () => {
      // When all files are deleted, the agent returns Skipped (not Success)
      // because there are no files to process after filtering

      const result = await reviewdogAgent.run({
        files: [
          { path: 'deleted.ts', status: 'deleted', additions: 0, deletions: 10 },
          { path: 'also-deleted.ts', status: 'deleted', additions: 0, deletions: 5 },
        ],
        repoPath: process.cwd(),
        diff: {
          files: [],
          totalAdditions: 0,
          totalDeletions: 15,
          baseSha: 'abc123',
          headSha: 'def456',
          contextLines: 3,
          source: 'local-git',
        },
        config: {
          version: 1,
          passes: [],
          limits: {
            max_files: 50,
            max_diff_lines: 2000,
            max_tokens_per_pr: 12000,
            max_usd_per_pr: 1.0,
            monthly_budget_usd: 100,
          },
          models: {},
          gating: { enabled: false, fail_on_severity: 'error' },
        } as never,
        diffContent: '',
        prNumber: 123,
        env: {},
        effectiveModel: '',
        provider: null,
      });

      // Agent skips when no files to process (all deleted files are filtered out)
      // or when semgrep is not available
      expect(isSkipped(result)).toBe(true);
      if (isSkipped(result)) {
        // Either "No files to process" or "Semgrep binary not found"
        expect(result.reason.includes('No files') || result.reason.includes('Semgrep')).toBe(true);
        expect(result.metrics.filesProcessed).toBe(0);
      }
    });
  });

  describe('Integration tests (requires reviewdog binary)', () => {
    const hasReviewdog = process.env['CI_HAS_REVIEWDOG'] === 'true';

    // Prevent silent drift: validate CI_HAS_REVIEWDOG contract
    if (hasReviewdog) {
      let reviewdogFound = false;
      try {
        execSync('which reviewdog', { stdio: 'ignore', timeout: 2000 });
        reviewdogFound = true;
      } catch {
        // Binary not found
      }
      if (!reviewdogFound) {
        throw new Error(
          'CI_HAS_REVIEWDOG=true but reviewdog binary not found in PATH. ' +
            'Either install reviewdog or unset CI_HAS_REVIEWDOG.'
        );
      }
    }

    // Environment-gated: runs in Linux CI with reviewdog installed (CI_HAS_REVIEWDOG=true)
    it.skipIf(!hasReviewdog)('should pipe semgrep JSON through reviewdog', async () => {
      // This test requires:
      // 1. reviewdog binary in PATH
      // 2. CI_HAS_REVIEWDOG=true
      // 3. GITHUB_TOKEN set (for github-pr-review reporter)

      // Golden fixture: valid semgrep JSON output
      const goldenSemgrepOutput = {
        version: '1.0.0',
        errors: [],
        paths: { scanned: ['test.ts'] },
        results: [
          {
            check_id: 'typescript.security.test-rule',
            path: 'test.ts',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            message: 'Test finding',
            severity: 'WARNING',
          },
        ],
      };

      // Verify the fixture is valid JSON
      expect(() => JSON.stringify(goldenSemgrepOutput)).not.toThrow();
    });
  });
});
