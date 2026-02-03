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
vi.mock('../report/github.js', () => ({ startCheckRun: vi.fn() }));
vi.mock('../phases/index.js', () => ({
  runPreflightChecks: vi.fn(),
  executeAllPasses: vi.fn(),
  processFindings: vi.fn(),
  dispatchReport: vi.fn(),
  checkGating: vi.fn(),
}));
vi.mock('../trust.js', () => ({ checkTrust: vi.fn(), buildADOPRContext: vi.fn() }));

const { runReview } = await import('../main.js');
const { loadConfig } = await import('../config.js');
const { loadReviewIgnore, shouldIgnoreFile } = await import('../reviewignore.js');
const { getDiff, filterFiles, buildCombinedDiff, resolveReviewRefs, getGitHubCheckHeadSha } =
  await import('../diff.js');
const { checkBudget, estimateTokens } = await import('../budget.js');
const { runPreflightChecks, executeAllPasses, processFindings, dispatchReport, checkGating } =
  await import('../phases/index.js');
const { checkTrust, buildADOPRContext } = await import('../trust.js');

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
  vi.mocked(dispatchReport).mockResolvedValue();
  vi.mocked(checkGating).mockReturnValue();
  vi.mocked(buildADOPRContext).mockReturnValue(null);
  vi.mocked(checkTrust).mockReturnValue({ trusted: true });
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
});
