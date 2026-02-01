/**
 * Terminal Reporter SARIF Output Tests (T062)
 *
 * Tests for SARIF 2.1.0 output format including schema validation.
 * Verifies FR-SCH-002: SARIF output includes $schema reference
 */

import { describe, it, expect } from 'vitest';
import type { Finding } from '../../../src/agents/types.js';
import type { TerminalContext, SarifOutput } from '../../../src/report/terminal.js';
import {
  generateSarifOutput,
  SARIF_SCHEMA_URL,
  TOOL_NAME,
  TOOL_INFO_URI,
} from '../../../src/report/terminal.js';

// =============================================================================
// Test Fixtures
// =============================================================================

function createTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'error',
    file: 'src/example.ts',
    line: 10,
    message: 'Test error message',
    sourceAgent: 'test-agent',
    ...overrides,
  };
}

function createTestContext(overrides: Partial<TerminalContext> = {}): TerminalContext {
  return {
    colored: false,
    verbose: false,
    quiet: false,
    format: 'sarif',
    showProgress: true,
    showCost: true,
    version: '1.2.3',
    ...overrides,
  };
}

// =============================================================================
// SARIF Output Tests
// =============================================================================

describe('SARIF Output', () => {
  describe('Schema Reference (FR-SCH-002)', () => {
    it('should include $schema field', () => {
      const findings = [createTestFinding()];
      const context = createTestContext();

      const sarifStr = generateSarifOutput(findings, context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.$schema).toBeDefined();
      expect(typeof output.$schema).toBe('string');
    });

    it('should reference SARIF 2.1.0 schema URL', () => {
      const findings = [createTestFinding()];
      const context = createTestContext();

      const sarifStr = generateSarifOutput(findings, context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.$schema).toBe(SARIF_SCHEMA_URL);
      expect(output.$schema).toContain('sarif-schema-2.1.0');
    });

    it('should have version 2.1.0', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.version).toBe('2.1.0');
    });
  });

  describe('Tool Driver', () => {
    it('should include tool name', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.tool.driver.name).toBe(TOOL_NAME);
      expect(output.runs[0]?.tool.driver.name).toBe('odd-ai-reviewers');
    });

    it('should include tool version from context', () => {
      const context = createTestContext({ version: '2.5.0' });

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.tool.driver.version).toBe('2.5.0');
    });

    it('should use fallback version when not provided', () => {
      const context = createTestContext({ version: undefined });

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.tool.driver.version).toBe('0.0.0');
    });

    it('should include information URI', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.tool.driver.informationUri).toBe(TOOL_INFO_URI);
    });

    it('should have empty rules array (by design)', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      // Rules array intentionally empty - AI agents don't have static rule IDs
      expect(output.runs[0]?.tool.driver.rules).toEqual([]);
    });
  });

  describe('Results Mapping', () => {
    it('should map findings to results', () => {
      const findings = [
        createTestFinding({ message: 'First issue' }),
        createTestFinding({ message: 'Second issue' }),
      ];
      const context = createTestContext();

      const sarifStr = generateSarifOutput(findings, context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results).toHaveLength(2);
    });

    it('should map error severity to error level', () => {
      const finding = createTestFinding({ severity: 'error' });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.level).toBe('error');
    });

    it('should map warning severity to warning level', () => {
      const finding = createTestFinding({ severity: 'warning' });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.level).toBe('warning');
    });

    it('should map info severity to note level', () => {
      const finding = createTestFinding({ severity: 'info' });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.level).toBe('note');
    });
  });

  describe('Rule ID Mapping', () => {
    it('should use ruleId when present', () => {
      const finding = createTestFinding({ ruleId: 'no-unused-vars' });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.ruleId).toBe('no-unused-vars');
    });

    it('should fall back to sourceAgent when ruleId not present', () => {
      const finding = createTestFinding({
        ruleId: undefined,
        sourceAgent: 'my-agent',
      });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.ruleId).toBe('my-agent');
    });
  });

  describe('Message Mapping', () => {
    it('should include message text', () => {
      const finding = createTestFinding({
        message: 'Variable is not used',
      });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.message.text).toBe('Variable is not used');
    });
  });

  describe('Location Mapping', () => {
    it('should include file path as artifact URI', () => {
      const finding = createTestFinding({ file: 'src/components/Button.tsx' });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      const location = output.runs[0]?.results[0]?.locations[0];
      expect(location?.physicalLocation.artifactLocation.uri).toBe('src/components/Button.tsx');
    });

    it('should include start line', () => {
      const finding = createTestFinding({ line: 42 });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      const location = output.runs[0]?.results[0]?.locations[0];
      expect(location?.physicalLocation.region.startLine).toBe(42);
    });

    it('should include end line when present', () => {
      const finding = createTestFinding({ line: 42, endLine: 50 });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      const location = output.runs[0]?.results[0]?.locations[0];
      expect(location?.physicalLocation.region.endLine).toBe(50);
    });

    it('should use line 1 as fallback when line not specified', () => {
      const finding = createTestFinding({ line: undefined });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      const location = output.runs[0]?.results[0]?.locations[0];
      expect(location?.physicalLocation.region.startLine).toBe(1);
    });
  });

  describe('Fixes Mapping', () => {
    it('should include fix when suggestion present', () => {
      const finding = createTestFinding({
        suggestion: 'Remove the unused variable',
      });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.fixes).toBeDefined();
      expect(output.runs[0]?.results[0]?.fixes?.[0]?.description.text).toBe(
        'Remove the unused variable'
      );
    });

    it('should not include fixes when suggestion not present', () => {
      const finding = createTestFinding({ suggestion: undefined });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.fixes).toBeUndefined();
    });
  });

  describe('Properties Mapping', () => {
    it('should include sourceAgent in properties', () => {
      const finding = createTestFinding({ sourceAgent: 'semgrep' });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.properties?.['sourceAgent']).toBe('semgrep');
    });
  });

  describe('Output Format', () => {
    it('should produce valid JSON', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);

      expect(() => JSON.parse(sarifStr)).not.toThrow();
    });

    it('should have exactly one run', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs).toHaveLength(1);
    });

    it('should handle empty findings', () => {
      const context = createTestContext();

      const sarifStr = generateSarifOutput([], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results).toEqual([]);
    });

    it('should handle special characters in messages', () => {
      const finding = createTestFinding({
        message: 'Error: "unexpected" <token> & symbol',
      });
      const context = createTestContext();

      const sarifStr = generateSarifOutput([finding], context);
      const output = JSON.parse(sarifStr) as SarifOutput;

      expect(output.runs[0]?.results[0]?.message.text).toBe('Error: "unexpected" <token> & symbol');
    });
  });
});
