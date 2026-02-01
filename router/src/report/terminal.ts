/**
 * Terminal Reporter Module
 *
 * Formats findings for terminal display with colors, boxes, and progress.
 * Follows the same pipeline as GitHub/ADO reporters:
 *   canonicalize → build line resolver → normalize → deduplicate → sort → format
 *
 * @module report/terminal
 */

import type { Finding } from '../agents/types.js';
import type { Config } from '../config.js';
import type { CanonicalDiffFile } from '../diff.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Context object for terminal reporter
 */
export interface TerminalContext {
  /** Enable ANSI colors (auto-detected from TTY and NO_COLOR env) */
  readonly colored: boolean;
  /** Show debug information */
  readonly verbose: boolean;
  /** Errors only (minimal output) */
  readonly quiet: boolean;
  /** Output format */
  readonly format: 'pretty' | 'json' | 'sarif';
  /** Show progress indicators during agent execution */
  readonly showProgress: boolean;
  /** Show cost in summary */
  readonly showCost: boolean;
}

/**
 * Result of terminal report generation
 */
export interface TerminalReportResult {
  /** Whether report generation succeeded */
  readonly success: boolean;
  /** Number of findings reported */
  readonly findingsCount: number;
  /** Number of partial findings reported */
  readonly partialFindingsCount: number;
  /** Error message if success is false */
  readonly error?: string;
  /** Whether the run was interrupted */
  readonly interrupted?: boolean;
}

/**
 * Code snippet for displaying findings with context
 */
export interface CodeSnippet {
  /** Array of code lines with context */
  readonly lines: readonly SnippetLine[];
  /** 0-indexed line to highlight */
  readonly highlightLine: number;
  /** Language hint for syntax highlighting */
  readonly language?: string;
}

/**
 * Individual line in code snippet
 */
export interface SnippetLine {
  /** 1-indexed line number */
  readonly lineNumber: number;
  /** Line content */
  readonly content: string;
  /** Whether this is the finding line */
  readonly isHighlighted: boolean;
}

/**
 * Extended finding for terminal display with code context
 */
export interface TerminalFinding extends Finding {
  /** Surrounding code context */
  readonly codeSnippet?: CodeSnippet;
  /** Normalized line for display */
  readonly displayLine?: number;
}

/**
 * Summary statistics for review results
 */
export interface ReviewSummary {
  /** Findings with severity 'error' */
  readonly errorCount: number;
  /** Findings with severity 'warning' */
  readonly warningCount: number;
  /** Findings with severity 'info' */
  readonly infoCount: number;
  /** Number of files analyzed */
  readonly filesAnalyzed: number;
  /** Total additions + deletions */
  readonly linesChanged: number;
  /** Milliseconds elapsed */
  readonly executionTime: number;
  /** USD estimate */
  readonly estimatedCost: number;
  /** Per-pass breakdown */
  readonly passResults: readonly PassSummary[];
}

/**
 * Summary for a single review pass
 */
export interface PassSummary {
  /** Pass identifier */
  readonly passName: string;
  /** Findings from this pass */
  readonly findingsCount: number;
  /** Per-agent breakdown */
  readonly agentResults: readonly AgentSummary[];
  /** Pass execution time in ms */
  readonly durationMs: number;
}

/**
 * Summary for a single agent execution
 */
export interface AgentSummary {
  /** Agent identifier */
  readonly agentId: string;
  /** Human-readable name */
  readonly agentName: string;
  /** Execution result */
  readonly status: 'success' | 'failure' | 'skipped' | 'interrupted';
  /** Findings produced */
  readonly findingsCount: number;
  /** Skip/failure reason */
  readonly reason?: string;
}

/**
 * JSON output schema (FR-SCH-001 compliant)
 */
export interface JsonOutput {
  /** Output format version for consumer compatibility validation */
  readonly schema_version: string;
  /** Tool version from package.json */
  readonly version: string;
  /** ISO 8601 timestamp, always UTC */
  readonly timestamp: string;
  /** Summary statistics */
  readonly summary: {
    readonly errorCount: number;
    readonly warningCount: number;
    readonly infoCount: number;
    readonly filesAnalyzed: number;
    readonly linesChanged: number;
    readonly executionTimeMs: number;
    readonly estimatedCostUsd: number;
  };
  /** All findings */
  readonly findings: readonly Finding[];
  /** Partial findings (from interrupted agents) */
  readonly partialFindings: readonly Finding[];
  /** Pass results */
  readonly passes: readonly PassSummary[];
  /** Config source information */
  readonly config: {
    readonly source: 'file' | 'zero-config';
    readonly path?: string;
  };
}

// =============================================================================
// Implementation (Phase 5)
// =============================================================================

// Placeholder exports - implementations added in Phase 5
export const reportToTerminal = undefined as unknown as (
  findings: Finding[],
  partialFindings: Finding[],
  context: TerminalContext,
  config: Config,
  diffFiles: CanonicalDiffFile[]
) => Promise<TerminalReportResult>;

export const formatFindingForTerminal = undefined as unknown as (
  finding: Finding,
  context: TerminalContext
) => string;

export const generateTerminalSummary = undefined as unknown as (
  findings: Finding[],
  partialFindings: Finding[],
  executionTimeMs: number,
  estimatedCostUsd: number
) => string;
