/**
 * Control Flow Analysis Types
 *
 * Type definitions for the control flow analysis agent.
 * Based on specs/001-control-flow-analysis/contracts/control-flow-types.ts
 */

import { z } from 'zod';

// =============================================================================
// Enums and Literals
// =============================================================================

export const VulnerabilityTypeSchema = z.enum([
  'injection',
  'null_deref',
  'auth_bypass',
  'xss',
  'path_traversal',
  'prototype_pollution',
  'ssrf',
]);
export type VulnerabilityType = z.infer<typeof VulnerabilityTypeSchema>;

export const SeveritySchema = z.enum(['error', 'warning', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

export const MitigationStatusSchema = z.enum(['none', 'partial', 'full']);
export type MitigationStatus = z.infer<typeof MitigationStatusSchema>;

export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const BudgetStatusSchema = z.enum(['ok', 'warning', 'exceeded', 'terminated']);
export type BudgetStatus = z.infer<typeof BudgetStatusSchema>;

export const CFGNodeTypeSchema = z.enum([
  'entry',
  'exit',
  'throw',
  'basic',
  'branch',
  'merge',
  'loop_header',
  'loop_body',
  'call',
  'await',
]);
export type CFGNodeType = z.infer<typeof CFGNodeTypeSchema>;

export const CFGEdgeTypeSchema = z.enum([
  'sequential',
  'branch_true',
  'branch_false',
  'loop_back',
  'loop_exit',
  'exception',
  'return',
  'await', // Edge to/from an await suspension point
]);
export type CFGEdgeType = z.infer<typeof CFGEdgeTypeSchema>;

export const MatchTypeSchema = z.enum([
  'function_call',
  'method_call',
  'type_guard',
  'assignment',
  'typeof_check',
  'instanceof_check',
]);
export type MatchType = z.infer<typeof MatchTypeSchema>;

export const MitigationScopeSchema = z.enum(['block', 'function', 'module']);
export type MitigationScope = z.infer<typeof MitigationScopeSchema>;

// =============================================================================
// Source Location
// =============================================================================

export const SourceLocationSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  column: z.number().int().nonnegative().optional(),
  endLine: z.number().int().positive().optional(),
  endColumn: z.number().int().nonnegative().optional(),
});
export type SourceLocation = z.infer<typeof SourceLocationSchema>;

// =============================================================================
// Mitigation Pattern (Configuration)
// =============================================================================

export const ParameterConstraintSchema = z.object({
  index: z.number().int().nonnegative(),
  constraint: z.enum(['any', 'string', 'tainted_source']),
});
export type ParameterConstraint = z.infer<typeof ParameterConstraintSchema>;

export const ReturnConstraintSchema = z.enum(['truthy', 'defined', 'sanitized']);
export type ReturnConstraint = z.infer<typeof ReturnConstraintSchema>;

export const MatchCriteriaSchema = z.object({
  type: MatchTypeSchema,
  name: z.string().optional(),
  namePattern: z.string().optional(),
  module: z.string().optional(),
  parameters: z.array(ParameterConstraintSchema).optional(),
  returnConstraint: ReturnConstraintSchema.optional(),
});
export type MatchCriteria = z.infer<typeof MatchCriteriaSchema>;

export const MitigationPatternSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  mitigates: z.array(VulnerabilityTypeSchema).min(1),
  match: MatchCriteriaSchema,
  confidence: ConfidenceSchema,
  isBuiltIn: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  deprecationReason: z.string().optional(),
});
export type MitigationPattern = z.infer<typeof MitigationPatternSchema>;

// =============================================================================
// Call Chain Entry (Cross-File Mitigation Tracking)
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
// Pattern Evaluation Result (Timeout Tracking)
// =============================================================================

/**
 * Result of evaluating a single regex pattern with timeout protection.
 */
export const PatternEvaluationResultSchema = z.object({
  /** ID of the pattern that was evaluated */
  patternId: z.string(),
  /** Whether the pattern matched the input */
  matched: z.boolean(),
  /** Whether evaluation was terminated due to timeout */
  timedOut: z.boolean(),
  /** Actual time taken for evaluation in milliseconds */
  elapsedMs: z.number().nonnegative(),
  /** Length of input string that was matched against */
  inputLength: z.number().int().nonnegative(),
});
export type PatternEvaluationResult = z.infer<typeof PatternEvaluationResultSchema>;

// =============================================================================
// Cross-File Mitigation Info
// =============================================================================

