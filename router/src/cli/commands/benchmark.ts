import { readFileSync, writeFileSync } from 'fs';
import { computeReport, scoreScenario, type BenchmarkScenario } from '../../benchmark/scoring.js';
import { getUnsupportedScenarioReason, runScenario } from '../../benchmark/adapter.js';

export interface BenchmarkCommandOptions {
  fixtures: string;
  output?: string;
  verbose?: boolean;
}

export interface BenchmarkCommandIO {
  log: (message: string) => void;
  error: (message: string) => void;
  readFile: typeof readFileSync;
  writeFile: typeof writeFileSync;
}

const defaultIO: BenchmarkCommandIO = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
  readFile: readFileSync,
  writeFile: writeFileSync,
};

export async function runBenchmarkCommand(
  options: BenchmarkCommandOptions,
  io: BenchmarkCommandIO = defaultIO
): Promise<number> {
  try {
    const data = JSON.parse(io.readFile(options.fixtures, 'utf-8')) as {
      scenarios: BenchmarkScenario[];
    };
    const benchmarkScenarios = data.scenarios;

    if (benchmarkScenarios.length === 0) {
      throw new Error('Fixture file contains no scenarios');
    }

    io.log(`[benchmark] Running ${benchmarkScenarios.length} scenarios...`);

    const results = [];
    let skippedCount = 0;
    for (const scenario of benchmarkScenarios) {
      const unsupportedReason = getUnsupportedScenarioReason(scenario);
      if (unsupportedReason) {
        skippedCount++;
        if (options.verbose) {
          io.log(`  [SKIP] ${scenario.id}: ${unsupportedReason}`);
        }
        continue;
      }

      const findings = await runScenario(scenario);
      const result = scoreScenario(scenario, findings);
      results.push(result);
      if (options.verbose) {
        io.log(`  [${result.passed ? 'PASS' : 'FAIL'}] ${scenario.id}: ${scenario.description}`);
      }
    }

    if (results.length === 0 && skippedCount > 0) {
      throw new Error(
        'All benchmark scenarios were skipped as unsupported by the deterministic benchmark adapter'
      );
    }

    const report = computeReport(results);
    const reportJson = JSON.stringify(report, null, 2);
    if (options.output) {
      io.writeFile(options.output, reportJson);
      io.log(`[benchmark] Report written to ${options.output}`);
    } else {
      io.log(reportJson);
    }

    const suppression = (report.pool1.suppressionRate * 100).toFixed(1);
    const recall = (report.pool2.recall * 100).toFixed(1);
    const precision = (report.pool2.precision * 100).toFixed(1);
    if (skippedCount > 0) {
      io.log(
        `\n[benchmark] ${results.length} scored, ${skippedCount} skipped (unsupported patterns)`
      );
    }
    io.log(`\n[benchmark] Pool 1 (FP): suppression=${suppression}%`);
    io.log(`[benchmark] Pool 2 (TP): recall=${recall}%, precision=${precision}%`);

    const patternEScenarios = report.scenarios.filter((scenario) => scenario.pattern === 'E');
    const patternEPassed = patternEScenarios.filter((scenario) => scenario.passed).length;
    const patternERate =
      patternEScenarios.length > 0 ? patternEPassed / patternEScenarios.length : 1;
    io.log(`[benchmark] SC-007: Pattern E self-contradiction=${(patternERate * 100).toFixed(1)}%`);

    const suppressionGate = report.pool1.suppressionRate >= 0.85;
    const recallGate = report.pool2.recall === 1.0;
    const precisionGate = report.pool2.precision >= 0.7;
    const fprGate = report.pool1.fpRate <= 0.25;
    const selfContradictionGate = patternERate >= 0.8;

    if (!suppressionGate) io.log('[benchmark] FAIL: SC-001 suppression rate < 85%');
    if (!recallGate) io.log('[benchmark] FAIL: SC-002 TP recall < 100%');
    if (!precisionGate) io.log('[benchmark] FAIL: SC-003 TP precision < 70%');
    if (!fprGate) io.log('[benchmark] FAIL: SC-004 FP rate > 25%');
    if (!selfContradictionGate) {
      io.log(
        `[benchmark] FAIL: SC-007 Pattern E self-contradiction filter ${(patternERate * 100).toFixed(1)}% < 80%`
      );
    }

    return suppressionGate && recallGate && precisionGate && fprGate && selfContradictionGate
      ? 0
      : 1;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    io.error(`[benchmark] Fatal error: ${msg}`);
    return 2;
  }
}
