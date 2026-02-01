/**
 * Validation Report Module
 *
 * Feature 015: Config Wizard & Validation
 * Converts PreflightResult to structured ValidationReport with severity categorization.
 * Provides formatted console output for validation results.
 *
 * Exit code semantics (per spec FR-015):
 * - Exit 1: Errors present (validation failed)
 * - Exit 0: Warnings only (validation passed with notes)
 * - Exit 0: Success (validation passed)
 *
 * @module validation-report
 * @see {@link ../../../specs/015-config-wizard-validate/spec.md} Feature specification
 */

import type { PreflightResult } from '../phases/preflight.js';
import type { ResolvedConfigTuple } from '../config/providers.js';

/**
 * Structured validation report with severity categorization.
 *
 * Categorizes preflight check messages into three severity levels:
 * - **errors**: Critical issues that prevent execution (exit 1)
 * - **warnings**: Non-blocking issues that should be reviewed (exit 0)
 * - **info**: Informational messages for context (exit 0)
 *
 * @example
 * ```typescript
 * const report: ValidationReport = {
 *   errors: ['Missing OPENAI_API_KEY'],
 *   warnings: ['WARNING: Legacy key format detected'],
 *   info: [],
 *   resolved: { provider: 'openai', model: 'gpt-4o', ... },
 *   valid: false,
 * };
 * ```
 */
export interface ValidationReport {
  /** Errors that block execution (exit code 1) */
  errors: string[];
  /** Warnings that should be reviewed but don't block (exit code 0) */
  warnings: string[];
  /** Informational messages for context (exit code 0) */
  info: string[];
  /** Resolved configuration tuple on success (provider, model, key source) */
  resolved?: ResolvedConfigTuple;
  /** Overall validation status - true if no errors (warnings allowed) */
  valid: boolean;
}

/**
 * Convert PreflightResult to ValidationReport with severity categorization.
 *
 * Categorizes messages based on source:
 * - result.errors → errors array
 * - result.warnings → warnings array
 *
 * The `valid` field is true only when there are no errors (warnings are allowed).
 *
 * @param result - PreflightResult from runPreflightChecks()
 * @returns ValidationReport with categorized messages and resolved config tuple
 *
 * @example
 * ```typescript
 * const preflight = runPreflightChecks(config, context, env);
 * const report = formatValidationReport(preflight);
 *
 * if (report.valid) {
 *   console.log('Config is valid');
 * } else {
 *   console.log(`${report.errors.length} errors found`);
 * }
 * ```
 */
export function formatValidationReport(result: PreflightResult): ValidationReport {
  const errors = [...result.errors];
  const warnings = result.warnings ? [...result.warnings] : [];

  return {
    errors,
    warnings,
    info: [],
    resolved: result.resolved,
    valid: errors.length === 0,
  };
}

/**
 * Print validation report to console with formatted output.
 *
 * Output format and destinations:
 * - Errors: "✗ ERROR: <message>" → stderr
 * - Warnings: "⚠ WARNING: <message>" → stderr
 * - Success: "✓ Configuration valid" → stdout
 * - Resolved tuple details (provider, model, key source) → stdout
 *
 * When validation fails (errors present), shows error count in summary.
 * When validation passes with warnings, shows "(with warnings)" suffix.
 *
 * @param report - ValidationReport to print
 *
 * @example
 * ```typescript
 * const report = formatValidationReport(preflightResult);
 * printValidationReport(report);
 *
 * // Output on success:
 * // ✓ Configuration valid
 * //   Provider: openai
 * //   Model: gpt-4o
 * //   Key source: OPENAI_API_KEY
 * //   Config source: .ai-review.yml
 *
 * // Output on failure:
 * // ✗ ERROR: Missing OPENAI_API_KEY
 * // Validation failed with 1 error(s).
 * ```
 */
export function printValidationReport(report: ValidationReport): void {
  // Print errors to stderr
  for (const err of report.errors) {
    console.error(`✗ ERROR: ${err}`);
  }

  // Print warnings to stderr
  for (const warn of report.warnings) {
    console.error(`⚠ WARNING: ${warn}`);
  }

  // Print status and resolved tuple
  if (report.valid) {
    const status =
      report.warnings.length > 0
        ? '✓ Configuration valid (with warnings)'
        : '✓ Configuration valid';
    console.log(status);

    if (report.resolved) {
      console.log(`  Provider: ${report.resolved.provider ?? 'none'}`);
      console.log(`  Model: ${report.resolved.model}`);
      console.log(`  Key source: ${report.resolved.keySource ?? '(not set)'}`);
      console.log(`  Config source: ${report.resolved.configSource}`);
    }
  } else {
    console.error(`\nValidation failed with ${report.errors.length} error(s).`);
  }
}
