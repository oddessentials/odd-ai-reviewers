/**
 * Sanitization Tests
 *
 * Tests for defense-in-depth finding sanitization.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeFinding, sanitizeFindings } from '../report/sanitize.js';
import type { Finding } from '../agents/types.js';

describe('sanitizeFinding', () => {
  const baseFinding: Finding = {
    severity: 'error',
    file: 'test.ts',
    line: 10,
    message: 'Test finding',
    sourceAgent: 'test',
  };

  describe('HTML entity escaping', () => {
    it('should escape < and > characters', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Use <script> tags for XSS',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('Use &lt;script&gt; tags for XSS');
    });

    it('should escape ampersands', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Use &amp; for ampersand',
      };

      const result = sanitizeFinding(finding);

      // Double-escaped because input contains &amp;
      expect(result.message).toBe('Use &amp;amp; for ampersand');
    });

    it('should escape HTML in suggestions', () => {
      const finding: Finding = {
        ...baseFinding,
        suggestion: 'Replace <div> with <span>',
      };

      const result = sanitizeFinding(finding);

      expect(result.suggestion).toBe('Replace &lt;div&gt; with &lt;span&gt;');
    });

    it('should escape double quotes', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Use "quoted" string',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('Use &quot;quoted&quot; string');
    });

    it('should escape single quotes', () => {
      const finding: Finding = {
        ...baseFinding,
        message: "Use 'quoted' string",
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('Use &#x27;quoted&#x27; string');
    });
  });

  describe('null byte removal', () => {
    it('should remove null bytes from message', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Message\0with\0nulls',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('Messagewithnulls');
    });

    it('should remove null bytes from suggestion', () => {
      const finding: Finding = {
        ...baseFinding,
        suggestion: 'Fix\0this',
      };

      const result = sanitizeFinding(finding);

      expect(result.suggestion).toBe('Fixthis');
    });
  });

  describe('length truncation', () => {
    it('should truncate long messages to 4000 chars', () => {
      const longMessage = 'x'.repeat(5000);
      const finding: Finding = {
        ...baseFinding,
        message: longMessage,
      };

      const result = sanitizeFinding(finding);

      expect(result.message.length).toBe(4000);
      expect(result.message.endsWith('...')).toBe(true);
    });

    it('should truncate long suggestions to 2000 chars', () => {
      const longSuggestion = 'y'.repeat(3000);
      const finding: Finding = {
        ...baseFinding,
        suggestion: longSuggestion,
      };

      const result = sanitizeFinding(finding);

      expect(result.suggestion?.length).toBe(2000);
      expect(result.suggestion?.endsWith('...')).toBe(true);
    });

    it('should truncate rule IDs to 200 chars', () => {
      const longRuleId = 'rule/'.repeat(100);
      const finding: Finding = {
        ...baseFinding,
        ruleId: longRuleId,
      };

      const result = sanitizeFinding(finding);

      expect(result.ruleId?.length).toBe(200);
    });
  });

  describe('preserves other fields', () => {
    it('should preserve severity, file, line, sourceAgent', () => {
      const finding: Finding = {
        severity: 'warning',
        file: 'src/index.ts',
        line: 42,
        endLine: 50,
        message: 'Test message',
        sourceAgent: 'semgrep',
        fingerprint: 'abc123',
      };

      const result = sanitizeFinding(finding);

      expect(result.severity).toBe('warning');
      expect(result.file).toBe('src/index.ts');
      expect(result.line).toBe(42);
      expect(result.endLine).toBe(50);
      expect(result.sourceAgent).toBe('semgrep');
      expect(result.fingerprint).toBe('abc123');
    });
  });

  describe('handles edge cases', () => {
    it('should handle undefined suggestion', () => {
      const finding: Finding = {
        ...baseFinding,
        suggestion: undefined,
      };

      const result = sanitizeFinding(finding);

      expect(result.suggestion).toBeUndefined();
    });

    it('should handle empty message', () => {
      const finding: Finding = {
        ...baseFinding,
        message: '',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('');
    });

    it('should handle null values gracefully', () => {
      const finding: Finding = {
        ...baseFinding,
        message: null as unknown as string,
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('');
    });

    it('should handle number values gracefully', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 42 as unknown as string,
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toBe('42');
    });
  });

  describe('XSS URL scheme blocking', () => {
    it('should block javascript: URLs', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Click here: javascript:alert(1)',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toContain('javascript-blocked:');
      expect(result.message).not.toContain('javascript:alert');
    });

    it('should block data: URLs', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Image: data:text/html,<script>alert(1)</script>',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toContain('data-blocked:');
      expect(result.message).not.toContain('data:text');
    });

    it('should block vbscript: URLs', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'Run: vbscript:MsgBox(1)',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).toContain('vbscript-blocked:');
    });

    it('should block case-insensitive URL schemes', () => {
      const finding: Finding = {
        ...baseFinding,
        message: 'JAVASCRIPT:alert(1) and JavaScript:alert(2)',
      };

      const result = sanitizeFinding(finding);

      expect(result.message).not.toMatch(/javascript:/i);
      expect(result.message).toContain('javascript-blocked:');
    });
  });
});

describe('sanitizeFindings', () => {
  it('should sanitize all findings in array', () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'a.ts',
        message: '<script>alert(1)</script>',
        sourceAgent: 'test',
      },
      {
        severity: 'warning',
        file: 'b.ts',
        message: 'Normal message',
        sourceAgent: 'test',
      },
    ];

    const results = sanitizeFindings(findings);

    expect(results).toHaveLength(2);
    expect(results[0]?.message).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(results[1]?.message).toBe('Normal message');
  });

  it('should handle empty array', () => {
    const results = sanitizeFindings([]);
    expect(results).toEqual([]);
  });
});
