/**
 * Formats Module Tests
 *
 * Unit tests for finding deduplication, fingerprinting, and formatting functions.
 */

import { describe, it, expect } from 'vitest';
import {
  generateFingerprint,
  getDedupeKey,
  getPartialDedupeKey,
  deduplicateFindings,
  deduplicatePartialFindings,
  sortFindings,
  countBySeverity,
  renderPartialFindingsSection,
} from '../report/formats.js';
import type { Finding } from '../agents/types.js';

describe('Fingerprint Generation', () => {
  it('should generate consistent fingerprints for identical findings', () => {
    const finding1: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Test message',
      sourceAgent: 'semgrep',
    };

    const finding2: Finding = { ...finding1 };

    expect(generateFingerprint(finding1)).toBe(generateFingerprint(finding2));
  });

  it('should generate different fingerprints for different files', () => {
    const finding1: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Test message',
      sourceAgent: 'semgrep',
    };

    const finding2: Finding = { ...finding1, file: 'src/other.ts' };

    expect(generateFingerprint(finding1)).not.toBe(generateFingerprint(finding2));
  });

  it('should NOT include sourceAgent in fingerprint (enables cross-agent dedup)', () => {
    const finding1: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Same issue',
      sourceAgent: 'semgrep',
    };

    const finding2: Finding = { ...finding1, sourceAgent: 'eslint' };

    // Same fingerprint because sourceAgent is intentionally excluded
    expect(generateFingerprint(finding1)).toBe(generateFingerprint(finding2));
  });

  it('should use ruleId when available', () => {
    const withRule: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Test message',
      ruleId: 'no-unused-vars',
      sourceAgent: 'semgrep',
    };

    const withoutRule: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Test message',
      sourceAgent: 'semgrep',
    };

    // Different fingerprints because ruleId affects the hash
    expect(generateFingerprint(withRule)).not.toBe(generateFingerprint(withoutRule));
  });
});

describe('Deduplication Keys', () => {
  describe('getDedupeKey (complete findings)', () => {
    it('should generate key from fingerprint + file + line', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        line: 10,
        message: 'Test',
        sourceAgent: 'semgrep',
      };

      const key = getDedupeKey(finding);
      expect(key).toContain('src/app.ts');
      expect(key).toContain(':10');
    });

    it('should use 0 for missing line number', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        message: 'Test',
        sourceAgent: 'semgrep',
      };

      const key = getDedupeKey(finding);
      expect(key).toContain(':0');
    });
  });

  describe('getPartialDedupeKey (FR-010)', () => {
    it('should include sourceAgent in key', () => {
      const finding: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        line: 10,
        message: 'Test',
        sourceAgent: 'semgrep',
      };

      const key = getPartialDedupeKey(finding);
      expect(key).toContain('semgrep');
    });

    it('should generate different keys for same finding from different agents', () => {
      const fromSemgrep: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        line: 10,
        ruleId: 'sql-injection',
        message: 'SQL injection risk',
        sourceAgent: 'semgrep',
      };

      const fromCodeql: Finding = {
        ...fromSemgrep,
        sourceAgent: 'codeql',
      };

      // FR-010: Different keys because sourceAgent is included
      expect(getPartialDedupeKey(fromSemgrep)).not.toBe(getPartialDedupeKey(fromCodeql));
    });

    it('should generate same key for duplicate findings from same agent', () => {
      const finding1: Finding = {
        severity: 'error',
        file: 'src/app.ts',
        line: 10,
        ruleId: 'sql-injection',
        message: 'SQL injection risk',
        sourceAgent: 'semgrep',
      };

      const finding2: Finding = { ...finding1 };

      expect(getPartialDedupeKey(finding1)).toBe(getPartialDedupeKey(finding2));
    });
  });
});

