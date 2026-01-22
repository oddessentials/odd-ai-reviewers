/**
 * ADO Trust Module Tests
 * Verifies Azure DevOps PR context building and fork detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildADOPRContext, isPRDraft, checkTrust } from '../trust.js';
import type { Config } from '../config.js';

// Mock fetch for isPRDraft tests
const mockFetch = vi.fn();
global.fetch = mockFetch;

const baseConfig: Config = {
  version: 1,
  trusted_only: true,
  triggers: { on: ['pull_request'], branches: ['main'] },
  passes: [],
  limits: {
    max_files: 50,
    max_diff_lines: 2000,
    max_tokens_per_pr: 12000,
    max_usd_per_pr: 1.0,
    monthly_budget_usd: 100,
  },
  models: { default: 'gpt-4o-mini' },
  reporting: {},
  gating: { enabled: false, fail_on_severity: 'error' },
};

describe('buildADOPRContext', () => {
  it('should return null when not in ADO PR context', () => {
    const env = {
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
      // Missing SYSTEM_PULLREQUEST_PULLREQUESTID
    };

    const context = buildADOPRContext(env);
    expect(context).toBeNull();
  });

  it('should build context from ADO environment variables', () => {
    const env = {
      SYSTEM_PULLREQUEST_PULLREQUESTID: '42',
      SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REQUESTEDFOR: 'contributor',
    };

    const context = buildADOPRContext(env);
    expect(context).not.toBeNull();
    expect(context?.number).toBe(42);
    expect(context?.author).toBe('contributor');
    expect(context?.isFork).toBe(false); // Same repo URIs
    expect(context?.isDraft).toBe(false); // Default, requires API call
  });

  it('should detect fork PRs by comparing repository URIs', () => {
    const env = {
      SYSTEM_PULLREQUEST_PULLREQUESTID: '42',
      SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: 'https://dev.azure.com/fork-org/project/_git/repo',
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REQUESTEDFOR: 'fork-user',
    };

    const context = buildADOPRContext(env);
    expect(context).not.toBeNull();
    expect(context?.isFork).toBe(true);
    expect(context?.headRepo).toBe('https://dev.azure.com/fork-org/project/_git/repo');
    expect(context?.baseRepo).toBe('https://dev.azure.com/org/project/_git/repo');
  });

  it('should handle missing source repository URI', () => {
    const env = {
      SYSTEM_PULLREQUEST_PULLREQUESTID: '42',
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REQUESTEDFOR: 'user',
    };

    const context = buildADOPRContext(env);
    expect(context).not.toBeNull();
    expect(context?.headRepo).toBe('');
    expect(context?.isFork).toBe(false); // Empty source = same repo
  });

  it('should handle missing author', () => {
    const env = {
      SYSTEM_PULLREQUEST_PULLREQUESTID: '1',
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
    };

    const context = buildADOPRContext(env);
    expect(context).not.toBeNull();
    expect(context?.author).toBe('unknown');
  });
});

describe('isPRDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true when PR is draft', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ isDraft: true }),
    });

    const result = await isPRDraft('org', 'project', 'repo', 42, 'token');
    expect(result).toBe(true);
  });

  it('should return false when PR is not draft', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ isDraft: false }),
    });

    const result = await isPRDraft('org', 'project', 'repo', 42, 'token');
    expect(result).toBe(false);
  });

  it('should return false (fail open) on API error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await isPRDraft('org', 'project', 'repo', 42, 'token');
    expect(result).toBe(false);
  });

  it('should call correct ADO API endpoint', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ isDraft: false }),
    });

    await isPRDraft('myorg', 'myproject', 'myrepo', 123, 'mytoken');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://dev.azure.com/myorg/myproject/_apis/git/repositories/myrepo/pullRequests/123?api-version=7.1',
      expect.objectContaining({
        headers: { Authorization: 'Bearer mytoken' },
      })
    );
  });

  it('should handle network errors gracefully', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    const result = await isPRDraft('org', 'project', 'repo', 42, 'token');
    expect(result).toBe(false); // Fail open
  });
});

describe('ADO Fork PR Trust', () => {
  it('should block fork PRs from ADO when trusted_only is true', () => {
    const context = buildADOPRContext({
      SYSTEM_PULLREQUEST_PULLREQUESTID: '42',
      SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: 'https://dev.azure.com/fork-org/project/_git/repo',
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REQUESTEDFOR: 'fork-user',
    });

    expect(context).not.toBeNull();
    if (context) {
      const result = checkTrust(context, baseConfig);
      expect(result.trusted).toBe(false);
      expect(result.reason).toContain('Fork PRs are not trusted');
    }
  });

  it('should allow same-repo PRs from ADO', () => {
    const context = buildADOPRContext({
      SYSTEM_PULLREQUEST_PULLREQUESTID: '42',
      SYSTEM_PULLREQUEST_SOURCEREPOSITORYURI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REPOSITORY_URI: 'https://dev.azure.com/org/project/_git/repo',
      BUILD_REQUESTEDFOR: 'contributor',
    });

    expect(context).not.toBeNull();
    if (context) {
      const result = checkTrust(context, baseConfig);
      expect(result.trusted).toBe(true);
    }
  });
});
