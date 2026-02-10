/**
 * Local Review CLI Integration Tests
 *
 * End-to-end tests for the local review CLI command.
 * Tests both `local` and `local-review` entrypoints.
 *
 * @module tests/integration/local-review-cli
 */

import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
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

function supportsNodeSpawn(): boolean {
  const result = spawnSync(process.execPath, ['-e', 'process.exit(0)'], {
    stdio: 'pipe',
  });
  if (result.error) return false;
  return result.status === 0;
}

const cliIt = supportsNodeSpawn() ? it : it.skip;

async function runCli(args: string[], cwd?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    // Determine router directory - tests run from router/ so use process.cwd()
    // The dist/main.js is relative to the router directory
    const routerDir = process.cwd().endsWith('router')
      ? process.cwd()
      : join(process.cwd(), 'router');

    // Use compiled dist/main.js instead of tsx for TypeScript
    const child = spawn('node', [join(routerDir, 'dist/main.js'), ...args], {
      cwd: cwd ?? routerDir,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;
    const finish = (result: CliResult, timeoutId: NodeJS.Timeout): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeoutId);
      resolve(result);
    };

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      finish(
        {
          exitCode: code ?? 0,
          stdout,
          stderr,
        },
        timeoutId
      );
    });

    child.on('error', (error) => {
      finish(
        {
          exitCode: -1,
          stdout,
          stderr: `${stderr}\n${error.message}`.trim(),
        },
        timeoutId
      );
    });

    // Timeout after 30 seconds
    const timeoutId = setTimeout(() => {
      child.kill();
      finish(
        {
          exitCode: -1,
          stdout,
          stderr: stderr + '\n[Test timeout]',
        },
        timeoutId
      );
    }, 30000);
  });
}

const CLI_TEST_TIMEOUT_MS = 15000;

// =============================================================================
// Tests: User Story 1 - CLI Command Discoverability
// =============================================================================

describe('User Story 1: CLI Command Discoverability', () => {
  describe('T012: local-review --help matches local --help', () => {
    cliIt(
      'should show identical help output for both commands',
      async () => {
        const localHelp = await runCli(['local', '--help']);
        const localReviewHelp = await runCli(['local-review', '--help']);

        expect(localHelp.exitCode).toBe(0);
        expect(localReviewHelp.exitCode).toBe(0);
        // Help output should be identical (both refer to same command)
        expect(localHelp.stdout).toBe(localReviewHelp.stdout);
      },
      CLI_TEST_TIMEOUT_MS
    );
  });

  describe('T014: local-review appears in main help', () => {
    cliIt(
      'should include local-review alias in main program help',
      async () => {
        const mainHelp = await runCli(['--help']);

        expect(mainHelp.exitCode).toBe(0);
        // The alias should appear in help (Commander shows it as local|local-review)
        expect(mainHelp.stdout).toMatch(/local-review/i);
      },
      CLI_TEST_TIMEOUT_MS
    );
  });
});

// =============================================================================
// Tests: Phase 9 Integration - Success Paths
// =============================================================================

describe('Integration Test Matrix: Success Paths', () => {
  // Tests use --dry-run to validate CLI execution without actual review operations

  describe('T055-T058: Basic command execution', () => {
    cliIt(
      'ai-review local . executes with exit code 0',
      async () => {
        const result = await runCli(['local', '.', '--dry-run']);

        // Exit code 0 indicates successful dry-run execution
        expect(result.exitCode).toBe(0);
        // Dry-run should produce output indicating what would happen
        expect(result.stdout + result.stderr).toMatch(/dry.?run|would|skip/i);
      },
      CLI_TEST_TIMEOUT_MS
    );

    cliIt(
      'ai-review local-review . executes with exit code 0',
      async () => {
        const result = await runCli(['local-review', '.', '--dry-run']);

        // Exit code 0 indicates successful dry-run execution
        expect(result.exitCode).toBe(0);
        // Dry-run should produce output indicating what would happen
        expect(result.stdout + result.stderr).toMatch(/dry.?run|would|skip/i);
      },
      CLI_TEST_TIMEOUT_MS
    );
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
      expectedError: /multiple.*operator/i,
    },
    {
      range: 'main..feature..extra',
      description: 'multiple operators in named refs',
      expectedError: /multiple.*operator/i,
    },
    {
      range: '..',
      description: 'empty refs with two-dot',
      expectedError: /requires.*at least one reference/i,
    },
    {
      range: '...',
      description: 'empty refs with three-dot',
      expectedError: /requires.*at least one reference/i,
    },
    {
      range: ' .. ',
      description: 'whitespace-only refs',
      expectedError: /requires.*at least one reference/i,
    },
  ];

  for (const { range, description, expectedError } of malformedRanges) {
    cliIt(
      `rejects "${range}" (${description}) with exit code 2`,
      async () => {
        const result = await runCli(['local', '--range', range, '.']);

        expect(result.exitCode).toBe(2); // ExitCode.INVALID_ARGS
        expect(result.stderr).toMatch(expectedError);
      },
      CLI_TEST_TIMEOUT_MS
    );
  }
});
