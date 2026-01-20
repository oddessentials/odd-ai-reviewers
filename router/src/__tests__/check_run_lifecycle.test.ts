/**
 * Check Run Lifecycle Tests
 * Verifies proper GitHub check run lifecycle: in_progress → completed
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../config.js';

// Create mock functions that will be hoisted
const mockChecksCreate = vi.fn();
const mockChecksUpdate = vi.fn();
const mockIssuesListComments = vi.fn();

// Mock Octokit - vi.mock is hoisted to the top
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
      createReviewComment: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    },
  })),
}));

// Dynamic import after mock is set up
const { startCheckRun, reportToGitHub } = await import('../report/github.js');
type GitHubContext = Parameters<typeof reportToGitHub>[1];

describe('Check Run Lifecycle', () => {
  const baseContext: GitHubContext = {
    owner: 'test-owner',
    repo: 'test-repo',
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
    reporting: {
      github: {
        mode: 'checks_only',
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
  });

  describe('startCheckRun', () => {
    it('should create check run in in_progress state', async () => {
      mockChecksCreate.mockResolvedValue({ data: { id: 99999 } });

      const checkRunId = await startCheckRun(baseContext);

      expect(checkRunId).toBe(99999);
      expect(mockChecksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          name: 'AI Code Review',
          head_sha: 'abc123',
          status: 'in_progress',
        })
      );
    });

    it('should include started_at timestamp', async () => {
      await startCheckRun(baseContext);

      expect(mockChecksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          started_at: expect.any(String),
        })
      );
    });

    it('should include progress message in output', async () => {
      await startCheckRun(baseContext);

      expect(mockChecksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            title: expect.stringContaining('in progress'),
          }),
        })
      );
    });
  });

  describe('reportToGitHub with checkRunId (proper lifecycle)', () => {
    it('should UPDATE existing check run when checkRunId is provided', async () => {
      const contextWithCheckRun: GitHubContext = {
        ...baseContext,
        checkRunId: 12345,
      };

      await reportToGitHub([], contextWithCheckRun, baseConfig);

      // Should call update, not create for the check run
      expect(mockChecksUpdate).toHaveBeenCalled();
      expect(mockChecksUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          check_run_id: 12345,
          status: 'completed',
          conclusion: 'success',
        })
      );
    });

    it('should include completed_at timestamp when updating', async () => {
      const contextWithCheckRun: GitHubContext = {
        ...baseContext,
        checkRunId: 12345,
      };

      await reportToGitHub([], contextWithCheckRun, baseConfig);

      expect(mockChecksUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          completed_at: expect.any(String),
        })
      );
    });

    it('should return the same checkRunId when updating', async () => {
      const contextWithCheckRun: GitHubContext = {
        ...baseContext,
        checkRunId: 12345,
      };

      const result = await reportToGitHub([], contextWithCheckRun, baseConfig);

      expect(result.checkRunId).toBe(12345);
    });
  });

  describe('reportToGitHub without checkRunId (legacy fallback)', () => {
    it('should CREATE new check run when checkRunId is not provided', async () => {
      // Clear any previous calls
      mockChecksCreate.mockClear();
      mockChecksUpdate.mockClear();

      await reportToGitHub([], baseContext, baseConfig);

      // Should call create (for new check run), not update
      expect(mockChecksCreate).toHaveBeenCalled();
      expect(mockChecksUpdate).not.toHaveBeenCalled();

      expect(mockChecksCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          conclusion: 'success',
        })
      );
    });
  });

  describe('Mode gating (comments_only should not use check runs)', () => {
    const commentsOnlyConfig: Config = {
      ...baseConfig,
      reporting: {
        github: {
          mode: 'comments_only',
          max_inline_comments: 20,
          summary: true,
        },
      },
    };

    it('should NOT create check run when mode is comments_only', async () => {
      mockChecksCreate.mockClear();
      mockChecksUpdate.mockClear();

      // When mode is comments_only, reportToGitHub should skip check run creation
      await reportToGitHub([], baseContext, commentsOnlyConfig);

      // No check run should be created or updated
      expect(mockChecksCreate).not.toHaveBeenCalled();
      expect(mockChecksUpdate).not.toHaveBeenCalled();
    });

    it('should NOT update check run even if checkRunId provided when mode is comments_only', async () => {
      mockChecksCreate.mockClear();
      mockChecksUpdate.mockClear();

      const contextWithCheckRun: GitHubContext = {
        ...baseContext,
        checkRunId: 12345,
      };

      await reportToGitHub([], contextWithCheckRun, commentsOnlyConfig);

      // Even with checkRunId, should not touch checks when mode is comments_only
      expect(mockChecksCreate).not.toHaveBeenCalled();
      expect(mockChecksUpdate).not.toHaveBeenCalled();
    });
  });
});
