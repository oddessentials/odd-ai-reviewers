/**
 * Security Logger Module
 *
 * Single aggregation point for security-related logging events.
 * All security-relevant code paths MUST use this module.
 *
 * Key guarantees:
 * - Raw patterns are NEVER logged (only hashes)
 * - Logging failures don't block execution
 * - Consistent structured format across all events
 *
 * @see FR-021, FR-022, FR-023, FR-024
 * @see specs/006-quality-enforcement/contracts/security-event.ts
 */

import { createHash } from 'crypto';
import { z } from 'zod';

// =============================================================================
// Schema Definitions (FR-021)
// =============================================================================

/**
 * Security event categories
 */
export const SecurityEventCategory = z.enum([
  'regex_validation',
  'mitigation_applied',
  'mitigation_failed',
]);
export type SecurityEventCategory = z.infer<typeof SecurityEventCategory>;

/**
 * Event outcome states
 */
export const SecurityEventOutcome = z.enum(['success', 'failure', 'timeout']);
export type SecurityEventOutcome = z.infer<typeof SecurityEventOutcome>;

/**
 * Error reasons for failed events
 */
export const MitigationErrorReason = z.enum(['invalid_regex', 'timeout', 'runtime_error']);
export type MitigationErrorReason = z.infer<typeof MitigationErrorReason>;

/**
 * Pattern hash format: 16 hex characters (truncated SHA-256)
 */
export const PatternHash = z.string().regex(/^[a-f0-9]{16}$/, 'Must be 16 hex characters');
export type PatternHash = z.infer<typeof PatternHash>;

/**
 * Security event schema
 */
export const SecurityEventSchema = z
  .object({
    /** Event type classification */
    category: SecurityEventCategory,
    /** Rule or pattern identifier being validated */
    ruleId: z.string().min(1),
    /** File path being analyzed */
    file: z.string().min(1),
    /** SHA-256 hash of pattern (first 16 chars) - never raw pattern */
    patternHash: PatternHash,
    /** Processing duration in milliseconds */
    durationMs: z.number().min(0),
    /** Result of the operation */
    outcome: SecurityEventOutcome,
    /** Error reason (required when outcome is 'failure') */
    errorReason: MitigationErrorReason.optional(),
    /** ISO 8601 timestamp */
    timestamp: z.string().datetime(),
    /** Unique identifier for the analysis run */
    runId: z.string().min(1),
  })
  .refine((data) => data.outcome !== 'failure' || data.errorReason !== undefined, {
    message: 'errorReason is required when outcome is failure',
    path: ['errorReason'],
  });

export type SecurityEvent = z.infer<typeof SecurityEventSchema>;

// =============================================================================
// Pattern Hashing (FR-022)
// =============================================================================

/**
 * Hash a regex pattern using SHA-256 and truncate to 16 hex characters.
 *
 * This ensures raw patterns are NEVER included in logs while still
 * allowing correlation of events related to the same pattern.
 *
 * @param pattern - The regex pattern to hash
 * @returns 16-character hex string (truncated SHA-256)
 */
export function hashPattern(pattern: string): PatternHash {
  const hash = createHash('sha256').update(pattern).digest('hex');
  return hash.slice(0, 16) as PatternHash;
}

// =============================================================================
// Run Summary (for aggregated metrics)
// =============================================================================

/**
 * Run summary statistics
 */
export interface RunSummary {
  runId: string;
  totalEvents: number;
  successCount: number;
  failureCount: number;
  timeoutCount: number;
  totalDurationMs: number;
  loggingFailuresTotal: number;
  loggingFailuresByCategory: Record<string, number>;
  loggingDegraded: boolean;
}

// =============================================================================
// Logger State
// =============================================================================

interface LoggerState {
  runId: string;
  events: SecurityEvent[];
  loggingFailures: { category: string; error: string }[];
  isDegraded: boolean;
}

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createInitialState(): LoggerState {
  return {
    runId: generateRunId(),
    events: [],
    loggingFailures: [],
    isDegraded: false,
  };
}

// =============================================================================
// Core Logging Function (FR-024)
// =============================================================================

/**
 * Input for creating a security event
 */
export interface SecurityEventInput {
  category: SecurityEventCategory;
  ruleId: string;
  file: string;
  pattern: string; // Raw pattern - will be hashed internally
  durationMs: number;
  outcome: SecurityEventOutcome;
  errorReason?: MitigationErrorReason;
}

/**
 * Security logger instance interface
 */
export interface SecurityLogger {
  /** Log a security event */
  logSecurityEvent(input: SecurityEventInput): void;
  /** Start a new logging run */
  startRun(): string;
  /** Get the current run ID */
  getCurrentRunId(): string;
  /** Get summary statistics for the current run */
  getRunSummary(): RunSummary;
  /** Get all events for the current run */
  getRunEvents(): readonly SecurityEvent[];
  /** Check if logging is in degraded mode */
  isLoggingDegraded(): boolean;
}

