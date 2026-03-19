#!/usr/bin/env npx tsx
/**
 * Benchmark Adapter Script
 *
 * Transforms odd-ai-reviewers CLI JSON output into the withmartian benchmark
 * candidate format. For each PR in the golden directory, clones the repo,
 * runs `ai-review local --format json`, and maps findings to candidates.
 *
 * Usage:
 *   npx tsx scripts/benchmark-adapter.ts \
 *     --golden-dir <path> \
 *     --output <path> \
 *     [--projects <comma-separated>] \
 *     [--concurrency <1-5>] \
 *     [--timeout-per-pr <seconds>] \
 *     [--max-retries <1-3>] \
 *     [--cache-dir <path>] \
 *     [--no-cleanup] \
 *     [--max-runtime <seconds>] \
 *     [--dry-run]
 */

import { parseArgs } from 'node:util';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  rmSync,
  statfsSync,
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// =============================================================================
// Types
// =============================================================================

export interface BenchmarkCandidate {
  text: string;
  path: string;
  line: number | null;
  source: 'extracted';
}

interface GoldenComment {
  pr_title: string;
  url: string;
  original_url?: string;
  az_comment?: string;
  comments: { comment: string; severity: string }[];
}

interface BenchmarkReview {
  tool: string;
  repo_name: string;
  pr_url: string;
  review_comments: Record<string, unknown>[];
}

interface BenchmarkDataEntry {
  pr_title?: string;
  original_url?: string;
  source_repo?: string;
  golden_comments: GoldenComment['comments'];
  golden_source_file?: string;
  az_comment?: string;
  reviews: BenchmarkReview[];
}

type BenchmarkData = Record<string, BenchmarkDataEntry>;

export interface CLIFinding {
  message: string;
  file: string;
  line?: number;
  suggestion?: string;
  severity: string;
}

interface CLIOutput {
  findings: CLIFinding[];
  [key: string]: unknown;
}

export interface AdapterOptions {
  goldenDir: string;
  output: string;
  benchmarkData?: string;
  toolName: string;
  projects?: string;
  concurrency: number;
  timeoutPerPr: number;
  maxRetries: number;
  cacheDir: string;
  cleanup: boolean;
  maxRuntime: number;
  dryRun: boolean;
}

export interface PRTask {
  project: string;
  prNumber: string;
  goldenPath: string;
  golden: GoldenComment;
}

export interface PRResult {
  prUrl: string;
  candidates: BenchmarkCandidate[];
  error?: string;
}

const INITIAL_CLONE_DEPTH = 50;
const MERGE_BASE_DEEPEN_STEPS = [200, 500, 1000, 5000] as const;

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function printUsage(): void {
  console.log(`Usage: npx tsx scripts/benchmark-adapter.ts [options]

Required:
  --golden-dir <path>          Directory with golden comment files
  --output <path>              Output file path for benchmark results

Optional:
  --benchmark-data <path>      Benchmark data JSON to update for judge compatibility
  --tool-name <name>           Tool name to register (default: odd-ai-reviewers)
  --projects <list>            Comma-separated project names (default: all)
  --concurrency <1-5>          Concurrent PR reviews (default: 1)
  --timeout-per-pr <seconds>   Timeout per PR in seconds (default: 300)
  --max-retries <1-3>          Max retries per failed PR (default: 1)
  --cache-dir <path>           Clone cache directory (default: .benchmark-cache)
  --no-cleanup                 Keep cloned repos after processing
  --max-runtime <seconds>      Maximum total runtime in seconds (default: 7200)
  --dry-run                    Validate clone + format only, no LLM calls
  --help                       Show this help message`);
}

