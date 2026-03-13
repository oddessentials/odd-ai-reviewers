#!/usr/bin/env npx tsx
/**
 * Benchmark Check Script
 *
 * Validates benchmark scores against minimum thresholds. Reads summary.json
 * from the results directory and compares precision, recall, and F1 against
 * provided thresholds.
 *
 * Usage:
 *   npx tsx scripts/benchmark-check.ts \
 *     --results <path-to-results-dir> \
 *     --min-precision <float> \
 *     --min-recall <float> \
 *     --min-f1 <float>
 *
 * Exit codes:
 *   0 - All metrics pass thresholds
 *   1 - One or more metrics below threshold (regression)
 *   2 - Invalid arguments or missing files
 */

import { parseArgs } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// =============================================================================
// Types
// =============================================================================

export interface BenchmarkSummary {
  precision: number;
  recall: number;
  f1: number;
  tool: string;
  judge_model: string;
  timestamp: string;
}

export interface MetricCheck {
  name: string;
  value: number;
  threshold: number;
  passed: boolean;
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/benchmark-check.ts [options]

Required:
  --results <path>          Path to results directory containing summary.json
  --min-precision <float>   Minimum precision threshold (0.0-1.0)
  --min-recall <float>      Minimum recall threshold (0.0-1.0)
  --min-f1 <float>          Minimum F1 threshold (0.0-1.0)

Optional:
  --help                    Show this help message

Exit codes:
  0 - All metrics pass thresholds
  1 - One or more metrics below threshold (regression)
  2 - Invalid arguments or missing files`);
}

// =============================================================================
// Validation
// =============================================================================

export function validateSummary(data: unknown): BenchmarkSummary {
  if (!data || typeof data !== 'object') {
    throw new Error('summary.json must contain a JSON object');
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj['precision'] !== 'number' || isNaN(obj['precision'])) {
    throw new Error('summary.json: "precision" must be a number');
  }
  if (typeof obj['recall'] !== 'number' || isNaN(obj['recall'])) {
    throw new Error('summary.json: "recall" must be a number');
  }
  if (typeof obj['f1'] !== 'number' || isNaN(obj['f1'])) {
    throw new Error('summary.json: "f1" must be a number');
  }

  return {
    precision: obj['precision'],
    recall: obj['recall'],
    f1: obj['f1'],
    tool: typeof obj['tool'] === 'string' ? obj['tool'] : 'unknown',
    judge_model: typeof obj['judge_model'] === 'string' ? obj['judge_model'] : 'unknown',
    timestamp: typeof obj['timestamp'] === 'string' ? obj['timestamp'] : new Date().toISOString(),
  };
}

// =============================================================================
// Check Logic
// =============================================================================

export function checkMetrics(
  summary: BenchmarkSummary,
  minPrecision: number,
  minRecall: number,
  minF1: number
): MetricCheck[] {
  return [
    {
      name: 'Precision',
      value: summary.precision,
      threshold: minPrecision,
      passed: summary.precision >= minPrecision,
    },
    {
      name: 'Recall',
      value: summary.recall,
      threshold: minRecall,
      passed: summary.recall >= minRecall,
    },
    {
      name: 'F1',
      value: summary.f1,
      threshold: minF1,
      passed: summary.f1 >= minF1,
    },
  ];
}

export function formatResults(checks: MetricCheck[]): string {
  const allPassed = checks.every((c) => c.passed);
  const lines: string[] = [];

  if (allPassed) {
    lines.push('Benchmark check PASSED');
  } else {
    lines.push('Benchmark check FAILED');
  }

  for (const check of checks) {
    const icon = check.passed ? '\u2713' : '\u2717';
    const suffix = check.passed ? '' : ' REGRESSION';
    const padded = check.name.padEnd(9);
    lines.push(
      `  ${padded}: ${check.value.toFixed(2)} (threshold: >=${check.threshold.toFixed(2)}) ${icon}${suffix}`
    );
  }

  return lines.join('\n');
}

// =============================================================================
// Main
// =============================================================================

function main(): void {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        results: { type: 'string' },
        'min-precision': { type: 'string' },
        'min-recall': { type: 'string' },
        'min-f1': { type: 'string' },
        help: { type: 'boolean', default: false },
      },
      strict: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${msg}`);
    printUsage();
    process.exit(2);
  }

  const { values } = parsed;

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  // Validate required arguments
  if (!values.results) {
    console.error('Error: --results is required');
    printUsage();
    process.exit(2);
  }
  if (!values['min-precision']) {
    console.error('Error: --min-precision is required');
    printUsage();
    process.exit(2);
  }
  if (!values['min-recall']) {
    console.error('Error: --min-recall is required');
    printUsage();
    process.exit(2);
  }
  if (!values['min-f1']) {
    console.error('Error: --min-f1 is required');
    printUsage();
    process.exit(2);
  }

  const resultsDir = resolve(values.results);
  const minPrecision = parseFloat(values['min-precision']);
  const minRecall = parseFloat(values['min-recall']);
  const minF1 = parseFloat(values['min-f1']);

  // Validate numeric arguments
  if (isNaN(minPrecision) || isNaN(minRecall) || isNaN(minF1)) {
    console.error('Error: All threshold arguments must be valid numbers');
    process.exit(2);
  }

  if (
    minPrecision < 0 ||
    minPrecision > 1 ||
    minRecall < 0 ||
    minRecall > 1 ||
    minF1 < 0 ||
    minF1 > 1
  ) {
    console.error('Error: Thresholds must be between 0.0 and 1.0');
    process.exit(2);
  }

  // Read summary.json
  const summaryPath = join(resultsDir, 'summary.json');

  if (!existsSync(summaryPath)) {
    console.error(`Error: summary.json not found at ${summaryPath}`);
    process.exit(2);
  }

  let summary: BenchmarkSummary;
  try {
    const content = readFileSync(summaryPath, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    summary = validateSummary(parsed);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error reading summary.json: ${msg}`);
    process.exit(2);
  }

  // Check metrics
  const checks = checkMetrics(summary, minPrecision, minRecall, minF1);
  const output = formatResults(checks);

  console.log(output);

  const allPassed = checks.every((c) => c.passed);
  process.exit(allPassed ? 0 : 1);
}

// Only run main when executed directly (not when imported for testing)
const isDirectRun =
  process.argv[1] &&
  (import.meta.url.endsWith(process.argv[1]) ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`);

if (isDirectRun) {
  main();
}
