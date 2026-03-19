#!/usr/bin/env node
/**
 * External benchmark orchestrator.
 *
 * Provides one stable contract for local and CI benchmark runs:
 * 1. Clone/update the upstream benchmark repo at a pinned revision
 * 2. Sync the Python environment
 * 3. Run the adapter
 * 4. Run the upstream judge via direct Python module execution
 * 5. Summarize and check results
 */

import { execFile as execFileCb } from 'node:child_process';
import { mkdirSync, existsSync, cpSync } from 'node:fs';
import { join, posix as posixPath, resolve, win32 as win32Path } from 'node:path';
import { parseArgs, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCb);

export const BENCHMARK_REPO_URL = 'https://github.com/withmartian/code-review-benchmark.git';
export const BENCHMARK_REPO_REVISION = '3d2a315ca54bf68b5ad2c830f7c1097a43c8b458';
const DEFAULT_RESULTS_DIR = join(process.cwd(), 'benchmark-results');
const DEFAULT_BENCHMARK_ROOT = join(process.cwd(), '.external-benchmark');
const DEFAULT_TIMEOUT_PER_PR_SECONDS = 300;
const DEFAULT_MAX_RUNTIME_SECONDS = 6000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MIN_PRECISION = 0.4;
const DEFAULT_MIN_RECALL = 0.3;
const DEFAULT_MIN_F1 = 0.35;

export interface ExternalBenchmarkOptions {
  benchmarkRoot: string;
  resultsDir: string;
  judgeModel: string;
  projects?: string;
  concurrency: number;
  timeoutPerPr: number;
  maxRuntime: number;
  cacheDir?: string;
  skipAdapter: boolean;
  skipJudge: boolean;
  skipSummary: boolean;
  skipCheck: boolean;
  minPrecision: number;
  minRecall: number;
  minF1: number;
}

interface BenchmarkPaths {
  benchmarkRoot: string;
  offlineDir: string;
  goldenDir: string;
  benchmarkDataPath: string;
  modelDir: string;
  candidatesPath: string;
  evaluationsPath: string;
  resultsDir: string;
  summaryPath: string;
  cacheDir: string;
}

export function sanitizeModelName(model: string): string {
  return model.trim().replaceAll('/', '_');
}

export function getPythonExecutable(offlineDir: string, platform = process.platform): string {
  return platform === 'win32'
    ? win32Path.join(offlineDir, '.venv', 'Scripts', 'python.exe')
    : posixPath.join(offlineDir, '.venv', 'bin', 'python');
}

export function getRequiredEnvVars(options: ExternalBenchmarkOptions): string[] {
  const required = new Set<string>();

  if (!options.skipAdapter) {
    required.add('ANTHROPIC_API_KEY');
  }
  if (!options.skipJudge) {
    required.add('MARTIAN_API_KEY');
  }

  return [...required];
}

export function buildPaths(options: ExternalBenchmarkOptions): BenchmarkPaths {
  const benchmarkRoot = resolve(options.benchmarkRoot);
  const offlineDir = join(benchmarkRoot, 'offline');
  const modelDir = join(offlineDir, 'results', sanitizeModelName(options.judgeModel));
  const resultsDir = resolve(options.resultsDir);
  const cacheDir = resolve(options.cacheDir ?? join(benchmarkRoot, '.cache'));

  return {
    benchmarkRoot,
    offlineDir,
    goldenDir: join(offlineDir, 'golden_comments'),
    benchmarkDataPath: join(offlineDir, 'results', 'benchmark_data.json'),
    modelDir,
    candidatesPath: join(modelDir, 'candidates.json'),
    evaluationsPath: join(modelDir, 'evaluations.json'),
    resultsDir,
    summaryPath: join(resultsDir, 'summary.json'),
    cacheDir,
  };
}

