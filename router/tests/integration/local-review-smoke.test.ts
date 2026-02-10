/**
 * Local Review Integration Smoke Test (T114)
 *
 * End-to-end smoke test that verifies the local review command works
 * with a real git repository. Uses the actual project repository to
 * avoid Windows path normalization issues.
 *
 * @module tests/integration/local-review-smoke
 */

import { describe, it, expect, vi } from 'vitest';
import { runLocalReview, createDefaultDependencies } from '../../src/cli/commands/local-review.js';
import { fileURLToPath } from 'url';
import * as path from 'path';

// Calculate repo root from __dirname (same pattern as local-diff.test.ts)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');
const SLOW_TEST_TIMEOUT_MS = 15000;

describe('Local Review Integration Smoke Test', () => {
  describe('T114: End-to-end with real git repo', () => {
    // Mock environment with a fake API key for zero-config detection
    const mockEnv = {
      ...process.env,
      // Set a mock API key so zero-config can detect a provider
      // This won't be used since we're doing dry-run/cost-only modes
      OPENAI_API_KEY: 'sk-test-mock-key-for-testing-only',
    };

    it(
      'should run dry-run mode successfully on the real repo',
      async () => {
        const output: string[] = [];
        const deps = {
          ...createDefaultDependencies(),
          env: mockEnv,
          stdout: {
            write: (text: string) => output.push(text),
            isTTY: false,
          },
          stderr: {
            write: (text: string) => output.push(text),
          },
          exitHandler: vi.fn(),
        };

        const result = await runLocalReview(
          {
            path: REPO_ROOT,
            dryRun: true,
            noColor: true,
            // Use HEAD as base to get no diff (clean comparison)
            base: 'HEAD',
          },
          deps
        );

        expect(result.exitCode).toBe(0);
        expect(result.findingsCount).toBe(0);

        // Verify dry-run output contains expected sections
        const outputText = output.join('');
        expect(outputText).toContain('DRY RUN');
        expect(outputText).toContain('Git Context');
      },
      SLOW_TEST_TIMEOUT_MS
    );

    it(
      'should show no changes when comparing HEAD to HEAD',
      async () => {
        const output: string[] = [];
        const deps = {
          ...createDefaultDependencies(),
          env: mockEnv,
          stdout: {
            write: (text: string) => output.push(text),
            isTTY: false,
          },
          stderr: {
            write: (text: string) => output.push(text),
          },
          exitHandler: vi.fn(),
        };

        const result = await runLocalReview(
          {
            path: REPO_ROOT,
            noColor: true,
            base: 'HEAD',
            // Use dry-run to just show what would be reviewed
            dryRun: true,
          },
          deps
        );

        // Should succeed - dry-run shows files without running agents
        expect(result.exitCode).toBe(0);
      },
      SLOW_TEST_TIMEOUT_MS
    );

    it(
      'should support cost-only mode',
      async () => {
        const output: string[] = [];
        const deps = {
          ...createDefaultDependencies(),
          env: mockEnv,
          stdout: {
            write: (text: string) => output.push(text),
            isTTY: false,
          },
          stderr: {
            write: (text: string) => output.push(text),
          },
          exitHandler: vi.fn(),
        };

        const result = await runLocalReview(
          {
            path: REPO_ROOT,
            costOnly: true,
            noColor: true,
            // Diff a small range to have something to estimate
            base: 'HEAD~1',
          },
          deps
        );

        expect(result.exitCode).toBe(0);

        const outputText = output.join('');
        expect(outputText).toContain('COST ESTIMATE');
        expect(outputText).toContain('Estimated cost');
      },
      SLOW_TEST_TIMEOUT_MS
    );

    it(
      'should validate mutually exclusive options',
      async () => {
        const output: string[] = [];
        const deps = {
          ...createDefaultDependencies(),
          env: mockEnv,
          stdout: {
            write: (text: string) => output.push(text),
            isTTY: false,
          },
          stderr: {
            write: (text: string) => output.push(text),
          },
          exitHandler: vi.fn(),
        };

        // quiet and verbose are mutually exclusive
        const result = await runLocalReview(
          {
            path: REPO_ROOT,
            quiet: true,
            verbose: true,
            noColor: true,
          },
          deps
        );

        expect(result.exitCode).toBe(2); // Invalid args
        expect(output.join('')).toContain('Cannot use --quiet and --verbose together');
      },
      SLOW_TEST_TIMEOUT_MS
    );

    it(
      'should work with existing config even without API credentials in dry-run',
      async () => {
        // When a repo has .ai-review.yml, dry-run doesn't need credentials
        // (credentials are only checked during actual agent execution)
        const output: string[] = [];
        const deps = {
          ...createDefaultDependencies(),
          // Empty env - no API keys
          env: {},
          stdout: {
            write: (text: string) => output.push(text),
            isTTY: false,
          },
          stderr: {
            write: (text: string) => output.push(text),
          },
          exitHandler: vi.fn(),
        };

        const result = await runLocalReview(
          {
            path: REPO_ROOT,
            dryRun: true,
            noColor: true,
          },
          deps
        );

        // Dry-run succeeds even without credentials when config file exists
        // (credentials are only validated during actual agent execution)
        expect(result.exitCode).toBe(0);
        expect(output.join('')).toContain('DRY RUN');
      },
      SLOW_TEST_TIMEOUT_MS
    );

    it(
      'should fail gracefully when path is not a git repo',
      async () => {
        const output: string[] = [];
        const deps = {
          ...createDefaultDependencies(),
          env: mockEnv,
          stdout: {
            write: (text: string) => output.push(text),
            isTTY: false,
          },
          stderr: {
            write: (text: string) => output.push(text),
          },
          exitHandler: vi.fn(),
        };

        // Use a path that definitely isn't a git repo (system temp)
        // Note: We pass a simple relative path that won't contain backslashes
        const result = await runLocalReview(
          {
            path: '/nonexistent/path/that/does/not/exist',
            noColor: true,
          },
          deps
        );

        // Should fail because path doesn't exist
        expect(result.exitCode).toBe(2);
        expect(result.error).toBeDefined();
      },
      SLOW_TEST_TIMEOUT_MS
    );

    it('should validate output format options', async () => {
      const output: string[] = [];
      const deps = {
        ...createDefaultDependencies(),
        env: mockEnv,
        stdout: {
          write: (text: string) => output.push(text),
          isTTY: false,
        },
        stderr: {
          write: (text: string) => output.push(text),
        },
        exitHandler: vi.fn(),
      };

      // Invalid format
      const result = await runLocalReview(
        {
          path: REPO_ROOT,
          format: 'invalid-format' as 'json', // Type assertion to bypass TS
          noColor: true,
        },
        deps
      );

      expect(result.exitCode).toBe(2); // Invalid args
      expect(output.join('')).toContain('Invalid output format');
    });
  });
});
