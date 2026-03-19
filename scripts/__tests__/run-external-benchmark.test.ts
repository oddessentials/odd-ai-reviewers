import { describe, expect, it } from 'vitest';
import { join, posix as posixPath, resolve, win32 as win32Path } from 'node:path';
import {
  BENCHMARK_REPO_REVISION,
  BENCHMARK_REPO_URL,
  buildPaths,
  getPythonExecutable,
  getRequiredEnvVars,
  sanitizeModelName,
  type ExternalBenchmarkOptions,
} from '../run-external-benchmark.js';

function makeOptions(overrides: Partial<ExternalBenchmarkOptions> = {}): ExternalBenchmarkOptions {
  return {
    benchmarkRoot: '/tmp/ext-benchmark',
    resultsDir: '/tmp/results',
    judgeModel: 'openai/gpt-4.1-mini',
    concurrency: 2,
    timeoutPerPr: 300,
    maxRuntime: 6000,
    skipAdapter: false,
    skipJudge: false,
    skipSummary: false,
    skipCheck: false,
    minPrecision: 0.4,
    minRecall: 0.3,
    minF1: 0.35,
    ...overrides,
  };
}

describe('run-external-benchmark helpers', () => {
  it('sanitizes judge model names for results directories', () => {
    expect(sanitizeModelName('openai/gpt-4.1-mini')).toBe('openai_gpt-4.1-mini');
  });

  it('builds benchmark paths from options', () => {
    const paths = buildPaths(
      makeOptions({
        benchmarkRoot: '/tmp/benchmark-root',
        resultsDir: '/tmp/output',
      })
    );

    expect(paths.offlineDir).toBe(join(resolve('/tmp/benchmark-root'), 'offline'));
    expect(paths.candidatesPath).toBe(
      join(
        resolve('/tmp/benchmark-root'),
        'offline',
        'results',
        'openai_gpt-4.1-mini',
        'candidates.json'
      )
    );
    expect(paths.summaryPath).toBe(join(resolve('/tmp/output'), 'summary.json'));
  });

  it('uses the Windows virtualenv python path on win32', () => {
    expect(getPythonExecutable('C:\\benchmark\\offline', 'win32')).toBe(
      win32Path.join('C:\\benchmark\\offline', '.venv', 'Scripts', 'python.exe')
    );
  });

  it('uses the POSIX virtualenv python path on Linux', () => {
    expect(getPythonExecutable('/tmp/benchmark/offline', 'linux')).toBe(
      posixPath.join('/tmp/benchmark/offline', '.venv', 'bin', 'python')
    );
  });

  it('requires only adapter and judge secrets for the enabled phases', () => {
    expect(getRequiredEnvVars(makeOptions())).toEqual(['ANTHROPIC_API_KEY', 'MARTIAN_API_KEY']);
    expect(
      getRequiredEnvVars(
        makeOptions({
          skipAdapter: true,
        })
      )
    ).toEqual(['MARTIAN_API_KEY']);
    expect(
      getRequiredEnvVars(
        makeOptions({
          skipJudge: true,
        })
      )
    ).toEqual(['ANTHROPIC_API_KEY']);
  });

  it('pins the upstream benchmark repository revision', () => {
    expect(BENCHMARK_REPO_URL).toBe('https://github.com/withmartian/code-review-benchmark.git');
    expect(BENCHMARK_REPO_REVISION).toMatch(/^[0-9a-f]{40}$/);
  });
});
