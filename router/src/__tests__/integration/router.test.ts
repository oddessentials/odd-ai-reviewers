/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Router Integration Tests
 *
 * E2E tests that run through real adapters with mocked external services.
 * Tests the full flow: config → trust → diff → agents → reporting
 *
 * Note: Retry behavior is tested in pr_agent_retry.test.ts (10 tests).
 * These tests focus on the happy path through real adapters.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import goldenFixture from '../fixtures/golden.json' with { type: 'json' };

// Create mock function outside module mock for access in tests
const mockCreate = vi.hoisted(() => vi.fn());

// Mock OpenAI module
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe('Router Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockReset();
    // Default to successful response
    mockCreate.mockResolvedValue(goldenFixture.openaiCompletion);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('PR-Agent E2E flow', () => {
    it('should complete review with mocked OpenAI through real adapter', async () => {
      const { prAgentAgent } = await import('../../agents/pr_agent.js');

      const context = {
        repoPath: '/test/repo',
        diff: { files: goldenFixture.diff.files, base: 'main', head: 'feature' },
        files: goldenFixture.diff.files.map((f) => ({
          ...f,
          additions: f.additions,
          deletions: f.deletions,
        })),
        config: goldenFixture.config,
        diffContent: goldenFixture.diffContent,
        prNumber: 123,
        env: { OPENAI_API_KEY: 'test-key' },
      };

      const result = await prAgentAgent.run(context as any);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('pr_agent');
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.metrics.filesProcessed).toBeGreaterThan(0);
    });

    it('should skip review when no supported files', async () => {
      const { prAgentAgent } = await import('../../agents/pr_agent.js');

      const context = {
        repoPath: '/test/repo',
        diff: { files: [], base: 'main', head: 'feature' },
        files: [],
        config: goldenFixture.config,
        diffContent: '',
        prNumber: 123,
        env: { OPENAI_API_KEY: 'test-key' },
      };

      const result = await prAgentAgent.run(context as any);

      expect(result.success).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should fail gracefully when API key missing', async () => {
      const { prAgentAgent } = await import('../../agents/pr_agent.js');

      const context = {
        repoPath: '/test/repo',
        diff: { files: goldenFixture.diff.files, base: 'main', head: 'feature' },
        files: goldenFixture.diff.files.map((f) => ({
          ...f,
          additions: f.additions,
          deletions: f.deletions,
        })),
        config: goldenFixture.config,
        diffContent: goldenFixture.diffContent,
        prNumber: 123,
        env: {}, // No API key
      };

      const result = await prAgentAgent.run(context as any);

      expect(result.success).toBe(false);
      expect(result.error).toContain('API key');
    });
  });

  describe('Config validation', () => {
    it('should parse valid config with schema', async () => {
      const { ConfigSchema } = await import('../../config.js');

      const result = ConfigSchema.safeParse(goldenFixture.config);

      expect(result.success).toBe(true);
    });

    it('should reject invalid config', async () => {
      const { ConfigSchema } = await import('../../config.js');

      const result = ConfigSchema.safeParse({ version: 'invalid' });

      expect(result.success).toBe(false);
    });
  });

  describe('Trust validation', () => {
    it('should block fork PRs when trusted_only is true', async () => {
      const { checkTrust } = await import('../../trust.js');

      const context = {
        number: 123,
        headRepo: 'external/repo',
        baseRepo: 'team/repo',
        author: 'external-user',
        isFork: true,
        isDraft: false,
      };
      const config = { trusted_only: true } as any;

      const result = checkTrust(context, config);

      expect(result.trusted).toBe(false);
      expect(result.reason).toContain('Fork');
    });

    it('should allow same-repo PRs', async () => {
      const { checkTrust } = await import('../../trust.js');

      const context = {
        number: 123,
        headRepo: 'team/repo',
        baseRepo: 'team/repo',
        author: 'team-member',
        isFork: false,
        isDraft: false,
      };
      const config = { trusted_only: true } as any;

      const result = checkTrust(context, config);

      expect(result.trusted).toBe(true);
    });

    it('should skip draft PRs', async () => {
      const { checkTrust } = await import('../../trust.js');

      const context = {
        number: 123,
        headRepo: 'team/repo',
        baseRepo: 'team/repo',
        author: 'team-member',
        isFork: false,
        isDraft: true,
      };
      const config = { trusted_only: true } as any;

      const result = checkTrust(context, config);

      expect(result.trusted).toBe(false);
      expect(result.reason).toContain('draft');
    });
  });
});
