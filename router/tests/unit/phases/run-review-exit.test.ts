import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigSchema } from '../../../src/config/schemas.js';
import { createValidatedConfigHelpers } from '../../../src/types/branded.js';
import type { DiffFile, DiffSummary, ResolvedReviewRefs } from '../../../src/diff.js';
import { FatalExecutionError } from '../../../src/phases/execute.js';
import { ConfigError, ConfigErrorCode } from '../../../src/types/errors.js';

vi.mock('../../../src/config.js', () => ({ loadConfig: vi.fn() }));
vi.mock('../../../src/reviewignore.js', () => ({
  loadReviewIgnore: vi.fn(),
  shouldIgnoreFile: vi.fn(),
}));
vi.mock('../../../src/diff.js', () => ({
  getDiff: vi.fn(),
  filterFiles: vi.fn(),
  buildCombinedDiff: vi.fn(),
  resolveReviewRefs: vi.fn(),
  getGitHubCheckHeadSha: vi.fn(),
}));
vi.mock('../../../src/budget.js', () => ({ checkBudget: vi.fn(), estimateTokens: vi.fn() }));
vi.mock('../../../src/report/github.js', () => ({
  startCheckRun: vi.fn(),
  completeCheckRun: vi.fn(),
}));
vi.mock('../../../src/phases/index.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    runPreflightChecks: vi.fn(),
    executeAllPasses: vi.fn(),
    processFindings: vi.fn(),
    dispatchReport: vi.fn(),
    getPostNormalizationFindings: vi.fn(),
    checkGating: vi.fn(),
  };
});
vi.mock('../../../src/trust.js', () => ({ checkTrust: vi.fn(), buildADOPRContext: vi.fn() }));
vi.mock('../../../src/cli/signals.js', () => ({ setupSignalHandlers: vi.fn() }));

const { runReview } = await import('../../../src/main.js');
const { loadConfig } = await import('../../../src/config.js');
const { loadReviewIgnore, shouldIgnoreFile } = await import('../../../src/reviewignore.js');
const { getDiff, filterFiles, buildCombinedDiff, resolveReviewRefs, getGitHubCheckHeadSha } =
  await import('../../../src/diff.js');
const { checkBudget, estimateTokens } = await import('../../../src/budget.js');
const {
  runPreflightChecks,
  executeAllPasses,
  processFindings,
  dispatchReport,
  getPostNormalizationFindings,
  checkGating,
} = await import('../../../src/phases/index.js');
const { startCheckRun, completeCheckRun } = await import('../../../src/report/github.js');
const { checkTrust, buildADOPRContext } = await import('../../../src/trust.js');
const { setupSignalHandlers } = await import('../../../src/cli/signals.js');

const validatedConfigHelpers = createValidatedConfigHelpers(ConfigSchema);
const baseConfig = validatedConfigHelpers.brand(
  ConfigSchema.parse({
    passes: [{ name: 'default', agents: ['semgrep'] }],
  })
);

const diffFiles: DiffFile[] = [
  {
    path: 'src/app.ts',
    status: 'modified',
    additions: 1,
    deletions: 0,
  },
];

const diffSummary: DiffSummary = {
  files: diffFiles,
  totalAdditions: 1,
  totalDeletions: 0,
  baseSha: 'base',
  headSha: 'head',
  contextLines: 3,
  source: 'local-git',
};

