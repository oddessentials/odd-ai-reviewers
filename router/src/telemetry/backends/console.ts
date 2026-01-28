/**
 * Console Telemetry Backend
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Implements: FR-011
 *
 * Writes structured log lines to stdout for immediate visibility.
 */

import type { TelemetryBackend, TimeoutEvent, TelemetryVerbosity } from '../types.js';

/**
 * Console backend configuration options.
 */
export interface ConsoleBackendOptions {
  /** Verbosity level controls which fields are logged */
  verbosity: TelemetryVerbosity;
}

/**
 * Formats a timeout event for console output based on verbosity level.
 */
function formatEvent(event: TimeoutEvent, verbosity: TelemetryVerbosity): string {
  const prefix = `[TIMEOUT] [${event.severity.toUpperCase()}]`;

  switch (verbosity) {
    case 'minimal':
      return `${prefix} ${event.operation_id} duration=${event.duration_ms}ms`;

    case 'standard':
      return `${prefix} ${event.operation_id} duration=${event.duration_ms}ms threshold=${event.threshold_ms}ms at=${event.timestamp}`;

    case 'verbose': {
      const contextStr = event.allowed_context
        ? ` context=${JSON.stringify(event.allowed_context)}`
        : '';
      return `${prefix} ${event.operation_id} duration=${event.duration_ms}ms threshold=${event.threshold_ms}ms at=${event.timestamp}${contextStr}`;
    }
  }
}

/**
 * Creates a console telemetry backend.
 *
 * @param options - Configuration options
 * @returns TelemetryBackend implementation
 */
export function createConsoleBackend(options: ConsoleBackendOptions): TelemetryBackend {
  const { verbosity } = options;

  return {
    async emit(event: TimeoutEvent): Promise<void> {
      try {
        const message = formatEvent(event, verbosity);
        // Use stderr for telemetry to avoid mixing with stdout
        console.error(message);
      } catch {
        // Best-effort: swallow errors to avoid affecting control flow (FR-014)
      }
    },

    async flush(): Promise<void> {
      // Console writes are immediate, nothing to flush
    },

    async close(): Promise<void> {
      // No resources to release
    },
  };
}
