/**
 * Policy Module Tests
 *
 * Regression tests for main branch policy enforcement.
 * Ensures PRs targeting main are allowed while direct pushes to main are blocked.
 */

import { describe, it, expect } from 'vitest';
import {
  isMainBranchPush,
  isAgentForbiddenOnMain,
  MAIN_BRANCH_FORBIDDEN_AGENTS,
} from '../policy.js';

describe('isMainBranchPush', () => {
  describe('Pull Request Events', () => {
    it('should return false for PR targeting main (GITHUB_BASE_REF=main)', () => {
      const env = {
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REF_NAME: 'feature/test-branch',
        GITHUB_REF: 'refs/pull/123/merge',
        GITHUB_BASE_REF: 'main',
      };
      expect(isMainBranchPush(env)).toBe(false);
    });

    it('should return false for PR targeting develop', () => {
      const env = {
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REF_NAME: 'feature/test',
        GITHUB_REF: 'refs/pull/456/merge',
        GITHUB_BASE_REF: 'develop',
      };
      expect(isMainBranchPush(env)).toBe(false);
    });

    it('should return false for PR even if REF_NAME appears to be main', () => {
      // Edge case: ensure event_name takes precedence
      const env = {
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_REF_NAME: 'main', // This shouldn't happen, but test defensively
        GITHUB_REF: 'refs/pull/789/merge',
        GITHUB_BASE_REF: 'main',
      };
      expect(isMainBranchPush(env)).toBe(false);
    });
  });

  describe('Push Events', () => {
    it('should return true for direct push to main (GITHUB_REF_NAME=main)', () => {
      const env = {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF_NAME: 'main',
        GITHUB_REF: 'refs/heads/main',
      };
      expect(isMainBranchPush(env)).toBe(true);
    });

    it('should return true for direct push to main (GITHUB_REF=refs/heads/main)', () => {
      const env = {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF: 'refs/heads/main',
      };
      expect(isMainBranchPush(env)).toBe(true);
    });

    it('should return false for push to feature branch', () => {
      const env = {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF_NAME: 'feature/new-feature',
        GITHUB_REF: 'refs/heads/feature/new-feature',
      };
      expect(isMainBranchPush(env)).toBe(false);
    });

    it('should return false for push to develop', () => {
      const env = {
        GITHUB_EVENT_NAME: 'push',
        GITHUB_REF_NAME: 'develop',
        GITHUB_REF: 'refs/heads/develop',
      };
      expect(isMainBranchPush(env)).toBe(false);
    });
  });

  describe('Other Events', () => {
    it('should return true for workflow_dispatch on main', () => {
      const env = {
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF_NAME: 'main',
        GITHUB_REF: 'refs/heads/main',
      };
      expect(isMainBranchPush(env)).toBe(true);
    });

    it('should return false for workflow_dispatch on feature branch', () => {
      const env = {
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF_NAME: 'feature/test',
        GITHUB_REF: 'refs/heads/feature/test',
      };
      expect(isMainBranchPush(env)).toBe(false);
    });

    it('should handle missing GITHUB_EVENT_NAME gracefully', () => {
      const env = {
        GITHUB_REF_NAME: 'main',
        GITHUB_REF: 'refs/heads/main',
      };
      // Without event name, we fall back to ref check
      expect(isMainBranchPush(env)).toBe(true);
    });
  });
});

describe('isAgentForbiddenOnMain', () => {
  it('should return true for pr_agent', () => {
    expect(isAgentForbiddenOnMain('pr_agent')).toBe(true);
  });

  it('should return true for ai_semantic_review', () => {
    expect(isAgentForbiddenOnMain('ai_semantic_review')).toBe(true);
  });

  it('should return false for semgrep', () => {
    expect(isAgentForbiddenOnMain('semgrep')).toBe(false);
  });

  it('should return false for reviewdog', () => {
    expect(isAgentForbiddenOnMain('reviewdog')).toBe(false);
  });

  it('should return false for opencode', () => {
    expect(isAgentForbiddenOnMain('opencode')).toBe(false);
  });

  it('should return false for local_llm', () => {
    expect(isAgentForbiddenOnMain('local_llm')).toBe(false);
  });
});

describe('MAIN_BRANCH_FORBIDDEN_AGENTS', () => {
  it('should contain pr_agent and ai_semantic_review', () => {
    expect(MAIN_BRANCH_FORBIDDEN_AGENTS).toContain('pr_agent');
    expect(MAIN_BRANCH_FORBIDDEN_AGENTS).toContain('ai_semantic_review');
  });

  it('should not contain static analysis agents', () => {
    expect(MAIN_BRANCH_FORBIDDEN_AGENTS).not.toContain('semgrep');
    expect(MAIN_BRANCH_FORBIDDEN_AGENTS).not.toContain('reviewdog');
  });
});