/**
 * Summary information about a cross-file mitigation for finding metadata.
 * Used in finding messages to report mitigation locations.
 */
export const CrossFileMitigationInfoSchema = z.object({
  /** ID of the mitigation pattern */
  patternId: z.string(),
  /** File where the mitigation was found */
  file: z.string(),
  /** Line number of the mitigation */
  line: z.number().int().positive(),
  /** Call depth at which the mitigation was detected */
  depth: z.number().int().nonnegative(),
  /** Name of the function containing the mitigation (optional) */
  functionName: z.string().optional(),
});
export type CrossFileMitigationInfo = z.infer<typeof CrossFileMitigationInfoSchema>;

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
// Mitigation Instance (Runtime Detection)
// =============================================================================

export const MitigationInstanceSchema = z.object({
  patternId: z.string(),
  location: SourceLocationSchema,
  protectedVariables: z.array(z.string()),
  protectedPaths: z.array(z.string()),
  scope: MitigationScopeSchema,
  confidence: ConfidenceSchema,
  // Cross-file tracking fields (optional for backward compatibility)
  /** Call chain from vulnerability location to this mitigation */
  callChain: z.array(CallChainEntrySchema).optional(),
  /** How many call levels deep this mitigation was found (0 = same file) */
  discoveryDepth: z.number().int().nonnegative().optional(),
});
export type MitigationInstance = z.infer<typeof MitigationInstanceSchema>;

// =============================================================================
// Control Flow Graph
// =============================================================================

export const CFGNodeSchema = z.object({
  id: z.string(),
  type: CFGNodeTypeSchema,
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  mitigations: z.array(MitigationInstanceSchema),
  taintedVariables: z.array(z.string()),
});
export type CFGNode = z.infer<typeof CFGNodeSchema>;

export const CFGEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: CFGEdgeTypeSchema,
  conditionValue: z.boolean().optional(),
});
export type CFGEdge = z.infer<typeof CFGEdgeSchema>;

export const CallSiteSchema = z.object({
  nodeId: z.string(),
  calleeName: z.string(),
  calleeFile: z.string().optional(),
  isResolved: z.boolean(),
  isDynamic: z.boolean(),
  location: SourceLocationSchema,
});
export type CallSite = z.infer<typeof CallSiteSchema>;

export const ControlFlowGraphSchema = z.object({
  functionId: z.string(),
  functionName: z.string(),
  filePath: z.string(),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  nodes: z.record(z.string(), CFGNodeSchema),
  edges: z.array(CFGEdgeSchema),
  entryNode: z.string(),
  exitNodes: z.array(z.string()).min(1),
  callSites: z.array(CallSiteSchema),
});
export type ControlFlowGraph = z.infer<typeof ControlFlowGraphSchema>;

// =============================================================================
// Potential Vulnerability
// =============================================================================

export const PotentialVulnerabilitySchema = z.object({
  id: z.string(),
  type: VulnerabilityTypeSchema,
  sinkLocation: SourceLocationSchema,
  taintedSource: SourceLocationSchema.optional(),
  affectedVariable: z.string(),
  requiredMitigations: z.array(VulnerabilityTypeSchema),
  description: z.string(),
});
export type PotentialVulnerability = z.infer<typeof PotentialVulnerabilitySchema>;

// =============================================================================
// Control Flow Finding (Output)
// =============================================================================

export const FindingMetadataSchema = z.object({
  mitigationStatus: MitigationStatusSchema,
  originalSeverity: SeveritySchema.optional(),
  pathsCovered: z.number().int().nonnegative(),
  pathsTotal: z.number().int().positive(),
  unprotectedPaths: z.array(z.string()),
  mitigationsDetected: z.array(z.string()),
  analysisDepth: z.number().int().nonnegative(),
  degraded: z.boolean(),
  degradedReason: z.string().optional(),
  // Cross-file mitigation tracking (optional for backward compatibility)
  /** Details of mitigations found in different files than the vulnerability */
  crossFileMitigations: z.array(CrossFileMitigationInfoSchema).optional(),
  /** Patterns that timed out during evaluation (indicates conservative results) */
  patternTimeouts: z.array(PatternTimeoutInfoSchema).optional(),
});
export type FindingMetadata = z.infer<typeof FindingMetadataSchema>;

