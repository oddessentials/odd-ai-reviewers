/**
 * Local Review CLI Integration Tests
 *
 * End-to-end tests for the local review CLI command.
 * Tests both `local` and `local-review` entrypoints.
 *
 * @module tests/integration/local-review-cli
 */

import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Run CLI command and capture output
 */
interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn('node', ['--import', 'tsx', 'src/main.ts', ...args], {
      cwd: cwd ?? join(process.cwd(), 'router'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 0,
        stdout,
        stderr,
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      resolve({
        exitCode: -1,
        stdout,
        stderr: stderr + '\n[Test timeout]',
      });
    }, 30000);
  });
}

// =============================================================================
// Tests: User Story 1 - CLI Command Discoverability
// =============================================================================

describe('User Story 1: CLI Command Discoverability', () => {
  describe('T012: local-review --help matches local --help', () => {
    it('should show identical help output for both commands', async () => {
      const localHelp = await runCli(['local', '--help']);
      const localReviewHelp = await runCli(['local-review', '--help']);

      expect(localHelp.exitCode).toBe(0);
      expect(localReviewHelp.exitCode).toBe(0);
      // Help output should be identical (both refer to same command)
      expect(localHelp.stdout).toBe(localReviewHelp.stdout);
    });
  });

  describe('T014: local-review appears in main help', () => {
    it('should include local-review alias in main program help', async () => {
      const mainHelp = await runCli(['--help']);

      expect(mainHelp.exitCode).toBe(0);
      // The alias should appear in help (Commander shows it as local|local-review)
      expect(mainHelp.stdout).toMatch(/local-review/i);
    });
  });
});

// =============================================================================
// Tests: Phase 9 Integration - Success Paths
// =============================================================================

describe('Integration Test Matrix: Success Paths', () => {
  // These tests require a valid git repo context - skipped in basic integration
  // Full integration tests with repo setup are in separate file

  describe('T055-T058: Basic command execution', () => {
    it.skip('ai-review local . executes with exit code 0', async () => {
      // Requires valid git repo with changes
    });

    it.skip('ai-review local-review . executes with exit code 0', async () => {
      // Requires valid git repo with changes
    });
  });
});

// =============================================================================
// Tests: Malformed Ranges
// =============================================================================

describe('Integration Test Matrix: Malformed Ranges (T059)', () => {
  const malformedRanges = [
    {
      range: 'a..b..c',
      description: 'multiple two-dot operators',
      expectedError: /MULTIPLE_OPERATORS|multiple.*operator/i,
    },
    {
      range: 'main..feature..extra',
      description: 'multiple operators in named refs',
      expectedError: /MULTIPLE_OPERATORS|multiple.*operator/i,
    },
    {
      range: '..',
      description: 'empty refs with two-dot',
      expectedError: /MISSING_REFS|EMPTY.*REF|empty|missing/i,
    },
    {
      range: '...',
      description: 'empty refs with three-dot',
      expectedError: /MISSING_REFS|EMPTY.*REF|empty|missing/i,
    },
    {
      range: ' .. ',
      description: 'whitespace-only refs',
      expectedError: /EMPTY.*REF|empty|missing/i,
    },
  ];

  for (const { range, description, expectedError } of malformedRanges) {
    it(`rejects "${range}" (${description}) with exit code 2`, async () => {
      const result = await runCli(['local', '--range', range, '.']);

      expect(result.exitCode).toBe(2); // ExitCode.INVALID_ARGS
      expect(result.stderr).toMatch(expectedError);
    });
  }
});
