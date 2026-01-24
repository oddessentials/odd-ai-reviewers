/**
 * GitHub Multi-line Comment Payload Tests
 *
 * Verifies exact Octokit call arguments for single-line and multi-line comments
 * to ensure correct placement on GitHub PR diffs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';
import { reportToGitHub, type GitHubContext } from '../report/github.js';

// Track calls to createReviewComment for payload inspection
const mockCreateReviewComment = vi.fn(async () => ({ data: { id: 789 } }));

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
      createReviewComment: mockCreateReviewComment,
      listReviewComments: vi.fn(async () => ({ data: [] })),
    },
  })),
}));

describe('GitHub Multi-line Payload Verification', () => {
  const baseConfig = {
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

  beforeEach(() => {
    mockCreateReviewComment.mockClear();
  });

  it('should send correct payload for single-line comment (line + side only, NO start_line)', async () => {
    // Diff with line 2 as added line
    const diffFiles: DiffFile[] = [
      {
        path: 'src/test.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: `@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const d = 4;`,
      },
    ];

    const findings: Finding[] = [
      {
        severity: 'warning',
        file: 'src/test.ts',
        line: 2, // Single line only
        message: 'Test warning',
        sourceAgent: 'test',
      },
    ];

    await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(mockCreateReviewComment).toHaveBeenCalledTimes(1);

    const callArgs = mockCreateReviewComment.mock.calls[0]?.[0] as Record<string, unknown>;

    // Verify exact payload shape for single-line
    expect(callArgs).toHaveProperty('line', 2);
    expect(callArgs).toHaveProperty('side', 'RIGHT');
    expect(callArgs).toHaveProperty('commit_id', 'abc123');
    expect(callArgs).toHaveProperty('path', 'src/test.ts');

    // Critical: NO start_line for single-line comments
    expect(callArgs).not.toHaveProperty('start_line');
    expect(callArgs).not.toHaveProperty('start_side');
  });

  it('should send correct payload for multi-line comment (start_line + start_side + line + side)', async () => {
    // Diff with lines 2-4 as added lines
    const diffFiles: DiffFile[] = [
      {
        path: 'src/test.ts',
        status: 'modified',
        additions: 3,
        deletions: 0,
        patch: `@@ -1,2 +1,5 @@
 const a = 1;
+const b = 2;
+const c = 3;
+const d = 4;
 const e = 5;`,
      },
    ];

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/test.ts',
        line: 2,
        endLine: 4, // Multi-line range
        message: 'Multi-line issue',
        sourceAgent: 'test',
      },
    ];

    await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(mockCreateReviewComment).toHaveBeenCalledTimes(1);

    const callArgs = mockCreateReviewComment.mock.calls[0]?.[0] as Record<string, unknown>;

    // Verify exact payload shape for multi-line
    expect(callArgs).toHaveProperty('start_line', 2);
    expect(callArgs).toHaveProperty('start_side', 'RIGHT');
    expect(callArgs).toHaveProperty('line', 4); // end line
    expect(callArgs).toHaveProperty('side', 'RIGHT');
    expect(callArgs).toHaveProperty('commit_id', 'abc123');
    expect(callArgs).toHaveProperty('path', 'src/test.ts');
  });

  it('should NOT set start_line when endLine equals line (negative test)', async () => {
    // Diff with line 2 as added line
    const diffFiles: DiffFile[] = [
      {
        path: 'src/test.ts',
        status: 'modified',
        additions: 1,
        deletions: 0,
        patch: `@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 const d = 4;`,
      },
    ];

    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/test.ts',
        line: 2,
        endLine: 2, // Same as line - should be treated as single-line
        message: 'Same line start and end',
        sourceAgent: 'test',
      },
    ];

    await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

    expect(mockCreateReviewComment).toHaveBeenCalledTimes(1);

    const callArgs = mockCreateReviewComment.mock.calls[0]?.[0] as Record<string, unknown>;

    // Should treat as single-line: no start_line/start_side
    expect(callArgs).toHaveProperty('line', 2);
    expect(callArgs).toHaveProperty('side', 'RIGHT');
    expect(callArgs).not.toHaveProperty('start_line');
    expect(callArgs).not.toHaveProperty('start_side');
  });

  /**
   * CRITICAL: Right-side enforcement test
   * This test prevents any future refactor from accidentally using left-side fields
   * which would cause comments to appear on the wrong side of the diff
   */
  describe('Right-side Enforcement (prevents misplaced comments)', () => {
    it('should ONLY use RIGHT side, never LEFT side (single-line)', async () => {
      const diffFiles: DiffFile[] = [
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 1,
          deletions: 1,
          patch: `@@ -1,2 +1,2 @@
 const a = 1;
-const old = 2;
+const new = 2;`,
        },
      ];

      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/test.ts',
          line: 2,
          message: 'Check this line',
          sourceAgent: 'test',
        },
      ];

      await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

      const callArgs = mockCreateReviewComment.mock.calls[0]?.[0] as Record<string, unknown>;

      // ASSERTION: Must use RIGHT side
      expect(callArgs.side).toBe('RIGHT');

      // CRITICAL NEGATIVE ASSERTION: Must NOT have any left-side values
      // This prevents the original bug where comments appeared on wrong side
      expect(callArgs.side).not.toBe('LEFT');
      if (callArgs.start_side !== undefined) {
        expect(callArgs.start_side).not.toBe('LEFT');
      }
    });

    it('should ONLY use RIGHT side, never LEFT side (multi-line)', async () => {
      const diffFiles: DiffFile[] = [
        {
          path: 'src/test.ts',
          status: 'modified',
          additions: 3,
          deletions: 0,
          patch: `@@ -1,1 +1,4 @@
 const a = 1;
+const b = 2;
+const c = 3;
+const d = 4;`,
        },
      ];

      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 2,
          endLine: 4,
          message: 'Multi-line issue',
          sourceAgent: 'test',
        },
      ];

      await reportToGitHub(findings, baseContext, baseConfig, diffFiles);

      const callArgs = mockCreateReviewComment.mock.calls[0]?.[0] as Record<string, unknown>;

      // ASSERTION: Both start_side and side must be RIGHT
      expect(callArgs.start_side).toBe('RIGHT');
      expect(callArgs.side).toBe('RIGHT');

      // CRITICAL NEGATIVE ASSERTION: Neither field should be LEFT
      expect(callArgs.start_side).not.toBe('LEFT');
      expect(callArgs.side).not.toBe('LEFT');
    });
  });
});
