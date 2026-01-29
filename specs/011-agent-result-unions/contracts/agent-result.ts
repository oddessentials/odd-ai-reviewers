/**
 * AgentResult Type Contract
 *
 * This file defines the type contracts for the AgentResult discriminated union.
 * It serves as a reference for implementation and test validation.
 *
 * NOTE: This is a contract specification, not the actual implementation.
 * The implementation lives in router/src/agents/types.ts
 *
 * Feature: 011-agent-result-unions
 * Date: 2026-01-29
 */

// Placeholder types for contract definition (actual types are in router/src/agents/types.ts)
type Finding = { severity: string; file: string; message: string; sourceAgent: string };
type AgentMetrics = { durationMs: number; filesProcessed: number };

// ============================================================================
// Discriminant Types
// ============================================================================

/**
 * Possible states for an agent run result.
 */
export type AgentResultStatus = 'success' | 'failure' | 'skipped';

/**
 * Indicates when during execution a failure occurred.
 * Used by consumers to determine if partialFindings are usable.
 *
 * - 'preflight': Before execution started (e.g., missing API key)
 * - 'exec': During execution (e.g., API timeout)
 * - 'postprocess': After execution during processing (e.g., parse error)
 */
export type FailureStage = 'preflight' | 'exec' | 'postprocess';

// ============================================================================
// Base Interface
// ============================================================================

/**
 * Common fields shared by all AgentResult variants.
 */
interface AgentResultBase {
  agentId: string;
  metrics: AgentMetrics;
}

// ============================================================================
// Variant Interfaces
// ============================================================================

/**
 * Success variant - agent completed and may have findings.
 *
 * Invariants:
 * - status is always 'success'
 * - findings array may be empty (agent found nothing)
 * - NO error field
 * - NO reason field
 */
export interface AgentResultSuccess extends AgentResultBase {
  status: 'success';
  findings: Finding[];
}

/**
 * Failure variant - agent failed with an error.
 *
 * Invariants:
 * - status is always 'failure'
 * - error message is required and non-empty
 * - failureStage indicates when failure occurred
 * - partialFindings may contain results before failure (MUST be labeled as partial)
 * - NO reason field
 */
export interface AgentResultFailure extends AgentResultBase {
  status: 'failure';
  error: string;
  failureStage: FailureStage;
  partialFindings: Finding[];
}

/**
 * Skipped variant - agent was not applicable.
 *
 * Invariants:
 * - status is always 'skipped'
 * - reason explains why the agent was skipped
 * - NO error field
 * - NO findings field
 */
export interface AgentResultSkipped extends AgentResultBase {
  status: 'skipped';
  reason: string;
}

// ============================================================================
// Union Type
// ============================================================================

/**
 * Discriminated union of all agent result variants.
 */
export type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;

// ============================================================================
// Constructor Function Signatures
// ============================================================================

/**
 * Create a success result.
 */
export type AgentSuccessFn = (params: {
  agentId: string;
  findings: Finding[];
  metrics: AgentMetrics;
}) => AgentResultSuccess;

/**
 * Create a failure result.
 */
export type AgentFailureFn = (params: {
  agentId: string;
  error: string;
  failureStage: FailureStage;
  partialFindings?: Finding[];
  metrics: AgentMetrics;
}) => AgentResultFailure;

/**
 * Create a skipped result.
 */
export type AgentSkippedFn = (params: {
  agentId: string;
  reason: string;
  metrics: AgentMetrics;
}) => AgentResultSkipped;

// ============================================================================
// Type Guard Signatures
// ============================================================================

export type IsSuccessFn = (result: AgentResult) => result is AgentResultSuccess;
export type IsFailureFn = (result: AgentResult) => result is AgentResultFailure;
export type IsSkippedFn = (result: AgentResult) => result is AgentResultSkipped;

// ============================================================================
// Compile-Time Validation Helpers
// ============================================================================

/**
 * Type-level assertion that a value is never (for exhaustiveness checks).
 * This should match the signature in router/src/types/assert-never.ts
 */
export type AssertNeverFn = (x: never, message?: string) => never;

/**
 * Validates that switch statement handles all variants.
 * This function exists only for compile-time checking.
 */
export function validateExhaustiveness(result: AgentResult): string {
  switch (result.status) {
    case 'success':
      return 'success';
    case 'failure':
      return 'failure';
    case 'skipped':
      return 'skipped';
    default:
      // If this line has a type error, a new variant was added
      // and this function needs updating
      return _assertNever(result);
  }
}

// Placeholder for assertNever - actual implementation in router/src/types
declare function _assertNever(x: never): never;

// ============================================================================
// Contract Invariants (Documented)
// ============================================================================

/**
 * INVARIANT 1: Exactly one status per result
 *   - Every AgentResult has exactly one of: 'success', 'failure', 'skipped'
 *
 * INVARIANT 2: Status determines available fields
 *   - success: has findings[], no error, no reason
 *   - failure: has error, failureStage, partialFindings[], no reason
 *   - skipped: has reason, no error, no findings
 *
 * INVARIANT 3: partialFindings is distinct from findings
 *   - AgentFailure has partialFindings (not findings)
 *   - partialFindings MUST be labeled as partial in reports/telemetry
 *   - partialFindings MUST NOT count toward success metrics
 *
 * INVARIANT 4: failureStage is required on failure
 *   - Indicates when failure occurred: 'preflight', 'exec', 'postprocess'
 *   - Helps consumers decide if partialFindings are usable
 *
 * INVARIANT 5: metrics is always present
 *   - All variants require metrics (even if minimal)
 *   - Enables consistent telemetry across all outcomes
 *
 * INVARIANT 6: status is the sole discriminator
 *   - No code path may infer success/failure via presence of fields
 *   - No code path may use truthy checks (result.success is forbidden)
 *   - switch (result.status) + assertNever is required pattern
 *
 * INVARIANT 7: Constructor helpers are the only creation mechanism
 *   - Ad-hoc object literals are forbidden
 *   - AgentSuccess(), AgentFailure(), AgentSkipped() enforce valid combinations
 *
 * INVARIANT 8: Deprecated getter is transitional only
 *   - Any deprecated success getter exists only during incremental migration
 *   - MUST be deleted before PR series merges
 *   - Internal modules MUST NOT use deprecated getter after migration
 */
