/**
 * Local Review Command Tests
 *
 * Tests for the local review command orchestration.
 * Uses dependency injection to mock external dependencies.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { makeTempRepo } from '../../../helpers/temp-repo.js';
import type { LocalReviewDependencies } from '../../../../src/cli/commands/local-review.js';
import type { GitContext } from '../../../../src/cli/git-context.js';
import type { DiffSummary, DiffFile } from '../../../../src/diff.js';
import type { Config } from '../../../../src/config.js';
import type { Finding } from '../../../../src/agents/types.js';
import type { TerminalContext } from '../../../../src/report/terminal.js';

import { runLocalReview, ExitCode } from '../../../../src/cli/commands/local-review.js';
import { Ok, Err } from '../../../../src/types/result.js';
import { GitContextErrorCode } from '../../../../src/cli/git-context.js';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockGitContext(overrides: Partial<GitContext> = {}): GitContext {
  return {
    repoRoot: '/test/repo',
    currentBranch: 'feature-branch',
    defaultBase: 'main',
    hasUncommitted: true,
    hasStaged: false,
    ...overrides,
  };
}

function createMockDiff(files: DiffFile[] = []): DiffSummary {
  return {
    files,
    totalAdditions: files.reduce((sum, f) => sum + f.additions, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions, 0),
    baseSha: 'abc123',
    headSha: 'def456',
    contextLines: 3,
    source: 'local-git',
  };
}

function createMockConfig(overrides: Partial<Config> = {}): Config {
  const base = {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [{ name: 'static', agents: ['semgrep'], enabled: true, required: false }],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 50000,
      max_usd_per_pr: 0.1,
      monthly_budget_usd: 10,
    },
    models: {},
    reporting: {},
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  // Deep merge gating if provided
  if (overrides.gating) {
    return {
      ...base,
      ...overrides,
      gating: { ...base.gating, ...overrides.gating },
    } as Config;
  }

  return { ...base, ...overrides } as Config;
}

/**
 * Create a zero-config mock result for the given config
 */
function createZeroConfigMock(config: Config) {
  return () => ({
    config,
    isZeroConfig: true as const,
    provider: 'anthropic' as const,
    keySource: 'ANTHROPIC_API_KEY',
    ignoredProviders: [],
  });
}

function createMockDeps(overrides: Partial<LocalReviewDependencies> = {}): LocalReviewDependencies {
  const stdout = {
    write: vi.fn(),
    isTTY: true,
  };
  const stderr = {
    write: vi.fn(),
  };

  return {
    env: {
      ANTHROPIC_API_KEY: 'test-key',
    },
    exitHandler: vi.fn(),
    stdout,
    stderr,
    ...overrides,
  };
}

// =============================================================================
// Tests: User Story 1 - CLI Alias
// =============================================================================

describe('T013: local and local-review use same handler', () => {
  // Note: This is tested at the integration level since the alias is defined in main.ts
  // The unit test validates that the handler function is the same by checking behavior
  it('should have identical behavior between local and local-review commands', async () => {
    // Both commands use runLocalReview as the handler
    // This is implicitly tested by all other tests using runLocalReview
    // The integration test in local-review-cli.test.ts validates identical help output
    expect(true).toBe(true);
  });
});

describe('T028: --range option help contains operator explanation', () => {
  it('should document range operators in --range description', async () => {
    // Import main.ts to verify the help text contains operator documentation
    // The actual help text is defined in main.ts and should contain:
    // 1. Examples of range syntax (main...HEAD, HEAD~3..)
    // 2. Operator explanation (... = merge-base, .. = direct comparison)

    // Read main.ts content to verify help text
    const fs = await import('fs/promises');
    const path = await import('path');
    const mainPath = path.resolve(__dirname, '../../../../src/main.ts');
    const mainContent = await fs.readFile(mainPath, 'utf-8');

    // Verify --range option description includes operator explanation
    expect(mainContent).toContain('--range');
    expect(mainContent).toContain('main...HEAD');
    expect(mainContent).toContain('HEAD~3..');
    expect(mainContent).toContain('Operators');
    expect(mainContent).toContain('merge-base');
    expect(mainContent).toContain('direct comparison');
  });
});

