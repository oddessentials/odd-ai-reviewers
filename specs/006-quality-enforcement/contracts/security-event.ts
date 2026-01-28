/**
 * Security Event Contract
 *
 * Defines the schema for security-related logging events.
 * All security-relevant code paths MUST use SecurityLogger module.
 *
 * @see FR-021, FR-022, FR-024
 */

import { z } from 'zod';

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
 *
 * Represents a single security-relevant event during analysis.
 * Raw patterns MUST NOT be included - use patternHash instead.
 */
export const SecurityEvent = z
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

export type SecurityEvent = z.infer<typeof SecurityEvent>;

/**
 * Run summary statistics
 */
export const RunSummary = z.object({
  runId: z.string().min(1),
  totalEvents: z.number().min(0),
  successCount: z.number().min(0),
  failureCount: z.number().min(0),
  timeoutCount: z.number().min(0),
  totalDurationMs: z.number().min(0),
  loggingFailuresTotal: z.number().min(0),
  loggingFailuresByCategory: z.record(z.string(), z.number()),
  loggingDegraded: z.boolean(),
});

export type RunSummary = z.infer<typeof RunSummary>;