describe('deduplicateFindings (complete findings)', () => {
  it('should remove exact duplicates', () => {
    const finding: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Test',
      sourceAgent: 'semgrep',
    };

    const result = deduplicateFindings([finding, { ...finding }, { ...finding }]);
    expect(result).toHaveLength(1);
  });

  it('should deduplicate cross-agent findings (same issue, different agents)', () => {
    const fromSemgrep: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Unused variable',
      sourceAgent: 'semgrep',
    };

    const fromEslint: Finding = {
      ...fromSemgrep,
      sourceAgent: 'eslint',
    };

    // Cross-agent dedup: same issue from different agents -> keep only one
    const result = deduplicateFindings([fromSemgrep, fromEslint]);
    expect(result).toHaveLength(1);
  });

  it('should preserve distinct findings', () => {
    const finding1: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      message: 'Error 1',
      sourceAgent: 'semgrep',
    };

    const finding2: Finding = {
      severity: 'warning',
      file: 'src/app.ts',
      line: 20,
      message: 'Error 2',
      sourceAgent: 'eslint',
    };

    const result = deduplicateFindings([finding1, finding2]);
    expect(result).toHaveLength(2);
  });
});

describe('deduplicatePartialFindings (FR-010)', () => {
  it('should preserve identical findings from different failed agents', () => {
    // FR-010: This is the key behavior - partial findings preserve cross-agent duplicates
    const fromSemgrep: Finding = {
      severity: 'error',
      file: 'src/security.ts',
      line: 100,
      ruleId: 'sql-injection',
      message: 'SQL injection vulnerability',
      sourceAgent: 'semgrep',
      provenance: 'partial',
    };

    const fromCodeql: Finding = {
      ...fromSemgrep,
      sourceAgent: 'codeql',
    };

    const result = deduplicatePartialFindings([fromSemgrep, fromCodeql]);

    // Both should be preserved because sourceAgent is in the dedup key
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.sourceAgent === 'semgrep')).toBeDefined();
    expect(result.find((f) => f.sourceAgent === 'codeql')).toBeDefined();
  });

  it('should still deduplicate duplicates from the same agent', () => {
    const finding1: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      ruleId: 'test-rule',
      message: 'Test',
      sourceAgent: 'semgrep',
      provenance: 'partial',
    };

    const finding2: Finding = { ...finding1 }; // Exact duplicate

    const result = deduplicatePartialFindings([finding1, finding2]);
    expect(result).toHaveLength(1);
  });

  it('should handle empty array', () => {
    const result = deduplicatePartialFindings([]);
    expect(result).toHaveLength(0);
  });

  it('should preserve same-line same-rule different-message findings from same agent', () => {
    // One failed agent emits two findings on same line with same ruleId but different messages
    // They SHOULD be preserved because partial dedupe key includes fingerprint (message hash)
    // Different messages = different fingerprints = both retained (012-fix-agent-result-regressions)
    const finding1: Finding = {
      severity: 'error',
      file: 'src/security.ts',
      line: 42,
      ruleId: 'sql-injection',
      message: 'SQL injection via user input in query parameter',
      sourceAgent: 'semgrep',
      provenance: 'partial',
    };

    const finding2: Finding = {
      severity: 'error',
      file: 'src/security.ts',
      line: 42,
      ruleId: 'sql-injection', // Same rule, same line, same file
      message: 'SQL injection via unescaped string concatenation', // Different message
      sourceAgent: 'semgrep', // Same agent
      provenance: 'partial',
    };

    const result = deduplicatePartialFindings([finding1, finding2]);

    // Both should be retained since key is sourceAgent + fingerprint + file + line
    // Different messages produce different fingerprints
    expect(result).toHaveLength(2);
  });

  it('should deduplicate exact duplicates (same everything including message)', () => {
    const finding1: Finding = {
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      ruleId: 'no-unused-vars',
      message: 'Variable x is unused',
      sourceAgent: 'eslint',
      provenance: 'partial',
    };

    const finding2: Finding = { ...finding1 }; // Exact duplicate

    const result = deduplicatePartialFindings([finding1, finding2]);

    // Only one should remain
    expect(result).toHaveLength(1);
  });
});