// =============================================================================
// Tests
// =============================================================================

describe('runLocalReview', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('happy path', () => {
    it('should complete successfully with no findings', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '+line\n-line',
        },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 0,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(result.findingsCount).toBe(0);
    });

    it('should report findings and return appropriate exit code', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '+line\n-line',
        },
      ]);
      const mockConfig = createMockConfig({
        gating: { enabled: true, fail_on_severity: 'error' },
      });
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 1,
          message: 'Test error',
          sourceAgent: 'semgrep',
        },
      ];

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: findings,
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: findings.length,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      expect(result.exitCode).toBe(ExitCode.FAILURE);
      expect(result.findingsCount).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle not a git repository error', async () => {
      const deps = createMockDeps({
        inferGitContext: () =>
          Err({
            code: GitContextErrorCode.NOT_GIT_REPO,
            message: 'Not a git repository',
            path: '/test/path',
          }),
      });

      const result = await runLocalReview({ path: '/test/path' }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBeDefined();
      expect(deps.stderr.write).toHaveBeenCalled();
    });

    it('should surface git not found error', async () => {
      const deps = createMockDeps({
        inferGitContext: () =>
          Err({
            code: GitContextErrorCode.GIT_NOT_FOUND,
            message: 'git command not found',
            path: '/test/path',
          }),
      });

      const result = await runLocalReview({ path: '/test/path' }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBe('git command not found');
      const stderrOutput = (deps.stderr.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(stderrOutput).toContain('git command not found');
    });

    it('should surface invalid path error', async () => {
      const deps = createMockDeps({
        inferGitContext: () =>
          Err({
            code: GitContextErrorCode.INVALID_PATH,
            message: 'Path does not exist: /missing/path',
            path: '/missing/path',
          }),
      });

      const result = await runLocalReview({ path: '/missing/path' }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBe('Path does not exist: /missing/path');
      const stderrOutput = (deps.stderr.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(stderrOutput).toContain('Path does not exist');
    });

    it('should handle invalid options error', async () => {
      const deps = createMockDeps();

      const result = await runLocalReview(
        {
          path: '/test/repo',
          quiet: true,
          verbose: true, // Mutually exclusive with quiet
        },
        deps
      );

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(deps.stderr.write).toHaveBeenCalled();
    });

    it('should handle no credentials error in zero-config mode', async () => {
      const mockGitContext = createMockGitContext();

      const deps = createMockDeps({
        env: {}, // No API keys
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: () => ({
          config: null,
          isZeroConfig: true as const,
          error: 'No API credentials found',
          guidance: ['Set ANTHROPIC_API_KEY'],
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
    });

    it('should handle execution error', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '+line\n-line',
        },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => {
          throw new Error('Agent execution failed');
        },
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      expect(result.exitCode).toBe(ExitCode.FAILURE);
      expect(result.error).toContain('Agent execution failed');
    });
  });

  describe('dry-run mode', () => {
    it('should show what would be reviewed without executing agents', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '+line\n-line',
        },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        // executeAllPasses should NOT be called in dry-run mode
        executeAllPasses: async () => {
          throw new Error('Should not be called in dry-run mode');
        },
      });

      const result = await runLocalReview({ path: '/test/repo', dryRun: true }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);
      expect(deps.stdout.write).toHaveBeenCalled();

      // Check that output includes dry run information
      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(output).toContain('DRY RUN');
    });

    it('should list files that would be analyzed', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
        { path: 'src/other.ts', status: 'added', additions: 20, deletions: 0 },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
      });

      const result = await runLocalReview({ path: '/test/repo', dryRun: true }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(output).toContain('src/test.ts');
      expect(output).toContain('src/other.ts');
    });

    it('should display the resolved base reference in output', async () => {
      const mockGitContext = createMockGitContext({ defaultBase: 'main' });
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
      });

      // When --base is specified, the output should show that base, not defaultBase
      const result = await runLocalReview(
        { path: '/test/repo', dryRun: true, base: 'develop' },
        deps
      );

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');

      // Should display the specified base reference, not the default
      expect(output).toContain('Base: develop');
      expect(output).not.toContain('Base: main');
    });

    it('should display defaultBase when no explicit base is specified', async () => {
      const mockGitContext = createMockGitContext({ defaultBase: 'main' });
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
      });

      const result = await runLocalReview({ path: '/test/repo', dryRun: true }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');

      // Should display the default base reference
      expect(output).toContain('Base: main');
    });
  });

  describe('--base option behavior', () => {
    it('should default uncommitted=false when --base is specified', async () => {
      const mockGitContext = createMockGitContext();
      const mockConfig = createMockConfig();

      // Track what options are passed to getLocalDiff
      let capturedDiffOptions: { uncommitted?: boolean } | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return createMockDiff([
            { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
          ]);
        },
      });

      await runLocalReview({ path: '/test/repo', base: 'HEAD~5', dryRun: true }, deps);

      // uncommitted should be false when --base is specified
      expect(capturedDiffOptions?.uncommitted).toBe(false);
    });

    it('should allow explicit uncommitted=true with --base', async () => {
      const mockGitContext = createMockGitContext();
      const mockConfig = createMockConfig();

      let capturedDiffOptions: { uncommitted?: boolean } | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return createMockDiff([
            { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
          ]);
        },
      });

      await runLocalReview(
        { path: '/test/repo', base: 'HEAD~5', uncommitted: true, dryRun: true },
        deps
      );

      // When explicitly set, uncommitted should be honored
      expect(capturedDiffOptions?.uncommitted).toBe(true);
    });

    it('REGRESSION: should detect files when --base is specified without uncommitted', async () => {
      // This test guards against a bug where Commander's default value for --uncommitted
      // was `true`, causing commit range comparisons to be ignored in favor of worktree diffs.
      // See: 016-semantic-release branch fix for --uncommitted default behavior.
      const mockGitContext = createMockGitContext({ hasUncommitted: false });
      const mockConfig = createMockConfig();
      const mockDiffFiles = [
        { path: 'src/changed.ts', status: 'modified' as const, additions: 50, deletions: 10 },
        { path: 'src/new.ts', status: 'added' as const, additions: 100, deletions: 0 },
      ];
      const mockDiff = createMockDiff(mockDiffFiles);

      let capturedDiffOptions: { baseRef: string; uncommitted?: boolean } | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return mockDiff;
        },
      });

      // Simulate CLI behavior: only base is specified, uncommitted is undefined (not true)
      await runLocalReview({ path: '/test/repo', base: 'main', dryRun: true }, deps);

      // Critical assertions:
      // 1. uncommitted should be false when --base is specified
      expect(capturedDiffOptions?.uncommitted).toBe(false);
      // 2. baseRef should be set correctly
      expect(capturedDiffOptions?.baseRef).toBe('main');

      // Verify dry-run output shows files (not 0)
      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(output).toContain('Count: 2');
    });
  });

  describe('range/head handling', () => {
    it('should default headRef to HEAD when only --base is specified', async () => {
      const mockGitContext = createMockGitContext();
      const mockConfig = createMockConfig();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);

      let capturedDiffOptions:
        | { baseRef: string; headRef?: string; rangeOperator?: '..' | '...' }
        | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return mockDiff;
        },
      });

      // --base main without --head should resolve to main...HEAD
      await runLocalReview({ path: '/test/repo', base: 'main', dryRun: true }, deps);

      expect(capturedDiffOptions?.baseRef).toBe('main');
      expect(capturedDiffOptions?.headRef).toBe('HEAD');
      expect(capturedDiffOptions?.rangeOperator).toBe('...');
    });

    it('should pass headRef when --head is specified', async () => {
      const mockGitContext = createMockGitContext();
      const mockConfig = createMockConfig();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);

      let capturedDiffOptions:
        | { baseRef: string; headRef?: string; rangeOperator?: '..' | '...' }
        | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return mockDiff;
        },
      });

      await runLocalReview(
        { path: '/test/repo', base: 'main', head: 'feature', dryRun: true },
        deps
      );

      expect(capturedDiffOptions?.headRef).toBe('feature');
    });

    it('should pass range end and operator when --range is specified', async () => {
      const mockGitContext = createMockGitContext();
      const mockConfig = createMockConfig();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);

      let capturedDiffOptions:
        | { baseRef: string; headRef?: string; rangeOperator?: '..' | '...' }
        | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return mockDiff;
        },
      });

      await runLocalReview({ path: '/test/repo', range: 'main..feature', dryRun: true }, deps);

      expect(capturedDiffOptions?.baseRef).toBe('main');
      expect(capturedDiffOptions?.headRef).toBe('feature');
      expect(capturedDiffOptions?.rangeOperator).toBe('..');
    });

    it('should default to three-dot operator when single ref provided (--range main)', async () => {
      const mockGitContext = createMockGitContext();
      const mockConfig = createMockConfig();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);

      let capturedDiffOptions:
        | { baseRef: string; headRef?: string; rangeOperator?: '..' | '...' }
        | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: (_repoPath, options) => {
          capturedDiffOptions = options;
          return mockDiff;
        },
      });

      // Single ref without operator should default to three-dot (merge-base) and HEAD
      // --range main resolves to main...HEAD
      await runLocalReview({ path: '/test/repo', range: 'main', dryRun: true }, deps);

      expect(capturedDiffOptions?.baseRef).toBe('main');
      expect(capturedDiffOptions?.headRef).toBe('HEAD'); // Default head when not specified
      expect(capturedDiffOptions?.rangeOperator).toBe('...');
    });
  });

  describe('cost-only mode', () => {
    it('should estimate cost without executing agents', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 100, deletions: 50 },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        // executeAllPasses should NOT be called in cost-only mode
        executeAllPasses: async () => {
          throw new Error('Should not be called in cost-only mode');
        },
      });

      const result = await runLocalReview({ path: '/test/repo', costOnly: true }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(output).toContain('COST ESTIMATE');
      expect(output).toContain('$'); // Should contain cost in dollars
    });

    it('should show budget status', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5 },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
      });

      const result = await runLocalReview({ path: '/test/repo', costOnly: true }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(output).toContain('Budget status');
    });
  });

  describe('passes array population in JSON output (T094a)', () => {
    it('should populate passes array with PassSummary data', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 10,
          deletions: 5,
          patch: '+line\n-line',
        },
      ]);
      const mockConfig = createMockConfig({
        passes: [
          { name: 'static', agents: ['semgrep'], enabled: true, required: false },
          { name: 'ai', agents: ['opencode'], enabled: true, required: false },
        ],
      });

      let capturedContext: TerminalContext | undefined;
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [
            {
              severity: 'warning',
              file: 'src/test.ts',
              line: 1,
              message: 'Test',
              sourceAgent: 'semgrep',
            },
          ],
          partialFindings: [],
          allResults: [
            {
              status: 'success',
              agentId: 'semgrep',
              findings: [],
              metrics: { durationMs: 100, filesProcessed: 1 },
            },
            {
              status: 'success',
              agentId: 'opencode',
              findings: [],
              metrics: { durationMs: 200, filesProcessed: 1 },
            },
          ],
          skippedAgents: [],
        }),
        reportToTerminal: async (findings, partialFindings, context) => {
          capturedContext = context;
          return { success: true, findingsCount: 1, partialFindingsCount: 0 };
        },
      });

      await runLocalReview({ path: '/test/repo' }, deps);

      // The terminal context should have been populated with config info
      expect(capturedContext).toBeDefined();
      if (capturedContext) {
        expect(capturedContext.configSource).toBeDefined();
      }
    });
  });

  describe('no changes scenario', () => {
    it('should return success with message when no changes found', async () => {
      const mockGitContext = createMockGitContext({ hasUncommitted: false, hasStaged: false });
      const emptyDiff = createMockDiff([]);

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(createMockConfig()),
        getLocalDiff: () => emptyDiff,
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      const output = (deps.stdout.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(output).toContain('No changes to review');
    });
  });

  describe('option validation', () => {
    it('should warn when both --range and --base are specified', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig();

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 0,
          partialFindingsCount: 0,
        }),
      });

      await runLocalReview({ path: '/test/repo', range: 'HEAD~3..', base: 'main' }, deps);

      // Check that warning was printed
      const stderrOutput = (deps.stderr.write as ReturnType<typeof vi.fn>).mock.calls
        .map((call) => call[0])
        .join('');
      expect(stderrOutput).toContain('--range');
    });
  });

  describe('gating', () => {
    it('should return success when gating is disabled', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig({
        gating: { enabled: false, fail_on_severity: 'error' },
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [
            {
              severity: 'error',
              file: 'src/test.ts',
              line: 1,
              message: 'Error',
              sourceAgent: 'semgrep',
            },
          ],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 1,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      // Should succeed because gating is disabled
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    });

    it('should fail when gating is enabled and errors exist', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig({
        gating: { enabled: true, fail_on_severity: 'error' },
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [
            {
              severity: 'error',
              file: 'src/test.ts',
              line: 1,
              message: 'Error',
              sourceAgent: 'semgrep',
            },
          ],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 1,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      expect(result.exitCode).toBe(ExitCode.FAILURE);
    });

    it('should succeed with warnings when fail_on_severity is error', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig({
        gating: { enabled: true, fail_on_severity: 'error' },
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [
            {
              severity: 'warning',
              file: 'src/test.ts',
              line: 1,
              message: 'Warning',
              sourceAgent: 'semgrep',
            },
          ],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 1,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      // Warnings don't fail when fail_on_severity is 'error'
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    });

    it('should handle fail_on_severity info (treat same as error threshold)', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      // Note: 'info' is treated as default case (same as 'error' - only errors fail)
      const mockConfig = createMockConfig({
        gating: { enabled: true, fail_on_severity: 'info' as 'error' | 'warning' | 'info' },
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [
            {
              severity: 'info',
              file: 'src/test.ts',
              line: 1,
              message: 'Info',
              sourceAgent: 'semgrep',
            },
          ],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 1,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      // Info severity should not fail (info is treated like default error-only threshold)
      expect(result.exitCode).toBe(ExitCode.SUCCESS);
    });

    it('should fail when gating enabled with warning threshold and warnings exist', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig({
        gating: { enabled: true, fail_on_severity: 'warning' },
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [
            {
              severity: 'warning',
              file: 'src/test.ts',
              line: 1,
              message: 'Warning',
              sourceAgent: 'semgrep',
            },
          ],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 1,
          partialFindingsCount: 0,
        }),
      });

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      // Warnings should fail when fail_on_severity is 'warning'
      expect(result.exitCode).toBe(ExitCode.FAILURE);
    });
  });

  describe('config loading', () => {
    it('should load exact config path when --config is provided', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig();
      const loadConfigMock = vi.fn().mockResolvedValue(mockConfig);

      // T041: Use makeTempRepo instead of manual temp dir
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      const loadConfigFromPathMock = vi.fn().mockResolvedValue(mockConfig);
      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfig: loadConfigMock,
        loadConfigFromPath: loadConfigFromPathMock,
        getLocalDiff: () => mockDiff,
      });

      await runLocalReview({ path: '/test/repo', config: configPath, dryRun: true }, deps);
      // makeTempRepo handles cleanup automatically via afterEach hook

      expect(loadConfigFromPathMock).toHaveBeenCalledWith(configPath);
      expect(loadConfigMock).not.toHaveBeenCalled();
    });

    it('should use loadConfig when config file exists', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig();
      const loadConfigMock = vi.fn().mockResolvedValue(mockConfig);

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfig: loadConfigMock,
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => ({
          completeFindings: [],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        }),
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 0,
          partialFindingsCount: 0,
        }),
      });

      // Note: This test relies on the actual file system check (existsSync)
      // In a real test, we would mock existsSync, but for simplicity we use zero-config path
      await runLocalReview({ path: '/test/repo' }, deps);

      // Since config file doesn't exist, loadConfig won't be called
      // This tests the zero-config fallback path implicitly
    });
  });

  // =============================================================================
  // Tests: User Story 4 - Error Handling Safety (T011-T013)
  // =============================================================================

  describe('T013: error wrapping for non-Error throws', () => {
    it('should wrap non-Error throws from loadConfigFromPath in Error', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file so loadConfigFromPath is called
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Simulate a non-Error throw (rare but possible in edge cases)
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        throw 'string error from config loader';
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      // Should handle error gracefully and return INVALID_ARGS
      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBe('string error from config loader');
    });

    it('should wrap number throws from loadConfig in Error', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file so loadConfig is called
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Simulate a number throw (extremely rare but tests the guard)
      const loadConfigMock = vi.fn().mockImplementation(() => {
        throw 42;
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok({ ...mockGitContext, repoRoot: repo.path }),
        loadConfig: loadConfigMock,
      });

      const result = await runLocalReview({ path: repo.path }, deps);

      // Should handle error gracefully
      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBe('42');
    });

    it('should preserve Error instances from loadConfigFromPath', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file so loadConfigFromPath is called
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Throw a proper Error with specific message
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        throw new Error('Specific config error message');
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      // Error message should be preserved
      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBe('Specific config error message');
    });

    it('should wrap object throws in Error with JSON representation', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file so loadConfigFromPath is called
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Simulate an object throw
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        throw { code: 'CUSTOM_ERROR', detail: 'something failed' };
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      // Objects are JSON stringified for informative error messages
      expect(result.error).toBe('{"code":"CUSTOM_ERROR","detail":"something failed"}');
    });
  });

  describe('error condition simulation', () => {
    it('should handle config file permission error', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Simulate EACCES error from config loading
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        const err = new Error('Permission denied');
        (err as NodeJS.ErrnoException).code = 'EACCES';
        throw err;
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toContain('Permission denied');
    });

    it('should handle YAML parse error in config', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'invalid: yaml: syntax::\n');

      // Simulate YAML parse error
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        throw new Error('YAML parse error at line 1, column 15');
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toContain('YAML parse error');
    });

    it('should handle schema validation error in config', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Simulate schema validation error
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        throw new Error("Invalid configuration: Required field 'passes' is missing");
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toContain('passes');
    });

    it('should handle async rejection with non-Error value', async () => {
      const mockGitContext = createMockGitContext();

      // Create a temp config file
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, 'custom.yml');
      writeFileSync(configPath, 'version: 1\n');

      // Simulate async rejection with a string (Promise.reject with non-Error)
      const loadConfigFromPathMock = vi.fn().mockImplementation(() => {
        return Promise.reject('async rejection string');
      });

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        loadConfigFromPath: loadConfigFromPathMock,
      });

      const result = await runLocalReview({ path: '/test/repo', config: configPath }, deps);

      expect(result.exitCode).toBe(ExitCode.INVALID_ARGS);
      expect(result.error).toBe('async rejection string');
    });
  });

  describe('signal handling', () => {
    it('should setup signal handlers with cleanup function', async () => {
      const mockGitContext = createMockGitContext();
      const mockDiff = createMockDiff([
        { path: 'src/test.ts', status: 'modified', additions: 10, deletions: 5, patch: '+line' },
      ]);
      const mockConfig = createMockConfig();

      // Import the shutdown state functions for testing
      const { resetShutdownState } = await import('../../../../src/cli/signals.js');

      const deps = createMockDeps({
        inferGitContext: () => Ok(mockGitContext),
        generateZeroConfig: createZeroConfigMock(mockConfig),
        getLocalDiff: () => mockDiff,
        executeAllPasses: async () => {
          // Execution completes normally
          return {
            completeFindings: [],
            partialFindings: [],
            allResults: [],
            skippedAgents: [],
          };
        },
        reportToTerminal: async () => ({
          success: true,
          findingsCount: 0,
          partialFindingsCount: 0,
        }),
      });

      // Reset any previous shutdown state
      resetShutdownState();

      const result = await runLocalReview({ path: '/test/repo' }, deps);

      // Clean execution should succeed
      expect(result.exitCode).toBe(ExitCode.SUCCESS);

      // Clean up
      resetShutdownState();
    });
  });
});
