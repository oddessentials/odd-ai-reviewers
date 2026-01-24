import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../config.js';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';

const mockChecksCreate = vi.fn();
const mockChecksUpdate = vi.fn();
const mockIssuesListComments = vi.fn();
const mockCreateReviewComment = vi.fn().mockResolvedValue({ data: { id: 1 } });

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    checks: {
      create: mockChecksCreate,
      update: mockChecksUpdate,
    },
    issues: {
      listComments: mockIssuesListComments,
      createComment: vi.fn().mockResolvedValue({ data: { id: 1 } }),
      updateComment: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    },
    pulls: {
      listReviewComments: vi.fn().mockResolvedValue({ data: [] }),
      createReviewComment: mockCreateReviewComment,
    },
  })),
}));

const { reportToGitHub } = await import('../report/github.js');
type GitHubContext = Parameters<typeof reportToGitHub>[1];

describe('GitHub line mapping', () => {
  const baseContext: GitHubContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
    headSha: 'abc123',
    token: 'test-token',
  };

  const baseConfig: Config = {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes: [{ name: 'static', agents: ['semgrep'], enabled: true, required: true }],
    limits: {
      max_files: 50,
      max_diff_lines: 2000,
      max_tokens_per_pr: 12000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
    },
    models: { default: 'gpt-4o-mini' },
    reporting: {
      github: {
        mode: 'comments_only',
        max_inline_comments: 20,
        summary: true,
      },
    },
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  const diffFiles: DiffFile[] = [
    {
      path: 'src/test.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch: [
        'diff --git a/src/test.ts b/src/test.ts',
        'index 1234567..89abcde 100644',
        '--- a/src/test.ts',
        '+++ b/src/test.ts',
        '@@ -1,3 +1,4 @@',
        '-const a = 1;',
        '+const a = 1;',
        '+const b = 2;',
        ' const c = 3;',
      ].join('\n'),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockChecksCreate.mockResolvedValue({ data: { id: 123 } });
    mockChecksUpdate.mockResolvedValue({ data: { id: 123 } });
    mockIssuesListComments.mockResolvedValue({ data: [] });
  });

  it('maps diff line numbers to file line numbers for inline comments', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 3,
        message: 'Mapped line test',
        sourceAgent: 'pr_agent',
      },
    ];

    await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(mockCreateReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({
        line: 2,
        path: 'src/test.ts',
      })
    );
  });
});
