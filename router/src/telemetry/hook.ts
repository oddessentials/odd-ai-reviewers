/**
 * Telemetry Hook Orchestrator
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Implements: FR-008, FR-014
 *
 * Coordinates telemetry configuration and event dispatch.
 */

import type { TelemetryConfig, TimeoutEventInput, TelemetryBackend } from './types.js';
import { DEFAULT_TELEMETRY_CONFIG, createTimeoutEvent, TelemetryConfigSchema } from './types.js';
import { TelemetryEmitter } from './emitter.js';
import { createConsoleBackend } from './backends/console.js';
import { createJsonlBackend } from './backends/jsonl.js';

/**
 * TelemetryHook manages the telemetry lifecycle and dispatches events.
 */
export class TelemetryHook {
  private config: TelemetryConfig = { ...DEFAULT_TELEMETRY_CONFIG };
  private emitter: TelemetryEmitter = new TelemetryEmitter();
  private initialized = false;

  /**
   * Configures telemetry with the given settings.
   * Creates backends based on the configuration.
   */
  configure(config: Partial<TelemetryConfig>): void {
    // Merge with defaults and validate
    const merged = TelemetryConfigSchema.parse({
      ...this.config,
      ...config,
    });

    // Close existing backends if reconfiguring
    if (this.initialized) {
      this.emitter.close().catch(() => {
        // Swallow close errors
      });
      this.emitter.clearBackends();
    }

    this.config = merged;

    // Create backends if enabled
    if (this.config.enabled) {
      this.initializeBackends();
    }

    this.initialized = true;
  }

  /**
   * Initializes backends based on current configuration.
   */
  private initializeBackends(): void {
    for (const backendType of this.config.backends) {
      let backend: TelemetryBackend;

      switch (backendType) {
        case 'console':
          backend = createConsoleBackend({
            verbosity: this.config.verbosity,
          });
          break;

        case 'jsonl':
          if (!this.config.jsonl_path) {
            console.error('[TELEMETRY] JSONL backend requires jsonl_path');
            continue;
          }
          backend = createJsonlBackend({
            filePath: this.config.jsonl_path,
            verbosity: this.config.verbosity,
            bufferSize: this.config.buffer_size,
            flushIntervalMs: this.config.flush_interval_ms,
          });
          break;
      }

      this.emitter.addBackend(backend);
    }
  }

  /**
   * Emits a timeout event if telemetry is enabled.
   * Best-effort: failures do not affect control flow.
   */
  async emit(input: TimeoutEventInput): Promise<void> {
    if (!this.config.enabled) return;

    try {
      const event = createTimeoutEvent(input);
      await this.emitter.emit(event);
    } catch {
      // Best-effort: swallow errors
    }
  }

  /**
   * Flushes all pending events.
   * Called at shutdown/run summary points.
   */
  async flush(): Promise<void> {
    await this.emitter.flush();
  }

  /**
   * Closes all backends and releases resources.
   */
  async close(): Promise<void> {
    await this.emitter.close();
    this.initialized = false;
  }

  /**
   * Returns whether telemetry is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Returns the current configuration (for testing).
   */
  getConfig(): TelemetryConfig {
    return { ...this.config };
  }
}

/**
 * Factory function for creating TelemetryHook (for testability).
 */
export function createTelemetryHook(): TelemetryHook {
  return new TelemetryHook();
}