function parseCliArgs(): AdapterOptions {
  const { values } = parseArgs({
    options: {
      'golden-dir': { type: 'string' },
      output: { type: 'string' },
      'benchmark-data': { type: 'string' },
      'tool-name': { type: 'string', default: 'odd-ai-reviewers' },
      projects: { type: 'string' },
      concurrency: { type: 'string', default: '1' },
      'timeout-per-pr': { type: 'string', default: '300' },
      'max-retries': { type: 'string', default: '1' },
      'cache-dir': { type: 'string', default: join(process.cwd(), '.benchmark-cache') },
      'no-cleanup': { type: 'boolean', default: false },
      'max-runtime': { type: 'string', default: '7200' },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (values.help) {
    printUsage();
    process.exit(0);
  }

  if (!values['golden-dir']) {
    console.error('Error: --golden-dir is required');
    printUsage();
    process.exit(1);
  }
  if (!values.output) {
    console.error('Error: --output is required');
    printUsage();
    process.exit(1);
  }

  const concurrency = Math.max(1, Math.min(5, parseInt(values.concurrency ?? '1', 10)));
  const timeoutPerPr = Math.max(30, parseInt(values['timeout-per-pr'] ?? '300', 10));
  const maxRetries = Math.max(0, Math.min(3, parseInt(values['max-retries'] ?? '1', 10)));
  const maxRuntime = Math.max(60, parseInt(values['max-runtime'] ?? '7200', 10));

  if (isNaN(concurrency) || isNaN(timeoutPerPr) || isNaN(maxRetries) || isNaN(maxRuntime)) {
    console.error('Error: Numeric options must be valid numbers');
    process.exit(1);
  }

  const cacheDir = values['cache-dir'] ?? join(process.cwd(), '.benchmark-cache');

  return {
    goldenDir: resolve(values['golden-dir']),
    output: resolve(values.output),
    benchmarkData: values['benchmark-data'] ? resolve(values['benchmark-data']) : undefined,
    toolName: values['tool-name'] ?? 'odd-ai-reviewers',
    projects: values.projects,
    concurrency,
    timeoutPerPr,
    maxRetries,
    cacheDir: resolve(cacheDir),
    cleanup: !values['no-cleanup'],
    maxRuntime,
    dryRun: values['dry-run'] ?? false,
  };
}

// =============================================================================
// Disk Space Guard
// =============================================================================

const MIN_DISK_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function checkDiskSpace(dir: string): boolean {
  try {
    const stats = statfsSync(dir);
    const available = stats.bavail * stats.bsize;
    return available >= MIN_DISK_BYTES;
  } catch {
    // If statfs is not supported (e.g., some Windows configurations),
    // log a warning and continue
    console.warn('Warning: Could not check disk space, proceeding anyway');
    return true;
  }
}

// =============================================================================
// Finding Transformation
// =============================================================================

export function transformFinding(finding: CLIFinding): BenchmarkCandidate {
  let text = finding.message;
  if (finding.suggestion) {
    text += `. Suggestion: ${finding.suggestion}`;
  }

  return {
    text,
    path: finding.file,
    line: finding.line ?? null,
    source: 'extracted',
  };
}

// =============================================================================
// PR Processing
// =============================================================================

function withLongPathGitArgs(args: string[]): string[] {
  if (process.platform !== 'win32') {
    return args;
  }

  // Windows clones of large repos like grafana can fail checkout on long paths
  // unless Git is invoked with core.longpaths enabled.
  return ['-c', 'core.longpaths=true', ...args];
}

async function cloneRepo(repoUrl: string, targetDir: string, timeoutMs: number): Promise<void> {
  // Extract clone URL and PR number from PR URL: https://github.com/owner/repo/pull/123
  const match = repoUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/(\d+)$/);
  if (!match?.[1] || !match?.[2]) {
    throw new Error(`Cannot parse repo URL from PR URL: ${repoUrl}`);
  }

  const cloneUrl = `https://github.com/${match[1]}.git`;
  const prNumber = match[2];

  // Clone with enough depth for merge-base computation against the default branch
  await execFile(
    'git',
    withLongPathGitArgs(['clone', '--depth', String(INITIAL_CLONE_DEPTH), cloneUrl, targetDir]),
    {
      timeout: timeoutMs,
      encoding: 'utf-8',
    }
  );

  // Fetch the PR head ref so we review the actual PR diff, not the default branch
  await execFile(
    'git',
    withLongPathGitArgs([
      'fetch',
      'origin',
      `pull/${prNumber}/head:pr-head`,
      '--depth',
      String(INITIAL_CLONE_DEPTH),
    ]),
    {
      timeout: timeoutMs,
      encoding: 'utf-8',
      cwd: targetDir,
    }
  );

  // Checkout the PR branch
  await execFile('git', withLongPathGitArgs(['checkout', 'pr-head']), {
    timeout: timeoutMs,
    encoding: 'utf-8',
    cwd: targetDir,
  });
}

async function detectDefaultBranch(repoDir: string, timeoutMs: number): Promise<string> {
  try {
    const branchResult = await execFile('git', ['rev-parse', '--abbrev-ref', 'origin/HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: timeoutMs,
    });
    return branchResult.stdout.trim();
  } catch {
    return 'origin/main';
  }
}

async function hasMergeBase(
  repoDir: string,
  baseBranch: string,
  timeoutMs: number
): Promise<boolean> {
  try {
    await execFile('git', ['merge-base', baseBranch, 'HEAD'], {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: timeoutMs,
    });
    return true;
  } catch {
    return false;
  }
}

async function isShallowRepository(repoDir: string, timeoutMs: number): Promise<boolean> {
  try {
    const result = await execFile('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: timeoutMs,
    });
    return result.stdout.trim() === 'true';
  } catch {
    return false;
  }
}

function getBaseBranchName(baseBranch: string): string {
  return baseBranch.startsWith('origin/') ? baseBranch.slice('origin/'.length) : baseBranch;
}

async function deepenHistoryForMergeBase(
  repoDir: string,
  baseBranch: string,
  prNumber: string,
  timeoutMs: number
): Promise<void> {
  const branchName = getBaseBranchName(baseBranch);
  const fetchRefs = [
    `+refs/heads/${branchName}:refs/remotes/origin/${branchName}`,
    `+refs/pull/${prNumber}/head`,
  ];

  for (const deepenBy of MERGE_BASE_DEEPEN_STEPS) {
    await execFile(
      'git',
      withLongPathGitArgs(['fetch', 'origin', ...fetchRefs, '--deepen', String(deepenBy)]),
      {
        cwd: repoDir,
        encoding: 'utf-8',
        timeout: timeoutMs,
      }
    );

    if (await hasMergeBase(repoDir, baseBranch, timeoutMs)) {
      return;
    }
  }

  if (await isShallowRepository(repoDir, timeoutMs)) {
    await execFile('git', withLongPathGitArgs(['fetch', '--unshallow', 'origin', ...fetchRefs]), {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: timeoutMs,
    });

    if (await hasMergeBase(repoDir, baseBranch, timeoutMs)) {
      return;
    }
  }

  throw new Error(
    `Could not determine merge base between ${baseBranch} and HEAD for PR #${prNumber}`
  );
}

async function runLocalReview(
  repoDir: string,
  prNumber: string,
  timeoutMs: number
): Promise<CLIFinding[]> {
  // Use the locally built CLI, not npx (which would resolve a published
  // package from npm instead of the code built from this branch)
  const __dirname = import.meta.dirname ?? dirname(fileURLToPath(import.meta.url));
  const cliPath = resolve(__dirname, '..', 'router', 'dist', 'main.js');

  const baseBranch = await detectDefaultBranch(repoDir, 10_000);

  if (!(await hasMergeBase(repoDir, baseBranch, timeoutMs))) {
    if (!(await isShallowRepository(repoDir, timeoutMs))) {
      throw new Error(`No merge base found between ${baseBranch} and HEAD`);
    }

    console.log(`  [git] Deepening history for PR #${prNumber} to recover merge base`);
    await deepenHistoryForMergeBase(repoDir, baseBranch, prNumber, timeoutMs);
  }

  const result = await execFile(
    'node',
    [cliPath, 'local', '.', '--base', baseBranch, '--format', 'json', '--no-color'],
    {
      timeout: timeoutMs,
      encoding: 'utf-8',
      cwd: repoDir,
    }
  );

  const output: CLIOutput = JSON.parse(result.stdout);
  return output.findings ?? [];
}

export async function processPR(
  task: PRTask,
  options: AdapterOptions,
  workDir: string
): Promise<PRResult> {
  const prUrl = task.golden.url;
  const cloneDir = join(workDir, `${task.project}-${task.prNumber}`);
  const timeoutMs = options.timeoutPerPr * 1000;

  try {
    if (options.dryRun) {
      // Validate URL is parseable but skip clone and review
      const urlMatch = prUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+$/);
      if (!urlMatch?.[1]) {
        return { prUrl, candidates: [], error: `Cannot parse repo URL from PR URL: ${prUrl}` };
      }
      console.log(`  [dry-run] Would clone ${urlMatch[1]} and review in ${cloneDir}`);
      return { prUrl, candidates: [] };
    }

    // Clone
    if (!existsSync(cloneDir)) {
      await cloneRepo(prUrl, cloneDir, timeoutMs);
    }

    // Run review
    const findings = await runLocalReview(cloneDir, task.prNumber, timeoutMs);
    const candidates = findings.map(transformFinding);

    return { prUrl, candidates };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { prUrl, candidates: [], error: msg };
  } finally {
    // Cleanup clone dir unless --no-cleanup
    if (options.cleanup && existsSync(cloneDir)) {
      try {
        rmSync(cloneDir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
  }
}

// =============================================================================
// Task Discovery
// =============================================================================

export function discoverTasks(goldenDir: string, projectFilter?: string): PRTask[] {
  const tasks: PRTask[] = [];
  const allowedProjects = projectFilter
    ? new Set(projectFilter.split(',').map((p) => p.trim()))
    : null;

  if (!existsSync(goldenDir)) {
    throw new Error(`Golden directory does not exist: ${goldenDir}`);
  }

  const entries = readdirSync(goldenDir, { withFileTypes: true });
  const isDirectoryEntry = (entry: { isDirectory?: () => boolean }) =>
    typeof entry.isDirectory === 'function' && entry.isDirectory();
  const isFileEntry = (entry: { isFile?: () => boolean; isDirectory?: () => boolean }) =>
    typeof entry.isFile === 'function' ? entry.isFile() : !isDirectoryEntry(entry);
  const hasFlatJsonLayout = entries.some(
    (entry) => isFileEntry(entry) && entry.name.endsWith('.json')
  );

  if (hasFlatJsonLayout) {
    for (const entry of entries) {
      if (!isFileEntry(entry) || !entry.name.endsWith('.json')) continue;

      const project = entry.name.replace(/\.json$/i, '');
      if (allowedProjects && !allowedProjects.has(project)) continue;

      const goldenPath = join(goldenDir, entry.name);

      try {
        const content = readFileSync(goldenPath, 'utf-8');
        const goldenEntries: GoldenComment[] = JSON.parse(content);

        if (!Array.isArray(goldenEntries)) {
          throw new Error('expected a JSON array of PR entries');
        }

        for (const [index, golden] of goldenEntries.entries()) {
          const prMatch = golden.url.match(/\/pull\/(\d+)$/);
          if (!prMatch?.[1]) {
            console.warn(
              `Warning: Skipping ${goldenPath} entry ${index}: invalid PR URL ${golden.url}`
            );
            continue;
          }

          tasks.push({
            project,
            prNumber: prMatch[1],
            goldenPath,
            golden,
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Skipping ${goldenPath}: ${msg}`);
      }
    }

    return tasks;
  }

  for (const entry of entries) {
    if (!isDirectoryEntry(entry)) continue;
    if (allowedProjects && !allowedProjects.has(entry.name)) continue;

    const projectDir = join(goldenDir, entry.name);
    const prFiles = readdirSync(projectDir).filter((f) => f.endsWith('.json'));

    for (const prFile of prFiles) {
      const prNumber = prFile.replace('.json', '');
      const goldenPath = join(projectDir, prFile);

      try {
        const content = readFileSync(goldenPath, 'utf-8');
        const golden: GoldenComment = JSON.parse(content);
        tasks.push({ project: entry.name, prNumber, goldenPath, golden });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`Warning: Skipping ${goldenPath}: ${msg}`);
      }
    }
  }

  return tasks;
}

export function updateBenchmarkData(
  benchmarkDataPath: string,
  tasks: PRTask[],
  options: AdapterOptions
): void {
  const benchmarkData: BenchmarkData = existsSync(benchmarkDataPath)
    ? (JSON.parse(readFileSync(benchmarkDataPath, 'utf-8')) as BenchmarkData)
    : {};

  for (const entry of Object.values(benchmarkData)) {
    entry.reviews = (entry.reviews ?? []).filter((review) => review.tool !== options.toolName);
  }

  for (const task of tasks) {
    const goldenUrl = task.golden.url;
    const existingEntry = benchmarkData[goldenUrl];
    const reviews = [...(existingEntry?.reviews ?? [])];

    reviews.push({
      tool: options.toolName,
      repo_name: `${options.toolName}__generated`,
      pr_url: goldenUrl,
      review_comments: [],
    });

    benchmarkData[goldenUrl] = {
      pr_title: existingEntry?.pr_title ?? task.golden.pr_title,
      original_url: existingEntry?.original_url ?? task.golden.original_url,
      source_repo: existingEntry?.source_repo ?? task.project,
      golden_comments: existingEntry?.golden_comments ?? task.golden.comments,
      golden_source_file: existingEntry?.golden_source_file ?? task.goldenPath.split(/[\\/]/).pop(),
      az_comment: existingEntry?.az_comment ?? task.golden.az_comment,
      reviews,
    };
  }

  writeFileSync(benchmarkDataPath, JSON.stringify(benchmarkData, null, 2), 'utf-8');
}

// =============================================================================
// Concurrent Execution
// =============================================================================

async function processWithConcurrency(
  tasks: PRTask[],
  options: AdapterOptions,
  workDir: string
): Promise<PRResult[]> {
  const results: PRResult[] = [];
  const startTime = Date.now();
  let index = 0;

  async function processNext(): Promise<void> {
    while (index < tasks.length) {
      // Check max runtime
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed > options.maxRuntime) {
        console.warn(`Warning: Max runtime of ${options.maxRuntime}s exceeded, stopping`);
        break;
      }

      // Check disk space
      if (!checkDiskSpace(workDir)) {
        console.warn('Warning: Less than 2GB disk space available, stopping');
        break;
      }

      const currentIndex = index++;
      const task = tasks[currentIndex];
      if (!task) break;

      console.log(
        `[${currentIndex + 1}/${tasks.length}] Processing ${task.project}/${task.prNumber}...`
      );

      let result: PRResult | undefined;
      let lastError: string | undefined;

      for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
        if (attempt > 0) {
          console.log(
            `  Retry ${attempt}/${options.maxRetries} for ${task.project}/${task.prNumber}`
          );
        }

        result = await processPR(task, options, workDir);
        if (!result.error) break;
        lastError = result.error;
      }

      if (result) {
        if (result.error) {
          console.warn(`  FAILED: ${task.project}/${task.prNumber}: ${lastError ?? result.error}`);
        } else {
          console.log(`  OK: ${result.candidates.length} candidates found`);
        }
        results.push(result);
      }
    }
  }

  // Run workers concurrently
  const workers: Promise<void>[] = [];
  for (let i = 0; i < options.concurrency; i++) {
    workers.push(processNext());
  }
  await Promise.all(workers);

  return results;
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const options = parseCliArgs();

  // Discover tasks
  console.log(`Discovering PRs from ${options.goldenDir}...`);
  const tasks = discoverTasks(options.goldenDir, options.projects);

  if (tasks.length === 0) {
    console.error('Error: No golden comment files found');
    process.exit(1);
  }

  console.log(`Found ${tasks.length} PRs to process`);
  if (options.dryRun) {
    console.log('[dry-run mode enabled]');
  }

  // Prepare work directory
  mkdirSync(options.cacheDir, { recursive: true });

  // Check disk space before starting
  if (!checkDiskSpace(options.cacheDir)) {
    console.error('Error: Less than 2GB disk space available');
    process.exit(1);
  }

  // Process PRs
  const startTime = Date.now();
  const results = await processWithConcurrency(tasks, options, options.cacheDir);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Build output
  const output: Record<string, Record<string, BenchmarkCandidate[]>> = {};
  let successCount = 0;
  let failCount = 0;
  let totalCandidates = 0;

  for (const result of results) {
    if (result.error) {
      failCount++;
    } else {
      successCount++;
      totalCandidates += result.candidates.length;
    }
    output[result.prUrl] = { [options.toolName]: result.candidates };
  }

  // Write output
  const outputDir = resolve(options.output, '..');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(options.output, JSON.stringify(output, null, 2), 'utf-8');

  if (options.benchmarkData) {
    const benchmarkDir = resolve(options.benchmarkData, '..');
    mkdirSync(benchmarkDir, { recursive: true });
    updateBenchmarkData(options.benchmarkData, tasks, options);
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Total PRs: ${tasks.length}`);
  console.log(`Succeeded: ${successCount}`);
  console.log(`Failed: ${failCount}`);
  console.log(`Total candidates: ${totalCandidates}`);
  console.log(`Elapsed: ${elapsed}s`);
  console.log(`Output: ${options.output}`);

  if (failCount > 0) {
    console.log('\nFailed PRs:');
    for (const result of results) {
      if (result.error) {
        console.log(`  ${result.prUrl}: ${result.error}`);
      }
    }
  }

  // Exit 0 on success (some failures are expected and logged)
  process.exit(0);
}

// Only run main when executed directly (not when imported for testing)
const isDirectRun =
  process.argv[1] &&
  (import.meta.url.endsWith(process.argv[1]) ||
    import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
    import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`);

if (isDirectRun) {
  main().catch((error: unknown) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`Fatal error: ${msg}`);
    process.exit(1);
  });
}