function parseNumberOption(value: string | undefined, fallback: number, field: string): number {
  const parsed = value === undefined ? fallback : Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${field}: ${value}`);
  }
  return parsed;
}

function parseFloatOption(value: string | undefined, fallback: number, field: string): number {
  const parsed = value === undefined ? fallback : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric value for ${field}: ${value}`);
  }
  return parsed;
}

function parseCliArgs(): ExternalBenchmarkOptions {
  const { values } = parseArgs({
    options: {
      'benchmark-root': { type: 'string', default: DEFAULT_BENCHMARK_ROOT },
      'results-dir': { type: 'string', default: DEFAULT_RESULTS_DIR },
      'judge-model': {
        type: 'string',
        default: process.env['MARTIAN_MODEL'] ?? 'openai/gpt-4.1-mini',
      },
      projects: { type: 'string' },
      concurrency: { type: 'string', default: String(DEFAULT_CONCURRENCY) },
      'timeout-per-pr': { type: 'string', default: String(DEFAULT_TIMEOUT_PER_PR_SECONDS) },
      'max-runtime': { type: 'string', default: String(DEFAULT_MAX_RUNTIME_SECONDS) },
      'cache-dir': { type: 'string' },
      'skip-adapter': { type: 'boolean', default: false },
      'skip-judge': { type: 'boolean', default: false },
      'skip-summary': { type: 'boolean', default: false },
      'skip-check': { type: 'boolean', default: false },
      'min-precision': { type: 'string', default: String(DEFAULT_MIN_PRECISION) },
      'min-recall': { type: 'string', default: String(DEFAULT_MIN_RECALL) },
      'min-f1': { type: 'string', default: String(DEFAULT_MIN_F1) },
    },
    strict: true,
  });

  return {
    benchmarkRoot: values['benchmark-root'] ?? DEFAULT_BENCHMARK_ROOT,
    resultsDir: values['results-dir'] ?? DEFAULT_RESULTS_DIR,
    judgeModel: values['judge-model'] ?? process.env['MARTIAN_MODEL'] ?? 'openai/gpt-4.1-mini',
    projects: values.projects,
    concurrency: parseNumberOption(values.concurrency, DEFAULT_CONCURRENCY, 'concurrency'),
    timeoutPerPr: parseNumberOption(
      values['timeout-per-pr'],
      DEFAULT_TIMEOUT_PER_PR_SECONDS,
      'timeout-per-pr'
    ),
    maxRuntime: parseNumberOption(
      values['max-runtime'],
      DEFAULT_MAX_RUNTIME_SECONDS,
      'max-runtime'
    ),
    cacheDir: values['cache-dir'],
    skipAdapter: values['skip-adapter'] ?? false,
    skipJudge: values['skip-judge'] ?? false,
    skipSummary: values['skip-summary'] ?? false,
    skipCheck: values['skip-check'] ?? false,
    minPrecision: parseFloatOption(values['min-precision'], DEFAULT_MIN_PRECISION, 'min-precision'),
    minRecall: parseFloatOption(values['min-recall'], DEFAULT_MIN_RECALL, 'min-recall'),
    minF1: parseFloatOption(values['min-f1'], DEFAULT_MIN_F1, 'min-f1'),
  };
}

