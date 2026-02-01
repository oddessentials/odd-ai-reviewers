/**
 * Validation Report Tests
 *
 * Feature 015: Config Wizard & Validation
 * Tests for validation report formatting and output.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  formatValidationReport,
  printValidationReport,
  type ValidationReport,
} from '../cli/validation-report.js';
import type { PreflightResult } from '../phases/preflight.js';
import type { ResolvedConfigTuple } from '../config/providers.js';

/**
 * Create a mock ResolvedConfigTuple for testing.
 * Provides defaults for required fields like schemaVersion and resolutionVersion.
 */
function createMockResolved(
  overrides: Partial<ResolvedConfigTuple> & Pick<ResolvedConfigTuple, 'provider' | 'model'>
): ResolvedConfigTuple {
  return {
    schemaVersion: 1,
    resolutionVersion: 1,
    keySource: null,
    configSource: 'file',
    ...overrides,
  };
}

describe('formatValidationReport', () => {
  // T026: formatValidationReport categorizes errors vs warnings
  describe('T026: categorizes errors vs warnings', () => {
    it('should keep errors and warnings separate based on preflight output', () => {
      const preflightResult: PreflightResult = {
        valid: false,
        errors: ['Missing required API key', 'Invalid provider configuration'],
        warnings: ['Legacy key format detected'],
        resolved: undefined,
      };

      const report = formatValidationReport(preflightResult);

      expect(report.errors).toHaveLength(2);
      expect(report.warnings).toHaveLength(1);
      expect(report.errors).toContain('Missing required API key');
      expect(report.errors).toContain('Invalid provider configuration');
      expect(report.warnings).toContain('Legacy key format detected');
      expect(report.valid).toBe(false);
    });

    it('should set valid=true when no errors (only warnings)', () => {
      const preflightResult: PreflightResult = {
        valid: true,
        errors: [],
        warnings: ['Minor issue'],
        resolved: createMockResolved({
          provider: 'openai',
          model: 'gpt-4o',
          keySource: 'OPENAI_API_KEY',
        }),
      };

      const report = formatValidationReport(preflightResult);

      expect(report.errors).toHaveLength(0);
      expect(report.warnings).toHaveLength(1);
      expect(report.valid).toBe(true);
    });

    it('should preserve resolved tuple from preflight result', () => {
      const resolved = createMockResolved({
        provider: 'azure-openai',
        model: 'my-deployment',
        keySource: 'AZURE_OPENAI_API_KEY',
      });
      const preflightResult: PreflightResult = {
        valid: true,
        errors: [],
        warnings: [],
        resolved,
      };

      const report = formatValidationReport(preflightResult);

      expect(report.resolved).toEqual(resolved);
    });

    // T007 integration test: PreflightResult.warnings → ValidationReport.warnings
    it('should include warnings from PreflightResult.warnings array (FR-020)', () => {
      const preflightResult: PreflightResult = {
        valid: true,
        errors: [],
        warnings: [
          'Neither GitHub nor ADO environment detected. Checked: GITHUB_ACTIONS, TF_BUILD, SYSTEM_TEAMFOUNDATIONCOLLECTIONURI',
        ],
        resolved: createMockResolved({
          provider: 'openai',
          model: 'gpt-4o',
          keySource: 'OPENAI_API_KEY',
        }),
      };

      const report = formatValidationReport(preflightResult);

      expect(report.warnings).toHaveLength(1);
      expect(report.warnings).toContain(
        'Neither GitHub nor ADO environment detected. Checked: GITHUB_ACTIONS, TF_BUILD, SYSTEM_TEAMFOUNDATIONCOLLECTIONURI'
      );
      expect(report.errors).toHaveLength(0);
      expect(report.valid).toBe(true);
    });

    it('should include only PreflightResult.warnings as warnings', () => {
      const preflightResult: PreflightResult = {
        valid: false,
        errors: ['WARNING: Legacy config format'],
        warnings: ['Platform environment not detected'],
        resolved: createMockResolved({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          keySource: 'ANTHROPIC_API_KEY',
        }),
      };

      const report = formatValidationReport(preflightResult);

      expect(report.warnings).toHaveLength(1);
      expect(report.warnings).toContain('Platform environment not detected');
      expect(report.errors).toHaveLength(1);
      expect(report.errors).toContain('WARNING: Legacy config format');
      expect(report.valid).toBe(false);
    });
  });
});

describe('printValidationReport', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // T027: printValidationReport outputs errors to stderr
  describe('T027: outputs errors to stderr', () => {
    it('should output errors to stderr with error prefix', () => {
      const report: ValidationReport = {
        errors: ['Missing API key', 'Invalid configuration'],
        warnings: [],
        info: [],
        valid: false,
      };

      printValidationReport(report);

      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ ERROR: Missing API key');
      expect(consoleErrorSpy).toHaveBeenCalledWith('✗ ERROR: Invalid configuration');
    });

    it('should output warnings to stderr with warning prefix', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: ['Legacy config format', 'Deprecated field'],
        info: [],
        resolved: createMockResolved({
          provider: 'openai',
          model: 'gpt-4o',
          keySource: 'OPENAI_API_KEY',
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleErrorSpy).toHaveBeenCalledWith('⚠ WARNING: Legacy config format');
      expect(consoleErrorSpy).toHaveBeenCalledWith('⚠ WARNING: Deprecated field');
    });

    it('should output failure summary to stderr when invalid', () => {
      const report: ValidationReport = {
        errors: ['Error 1', 'Error 2', 'Error 3'],
        warnings: [],
        info: [],
        valid: false,
      };

      printValidationReport(report);

      expect(consoleErrorSpy).toHaveBeenCalledWith('\nValidation failed with 3 error(s).');
    });
  });

  // T028: printValidationReport shows resolved tuple on success
  describe('T028: shows resolved tuple on success', () => {
    it('should output success message to stdout when valid', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: 'openai',
          model: 'gpt-4o',
          keySource: 'OPENAI_API_KEY',
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Configuration valid');
    });

    it('should output success with warnings message when valid with warnings', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: ['Minor warning'],
        info: [],
        resolved: createMockResolved({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          keySource: 'ANTHROPIC_API_KEY',
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('✓ Configuration valid (with warnings)');
    });

    it('should display resolved provider', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: 'openai',
          model: 'gpt-4o',
          keySource: 'OPENAI_API_KEY',
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('  Provider: openai');
    });

    it('should display resolved model', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: 'anthropic',
          model: 'claude-sonnet-4-20250514',
          keySource: 'ANTHROPIC_API_KEY',
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('  Model: claude-sonnet-4-20250514');
    });

    it('should display key source', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: 'azure-openai',
          model: 'my-deployment',
          keySource: 'AZURE_OPENAI_API_KEY',
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('  Key source: AZURE_OPENAI_API_KEY');
    });

    it('should display config source', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: 'ollama',
          model: 'codellama:7b',
          keySource: null,
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('  Config source: file');
    });

    it('should show (not set) for missing key source', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: 'ollama',
          model: 'codellama:7b',
          keySource: null,
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('  Key source: (not set)');
    });

    it('should handle null provider', () => {
      const report: ValidationReport = {
        errors: [],
        warnings: [],
        info: [],
        resolved: createMockResolved({
          provider: null,
          model: 'some-model',
          keySource: null,
        }),
        valid: true,
      };

      printValidationReport(report);

      expect(consoleLogSpy).toHaveBeenCalledWith('  Provider: none');
    });
  });
});