export const ControlFlowFindingSchema = z.object({
  severity: SeveritySchema,
  file: z.string(),
  line: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string().regex(/^cfa\//),
  sourceAgent: z.literal('control_flow'),
  fingerprint: z.string(),
  metadata: FindingMetadataSchema,
});
export type ControlFlowFinding = z.infer<typeof ControlFlowFindingSchema>;

// =============================================================================
// Analysis Budget
// =============================================================================

export const AnalysisBudgetConfigSchema = z.object({
  maxDurationMs: z.number().int().positive().default(300_000),
  maxLinesChanged: z.number().int().positive().default(10_000),
  maxCallDepth: z.number().int().positive().default(5),
  maxNodesVisited: z.number().int().positive().default(10_000),
});
export type AnalysisBudgetConfig = z.infer<typeof AnalysisBudgetConfigSchema>;

// =============================================================================
// ReDoS Detection Result (Pattern Validation)
// =============================================================================

/**
 * Risk level for ReDoS vulnerability assessment.
 */
export const ReDoSRiskLevelSchema = z.enum(['none', 'low', 'medium', 'high']);
export type ReDoSRiskLevel = z.infer<typeof ReDoSRiskLevelSchema>;

/**
 * Result of checking a pattern for ReDoS vulnerability patterns.
 * Internal result from static pattern analysis.
 */
export const ReDoSDetectionResultSchema = z.object({
  /** Pattern contains `(a+)+` style constructs */
  hasNestedQuantifiers: z.boolean(),
  /** Pattern contains `(a|a)+` style constructs */
  hasOverlappingAlternation: z.boolean(),
  /** Pattern contains `(.*a){n}` style constructs */
  hasQuantifiedOverlap: z.boolean(),
  /** Maximum nesting depth of Kleene operators */
  starHeight: z.number().int().nonnegative(),
  /** Composite risk score (0-100) */
  vulnerabilityScore: z.number().min(0).max(100),
  /** Names of ReDoS patterns detected */
  detectedPatterns: z.array(z.string()),
});
export type ReDoSDetectionResult = z.infer<typeof ReDoSDetectionResultSchema>;

/**
 * Result of validating a regex pattern for ReDoS vulnerabilities.
 * Captures validation status and details for audit logging and error reporting.
 */
export const PatternValidationResultSchema = z.object({
  /** The regex pattern that was validated */
  pattern: z.string().min(1),
  /** Identifier for the pattern */
  patternId: z.string().min(1),
  /** Whether the pattern passed validation */
  isValid: z.boolean(),
  /** Reasons why pattern was rejected (empty if valid) */
  rejectionReasons: z.array(z.string()).default([]),
  /** Assessed ReDoS risk level */
  redosRisk: ReDoSRiskLevelSchema,
  /** Time taken for validation in milliseconds */
  validationTimeMs: z.number().nonnegative(),
  /** Whether pattern was whitelisted (skipped validation) */
  whitelisted: z.boolean().optional(),
});
export type PatternValidationResult = z.infer<typeof PatternValidationResultSchema>;

/**
 * Error type categories for validation errors.
 */
export const ValidationErrorTypeSchema = z.enum([
  'compilation',
  'validation',
  'timeout',
  'resource',
]);
export type ValidationErrorType = z.infer<typeof ValidationErrorTypeSchema>;

/**
 * Represents an error encountered during pattern validation or execution.
 * Structured error information for logging and recovery decisions.
 */
export const ValidationErrorSchema = z.object({
  /** Category of error */
  errorType: ValidationErrorTypeSchema,
  /** Pattern that caused the error */
  patternId: z.string().min(1),
  /** Human-readable error description */
  message: z.string().min(1),
  /** Additional context (input length, elapsed time, etc.) */
  details: z.record(z.string(), z.unknown()).optional(),
  /** Whether analysis can continue */
  recoverable: z.boolean(),
  /** Unix timestamp of error occurrence */
  timestamp: z.number().int().positive(),
});
export type ValidationError = z.infer<typeof ValidationErrorSchema>;

// =============================================================================
// Configuration
// =============================================================================

export const PatternOverrideSchema = z.object({
  patternId: z.string(),
  confidence: ConfidenceSchema.optional(),
  deprecated: z.boolean().optional(),
  deprecationReason: z.string().optional(),
});
export type PatternOverride = z.infer<typeof PatternOverrideSchema>;

export const ControlFlowConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxCallDepth: z.number().int().positive().default(5),
  timeBudgetMs: z.number().int().positive().default(300_000),
  sizeBudgetLines: z.number().int().positive().default(10_000),
  mitigationPatterns: z.array(MitigationPatternSchema).default([]),
  patternOverrides: z.array(PatternOverrideSchema).default([]),
  disabledPatterns: z.array(z.string()).default([]),
  /** Maximum time in milliseconds for a single regex pattern evaluation (10-1000ms) */
  patternTimeoutMs: z.number().int().min(10).max(1000).default(100),
  /** Pattern IDs to skip ReDoS validation (manually verified safe) */
  whitelistedPatterns: z.array(z.string()).default([]),
  /** Maximum time allowed for pattern validation in milliseconds (1-100ms) */
  validationTimeoutMs: z.number().int().min(1).max(100).default(10),
  /** Minimum ReDoS risk level that causes pattern rejection */
  rejectionThreshold: ReDoSRiskLevelSchema.default('medium'),
});
export type ControlFlowConfig = z.infer<typeof ControlFlowConfigSchema>;