const reviewRefs: ResolvedReviewRefs = {
  baseSha: 'base',
  headSha: 'head',
  inputHeadSha: 'head',
  headSource: 'input',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadConfig).mockResolvedValue(baseConfig);
  vi.mocked(loadReviewIgnore).mockResolvedValue({ patterns: [], found: false });
  vi.mocked(shouldIgnoreFile).mockReturnValue(false);
  vi.mocked(resolveReviewRefs).mockReturnValue(reviewRefs);
  vi.mocked(getGitHubCheckHeadSha).mockReturnValue('head');
  vi.mocked(getDiff).mockReturnValue(diffSummary);
  vi.mocked(filterFiles).mockReturnValue(diffFiles);
  vi.mocked(buildCombinedDiff).mockReturnValue('diff');
  vi.mocked(estimateTokens).mockReturnValue(10);
  vi.mocked(checkBudget).mockReturnValue({ allowed: true });
  vi.mocked(runPreflightChecks).mockReturnValue({ valid: true, errors: [], warnings: [] });
  vi.mocked(executeAllPasses).mockResolvedValue({
    completeFindings: [],
    partialFindings: [],
    allResults: [],
    skippedAgents: [],
  });
  vi.mocked(processFindings).mockReturnValue({
    complete: [],
    partial: [],
    filtered: [],
    sorted: [],
    partialSorted: [],
    summary: '',
  });
  vi.mocked(dispatchReport).mockResolvedValue(undefined);
  vi.mocked(getPostNormalizationFindings).mockReturnValue([]);
  vi.mocked(checkGating).mockReturnValue();
  vi.mocked(buildADOPRContext).mockReturnValue(null);
  vi.mocked(checkTrust).mockReturnValue({ trusted: true });
  vi.mocked(startCheckRun).mockResolvedValue(123);
});

