import { describe, expect, it, vi } from 'vitest';
import {
  runBenchmarkCommand,
  type BenchmarkCommandIO,
} from '../../../../src/cli/commands/benchmark.js';

function createIO(overrides: Partial<BenchmarkCommandIO> = {}): BenchmarkCommandIO {
  return {
    log: vi.fn(),
    error: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}

describe('runBenchmarkCommand', () => {
  it('returns exit code 2 and logs a fatal error when the fixture file has no scenarios', async () => {
    const io = createIO({
      readFile: vi.fn().mockReturnValue(JSON.stringify({ scenarios: [] })),
    });

    const exitCode = await runBenchmarkCommand({ fixtures: '/tmp/empty.json' }, io);

    expect(exitCode).toBe(2);
    expect(io.error).toHaveBeenCalledWith(
      '[benchmark] Fatal error: Fixture file contains no scenarios'
    );
  });

  it('returns exit code 2 and logs a fatal error when all scenarios are unsupported', async () => {
    const io = createIO({
      readFile: vi.fn().mockReturnValue(
        JSON.stringify({
          scenarios: [
            {
              id: 'fp-b-cli',
              category: 'framework-conventions',
              pattern: 'B',
              description: 'Unsupported benchmark fixture',
              sourceIssue: '#test',
              diff: 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,0 +1,1 @@\n+export const value = 1;',
              expectedFindings: [],
              truePositive: false,
            },
          ],
        })
      ),
    });

    const exitCode = await runBenchmarkCommand({ fixtures: '/tmp/unsupported.json' }, io);

    expect(exitCode).toBe(2);
    expect(io.error).toHaveBeenCalledWith(
      '[benchmark] Fatal error: All benchmark scenarios were skipped as unsupported by the deterministic benchmark adapter'
    );
  });
});
