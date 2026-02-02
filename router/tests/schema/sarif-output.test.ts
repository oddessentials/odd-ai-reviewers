/**
 * Schema Compliance Tests: SARIF Output Format
 *
 * PR_LESSONS_LEARNED.md Requirement #6: Always version your output schemas
 *
 * SARIF (Static Analysis Results Interchange Format) is a standard format
 * for static analysis tool output. This test verifies our SARIF output
 * conforms to SARIF 2.1.0 specification.
 *
 * @see https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 * @module tests/schema/sarif-output
 */

import { describe, it, expect } from 'vitest';
import type { Finding } from '../../src/agents/types.js';
import {
  generateSarifOutput,
  createDefaultContext,
  SARIF_SCHEMA_URL,
  TOOL_NAME,
  TOOL_INFO_URI,
} from '../../src/report/terminal.js';

/**
 * Create mock findings for SARIF testing
 */
function createMockFindings(): Finding[] {
  return [
    {
      file: 'src/main.ts',
      line: 10,
      endLine: 15,
      message: 'SQL injection vulnerability detected',
      severity: 'error',
      sourceAgent: 'security-scanner',
      suggestion: 'Use parameterized queries',
      ruleId: 'sql-injection',
    },
    {
      file: 'src/utils.ts',
      line: 25,
      message: 'Unused variable declaration',
      severity: 'warning',
      sourceAgent: 'style-checker',
    },
    {
      file: 'src/config.ts',
      line: 5,
      message: 'Consider adding JSDoc comment',
      severity: 'info',
      sourceAgent: 'docs-checker',
    },
  ];
}

describe('T128: SARIF Output Schema Compliance', () => {
  describe('Top-Level Structure', () => {
    it('should include $schema field with correct URL', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('$schema');
      expect(parsed.$schema).toBe(SARIF_SCHEMA_URL);
      expect(parsed.$schema).toContain('sarif-schema-2.1.0');
    });

    it('should include version field set to 2.1.0', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('version');
      expect(parsed.version).toBe('2.1.0');
    });

    it('should include runs array', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('runs');
      expect(Array.isArray(parsed.runs)).toBe(true);
      expect(parsed.runs.length).toBeGreaterThan(0);
    });
  });

  describe('Run Structure', () => {
    it('should include tool object with driver', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const run = parsed.runs[0];
      expect(run).toHaveProperty('tool');
      expect(run.tool).toHaveProperty('driver');
    });

    it('should include tool name', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const driver = parsed.runs[0].tool.driver;
      expect(driver).toHaveProperty('name');
      expect(driver.name).toBe(TOOL_NAME);
    });

    it('should include tool version', () => {
      const findings = createMockFindings();
      const context = { ...createDefaultContext(), version: '2.0.0' };

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const driver = parsed.runs[0].tool.driver;
      expect(driver).toHaveProperty('version');
      expect(driver.version).toBe('2.0.0');
    });

    it('should include informationUri', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const driver = parsed.runs[0].tool.driver;
      expect(driver).toHaveProperty('informationUri');
      expect(driver.informationUri).toBe(TOOL_INFO_URI);
    });

    it('should include results array', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const run = parsed.runs[0];
      expect(run).toHaveProperty('results');
      expect(Array.isArray(run.results)).toBe(true);
      expect(run.results).toHaveLength(3);
    });
  });

  describe('Result Structure', () => {
    it('should include ruleId for each result', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const results = parsed.runs[0].results;

      // First finding has ruleId
      expect(results[0]).toHaveProperty('ruleId');
      expect(results[0].ruleId).toBe('sql-injection');

      // Second finding falls back to sourceAgent
      expect(results[1]).toHaveProperty('ruleId');
      expect(results[1].ruleId).toBe('style-checker');
    });

    it('should map severity to SARIF level correctly', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const results = parsed.runs[0].results;

      // error -> error
      expect(results[0].level).toBe('error');
      // warning -> warning
      expect(results[1].level).toBe('warning');
      // info -> note
      expect(results[2].level).toBe('note');
    });

    it('should include message object with text', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const result = parsed.runs[0].results[0];
      expect(result).toHaveProperty('message');
      expect(result.message).toHaveProperty('text');
      expect(result.message.text).toBe('SQL injection vulnerability detected');
    });
  });

  describe('Location Structure', () => {
    it('should include locations array for each result', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const result = parsed.runs[0].results[0];
      expect(result).toHaveProperty('locations');
      expect(Array.isArray(result.locations)).toBe(true);
      expect(result.locations.length).toBeGreaterThan(0);
    });

    it('should include physicalLocation with artifactLocation', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const location = parsed.runs[0].results[0].locations[0];
      expect(location).toHaveProperty('physicalLocation');
      expect(location.physicalLocation).toHaveProperty('artifactLocation');
      expect(location.physicalLocation.artifactLocation).toHaveProperty('uri');
      expect(location.physicalLocation.artifactLocation.uri).toBe('src/main.ts');
    });

    it('should include region with startLine', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const location = parsed.runs[0].results[0].locations[0];
      expect(location.physicalLocation).toHaveProperty('region');
      expect(location.physicalLocation.region).toHaveProperty('startLine');
      expect(location.physicalLocation.region.startLine).toBe(10);
    });

    it('should include endLine when present', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const location = parsed.runs[0].results[0].locations[0];
      expect(location.physicalLocation.region).toHaveProperty('endLine');
      expect(location.physicalLocation.region.endLine).toBe(15);
    });

    it('should omit endLine when not present', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      // Second finding has no endLine
      const location = parsed.runs[0].results[1].locations[0];
      expect(location.physicalLocation.region).not.toHaveProperty('endLine');
    });
  });

  describe('Fixes Structure', () => {
    it('should include fixes when suggestion is present', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      // First finding has suggestion
      const result = parsed.runs[0].results[0];
      expect(result).toHaveProperty('fixes');
      expect(Array.isArray(result.fixes)).toBe(true);
      expect(result.fixes[0]).toHaveProperty('description');
      expect(result.fixes[0].description).toHaveProperty('text');
      expect(result.fixes[0].description.text).toBe('Use parameterized queries');
    });

    it('should omit fixes when no suggestion', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      // Second finding has no suggestion
      const result = parsed.runs[0].results[1];
      expect(result).not.toHaveProperty('fixes');
    });
  });

  describe('Properties (Extensions)', () => {
    it('should include sourceAgent in properties', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);
      const parsed = JSON.parse(output);

      const result = parsed.runs[0].results[0];
      expect(result).toHaveProperty('properties');
      expect(result.properties).toHaveProperty('sourceAgent');
      expect(result.properties.sourceAgent).toBe('security-scanner');
    });
  });

  describe('Empty Cases', () => {
    it('should handle empty findings array', () => {
      const context = createDefaultContext();

      const output = generateSarifOutput([], context);
      const parsed = JSON.parse(output);

      expect(parsed.runs[0].results).toHaveLength(0);
    });
  });

  describe('JSON Validity', () => {
    it('should produce valid JSON', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);

      expect(() => JSON.parse(output)).not.toThrow();
    });

    it('should not have undefined values', () => {
      const findings = createMockFindings();
      const context = createDefaultContext();

      const output = generateSarifOutput(findings, context);

      // JSON.stringify converts undefined to null or omits the key
      // but JSON.parse should not create undefined values
      expect(output).not.toContain('undefined');
    });
  });
});
