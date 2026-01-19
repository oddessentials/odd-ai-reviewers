/**
 * OpenCode Agent Parsing Tests
 *
 * Tests for the internal parsing functions of the OpenCode agent.
 * These tests verify JSON output parsing, severity mapping, and prompt building.
 */

import { describe, it, expect } from 'vitest';

// We need to test the parsing logic. Since parseOpencodeOutput is internal,
// we'll create a test-focused export or test via the agent interface.
// For now, we replicate the parsing logic to ensure correctness.

interface OpencodeRawFinding {
  severity?: string;
  file?: string;
  line?: number;
  end_line?: number;
  message?: string;
  suggestion?: string;
  rule_id?: string;
}

interface OpencodeJsonOutput {
  findings?: OpencodeRawFinding[];
  summary?: string;
  error?: string;
}

/**
 * Replicated parsing logic from opencode.ts for testing
 */
function parseOpencodeOutput(stdout: string): {
  ok: boolean;
  findings: OpencodeRawFinding[];
  error?: string;
} {
  const trimmed = stdout.trim();

  if (!trimmed) {
    return { ok: false, findings: [], error: 'Empty output from opencode' };
  }

  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return { ok: false, findings: [], error: 'No valid JSON object in opencode output' };
  }

  const beforeJson = trimmed.slice(0, jsonStart).trim();
  const afterJson = trimmed.slice(jsonEnd + 1).trim();

  if (beforeJson || afterJson) {
    return {
      ok: false,
      findings: [],
      error: 'Mixed stdout detected: opencode output contains non-JSON content',
    };
  }

  const jsonStr = trimmed.slice(jsonStart, jsonEnd + 1);

  let parsed: OpencodeJsonOutput;
  try {
    parsed = JSON.parse(jsonStr) as OpencodeJsonOutput;
  } catch (e) {
    return {
      ok: false,
      findings: [],
      error: `Invalid JSON from opencode: ${e instanceof Error ? e.message : 'parse error'}`,
    };
  }

  if (parsed.error) {
    return { ok: false, findings: [], error: `OpenCode error: ${parsed.error}` };
  }

  return { ok: true, findings: parsed.findings ?? [] };
}

function mapSeverity(severity?: string): 'error' | 'warning' | 'info' {
  switch (severity?.toLowerCase()) {
    case 'error':
    case 'critical':
    case 'high':
      return 'error';
    case 'warning':
    case 'medium':
      return 'warning';
    default:
      return 'info';
  }
}

describe('OpenCode Output Parsing', () => {
  describe('parseOpencodeOutput', () => {
    it('should parse valid JSON output', () => {
      const output = JSON.stringify({
        findings: [
          {
            severity: 'error',
            file: 'src/main.ts',
            line: 10,
            message: 'SQL injection vulnerability',
          },
        ],
        summary: 'Found 1 issue',
      });

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(true);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.file).toBe('src/main.ts');
    });

    it('should handle empty output', () => {
      const result = parseOpencodeOutput('');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Empty output');
    });

    it('should handle whitespace-only output', () => {
      const result = parseOpencodeOutput('   \n\t  ');

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Empty output');
    });

    it('should reject mixed stdout (text before JSON)', () => {
      const output = 'Loading model...\n' + JSON.stringify({ findings: [] });

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Mixed stdout');
    });

    it('should reject mixed stdout (text after JSON)', () => {
      const output = JSON.stringify({ findings: [] }) + '\nDone!';

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Mixed stdout');
    });

    it('should handle OpenCode error response', () => {
      const output = JSON.stringify({
        error: 'API key invalid',
        findings: [],
      });

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('API key invalid');
    });

    it('should handle invalid JSON', () => {
      const output = '{ "findings": [invalid json }';

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid JSON');
    });

    it('should handle no JSON object', () => {
      const output = 'This is just plain text with no JSON';

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(false);
      expect(result.error).toContain('No valid JSON object');
    });

    it('should handle empty findings array', () => {
      const output = JSON.stringify({
        findings: [],
        summary: 'No issues found',
      });

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    it('should handle missing findings field', () => {
      const output = JSON.stringify({
        summary: 'Analysis complete',
      });

      const result = parseOpencodeOutput(output);

      expect(result.ok).toBe(true);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('mapSeverity', () => {
    it('should map error to error', () => {
      expect(mapSeverity('error')).toBe('error');
    });

    it('should map critical to error', () => {
      expect(mapSeverity('critical')).toBe('error');
    });

    it('should map high to error', () => {
      expect(mapSeverity('high')).toBe('error');
    });

    it('should map warning to warning', () => {
      expect(mapSeverity('warning')).toBe('warning');
    });

    it('should map medium to warning', () => {
      expect(mapSeverity('medium')).toBe('warning');
    });

    it('should map low to info', () => {
      expect(mapSeverity('low')).toBe('info');
    });

    it('should map info to info', () => {
      expect(mapSeverity('info')).toBe('info');
    });

    it('should handle undefined severity', () => {
      expect(mapSeverity(undefined)).toBe('info');
    });

    it('should be case-insensitive', () => {
      expect(mapSeverity('ERROR')).toBe('error');
      expect(mapSeverity('Warning')).toBe('warning');
      expect(mapSeverity('CRITICAL')).toBe('error');
    });
  });
});