describe('sortFindings', () => {
  it('should sort by severity (error > warning > info)', () => {
    const findings: Finding[] = [
      { severity: 'info', file: 'a.ts', message: 'Info', sourceAgent: 'test' },
      { severity: 'error', file: 'a.ts', message: 'Error', sourceAgent: 'test' },
      { severity: 'warning', file: 'a.ts', message: 'Warning', sourceAgent: 'test' },
    ];

    const sorted = sortFindings(findings);
    expect(sorted[0]?.severity).toBe('error');
    expect(sorted[1]?.severity).toBe('warning');
    expect(sorted[2]?.severity).toBe('info');
  });

  it('should sort by file within same severity', () => {
    const findings: Finding[] = [
      { severity: 'error', file: 'c.ts', message: 'C', sourceAgent: 'test' },
      { severity: 'error', file: 'a.ts', message: 'A', sourceAgent: 'test' },
      { severity: 'error', file: 'b.ts', message: 'B', sourceAgent: 'test' },
    ];

    const sorted = sortFindings(findings);
    expect(sorted[0]?.file).toBe('a.ts');
    expect(sorted[1]?.file).toBe('b.ts');
    expect(sorted[2]?.file).toBe('c.ts');
  });

  it('should sort by line within same file', () => {
    const findings: Finding[] = [
      { severity: 'error', file: 'a.ts', line: 30, message: '30', sourceAgent: 'test' },
      { severity: 'error', file: 'a.ts', line: 10, message: '10', sourceAgent: 'test' },
      { severity: 'error', file: 'a.ts', line: 20, message: '20', sourceAgent: 'test' },
    ];

    const sorted = sortFindings(findings);
    expect(sorted[0]?.line).toBe(10);
    expect(sorted[1]?.line).toBe(20);
    expect(sorted[2]?.line).toBe(30);
  });
});

describe('countBySeverity', () => {
  it('should count findings by severity', () => {
    const findings: Finding[] = [
      { severity: 'error', file: 'a.ts', message: 'E1', sourceAgent: 'test' },
      { severity: 'error', file: 'a.ts', message: 'E2', sourceAgent: 'test' },
      { severity: 'warning', file: 'a.ts', message: 'W1', sourceAgent: 'test' },
      { severity: 'info', file: 'a.ts', message: 'I1', sourceAgent: 'test' },
    ];

    const counts = countBySeverity(findings);
    expect(counts.error).toBe(2);
    expect(counts.warning).toBe(1);
    expect(counts.info).toBe(1);
  });

  it('should return zeros for empty array', () => {
    const counts = countBySeverity([]);
    expect(counts.error).toBe(0);
    expect(counts.warning).toBe(0);
    expect(counts.info).toBe(0);
  });
});

describe('renderPartialFindingsSection (FR-007)', () => {
  it('should return empty string for no partial findings', () => {
    const result = renderPartialFindingsSection([]);
    expect(result).toBe('');
  });

  it('should render section header and disclaimer', () => {
    const findings: Finding[] = [
      {
        severity: 'warning',
        file: 'src/app.ts',
        line: 10,
        message: 'Test warning',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      },
    ];

    const result = renderPartialFindingsSection(findings);
    expect(result).toContain('## ⚠️ Partial Findings (from failed agents)');
    expect(result).toContain('agents that did not complete successfully');
    expect(result).toContain('do NOT affect gating');
  });

  it('should show severity counts', () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'a.ts',
        message: 'Error',
        sourceAgent: 'test',
        provenance: 'partial',
      },
      {
        severity: 'warning',
        file: 'b.ts',
        message: 'Warning',
        sourceAgent: 'test',
        provenance: 'partial',
      },
    ];

    const result = renderPartialFindingsSection(findings);
    expect(result).toContain('🔴 Errors | 1');
    expect(result).toContain('🟡 Warnings | 1');
  });

  it('should include sourceAgent in output', () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/app.ts',
        line: 42,
        message: 'Security issue',
        sourceAgent: 'semgrep',
        provenance: 'partial',
      },
    ];

    const result = renderPartialFindingsSection(findings);
    expect(result).toContain('🛡'); // semgrep icon
    expect(result).toContain('(line 42)');
    expect(result).toContain('Security issue');
  });
});
