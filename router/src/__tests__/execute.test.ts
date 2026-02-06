/**
 * Execute Module Tests
 *
 * Tests for pass execution logic including caching, budget enforcement,
 * policy checks, and error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeAllPasses, annotateProvenance } from '../phases/execute.js';
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
import { resolveProvider } from '../config.js';

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
      max_completion_tokens: 4000,
    },
    models: { default: 'gpt-4o-mini' },
    reporting: {},
    gating: { enabled: false, fail_on_severity: 'error', drift_gate: false },
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

      expect(result.completeFindings).toEqual([]);
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

      expect(result.completeFindings).toHaveLength(1);
      // FR-002: Complete findings have provenance: 'complete' added
      expect(result.completeFindings[0]).toEqual({ ...mockFinding, provenance: 'complete' });
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
      expect(result.completeFindings).toHaveLength(1);
      expect(result.completeFindings[0]?.file).toBe('cached.ts');
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

  /**
   * Partial Findings Collection Tests (012-fix-agent-result-regressions)
   *
   * FR-001: Verify that partialFindings from failed agents are correctly
   * collected into the partialFindings array with provenance: 'partial'.
   */
  describe('partialFindings collection (FR-001, FR-002)', () => {
    it('US1: should return empty partialFindings when all agents succeed', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const completeFinding = {
        severity: 'warning' as const,
        file: 'src/app.ts',
        line: 10,
        message: 'From successful agent',
        sourceAgent: 'semgrep',
      };

      const mockSemgrep = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentSuccess({
          agentId: 'semgrep',
          findings: [completeFinding],
          metrics: { durationMs: 100, filesProcessed: 5 },
        })
      );

      const mockReviewdog = createMockAgent(
        'reviewdog',
        'Reviewdog',
        false,
        AgentSuccess({
          agentId: 'reviewdog',
          findings: [],
          metrics: { durationMs: 50, filesProcessed: 3 },
        })
      );

      vi.mocked(getAgentsByIds)
        .mockReturnValueOnce([mockSemgrep])
        .mockReturnValueOnce([mockReviewdog]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
        { name: 'lint', agents: ['reviewdog'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      // US1: Explicit assertion - partialFindings MUST be empty when all agents succeed
      expect(result.partialFindings).toEqual([]);
      expect(result.partialFindings).toHaveLength(0);

      // completeFindings should have the findings from successful agents
      expect(result.completeFindings).toHaveLength(1);
      expect(result.completeFindings[0]?.provenance).toBe('complete');

      // No agents should be skipped
      expect(result.skippedAgents).toHaveLength(0);
    });

    it('FR-001: should collect partialFindings from AgentResultFailure (single failure case)', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const partialFinding = {
        severity: 'warning' as const,
        file: 'src/partial.ts',
        line: 42,
        message: 'Partial finding before timeout',
        sourceAgent: 'semgrep',
      };

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentFailure({
          agentId: 'semgrep',
          error: 'Process timeout after 30s',
          failureStage: 'exec',
          partialFindings: [partialFinding],
          metrics: { durationMs: 30000, filesProcessed: 5 },
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

      // Verify partialFindings are collected
      expect(result.partialFindings).toHaveLength(1);
      expect(result.partialFindings[0]).toEqual({
        ...partialFinding,
        provenance: 'partial',
      });

      // Verify completeFindings is empty (no successful agents)
      expect(result.completeFindings).toHaveLength(0);

      // Verify agent is in skippedAgents
      expect(result.skippedAgents).toHaveLength(1);
      expect(result.skippedAgents[0]?.reason).toBe('Process timeout after 30s');
    });

    it('FR-001: should not add phantom findings when partialFindings array is empty', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const mockAgent = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentFailure({
          agentId: 'semgrep',
          error: 'Binary not found',
          failureStage: 'preflight',
          partialFindings: [], // Empty array - no partial findings
          metrics: { durationMs: 10, filesProcessed: 0 },
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

      // Verify no phantom findings are created
      expect(result.partialFindings).toHaveLength(0);
      expect(result.completeFindings).toHaveLength(0);

      // Agent should still be in skippedAgents
      expect(result.skippedAgents).toHaveLength(1);
    });

    it('FR-001: should collect partialFindings from multiple failed agents', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const semgrepPartial = {
        severity: 'error' as const,
        file: 'src/vuln.ts',
        line: 10,
        message: 'SQL injection risk',
        sourceAgent: 'semgrep',
      };

      const reviewdogPartial = {
        severity: 'warning' as const,
        file: 'src/utils.ts',
        line: 25,
        message: 'Unused variable',
        sourceAgent: 'reviewdog',
      };

      const prAgentPartials = [
        {
          severity: 'info' as const,
          file: 'src/app.ts',
          line: 1,
          message: 'Consider adding docs',
          sourceAgent: 'pr_agent',
        },
        {
          severity: 'warning' as const,
          file: 'src/app.ts',
          line: 50,
          message: 'Complex function',
          sourceAgent: 'pr_agent',
        },
      ];

      const mockSemgrep = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentFailure({
          agentId: 'semgrep',
          error: 'Timeout',
          failureStage: 'exec',
          partialFindings: [semgrepPartial],
          metrics: { durationMs: 30000, filesProcessed: 3 },
        })
      );

      const mockReviewdog = createMockAgent(
        'reviewdog',
        'Reviewdog',
        false,
        AgentFailure({
          agentId: 'reviewdog',
          error: 'Out of memory',
          failureStage: 'postprocess',
          partialFindings: [reviewdogPartial],
          metrics: { durationMs: 15000, filesProcessed: 10 },
        })
      );

      const mockPrAgent = createMockAgent(
        'pr_agent',
        'PR Agent',
        true,
        AgentFailure({
          agentId: 'pr_agent',
          error: 'API rate limit',
          failureStage: 'exec',
          partialFindings: prAgentPartials,
          metrics: { durationMs: 5000, filesProcessed: 2 },
        })
      );

      // Mock getAgentsByIds to return different agents for different passes
      vi.mocked(getAgentsByIds)
        .mockReturnValueOnce([mockSemgrep])
        .mockReturnValueOnce([mockReviewdog])
        .mockReturnValueOnce([mockPrAgent]);

      const config = createConfig([
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
        { name: 'lint', agents: ['reviewdog'], enabled: true, required: false },
        { name: 'ai-review', agents: ['pr_agent'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      // Verify all partialFindings from all failed agents are collected
      expect(result.partialFindings).toHaveLength(4);

      // Verify each finding has provenance: 'partial'
      for (const finding of result.partialFindings) {
        expect(finding.provenance).toBe('partial');
      }

      // Verify findings from each agent are present
      const semgrepFindings = result.partialFindings.filter((f) => f.sourceAgent === 'semgrep');
      const reviewdogFindings = result.partialFindings.filter((f) => f.sourceAgent === 'reviewdog');
      const prAgentFindings = result.partialFindings.filter((f) => f.sourceAgent === 'pr_agent');

      expect(semgrepFindings).toHaveLength(1);
      expect(reviewdogFindings).toHaveLength(1);
      expect(prAgentFindings).toHaveLength(2);

      // Verify all agents are in skippedAgents
      expect(result.skippedAgents).toHaveLength(3);

      // Verify no complete findings (all agents failed)
      expect(result.completeFindings).toHaveLength(0);
    });

    it('FR-001/FR-002: should keep partialFindings and completeFindings separate when mixed results', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

      const completeFinding = {
        severity: 'error' as const,
        file: 'src/success.ts',
        line: 5,
        message: 'From successful agent',
        sourceAgent: 'reviewdog',
      };

      const partialFinding = {
        severity: 'warning' as const,
        file: 'src/partial.ts',
        line: 10,
        message: 'From failed agent',
        sourceAgent: 'semgrep',
      };

      const mockReviewdog = createMockAgent(
        'reviewdog',
        'Reviewdog',
        false,
        AgentSuccess({
          agentId: 'reviewdog',
          findings: [completeFinding],
          metrics: { durationMs: 100, filesProcessed: 5 },
        })
      );

      const mockSemgrep = createMockAgent(
        'semgrep',
        'Semgrep',
        false,
        AgentFailure({
          agentId: 'semgrep',
          error: 'Timeout',
          failureStage: 'exec',
          partialFindings: [partialFinding],
          metrics: { durationMs: 30000, filesProcessed: 2 },
        })
      );

      vi.mocked(getAgentsByIds)
        .mockReturnValueOnce([mockReviewdog])
        .mockReturnValueOnce([mockSemgrep]);

      const config = createConfig([
        { name: 'lint', agents: ['reviewdog'], enabled: true, required: false },
        { name: 'security', agents: ['semgrep'], enabled: true, required: false },
      ]);

      const result = await executeAllPasses(
        config,
        createAgentContext(),
        {},
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      // Verify complete findings have provenance: 'complete'
      expect(result.completeFindings).toHaveLength(1);
      expect(result.completeFindings[0]).toEqual({
        ...completeFinding,
        provenance: 'complete',
      });

      // Verify partial findings have provenance: 'partial'
      expect(result.partialFindings).toHaveLength(1);
      expect(result.partialFindings[0]).toEqual({
        ...partialFinding,
        provenance: 'partial',
      });

      // Verify only failed agent is in skippedAgents
      expect(result.skippedAgents).toHaveLength(1);
      expect(result.skippedAgents[0]?.id).toBe('semgrep');
    });
  });

  describe('provider resolution (T010)', () => {
    it('should pass config.provider to resolveProvider during execution', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

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

      // Create config with explicit provider override
      const config: Config = {
        ...createConfig([
          { name: 'ai-review', agents: ['opencode'], enabled: true, required: false },
        ]),
        provider: 'anthropic', // Explicit provider override
      };

      await executeAllPasses(
        config,
        createAgentContext(),
        { ANTHROPIC_API_KEY: 'test-key' },
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      // Verify resolveProvider was called with config.provider as third argument
      expect(resolveProvider).toHaveBeenCalledWith(
        'opencode',
        expect.any(Object),
        'anthropic' // The explicit provider from config
      );
    });

    it('should pass undefined to resolveProvider when config.provider is not set', async () => {
      vi.mocked(isKnownAgentId).mockReturnValue(true);

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

      // Config without explicit provider
      const config = createConfig([
        { name: 'ai-review', agents: ['opencode'], enabled: true, required: false },
      ]);

      await executeAllPasses(
        config,
        createAgentContext(),
        { OPENAI_API_KEY: 'test-key' },
        { allowed: true, reason: 'under budget' },
        { configHash: 'hash123' }
      );

      // Verify resolveProvider was called without explicit provider (undefined)
      expect(resolveProvider).toHaveBeenCalledWith('opencode', expect.any(Object), undefined);
    });
  });

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

/**
 * annotateProvenance Helper Tests (FR-002)
 *
 * Unit tests for the provenance annotation helper function.
 */
describe('annotateProvenance (FR-002)', () => {
  it('should annotate findings with provenance: complete', () => {
    const findings = [
      { severity: 'error' as const, file: 'a.ts', message: 'Error', sourceAgent: 'semgrep' },
      { severity: 'warning' as const, file: 'b.ts', message: 'Warning', sourceAgent: 'eslint' },
    ];

    const annotated = annotateProvenance(findings, 'complete');

    expect(annotated).toHaveLength(2);
    expect(annotated[0]?.provenance).toBe('complete');
    expect(annotated[1]?.provenance).toBe('complete');
    // Original properties should be preserved
    expect(annotated[0]?.severity).toBe('error');
    expect(annotated[1]?.sourceAgent).toBe('eslint');
  });

  it('should annotate findings with provenance: partial', () => {
    const findings = [
      { severity: 'info' as const, file: 'c.ts', message: 'Info', sourceAgent: 'codeql' },
    ];

    const annotated = annotateProvenance(findings, 'partial');

    expect(annotated).toHaveLength(1);
    expect(annotated[0]?.provenance).toBe('partial');
    expect(annotated[0]?.message).toBe('Info');
  });

  it('should return empty array for empty input', () => {
    const annotated = annotateProvenance([], 'complete');
    expect(annotated).toEqual([]);
  });

  it('should not mutate original findings array', () => {
    const original = [
      { severity: 'error' as const, file: 'a.ts', message: 'Error', sourceAgent: 'test' },
    ];

    const annotated = annotateProvenance(original, 'partial');

    // Original should not have provenance
    expect((original[0] as { provenance?: string }).provenance).toBeUndefined();
    // Annotated should have provenance
    expect(annotated[0]?.provenance).toBe('partial');
  });

  it('should overwrite existing provenance if present', () => {
    const findings = [
      {
        severity: 'error' as const,
        file: 'a.ts',
        message: 'Error',
        sourceAgent: 'test',
        provenance: 'complete' as const,
      },
    ];

    const annotated = annotateProvenance(findings, 'partial');

    // Should overwrite to partial
    expect(annotated[0]?.provenance).toBe('partial');
  });
});
