#!/usr/bin/env npx tsx
/**
 * Benchmark Summary Script
 *
 * Translates upstream benchmark evaluation results into the local summary.json
 * format consumed by benchmark-check.ts.
 */

import { parseArgs } from 'node:util';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

interface EvaluationResult {
  skipped?: boolean;
  tp?: number;
  fp?: number;
  fn?: number;
}

interface BenchmarkDataEntry {
  source_repo?: string;
}

type BenchmarkData = Record<string, BenchmarkDataEntry>;
type EvaluationFile = Record<string, Record<string, EvaluationResult>>;

interface SummaryProjectMetrics {
  precision: number;
  recall: number;
  f1: number;
}

interface SummaryOutput {
  precision: number;
  recall: number;
  f1: number;
  tool: string;
  judge_model: string;
  timestamp: string;
  total_tool_comments: number;
  total_golden_comments: number;
  true_positives: number;
  false_positives: number;
  false_negatives: number;
  projects: Record<string, SummaryProjectMetrics>;
}

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/benchmark-summarize.ts [options]

Required:
  --benchmark-data <path>   Path to benchmark_data.json
  --evaluations <path>      Path to evaluations.json
  --output <path>           Output path for summary.json

Optional:
  --tool <name>             Tool name to summarize (default: odd-ai-reviewers)
  --judge-model <name>      Judge model label to record
  --help                    Show this help message`);
}

function divide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function roundMetric(value: number): number {
  return Number(value.toFixed(4));
}

function calculateMetrics(tp: number, fp: number, fn: number): SummaryProjectMetrics {
  const precision = divide(tp, tp + fp);
  const recall = divide(tp, tp + fn);
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision: roundMetric(precision),
    recall: roundMetric(recall),
    f1: roundMetric(f1),
  };
}

export function buildSummary(
  benchmarkData: BenchmarkData,
  evaluations: EvaluationFile,
  toolName: string,
  judgeModel: string
): SummaryOutput {
  let totalTp = 0;
  let totalFp = 0;
  let totalFn = 0;
  const perProjectCounts = new Map<string, { tp: number; fp: number; fn: number }>();

  for (const [goldenUrl, toolResults] of Object.entries(evaluations)) {
    const result = toolResults[toolName];
    if (!result || result.skipped) {
      continue;
    }

    const tp = result.tp ?? 0;
    const fp = result.fp ?? 0;
    const fn = result.fn ?? 0;

    totalTp += tp;
    totalFp += fp;
    totalFn += fn;

    const project = benchmarkData[goldenUrl]?.source_repo ?? 'unknown';
    const counts = perProjectCounts.get(project) ?? { tp: 0, fp: 0, fn: 0 };
    counts.tp += tp;
    counts.fp += fp;
    counts.fn += fn;
    perProjectCounts.set(project, counts);
  }

  const overall = calculateMetrics(totalTp, totalFp, totalFn);
  const projects = Object.fromEntries(
    Array.from(perProjectCounts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([project, counts]) => [project, calculateMetrics(counts.tp, counts.fp, counts.fn)])
  );

  return {
    ...overall,
    tool: toolName,
    judge_model: judgeModel,
    timestamp: new Date().toISOString(),
    total_tool_comments: totalTp + totalFp,
    total_golden_comments: totalTp + totalFn,
    true_positives: totalTp,
    false_positives: totalFp,
    false_negatives: totalFn,
    projects,
  };
}

function main(): void {
  let parsed;
  try {
    parsed = parseArgs({
      options: {
        'benchmark-data': { type: 'string' },
        evaluations: { type: 'string' },
        output: { type: 'string' },
        tool: { type: 'string', default: 'odd-ai-reviewers' },
        'judge-model': { type: 'string', default: 'unknown' },
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

  if (!values['benchmark-data'] || !values.evaluations || !values.output) {
    console.error('Error: --benchmark-data, --evaluations, and --output are required');
    printUsage();
    process.exit(2);
  }

  const benchmarkDataPath = resolve(values['benchmark-data']);
  const evaluationsPath = resolve(values.evaluations);
  const outputPath = resolve(values.output);

  if (!existsSync(benchmarkDataPath)) {
    console.error(`Error: benchmark data not found at ${benchmarkDataPath}`);
    process.exit(2);
  }

  if (!existsSync(evaluationsPath)) {
    console.error(`Error: evaluations not found at ${evaluationsPath}`);
    process.exit(2);
  }

  let benchmarkData: BenchmarkData;
  try {
    benchmarkData = JSON.parse(readFileSync(benchmarkDataPath, 'utf-8')) as BenchmarkData;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: failed to read benchmark data JSON at ${benchmarkDataPath}: ${msg}`);
    process.exit(2);
  }

  let evaluations: EvaluationFile;
  try {
    evaluations = JSON.parse(readFileSync(evaluationsPath, 'utf-8')) as EvaluationFile;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Error: failed to read evaluations JSON at ${evaluationsPath}: ${msg}`);
    process.exit(2);
  }

  const summary = buildSummary(
    benchmarkData,
    evaluations,
    values.tool ?? 'odd-ai-reviewers',
    values['judge-model'] ?? 'unknown'
  );

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`Wrote benchmark summary to ${outputPath}`);
}

const isDirectRun =
  process.argv[1] &&
  (import.meta.url.endsWith(process.argv[1]) ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`);

if (isDirectRun) {
  main();
}
