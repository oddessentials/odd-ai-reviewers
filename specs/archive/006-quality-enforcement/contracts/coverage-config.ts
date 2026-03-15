/**
 * Coverage Configuration Contract
 *
 * Defines the schema for coverage threshold configuration.
 * Single source of truth: vitest.config.ts
 *
 * @see FR-002, FR-005, FR-005a
 */

import { z } from 'zod';

/**
 * Coverage mode determined by environment
 */
export const CoverageMode = z.enum(['ci', 'local']);
export type CoverageMode = z.infer<typeof CoverageMode>;

/**
 * Coverage threshold values (percentages 0-100)
 */
export const CoverageThreshold = z.object({
  /** Minimum statement coverage percentage */
  statements: z.number().min(0).max(100),

  /** Minimum branch coverage percentage */
  branches: z.number().min(0).max(100),

  /** Minimum function coverage percentage */
  functions: z.number().min(0).max(100),

  /** Minimum line coverage percentage */
  lines: z.number().min(0).max(100),
});

export type CoverageThreshold = z.infer<typeof CoverageThreshold>;

/**
 * Complete coverage configuration
 */
export const CoverageConfig = z.object({
  /** Coverage provider (fixed to v8) */
  provider: z.literal('v8'),

  /** Output report formats */
  reporter: z.array(z.string()),

  /** Directory for coverage reports */
  reportsDirectory: z.string(),

  /** Source file patterns to include */
  include: z.array(z.string()),

  /** Patterns to exclude from coverage */
  exclude: z.array(z.string()),

  /** Active coverage thresholds */
  thresholds: CoverageThreshold,
});

export type CoverageConfig = z.infer<typeof CoverageConfig>;

/**
 * Threshold pair for CI and local environments
 */
export const ThresholdPair = z
  .object({
    ci: CoverageThreshold,
    local: CoverageThreshold,
  })
  .refine(
    (data) =>
      data.ci.statements >= data.local.statements &&
      data.ci.branches >= data.local.branches &&
      data.ci.functions >= data.local.functions &&
      data.ci.lines >= data.local.lines,
    {
      message: 'CI thresholds must be >= local thresholds',
    }
  );

export type ThresholdPair = z.infer<typeof ThresholdPair>;

/**
 * Determine coverage mode from environment
 *
 * @returns 'ci' if process.env.CI === 'true', otherwise 'local'
 */
export function detectCoverageMode(): CoverageMode {
  return process.env['CI'] === 'true' ? 'ci' : 'local';
}

/**
 * Select appropriate thresholds based on environment
 *
 * @param pair - CI and local threshold definitions
 * @returns Active thresholds for current environment
 */
export function selectThresholds(pair: ThresholdPair): CoverageThreshold {
  const mode = detectCoverageMode();
  return mode === 'ci' ? pair.ci : pair.local;
}

/**
 * Log active coverage configuration at test start
 *
 * Per FR-005a: CI MAY print active thresholds for reviewer confirmation
 */
export function logActiveConfig(mode: CoverageMode, thresholds: CoverageThreshold): void {
  console.log(`[coverage] mode=${mode}`);
  console.log(
    `[coverage] thresholds: statements=${thresholds.statements}%, branches=${thresholds.branches}%, functions=${thresholds.functions}%, lines=${thresholds.lines}%`
  );
}
