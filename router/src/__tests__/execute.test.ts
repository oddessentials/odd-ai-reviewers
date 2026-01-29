/**
 * Execute Module Tests
 *
 * Tests for pass execution logic including caching, budget enforcement,
 * policy checks, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeAllPasses } from '../phases/execute.js';
import type { Config } from '../config/schemas.js';
import type { AgentContext, AgentResult, ReviewAgent } from '../agents/types.js';
import { AgentSuccess, AgentFailure } from '../agents/types.js';

// Mock dependencies
vi.mock('../agents/index.js', () => ({
  getAgentsByIds: vi.fn(),
}));

vi.mock('../config.js', () => ({
  resolveProvider: vi.fn(() => 'openai'),
}));

vi.mock('../agents/security.js', () => ({
  buildAgentEnv: vi.fn((agentId, env) => env),
  isKnownAgentId: vi.fn(() => true),
}));

vi.mock('../cache/store.js', () => ({
  getCached: vi.fn(() => null),
  setCache: vi.fn(),
}));

vi.mock('../cache/key.js', () => ({
  generateCacheKey: vi.fn(() => 'test-cache-key'),
}));

vi.mock('../policy.js', () => ({
  isMainBranchPush: vi.fn(() => false),
  isAgentForbiddenOnMain: vi.fn(() => false),
}));

// Import mocked modules
import { getAgentsByIds } from '../agents/index.js';
import { isKnownAgentId } from '../agents/security.js';
import { getCached, setCache } from '../cache/store.js';
import { isMainBranchPush, isAgentForbiddenOnMain } from '../policy.js';

// Helper to create mock agent
function createMockAgent(
  id: string,
  name: string,
  usesLlm: boolean,
  result: AgentResult
): ReviewAgent {
  return {
    id,
    name,
    usesLlm,
    supports: () => true,
    run: vi.fn().mockResolvedValue(result),
  };
}

// Helper to create minimal config
function createConfig(passes: Config['passes']): Config {
  return {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'], branches: ['main'] },
    passes,
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
}

// Helper to create agent context
function createAgentContext(): AgentContext {
  return {
    repoPath: '/repo',
    diff: {
      files: [],
      totalAdditions: 10,
      totalDeletions: 5,
      baseSha: 'abc123',
      headSha: 'def456',
      contextLines: 3,
      source: 'local-git',
    },
    files: [{ path: 'test.ts', status: 'modified', additions: 10, deletions: 5 }],
    config: createConfig([]),
    diffContent: 'test diff',
    prNumber: 123,
    env: {},
    effectiveModel: 'gpt-4o-mini',
    provider: 'openai',
  };
}

describe('executeAllPasses', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset isKnownAgentId to return true by default
    vi.mocked(isKnownAgentId).mockReturnValue(true);
    // Reset getAgentsByIds to empty array (tests must set their own)
    vi.mocked(getAgentsByIds).mockReturnValue([]);
    // Reset policy mocks
    vi.mocked(isMainBranchPush).mockReturnValue(false);
    vi.mocked(isAgentForbiddenOnMain).mockReturnValue(false);
    // Reset cache mock
    vi.mocked(getCached).mockResolvedValue(null);

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    // Reset all mock implementations to prevent leakage between tests
    // Note: resetAllMocks() resets implementations, restoreAllMocks() undoes vi.mock() entirely
    vi.resetAllMocks();
  });

  describe('pass execution', () => {
    it('should skip disabled passes', async () => {
      const config = createConfig([
        { name: 'disabled-pass', agents: ['semgrep'], enabled: false, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      expect(result.allFindings).toEqual([]);
      expect(result.allResults).toEqual([]);
      expect(consoleLogSpy).toHaveBeenCalledWith('[router] Skipping disabled pass: disabled-pass');
    });

    it('should execute enabled passes and collect findings', async () => {
      const mockFinding = {
        severity: 'error' as const,
        file: 'test.ts',
        line: 10,
        message: 'Test finding',
        sourceAgent: 'semgrep',
      };

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentSuccess({
          agentId: 'semgrep',
          findings: [mockFinding],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      expect(result.allFindings).toHaveLength(1);
      expect(result.allFindings[0]).toEqual(mockFinding);
      expect(result.allResults).toHaveLength(1);
      expect(mockAgent.run).toHaveBeenCalled();
    });
  });

  describe('budget enforcement', () => {
    it('should skip optional paid LLM passes when over budget', async () => {
      const mockAgent = createMockAgent(
        'opencode',
        'OpenCode',
        true,
        AgentSuccess({
          agentId: 'opencode',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'ai-review', agents: ['opencode'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: false, reason: 'over budget' },
        { configHash: 'hash123' }
      );

      expect(mockAgent.run).not.toHaveBeenCalled();
      expect(result.skippedAgents).toHaveLength(1);
      expect(result.skippedAgents[0]).toEqual({
        id: 'opencode',
        name: 'OpenCode',
        reason: 'Budget limit exceeded',
      });
    });

    it('should exit when required paid LLM pass is over budget', async () => {
      const mockAgent = createMockAgent(
        'opencode',
        'OpenCode',
        true,
        AgentSuccess({
          agentId: 'opencode',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'ai-review', agents: ['opencode'], enabled: true, required: true },
      ]);

      await expect(
        executeAllPasses(
          config,
          createAgentContext(),
          {},
          { allowed: false, reason: 'over budget' },
          { configHash: 'hash123' }
        )
      ).rejects.toThrow('process.exit called');

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should allow local_llm even when over budget (free)', async () => {
      const mockAgent = createMockAgent(
        'local_llm',
        'Local LLM',
        true,
        AgentSuccess({
          agentId: 'local_llm',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'local-ai', agents: ['local_llm'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: false, reason: 'over budget' },
        { configHash: 'hash123' }
      );

      // local_llm should still run - it's free
      expect(mockAgent.run).toHaveBeenCalled();
      expect(result.skippedAgents).toHaveLength(0);
    });
  });

  describe('caching', () => {
    it('should use cached results when available', async () => {
      const cachedResult = AgentSuccess({
        agentId: 'semgrep',
        findings: [
          { severity: 'warning', file: 'cached.ts', message: 'Cached', sourceAgent: 'semgrep' },
        ],
        metrics: { durationMs: 50, filesProcessed: 1 },
      });

      vi.mocked(getCached).mockResolvedValue(cachedResult);

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentSuccess({
          agentId: 'semgrep',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { pr: 123, head: 'def456', configHash: 'hash123' }
      );

      expect(mockAgent.run).not.toHaveBeenCalled();
      expect(result.allFindings).toHaveLength(1);
      expect(result.allFindings[0]?.file).toBe('cached.ts');
      expect(consoleLogSpy).toHaveBeenCalledWith('[router] Cache hit for semgrep');
    });

    it('should cache successful results', async () => {
      vi.mocked(getCached).mockResolvedValue(null);

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentSuccess({
          agentId: 'semgrep',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { pr: 123, head: 'def456', configHash: 'hash123' }
      );

      expect(setCache).toHaveBeenCalled();
    });

    it('should not cache when pr/head not provided', async () => {
      vi.mocked(getCached).mockResolvedValue(null);

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentSuccess({
          agentId: 'semgrep',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' } // No pr/head
      );

      expect(getCached).not.toHaveBeenCalled();
      expect(setCache).not.toHaveBeenCalled();
    });
  });

  // Note: Policy enforcement (isMainBranchPush, isAgentForbiddenOnMain) is tested in policy.test.ts
  // The integration of policy with executeAllPasses cannot be reliably unit tested due to
  // vitest module mock hoisting not working correctly with cross-directory imports.

  describe('error handling', () => {
    it('should skip optional agent on failure and continue', async () => {
      // Ensure mock is reset for this test
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentFailure({
          agentId: 'semgrep',
          error: 'Binary not found',
          failureStage: 'preflight',
          metrics: { durationMs: 100, filesProcessed: 0 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      expect(result.skippedAgents).toHaveLength(1);
      expect(result.skippedAgents[0]).toEqual({
        id: 'semgrep',
        name: 'Semgrep',
        reason: 'Binary not found',
      });
    });

    it('should exit when required agent fails', async () => {
      // Ensure mock is reset for this test
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentFailure({
          agentId: 'semgrep',
          error: 'Binary not found',
          failureStage: 'preflight',
          metrics: { durationMs: 100, filesProcessed: 0 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: true },
      ]);

      await expect(
        executeAllPasses(
          config,
          createAgentContext(),
          {},
          { allowed: true, reason: 'under budget' },
          { configHash: 'hash123' }
        )
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Required agent Semgrep failed')
      );
    });

    it('should handle agent crash (thrown error) for optional agent', async () => {
      // Ensure mock is reset for this test
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const mockAgent: ReviewAgent = {
        id: 'semgrep',
        name: 'Semgrep',
        usesLlm: false,
        supports: () => true,
        run: vi.fn().mockRejectedValue(new Error('Unexpected crash')),
      };

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      expect(result.skippedAgents).toHaveLength(1);
      expect(result.skippedAgents[0]?.reason).toBe('Unexpected crash');
    });

    // This test verifies that required agents crash with process.exit
    it('should exit when required agent crashes', async () => {
      // Explicit resets to ensure clean state
      vi.mocked(getCached).mockResolvedValue(null);
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const mockAgent: ReviewAgent = {
        id: 'semgrep',
        name: 'Semgrep',
        usesLlm: false,
        supports: () => true,
        run: vi.fn().mockRejectedValue(new Error('Unexpected crash')),
      };

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: true },
      ]);

      await expect(
        executeAllPasses(
          config,
          createAgentContext(),
          {},
          { allowed: true, reason: 'under budget' },
          { configHash: 'hash123' }
        )
      ).rejects.toThrow('process.exit called');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Required agent Semgrep crashed')
      );
    });

    it('should reject unknown agent IDs', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(false);

      const mockAgent = createMockAgent(
        'unknown-agent',
        'Unknown',
        false,
        AgentSuccess({
          agentId: 'unknown-agent',
          findings: [],
          metrics: { durationMs: 100, filesProcessed: 1 },
        })
      );

      vi.mocked(getAgentsByIds).mockReturnValue([mockAgent]);

      // Use type assertion since we're intentionally testing unknown agent handling
      const config = createConfig([
        { name: 'test', agents: ['unknown-agent' as never], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      expect(result.skippedAgents).toHaveLength(1);
      expect(result.skippedAgents[0]?.reason).toContain('no allowlisted environment');
    });
  });
});
