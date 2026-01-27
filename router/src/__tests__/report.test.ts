/**
 * Report Module Tests
 *
 * Tests for platform-specific reporting dispatch and gating logic.
 * Covers processFindings, dispatchReport, and checkGating functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processFindings, dispatchReport, checkGating } from '../phases/report.js';
import type { Config } from '../config/schemas.js';
import type { Finding, AgentResult } from '../agents/types.js';
import type { SkippedAgent } from '../phases/execute.js';

// Mock the report modules
vi.mock('../report/github.js', () => ({
  reportToGitHub: vi.fn(),
}));

vi.mock('../report/ado.js', () => ({
  reportToADO: vi.fn(),
}));

// Import mocked modules
import { reportToGitHub } from '../report/github.js';
import { reportToADO } from '../report/ado.js';

// Minimal valid config for testing
const minimalConfig = {
  version: 1,
  trusted_only: true,
  triggers: { on: ['pull_request'] as const, branches: ['main'] },
  passes: [],
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
      mode: 'checks_and_comments' as const,
      max_inline_comments: 20,
      summary: true,
    },
  },
  gating: { enabled: false, fail_on_severity: 'error' as const },
} satisfies Config;

describe('Report Module', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('processFindings', () => {
    const baseFinding: Finding = {
      severity: 'error',
      file: 'test.ts',
      line: 10,
      message: 'Test finding',
      sourceAgent: 'test',
    };

    it('should deduplicate identical findings', () => {
      const findings = [baseFinding, { ...baseFinding }, { ...baseFinding }];
      const results: AgentResult[] = [];
      const skippedAgents: SkippedAgent[] = [];

      const processed = processFindings(findings, results, skippedAgents);

      // Deduplication removes identical findings based on fingerprint
      expect(processed.sorted.length).toBeLessThanOrEqual(findings.length);
    });

    it('should sanitize findings (escapes HTML)', () => {
      const findings: Finding[] = [
        {
          ...baseFinding,
          message: '<script>alert(1)</script>',
        },
      ];

      const processed = processFindings(findings, [], []);

      // Message should be HTML-escaped
      expect(processed.sorted[0]?.message).toContain('&lt;script&gt;');
    });

    it('should sort findings by severity', () => {
      const findings: Finding[] = [
        { ...baseFinding, severity: 'info', file: 'c.ts' },
        { ...baseFinding, severity: 'error', file: 'a.ts' },
        { ...baseFinding, severity: 'warning', file: 'b.ts' },
      ];

      const processed = processFindings(findings, [], []);

      // Errors should come first
      expect(processed.sorted[0]?.severity).toBe('error');
    });

    it('should generate summary markdown', () => {
      const findings: Finding[] = [baseFinding];
      const results: AgentResult[] = [
        {
          agentId: 'test',
          success: true,
          findings: [baseFinding],
          metrics: { durationMs: 100, filesProcessed: 1 },
        },
      ];

      const processed = processFindings(findings, results, []);

      expect(processed.summary).toBeTruthy();
      expect(typeof processed.summary).toBe('string');
    });

    it('should log skipped agents', () => {
      const skippedAgents: SkippedAgent[] = [
        { id: 'semgrep', name: 'Semgrep', reason: 'Binary not found' },
        { id: 'opencode', name: 'OpenCode', reason: 'API key missing' },
      ];

      processFindings([], [], skippedAgents);

      expect(consoleLogSpy).toHaveBeenCalledWith('[router] Skipped agents: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Semgrep: Binary not found')
      );
    });

    it('should handle empty findings array', () => {
      const processed = processFindings([], [], []);

      expect(processed.sorted).toEqual([]);
      expect(processed.summary).toBeTruthy();
    });
  });

  describe('dispatchReport', () => {
    const mockGitHubReport = vi.mocked(reportToGitHub);
    const mockADOReport = vi.mocked(reportToADO);

    beforeEach(() => {
      mockGitHubReport.mockResolvedValue({ success: true });
      mockADOReport.mockResolvedValue({ success: true });
    });

    it('should skip reporting in dry run mode', async () => {
      await dispatchReport('github', [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        dryRun: true,
        head: 'abc123',
        owner: 'test',
        repoName: 'repo',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('[router] Dry run - skipping reporting');
      expect(mockGitHubReport).not.toHaveBeenCalled();
    });

    it('should dispatch to GitHub when platform is github and context is complete', async () => {
      await dispatchReport('github', [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        head: 'abc123',
        owner: 'test-owner',
        repoName: 'test-repo',
        pr: 123,
      });

      expect(mockGitHubReport).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          owner: 'test-owner',
          repo: 'test-repo',
          headSha: 'abc123',
          token: 'ghp_test',
        }),
        minimalConfig,
        []
      );
    });

    it('should prefer githubHeadSha when provided for GitHub reporting', async () => {
      await dispatchReport('github', [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        head: 'pr-head-sha',
        githubHeadSha: 'merge-head-sha',
        owner: 'test-owner',
        repoName: 'test-repo',
        pr: 123,
      });

      expect(mockGitHubReport).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          headSha: 'merge-head-sha',
        }),
        minimalConfig,
        []
      );
    });

    it('should not dispatch to GitHub when token is missing', async () => {
      await dispatchReport('github', [], minimalConfig, [], {}, 123, {
        head: 'abc123',
        owner: 'test',
        repoName: 'repo',
      });

      expect(mockGitHubReport).not.toHaveBeenCalled();
    });

    it('should not dispatch to GitHub when owner is missing', async () => {
      await dispatchReport('github', [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        head: 'abc123',
        repoName: 'repo',
      });

      expect(mockGitHubReport).not.toHaveBeenCalled();
    });

    it('should dispatch to ADO when platform is ado and context is complete', async () => {
      const adoEnv = {
        SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: 'https://dev.azure.com/myorg/',
        SYSTEM_TEAMPROJECT: 'MyProject',
        BUILD_REPOSITORY_NAME: 'my-repo',
        SYSTEM_ACCESSTOKEN: 'ado-token',
      };

      await dispatchReport('ado', [], minimalConfig, [], adoEnv, 123, { head: 'abc123' });

      expect(mockADOReport).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          organization: 'myorg',
          project: 'MyProject',
          repositoryId: 'my-repo',
          pullRequestId: 123,
          token: 'ado-token',
        }),
        minimalConfig,
        []
      );
    });

    it('should use AZURE_DEVOPS_PAT if SYSTEM_ACCESSTOKEN is missing', async () => {
      const adoEnv = {
        SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: 'https://dev.azure.com/myorg/',
        SYSTEM_TEAMPROJECT: 'MyProject',
        BUILD_REPOSITORY_NAME: 'my-repo',
        AZURE_DEVOPS_PAT: 'pat-token',
      };

      await dispatchReport('ado', [], minimalConfig, [], adoEnv, 123, { head: 'abc123' });

      expect(mockADOReport).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          token: 'pat-token',
        }),
        minimalConfig,
        []
      );
    });

    it('should skip ADO reporting when context is incomplete', async () => {
      await dispatchReport('ado', [], minimalConfig, [], { SYSTEM_TEAMPROJECT: 'MyProject' }, 123, {
        head: 'abc123',
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[router] Missing ADO context - skipping reporting'
      );
      expect(mockADOReport).not.toHaveBeenCalled();
    });

    it('should log error when GitHub report fails', async () => {
      mockGitHubReport.mockResolvedValue({ success: false, error: 'API rate limit exceeded' });

      await dispatchReport('github', [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        head: 'abc123',
        owner: 'test',
        repoName: 'repo',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[router] Failed to report to GitHub:',
        'API rate limit exceeded'
      );
    });

    it('should log error when ADO report fails', async () => {
      mockADOReport.mockResolvedValue({ success: false, error: 'TF401192' });

      const adoEnv = {
        SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: 'https://dev.azure.com/myorg/',
        SYSTEM_TEAMPROJECT: 'MyProject',
        BUILD_REPOSITORY_NAME: 'my-repo',
        SYSTEM_ACCESSTOKEN: 'token',
      };

      await dispatchReport('ado', [], minimalConfig, [], adoEnv, 123, { head: 'abc123' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[router] Failed to report to Azure DevOps:',
        'TF401192'
      );
    });

    it('should not dispatch for unknown platform', async () => {
      await dispatchReport('unknown', [], minimalConfig, [], {}, 123, { head: 'abc123' });

      expect(mockGitHubReport).not.toHaveBeenCalled();
      expect(mockADOReport).not.toHaveBeenCalled();
    });
  });

  describe('checkGating', () => {
    let processExitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      processExitSpy.mockRestore();
    });

    it('should do nothing when gating is disabled', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: false, fail_on_severity: 'error' as const },
      };
      const findings: Finding[] = [
        { severity: 'error', file: 'test.ts', line: 1, message: 'Error', sourceAgent: 'test' },
      ];

      checkGating(config, findings);

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should exit when fail_on_severity is error and error findings present', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'error' as const },
      };
      const findings: Finding[] = [
        { severity: 'error', file: 'test.ts', line: 1, message: 'Error', sourceAgent: 'test' },
      ];

      expect(() => checkGating(config, findings)).toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit when fail_on_severity is error but only warnings present', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'error' as const },
      };
      const findings: Finding[] = [
        { severity: 'warning', file: 'test.ts', line: 1, message: 'Warning', sourceAgent: 'test' },
      ];

      checkGating(config, findings);

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should exit when fail_on_severity is warning and warning findings present', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'warning' as const },
      };
      const findings: Finding[] = [
        { severity: 'warning', file: 'test.ts', line: 1, message: 'Warning', sourceAgent: 'test' },
      ];

      expect(() => checkGating(config, findings)).toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should exit when fail_on_severity is warning and error findings present', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'warning' as const },
      };
      const findings: Finding[] = [
        { severity: 'error', file: 'test.ts', line: 1, message: 'Error', sourceAgent: 'test' },
      ];

      expect(() => checkGating(config, findings)).toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should not exit when fail_on_severity is warning but only info present', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'warning' as const },
      };
      const findings: Finding[] = [
        { severity: 'info', file: 'test.ts', line: 1, message: 'Info', sourceAgent: 'test' },
      ];

      checkGating(config, findings);

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should not exit when no findings present', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'error' as const },
      };

      checkGating(config, []);

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should log error message when gating fails', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'error' as const },
      };
      const findings: Finding[] = [
        { severity: 'error', file: 'test.ts', line: 1, message: 'Error', sourceAgent: 'test' },
      ];

      expect(() => checkGating(config, findings)).toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[router] Gating failed - blocking severity findings present'
      );
    });
  });
});
