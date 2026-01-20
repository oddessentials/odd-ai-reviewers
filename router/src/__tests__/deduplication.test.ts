/**
 * Deduplication Regression Tests
 *
 * Per CONSOLIDATED.md Section I2:
 * - Fixture triggering same issue via semgrep + reviewdog
 * - Assert single merged finding
 *
 * These tests ensure that duplicate findings from different agents
 * are properly deduplicated by the router.
 */

import { describe, it, expect } from 'vitest';
import {
  deduplicateFindings,
  sortFindings,
  countBySeverity,
  groupByFile,
} from '../report/formats.js';
import type { Finding } from '../agents/index.js';

describe('Deduplication (Invariant 3)', () => {
  describe('deduplicateFindings', () => {
    it('should deduplicate identical findings from different agents', () => {
      // Simulate same issue found by both semgrep and reviewdog
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/auth.ts',
          line: 42,
          message: 'Hardcoded credentials detected',
          ruleId: 'security/hardcoded-credentials',
          sourceAgent: 'semgrep',
        },
        {
          severity: 'error',
          file: 'src/auth.ts',
          line: 42,
          message: 'Hardcoded credentials detected',
          ruleId: 'security/hardcoded-credentials',
          sourceAgent: 'reviewdog',
        },
      ];

      const deduplicated = deduplicateFindings(findings);

      // Should merge into single finding
      expect(deduplicated).toHaveLength(1);
      expect(deduplicated[0]?.file).toBe('src/auth.ts');
      expect(deduplicated[0]?.line).toBe(42);
    });

    it('should keep findings with different messages', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/auth.ts',
          line: 42,
          message: 'Hardcoded credentials detected',
          sourceAgent: 'semgrep',
        },
        {
          severity: 'warning',
          file: 'src/auth.ts',
          line: 42,
          message: 'Consider using environment variables',
          sourceAgent: 'pr_agent',
        },
      ];

      const deduplicated = deduplicateFindings(findings);

      // Different messages = different findings
      expect(deduplicated).toHaveLength(2);
    });

    it('should keep findings with different line numbers', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/auth.ts',
          line: 42,
          message: 'Issue found',
          sourceAgent: 'semgrep',
        },
        {
          severity: 'error',
          file: 'src/auth.ts',
          line: 43,
          message: 'Issue found',
          sourceAgent: 'reviewdog',
        },
      ];

      const deduplicated = deduplicateFindings(findings);

      expect(deduplicated).toHaveLength(2);
    });

    it('should keep findings with different files', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/auth.ts',
          line: 42,
          message: 'Issue found',
          sourceAgent: 'semgrep',
        },
        {
          severity: 'error',
          file: 'src/login.ts',
          line: 42,
          message: 'Issue found',
          sourceAgent: 'semgrep',
        },
      ];

      const deduplicated = deduplicateFindings(findings);

      expect(deduplicated).toHaveLength(2);
    });

    it('should handle findings without line numbers', () => {
      const findings: Finding[] = [
        {
          severity: 'info',
          file: 'README.md',
          message: 'File-level suggestion',
          sourceAgent: 'pr_agent',
        },
        {
          severity: 'info',
          file: 'README.md',
          message: 'File-level suggestion',
          sourceAgent: 'opencode',
        },
      ];

      const deduplicated = deduplicateFindings(findings);

      expect(deduplicated).toHaveLength(1);
    });

    it('should handle empty findings array', () => {
      const deduplicated = deduplicateFindings([]);
      expect(deduplicated).toHaveLength(0);
    });

    it('should handle single finding', () => {
      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'test.ts',
          line: 1,
          message: 'Single finding',
          sourceAgent: 'semgrep',
        },
      ];

      const deduplicated = deduplicateFindings(findings);
      expect(deduplicated).toHaveLength(1);
    });
  });

  describe('sortFindings (Invariant 5 - Deterministic)', () => {
    it('should sort by severity (error > warning > info)', () => {
      const findings: Finding[] = [
        { severity: 'info', file: 'a.ts', line: 1, message: 'Info', sourceAgent: 'test' },
        { severity: 'error', file: 'a.ts', line: 2, message: 'Error', sourceAgent: 'test' },
        { severity: 'warning', file: 'a.ts', line: 3, message: 'Warning', sourceAgent: 'test' },
      ];

      const sorted = sortFindings(findings);

      expect(sorted[0]?.severity).toBe('error');
      expect(sorted[1]?.severity).toBe('warning');
      expect(sorted[2]?.severity).toBe('info');
    });

    it('should sort by file within same severity', () => {
      const findings: Finding[] = [
        { severity: 'error', file: 'z.ts', line: 1, message: 'Error', sourceAgent: 'test' },
        { severity: 'error', file: 'a.ts', line: 1, message: 'Error', sourceAgent: 'test' },
        { severity: 'error', file: 'm.ts', line: 1, message: 'Error', sourceAgent: 'test' },
      ];

      const sorted = sortFindings(findings);

      expect(sorted[0]?.file).toBe('a.ts');
      expect(sorted[1]?.file).toBe('m.ts');
      expect(sorted[2]?.file).toBe('z.ts');
    });

    it('should sort by line within same file', () => {
      const findings: Finding[] = [
        { severity: 'error', file: 'a.ts', line: 100, message: 'Error', sourceAgent: 'test' },
        { severity: 'error', file: 'a.ts', line: 1, message: 'Error', sourceAgent: 'test' },
        { severity: 'error', file: 'a.ts', line: 50, message: 'Error', sourceAgent: 'test' },
      ];

      const sorted = sortFindings(findings);

      expect(sorted[0]?.line).toBe(1);
      expect(sorted[1]?.line).toBe(50);
      expect(sorted[2]?.line).toBe(100);
    });

    it('should produce deterministic output for same input', () => {
      const findings: Finding[] = [
        { severity: 'warning', file: 'b.ts', line: 2, message: 'W1', sourceAgent: 'test' },
        { severity: 'error', file: 'a.ts', line: 1, message: 'E1', sourceAgent: 'test' },
        { severity: 'info', file: 'c.ts', line: 3, message: 'I1', sourceAgent: 'test' },
      ];

      const sorted1 = sortFindings([...findings]);
      const sorted2 = sortFindings([...findings]);

      expect(sorted1).toEqual(sorted2);
    });
  });

  describe('countBySeverity', () => {
    it('should count findings by severity', () => {
      const findings: Finding[] = [
        { severity: 'error', file: 'a.ts', message: 'E1', sourceAgent: 'test' },
        { severity: 'error', file: 'b.ts', message: 'E2', sourceAgent: 'test' },
        { severity: 'warning', file: 'c.ts', message: 'W1', sourceAgent: 'test' },
        { severity: 'info', file: 'd.ts', message: 'I1', sourceAgent: 'test' },
        { severity: 'info', file: 'e.ts', message: 'I2', sourceAgent: 'test' },
        { severity: 'info', file: 'f.ts', message: 'I3', sourceAgent: 'test' },
      ];

      const counts = countBySeverity(findings);

      expect(counts.error).toBe(2);
      expect(counts.warning).toBe(1);
      expect(counts.info).toBe(3);
    });

    it('should handle empty findings', () => {
      const counts = countBySeverity([]);

      expect(counts.error).toBe(0);
      expect(counts.warning).toBe(0);
      expect(counts.info).toBe(0);
    });
  });

  describe('groupByFile', () => {
    it('should group findings by file path', () => {
      const findings: Finding[] = [
        { severity: 'error', file: 'src/a.ts', line: 1, message: 'E1', sourceAgent: 'test' },
        { severity: 'warning', file: 'src/a.ts', line: 2, message: 'W1', sourceAgent: 'test' },
        { severity: 'error', file: 'src/b.ts', line: 1, message: 'E2', sourceAgent: 'test' },
      ];

      const grouped = groupByFile(findings);

      expect(grouped.size).toBe(2);
      expect(grouped.get('src/a.ts')).toHaveLength(2);
      expect(grouped.get('src/b.ts')).toHaveLength(1);
    });
  });
});