describe('runReview exit behavior', () => {
  it('exits successfully after completing a review', async () => {
    const exitHandler = vi.fn();

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: true,
      },
      {
        env: { GITHUB_ACTIONS: 'true' },
        exitHandler,
      }
    );

    expect(loadConfig).toHaveBeenCalledWith('.', { ignoreSuppressions: true });
    expect(exitHandler).toHaveBeenCalledWith(0);
  });

  it('exits successfully when trust checks skip the review', async () => {
    const exitHandler = vi.fn();
    vi.mocked(checkTrust).mockReturnValue({ trusted: false, reason: 'Skipping draft PR' });

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: true,
      },
      {
        env: { GITHUB_ACTIONS: 'true' },
        exitHandler,
      }
    );

    expect(exitHandler).toHaveBeenCalledWith(0);
    expect(getDiff).not.toHaveBeenCalled();
  });

  it('completes the check run when preflight fails', async () => {
    const exitHandler = vi.fn();
    vi.mocked(runPreflightChecks).mockReturnValue({
      valid: false,
      errors: ['Missing API key'],
      warnings: [],
    });

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: false,
      },
      {
        env: { GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 'token' },
        exitHandler,
      }
    );

    expect(exitHandler).toHaveBeenCalledWith(2); // config_error — preflight failure
    expect(startCheckRun).toHaveBeenCalled();
    expect(completeCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ checkRunId: 123 }),
      expect.objectContaining({
        conclusion: 'failure',
        title: 'AI Review preflight failed',
      })
    );
  });

  it('completes the check run when execution fails', async () => {
    const exitHandler = vi.fn();
    vi.mocked(executeAllPasses).mockRejectedValue(new Error('Boom'));

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: false,
      },
      {
        env: { GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 'token' },
        exitHandler,
      }
    );

    expect(exitHandler).toHaveBeenCalledWith(2); // config_error — fatal crash with no findings
    expect(startCheckRun).toHaveBeenCalled();
    expect(completeCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ checkRunId: 123 }),
      expect.objectContaining({
        conclusion: 'failure',
        title: 'AI Review failed',
      })
    );
  });

  it('treats fatal partial results with zero findings as incomplete', async () => {
    const exitHandler = vi.fn();
    vi.mocked(executeAllPasses).mockRejectedValue(
      new FatalExecutionError('AGENT_CRASH', 'Required agent crashed', {
        partialResults: {
          completeFindings: [],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        },
      })
    );

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: false,
      },
      {
        env: { GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 'token' },
        exitHandler,
      }
    );

    expect(exitHandler).toHaveBeenCalledWith(3);
    expect(processFindings).toHaveBeenCalledWith(
      [],
      [],
      [],
      [],
      diffFiles,
      undefined,
      expect.objectContaining(baseConfig),
      'ci'
    );
    expect(dispatchReport).toHaveBeenCalledWith(
      'github',
      [],
      [],
      expect.any(Object),
      diffFiles,
      expect.any(Object),
      123,
      expect.objectContaining({
        checkRunId: 123,
        runStatus: 'incomplete',
      })
    );
  });

  it('handles ConfigError from incomplete-run processing as config_error', async () => {
    const exitHandler = vi.fn();
    vi.mocked(executeAllPasses).mockRejectedValue(
      new FatalExecutionError('AGENT_CRASH', 'Required agent crashed', {
        partialResults: {
          completeFindings: [],
          partialFindings: [],
          allResults: [],
          skippedAgents: [],
        },
      })
    );
    vi.mocked(processFindings).mockImplementation(() => {
      throw new ConfigError(
        'Suppression rule matched too many findings',
        ConfigErrorCode.INVALID_VALUE,
        { field: 'suppressions.rules' }
      );
    });

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: false,
      },
      {
        env: { GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 'token' },
        exitHandler,
      }
    );

    expect(exitHandler).toHaveBeenCalledWith(2);
    expect(dispatchReport).not.toHaveBeenCalled();
    expect(completeCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ checkRunId: 123 }),
      expect.objectContaining({
        conclusion: 'failure',
        title: 'AI Review config error',
      })
    );
  });

  it('skips check runs on ADO platform', async () => {
    const exitHandler = vi.fn();
    vi.mocked(buildADOPRContext).mockReturnValue({
      number: 42,
      headRepo: 'https://dev.azure.com/org/project/_git/repo',
      baseRepo: 'https://dev.azure.com/org/project/_git/repo',
      author: 'dev',
      isFork: false,
      isDraft: false,
    });

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 42,
        dryRun: true,
      },
      {
        env: { TF_BUILD: 'True' },
        exitHandler,
      }
    );

    expect(startCheckRun).not.toHaveBeenCalled();
    expect(completeCheckRun).not.toHaveBeenCalled();
    expect(exitHandler).toHaveBeenCalledWith(0);
  });

  it('registers signal handler with cleanup on GitHub', async () => {
    const originalExit = process.exit;
    process.exit = vi.fn() as never;

    try {
      await runReview(
        {
          repo: '.',
          base: 'base',
          head: 'head',
          pr: 123,
          owner: 'odd',
          repoName: 'ai-review',
          dryRun: false,
        },
        {
          env: { GITHUB_ACTIONS: 'true', GITHUB_TOKEN: 'token' },
        }
      );

      expect(setupSignalHandlers).toHaveBeenCalledWith(
        expect.objectContaining({
          cleanup: expect.any(Function),
          showPartialResultsMessage: false,
        })
      );

      // Extract and invoke the cleanup callback
      const calls = vi.mocked(setupSignalHandlers).mock.calls;
      const call = calls[0]?.[0] as { cleanup: () => Promise<void> } | undefined;
      expect(call).toBeDefined();
      await call?.cleanup();

      expect(completeCheckRun).toHaveBeenCalledWith(
        expect.objectContaining({ checkRunId: 123 }),
        expect.objectContaining({
          conclusion: 'neutral',
          title: 'AI Review interrupted',
        })
      );
    } finally {
      process.exit = originalExit;
    }
  });

  it('does not register signal handlers when exitHandler is provided', async () => {
    const exitHandler = vi.fn();

    await runReview(
      {
        repo: '.',
        base: 'base',
        head: 'head',
        pr: 123,
        owner: 'odd',
        repoName: 'ai-review',
        dryRun: true,
      },
      {
        env: { GITHUB_ACTIONS: 'true' },
        exitHandler,
      }
    );

    expect(setupSignalHandlers).not.toHaveBeenCalled();
  });
});
