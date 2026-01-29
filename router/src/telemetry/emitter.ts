/**
 * Telemetry Emitter
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Implements: FR-014
 *
 * Low-overhead event emission with failure logging (once per run).
 */

import type { TelemetryBackend, TimeoutEvent } from './types.js';

/**
 * Emitter that dispatches events to multiple backends.
 * Implements best-effort semantics with failure logging.
 */
export class TelemetryEmitter {
  private backends: TelemetryBackend[] = [];
  private hasLoggedEmitError = false;

  /**
   * Registers a backend for event dispatch.
   */
  addBackend(backend: TelemetryBackend): void {
    this.backends.push(backend);
  }

  /**
   * Removes all registered backends.
   */
  clearBackends(): void {
    this.backends = [];
  }

  /**
   * Emits an event to all registered backends.
   * Best-effort: failures are logged once per run (FR-014).
   */
  async emit(event: TimeoutEvent): Promise<void> {
    if (this.backends.length === 0) return;

    // Fire-and-forget to all backends in parallel
    await Promise.all(
      this.backends.map(async (backend) => {
        try {
          await backend.emit(event);
        } catch (error) {
          // Log once per run
          if (!this.hasLoggedEmitError) {
            this.hasLoggedEmitError = true;
            console.error(`[TELEMETRY] Emit error: ${error}`);
          }
        }
      })
    );
  }

  /**
   * Flushes all backends.
   */
  async flush(): Promise<void> {
    await Promise.all(
      this.backends.map(async (backend) => {
        try {
          await backend.flush();
        } catch {
          // Swallow flush errors
        }
      })
    );
  }

  /**
   * Closes all backends and releases resources.
   */
  async close(): Promise<void> {
    await Promise.all(
      this.backends.map(async (backend) => {
        try {
          await backend.close();
        } catch {
          // Swallow close errors
        }
      })
    );
    this.clearBackends();
  }

  /**
   * Returns the number of registered backends.
   */
  get backendCount(): number {
    return this.backends.length;
  }
}
