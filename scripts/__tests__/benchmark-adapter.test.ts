/**
 * Benchmark Adapter Tests
 *
 * Unit tests for the benchmark adapter's finding transformation,
 * task discovery, and PR processing logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  transformFinding,
  discoverTasks,
  processPR,
  updateBenchmarkData,
  type CLIFinding,
  type BenchmarkCandidate,
  type AdapterOptions,
  type PRTask,
} from '../benchmark-adapter.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execFile: vi.fn(),
}));

vi.mock('node:util', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    promisify: (fn: unknown) => fn, // promisify returns the mock directly
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    readdirSync: vi.fn(),
    mkdirSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
    statfsSync: vi.fn(),
  };
});

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';

const mockExecFile = vi.mocked(execFile);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockRmSync = vi.mocked(rmSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<CLIFinding> = {}): CLIFinding {
  return {
    message: 'SQL injection vulnerability',
    file: 'src/db.ts',
    line: 42,
    severity: 'critical',
    ...overrides,
  };
}

function makeOptions(overrides: Partial<AdapterOptions> = {}): AdapterOptions {
  return {
    goldenDir: '/tmp/golden',
    output: '/tmp/output/results.json',
    benchmarkData: '/tmp/benchmark/results/benchmark_data.json',
    toolName: 'odd-ai-reviewers',
    concurrency: 1,
    timeoutPerPr: 300,
    maxRetries: 1,
    cacheDir: '/tmp/cache',
    cleanup: true,
    maxRuntime: 7200,
    dryRun: false,
    ...overrides,
  };
}

function makeTask(overrides: Partial<PRTask> = {}): PRTask {
  return {
    project: 'test-org/test-repo',
    prNumber: '123',
    goldenPath: '/tmp/golden/test-org/test-repo/123.json',
    golden: {
      pr_title: 'Fix security issue',
      url: 'https://github.com/test-org/test-repo/pull/123',
      comments: [{ comment: 'SQL injection found', severity: 'critical' }],
    },
    ...overrides,
  };
}

/** Helper to create a resolved execFile result. */
function execOk(stdout = ''): ReturnType<typeof execFile> {
  return Promise.resolve({ stdout, stderr: '' }) as unknown as ReturnType<typeof execFile>;
}

/** Helper to create a rejected execFile result. */
function execFail(message: string): ReturnType<typeof execFile> {
  return Promise.reject(new Error(message)) as unknown as ReturnType<typeof execFile>;
}

/**
 * Set up mocks for a full clone + review sequence:
 *   Clone: 3 calls (git clone, git fetch PR head, git checkout pr-head)
 *   Review: 2 calls (git rev-parse origin/HEAD, node <cli> local)
 */
function mockFullSequence(cliOutput: object): void {
  mockExistsSync.mockReturnValue(false);
  mockExecFile
    .mockReturnValueOnce(execOk()) // git clone
    .mockReturnValueOnce(execOk()) // git fetch PR ref
    .mockReturnValueOnce(execOk()) // git checkout pr-head
    .mockReturnValueOnce(execOk('origin/main')) // detect default branch
    .mockReturnValueOnce(execOk(JSON.stringify(cliOutput))); // node <cli> local
}

// ---------------------------------------------------------------------------
// transformFinding
// ---------------------------------------------------------------------------

