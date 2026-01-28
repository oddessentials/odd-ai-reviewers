/**
 * Timeout Telemetry Schema Definitions
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Date: 2026-01-28
 *
 * These schemas define the contract for timeout telemetry events.
 * Implementation should use these schemas for runtime validation.
 */

import { z } from 'zod';

// =============================================================================
// Enums
// =============================================================================

/**
 * Severity level of a timeout event.
 * - warning: Timeout exceeded but operation completed (informational)
 * - error: Timeout caused operation failure
 * - critical: Timeout in critical path affecting overall result
 */
export const TimeoutSeverity = z.enum(['warning', 'error', 'critical']);
export type TimeoutSeverity = z.infer<typeof TimeoutSeverity>;

/**
 * Available telemetry backend types.
 * - console: Writes structured log lines to stdout
 * - jsonl: Appends JSON objects to file
 */
export const TelemetryBackendType = z.enum(['console', 'jsonl']);
export type TelemetryBackendType = z.infer<typeof TelemetryBackendType>;

/**
 * Verbosity levels for telemetry output.
 * - minimal: operation_id, duration_ms, severity only
 * - standard: All required fields
 * - verbose: All fields including allowed_context
 */
export const TelemetryVerbosity = z.enum(['minimal', 'standard', 'verbose']);
export type TelemetryVerbosity = z.infer<typeof TelemetryVerbosity>;

// =============================================================================
// Core Schemas
// =============================================================================

/**
 * Operation ID pattern: {type}_{identifier}
 * Examples: local_llm_req_abc123, pattern_eval_a1b2c3d4, subprocess_semgrep
 */
export const OperationId = z
  .string()
  .min(1)
  .regex(/^[a-z_]+_[a-zA-Z0-9_-]+$/, 'Operation ID must match pattern {type}_{identifier}');
export type OperationId = z.infer<typeof OperationId>;

/**
 * Allow-listed context fields for TimeoutEvent.
 * Only these fields may appear in event context to prevent data leakage.
 */
export const AllowedContextSchema = z
  .object({
    /** Agent that triggered the timeout */
    agent_id: z.string().min(1).optional(),
    /** File being processed (if applicable) */
    file_path: z.string().min(1).optional(),
    /** SHA-256 hash of pattern (first 16 chars, no raw patterns) */
    pattern_hash: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .optional(),
    /** Number of retries attempted before timeout */
    retry_count: z.number().int().min(0).optional(),
    /** LLM model identifier (if applicable) */
    model_name: z.string().min(1).optional(),
  })
  .strict(); // Reject unknown fields
export type AllowedContext = z.infer<typeof AllowedContextSchema>;

/**
 * Core timeout event schema.
 * Immutable record of a single timeout occurrence.
 */
export const TimeoutEventSchema = z.object({
  /** Unique identifier for the operation (pattern: {type}_{identifier}) */
  operation_id: OperationId,
  /** Actual elapsed time in milliseconds */
  duration_ms: z.number().min(0),
  /** Configured timeout threshold in milliseconds */
  threshold_ms: z.number().positive(),
  /** ISO-8601 datetime when timeout was detected */
  timestamp: z.string().datetime(),
  /** Severity classification */
  severity: TimeoutSeverity,
  /** Optional allow-listed metadata */
  allowed_context: AllowedContextSchema.optional(),
});
export type TimeoutEvent = z.infer<typeof TimeoutEventSchema>;

/**
 * Configuration controlling telemetry behavior.
 */
export const TelemetryConfigSchema = z
  .object({
    /** Master switch for telemetry emission */
    enabled: z.boolean(),
    /** List of active backends */
    backends: z.array(TelemetryBackendType).min(1),
    /** File path for JSONL backend output (required if jsonl backend used) */
    jsonl_path: z.string().min(1).nullable().optional(),
    /** Verbosity level for output */
    verbosity: TelemetryVerbosity.default('standard'),
    /** Max events to buffer before flush (JSONL only) */
    buffer_size: z.number().int().min(1).max(10000).default(100),
    /** Periodic flush interval in ms (JSONL only) */
    flush_interval_ms: z.number().int().min(100).max(60000).default(5000),
  })
  .refine(
    (config) => {
      // If jsonl backend is enabled, jsonl_path must be provided
      if (config.backends.includes('jsonl')) {
        return config.jsonl_path != null && config.jsonl_path.length > 0;
      }
      return true;
    },
    {
      message: 'jsonl_path is required when jsonl backend is enabled',
      path: ['jsonl_path'],
    }
  );
export type TelemetryConfig = z.infer<typeof TelemetryConfigSchema>;

// =============================================================================
// Backend Interface (TypeScript only, not Zod)
// =============================================================================

/**
 * Contract for telemetry sink implementations.
 *
 * Error Handling Contract:
 * - emit() MUST NOT throw; failures logged internally
 * - emit() MUST NOT block calling thread
 * - flush() MAY throw if write fails
 * - Backend failure MUST NOT affect control flow (FR-014)
 */
export interface TelemetryBackend {
  /** Write a single event (non-blocking, non-throwing) */
  emit(event: TimeoutEvent): Promise<void>;
  /** Force write of buffered events */
  flush(): Promise<void>;
  /** Release resources */
  close(): Promise<void>;
}

// =============================================================================
// Public API Types
// =============================================================================

/**
 * Input type for emitting timeout events.
 * Omits timestamp as it will be auto-generated.
 */
export type TimeoutEventInput = Omit<TimeoutEvent, 'timestamp'>;

/**
 * Partial config for updating telemetry settings.
 */
export type TelemetryConfigUpdate = Partial<Omit<TelemetryConfig, 'backends'>> & {
  backends?: TelemetryBackendType[];
};

// =============================================================================
// Factory Functions (for implementation reference)
// =============================================================================

/**
 * Creates a TimeoutEvent with auto-generated timestamp.
 * For implementation reference only.
 */
export function createTimeoutEvent(input: TimeoutEventInput): TimeoutEvent {
  return TimeoutEventSchema.parse({
    ...input,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Default telemetry configuration.
 * Telemetry is disabled by default.
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: false,
  backends: ['console'],
  jsonl_path: null,
  verbosity: 'standard',
  buffer_size: 100,
  flush_interval_ms: 5000,
};
