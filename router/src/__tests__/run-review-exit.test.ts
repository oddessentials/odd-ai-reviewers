import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigSchema } from '../config/schemas.js';
import { createValidatedConfigHelpers } from '../types/branded.js';
import type { DiffFile, DiffSummary, ResolvedReviewRefs } from '../diff.js';

vi.mock('../config.js', () => ({ loadConfig: vi.fn() }));
vi.mock('../reviewignore.js', () => ({ loadReviewIgnore: vi.fn(), shouldIgnoreFile: vi.fn() }));
vi.mock('../diff.js', () => ({
  getDiff: vi.fn(),
  filterFiles: vi.fn(),
  buildCombinedDiff: vi.fn(),
  resolveReviewRefs: vi.fn(),
  getGitHubCheckHeadSha: vi.fn(),
}));
vi.mock('../budget.js', () => ({ checkBudget: vi.fn(), estimateTokens: vi.fn() }));
vi.mock('../report/github.js', () => ({
  startCheckRun: vi.fn(),
  completeCheckRun: vi.fn(),
}));
vi.mock('../phases/index.js', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    runPreflightChecks: vi.fn(),
    executeAllPasses: vi.fn(),
    processFindings: vi.fn(),
    dispatchReport: vi.fn(),
    checkGating: vi.fn(),
  };
});
vi.mock('../trust.js', () => ({ checkTrust: vi.fn(), buildADOPRContext: vi.fn() }));
vi.mock('../cli/signals.js', () => ({ setupSignalHandlers: vi.fn() }));

const { runReview } = await import('../main.js');
const { loadConfig } = await import('../config.js');
const { loadReviewIgnore, shouldIgnoreFile } = await import('../reviewignore.js');
const { getDiff, filterFiles, buildCombinedDiff, resolveReviewRefs, getGitHubCheckHeadSha } =
  await import('../diff.js');
const { checkBudget, estimateTokens } = await import('../budget.js');
const { runPreflightChecks, executeAllPasses, processFindings, dispatchReport, checkGating } =
  await import('../phases/index.js');
const { startCheckRun, completeCheckRun } = await import('../report/github.js');
const { checkTrust, buildADOPRContext } = await import('../trust.js');
const { setupSignalHandlers } = await import('../cli/signals.js');

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
    deduplicated: [],
    sorted: [],
    partialSorted: [],
    summary: '',
  });
  vi.mocked(dispatchReport).mockResolvedValue(undefined);
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

    expect(exitHandler).toHaveBeenCalledWith(1);
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

    expect(exitHandler).toHaveBeenCalledWith(1);
    expect(startCheckRun).toHaveBeenCalled();
    expect(completeCheckRun).toHaveBeenCalledWith(
      expect.objectContaining({ checkRunId: 123 }),
      expect.objectContaining({
        conclusion: 'failure',
        title: 'AI Review failed',
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
