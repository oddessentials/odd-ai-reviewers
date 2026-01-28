/**
 * Timeout Telemetry Public API
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Implements: FR-010
 *
 * Public exports for the telemetry module.
 */

import { TelemetryHook, createTelemetryHook } from './hook.js';
import type {
  TelemetryConfig,
  TimeoutEventInput,
  TimeoutEvent,
  TelemetryBackend,
  TelemetryBackendType,
  TelemetryVerbosity,
  TimeoutSeverity,
  AllowedContext,
} from './types.js';
import { TelemetryConfigSchema, TelemetryBackendType as BackendTypeSchema } from './types.js';

// =============================================================================
// Global Telemetry Instance
// =============================================================================

let globalHook: TelemetryHook | null = null;

/**
 * Gets or creates the global telemetry hook instance.
 */
function getGlobalHook(): TelemetryHook {
  if (globalHook === null) {
    globalHook = createTelemetryHook();
  }
  return globalHook;
}

// =============================================================================
// Environment Variable Configuration
// =============================================================================

/**
 * Parses telemetry configuration from environment variables.
 *
 * Environment Variables:
 * - TELEMETRY_ENABLED: 'true' or 'false' (default: 'false')
 * - TELEMETRY_BACKENDS: Comma-separated list of backends (default: 'console')
 * - TELEMETRY_JSONL_PATH: Path for JSONL output (required if jsonl backend used)
 * - TELEMETRY_VERBOSITY: 'minimal', 'standard', or 'verbose' (default: 'standard')
 * - TELEMETRY_BUFFER_SIZE: Max events to buffer (default: 100)
 * - TELEMETRY_FLUSH_INTERVAL_MS: Flush interval in ms (default: 5000)
 */
export function parseEnvConfig(): Partial<TelemetryConfig> {
  const config: Partial<TelemetryConfig> = {};

  // TELEMETRY_ENABLED
  const enabledStr = process.env['TELEMETRY_ENABLED'];
  if (enabledStr !== undefined) {
    config.enabled = enabledStr.toLowerCase() === 'true';
  }

  // TELEMETRY_BACKENDS
  const backendsStr = process.env['TELEMETRY_BACKENDS'];
  if (backendsStr) {
    const backends = backendsStr.split(',').map((b) => b.trim());
    const validBackends: TelemetryBackendType[] = [];
    for (const b of backends) {
      const result = BackendTypeSchema.safeParse(b);
      if (result.success) {
        validBackends.push(result.data);
      }
    }
    if (validBackends.length > 0) {
      config.backends = validBackends;
    }
  }

  // TELEMETRY_JSONL_PATH
  const jsonlPath = process.env['TELEMETRY_JSONL_PATH'];
  if (jsonlPath) {
    config.jsonl_path = jsonlPath;
  }

  // TELEMETRY_VERBOSITY
  const verbosity = process.env['TELEMETRY_VERBOSITY'];
  if (verbosity === 'minimal' || verbosity === 'standard' || verbosity === 'verbose') {
    config.verbosity = verbosity;
  }

  // TELEMETRY_BUFFER_SIZE
  const bufferSizeStr = process.env['TELEMETRY_BUFFER_SIZE'];
  if (bufferSizeStr) {
    const bufferSize = parseInt(bufferSizeStr, 10);
    if (!isNaN(bufferSize) && bufferSize > 0) {
      config.buffer_size = bufferSize;
    }
  }

  // TELEMETRY_FLUSH_INTERVAL_MS
  const flushIntervalStr = process.env['TELEMETRY_FLUSH_INTERVAL_MS'];
  if (flushIntervalStr) {
    const flushInterval = parseInt(flushIntervalStr, 10);
    if (!isNaN(flushInterval) && flushInterval >= 100) {
      config.flush_interval_ms = flushInterval;
    }
  }

  return config;
}

// =============================================================================
// Public API Functions
// =============================================================================

/**
 * Configures the global telemetry instance.
 *
 * @param config - Telemetry configuration
 */
export async function configureTelemetry(config: Partial<TelemetryConfig>): Promise<void> {
  await getGlobalHook().configure(config);
}

/**
 * Configures telemetry from environment variables.
 * Convenience function that parses env vars and applies config.
 */
export async function configureFromEnv(): Promise<void> {
  const config = parseEnvConfig();
  if (Object.keys(config).length > 0) {
    await configureTelemetry(config);
  }
}

/**
 * Emits a timeout event if telemetry is enabled.
 * Best-effort: failures do not affect control flow.
 *
 * @param event - Timeout event data (timestamp auto-generated)
 */
export async function emitTimeoutEvent(event: TimeoutEventInput): Promise<void> {
  await getGlobalHook().emit(event);
}

/**
 * Flushes all pending telemetry events.
 * Should be called at shutdown/run summary points.
 */
export async function flushTelemetry(): Promise<void> {
  await getGlobalHook().flush();
}

/**
 * Closes the telemetry system and releases resources.
 */
export async function closeTelemetry(): Promise<void> {
  if (globalHook !== null) {
    await globalHook.close();
    globalHook = null;
  }
}

/**
 * Returns whether telemetry is enabled.
 */
export function isTelemetryEnabled(): boolean {
  return getGlobalHook().isEnabled();
}

// =============================================================================
// Re-exports
// =============================================================================

export type {
  TelemetryConfig,
  TimeoutEventInput,
  TimeoutEvent,
  TelemetryBackend,
  TelemetryBackendType,
  TelemetryVerbosity,
  TimeoutSeverity,
  AllowedContext,
};

export { TelemetryConfigSchema, createTelemetryHook, TelemetryHook };

// Re-export types schema for validation
export { TimeoutEventSchema, TimeoutSeverity as TimeoutSeveritySchema } from './types.js';