describe('transformFinding', () => {
  it('transforms CLI finding to benchmark candidate format', () => {
    const finding = makeFinding({
      message: 'Unsanitized user input in query',
      file: 'src/api/handler.ts',
      line: 55,
      severity: 'warning',
    });

    const result: BenchmarkCandidate = transformFinding(finding);

    expect(result).toEqual({
      text: 'Unsanitized user input in query',
      path: 'src/api/handler.ts',
      line: 55,
      source: 'extracted',
    });
  });

  it('appends suggestion to text when present', () => {
    const finding = makeFinding({
      message: 'SQL injection vulnerability',
      suggestion: 'Use parameterized queries instead',
    });

    const result = transformFinding(finding);

    expect(result.text).toBe(
      'SQL injection vulnerability. Suggestion: Use parameterized queries instead'
    );
  });

  it('sets line to null when finding has no line number', () => {
    const finding = makeFinding({ line: undefined });

    const result = transformFinding(finding);

    expect(result.line).toBeNull();
  });

  it('maps file to path', () => {
    const finding = makeFinding({ file: 'lib/utils/crypto.ts' });

    const result = transformFinding(finding);

    expect(result.path).toBe('lib/utils/crypto.ts');
  });

  it('always sets source to extracted', () => {
    const finding = makeFinding();

    const result = transformFinding(finding);

    expect(result.source).toBe('extracted');
  });

  it('handles empty message', () => {
    const finding = makeFinding({ message: '' });

    const result = transformFinding(finding);

    expect(result.text).toBe('');
  });

  it('handles empty suggestion', () => {
    const finding = makeFinding({ suggestion: '' });

    const result = transformFinding(finding);

    // Empty suggestion is falsy, so it should not be appended
    expect(result.text).toBe('SQL injection vulnerability');
  });

  it('handles findings array transformation', () => {
    const findings: CLIFinding[] = [
      makeFinding({ message: 'Issue 1', file: 'a.ts', line: 1 }),
      makeFinding({ message: 'Issue 2', file: 'b.ts', line: 2 }),
      makeFinding({ message: 'Issue 3', file: 'c.ts', line: undefined }),
    ];

    const candidates = findings.map(transformFinding);

    expect(candidates).toHaveLength(3);
    expect(candidates[0]?.line).toBe(1);
    expect(candidates[1]?.line).toBe(2);
    expect(candidates[2]?.line).toBeNull();
  });

  it('returns empty candidates for empty findings array', () => {
    const findings: CLIFinding[] = [];

    const candidates = findings.map(transformFinding);

    expect(candidates).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// discoverTasks
// ---------------------------------------------------------------------------

describe('discoverTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when golden directory does not exist', () => {
    mockExistsSync.mockReturnValue(false);

    expect(() => discoverTasks('/nonexistent')).toThrow(
      'Golden directory does not exist: /nonexistent'
    );
  });

  it('discovers PR tasks from golden directory structure', () => {
    mockExistsSync.mockReturnValue(true);

    // Root directory listing
    mockReaddirSync.mockImplementation(((path: string) => {
      if (path === '/golden') {
        return [{ name: 'project-a', isDirectory: () => true }] as unknown as ReturnType<
          typeof readdirSync
        >;
      }
      // Project directory listing
      return ['42.json', '99.json'] as unknown as ReturnType<typeof readdirSync>;
    }) as unknown as typeof readdirSync);

    mockReadFileSync.mockImplementation(((path: string) => {
      if (path.endsWith('42.json')) {
        return JSON.stringify({
          pr_title: 'Fix bug',
          url: 'https://github.com/org/repo/pull/42',
          comments: [],
        });
      }
      return JSON.stringify({
        pr_title: 'Add feature',
        url: 'https://github.com/org/repo/pull/99',
        comments: [],
      });
    }) as typeof readFileSync);

    const tasks = discoverTasks('/golden');

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.project).toBe('project-a');
    expect(tasks[0]?.prNumber).toBe('42');
    expect(tasks[1]?.prNumber).toBe('99');
  });

  it('filters tasks by project name', () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation(((path: string) => {
      if (path === '/golden') {
        return [
          { name: 'project-a', isDirectory: () => true },
          { name: 'project-b', isDirectory: () => true },
        ] as unknown as ReturnType<typeof readdirSync>;
      }
      return ['1.json'] as unknown as ReturnType<typeof readdirSync>;
    }) as unknown as typeof readdirSync);

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        pr_title: 'Test',
        url: 'https://github.com/org/repo/pull/1',
        comments: [],
      }) as unknown as ReturnType<typeof readFileSync>
    );

    const tasks = discoverTasks('/golden', 'project-b');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.project).toBe('project-b');
  });

  it('discovers PR tasks from flat golden_comments files', () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockReturnValue([
      { name: 'sentry.json', isFile: () => true, isDirectory: () => false },
      { name: 'grafana.json', isFile: () => true, isDirectory: () => false },
    ] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockImplementation(((path: string) => {
      if (path.endsWith('sentry.json')) {
        return JSON.stringify([
          {
            pr_title: 'Fix sentry bug',
            url: 'https://github.com/getsentry/sentry/pull/67876',
            comments: [],
          },
          {
            pr_title: 'Fix sentry bug 2',
            url: 'https://github.com/ai-code-review-evaluation/sentry-greptile/pull/5',
            comments: [],
          },
        ]);
      }

      return JSON.stringify([
        {
          pr_title: 'Fix grafana bug',
          url: 'https://github.com/grafana/grafana/pull/101',
          comments: [],
        },
      ]);
    }) as typeof readFileSync);

    const tasks = discoverTasks('/golden');

    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ project: 'sentry', prNumber: '67876' });
    expect(tasks[1]).toMatchObject({ project: 'sentry', prNumber: '5' });
    expect(tasks[2]).toMatchObject({ project: 'grafana', prNumber: '101' });
  });

  it('filters flat golden_comments files by project name', () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockReturnValue([
      { name: 'sentry.json', isFile: () => true, isDirectory: () => false },
      { name: 'grafana.json', isFile: () => true, isDirectory: () => false },
    ] as unknown as ReturnType<typeof readdirSync>);

    mockReadFileSync.mockReturnValue(
      JSON.stringify([
        {
          pr_title: 'Fix bug',
          url: 'https://github.com/grafana/grafana/pull/101',
          comments: [],
        },
      ]) as unknown as ReturnType<typeof readFileSync>
    );

    const tasks = discoverTasks('/golden', 'grafana');

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.project).toBe('grafana');
  });

  it('skips non-directory entries', () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation(((path: string) => {
      if (path === '/golden') {
        return [
          { name: 'readme.md', isDirectory: () => false },
          { name: 'project-a', isDirectory: () => true },
        ] as unknown as ReturnType<typeof readdirSync>;
      }
      return ['1.json'] as unknown as ReturnType<typeof readdirSync>;
    }) as unknown as typeof readdirSync);

    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        pr_title: 'Test',
        url: 'https://github.com/org/repo/pull/1',
        comments: [],
      }) as unknown as ReturnType<typeof readFileSync>
    );

    const tasks = discoverTasks('/golden');

    expect(tasks).toHaveLength(1);
  });

  it('warns and skips malformed golden files', () => {
    mockExistsSync.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockReaddirSync.mockImplementation(((path: string) => {
      if (path === '/golden') {
        return [{ name: 'project-a', isDirectory: () => true }] as unknown as ReturnType<
          typeof readdirSync
        >;
      }
      return ['bad.json'] as unknown as ReturnType<typeof readdirSync>;
    }) as unknown as typeof readdirSync);

    mockReadFileSync.mockImplementation(() => {
      throw new Error('invalid JSON');
    });

    const tasks = discoverTasks('/golden');

    expect(tasks).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping'));

    warnSpy.mockRestore();
  });

  it('warns and skips flat entries with invalid PR URLs', () => {
    mockExistsSync.mockReturnValue(true);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    mockReaddirSync.mockReturnValue([
      { name: 'sentry.json', isFile: () => true, isDirectory: () => false },
    ] as unknown as ReturnType<typeof readdirSync>);
    mockReadFileSync.mockReturnValue(
      JSON.stringify([
        { pr_title: 'Bad url', url: 'https://github.com/getsentry/sentry', comments: [] },
      ]) as unknown as ReturnType<typeof readFileSync>
    );

    const tasks = discoverTasks('/golden');

    expect(tasks).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('invalid PR URL'));

    warnSpy.mockRestore();
  });
});