// =============================================================================
// Agent Interface Types
// =============================================================================

export interface AnalysisLogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

// =============================================================================
// Traversal State (Node Visit Tracking)
// =============================================================================

/**
 * Result classification when node limit is exceeded.
 * Uses 'unknown' to indicate incomplete analysis - NOT a safety assertion.
 */
export const NodeLimitClassificationSchema = z.enum(['unknown']);
export type NodeLimitClassification = z.infer<typeof NodeLimitClassificationSchema>;

/**
 * Reason codes for traversal termination.
 */
export const TraversalTerminationReasonSchema = z.enum(['node_limit_exceeded', 'completed']);
export type TraversalTerminationReason = z.infer<typeof TraversalTerminationReasonSchema>;

/**
 * State maintained during a single CFG traversal.
 *
 * IMPORTANT: This state is per-traversal, not shared across traversals.
 * Each new traversal should create a fresh TraversalState instance.
 *
 * Canonical field names for logging:
 * - nodesVisited: Current count of nodes visited
 * - maxNodesVisited: Configured limit from budget
 * - classification: Result classification if limit reached ('unknown')
 * - reason: Why traversal terminated ('node_limit_exceeded' or 'completed')
 */
export interface TraversalState {
  /** Current count of nodes visited in this traversal */
  nodesVisited: number;
  /** Maximum nodes allowed (from budget config) */
  maxNodesVisited: number;
  /** Whether the node limit was reached */
  limitReached: boolean;
  /** Classification assigned when limit is reached */
  classification?: NodeLimitClassification;
  /** Reason for traversal termination */
  reason?: TraversalTerminationReason;
}

/**
 * Result of visiting a node during traversal.
 */
export interface NodeVisitResult {
  /** Whether the node limit was reached on this visit */
  limitReached: boolean;
  /** Classification if limit was reached ('unknown' = analysis incomplete) */
  classification?: NodeLimitClassification;
  /** Reason for the result */
  reason?: TraversalTerminationReason;
}

/**
 * Create a fresh traversal state for a new traversal.
 *
 * @param maxNodesVisited - Maximum nodes to visit (from budget config)
 * @returns Fresh traversal state with counters reset
 */
export function createTraversalState(maxNodesVisited: number): TraversalState {
  return {
    nodesVisited: 0,
    maxNodesVisited,
    limitReached: false,
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a custom mitigation pattern configuration.
 * Ensures patterns are declarative and side-effect-free (FR-015).
 *
 * Note: This validates syntax only. For ReDoS protection, use
 * `validateMitigationPatternWithReDoSCheck` from pattern-validator.ts
 * or ensure patterns are used through `createValidatedTimeoutRegex`.
 */
export function validateMitigationPattern(
  pattern: unknown
): { success: true; data: MitigationPattern } | { success: false; error: z.ZodError } {
  const result = MitigationPatternSchema.safeParse(pattern);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  const data = result.data;
  if (data.match.namePattern) {
    try {
      // Trust: REPO_CONFIG - Pattern from config file, validated during Zod parsing
      // Control: Compilation test ensures syntax validity before config is accepted
      // See docs/security/regex-threat-model.md
      // eslint-disable-next-line security/detect-non-literal-regexp -- Validated config pattern
      new RegExp(data.match.namePattern);
    } catch {
      return {
        success: false,
        error: new z.ZodError([
          {
            code: 'custom',
            path: ['match', 'namePattern'],
            message: 'Invalid regex pattern',
          },
        ]),
      };
    }
  }

  return { success: true, data };
}

/**
 * Validate control flow configuration.
 */
export function validateControlFlowConfig(
  config: unknown
): { success: true; data: ControlFlowConfig } | { success: false; error: z.ZodError } {
  return ControlFlowConfigSchema.safeParse(config);
}
