/**
 * Control Flow Hardening Types Contract
 *
 * Feature: 004-control-flow-hardening
 * Date: 2026-01-28
 *
 * This file defines the type contracts for the control flow hardening feature.
 * These types extend the existing control flow analysis types.
 */

import { z } from 'zod';

// =============================================================================
// Call Chain Tracking (FR-006 to FR-011)
// =============================================================================

/**
 * A single entry in the call chain from vulnerability to mitigation.
 * Used to track how mitigations in other files are reached.
 */
export const CallChainEntrySchema = z.object({
  /** Source file containing this call */
  file: z.string(),

  /** Name of the function making or receiving the call */
  functionName: z.string(),

  /** Line number of the call site or mitigation */
  line: z.number().int().positive(),
});
export type CallChainEntry = z.infer<typeof CallChainEntrySchema>;

// =============================================================================
// Pattern Evaluation Tracking (FR-001 to FR-005)
// =============================================================================

/**
 * Result of evaluating a single regex pattern with timeout protection.
 */
export const PatternEvaluationResultSchema = z.object({
  /** ID of the pattern that was evaluated */
  patternId: z.string(),

  /** Whether the pattern matched the input */
  matched: z.boolean(),

  /** Whether evaluation was terminated due to timeout (FR-002) */
  timedOut: z.boolean(),

  /** Actual time taken for evaluation in milliseconds */
  elapsedMs: z.number().nonnegative(),

  /** Length of input string that was matched against */
  inputLength: z.number().int().nonnegative(),
});
export type PatternEvaluationResult = z.infer<typeof PatternEvaluationResultSchema>;

// =============================================================================
// Extended Mitigation Instance (FR-006 to FR-008)
// =============================================================================

/**
 * Extension fields for MitigationInstance to support cross-file tracking.
 * These are optional fields added to the existing MitigationInstance schema.
 */
export const MitigationInstanceExtensionSchema = z.object({
  /**
   * Call chain from vulnerability location to this mitigation.
   * First entry is the call site in the vulnerability file,
   * last entry is the mitigation itself.
   * Only populated when mitigation is in a different file. (FR-011)
   */
  callChain: z.array(CallChainEntrySchema).optional(),

  /**
   * How many call levels deep this mitigation was found.
   * 0 = same file, 1 = one call away, etc. (FR-008)
   */
  discoveryDepth: z.number().int().nonnegative().optional(),
});
export type MitigationInstanceExtension = z.infer<typeof MitigationInstanceExtensionSchema>;

// =============================================================================
// Cross-File Mitigation Info (FR-006, FR-007, FR-009, FR-010)
// =============================================================================

/**
 * Summary information about a cross-file mitigation for finding metadata.
 * Used in finding messages to report mitigation locations.
 */
export const CrossFileMitigationInfoSchema = z.object({
  /** ID of the mitigation pattern */
  patternId: z.string(),

  /** File where the mitigation was found (FR-006) */
  file: z.string(),

  /** Line number of the mitigation (FR-007) */
  line: z.number().int().positive(),

  /** Call depth at which the mitigation was detected (FR-008) */
  depth: z.number().int().nonnegative(),

  /** Name of the function containing the mitigation (optional) */
  functionName: z.string().optional(),
});
export type CrossFileMitigationInfo = z.infer<typeof CrossFileMitigationInfoSchema>;

// =============================================================================
// Pattern Timeout Info (FR-003, FR-004)
// =============================================================================

/**
 * Summary information about a pattern that timed out during evaluation.
 * Used in finding metadata to indicate conservative results.
 */
export const PatternTimeoutInfoSchema = z.object({
  /** ID of the pattern that timed out */
  patternId: z.string(),

  /** Time elapsed before timeout in milliseconds */
  elapsedMs: z.number().nonnegative(),
});
export type PatternTimeoutInfo = z.infer<typeof PatternTimeoutInfoSchema>;

// =============================================================================
// Extended Finding Metadata (FR-004, FR-006 to FR-010)
// =============================================================================

/**
 * Extension fields for FindingMetadata to support hardening features.
 * These are optional fields added to the existing FindingMetadata schema.
 */
export const FindingMetadataExtensionSchema = z.object({
  /**
   * Details of mitigations found in different files than the vulnerability.
   * Populated when any mitigation has discoveryDepth > 0. (FR-006 to FR-010)
   */
  crossFileMitigations: z.array(CrossFileMitigationInfoSchema).optional(),

  /**
   * Patterns that timed out during evaluation.
   * Indicates results may be conservative. (FR-004)
   */
  patternTimeouts: z.array(PatternTimeoutInfoSchema).optional(),
});
export type FindingMetadataExtension = z.infer<typeof FindingMetadataExtensionSchema>;

// =============================================================================
// Extended Config (FR-001, FR-005)
// =============================================================================

/**
 * Extension field for ControlFlowConfig to support pattern timeout.
 */
export const ControlFlowConfigExtensionSchema = z.object({
  /**
   * Maximum time in milliseconds for a single regex pattern evaluation.
   * Range: 10-1000ms. Default: 100ms. (FR-001, FR-005)
   */
  patternTimeoutMs: z.number().int().min(10).max(1000).default(100),
});
export type ControlFlowConfigExtension = z.infer<typeof ControlFlowConfigExtensionSchema>;

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a call chain is properly ordered (vulnerability → mitigation).
 */
export function validateCallChain(chain: CallChainEntry[]): boolean {
  // Chain must have at least one entry (the mitigation itself)
  return chain.length >= 1;
}

/**
 * Validate discovery depth matches call chain length.
 */
export function validateDepthConsistency(
  callChain: CallChainEntry[] | undefined,
  discoveryDepth: number | undefined
): boolean {
  if (callChain === undefined && discoveryDepth === undefined) {
    return true; // Both undefined is valid (same-file mitigation)
  }
  if (callChain !== undefined && discoveryDepth !== undefined) {
    // depth 0 = same file = chain has 1 entry (just mitigation)
    // depth N = N calls away = chain has N+1 entries
    return callChain.length === discoveryDepth + 1;
  }
  // One defined without the other is invalid
  return false;
}
