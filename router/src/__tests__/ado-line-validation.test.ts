import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DiffFile } from '../diff.js';
import type { Finding } from '../agents/index.js';
import { reportToADO, type ADOContext } from '../report/ado.js';
import type { Config } from '../config.js';

// Mock fetch for ADO API calls
global.fetch = vi.fn(
  async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ id: 123, value: [] }),
      text: async () => '',
    }) as Response
);

describe('ADO Line Validation Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  const baseConfig = {
    version: 1,
    trusted_only: true,
    triggers: { on: ['pull_request'] as const, branches: ['main'] },
    passes: [],
    path_filters: {},
    limits: {
      max_files: 100,
      max_diff_lines: 10000,
      max_tokens_per_pr: 100000,
      max_usd_per_pr: 1.0,
      monthly_budget_usd: 100,
    },
    gating: {
      enabled: false,
      fail_on_severity: 'error' as const,
    },
    reporting: {
      ado: {
        mode: 'threads_and_status' as const,
        max_inline_comments: 20,
        thread_status: 'active' as const,
        summary: true,
      },
    },
    models: {},
  } satisfies Config;

  const baseContext: ADOContext = {
    organization: 'test-org',
    project: 'test-project',
    repositoryId: 'test-repo',
    pullRequestId: 123,
    sourceRefCommit: 'abc123',
    token: 'test-token',
  };

  it('should normalize findings before reporting', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/service.ts',
        line: 11,
        message: 'Valid line in diff',
        sourceAgent: 'test',
      },
      {
        severity: 'warning',
        file: 'src/service.ts',
        line: 99,
        message: 'Invalid line outside diff',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats).toBeDefined();
    expect(result.validationStats?.valid).toBe(1);
    expect(result.validationStats?.downgraded).toBe(1);
  });

  it('should include invalid line details', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/service.ts',
        line: 200,
        message: 'Way out of range',
        sourceAgent: 'reviewdog',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, diffFiles);

    expect(result.invalidLineDetails).toBeDefined();
    expect(result.invalidLineDetails).toHaveLength(1);
    expect(result.invalidLineDetails?.[0]?.file).toBe('src/service.ts');
    expect(result.invalidLineDetails?.[0]?.line).toBe(200);
    expect(result.invalidLineDetails?.[0]?.sourceAgent).toBe('reviewdog');
  });

  it('should handle all valid findings', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/service.ts',
        line: 11,
        message: 'First added line',
        sourceAgent: 'test',
      },
      {
        severity: 'warning',
        file: 'src/service.ts',
        line: 12,
        message: 'Second added line',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(2);
    expect(result.validationStats?.dropped).toBe(0);
    expect(result.invalidLineDetails).toBeUndefined();
  });

  it('should handle file-level findings (no line)', async () => {
    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/service.ts',
        message: 'General architectural concern',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(1);
    expect(result.validationStats?.dropped).toBe(0);
  });

  it('should handle empty diff files gracefully', async () => {
    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'any.ts',
        line: 1,
        message: 'Test finding',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, []);

    expect(result.success).toBe(true);
    expect(result.validationStats?.downgraded).toBe(1);
  });

  it('should validate context lines along with added lines', async () => {
    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/service.ts',
        line: 10,
        message: 'Context line before changes',
        sourceAgent: 'test',
      },
      {
        severity: 'info',
        file: 'src/service.ts',
        line: 13,
        message: 'Context line after changes',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, diffFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(2); // Both context lines are valid
  });

  it('should handle threads_only mode', async () => {
    const config: Config = {
      ...baseConfig,
      reporting: {
        ado: {
          mode: 'threads_only',
          max_inline_comments: 20,
          thread_status: 'active',
          summary: true,
        },
      },
    };

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/service.ts',
        line: 11,
        message: 'Test',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, config, diffFiles);

    expect(result.success).toBe(true);
    expect(result.threadId).toBeDefined();
  });

  it('should handle status_only mode', async () => {
    const config: Config = {
      ...baseConfig,
      reporting: {
        ado: {
          mode: 'status_only',
          max_inline_comments: 20,
          thread_status: 'active',
          summary: true,
        },
      },
    };

    const findings: Finding[] = [
      {
        severity: 'error',
        file: 'src/service.ts',
        line: 11,
        message: 'Test',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, config, diffFiles);

    expect(result.success).toBe(true);
    expect(result.statusId).toBeDefined();
  });

  it('should handle renamed files', async () => {
    const renamedFiles: DiffFile[] = [
      {
        path: 'src/new-name.ts',
        status: 'renamed',
        additions: 1,
        deletions: 0,
        patch: `@@ -5,2 +5,3 @@ class Renamed {
   method() {
+    console.log('renamed');
     return true;`,
      },
    ];

    const findings: Finding[] = [
      {
        severity: 'info',
        file: 'src/new-name.ts',
        line: 6,
        message: 'In renamed file',
        sourceAgent: 'test',
      },
    ];

    const result = await reportToADO(findings, [], baseContext, baseConfig, renamedFiles);

    expect(result.success).toBe(true);
    expect(result.validationStats?.valid).toBe(1);
  });

  /**
   * PHASE 7: E2E test validating ADO threadContext always uses right-side fields.
   * This protects the end-to-end contract: ADO threads must target the "new/right" side
   * of the diff, never the "left/original" side.
   */
  describe('Right-Side Enforcement (E2E Payload Validation)', () => {
    it('should never emit left-side fields in threadContext', async () => {
      // Clear mocks and capture ALL fetch calls with payloads
      vi.clearAllMocks();
      const capturedPayloads: unknown[] = [];

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        async (url: string, options?: RequestInit) => {
          if (options?.body) {
            capturedPayloads.push(JSON.parse(options.body as string));
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 123, value: [] }),
            text: async () => '',
          } as Response;
        }
      );

      const findings: Finding[] = [
        {
          severity: 'error',
          file: 'src/service.ts',
          line: 11, // Valid line in diff
          message: 'Issue on added line',
          sourceAgent: 'semgrep',
        },
      ];

      const result = await reportToADO(findings, [], baseContext, baseConfig, diffFiles);
      expect(result.success).toBe(true);

      // Find thread creation calls (POST to /threads endpoint)
      const threadCalls = capturedPayloads.filter((payload: unknown) => {
        const p = payload as { threadContext?: unknown; comments?: unknown };
        return p.threadContext !== undefined || p.comments !== undefined;
      });

      // Assert we have at least one thread call
      expect(threadCalls.length).toBeGreaterThan(0);

      // CRITICAL: Validate EVERY thread call uses right-side fields only
      for (const payload of threadCalls) {
        const threadContext = (payload as { threadContext?: unknown }).threadContext as
          | {
              rightFileStart?: unknown;
              rightFileEnd?: unknown;
              leftFileStart?: unknown;
              leftFileEnd?: unknown;
            }
          | undefined;

        if (threadContext) {
          // MUST have right-side fields
          expect(threadContext.rightFileStart).toBeDefined();
          expect(threadContext.rightFileEnd).toBeDefined();

          // MUST NOT have left-side fields (this is the critical assertion)
          expect(threadContext.leftFileStart).toBeUndefined();
          expect(threadContext.leftFileEnd).toBeUndefined();

          // Validate right-side structure
          const rightStart = threadContext.rightFileStart as { line: number; offset: number };
          const rightEnd = threadContext.rightFileEnd as { line: number; offset: number };
          expect(typeof rightStart.line).toBe('number');
          expect(typeof rightStart.offset).toBe('number');
          expect(typeof rightEnd.line).toBe('number');
          expect(typeof rightEnd.offset).toBe('number');
        }
      }
    });

    it('should emit canonical paths in threadContext filePath', async () => {
      vi.clearAllMocks();
      const capturedPayloads: unknown[] = [];

      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
        async (url: string, options?: RequestInit) => {
          if (options?.body) {
            capturedPayloads.push(JSON.parse(options.body as string));
          }
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: 123, value: [] }),
            text: async () => '',
          } as Response;
        }
      );

      const findings: Finding[] = [
        {
          severity: 'warning',
          file: 'src/service.ts',
          line: 12,
          message: 'Another issue',
          sourceAgent: 'test',
        },
      ];

      await reportToADO(findings, [], baseContext, baseConfig, diffFiles);

      // Find thread calls
      const threadCalls = capturedPayloads.filter((payload: unknown) => {
        return (payload as { threadContext?: unknown }).threadContext !== undefined;
      });

      for (const payload of threadCalls) {
        const threadContext = (payload as { threadContext?: { filePath?: string } }).threadContext;
        if (threadContext?.filePath) {
          // Path should be canonical (no a/, b/, ./ prefixes - may have leading /)
          expect(threadContext.filePath).not.toMatch(/^a\//);
          expect(threadContext.filePath).not.toMatch(/^b\//);
          expect(threadContext.filePath).not.toMatch(/^\.\//);
        }
      }
    });
  });
});