describe('Deduplication Regression Fixture', () => {
  it('should deduplicate same finding from semgrep + reviewdog (golden case)', () => {
    // This is the specific regression case from CONSOLIDATED.md I2
    // Simulates the exact scenario where both tools find the same issue

    const semgrepFinding: Finding = {
      severity: 'error',
      file: 'src/api/handler.ts',
      line: 156,
      endLine: 160,
      message: 'Potential SQL injection vulnerability: user input directly concatenated into query',
      suggestion: 'Use parameterized queries instead',
      ruleId: 'typescript.security.sql-injection',
      sourceAgent: 'semgrep',
    };

    const reviewdogFinding: Finding = {
      severity: 'error',
      file: 'src/api/handler.ts',
      line: 156,
      endLine: 160,
      message: 'Potential SQL injection vulnerability: user input directly concatenated into query',
      suggestion: 'Use parameterized queries instead',
      ruleId: 'typescript.security.sql-injection',
      sourceAgent: 'reviewdog',
    };

    const allFindings = [semgrepFinding, reviewdogFinding];
    const deduplicated = deduplicateFindings(allFindings);

    // ASSERTION: Must produce single merged finding
    expect(deduplicated).toHaveLength(1);

    // The merged finding should preserve all information
    expect(deduplicated[0]?.file).toBe('src/api/handler.ts');
    expect(deduplicated[0]?.line).toBe(156);
    expect(deduplicated[0]?.message).toContain('SQL injection');
  });

  it('should preserve first agent for deduplicated findings', () => {
    // When deduplicating, we keep the first occurrence
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'test.ts',
        line: 1,
        message: 'Issue',
        sourceAgent: 'semgrep', // First
      },
      {
        severity: 'error',
        file: 'test.ts',
        line: 1,
        message: 'Issue',
        sourceAgent: 'reviewdog', // Second (discarded)
      },
    ];

    const deduplicated = deduplicateFindings(findings);

    expect(deduplicated).toHaveLength(1);
    expect(deduplicated[0]?.sourceAgent).toBe('semgrep');
  });
});
