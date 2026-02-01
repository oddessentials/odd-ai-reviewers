/**
 * Terminal Reporter Module
 *
 * Formats findings for terminal display with support for:
 * - Pretty format (colors, boxes, code snippets)
 * - JSON format (with schema_version for compatibility)
 * - SARIF 2.1.0 format (for IDE integration)
 *
 * Follows the same processing pipeline as GitHub/ADO reporters.
 */

import type { Finding } from '../agents/types.js';
import type { DiffFile } from '../diff.js';
import type { Config } from '../config.js';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Context for terminal reporter
 */
export interface TerminalContext {
  /** Enable ANSI colors (auto-detected from TTY) */
  colored: boolean;
  /** Show debug information */
  verbose: boolean;
  /** Errors only mode */
  quiet: boolean;
  /** Output format */
  format: 'pretty' | 'json' | 'sarif';
  /** Show progress indicators */
  showProgress: boolean;
  /** Show cost in summary */
  showCost: boolean;
}

/**
 * Result from terminal reporter
 */
export interface TerminalReportResult {
  /** Whether reporting succeeded */
  success: boolean;
  /** Number of findings reported */
  findingsCount: number;
  /** Number of partial findings (from interrupted agents) */
  partialFindingsCount: number;
  /** Error message if reporting failed */
  error?: string;
}

/**
 * Code snippet for display
 */
export interface CodeSnippet {
  /** Array of code lines */
  lines: SnippetLine[];
  /** 0-indexed line to highlight */
  highlightLine: number;
  /** Language hint for syntax coloring */
  language?: string;
}

/**
 * Individual line in code snippet
 */
export interface SnippetLine {
  /** 1-indexed line number */
  lineNumber: number;
  /** Line content */
  content: string;
  /** Whether this is the finding line */
  isHighlighted: boolean;
}

/**
 * Extended finding with terminal display context
 */
export interface TerminalFinding extends Finding {
  /** Extracted code context */
  codeSnippet?: CodeSnippet;
  /** Normalized line for display */
  displayLine?: number;
}

/**
 * Summary of review results
 */
export interface ReviewSummary {
  /** Count of error-severity findings */
  errorCount: number;
  /** Count of warning-severity findings */
  warningCount: number;
  /** Count of info-severity findings */
  infoCount: number;
  /** Number of files analyzed */
  filesAnalyzed: number;
  /** Total line changes (additions + deletions) */
  linesChanged: number;
  /** Execution time in milliseconds */
  executionTimeMs: number;
  /** Estimated cost in USD */
  estimatedCostUsd: number;
  /** Per-pass summary */
  passResults: PassSummary[];
}

/**
 * Summary for a single pass
 */
export interface PassSummary {
  /** Pass name */
  passName: string;
  /** Findings from this pass */
  findingsCount: number;
  /** Per-agent breakdown */
  agentResults: AgentSummary[];
  /** Pass execution time */
  durationMs: number;
}

/**
 * Summary for a single agent
 */
export interface AgentSummary {
  /** Agent identifier */
  agentId: string;
  /** Human-readable name */
  agentName: string;
  /** Execution result */
  status: 'success' | 'failure' | 'skipped';
  /** Findings produced */
  findingsCount: number;
  /** Skip/failure reason */
  reason?: string;
}

/**
 * JSON output schema (FR-SCH-001)
 */
export interface JsonOutput {
  /** Output format version for consumer compatibility */
  schema_version: string;
  /** Tool version from package.json */
  version: string;
  /** ISO 8601 timestamp, always UTC */
  timestamp: string;
  /** Summary statistics */
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    filesAnalyzed: number;
    linesChanged: number;
    executionTimeMs: number;
    estimatedCostUsd: number;
  };
  /** Complete findings */
  findings: Finding[];
  /** Partial findings from interrupted agents */
  partialFindings: Finding[];
  /** Per-pass results */
  passes: PassSummary[];
  /** Config source info */
  config: {
    source: 'file' | 'zero-config';
    path?: string;
  };
}

/**
 * SARIF 2.1.0 output structure (FR-SCH-002)
 */
export interface SarifOutput {
  $schema: string;
  version: '2.1.0';
  runs: SarifRun[];
}

export interface SarifRun {
  tool: {
    driver: {
      name: string;
      version: string;
      informationUri: string;
      rules: SarifRule[];
    };
  };
  results: SarifResult[];
}

export interface SarifRule {
  id: string;
  name?: string;
  shortDescription?: { text: string };
}

export interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: SarifLocation[];
  fixes?: SarifFix[];
  properties?: Record<string, unknown>;
}

export interface SarifLocation {
  physicalLocation: {
    artifactLocation: { uri: string };
    region: {
      startLine: number;
      endLine?: number;
    };
  };
}

export interface SarifFix {
  description: { text: string };
}

// =============================================================================
// Default Context
// =============================================================================

/**
 * Create default terminal context
 */
export function createDefaultContext(): TerminalContext {
  return {
    colored: true,
    verbose: false,
    quiet: false,
    format: 'pretty',
    showProgress: true,
    showCost: true,
  };
}

// =============================================================================
// Placeholder Implementation (to be filled in Phase 5)
// =============================================================================

/**
 * Report findings to terminal.
 *
 * Follows the same pipeline as GitHub/ADO reporters:
 * 1. Canonicalize diff files
 * 2. Build line resolver
 * 3. Normalize findings
 * 4. Deduplicate
 * 5. Sort
 * 6. Format and output
 *
 * @param findings - Complete findings
 * @param partialFindings - Findings from interrupted agents
 * @param context - Terminal context (colors, format, etc.)
 * @param config - Review configuration
 * @param diffFiles - Diff files for context
 * @returns Report result
 */
export async function reportToTerminal(
  _findings: Finding[],
  _partialFindings: Finding[],
  _context: TerminalContext,
  _config: Config,
  _diffFiles: DiffFile[]
): Promise<TerminalReportResult> {
  // Placeholder - full implementation in Phase 5
  return {
    success: true,
    findingsCount: 0,
    partialFindingsCount: 0,
  };
}

/**
 * Format a single finding for terminal display
 */
export function formatFindingForTerminal(_finding: Finding, _context: TerminalContext): string {
  // Placeholder - full implementation in Phase 5
  return '';
}

/**
 * Generate terminal summary
 */
export function generateTerminalSummary(
  _findings: Finding[],
  _partialFindings: Finding[],
  _executionTimeMs: number,
  _estimatedCostUsd: number
): string {
  // Placeholder - full implementation in Phase 5
  return '';
}
