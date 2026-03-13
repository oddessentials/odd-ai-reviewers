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
  type CLIFinding,
  type BenchmarkCandidate,
  type AdapterOptions,
  type PRTask,
} from '../benchmark-adapter.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

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

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';

const mockExecFileSync = vi.mocked(execFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockReaddirSync = vi.mocked(readdirSync);
const mockRmSync = vi.mocked(rmSync);

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

  /** Shorthand for a successful execFileSync return (e.g., git clone/fetch/checkout). */
  const gitOk = () => '' as unknown as ReturnType<typeof execFileSync>;

  /**
   * Set up mocks for a full clone + review sequence:
   *   Clone: 3 calls (git clone, git fetch PR head, git checkout pr-head)
   *   Review: 2 calls (git rev-parse origin/HEAD, node <cli> local)
   */
  function mockFullSequence(cliOutput: object): void {
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementationOnce(gitOk); // git clone
    mockExecFileSync.mockImplementationOnce(gitOk); // git fetch PR ref
    mockExecFileSync.mockImplementationOnce(gitOk); // git checkout pr-head
    mockExecFileSync.mockImplementationOnce(
      () => 'origin/main' as unknown as ReturnType<typeof execFileSync>
    ); // detect default branch
    mockExecFileSync.mockImplementationOnce(
      () => JSON.stringify(cliOutput) as unknown as ReturnType<typeof execFileSync>
    ); // node <cli> local
  }

  it('skips PR on CLI failure and returns error', () => {
    const task = makeTask();
    const options = makeOptions();

    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementationOnce(gitOk); // git clone
    mockExecFileSync.mockImplementationOnce(gitOk); // git fetch PR ref
    mockExecFileSync.mockImplementationOnce(gitOk); // git checkout pr-head
    mockExecFileSync.mockImplementationOnce(
      () => 'origin/main' as unknown as ReturnType<typeof execFileSync>
    ); // detect default branch
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('CLI process exited with code 1');
    }); // CLI fails

    const result = processPR(task, options, '/tmp/work');

    expect(result.error).toBeDefined();
    expect(result.candidates).toEqual([]);
  });

  it('returns candidates from successful CLI output', () => {
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

    const result = processPR(task, options, '/tmp/work');

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

  it('fetches and checks out the PR ref during clone', () => {
    const task = makeTask();
    const options = makeOptions();

    mockFullSequence({ findings: [] });
    processPR(task, options, '/tmp/work');

    // Verify git fetch was called with the PR ref
    const fetchCall = mockExecFileSync.mock.calls.find(
      (call) => call[0] === 'git' && (call[1] as string[])?.[0] === 'fetch'
    );
    expect(fetchCall).toBeDefined();
    expect(fetchCall?.[1]).toContain('pull/123/head:pr-head');

    // Verify git checkout was called for the PR branch
    const checkoutCall = mockExecFileSync.mock.calls.find(
      (call) => call[0] === 'git' && (call[1] as string[])?.[0] === 'checkout'
    );
    expect(checkoutCall).toBeDefined();
    expect(checkoutCall?.[1]).toContain('pr-head');
  });

  it('uses locally built CLI instead of npx', () => {
    const task = makeTask();
    const options = makeOptions();

    mockFullSequence({ findings: [] });
    processPR(task, options, '/tmp/work');

    // Verify node is called (not npx) with the built CLI path
    const nodeCall = mockExecFileSync.mock.calls.find((call) => call[0] === 'node');
    expect(nodeCall).toBeDefined();
    const args = (nodeCall?.[1] ?? []) as string[];
    expect(args[0]).toContain('main.js');
    expect(args).toContain('local');
    expect(args).toContain('--base');
    expect(args).toContain('--format');
    expect(args).toContain('json');

    // npx was NOT called
    const npxCall = mockExecFileSync.mock.calls.find((call) => call[0] === 'npx');
    expect(npxCall).toBeUndefined();
  });

  it('passes --base with detected default branch', () => {
    const task = makeTask();
    const options = makeOptions();

    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementationOnce(gitOk); // clone
    mockExecFileSync.mockImplementationOnce(gitOk); // fetch
    mockExecFileSync.mockImplementationOnce(gitOk); // checkout
    mockExecFileSync.mockImplementationOnce(
      () => 'origin/develop' as unknown as ReturnType<typeof execFileSync>
    ); // detect default branch → origin/develop
    mockExecFileSync.mockImplementationOnce(
      () => JSON.stringify({ findings: [] }) as unknown as ReturnType<typeof execFileSync>
    ); // CLI

    processPR(task, options, '/tmp/work');

    const nodeCall = mockExecFileSync.mock.calls.find((call) => call[0] === 'node');
    expect(nodeCall).toBeDefined();
    const args = (nodeCall?.[1] ?? []) as string[];
    const baseIdx = args.indexOf('--base');
    expect(baseIdx).toBeGreaterThan(-1);
    expect(args[baseIdx + 1]).toBe('origin/develop');
  });

  it('falls back to origin/main when default branch detection fails', () => {
    const task = makeTask();
    const options = makeOptions();

    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementationOnce(gitOk); // clone
    mockExecFileSync.mockImplementationOnce(gitOk); // fetch
    mockExecFileSync.mockImplementationOnce(gitOk); // checkout
    mockExecFileSync.mockImplementationOnce(() => {
      throw new Error('Not a symbolic ref');
    }); // detect default branch fails
    mockExecFileSync.mockImplementationOnce(
      () => JSON.stringify({ findings: [] }) as unknown as ReturnType<typeof execFileSync>
    ); // CLI

    processPR(task, options, '/tmp/work');

    const nodeCall = mockExecFileSync.mock.calls.find((call) => call[0] === 'node');
    expect(nodeCall).toBeDefined();
    const args = (nodeCall?.[1] ?? []) as string[];
    const baseIdx = args.indexOf('--base');
    expect(baseIdx).toBeGreaterThan(-1);
    expect(args[baseIdx + 1]).toBe('origin/main');
  });

  it('dry-run mode produces output without running real CLI', () => {
    const task = makeTask();
    const options = makeOptions({ dryRun: true });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    const result = processPR(task, options, '/tmp/work');

    expect(result.error).toBeUndefined();
    expect(result.candidates).toEqual([]);
    // execFileSync should NOT have been called at all in dry-run
    expect(mockExecFileSync).not.toHaveBeenCalled();

    logSpy.mockRestore();
  });

  it('dry-run returns error for unparseable PR URL', () => {
    const task = makeTask({
      golden: {
        pr_title: 'Bad PR',
        url: 'not-a-valid-url',
        comments: [],
      },
    });
    const options = makeOptions({ dryRun: true });

    const result = processPR(task, options, '/tmp/work');

    expect(result.error).toBeDefined();
    expect(result.error).toContain('Cannot parse repo URL');
  });

  it('cleans up clone directory after processing when cleanup is enabled', () => {
    const task = makeTask();
    const options = makeOptions({ cleanup: true });

    // First: existsSync for clone dir check (false = needs clone)
    // After: existsSync for cleanup check (true = dir exists)
    mockExistsSync.mockReturnValueOnce(false).mockReturnValueOnce(true);

    mockExecFileSync.mockImplementationOnce(gitOk); // git clone
    mockExecFileSync.mockImplementationOnce(gitOk); // git fetch PR ref
    mockExecFileSync.mockImplementationOnce(gitOk); // git checkout pr-head
    mockExecFileSync.mockImplementationOnce(
      () => 'origin/main' as unknown as ReturnType<typeof execFileSync>
    ); // detect default branch
    mockExecFileSync.mockImplementationOnce(
      () => JSON.stringify({ findings: [] }) as unknown as ReturnType<typeof execFileSync>
    ); // CLI

    processPR(task, options, '/tmp/work');

    expect(mockRmSync).toHaveBeenCalled();
  });

  it('skips cleanup when cleanup option is false', () => {
    const task = makeTask();
    const options = makeOptions({ cleanup: false });

    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementationOnce(gitOk); // git clone
    mockExecFileSync.mockImplementationOnce(gitOk); // git fetch PR ref
    mockExecFileSync.mockImplementationOnce(gitOk); // git checkout pr-head
    mockExecFileSync.mockImplementationOnce(
      () => 'origin/main' as unknown as ReturnType<typeof execFileSync>
    ); // detect default branch
    mockExecFileSync.mockImplementationOnce(
      () => JSON.stringify({ findings: [] }) as unknown as ReturnType<typeof execFileSync>
    ); // CLI

    processPR(task, options, '/tmp/work');

    expect(mockRmSync).not.toHaveBeenCalled();
  });

  it('handles empty findings array from CLI', () => {
    const task = makeTask();
    const options = makeOptions();

    mockFullSequence({ findings: [] });

    const result = processPR(task, options, '/tmp/work');

    expect(result.candidates).toEqual([]);
    expect(result.error).toBeUndefined();
  });

  it('skips clone when directory already exists', () => {
    const task = makeTask();
    const options = makeOptions();

    // Clone dir already exists — skip clone (3 git calls skipped)
    mockExistsSync.mockReturnValueOnce(true);

    mockExecFileSync.mockImplementationOnce(
      () => 'origin/main' as unknown as ReturnType<typeof execFileSync>
    ); // detect default branch
    mockExecFileSync.mockImplementationOnce(
      () => JSON.stringify({ findings: [] }) as unknown as ReturnType<typeof execFileSync>
    ); // CLI

    processPR(task, options, '/tmp/work');

    // Only 2 calls (detect branch + review), not 5 (clone + fetch + checkout + detect + review)
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
  });
});