describe('updateBenchmarkData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects odd-ai-reviewers review stubs into benchmark data', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        'https://github.com/getsentry/sentry/pull/67876': {
          pr_title: 'Existing title',
          source_repo: 'sentry',
          golden_comments: [{ comment: 'Issue', severity: 'High' }],
          reviews: [
            {
              tool: 'claude',
              repo_name: 'sentry__claude',
              pr_url: 'https://example.com',
              review_comments: [],
            },
          ],
        },
      }) as unknown as ReturnType<typeof readFileSync>
    );

    updateBenchmarkData('/tmp/benchmark/results/benchmark_data.json', [makeTask()], makeOptions());

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(String(mockWriteFileSync.mock.calls[0]?.[1]));
    const reviews = written['https://github.com/test-org/test-repo/pull/123'].reviews;
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      tool: 'odd-ai-reviewers',
      repo_name: 'odd-ai-reviewers__generated',
      pr_url: 'https://github.com/test-org/test-repo/pull/123',
    });
  });

  it('replaces an existing odd-ai-reviewers stub without duplicating it', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        'https://github.com/test-org/test-repo/pull/123': {
          pr_title: 'Existing title',
          source_repo: 'test-org/test-repo',
          golden_comments: [{ comment: 'Issue', severity: 'High' }],
          reviews: [
            {
              tool: 'claude',
              repo_name: 'claude__generated',
              pr_url: 'https://example.com',
              review_comments: [],
            },
            {
              tool: 'odd-ai-reviewers',
              repo_name: 'stale',
              pr_url: 'https://stale.example.com',
              review_comments: [{ body: 'stale' }],
            },
          ],
        },
      }) as unknown as ReturnType<typeof readFileSync>
    );

    updateBenchmarkData('/tmp/benchmark/results/benchmark_data.json', [makeTask()], makeOptions());

    const written = JSON.parse(String(mockWriteFileSync.mock.calls[0]?.[1]));
    const reviews = written['https://github.com/test-org/test-repo/pull/123'].reviews;
    expect(reviews).toHaveLength(2);
    expect(
      reviews.filter((review: { tool: string }) => review.tool === 'odd-ai-reviewers')
    ).toHaveLength(1);
  });

  it('removes stale odd-ai-reviewers reviews for URLs outside the current task set', () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        'https://github.com/test-org/test-repo/pull/123': {
          pr_title: 'Current run PR',
          source_repo: 'test-org/test-repo',
          golden_comments: [{ comment: 'Issue', severity: 'High' }],
          reviews: [
            {
              tool: 'odd-ai-reviewers',
              repo_name: 'stale-current',
              pr_url: 'https://stale-current.example.com',
              review_comments: [{ body: 'stale current' }],
            },
            {
              tool: 'claude',
              repo_name: 'claude__generated',
              pr_url: 'https://example.com/current',
              review_comments: [],
            },
          ],
        },
        'https://github.com/other-org/other-repo/pull/456': {
          pr_title: 'Stale PR',
          source_repo: 'other-org/other-repo',
          golden_comments: [{ comment: 'Other issue', severity: 'Medium' }],
          reviews: [
            {
              tool: 'odd-ai-reviewers',
              repo_name: 'stale-other',
              pr_url: 'https://stale-other.example.com',
              review_comments: [{ body: 'stale other' }],
            },
            {
              tool: 'gemini',
              repo_name: 'gemini__generated',
              pr_url: 'https://example.com/other',
              review_comments: [],
            },
          ],
        },
      }) as unknown as ReturnType<typeof readFileSync>
    );

    updateBenchmarkData('/tmp/benchmark/results/benchmark_data.json', [makeTask()], makeOptions());

    const written = JSON.parse(String(mockWriteFileSync.mock.calls[0]?.[1]));
    expect(
      written['https://github.com/test-org/test-repo/pull/123'].reviews.filter(
        (review: { tool: string }) => review.tool === 'odd-ai-reviewers'
      )
    ).toHaveLength(1);
    expect(
      written['https://github.com/other-org/other-repo/pull/456'].reviews.filter(
        (review: { tool: string }) => review.tool === 'odd-ai-reviewers'
      )
    ).toHaveLength(0);
    expect(written['https://github.com/other-org/other-repo/pull/456'].reviews).toEqual([
      {
        tool: 'gemini',
        repo_name: 'gemini__generated',
        pr_url: 'https://example.com/other',
        review_comments: [],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// processPR
// ---------------------------------------------------------------------------

describe('processPR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips PR on CLI failure and returns error', async () => {
    const task = makeTask();
    const options = makeOptions();

    mockExistsSync.mockReturnValue(false);
    mockExecFile
      .mockReturnValueOnce(execOk()) // git clone
      .mockReturnValueOnce(execOk()) // git fetch PR ref
      .mockReturnValueOnce(execOk()) // git checkout pr-head
      .mockReturnValueOnce(execOk('origin/main')) // detect default branch
      .mockReturnValueOnce(execFail('CLI process exited with code 1')); // CLI fails

    const result = await processPR(task, options, '/tmp/work');

    expect(result.error).toBeDefined();
    expect(result.candidates).toEqual([]);
  });

  it('returns candidates from successful CLI output', async () => {
    const task = makeTask();
    const options = makeOptions();
    const cliOutput = {
      findings: [
        { message: 'Bug found', file: 'src/app.ts', line: 10, severity: 'warning' },
        {
          message: 'Vuln detected',
          file: 'src/db.ts',
          line: 5,
          severity: 'critical',
          suggestion: 'Use params',
        },
      ],
    };

    mockFullSequence(cliOutput);

    const result = await processPR(task, options, '/tmp/work');

    expect(result.error).toBeUndefined();
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toEqual({
      text: 'Bug found',
      path: 'src/app.ts',
      line: 10,
      source: 'extracted',
    });
    expect(result.candidates[1]).toEqual({
      text: 'Vuln detected. Suggestion: Use params',
      path: 'src/db.ts',
      line: 5,
      source: 'extracted',
    });
  });

  it('fetches and checks out the PR ref during clone', async () => {
    const task = makeTask();
    const options = makeOptions();

    mockFullSequence({ findings: [] });
    await processPR(task, options, '/tmp/work');

    // Verify git fetch was called with the PR ref
    const fetchCall = mockExecFile.mock.calls.find(
      (call) => call[0] === 'git' && (call[1] as string[])?.[0] === 'fetch'
    );
    expect(fetchCall).toBeDefined();
    expect(fetchCall?.[1]).toContain('pull/123/head:pr-head');

    // Verify git checkout was called for the PR branch
    const checkoutCall = mockExecFile.mock.calls.find(
      (call) => call[0] === 'git' && (call[1] as string[])?.[0] === 'checkout'
    );
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall?.[1]).toContain('pr-head');
  });

  it('uses locally built CLI instead of npx', async () => {
    const task = makeTask();
    const options = makeOptions();

    mockFullSequence({ findings: [] });
    await processPR(task, options, '/tmp/work');

    // Verify node is called (not npx) with the built CLI path
    const nodeCall = mockExecFile.mock.calls.find((call) => call[0] === 'node');
    expect(nodeCall).toBeDefined();
    const args = (nodeCall?.[1] ?? []) as string[];
    expect(args[0]).toContain('main.js');
    expect(args).toContain('local');
    expect(args).toContain('--base');
    expect(args).toContain('--format');
    expect(args).toContain('json');

    // npx was NOT called
    const npxCall = mockExecFile.mock.calls.find((call) => call[0] === 'npx');
    expect(npxCall).toBeUndefined();
  });

  it('passes --base with detected default branch', async () => {
    const task = makeTask();
    const options = makeOptions();

    mockExistsSync.mockReturnValue(false);
    mockExecFile
      .mockReturnValueOnce(execOk()) // clone
      .mockReturnValueOnce(execOk()) // fetch
      .mockReturnValueOnce(execOk()) // checkout
      .mockReturnValueOnce(execOk('origin/develop')) // detect default branch → origin/develop
      .mockReturnValueOnce(execOk(JSON.stringify({ findings: [] }))); // CLI

    await processPR(task, options, '/tmp/work');

    const nodeCall = mockExecFile.mock.calls.find((call) => call[0] === 'node');
    expect(nodeCall).toBeDefined();
    const args = (nodeCall?.[1] ?? []) as string[];
    const baseIdx = args.indexOf('--base');
    expect(baseIdx).toBeGreaterThan(-1);
    expect(args[baseIdx + 1]).toBe('origin/develop');
  });

  it('falls back to origin/main when default branch detection fails', async () => {
    const task = makeTask();
    const options = makeOptions();

    mockExistsSync.mockReturnValue(false);
    mockExecFile
      .mockReturnValueOnce(execOk()) // clone
      .mockReturnValueOnce(execOk()) // fetch
      .mockReturnValueOnce(execOk()) // checkout
      .mockReturnValueOnce(execFail('Not a symbolic ref')) // detect default branch fails
      .mockReturnValueOnce(execOk(JSON.stringify({ findings: [] }))); // CLI

    await processPR(task, options, '/tmp/work');

    const nodeCall = mockExecFile.mock.calls.find((call) => call[0] === 'node');
    expect(nodeCall).toBeDefined();
    const args = (nodeCall?.[1] ?? []) as string[];
    const baseIdx = args.indexOf('--base');
    expect(baseIdx).toBeGreaterThan(-1);
    expect(args[baseIdx + 1]).toBe('origin/main');
  });

  it('dry-run mode produces output without running real CLI', async () => {
    const task = makeTask();
    const options = makeOptions({ dryRun: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = await processPR(task, options, '/tmp/work');

    expect(result.error).toBeUndefined();
    expect(result.candidates).toEqual([]);
    // execFile should NOT have been called at all in dry-run
    expect(mockExecFile).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('dry-run returns error for unparseable PR URL', async () => {
    const task = makeTask({
      golden: {
        pr_title: 'Bad PR',
        url: 'not-a-valid-url',
        comments: [],
      },
    });
    const options = makeOptions({ dryRun: true });

    const result = await processPR(task, options, '/tmp/work');

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Cannot parse repo URL');
  });

  it('cleans up clone directory after processing when cleanup is enabled', async () => {
    const task = makeTask();
    const options = makeOptions({ cleanup: true });

    // First: existsSync for clone dir check (false = needs clone)
    // After: existsSync for cleanup check (true = dir exists)
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);

    mockExecFile
      .mockReturnValueOnce(execOk()) // git clone
      .mockReturnValueOnce(execOk()) // git fetch PR ref
      .mockReturnValueOnce(execOk()) // git checkout pr-head
      .mockReturnValueOnce(execOk('origin/main')) // detect default branch
      .mockReturnValueOnce(execOk(JSON.stringify({ findings: [] }))); // CLI

    await processPR(task, options, '/tmp/work');

    expect(mockRmSync).toHaveBeenCalled();
  });

  it('skips cleanup when cleanup option is false', async () => {
    const task = makeTask();
    const options = makeOptions({ cleanup: false });

    mockExistsSync.mockReturnValue(false);
    mockExecFile
      .mockReturnValueOnce(execOk()) // git clone
      .mockReturnValueOnce(execOk()) // git fetch PR ref
      .mockReturnValueOnce(execOk()) // git checkout pr-head
      .mockReturnValueOnce(execOk('origin/main')) // detect default branch
      .mockReturnValueOnce(execOk(JSON.stringify({ findings: [] }))); // CLI

    await processPR(task, options, '/tmp/work');

    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it('handles empty findings array from CLI', async () => {
    const task = makeTask();
    const options = makeOptions();

    mockFullSequence({ findings: [] });

    const result = await processPR(task, options, '/tmp/work');

    expect(result.candidates).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('skips clone when directory already exists', async () => {
    const task = makeTask();
    const options = makeOptions();

    // Clone dir already exists — skip clone (3 git calls skipped)
    mockExistsSync.mockReturnValueOnce(true);

    mockExecFile
      .mockReturnValueOnce(execOk('origin/main')) // detect default branch
      .mockReturnValueOnce(execOk(JSON.stringify({ findings: [] }))); // CLI

    await processPR(task, options, '/tmp/work');

    // Only 2 calls (detect branch + review), not 5 (clone + fetch + checkout + detect + review)
    expect(mockExecFile).toHaveBeenCalledTimes(2);
  });
});
