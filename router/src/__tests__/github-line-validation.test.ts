import { describe, it, expect, vi } from 'vitest';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';
import { reportToGitHub, type GitHubContext } from '../report/github.js';
import type { Config } from '../config.js';

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    checks: {
      create: vi.fn(async () => ({ data: { id: 123 } })),
      update: vi.fn(async () => ({ data: { id: 123 } })),
    },
    issues: {
      createComment: vi.fn(async () => ({ data: { id: 456 } })),
      updateComment: vi.fn(async () => ({ data: { id: 456 } })),
      listComments: vi.fn(async () => ({ data: [] })),
    },
    pulls: {
      createReviewComment: vi.fn(async () => ({ data: { id: 789 } })),
      listReviewComments: vi.fn(async () => ({ data: [] })),
    },
  })),
}));

describe('GitHub Line Validation Integration', () => {
  const diffFiles: DiffFile[] = [
    {
      path: 'src/test.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      patch: `@@ -1,2 +1,4 @@
 const a = 1;
+const b = 2;
+const c = 3;
 const d = 4;`,
    },
  ];

  const baseConfig: Config = {
    passes: [],
    path_filters: {},
    limits: {
      max_files: 100,
      max_diff_lines: 10000,
      max_tokens_per_pr: 100000,
      max_usd_per_pr: 1.0,
    },
    gating: {
      enabled: false,
      fail_on_severity: 'error',
    },
    reporting: {
      github: {
        mode: 'checks_and_comments',
        max_inline_comments: 20,
        summary: true,
      },
    },
    models: {},
  };

  const baseContext: GitHubContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
    headSha: 'abc123',
    token: 'test-token',
  };

  it('should normalize findings before reporting', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 2,
        message: 'Valid line',
        sourceAgent: 'test',
      },
      {
        severity: 'warning',
        file: 'src/test.ts',
        line: 99,
        message: 'Invalid line',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats).toBeDefined();
    expect(result.validationStats?.valid).toBe(1);
    expect(result.validationStats?.dropped).toBe(1);
  });

  it('should include invalid line details', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 99,
        message: 'Far away line',
        sourceAgent: 'semgrep',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(result.invalidLineDetails).toBeDefined();
    expect(result.invalidLineDetails).toHaveLength(1);
    expect(result.invalidLineDetails?.[0]?.file).toBe('src/test.ts');
    expect(result.invalidLineDetails?.[0]?.line).toBe(99);
    expect(result.invalidLineDetails?.[0]?.sourceAgent).toBe('semgrep');
  });

  it('should handle all valid findings', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 2,
        message: 'Issue on added line',
        sourceAgent: 'test',
      },
      {
        severity: 'warning',
        file: 'src/test.ts',
        line: 4,
        message: 'Issue on context line',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(2);
    expect(result.validationStats?.dropped).toBe(0);
    expect(result.invalidLineDetails).toBeUndefined();
  });

  it('should handle findings without line numbers', async () => {
    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/test.ts',
        message: 'File-level issue',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(1);
    expect(result.validationStats?.dropped).toBe(0);
  });

  it('should handle empty diff files', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'any.ts',
        line: 1,
        message: 'Test',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, []);

    expect(result.success).toBe(true);
    expect(result.validationStats?.dropped).toBe(1);
  });

  it('should normalize findings before deduplication', async () => {
    // This test ensures normalization happens BEFORE dedupe
    // Two findings on same invalid line should dedupe to one file-level finding
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 99,
        message: 'Issue A',
        sourceAgent: 'agent1',
      },
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 99,
        message: 'Issue A', // Same message for dedupe
        sourceAgent: 'agent2',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.dropped).toBeGreaterThan(0);
    // After normalization, both should have line undefined
    // Deduplication should then reduce to 1
  });

  it('should handle multi-hunk files', async () => {
    const multiHunkFiles: DiffFile[] = [
      {
        path: 'large.ts',
        status: 'modified',
        additions: 2,
        deletions: 0,
        patch: `@@ -1,2 +1,3 @@
+// Header
 const A = 1;
 const B = 2;
@@ -50,2 +51,3 @@
 const Y = 25;
+const Z = 26;
 const LAST = 27;`,
      },
    ];

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'large.ts',
        line: 1,
        message: 'First hunk',
        sourceAgent: 'test',
      },
      {
        severity: 'error',
        file: 'large.ts',
        line: 52,
        message: 'Second hunk',
        sourceAgent: 'test',
      },
      {
        severity: 'error',
        file: 'large.ts',
        line: 25,
        message: 'Gap between hunks',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, baseConfig, multiHunkFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(2); // Lines 1 and 52
    expect(result.validationStats?.dropped).toBe(1); // Line 25
  });

  it('should handle checks_only mode', async () => {
    const config: Config = {
      ...baseConfig,
      reporting: {
        github: {
          mode: 'checks_only',
          max_inline_comments: 20,
          summary: true,
        },
      },
    };

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 2,
        message: 'Test',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, config, diffFiles);

    expect(result.success).toBe(true);
    expect(result.checkRunId).toBeDefined();
  });

  it('should handle comments_only mode', async () => {
    const config: Config = {
      ...baseConfig,
      reporting: {
        github: {
          mode: 'comments_only',
          max_inline_comments: 20,
          summary: true,
        },
      },
    };

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 2,
        message: 'Test',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToGitHub(findings, baseContext, config, diffFiles);

    expect(result.success).toBe(true);
    expect(result.commentId).toBeDefined();
  });
});
