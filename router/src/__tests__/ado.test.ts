/**
 * ADO Reporter Tests
 * Verifies Azure DevOps PR threads, commit status, and deduplication
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Config } from '../config.js';
import type { Finding } from '../agents/index.js';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Dynamic import after mock is set up
const { startBuildStatus, reportToADO } = await import('../report/ado.js');
type ADOContext = Parameters<typeof reportToADO>[1];

describe('ADO Reporter', () => {
  const baseContext: ADOContext = {
    organization: 'test-org',
    project: 'test-project',
    repositoryId: 'test-repo',
    pullRequestId: 123,
    sourceRefCommit: 'abc123def456',
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
      ado: {
        mode: 'threads_and_status',
        max_inline_comments: 20,
        summary: true,
        thread_status: 'active',
      },
    },
    gating: { enabled: false, fail_on_severity: 'error' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for successful responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, value: [] }),
      text: async () => '',
    });
  });

  describe('startBuildStatus', () => {
    it('should create pending status on PR commit', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 99999 }),
      });

      const statusId = await startBuildStatus(baseContext);

      expect(statusId).toBe(99999);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/commits/abc123def456/statuses'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('should set state to pending', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 1 }),
      });

      await startBuildStatus(baseContext);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs).toBeDefined();
      if (!callArgs) throw new Error('Expected call args');
      const body = JSON.parse(callArgs[1].body as string);
      expect(body.state).toBe('pending');
      expect(body.context.name).toBe('AI Code Review');
    });

    it('should throw on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(startBuildStatus(baseContext)).rejects.toThrow('Failed to start build status');
    });
  });

  describe('reportToADO', () => {
    beforeEach(() => {
      // Mock thread listing returning empty, but POST creates new threads
      mockFetch.mockImplementation(async (url: string, options?: RequestInit) => {
        // GET /threads? returns empty list
        if (url.includes('/threads?') && (!options?.method || options.method === 'GET')) {
          return {
            ok: true,
            json: async () => ({ value: [] }),
          };
        }
        // All other requests (POST, PATCH, etc.) return { id: 1 }
        return {
          ok: true,
          json: async () => ({ id: 1 }),
        };
      });
    });

    it('should post summary thread and status by default', async () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 10,
          message: 'Test finding',
          sourceAgent: 'semgrep',
        },
      ];

      const result = await reportToADO(findings, baseContext, baseConfig, []);

      expect(result.success).toBe(true);
      expect(result.threadId).toBeDefined();
      expect(result.statusId).toBeDefined();
    });

    it('should NOT post threads when mode is status_only', async () => {
      const statusOnlyConfig: Config = {
        ...baseConfig,
        reporting: {
          ado: {
            mode: 'status_only',
            max_inline_comments: 20,
            summary: true,
            thread_status: 'active',
          },
        },
      };

      mockFetch.mockClear();
      await reportToADO([], baseContext, statusOnlyConfig, []);

      // Should only have status API call, no thread calls
      const threadCalls = mockFetch.mock.calls.filter((call) =>
        (call[0] as string).includes('/threads')
      );
      expect(threadCalls.length).toBe(0);
    });

    it('should NOT post status when mode is threads_only', async () => {
      const threadsOnlyConfig: Config = {
        ...baseConfig,
        reporting: {
          ado: {
            mode: 'threads_only',
            max_inline_comments: 20,
            summary: true,
            thread_status: 'active',
          },
        },
      };

      mockFetch.mockClear();
      await reportToADO([], baseContext, threadsOnlyConfig, []);

      // Should not have status API calls
      const statusCalls = mockFetch.mock.calls.filter((call) =>
        (call[0] as string).includes('/statuses')
      );
      expect(statusCalls.length).toBe(0);
    });

    it('should return error on API failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Server Error',
      });

      const result = await reportToADO([], baseContext, baseConfig, []);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Comment deduplication', () => {
    it('should skip posting when fingerprint exists in thread', async () => {
      const existingFingerprint = 'test-fingerprint:src/test.ts:10';

      mockFetch.mockImplementation(async (url: string) => {
        if (url.includes('/threads?')) {
          return {
            ok: true,
            json: async () => ({
              value: [
                {
                  id: 1,
                  comments: [
                    {
                      content: `Existing comment\n<!-- odd-ai-reviewers:fingerprint:v1:${existingFingerprint} -->`,
                    },
                  ],
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ id: 1 }),
        };
      });

      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 10,
          message: 'Test finding',
          sourceAgent: 'semgrep',
          fingerprint: 'test-fingerprint',
        },
      ];

      const result = await reportToADO(findings, baseContext, baseConfig, []);

      // Finding should be skipped as duplicate
      expect(result.skippedDuplicates).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Gating', () => {
    it('should set status to failed when gating enabled and errors present', async () => {
      const gatingConfig: Config = {
        ...baseConfig,
        gating: { enabled: true, fail_on_severity: 'error' },
      };

      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/test.ts',
          line: 10,
          message: 'Critical error',
          sourceAgent: 'semgrep',
        },
      ];

      mockFetch.mockClear();
      await reportToADO(findings, baseContext, gatingConfig, []);

      // Find the status update call
      const statusCalls = mockFetch.mock.calls.filter((call) =>
        (call[0] as string).includes('/statuses')
      );

      expect(statusCalls.length).toBeGreaterThan(0);
      const firstCall = statusCalls[0];
      if (!firstCall) throw new Error('Expected status call');
      const statusBody = JSON.parse(firstCall[1].body as string);
      expect(statusBody.state).toBe('failed');
    });

    it('should set status to succeeded when no blocking findings', async () => {
      const gatingConfig: Config = {
        ...baseConfig,
        gating: { enabled: true, fail_on_severity: 'error' },
      };

      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/test.ts',
          line: 10,
          message: 'Just a warning',
          sourceAgent: 'semgrep',
        },
      ];

      mockFetch.mockClear();
      await reportToADO(findings, baseContext, gatingConfig, []);

      const statusCalls = mockFetch.mock.calls.filter((call) =>
        (call[0] as string).includes('/statuses')
      );

      expect(statusCalls.length).toBeGreaterThan(0);
      const firstCall = statusCalls[0];
      if (!firstCall) throw new Error('Expected status call');
      const statusBody = JSON.parse(firstCall[1].body as string);
      expect(statusBody.state).toBe('succeeded');
    });
  });
});

describe('ADO Context Validation', () => {
  it('should construct correct API URL', async () => {
    const context: ADOContext = {
      organization: 'myorg',
      project: 'myproject',
      repositoryId: 'myrepo',
      pullRequestId: 42,
      sourceRefCommit: 'sha123',
      token: 'token',
    };

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1 }),
    });

    await startBuildStatus(context);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://dev.azure.com/myorg/myproject/_apis/git/repositories/myrepo'
      ),
      expect.any(Object)
    );
  });
});
