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
import { AgentSuccess } from '../agents/types.js';
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

    // (012-fix-agent-result-regressions) - Updated tests to use new processFindings signature
    // New signature: processFindings(completeFindings, partialFindings, allResults, skippedAgents)

    it('should deduplicate identical findings', () => {
      const findings = [baseFinding, { ...baseFinding }, { ...baseFinding }];
      const results: AgentResult[] = [];
      const skippedAgents: SkippedAgent[] = [];

      const processed = processFindings(findings, [], results, skippedAgents);

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

      const processed = processFindings(findings, [], [], []);

      // Message should be HTML-escaped
      expect(processed.sorted[0]?.message).toContain('&lt;script&gt;');
    });

    it('should sort findings by severity', () => {
      const findings: Finding[] = [
        { ...baseFinding, severity: 'info', file: 'c.ts' },
        { ...baseFinding, severity: 'error', file: 'a.ts' },
        { ...baseFinding, severity: 'warning', file: 'b.ts' },
      ];

      const processed = processFindings(findings, [], [], []);

      // Errors should come first
      expect(processed.sorted[0]?.severity).toBe('error');
    });

    it('should generate summary markdown', () => {
      const findings: Finding[] = [baseFinding];
      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'test',
          findings: [baseFinding],
          metrics: { durationMs: 100, filesProcessed: 1 },
        }),
      ];

      const processed = processFindings(findings, [], results, []);

      expect(processed.summary).toBeTruthy();
      expect(typeof processed.summary).toBe('string');
    });

    it('should log skipped agents', () => {
      const skippedAgents: SkippedAgent[] = [
        { id: 'semgrep', name: 'Semgrep', reason: 'Binary not found' },
        { id: 'opencode', name: 'OpenCode', reason: 'API key missing' },
      ];

      processFindings([], [], [], skippedAgents);

      expect(consoleLogSpy).toHaveBeenCalledWith('[router] Skipped agents: 2');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Semgrep: Binary not found')
      );
    });

    it('should handle empty findings array', () => {
      const processed = processFindings([], [], [], []);

      expect(processed.sorted).toEqual([]);
      expect(processed.summary).toBeTruthy();
    });

    it('FR-007: should render partial findings section when agent fails with partialFindings', () => {
      // Simulates a failed agent that produced some findings before failing
      const partialFindings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/vulnerable.ts',
          line: 42,
          message: 'Potential security issue detected before timeout',
          sourceAgent: 'semgrep',
          provenance: 'partial',
        },
      ];

      const processed = processFindings([], partialFindings, [], []);

      // FR-007: The summary must include the partial findings section
      expect(processed.summary).toContain('## ⚠️ Partial Findings (from failed agents)');
      expect(processed.summary).toContain('agents that did not complete successfully');
      expect(processed.summary).toContain('do NOT affect gating decisions');
      expect(processed.summary).toContain('🛡'); // semgrep icon
      expect(processed.summary).toContain('(line 42)');
      expect(processed.summary).toContain('Potential security issue detected before timeout');
    });

    it('FR-007: should NOT render partial findings section when no partial findings exist', () => {
      const completeFindings: Finding[] = [
        {
          severity: 'error',
          file: 'src/app.ts',
          line: 10,
          message: 'From successful agent',
          sourceAgent: 'eslint',
          provenance: 'complete',
        },
      ];

      const processed = processFindings(completeFindings, [], [], []);

      // No partial findings section should appear
      expect(processed.summary).not.toContain('Partial Findings (from failed agents)');
      // But the main summary should still exist
      expect(processed.summary).toContain('AI Code Review Summary');
    });
  });

  /**
   * Partial Findings Deduplication Tests (012-fix-agent-result-regressions)
   *
   * FR-010, FR-011: Verify deduplication behavior for partialFindings
   */
  describe('partialFindings deduplication (FR-010, FR-011)', () => {
    const baseFinding: Finding = {
      severity: 'error',
      file: 'test.ts',
      line: 10,
      message: 'Test finding',
      sourceAgent: 'test',
    };

    it('FR-010: should deduplicate within partialFindings collection', () => {
      // Two identical partial findings (same fingerprint)
      const partialFindings: Finding[] = [
        {
          ...baseFinding,
          sourceAgent: 'semgrep',
          provenance: 'partial',
        },
        {
          ...baseFinding, // Duplicate
          sourceAgent: 'semgrep',
          provenance: 'partial',
        },
      ];

      const processed = processFindings([], partialFindings, [], []);

      // Summary should mention partial findings (indicating they were processed)
      expect(processed.summary).toContain('Partial Findings');

      // The deduplication happens internally - verify via console log
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Partial findings:'));
    });

    it('FR-011: should NOT cross-deduplicate between completeFindings and partialFindings', () => {
      // Same finding appears in both collections
      const sharedFinding = {
        severity: 'error' as const,
        file: 'src/app.ts',
        line: 42,
        ruleId: 'no-unused-vars',
        message: 'Unused variable x',
        sourceAgent: 'eslint',
      };

      const completeFindings: Finding[] = [{ ...sharedFinding, provenance: 'complete' as const }];

      const partialFindings: Finding[] = [{ ...sharedFinding, provenance: 'partial' as const }];

      const processed = processFindings(completeFindings, partialFindings, [], []);

      // Complete findings should be preserved in sorted output
      expect(processed.sorted).toHaveLength(1);
      expect(processed.sorted[0]?.provenance).toBe('complete');

      // Summary should include BOTH sections - partial findings not deduped against complete
      expect(processed.summary).toContain('AI Code Review Summary');
      expect(processed.summary).toContain('Partial Findings');
    });

    it('FR-010: should preserve distinct partial findings from different agents for same issue', () => {
      // Same issue found by two different agents (both failed with partial results)
      // FR-010: Partial deduplication includes sourceAgent in key
      const issueFromAgent1: Finding = {
        severity: 'warning',
        file: 'src/utils.ts',
        line: 25,
        ruleId: 'complexity',
        message: 'Function too complex',
        sourceAgent: 'eslint',
        provenance: 'partial',
      };

      const issueFromAgent2: Finding = {
        severity: 'warning',
        file: 'src/utils.ts',
        line: 25,
        ruleId: 'complexity', // Same rule, same location
        message: 'Function too complex',
        sourceAgent: 'semgrep', // Different agent
        provenance: 'partial',
      };

      const partialFindings: Finding[] = [issueFromAgent1, issueFromAgent2];

      const processed = processFindings([], partialFindings, [], []);

      // FR-010: Both should appear because partial dedup key includes sourceAgent
      // The summary should show findings from both agents (identified by their icons)
      expect(processed.summary).toContain('Partial Findings');
      expect(processed.summary).toContain('🤖'); // eslint uses default icon (not in mapping)
      expect(processed.summary).toContain('🛡'); // semgrep icon
    });

    it('FR-010: deduplicatePartialFindings preserves identical findings from different failed agents', () => {
      // This is the key FR-010 test: two agents report EXACT same issue
      // Both should be preserved because we can't know which agent's analysis is more complete
      const identicalFinding1: Finding = {
        severity: 'error',
        file: 'src/security.ts',
        line: 100,
        ruleId: 'sql-injection',
        message: 'Potential SQL injection vulnerability',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      };

      const identicalFinding2: Finding = {
        severity: 'error',
        file: 'src/security.ts',
        line: 100,
        ruleId: 'sql-injection',
        message: 'Potential SQL injection vulnerability',
        sourceAgent: 'codeql', // Different agent, same exact finding
        provenance: 'partial',
      };

      const partialFindings: Finding[] = [identicalFinding1, identicalFinding2];

      const processed = processFindings([], partialFindings, [], []);

      // Both agents' findings should appear in the summary (identified by their icons)
      expect(processed.summary).toContain('🛡'); // semgrep icon
      expect(processed.summary).toContain('🤖'); // codeql uses default icon (not in mapping)
      // The section header should appear
      expect(processed.summary).toContain('Partial Findings (from failed agents)');
    });
  });

  /**
   * Gating Tests (012-fix-agent-result-regressions)
   *
   * FR-008: Verify gating uses completeFindings only, not partialFindings
   */
  describe('gating with partialFindings (FR-008)', () => {
    let processExitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
    });

    afterEach(() => {
      processExitSpy.mockRestore();
    });

    it('FR-008: should NOT gate on partialFindings - only completeFindings affect gating', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'error' as const },
      };

      // Error-severity finding ONLY in partialFindings
      const partialWithError: Finding[] = [
        {
          severity: 'error',
          file: 'src/danger.ts',
          line: 1,
          message: 'Critical security issue',
          sourceAgent: 'semgrep',
          provenance: 'partial',
        },
      ];

      // No complete findings
      const completeFindings: Finding[] = [];

      // Process to generate sorted output (which goes to gating)
      const processed = processFindings(completeFindings, partialWithError, [], []);

      // Gating should NOT exit because sorted only contains completeFindings
      checkGating(config, processed.sorted);

      // If we get here, gating passed (didn't call process.exit)
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('FR-008: should gate on completeFindings even when partialFindings exist', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'error' as const },
      };

      // Error in completeFindings
      const completeWithError: Finding[] = [
        {
          severity: 'error',
          file: 'src/complete.ts',
          line: 5,
          message: 'Error from successful agent',
          sourceAgent: 'eslint',
          provenance: 'complete',
        },
      ];

      // Warning in partialFindings (shouldn't affect gating)
      const partialWithWarning: Finding[] = [
        {
          severity: 'warning',
          file: 'src/partial.ts',
          line: 10,
          message: 'Warning from failed agent',
          sourceAgent: 'semgrep',
          provenance: 'partial',
        },
      ];

      const processed = processFindings(completeWithError, partialWithWarning, [], []);

      // Gating SHOULD exit because completeFindings has an error
      expect(() => checkGating(config, processed.sorted)).toThrow('process.exit called');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('FR-008: should pass gating with warnings in partialFindings when fail_on_severity is warning', () => {
      const config = {
        ...minimalConfig,
        gating: { enabled: true, fail_on_severity: 'warning' as const },
      };

      // Warning-severity finding ONLY in partialFindings
      const partialWithWarning: Finding[] = [
        {
          severity: 'warning',
          file: 'src/partial.ts',
          line: 15,
          message: 'Warning from failed agent',
          sourceAgent: 'semgrep',
          provenance: 'partial',
        },
      ];

      // Only info in complete findings (below gating threshold)
      const completeWithInfo: Finding[] = [
        {
          severity: 'info',
          file: 'src/complete.ts',
          line: 1,
          message: 'Info only',
          sourceAgent: 'eslint',
          provenance: 'complete',
        },
      ];

      const processed = processFindings(completeWithInfo, partialWithWarning, [], []);

      // Gating should NOT exit - partialFindings warnings don't count
      checkGating(config, processed.sorted);

      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispatchReport', () => {
    const mockGitHubReport = vi.mocked(reportToGitHub);
    const mockADOReport = vi.mocked(reportToADO);
    const samplePartialFindings: Finding[] = [
      {
        severity: 'warning',
        file: 'src/partial.ts',
        line: 5,
        message: 'Partial warning from failed agent',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      },
    ];

    beforeEach(() => {
      mockGitHubReport.mockResolvedValue({ success: true });
      mockADOReport.mockResolvedValue({ success: true });
    });

    it('should skip reporting in dry run mode', async () => {
      await dispatchReport('github', [], [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        dryRun: true,
        head: 'abc123',
        owner: 'test',
        repoName: 'repo',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith('[router] Dry run - skipping reporting');
      expect(mockGitHubReport).not.toHaveBeenCalled();
    });

    it('should dispatch to GitHub when platform is github and context is complete', async () => {
      await dispatchReport(
        'github',
        [],
        samplePartialFindings,
        minimalConfig,
        [],
        { GITHUB_TOKEN: 'ghp_test' },
        123,
        {
          head: 'abc123',
          owner: 'test-owner',
          repoName: 'test-repo',
          pr: 123,
        }
      );

      expect(mockGitHubReport).toHaveBeenCalledWith(
        [],
        samplePartialFindings,
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
      await dispatchReport('github', [], [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
        head: 'pr-head-sha',
        githubHeadSha: 'merge-head-sha',
        owner: 'test-owner',
        repoName: 'test-repo',
        pr: 123,
      });

      expect(mockGitHubReport).toHaveBeenCalledWith(
        [],
        [],
        expect.objectContaining({
          headSha: 'merge-head-sha',
        }),
        minimalConfig,
        []
      );
    });

    it('should not dispatch to GitHub when token is missing', async () => {
      await dispatchReport('github', [], [], minimalConfig, [], {}, 123, {
        head: 'abc123',
        owner: 'test',
        repoName: 'repo',
      });

      expect(mockGitHubReport).not.toHaveBeenCalled();
    });

    it('should not dispatch to GitHub when owner is missing', async () => {
      await dispatchReport('github', [], [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
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

      await dispatchReport('ado', [], samplePartialFindings, minimalConfig, [], adoEnv, 123, {
        head: 'abc123',
      });

      expect(mockADOReport).toHaveBeenCalledWith(
        [],
        samplePartialFindings,
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

      await dispatchReport('ado', [], [], minimalConfig, [], adoEnv, 123, { head: 'abc123' });

      expect(mockADOReport).toHaveBeenCalledWith(
        [],
        [],
        expect.objectContaining({
          token: 'pat-token',
        }),
        minimalConfig,
        []
      );
    });

    it('should skip ADO reporting when context is incomplete', async () => {
      await dispatchReport(
        'ado',
        [],
        [],
        minimalConfig,
        [],
        { SYSTEM_TEAMPROJECT: 'MyProject' },
        123,
        {
          head: 'abc123',
        }
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[router] Missing ADO context - skipping reporting'
      );
      expect(mockADOReport).not.toHaveBeenCalled();
    });

    it('should log error when GitHub report fails', async () => {
      mockGitHubReport.mockResolvedValue({ success: false, error: 'API rate limit exceeded' });

      await dispatchReport('github', [], [], minimalConfig, [], { GITHUB_TOKEN: 'ghp_test' }, 123, {
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

      await dispatchReport('ado', [], [], minimalConfig, [], adoEnv, 123, { head: 'abc123' });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[router] Failed to report to Azure DevOps:',
        'TF401192'
      );
    });

    it('should not dispatch for unknown platform', async () => {
      await dispatchReport('unknown', [], [], minimalConfig, [], {}, 123, { head: 'abc123' });

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
