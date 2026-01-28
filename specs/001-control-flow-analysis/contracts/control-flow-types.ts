/**
 * Control Flow Analysis Types Contract
 *
 * Feature: 001-control-flow-analysis
 * Date: 2026-01-27
 *
 * This file defines the type contracts for the control flow analysis agent.
 * These types are used across the implementation and tests.
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
  isBuiltIn: z.boolean().default(false),
  deprecated: z.boolean().default(false),
  deprecationReason: z.string().optional(),
});
export type MitigationPattern = z.infer<typeof MitigationPatternSchema>;

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
  taintedVariables: z.array(z.string()), // Serialized from Set
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

export const AnalysisBudgetSchema = z.object({
  startTime: z.number().int().positive(),
  maxDurationMs: z.number().int().positive().default(300_000),
  maxLinesChanged: z.number().int().positive().default(10_000),
  maxCallDepth: z.number().int().positive().default(5),
  linesAnalyzed: z.number().int().nonnegative(),
  filesAnalyzed: z.number().int().nonnegative(),
  currentDepth: z.number().int().nonnegative(),
  status: BudgetStatusSchema,
  degradedAt: z.number().int().positive().optional(),
});
export type AnalysisBudget = z.infer<typeof AnalysisBudgetSchema>;

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
});
export type ControlFlowConfig = z.infer<typeof ControlFlowConfigSchema>;

// =============================================================================
// Agent Interface Types
// =============================================================================

export interface ControlFlowAgentContext {
  repoPath: string;
  files: string[];
  config: ControlFlowConfig;
  budget: AnalysisBudget;
}

export interface ControlFlowAgentResult {
  findings: ControlFlowFinding[];
  filesAnalyzed: number;
  functionsAnalyzed: number;
  budgetStatus: BudgetStatus;
  degraded: boolean;
  analysisLog: AnalysisLogEntry[];
}

export interface AnalysisLogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a custom mitigation pattern configuration.
 * Ensures patterns are declarative and side-effect-free (FR-015).
 */
export function validateMitigationPattern(
  pattern: unknown
): { success: true; data: MitigationPattern } | { success: false; error: z.ZodError } {
  const result = MitigationPatternSchema.safeParse(pattern);
  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Additional validation: ensure pattern is declarative
  const data = result.data;
  if (data.match.namePattern) {
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- Validating user-provided regex pattern
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