/**
 * Create a new security logger instance.
 *
 * Use this factory when you need isolated logger state (e.g., for testing).
 * For most production use cases, use the default exported functions.
 *
 * @returns A new SecurityLogger instance with its own isolated state
 */
export function createSecurityLogger(): SecurityLogger {
  let state: LoggerState = createInitialState();

  /**
   * Handle logging failures gracefully (FR-023)
   */
  function handleLoggingFailure(category: string, error: string): void {
    state.loggingFailures.push({ category, error });
    state.isDegraded = true;

    // Fallback to stderr
    try {
      process.stderr.write(`[security] LOGGING_DEGRADED category=${category} error=${error}\n`);
    } catch {
      // Silently ignore if stderr is unavailable
    }
  }

  return {
    logSecurityEvent(input: SecurityEventInput): void {
      try {
        const event: SecurityEvent = {
          category: input.category,
          ruleId: input.ruleId,
          file: input.file,
          patternHash: hashPattern(input.pattern),
          durationMs: input.durationMs,
          outcome: input.outcome,
          errorReason: input.errorReason,
          timestamp: new Date().toISOString(),
          runId: state.runId,
        };

        // Validate the event
        const result = SecurityEventSchema.safeParse(event);
        if (!result.success) {
          handleLoggingFailure(input.category, `Validation failed: ${result.error.message}`);
          return;
        }

        // Store the event
        state.events.push(event);

        // Log to stderr for immediate visibility (structured JSON)
        const logLine = JSON.stringify({
          level: 'security',
          ...event,
        });
        process.stderr.write(`[security] ${logLine}\n`);
      } catch (error) {
        // FR-023: Logging failures don't block execution
        handleLoggingFailure(
          input.category,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }
    },

    startRun(): string {
      state = createInitialState();
      return state.runId;
    },

    getCurrentRunId(): string {
      return state.runId;
    },

    getRunSummary(): RunSummary {
      const successCount = state.events.filter((e) => e.outcome === 'success').length;
      const failureCount = state.events.filter((e) => e.outcome === 'failure').length;
      const timeoutCount = state.events.filter((e) => e.outcome === 'timeout').length;
      const totalDurationMs = state.events.reduce((sum, e) => sum + e.durationMs, 0);

      const loggingFailuresByCategory: Record<string, number> = {};
      for (const failure of state.loggingFailures) {
        loggingFailuresByCategory[failure.category] =
          (loggingFailuresByCategory[failure.category] ?? 0) + 1;
      }

      return {
        runId: state.runId,
        totalEvents: state.events.length,
        successCount,
        failureCount,
        timeoutCount,
        totalDurationMs,
        loggingFailuresTotal: state.loggingFailures.length,
        loggingFailuresByCategory,
        loggingDegraded: state.isDegraded,
      };
    },

    getRunEvents(): readonly SecurityEvent[] {
      return [...state.events];
    },

    isLoggingDegraded(): boolean {
      return state.isDegraded;
    },
  };
}

// =============================================================================
// Default Instance (Backwards Compatibility)
// =============================================================================

/**
 * Default logger instance for module-level exports.
 * Use createSecurityLogger() for isolated instances in tests.
 */
const defaultLogger = createSecurityLogger();

/**
 * Log a security event.
 *
 * This is the SOLE export for security logging. All security-relevant
 * code paths MUST use this function.
 *
 * Guarantees (FR-023):
 * - Logging failures don't block execution
 * - Falls back to stderr on validation errors
 * - Never throws exceptions
 *
 * @param input - Security event input (raw pattern will be hashed)
 */
export function logSecurityEvent(input: SecurityEventInput): void {
  defaultLogger.logSecurityEvent(input);
}

/**
 * Start a new logging run
 */
export function startRun(): string {
  return defaultLogger.startRun();
}

/**
 * Get the current run ID
 */
export function getCurrentRunId(): string {
  return defaultLogger.getCurrentRunId();
}

/**
 * Get summary statistics for the current run
 */
export function getRunSummary(): RunSummary {
  return defaultLogger.getRunSummary();
}

/**
 * Get all events for the current run (for testing/debugging)
 */
export function getRunEvents(): readonly SecurityEvent[] {
  return defaultLogger.getRunEvents();
}

/**
 * Check if logging is in degraded mode
 */
export function isLoggingDegraded(): boolean {
  return defaultLogger.isLoggingDegraded();
}

/**
 * Reset the default logger state for testing.
 * This ensures test isolation when using module-level exports.
 *
 * @internal - Only use in test files
 */
export function resetForTesting(): void {
  defaultLogger.startRun();
}
