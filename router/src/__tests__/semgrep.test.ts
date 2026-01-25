/**
 * Semgrep Agent Tests
 *
 * Tests for the Semgrep static analysis agent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { semgrepAgent, mapSeverity } from '../agents/semgrep.js';
import type { AgentContext } from '../agents/types.js';
import type { DiffFile } from '../diff.js';

// Mock child_process - Node core modules work well with vitest
vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
}));

// Mock path-filter - same directory, should work
vi.mock('../agents/path-filter.js', () => ({
  filterSafePaths: vi.fn((paths: string[], _agentId: string) => ({
    safePaths: paths,
    skippedCount: 0,
    skippedSamples: [],
  })),
}));

// Mock security - same directory
vi.mock('../agents/security.js', () => ({
  buildAgentEnv: vi.fn((agentId, env) => ({ ...env, AGENT_ID: agentId })),
}));

import { execFileSync } from 'child_process';
import { filterSafePaths } from '../agents/path-filter.js';

describe('semgrepAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('agent metadata', () => {
    it('should have correct id', () => {
      expect(semgrepAgent.id).toBe('semgrep');
    });

    it('should have correct name', () => {
      expect(semgrepAgent.name).toBe('Semgrep');
    });

    it('should not use LLM', () => {
      expect(semgrepAgent.usesLlm).toBe(false);
    });
  });

  describe('supports()', () => {
    const createFile = (
      path: string,
      status: 'added' | 'modified' | 'deleted' = 'modified'
    ): DiffFile => ({
      path,
      status,
      additions: 10,
      deletions: 5,
    });

    describe('supported extensions', () => {
      const supportedExtensions = [
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.py',
        '.go',
        '.java',
        '.rb',
        '.php',
        '.c',
        '.cpp',
        '.cs',
        '.rs',
        '.swift',
        '.kt',
        '.scala',
      ];

      it.each(supportedExtensions)('should support %s files', (ext) => {
        expect(semgrepAgent.supports(createFile(`src/file${ext}`))).toBe(true);
      });
    });

    describe('unsupported extensions', () => {
      const unsupportedExtensions = ['.txt', '.md', '.json', '.yaml', '.html', '.css', '.svg'];

      it.each(unsupportedExtensions)('should not support %s files', (ext) => {
        expect(semgrepAgent.supports(createFile(`file${ext}`))).toBe(false);
      });
    });

    it('should not support deleted files', () => {
      expect(semgrepAgent.supports(createFile('file.ts', 'deleted'))).toBe(false);
    });

    it('should support added files with valid extension', () => {
      expect(semgrepAgent.supports(createFile('file.py', 'added'))).toBe(true);
    });

    it('should support deeply nested paths', () => {
      expect(semgrepAgent.supports(createFile('src/components/deep/nested/file.tsx'))).toBe(true);
    });
  });
});

describe('mapSeverity', () => {
  it('should map ERROR to error', () => {
    expect(mapSeverity('ERROR')).toBe('error');
  });

  it('should map error (lowercase) to error', () => {
    expect(mapSeverity('error')).toBe('error');
  });

  it('should map WARNING to warning', () => {
    expect(mapSeverity('WARNING')).toBe('warning');
  });

  it('should map warning (lowercase) to warning', () => {
    expect(mapSeverity('warning')).toBe('warning');
  });

  it('should map INFO to info', () => {
    expect(mapSeverity('INFO')).toBe('info');
  });

  it('should map unknown severity to info', () => {
    expect(mapSeverity('UNKNOWN')).toBe('info');
  });

  it('should map empty string to info', () => {
    expect(mapSeverity('')).toBe('info');
  });

  it('should handle mixed case', () => {
    expect(mapSeverity('Error')).toBe('error');
    expect(mapSeverity('Warning')).toBe('warning');
  });
});

describe('semgrepAgent.run()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset filterSafePaths to return all paths as safe
    vi.mocked(filterSafePaths).mockImplementation((paths: string[], _agentId: string) => ({
      safePaths: paths,
      skippedCount: 0,
      skippedSamples: [],
    }));
  });

  const createContext = (files: DiffFile[] = []): AgentContext => ({
    repoPath: '/test/repo',
    diff: {
      files: [],
      totalAdditions: 10,
      totalDeletions: 5,
      baseSha: 'abc123',
      headSha: 'def456',
      contextLines: 3,
      source: 'local-git',
    },
    files,
    config: {
      version: 1,
      trusted_only: true,
      triggers: { on: ['pull_request'], branches: ['main'] },
      passes: [],
      limits: {
        max_files: 50,
        max_diff_lines: 2000,
        max_tokens_per_pr: 12000,
        max_usd_per_pr: 1.0,
        monthly_budget_usd: 100,
      },
      models: { default: 'gpt-4o-mini' },
      reporting: {},
      gating: { enabled: false, fail_on_severity: 'error' },
    },
    diffContent: 'test diff',
    prNumber: 123,
    env: {},
    effectiveModel: 'gpt-4o-mini',
    provider: 'openai',
  });

  it('should return empty result for no supported files', async () => {
    const context = createContext([
      { path: 'readme.md', status: 'modified', additions: 10, deletions: 5 },
      { path: 'config.json', status: 'modified', additions: 5, deletions: 0 },
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.metrics.filesProcessed).toBe(0);
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it('should return empty result when all paths are filtered out', async () => {
    vi.mocked(filterSafePaths).mockReturnValue({
      safePaths: [],
      skippedCount: 2,
      skippedSamples: ['file.ts'],
    });

    const context = createContext([
      { path: 'file.ts', status: 'modified', additions: 10, deletions: 5 },
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(0);
    expect(result.metrics.filesProcessed).toBe(0);
    expect(vi.mocked(execFileSync)).not.toHaveBeenCalled();
  });

  it('should call execFileSync with correct arguments', async () => {
    const semgrepOutput = JSON.stringify({
      results: [],
      errors: [],
    });

    vi.mocked(execFileSync).mockReturnValue(semgrepOutput);

    const context = createContext([
      { path: 'src/app.ts', status: 'modified', additions: 10, deletions: 5 },
      { path: 'lib/util.js', status: 'added', additions: 20, deletions: 0 },
    ]);

    await semgrepAgent.run(context);

    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      'semgrep',
      ['scan', '--config=auto', '--json', 'src/app.ts', 'lib/util.js'],
      expect.objectContaining({
        cwd: '/test/repo',
        encoding: 'utf-8',
        shell: false,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 300000,
      })
    );
  });

  it('should parse findings from successful semgrep output', async () => {
    const semgrepOutput = JSON.stringify({
      results: [
        {
          check_id: 'typescript.security.xss',
          path: 'src/app.ts',
          start: { line: 10, col: 5 },
          end: { line: 12, col: 10 },
          extra: {
            message: 'Potential XSS vulnerability',
            severity: 'ERROR',
            fix: 'Use escapeHtml()',
          },
        },
        {
          check_id: 'typescript.best-practices.unused-var',
          path: 'lib/util.js',
          start: { line: 5, col: 1 },
          end: { line: 5, col: 20 },
          extra: {
            message: 'Unused variable',
            severity: 'WARNING',
          },
        },
      ],
      errors: [],
    });

    vi.mocked(execFileSync).mockReturnValue(semgrepOutput);

    const context = createContext([
      { path: 'src/app.ts', status: 'modified', additions: 10, deletions: 5 },
      { path: 'lib/util.js', status: 'modified', additions: 5, deletions: 2 },
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(2);
    expect(result.findings[0]).toEqual({
      severity: 'error',
      file: 'src/app.ts',
      line: 10,
      endLine: 12,
      message: 'Potential XSS vulnerability',
      suggestion: 'Use escapeHtml()',
      ruleId: 'typescript.security.xss',
      sourceAgent: 'semgrep',
    });
    expect(result.findings[1]).toEqual({
      severity: 'warning',
      file: 'lib/util.js',
      line: 5,
      endLine: 5,
      message: 'Unused variable',
      suggestion: undefined,
      ruleId: 'typescript.best-practices.unused-var',
      sourceAgent: 'semgrep',
    });
  });

  it('should handle semgrep exit with non-zero but valid JSON in stdout', async () => {
    // Semgrep exits non-zero when findings exist
    const error = new Error('Process exited with code 1') as Error & { stdout: string };
    error.stdout = JSON.stringify({
      results: [
        {
          check_id: 'rule.id',
          path: 'file.ts',
          start: { line: 1, col: 1 },
          end: { line: 1, col: 10 },
          extra: {
            message: 'Finding message',
            severity: 'WARNING',
          },
        },
      ],
      errors: [],
    });

    vi.mocked(execFileSync).mockImplementation(() => {
      throw error;
    });

    const context = createContext([
      { path: 'file.ts', status: 'modified', additions: 10, deletions: 5 },
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.success).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.message).toBe('Finding message');
  });

  it('should return error result when semgrep fails without valid output', async () => {
    const error = new Error('Semgrep binary not found');
    vi.mocked(execFileSync).mockImplementation(() => {
      throw error;
    });

    const context = createContext([
      { path: 'file.ts', status: 'modified', additions: 10, deletions: 5 },
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Semgrep binary not found');
    expect(result.findings).toHaveLength(0);
  });

  it('should return error result when stdout contains invalid JSON', async () => {
    const error = new Error('Process failed') as Error & { stdout: string };
    error.stdout = 'This is not valid JSON';

    vi.mocked(execFileSync).mockImplementation(() => {
      throw error;
    });

    const context = createContext([
      { path: 'file.ts', status: 'modified', additions: 10, deletions: 5 },
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Process failed');
  });

  it('should include metrics in result', async () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ results: [], errors: [] }));

    const context = createContext([
      { path: 'file1.ts', status: 'modified', additions: 10, deletions: 5 },
      { path: 'file2.py', status: 'modified', additions: 5, deletions: 2 },
      { path: 'readme.md', status: 'modified', additions: 1, deletions: 0 }, // Not supported
    ]);

    const result = await semgrepAgent.run(context);

    expect(result.metrics.filesProcessed).toBe(2); // Only .ts and .py
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
  });
});
