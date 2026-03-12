/**
 * Context Loader Tests
 *
 * Tests for sanitization, loading, truncation, and prompt injection resistance.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  sanitizeContextField,
  loadProjectRules,
  loadPRDescription,
  truncateContext,
  loadGitHubEventPR,
  fetchGitHubPRDetails,
} from '../../src/context-loader.js';

describe('sanitizeContextField', () => {
  it('should strip null bytes', () => {
    expect(sanitizeContextField('hello\0world')).toBe('helloworld');
  });

  it('should remove control characters except \\n \\r \\t', () => {
    // \x01 (SOH), \x02 (STX) should be removed
    // \t (0x09), \n (0x0A), \r (0x0D) should be preserved
    const input = 'hello\x01\x02\tworld\n\rend';
    expect(sanitizeContextField(input)).toBe('hello\tworld\n\rend');
  });

  it('should truncate to maxLength', () => {
    const input = 'a'.repeat(3000);
    const result = sanitizeContextField(input, 2000);
    expect(result.length).toBe(2000);
  });

  it('should handle empty string', () => {
    expect(sanitizeContextField('')).toBe('');
  });

  it('should handle string under maxLength without truncation', () => {
    const input = 'short string';
    expect(sanitizeContextField(input)).toBe('short string');
  });

  it('should handle custom maxLength', () => {
    const input = 'abcdefghij';
    expect(sanitizeContextField(input, 5)).toBe('abcde');
  });
});

describe('loadProjectRules', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'context-loader-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return content when CLAUDE.md exists', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), '# Project Rules\nUse TypeScript.');
    const result = await loadProjectRules(tempDir);
    expect(result).toBe('# Project Rules\nUse TypeScript.');
  });

  it('should return undefined when CLAUDE.md is missing', async () => {
    const result = await loadProjectRules(tempDir);
    expect(result).toBeUndefined();
  });

  it('should sanitize content', async () => {
    await writeFile(join(tempDir, 'CLAUDE.md'), 'rules\0with\x01nulls');
    const result = await loadProjectRules(tempDir);
    expect(result).toBe('ruleswithnulls');
  });

  it('should not truncate long CLAUDE.md content before budgeting', async () => {
    const longRules = `# Rules\n${'a'.repeat(3000)}`;
    await writeFile(join(tempDir, 'CLAUDE.md'), longRules);

    const result = await loadProjectRules(tempDir);

    expect(result).toBe(longRules);
    expect(result?.length).toBe(longRules.length);
  });
});

describe('loadPRDescription', () => {
  it('should combine title and body', async () => {
    const result = await loadPRDescription('Fix bug', 'This fixes the login issue.');
    expect(result).toBe('Fix bug\n\nThis fixes the login issue.');
  });

  it('should return undefined when both empty', async () => {
    const result = await loadPRDescription(undefined, undefined);
    expect(result).toBeUndefined();
  });

  it('should return undefined when both are empty strings', async () => {
    const result = await loadPRDescription('', '');
    expect(result).toBeUndefined();
  });

  it('should handle title-only', async () => {
    const result = await loadPRDescription('Fix bug', undefined);
    expect(result).toBe('Fix bug');
  });

  it('should handle body-only', async () => {
    const result = await loadPRDescription(undefined, 'Description body');
    expect(result).toBe('Description body');
  });

  it('should sanitize combined content', async () => {
    const result = await loadPRDescription('Title\0', 'Body\x01text');
    expect(result).toBe('Title\n\nBodytext');
  });
});

describe('truncateContext', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  it('should not truncate when under budget', () => {
    const result = truncateContext('rules', 'desc', 'diff', 1000);
    expect(result.projectRules).toBe('rules');
    expect(result.prDescription).toBe('desc');
    expect(result.truncated).toBe(false);
  });

  it('should truncate projectRules first when over budget', () => {
    // Budget: 100 tokens = 400 chars, 90% usable = 360
    // diff = 300 chars, context budget = 60
    const rules = 'a'.repeat(200);
    const desc = 'b'.repeat(30);
    const diff = 'c'.repeat(300);
    const result = truncateContext(rules, desc, diff, 100);

    expect(result.truncated).toBe(true);
    // projectRules should be truncated
    expect(result.projectRules?.length).toBeLessThan(200);
    expect(result.projectRules).toContain('[truncated]');
  });

  it('should truncate prDescription second when still over budget', () => {
    // Budget: 50 tokens = 200 chars, 90% usable = 180
    // diff = 170 chars, context budget = 10
    // rules = 5 chars (fits), desc = 100 chars (doesn't fit)
    const rules = 'rules';
    const desc = 'd'.repeat(100);
    const diff = 'x'.repeat(170);
    const result = truncateContext(rules, desc, diff, 50);

    expect(result.truncated).toBe(true);
    // prDescription should be truncated
    if (result.prDescription) {
      expect(result.prDescription).toContain('[truncated]');
    }
  });

  it('should append [truncated] indicator', () => {
    const rules = 'a'.repeat(500);
    const diff = 'x'.repeat(300);
    // Budget: 100 tokens = 400 chars, 90% usable = 360, context = 60
    const result = truncateContext(rules, undefined, diff, 100);

    expect(result.truncated).toBe(true);
    expect(result.projectRules).toContain('[truncated]');
  });

  it('should preserve diff content intact (never truncates diff)', () => {
    const diff = 'important diff content';
    const result = truncateContext('rules', 'desc', diff, 1000);
    // diff is not returned from truncateContext, just used for budget calculation
    // Verify context was not unnecessarily truncated
    expect(result.projectRules).toBe('rules');
    expect(result.prDescription).toBe('desc');
  });

  it('should log truncation events', () => {
    const rules = 'a'.repeat(500);
    const diff = 'x'.repeat(300);
    truncateContext(rules, undefined, diff, 100);

    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('[router] [context-loader]')
    );
  });

  it('should set both to undefined when no budget for context', () => {
    // Budget: 10 tokens = 40 chars, 90% = 36, diff = 100 -> context budget < 0
    const result = truncateContext('rules', 'desc', 'x'.repeat(100), 10);
    expect(result.projectRules).toBeUndefined();
    expect(result.prDescription).toBeUndefined();
    expect(result.truncated).toBe(true);
  });

  it('should drop projectRules when context budget is smaller than truncation marker', () => {
    // Budget: 100 tokens = 400 chars, 90% = 360
    // diff = 355 chars -> context budget = 5 chars
    // ' [truncated]' is 12 chars, so 5 < 12 -> must drop, not append marker
    const rules = 'a'.repeat(50);
    const diff = 'x'.repeat(355);
    const result = truncateContext(rules, undefined, diff, 100);

    expect(result.truncated).toBe(true);
    expect(result.projectRules).toBeUndefined();
    // The result must not exceed the context budget
  });

  it('should drop prDescription when remaining budget is smaller than truncation marker', () => {
    // Budget: 100 tokens = 400 chars, 90% = 360
    // diff = 340 chars -> context budget = 20 chars
    // rules = 15 chars (fits, no truncation needed) -> remaining = 5 chars
    // ' [truncated]' is 12 chars, so 5 < 12 -> must drop desc
    const rules = 'a'.repeat(15);
    const desc = 'd'.repeat(50);
    const diff = 'x'.repeat(340);
    const result = truncateContext(rules, desc, diff, 100);

    expect(result.truncated).toBe(true);
    expect(result.projectRules).toBe(rules);
    expect(result.prDescription).toBeUndefined();
  });

  it('should never return a result that exceeds the context budget', () => {
    // Exhaustive check across various tiny budgets
    for (let tokens = 1; tokens <= 20; tokens++) {
      const budget = tokens * 4;
      const contextBudget = budget * 0.9;
      const diffLen = Math.floor(contextBudget * 0.8); // leave small context room
      const diff = 'x'.repeat(diffLen);
      const rules = 'a'.repeat(100);
      const desc = 'b'.repeat(100);

      const result = truncateContext(rules, desc, diff, tokens);
      const totalContext = (result.projectRules?.length ?? 0) + (result.prDescription?.length ?? 0);
      const actualContextBudget = budget * 0.9 - diffLen;

      expect(totalContext).toBeLessThanOrEqual(actualContextBudget);
    }
  });
});

describe('loadGitHubEventPR', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'github-event-test-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return title and body from pull_request event', async () => {
    const eventData = {
      pull_request: {
        title: 'Fix the thing',
        body: 'This fixes a bug in the thing',
        number: 42,
      },
    };
    const eventPath = join(tempDir, 'event.json');
    await writeFile(eventPath, JSON.stringify(eventData));

    const result = await loadGitHubEventPR(eventPath);
    expect(result.title).toBe('Fix the thing');
    expect(result.body).toBe('This fixes a bug in the thing');
  });

  it('should return empty object when eventPath is undefined', async () => {
    const result = await loadGitHubEventPR(undefined);
    expect(result).toEqual({});
  });

  it('should return empty object for push events (no pull_request key)', async () => {
    const eventData = {
      ref: 'refs/heads/main',
      after: 'abc123',
    };
    const eventPath = join(tempDir, 'push-event.json');
    await writeFile(eventPath, JSON.stringify(eventData));

    const result = await loadGitHubEventPR(eventPath);
    expect(result.title).toBeUndefined();
    expect(result.body).toBeUndefined();
  });

  it('should return empty object when file does not exist', async () => {
    const result = await loadGitHubEventPR(join(tempDir, 'nonexistent.json'));
    expect(result).toEqual({});
  });

  it('should handle malformed JSON gracefully', async () => {
    const eventPath = join(tempDir, 'malformed.json');
    await writeFile(eventPath, '{not valid json!!!');

    const result = await loadGitHubEventPR(eventPath);
    expect(result).toEqual({});
  });

  it('should handle null body gracefully', async () => {
    const eventData = {
      pull_request: {
        title: 'PR with null body',
        body: null,
        number: 99,
      },
    };
    const eventPath = join(tempDir, 'null-body.json');
    await writeFile(eventPath, JSON.stringify(eventData));

    const result = await loadGitHubEventPR(eventPath);
    expect(result.title).toBe('PR with null body');
    expect(result.body).toBeUndefined();
  });

  it('should handle empty file gracefully', async () => {
    const eventPath = join(tempDir, 'empty.json');
    await writeFile(eventPath, '');

    const result = await loadGitHubEventPR(eventPath);
    expect(result).toEqual({});
  });

  it('should handle binary/corrupt content gracefully', async () => {
    const eventPath = join(tempDir, 'corrupt.json');
    await writeFile(eventPath, Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x80]));

    const result = await loadGitHubEventPR(eventPath);
    expect(result).toEqual({});
  });

  it('should not throw on any error path (fail open)', async () => {
    // Verify that no matter what input we give, the function returns
    // a result (never throws), ensuring the review pipeline continues.
    const cases = [
      undefined,
      '',
      '/nonexistent/deeply/nested/path.json',
      join(tempDir, 'also-missing.json'),
    ];

    for (const eventPath of cases) {
      const result = await loadGitHubEventPR(eventPath);
      expect(result).toBeDefined();
      expect(typeof result).toBe('object');
    }
  });
});

// Mock @octokit/rest for fetchGitHubPRDetails tests
const mockPullsGet = vi.fn();
vi.mock('@octokit/rest', () => ({
  Octokit: class MockOctokit {
    pulls = { get: mockPullsGet };
  },
}));

describe('fetchGitHubPRDetails', () => {
  beforeEach(() => {
    mockPullsGet.mockReset();
  });

  it('should return title and body from the GitHub API', async () => {
    mockPullsGet.mockResolvedValue({
      data: {
        title: 'API PR Title',
        body: 'API PR Body description',
      },
    });

    const result = await fetchGitHubPRDetails('myorg', 'myrepo', 42, 'ghp_faketoken');
    expect(result.title).toBe('API PR Title');
    expect(result.body).toBe('API PR Body description');
    expect(mockPullsGet).toHaveBeenCalledWith({
      owner: 'myorg',
      repo: 'myrepo',
      pull_number: 42,
    });
  });

  it('should handle null body from API', async () => {
    mockPullsGet.mockResolvedValue({
      data: {
        title: 'Title only',
        body: null,
      },
    });

    const result = await fetchGitHubPRDetails('myorg', 'myrepo', 10, 'ghp_faketoken');
    expect(result.title).toBe('Title only');
    expect(result.body).toBeUndefined();
  });

  it('should return empty object on API error (fail open)', async () => {
    mockPullsGet.mockRejectedValue(new Error('Not Found'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await fetchGitHubPRDetails('myorg', 'myrepo', 999, 'ghp_faketoken');

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch PR details from GitHub API'),
      'Not Found'
    );
    warnSpy.mockRestore();
  });

  it('should return empty object on network error (fail open)', async () => {
    mockPullsGet.mockRejectedValue(new TypeError('fetch failed'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await fetchGitHubPRDetails('myorg', 'myrepo', 1, 'ghp_faketoken');

    expect(result).toEqual({});
    warnSpy.mockRestore();
  });

  it('should handle non-Error thrown values gracefully', async () => {
    mockPullsGet.mockRejectedValue('string error');

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await fetchGitHubPRDetails('myorg', 'myrepo', 1, 'ghp_faketoken');

    expect(result).toEqual({});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Failed to fetch PR details from GitHub API'),
      'string error'
    );
    warnSpy.mockRestore();
  });
});

describe('prompt injection resistance', () => {
  it('should sanitize PR description with null bytes', async () => {
    const malicious = 'Normal title\0\0\0INJECTED';
    const result = await loadPRDescription(malicious, undefined);
    expect(result).toBe('Normal titleINJECTED');
    expect(result).not.toContain('\0');
  });

  it('should sanitize PR description with control characters', async () => {
    const malicious = 'Title\x01\x02\x03\x04Body';
    const result = await loadPRDescription(malicious, undefined);
    // eslint-disable-next-line no-control-regex
    expect(result).not.toMatch(/[\x01\x02\x03\x04]/);
  });

  it('should truncate excessively long PR descriptions', async () => {
    const malicious = 'A'.repeat(10000);
    const result = await loadPRDescription(malicious, undefined);
    expect(result?.length).toBeLessThanOrEqual(2000);
  });
});