function assertRequiredEnv(options: ExternalBenchmarkOptions): void {
  const missing = getRequiredEnvVars(options).filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

async function runCommand(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<void> {
  const result = await execFile(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
}

async function ensureBenchmarkRepo(paths: BenchmarkPaths): Promise<void> {
  if (!existsSync(join(paths.benchmarkRoot, '.git'))) {
    mkdirSync(resolve(paths.benchmarkRoot, '..'), { recursive: true });
    await runCommand('git', ['clone', '--depth', '1', BENCHMARK_REPO_URL, paths.benchmarkRoot]);
  }

  await runCommand('git', ['fetch', '--depth', '1', 'origin', BENCHMARK_REPO_REVISION], {
    cwd: paths.benchmarkRoot,
  });
  await runCommand('git', ['checkout', '--force', '--detach', BENCHMARK_REPO_REVISION], {
    cwd: paths.benchmarkRoot,
  });
}

async function syncBenchmarkEnv(paths: BenchmarkPaths): Promise<void> {
  await runCommand('uv', ['sync', '--frozen'], { cwd: paths.offlineDir });
}

async function runAdapter(options: ExternalBenchmarkOptions, paths: BenchmarkPaths): Promise<void> {
  const args = [
    '--experimental-strip-types',
    'scripts/benchmark-adapter.ts',
    '--golden-dir',
    paths.goldenDir,
    '--benchmark-data',
    paths.benchmarkDataPath,
    '--output',
    paths.candidatesPath,
    '--concurrency',
    String(options.concurrency),
    '--timeout-per-pr',
    String(options.timeoutPerPr),
    '--max-runtime',
    String(options.maxRuntime),
    '--cache-dir',
    paths.cacheDir,
  ];

  if (options.projects) {
    args.push('--projects', options.projects);
  }

  await runCommand(process.execPath, args, { cwd: process.cwd(), env: process.env });
}

async function runJudge(options: ExternalBenchmarkOptions, paths: BenchmarkPaths): Promise<void> {
  const pythonExe = getPythonExecutable(paths.offlineDir);
  const env = {
    ...process.env,
    MARTIAN_MODEL: options.judgeModel,
    PYTHONUTF8: '1',
  };

  await runCommand(
    pythonExe,
    ['-m', 'code_review_benchmark.step3_judge_comments', '--tool', 'odd-ai-reviewers', '--force'],
    {
      cwd: paths.offlineDir,
      env,
    }
  );
}

async function summarize(options: ExternalBenchmarkOptions, paths: BenchmarkPaths): Promise<void> {
  mkdirSync(paths.resultsDir, { recursive: true });

  await runCommand(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/benchmark-summarize.ts',
      '--benchmark-data',
      paths.benchmarkDataPath,
      '--evaluations',
      paths.evaluationsPath,
      '--output',
      paths.summaryPath,
      '--tool',
      'odd-ai-reviewers',
      '--judge-model',
      options.judgeModel,
    ],
    { cwd: process.cwd(), env: process.env }
  );

  cpSync(paths.candidatesPath, join(paths.resultsDir, 'candidates.json'));
  cpSync(paths.evaluationsPath, join(paths.resultsDir, 'evaluations.json'));
  cpSync(paths.benchmarkDataPath, join(paths.resultsDir, 'benchmark_data.json'));
}

async function checkThresholds(
  options: ExternalBenchmarkOptions,
  paths: BenchmarkPaths
): Promise<void> {
  await runCommand(
    process.execPath,
    [
      '--experimental-strip-types',
      'scripts/benchmark-check.ts',
      '--results',
      paths.resultsDir,
      '--min-precision',
      String(options.minPrecision),
      '--min-recall',
      String(options.minRecall),
      '--min-f1',
      String(options.minF1),
    ],
    { cwd: process.cwd(), env: process.env }
  );
}

export async function runExternalBenchmark(
  options: ExternalBenchmarkOptions = parseCliArgs()
): Promise<void> {
  assertRequiredEnv(options);
  const paths = buildPaths(options);

  console.log(
    `[benchmark] Using benchmark repo ${BENCHMARK_REPO_URL} @ ${BENCHMARK_REPO_REVISION}`
  );
  await ensureBenchmarkRepo(paths);
  await syncBenchmarkEnv(paths);

  mkdirSync(paths.modelDir, { recursive: true });
  mkdirSync(paths.resultsDir, { recursive: true });

  if (!options.skipAdapter) {
    await runAdapter(options, paths);
  }

  if (!options.skipJudge) {
    await runJudge(options, paths);
  }

  if (!options.skipSummary) {
    await summarize(options, paths);
  }

  if (!options.skipCheck) {
    await checkThresholds(options, paths);
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectRun) {
  runExternalBenchmark().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[benchmark] Fatal error: ${message}`);
    process.exit(1);
  });
}
