/**
 * Vitest setup: normalize child_process exec errors in sandboxed environments.
 *
 * Some environments return EPERM from spawnSync even when stdout is produced.
 * When that happens, treat EPERM with stdout as a successful execution to
 * avoid false negatives in git/grep-based tests.
 */

import type { ExecFileSyncOptions, ExecSyncOptions } from 'child_process';
import { vi } from 'vitest';

type ExecError = NodeJS.ErrnoException & { stdout?: string | Buffer; status?: number | null };

function coerceStdout(error: ExecError, encoding?: BufferEncoding): string | Buffer | undefined {
  if (error.stdout === undefined) return undefined;
  if (typeof error.stdout === 'string') return error.stdout;
  if (Buffer.isBuffer(error.stdout)) {
    return encoding ? error.stdout.toString(encoding) : error.stdout;
  }
  return undefined;
}

function handleEperm<T>(error: unknown, encoding?: BufferEncoding): T {
  const err = error as ExecError;
  if (err?.code === 'EPERM' && err.status === 0) {
    const output = coerceStdout(err, encoding);
    if (output !== undefined) {
      return output as T;
    }
  }
  throw error;
}

interface ChildProcessActual {
  execFileSync: (
    command: string,
    args?: readonly string[],
    options?: ExecFileSyncOptions
  ) => string | Buffer;
  execSync: (command: string, options?: ExecSyncOptions) => string | Buffer;
}

vi.mock('child_process', async () => {
  const actual = (await vi.importActual('child_process')) as ChildProcessActual &
    Record<string, unknown>;

  return {
    ...actual,
    execFileSync: (command: string, args?: readonly string[], options?: ExecFileSyncOptions) => {
      try {
        return actual.execFileSync(command, args, options);
      } catch (error) {
        const encoding =
          typeof options?.encoding === 'string' ? (options.encoding as BufferEncoding) : undefined;
        return handleEperm(error, encoding);
      }
    },
    execSync: (command: string, options?: ExecSyncOptions) => {
      try {
        return actual.execSync(command, options);
      } catch (error) {
        const encoding =
          typeof options?.encoding === 'string' ? (options.encoding as BufferEncoding) : undefined;
        return handleEperm(error, encoding);
      }
    },
  };
});
