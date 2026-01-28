/**
 * JSONL File Telemetry Backend
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Implements: FR-011, FR-014a
 *
 * Appends JSON objects to a file in JSONL format (one JSON object per line).
 * Uses append-mode writes for durability without explicit flush.
 */

import { appendFile } from 'node:fs/promises';
import type { TelemetryBackend, TimeoutEvent, TelemetryVerbosity } from '../types.js';

/**
 * JSONL backend configuration options.
 */
export interface JsonlBackendOptions {
  /** Path to the JSONL output file */
  filePath: string;
  /** Verbosity level controls which fields are written */
  verbosity: TelemetryVerbosity;
  /** Max events to buffer before auto-flush (default: 100) */
  bufferSize?: number;
  /** Periodic flush interval in ms (default: 5000) */
  flushIntervalMs?: number;
}

/**
 * Formats a timeout event for JSONL output based on verbosity level.
 */
function formatEvent(event: TimeoutEvent, verbosity: TelemetryVerbosity): string {
  switch (verbosity) {
    case 'minimal':
      return JSON.stringify({
        operation_id: event.operation_id,
        duration_ms: event.duration_ms,
        severity: event.severity,
      });

    case 'standard':
      return JSON.stringify({
        operation_id: event.operation_id,
        duration_ms: event.duration_ms,
        threshold_ms: event.threshold_ms,
        timestamp: event.timestamp,
        severity: event.severity,
      });

    case 'verbose':
      return JSON.stringify(event);
  }
}

/**
 * Creates a JSONL file telemetry backend.
 *
 * @param options - Configuration options
 * @returns TelemetryBackend implementation
 */
export function createJsonlBackend(options: JsonlBackendOptions): TelemetryBackend {
  const { filePath, verbosity, bufferSize = 100, flushIntervalMs = 5000 } = options;

  const buffer: string[] = [];
  let flushTimer: ReturnType<typeof setInterval> | null = null;
  let hasLoggedError = false;
  let closed = false;

  /**
   * Writes buffered events to file.
   * @param force - If true, write even if closed (used during shutdown)
   */
  async function writeBuffer(force = false): Promise<void> {
    if (buffer.length === 0) return;
    if (closed && !force) return;

    const lines = buffer.splice(0).join('\n') + '\n';

    try {
      // Use append mode for durability
      await appendFile(filePath, lines, { encoding: 'utf8' });
    } catch (error) {
      // Log error once per run (FR-014)
      if (!hasLoggedError) {
        hasLoggedError = true;
        console.error(`[TELEMETRY] JSONL write error: ${error}`);
      }
    }
  }

  /**
   * Starts periodic flush timer.
   */
  function startFlushTimer(): void {
    if (flushTimer === null && flushIntervalMs > 0) {
      flushTimer = setInterval(() => {
        writeBuffer().catch(() => {
          // Swallow errors in timer callback
        });
      }, flushIntervalMs);
      // Unref timer so it doesn't keep the process alive
      flushTimer.unref();
    }
  }

  /**
   * Stops periodic flush timer.
   */
  function stopFlushTimer(): void {
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  }

  return {
    async emit(event: TimeoutEvent): Promise<void> {
      if (closed) return;

      try {
        const line = formatEvent(event, verbosity);
        buffer.push(line);

        // Start timer on first event
        startFlushTimer();

        // Auto-flush if buffer is full
        if (buffer.length >= bufferSize) {
          await writeBuffer();
        }
      } catch {
        // Best-effort: swallow errors to avoid affecting control flow (FR-014)
      }
    },

    async flush(): Promise<void> {
      await writeBuffer();
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;

      stopFlushTimer();
      await writeBuffer(true); // Force write remaining buffer
    },
  };
}

/**
 * Factory function for creating JSONL backend (for testability).
 */
export type JsonlBackendFactory = (options: JsonlBackendOptions) => TelemetryBackend;
