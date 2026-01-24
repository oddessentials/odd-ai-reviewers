/**
 * ADO Multi-line Comment Payload Tests
 *
 * Verifies exact API call arguments for single-line and multi-line threads
 * to ensure correct placement on Azure DevOps PR diffs
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';
import { reportToADO, type ADOContext } from '../report/ado.js';

// Store fetch calls for verification
const fetchCalls: { url: string; options?: RequestInit }[] = [];

// Mock fetch for ADO API calls
global.fetch = vi.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
  fetchCalls.push({ url: String(url), options });
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: 123, value: [] }),
    text: async () => '',
  } as Response;
});

describe('ADO Multi-line Payload Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCalls.length = 0;
  });

  const baseConfig = {
    passes: [],
    path_filters: {},
    limits: {
      max_files: 100,
      max_diff_lines: 10000,
      max_tokens_per_pr: 100000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100.0,
    },
    gating: {
      enabled: false,
      fail_on_severity: 'error',
    },
    reporting: {
      ado: {
        mode: 'threads_and_status',
        max_inline_comments: 20,
        thread_status: 'active',
        summary: true,
      },
    },
    models: {},
  };

  const baseContext: ADOContext = {
    organization: 'test-org',
    project: 'test-project',
    repositoryId: 'test-repo',
    pullRequestId: 123,
    sourceRefCommit: 'abc123',
    token: 'test-token',
  };

  // Diff with lines 11-12 as added lines (matching @@ -10,3 +10,5 @@)
  const diffFiles: DiffFile[] = [
    {
      path: 'src/service.ts',
      status: 'modified',
      additions: 2,
      deletions: 0,
      patch: `@@ -10,3 +10,5 @@ export class Service {
   process(data: Data) {
+    this.validate(data);
+    this.log('Processing');
     return this.transform(data);
   }`,
    },
  ];

  it('should send correct threadContext for single-line comment', async () => {
    const findings: Finding[] = [
      {
        severity: 'warning',
        file: 'src/service.ts',
        line: 11, // Single line only (first added line)
        message: 'Test warning',
        sourceAgent: 'test',
      },
    ];

    await reportToADO(findings, baseContext, baseConfig, diffFiles);

    // Find the inline thread POST call (with threadContext)
    const postCalls = fetchCalls.filter(
      (call) => call.options?.method === 'POST' && call.url.includes('/threads')
    );

    // Should have at least 2 POST calls: summary thread + inline thread
    expect(postCalls.length).toBeGreaterThanOrEqual(2);

    const inlineCall = postCalls.find((call) => {
      const body = JSON.parse(call.options?.body as string);
      return body.threadContext !== undefined;
    });

    expect(inlineCall).toBeDefined();
    if (!inlineCall?.options?.body) throw new Error('Expected inline call with body');
    const body = JSON.parse(inlineCall.options.body as string);
    const threadContext = body.threadContext;

    // Verify single-line: start and end should be the same
    expect(threadContext.filePath).toBe('/src/service.ts');
    expect(threadContext.rightFileStart.line).toBe(11);
    expect(threadContext.rightFileEnd.line).toBe(11);
    expect(threadContext.rightFileStart.offset).toBe(1);
    expect(threadContext.rightFileEnd.offset).toBe(1);
  });

  it('should send correct threadContext for multi-line comment', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/service.ts',
        line: 11,
        endLine: 12, // Multi-line range (both added lines)
        message: 'Multi-line issue',
        sourceAgent: 'test',
      },
    ];

    await reportToADO(findings, baseContext, baseConfig, diffFiles);

    const postCalls = fetchCalls.filter(
      (call) => call.options?.method === 'POST' && call.url.includes('/threads')
    );

    const inlineCall = postCalls.find((call) => {
      const body = JSON.parse(call.options?.body as string);
      return body.threadContext !== undefined;
    });

    expect(inlineCall).toBeDefined();
    if (!inlineCall?.options?.body) throw new Error('Expected inline call with body');
    const body = JSON.parse(inlineCall.options.body as string);
    const threadContext = body.threadContext;

    // Verify multi-line: start should differ from end
    expect(threadContext.filePath).toBe('/src/service.ts');
    expect(threadContext.rightFileStart.line).toBe(11);
    expect(threadContext.rightFileEnd.line).toBe(12);
  });

  it('should handle endLine === line as single-line (same range)', async () => {
    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/service.ts',
        line: 11,
        endLine: 11, // Same as line - should be treated as single-line
        message: 'Same line start and end',
        sourceAgent: 'test',
      },
    ];

    await reportToADO(findings, baseContext, baseConfig, diffFiles);

    const postCalls = fetchCalls.filter(
      (call) => call.options?.method === 'POST' && call.url.includes('/threads')
    );

    const inlineCall = postCalls.find((call) => {
      const body = JSON.parse(call.options?.body as string);
      return body.threadContext !== undefined;
    });

    expect(inlineCall).toBeDefined();
    if (!inlineCall?.options?.body) throw new Error('Expected inline call with body');
    const body = JSON.parse(inlineCall.options.body as string);
    const threadContext = body.threadContext;

    // Should have same start and end (single-line)
    expect(threadContext.rightFileStart.line).toBe(11);
    expect(threadContext.rightFileEnd.line).toBe(11);
  });
});
