/**
 * Reporter Line Validation Tests
 *
 * These tests verify that GitHub and ADO reporters correctly validate
 * line numbers against the diff before posting inline comments.
 * This prevents comments from appearing on wrong lines or failing silently.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Config } from '../config.js';
import type { Finding } from '../agents/index.js';
import type { DiffFile } from '../diff.js';

// Create mock functions for GitHub
const mockChecksCreate = vi.fn();
const mockChecksUpdate = vi.fn();
const mockIssuesListComments = vi.fn();
const mockIssuesCreateComment = vi.fn();
const mockPullsListReviewComments = vi.fn();
const mockPullsCreateReviewComment = vi.fn();

// Mock Octokit
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn(() => ({
    checks: {
      create: mockChecksCreate,
      update: mockChecksUpdate,
    },
    issues: {
      listComments: mockIssuesListComments,
      createComment: mockIssuesCreateComment,
      updateComment: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    },
    pulls: {
      listReviewComments: mockPullsListReviewComments,
      createReviewComment: mockPullsCreateReviewComment,
    },
  })),
}));

// Dynamic import after mock is set up
const { reportToGitHub } = await import('../report/github.js');
const { reportToADO } = await import('../report/ado.js');
type GitHubContext = Parameters<typeof reportToGitHub>[1];
type ADOContext = Parameters<typeof reportToADO>[1];

describe('GitHub Reporter Line Validation', () => {
  const diffFiles: DiffFile[] = [
    {
      path: 'src/utils.ts',
      status: 'modified',
      additions: 3,
      deletions: 1,
      patch: `@@ -10,4 +10,6 @@ function helper() {
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 return a;
 }`,
    },
    {
      path: 'src/new-file.ts',
      status: 'added',
      additions: 5,
      deletions: 0,
      patch: `@@ -0,0 +1,5 @@
+export function newFunc() {
+  const x = 1;
+  const y = 2;
+  return x + y;
+}`,
    },
  ];

  const baseContext: GitHubContext = {
    owner: 'test-owner',
    repo: 'test-repo',
    prNumber: 123,
    headSha: 'abc123',
    token: 'test-token',
    diffFiles,
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
        mode: 'checks_and_comments',
        max_inline_comments: 20,
        summary: true,
      },
    },
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockChecksCreate.mockResolvedValue({ data: { id: 12345 } });
    mockChecksUpdate.mockResolvedValue({ data: { id: 12345 } });
    mockIssuesListComments.mockResolvedValue({ data: [] });
    mockIssuesCreateComment.mockResolvedValue({ data: { id: 1 } });
    mockPullsListReviewComments.mockResolvedValue({ data: [] });
    mockPullsCreateReviewComment.mockResolvedValue({ data: { id: 1 } });
  });

  describe('Valid line numbers', () => {
    it('should post comment on valid added line', async () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/utils.ts',
          line: 12, // Line 12 is an added line (const c = 4)
          message: 'Consider using const instead of let',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(0);
      expect(mockPullsCreateReviewComment).toHaveBeenCalledTimes(1);
      expect(mockPullsCreateReviewComment).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'src/utils.ts',
          line: 12,
        })
      );
    });

    it('should post comment on valid context line', async () => {
      const findings: Finding[] = [
        {
          severity: 'info',
          file: 'src/utils.ts',
          line: 10, // Line 10 is a context line (const a = 1)
          message: 'Variable name could be more descriptive',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(0);
      expect(mockPullsCreateReviewComment).toHaveBeenCalledTimes(1);
    });

    it('should post comments on new file lines', async () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/new-file.ts',
          line: 2, // Line 2: const x = 1
          message: 'Consider using meaningful variable name',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(0);
      expect(mockPullsCreateReviewComment).toHaveBeenCalledWith(
        expect.objectContaining({
          path: 'src/new-file.ts',
          line: 2,
        })
      );
    });
  });

  describe('Invalid line numbers', () => {
    it('should skip comment on line not in diff', async () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/utils.ts',
          line: 100, // Line 100 is not in the diff hunks
          message: 'Security issue found',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(1);
      expect(result.invalidLineDetails).toHaveLength(1);
      expect(result.invalidLineDetails?.[0]).toMatchObject({
        file: 'src/utils.ts',
        line: 100,
      });
      expect(result.invalidLineDetails?.[0]?.nearestValidLine).toBeDefined();
      expect(mockPullsCreateReviewComment).not.toHaveBeenCalled();
    });

    it('should skip comment on file not in diff', async () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/other-file.ts', // This file is not in the diff
          line: 10,
          message: 'Issue found',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(1);
      expect(result.invalidLineDetails?.[0]?.reason).toContain('not found in diff');
      expect(mockPullsCreateReviewComment).not.toHaveBeenCalled();
    });

    it('should post valid comments and skip invalid ones in mixed batch', async () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/utils.ts',
          line: 11, // Valid - added line
          message: 'Valid issue',
          sourceAgent: 'test-agent',
        },
        {
          severity: 'warning',
          file: 'src/utils.ts',
          line: 50, // Invalid - not in diff
          message: 'Invalid issue',
          sourceAgent: 'test-agent',
        },
        {
          severity: 'info',
          file: 'src/new-file.ts',
          line: 3, // Valid - added line
          message: 'Another valid issue',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(1);
      expect(mockPullsCreateReviewComment).toHaveBeenCalledTimes(2);
    });

    it('should provide nearest valid line suggestion', async () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/utils.ts',
          line: 8, // Line 8 is not in diff, nearest should be 10
          message: 'Issue found',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, baseContext, baseConfig);

      expect(result.skippedInvalidLines).toBe(1);
      expect(result.invalidLineDetails?.[0]?.nearestValidLine).toBe(10);
    });
  });

  describe('Without diff files (backward compatibility)', () => {
    it('should allow posting when no diffFiles provided', async () => {
      const contextWithoutDiff: GitHubContext = {
        owner: 'test-owner',
        repo: 'test-repo',
        prNumber: 123,
        headSha: 'abc123',
        token: 'test-token',
        // No diffFiles - validation should be skipped
      };

      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/utils.ts',
          line: 100, // Would be invalid if diffFiles were provided
          message: 'Issue found',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToGitHub(findings, contextWithoutDiff, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(0);
      // Comment should be attempted (may fail at API level but that's separate)
      expect(mockPullsCreateReviewComment).toHaveBeenCalled();
    });
  });
});

describe('ADO Reporter Line Validation', () => {
  const diffFiles: DiffFile[] = [
    {
      path: 'src/service.ts',
      status: 'modified',
      additions: 2,
      deletions: 1,
      patch: `@@ -20,3 +20,4 @@ class Service {
   async init() {
-    this.configure();
+    await this.configure();
+    this.ready = true;
   }`,
    },
  ];

  const baseContext: ADOContext = {
    organization: 'test-org',
    project: 'test-project',
    repositoryId: 'test-repo',
    pullRequestId: 456,
    sourceRefCommit: 'def789',
    token: 'test-token',
    diffFiles,
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
      ado: {
        mode: 'threads_and_status',
        max_inline_comments: 20,
        summary: true,
        thread_status: 'active',
      },
    },
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  // Mock fetch for ADO API
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;

    // Default mock responses
    mockFetch.mockImplementation((url: string, options: RequestInit) => {
      const urlStr = url.toString();

      // Get threads (for deduplication check)
      if (urlStr.includes('/threads') && options.method !== 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ value: [] }),
        });
      }

      // Create thread (summary or inline)
      if (urlStr.includes('/threads') && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 999 }),
        });
      }

      // Create commit status
      if (urlStr.includes('/statuses')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 888 }),
        });
      }

      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('Valid line numbers', () => {
    it('should post thread on valid line', async () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/service.ts',
          line: 22, // await this.configure() - added line
          message: 'Consider error handling for async call',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToADO(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(0);

      // Check that inline thread was created
      const inlineThreadCalls = mockFetch.mock.calls.filter(
        (call) =>
          call[0].toString().includes('/threads') &&
          call[1]?.method === 'POST' &&
          call[1]?.body?.includes('threadContext')
      );
      expect(inlineThreadCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Invalid line numbers', () => {
    it('should skip thread on line not in diff', async () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/service.ts',
          line: 5, // Not in the diff hunk (which is around line 20)
          message: 'Security issue',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToADO(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(1);
      expect(result.invalidLineDetails).toHaveLength(1);
      expect(result.invalidLineDetails?.[0]?.nearestValidLine).toBeDefined();
    });

    it('should report accurate counts for mixed valid/invalid findings', async () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/service.ts',
          line: 21, // Valid - context line
          message: 'Valid finding 1',
          sourceAgent: 'test-agent',
        },
        {
          severity: 'warning',
          file: 'src/service.ts',
          line: 1, // Invalid - not in diff
          message: 'Invalid finding',
          sourceAgent: 'test-agent',
        },
        {
          severity: 'info',
          file: 'src/service.ts',
          line: 23, // Valid - this.ready = true added line
          message: 'Valid finding 2',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToADO(findings, baseContext, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(1);
      expect(result.invalidLineDetails).toHaveLength(1);
    });
  });

  describe('Without diff files (backward compatibility)', () => {
    it('should allow posting when no diffFiles provided', async () => {
      const contextWithoutDiff: ADOContext = {
        organization: 'test-org',
        project: 'test-project',
        repositoryId: 'test-repo',
        pullRequestId: 456,
        sourceRefCommit: 'def789',
        token: 'test-token',
        // No diffFiles
      };

      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/service.ts',
          line: 100,
          message: 'Issue found',
          sourceAgent: 'test-agent',
        },
      ];

      const result = await reportToADO(findings, contextWithoutDiff, baseConfig);

      expect(result.success).toBe(true);
      expect(result.skippedInvalidLines).toBe(0);
    });
  });
});

describe('Edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockChecksCreate.mockResolvedValue({ data: { id: 12345 } });
    mockChecksUpdate.mockResolvedValue({ data: { id: 12345 } });
    mockIssuesListComments.mockResolvedValue({ data: [] });
    mockIssuesCreateComment.mockResolvedValue({ data: { id: 1 } });
    mockPullsListReviewComments.mockResolvedValue({ data: [] });
    mockPullsCreateReviewComment.mockResolvedValue({ data: { id: 1 } });
  });

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
        mode: 'checks_and_comments',
        max_inline_comments: 20,
        summary: true,
      },
    },
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  it('should handle findings without line numbers', async () => {
    const diffFiles: DiffFile[] = [
      {
        path: 'src/app.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: `@@ -1,2 +1,3 @@
 line1
+line2
 line3`,
      },
    ];

    const context: GitHubContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
      headSha: 'abc123',
      token: 'test-token',
      diffFiles,
    };

    const findings: Finding[] = [
      {
        severity: 'warning',
        file: 'src/app.ts',
        // No line number - file-level finding
        message: 'File-level issue',
        sourceAgent: 'test-agent',
      },
    ];

    const result = await reportToGitHub(findings, context, baseConfig);

    expect(result.success).toBe(true);
    // Findings without line numbers are excluded from inline comments
    // but should not be counted as invalid lines
    expect(result.skippedInvalidLines).toBe(0);
  });

  it('should handle empty diff', async () => {
    const context: GitHubContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
      headSha: 'abc123',
      token: 'test-token',
      diffFiles: [], // Empty diff
    };

    const findings: Finding[] = [
      {
        severity: 'warning',
        file: 'src/any-file.ts',
        line: 10,
        message: 'Issue found',
        sourceAgent: 'test-agent',
      },
    ];

    const result = await reportToGitHub(findings, context, baseConfig);

    expect(result.success).toBe(true);
    expect(result.skippedInvalidLines).toBe(1);
    expect(result.invalidLineDetails?.[0]?.reason).toContain('not found in diff');
  });

  it('should handle deleted files correctly', async () => {
    const diffFiles: DiffFile[] = [
      {
        path: 'src/deleted.ts',
        status: 'deleted',
        additions: 0,
        deletions: 10,
        patch: `@@ -1,10 +0,0 @@
-// All lines deleted`,
      },
    ];

    const context: GitHubContext = {
      owner: 'test-owner',
      repo: 'test-repo',
      prNumber: 123,
      headSha: 'abc123',
      token: 'test-token',
      diffFiles,
    };

    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/deleted.ts',
        line: 1,
        message: 'Issue in deleted file',
        sourceAgent: 'test-agent',
      },
    ];

    const result = await reportToGitHub(findings, context, baseConfig);

    expect(result.success).toBe(true);
    // Deleted files have no commentable lines in new version
    expect(result.skippedInvalidLines).toBe(1);
  });
});
