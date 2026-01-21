/**
 * Trust Module Tests
 */

import { describe, it, expect } from 'vitest';
import { checkTrust, buildPRContext, type PullRequestContext } from '../trust.js';
import type { Config } from '../config.js';

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

describe('checkTrust', () => {
  it('should block fork PRs when trusted_only is true', () => {
    const context: PullRequestContext = {
      number: 1,
      headRepo: 'fork-owner/repo',
      baseRepo: 'owner/repo',
      author: 'fork-user',
      isFork: true,
      isDraft: false,
    };

    const result = checkTrust(context, baseConfig);
    expect(result.trusted).toBe(false);
    expect(result.reason).toContain('Fork PRs are not trusted');
  });

  it('should allow fork PRs when trusted_only is false', () => {
    const context: PullRequestContext = {
      number: 1,
      headRepo: 'fork-owner/repo',
      baseRepo: 'owner/repo',
      author: 'fork-user',
      isFork: true,
      isDraft: false,
    };

    const config = { ...baseConfig, trusted_only: false };
    const result = checkTrust(context, config);
    expect(result.trusted).toBe(true);
  });

  it('should always skip draft PRs', () => {
    const context: PullRequestContext = {
      number: 1,
      headRepo: 'owner/repo',
      baseRepo: 'owner/repo',
      author: 'user',
      isFork: false,
      isDraft: true,
    };

    const result = checkTrust(context, baseConfig);
    expect(result.trusted).toBe(false);
    expect(result.reason).toBe('Skipping draft PR');
  });

  it('should trust same-repo PRs', () => {
    const context: PullRequestContext = {
      number: 1,
      headRepo: 'owner/repo',
      baseRepo: 'owner/repo',
      author: 'contributor',
      isFork: false,
      isDraft: false,
    };

    const result = checkTrust(context, baseConfig);
    expect(result.trusted).toBe(true);
  });
});

describe('buildPRContext', () => {
  it('should correctly build context from GitHub payload', () => {
    const payload = {
      pull_request: {
        number: 42,
        draft: false,
        user: { login: 'contributor' },
        head: {
          sha: 'abc123',
          ref: 'feature-branch',
          repo: { full_name: 'owner/repo' },
        },
        base: {
          sha: 'def456',
          ref: 'main',
          repo: { full_name: 'owner/repo' },
        },
      },
    };

    const context = buildPRContext(payload);
    expect(context.number).toBe(42);
    expect(context.author).toBe('contributor');
    expect(context.isFork).toBe(false);
    expect(context.isDraft).toBe(false);
  });

  it('should detect fork PRs', () => {
    const payload = {
      pull_request: {
        number: 42,
        draft: false,
        user: { login: 'fork-user' },
        head: {
          sha: 'abc123',
          ref: 'feature-branch',
          repo: { full_name: 'fork-user/repo' },
        },
        base: {
          sha: 'def456',
          ref: 'main',
          repo: { full_name: 'owner/repo' },
        },
      },
    };

    const context = buildPRContext(payload);
    expect(context.isFork).toBe(true);
    expect(context.headRepo).toBe('fork-user/repo');
    expect(context.baseRepo).toBe('owner/repo');
  });

  it('should handle missing head repo (detached head)', () => {
    const payload = {
      pull_request: {
        number: 42,
        draft: true,
        user: { login: 'user' },
        head: {
          sha: 'abc123',
          ref: 'feature-branch',
          repo: undefined,
        },
        base: {
          sha: 'def456',
          ref: 'main',
          repo: { full_name: 'owner/repo' },
        },
      },
    };

    const context = buildPRContext(payload);
    expect(context.headRepo).toBe('');
    expect(context.isFork).toBe(true); // Empty !== base means fork
    expect(context.isDraft).toBe(true);
  });
});
