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

/**
 * Proximity-Based Deduplication Tests
 *
 * Tests for the new proximity-based deduplication that handles
 * the "line drift" problem where code moves between pushes.
 */
import {
  buildProximityMap,
  isDuplicateByProximity,
  identifyStaleComments,
  parseDedupeKey,
  extractFingerprintFromKey,
  LINE_PROXIMITY_THRESHOLD,
  getDedupeKey,
  generateFingerprint,
} from '../report/formats.js';

describe('Proximity-Based Deduplication (Line Drift Fix)', () => {
  describe('parseDedupeKey', () => {
    it('should parse valid dedupe key', () => {
      const key = 'abcdef1234567890abcdef1234567890:src/test.ts:42';
      const parsed = parseDedupeKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed?.fingerprint).toBe('abcdef1234567890abcdef1234567890');
      expect(parsed?.file).toBe('src/test.ts');
      expect(parsed?.line).toBe(42);
    });

    it('should handle file paths with colons', () => {
      const key = 'abcdef1234567890abcdef1234567890:C:/Users/test/file.ts:100';
      const parsed = parseDedupeKey(key);

      expect(parsed).not.toBeNull();
      expect(parsed?.file).toBe('C:/Users/test/file.ts');
      expect(parsed?.line).toBe(100);
    });

    it('should return null for invalid fingerprint', () => {
      const key = 'invalid:src/test.ts:42';
      expect(parseDedupeKey(key)).toBeNull();
    });

    it('should return null for missing line', () => {
      const key = 'abcdef1234567890abcdef1234567890:src/test.ts';
      expect(parseDedupeKey(key)).toBeNull();
    });
  });

  describe('extractFingerprintFromKey', () => {
    it('should extract first 32 characters as fingerprint', () => {
      const key = 'abcdef1234567890abcdef1234567890:src/test.ts:42';
      expect(extractFingerprintFromKey(key)).toBe('abcdef1234567890abcdef1234567890');
    });
  });

  describe('buildProximityMap', () => {
    it('should group keys by fingerprint+file', () => {
      const keys = [
        'abcdef1234567890abcdef1234567890:src/test.ts:10',
        'abcdef1234567890abcdef1234567890:src/test.ts:15',
        '12345678901234567890123456789012:src/other.ts:50',
      ];

      const map = buildProximityMap(keys);

      expect(map.size).toBe(2);
      expect(map.get('abcdef1234567890abcdef1234567890:src/test.ts')).toEqual([10, 15]);
      expect(map.get('12345678901234567890123456789012:src/other.ts')).toEqual([50]);
    });

    it('should handle empty input', () => {
      const map = buildProximityMap([]);
      expect(map.size).toBe(0);
    });
  });

  describe('isDuplicateByProximity', () => {
    it('should detect exact match as duplicate', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/test.ts',
        line: 42,
        message: 'Test issue',
        sourceAgent: 'semgrep',
      };

      const key = getDedupeKey(finding);
      const existingKeys = new Set([key]);
      const proximityMap = buildProximityMap([key]);

      expect(isDuplicateByProximity(finding, existingKeys, proximityMap)).toBe(true);
    });

    it('should detect proximity match as duplicate (line drift)', () => {
      // Simulates: issue was on line 10, now on line 15 (code moved)
      const finding: Finding = {
        severity: 'error',
        file: 'src/test.ts',
        line: 15, // New line after code moved
        message: 'Test issue',
        ruleId: 'test-rule',
        sourceAgent: 'semgrep',
      };

      // Generate fingerprint for this finding
      const fingerprint = generateFingerprint(finding);

      // Existing comment was at line 10 with same fingerprint
      const existingKey = `${fingerprint}:src/test.ts:10`;
      const existingKeys = new Set([existingKey]);
      const proximityMap = buildProximityMap([existingKey]);

      // Should be detected as duplicate because line 15 is within threshold of line 10
      expect(isDuplicateByProximity(finding, existingKeys, proximityMap)).toBe(true);
    });

    it('should NOT detect as duplicate if line difference exceeds threshold', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/test.ts',
        line: 100, // Far from existing comment
        message: 'Test issue',
        ruleId: 'test-rule',
        sourceAgent: 'semgrep',
      };

      const fingerprint = generateFingerprint(finding);
      // Existing comment was at line 10 - far from line 100
      const existingKey = `${fingerprint}:src/test.ts:10`;
      const existingKeys = new Set([existingKey]);
      const proximityMap = buildProximityMap([existingKey]);

      // Line 100 is more than LINE_PROXIMITY_THRESHOLD away from line 10
      expect(isDuplicateByProximity(finding, existingKeys, proximityMap)).toBe(false);
    });

    it('should NOT detect as duplicate for different fingerprint', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/test.ts',
        line: 10,
        message: 'New different issue',
        ruleId: 'different-rule',
        sourceAgent: 'semgrep',
      };

      // Different fingerprint (different message/rule)
      const existingKey = 'aaaabbbbccccdddd0000111122223333:src/test.ts:10';
      const existingKeys = new Set([existingKey]);
      const proximityMap = buildProximityMap([existingKey]);

      expect(isDuplicateByProximity(finding, existingKeys, proximityMap)).toBe(false);
    });

    it('should NOT detect as duplicate for different file', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/other.ts', // Different file
        line: 10,
        message: 'Test issue',
        ruleId: 'test-rule',
        sourceAgent: 'semgrep',
      };

      const fingerprint = generateFingerprint({ ...finding, file: 'src/test.ts' });
      const existingKey = `${fingerprint}:src/test.ts:10`; // Same fingerprint but different file
      const existingKeys = new Set([existingKey]);
      const proximityMap = buildProximityMap([existingKey]);

      expect(isDuplicateByProximity(finding, existingKeys, proximityMap)).toBe(false);
    });
  });

  describe('identifyStaleComments', () => {
    it('should identify comments with no matching findings as stale', () => {
      // Existing comment for an issue that was fixed
      const existingKey = 'abcdef1234567890abcdef1234567890:src/test.ts:10';

      // No current findings
      const currentFindings: Finding[] = [];

      const stale = identifyStaleComments([existingKey], currentFindings);
      expect(stale).toContain(existingKey);
    });

    it('should NOT mark comment as stale if finding still exists nearby', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/test.ts',
        line: 15, // Moved from line 10
        message: 'Test issue',
        ruleId: 'test-rule',
        sourceAgent: 'semgrep',
      };

      const fingerprint = generateFingerprint(finding);
      const existingKey = `${fingerprint}:src/test.ts:10`; // Old comment at line 10

      const stale = identifyStaleComments([existingKey], [finding]);

      // Should NOT be stale because finding at line 15 is within proximity of line 10
      expect(stale).not.toContain(existingKey);
    });

    it('should mark comment as stale if finding moved too far', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/test.ts',
        line: 100, // Moved far from line 10
        message: 'Test issue',
        ruleId: 'test-rule',
        sourceAgent: 'semgrep',
      };

      const fingerprint = generateFingerprint(finding);
      const existingKey = `${fingerprint}:src/test.ts:10`; // Old comment at line 10

      const stale = identifyStaleComments([existingKey], [finding]);

      // Should be stale because line 100 is far from line 10
      expect(stale).toContain(existingKey);
    });

    it('should handle multiple findings and comments', () => {
      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/a.ts',
          line: 12, // Moved slightly from 10
          message: 'Issue A',
          ruleId: 'rule-a',
          sourceAgent: 'test',
        },
        {
          severity: 'warning',
          file: 'src/b.ts',
          line: 50,
          message: 'Issue B',
          ruleId: 'rule-b',
          sourceAgent: 'test',
        },
      ];

      const findingA = findings[0];
      const findingB = findings[1];
      if (!findingA || !findingB) throw new Error('Test setup failed');
      const fingerprintA = generateFingerprint(findingA);
      const fingerprintB = generateFingerprint(findingB);
      const fingerprintC = generateFingerprint({
        severity: 'info',
        file: 'src/c.ts',
        line: 1,
        message: 'Fixed issue',
        ruleId: 'rule-c',
        sourceAgent: 'test',
      });

      const existingKeys = [
        `${fingerprintA}:src/a.ts:10`, // Issue A was at line 10, now at 12 - NOT stale
        `${fingerprintB}:src/b.ts:50`, // Issue B exact match - NOT stale
        `${fingerprintC}:src/c.ts:1`, // Issue C was fixed - STALE
      ];

      const stale = identifyStaleComments(existingKeys, findings);

      expect(stale).toHaveLength(1);
      expect(stale[0]).toContain('src/c.ts');
    });
  });

  describe('LINE_PROXIMITY_THRESHOLD', () => {
    it('should be a reasonable value for line drift detection', () => {
      // Threshold should be reasonable - not too small (misses valid drift)
      // and not too large (catches unrelated instances)
      expect(LINE_PROXIMITY_THRESHOLD).toBeGreaterThanOrEqual(10);
      expect(LINE_PROXIMITY_THRESHOLD).toBeLessThanOrEqual(50);
    });
  });
});
