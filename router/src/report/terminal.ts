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

import type { Finding, Severity } from '../agents/types.js';
import type { DiffFile, CanonicalDiffFile } from '../diff.js';
import { canonicalizeDiffFiles } from '../diff.js';
import type { Config } from '../config.js';
import { buildLineResolver, normalizeFindingsForDiff } from './line-resolver.js';
import {
  deduplicateFindings,
  deduplicatePartialFindings,
  sortFindings,
  countBySeverity,
} from './formats.js';
import {
  ANSI,
  colorize,
  visibleLength,
  createColorizer,
  supportsUnicode,
} from '../cli/output/colors.js';
import { formatDuration, getSeverityIndicator } from '../cli/output/progress.js';

// =============================================================================
// Constants
// =============================================================================

/** Current JSON output schema version */
export const JSON_SCHEMA_VERSION = '1.0.0';

/** SARIF schema URL */
export const SARIF_SCHEMA_URL =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json';

/** Tool information URI */
export const TOOL_INFO_URI = 'https://github.com/oddessentials/odd-ai-reviewers';

/** Tool name for SARIF output */
export const TOOL_NAME = 'odd-ai-reviewers';

/** Default box width for findings */
const DEFAULT_BOX_WIDTH = 80;

/** Number of context lines for code snippets */
const CONTEXT_LINES = 3;

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Context for terminal reporter
 */
export interface TerminalContext {
  /** Enable ANSI colors (auto-detected from TTY) */
  colored: boolean;
  /** Enable Unicode box drawing (auto-detected from terminal) */
  useUnicode: boolean;
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
  /** Tool version (from package.json) */
  version?: string;
  /** Config source info */
  configSource?: {
    source: 'file' | 'zero-config';
    path?: string;
  };
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** Estimated cost in USD */
  estimatedCostUsd?: number;
  /** Base reference used for diff */
  baseRef?: string;
  /** Whether base was auto-detected or specified */
  baseSource?: 'auto-detected' | 'specified';
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
// Box Drawing Utilities
// =============================================================================

/**
 * Unicode box drawing characters
 */
export const BOX_CHARS = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  sectionDivider: '━',
} as const;

/**
 * ASCII fallback box drawing characters
 */
export const ASCII_BOX_CHARS = {
  topLeft: '+',
  topRight: '+',
  bottomLeft: '+',
  bottomRight: '+',
  horizontal: '-',
  vertical: '|',
  sectionDivider: '=',
} as const;

export interface BoxCharSet {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
  readonly sectionDivider: string;
}

/**
 * Get box drawing characters based on unicode support
 *
 * @param useUnicode - Whether to use Unicode characters
 * @returns Box drawing character set
 */
export function getBoxChars(useUnicode: boolean): BoxCharSet {
  return useUnicode ? BOX_CHARS : ASCII_BOX_CHARS;
}

/**
 * Draw a horizontal line
 *
 * @param width - Line width in characters
 * @param char - Character to use
 * @returns Horizontal line string
 */
export function drawHorizontalLine(width: number, char: string): string {
  return char.repeat(width);
}

/**
 * Draw a section divider
 *
 * @param width - Divider width
 * @param useUnicode - Whether to use Unicode
 * @returns Section divider string
 */
export function drawSectionDivider(width: number, useUnicode: boolean): string {
  const chars = getBoxChars(useUnicode);
  return chars.sectionDivider.repeat(width);
}

/**
 * Pad text to fit within a box
 *
 * @param text - Text to pad
 * @param width - Target width
 * @param align - Alignment ('left', 'center', 'right')
 * @returns Padded text
 */
export function padToWidth(
  text: string,
  width: number,
  align: 'left' | 'center' | 'right' = 'left'
): string {
  const visLen = visibleLength(text);
  if (visLen >= width) {
    return text;
  }

  const padding = width - visLen;

  switch (align) {
    case 'center': {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
    case 'right':
      return ' '.repeat(padding) + text;
    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Wrap text to fit within a maximum width
 *
 * @param text - Text to wrap
 * @param maxWidth - Maximum width per line
 * @returns Array of wrapped lines
 */
export function wrapText(text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [text];

  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (!word) continue;

    const wordLen = visibleLength(word);
    const currentLen = visibleLength(currentLine);

    if (currentLen === 0) {
      // First word on line - always add it even if too long
      currentLine = word;
    } else if (currentLen + 1 + wordLen <= maxWidth) {
      // Word fits with space
      currentLine += ' ' + word;
    } else {
      // Word doesn't fit - start new line
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length > 0 ? lines : [''];
}

// =============================================================================
// Code Snippet Extraction
// =============================================================================

/**
 * Detect programming language from file extension
 *
 * @param filePath - File path
 * @returns Language identifier or undefined
 */
export function detectLanguage(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    java: 'java',
    kt: 'kotlin',
    swift: 'swift',
    c: 'c',
    cpp: 'cpp',
    cc: 'cpp',
    h: 'c',
    hpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    yaml: 'yaml',
    yml: 'yaml',
    json: 'json',
    md: 'markdown',
    sql: 'sql',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
  };
  return ext ? langMap[ext] : undefined;
}

/**
 * Extract code snippet from a diff patch for a specific line
 *
 * @param patch - Unified diff patch content
 * @param targetLine - The line number to highlight (1-indexed in new file)
 * @param contextLines - Number of context lines before/after
 * @param filePath - File path for language detection
 * @returns CodeSnippet or undefined if line not found
 */
export function extractCodeSnippet(
  patch: string | undefined,
  targetLine: number | undefined,
  contextLines: number = CONTEXT_LINES,
  filePath?: string
): CodeSnippet | undefined {
  if (!patch || !targetLine) {
    return undefined;
  }

  const lines = patch.split('\n');
  const snippetLines: SnippetLine[] = [];
  let currentNewLine = 0;
  let foundTarget = false;
  let highlightIndex = -1;

  // Build a map of new file lines from the patch
  const newFileContent: { lineNumber: number; content: string }[] = [];

  for (const line of lines) {
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@')) {
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        currentNewLine = parseInt(match[1] ?? '0', 10);
      }
      continue;
    }

    // Skip metadata lines
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    const prefix = line[0];

    if (prefix === '+') {
      // Added line - exists in new file
      newFileContent.push({
        lineNumber: currentNewLine,
        content: line.slice(1), // Remove prefix
      });
      currentNewLine++;
    } else if (prefix === '-') {
      // Deleted line - does NOT exist in new file
      // Don't increment currentNewLine
    } else if (prefix === ' ') {
      // Context line - exists in new file
      newFileContent.push({
        lineNumber: currentNewLine,
        content: line.slice(1), // Remove prefix
      });
      currentNewLine++;
    } else if (prefix === '\\') {
      // "\ No newline at end of file" marker - skip
    }
  }

  // Find the target line and extract context
  const targetIndex = newFileContent.findIndex((l) => l.lineNumber === targetLine);

  if (targetIndex === -1) {
    return undefined;
  }

  foundTarget = true;

  // Calculate range for context
  const startIdx = Math.max(0, targetIndex - contextLines);
  const endIdx = Math.min(newFileContent.length - 1, targetIndex + contextLines);

  for (let i = startIdx; i <= endIdx; i++) {
    const lineData = newFileContent[i];
    if (lineData) {
      const isHighlighted = lineData.lineNumber === targetLine;
      if (isHighlighted) {
        highlightIndex = snippetLines.length;
      }
      snippetLines.push({
        lineNumber: lineData.lineNumber,
        content: lineData.content,
        isHighlighted,
      });
    }
  }

  if (!foundTarget || snippetLines.length === 0) {
    return undefined;
  }

  return {
    lines: snippetLines,
    highlightLine: highlightIndex,
    language: filePath ? detectLanguage(filePath) : undefined,
  };
}

// =============================================================================
// Finding Box Formatting
// =============================================================================

/**
 * Format a code snippet for terminal display
 *
 * @param snippet - Code snippet to format
 * @param colored - Whether to use colors
 * @param boxWidth - Width of the containing box
 * @returns Formatted code snippet lines
 */
export function formatCodeSnippet(
  snippet: CodeSnippet,
  colored: boolean,
  boxWidth: number
): string[] {
  const result: string[] = [];
  const c = createColorizer(colored);

  // Calculate line number width
  const maxLineNum = Math.max(...snippet.lines.map((l) => l.lineNumber));
  const lineNumWidth = Math.max(String(maxLineNum).length, 3);

  // Content area width (inside box, accounting for padding and line numbers)
  const contentWidth = boxWidth - 4 - lineNumWidth - 3; // 4 for box, 3 for " | "

  for (const line of snippet.lines) {
    const lineNumStr = String(line.lineNumber).padStart(lineNumWidth, ' ');
    const prefix = line.isHighlighted ? '▸' : ' ';

    // Truncate long lines
    let content = line.content;
    if (content.length > contentWidth) {
      content = content.slice(0, contentWidth - 3) + '...';
    }

    if (line.isHighlighted) {
      // Highlight the target line
      const formattedLine = colored
        ? `${c.cyan(prefix)} ${c.gray(lineNumStr)} ${c.gray('│')} ${colorize(content, ANSI.inverse, colored)}`
        : `${prefix} ${lineNumStr} | ${content}`;
      result.push(formattedLine);
    } else {
      const formattedLine = colored
        ? `  ${c.gray(lineNumStr)} ${c.gray('│')} ${c.dim(content)}`
        : `  ${lineNumStr} | ${content}`;
      result.push(formattedLine);
    }
  }

  return result;
}

/**
 * Format a single finding as a box
 *
 * @param finding - Finding to format
 * @param context - Terminal context
 * @param diffFiles - Diff files for code snippet extraction
 * @param boxWidth - Width of the box
 * @returns Formatted finding box as string
 */
export function formatFindingBox(
  finding: Finding,
  context: TerminalContext,
  diffFiles?: CanonicalDiffFile[],
  boxWidth: number = DEFAULT_BOX_WIDTH
): string {
  const colored = context.colored;
  const useUnicode = context.useUnicode;
  const chars = getBoxChars(useUnicode);
  const c = createColorizer(colored);
  const lines: string[] = [];

  // Get severity color and indicator
  const severityIndicator = getSeverityIndicator(finding.severity, useUnicode);
  const severityLabel = finding.severity.toUpperCase();

  // Content width inside the box (accounting for borders and padding)
  const contentWidth = boxWidth - 4; // 2 for borders, 2 for padding

  // ─────────────── Header ───────────────
  // Format: ┌─ file.ts:42 ──────────────────────── ERROR ─┐
  const location = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  const locationFormatted = colored ? c.cyan(location) : location;
  const severityFormatted = colored
    ? colorize(
        ` ${severityIndicator} ${severityLabel} `,
        getSeverityColor(finding.severity),
        colored
      )
    : ` ${severityIndicator} ${severityLabel} `;

  // Calculate header spacing
  const headerTextLen = visibleLength(location) + visibleLength(severityFormatted) + 4; // 4 for " ─ " and " ─"
  const headerPadLen = Math.max(0, boxWidth - 2 - headerTextLen);

  const topLine = `${chars.topLeft}${chars.horizontal} ${locationFormatted} ${drawHorizontalLine(headerPadLen, chars.horizontal)}${severityFormatted}${chars.horizontal}${chars.topRight}`;
  lines.push(topLine);

  // ─────────────── Message ───────────────
  const messageLines = wrapText(finding.message, contentWidth);
  for (const msgLine of messageLines) {
    lines.push(`${chars.vertical} ${padToWidth(msgLine, contentWidth)} ${chars.vertical}`);
  }

  // Empty line after message
  lines.push(`${chars.vertical} ${' '.repeat(contentWidth)} ${chars.vertical}`);

  // ─────────────── Code Snippet ───────────────
  if (finding.line && diffFiles) {
    const file = diffFiles.find((f) => f.path === finding.file);
    if (file?.patch) {
      const snippet = extractCodeSnippet(file.patch, finding.line, CONTEXT_LINES, finding.file);
      if (snippet) {
        const snippetLines = formatCodeSnippet(snippet, colored, boxWidth);
        for (const snippetLine of snippetLines) {
          // Pad snippet lines to fit in box
          const padding = contentWidth - visibleLength(snippetLine);
          lines.push(
            `${chars.vertical} ${snippetLine}${' '.repeat(Math.max(0, padding))} ${chars.vertical}`
          );
        }
        // Empty line after code
        lines.push(`${chars.vertical} ${' '.repeat(contentWidth)} ${chars.vertical}`);
      }
    }
  }

  // ─────────────── Suggestion ───────────────
  if (finding.suggestion) {
    const suggestionPrefix = '💡 ';
    const suggestionContent = finding.suggestion;
    const suggestionLines = wrapText(suggestionContent, contentWidth - 3);

    for (let i = 0; i < suggestionLines.length; i++) {
      const prefix = i === 0 ? suggestionPrefix : '   ';
      const line = `${prefix}${suggestionLines[i] ?? ''}`;
      const formattedLine = colored ? c.green(line) : line;
      const padding = contentWidth - visibleLength(line);
      lines.push(
        `${chars.vertical} ${formattedLine}${' '.repeat(Math.max(0, padding))} ${chars.vertical}`
      );
    }
  }

  // ─────────────── Footer ───────────────
  // Show source agent and rule ID if available
  const footerParts: string[] = [];
  if (finding.sourceAgent) {
    footerParts.push(finding.sourceAgent);
  }
  if (finding.ruleId) {
    footerParts.push(`[${finding.ruleId}]`);
  }

  if (footerParts.length > 0) {
    const footerText = footerParts.join(' ');
    const footerFormatted = colored ? c.gray(footerText) : footerText;
    const footerLine = padToWidth(footerFormatted, contentWidth);
    lines.push(`${chars.vertical} ${footerLine} ${chars.vertical}`);
  }

  // Bottom border
  const bottomLine = `${chars.bottomLeft}${drawHorizontalLine(boxWidth - 2, chars.horizontal)}${chars.bottomRight}`;
  lines.push(bottomLine);

  return lines.join('\n');
}

/**
 * Get ANSI color code for severity
 */
function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case 'error':
      return ANSI.red;
    case 'warning':
      return ANSI.yellow;
    case 'info':
      return ANSI.blue;
    default:
      return '';
  }
}

/**
 * Format all findings as a list of boxes
 *
 * @param findings - Findings to format
 * @param context - Terminal context
 * @param diffFiles - Diff files for code snippet extraction
 * @returns Formatted findings list
 */
export function formatFindingsList(
  findings: Finding[],
  context: TerminalContext,
  diffFiles?: CanonicalDiffFile[]
): string {
  if (findings.length === 0) {
    return '';
  }

  const boxes = findings.map((finding) => formatFindingBox(finding, context, diffFiles));

  return boxes.join('\n\n');
}

// =============================================================================
// Summary Generation
// =============================================================================

/**
 * Generate summary section with counts
 *
 * @param findings - Complete findings
 * @param stats - Review statistics
 * @param context - Terminal context
 * @returns Formatted summary string
 */
export function generateSummary(
  findings: Finding[],
  stats: {
    filesAnalyzed: number;
    linesChanged: number;
    executionTimeMs: number;
    estimatedCostUsd: number;
  },
  context: TerminalContext
): string {
  const c = createColorizer(context.colored);
  const counts = countBySeverity(findings);
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(c.bold('📊 SUMMARY'));
  lines.push('');

  // Counts section
  const errorLabel =
    counts.error === 0
      ? c.green(`   Errors:      ${counts.error}`)
      : c.red(`   Errors:      ${counts.error}`);
  const warningLabel =
    counts.warning === 0
      ? c.green(`   Warnings:    ${counts.warning}`)
      : c.yellow(`   Warnings:    ${counts.warning}`);
  const infoLabel = `   Suggestions: ${counts.info}`;

  lines.push(errorLabel);
  lines.push(warningLabel);
  lines.push(context.colored ? c.blue(infoLabel) : infoLabel);
  lines.push('');

  // Stats section
  lines.push(`   Files:    ${stats.filesAnalyzed} analyzed`);

  if (context.showCost && stats.estimatedCostUsd > 0) {
    // Clamp cost to non-negative (FR-REL-002)
    const cost = Math.max(0, stats.estimatedCostUsd);
    lines.push(`   Cost:     $${cost.toFixed(4)} (estimated)`);
  }

  lines.push(`   Time:     ${formatDuration(stats.executionTimeMs)}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Generate terminal summary (legacy interface)
 */
export function generateTerminalSummary(
  findings: Finding[],
  partialFindings: Finding[],
  executionTimeMs: number,
  estimatedCostUsd: number
): string {
  // Create minimal context for summary generation
  const context: TerminalContext = {
    colored: true,
    useUnicode: supportsUnicode(),
    verbose: false,
    quiet: false,
    format: 'pretty',
    showProgress: true,
    showCost: true,
  };

  const allFindings = [...findings, ...partialFindings];

  return generateSummary(
    allFindings,
    {
      filesAnalyzed: 0,
      linesChanged: 0,
      executionTimeMs,
      estimatedCostUsd,
    },
    context
  );
}

// =============================================================================
// Header Generation
// =============================================================================

/**
 * Generate header section
 *
 * @param context - Terminal context
 * @param stats - Stats for header
 * @returns Formatted header string
 */
export function generateHeader(
  context: TerminalContext,
  stats: {
    fileCount: number;
    lineCount: number;
  }
): string {
  const c = createColorizer(context.colored);
  const lines: string[] = [];
  const version = context.version ?? 'unknown';

  lines.push('');
  lines.push(c.bold(`🔍 odd-ai-reviewers v${version}`));
  lines.push(`   Analyzing ${stats.fileCount} files (${stats.lineCount} lines changed)`);

  if (context.configSource) {
    const configDisplay =
      context.configSource.source === 'zero-config'
        ? '(zero-config defaults)'
        : (context.configSource.path ?? '.ai-review.yml');
    lines.push(`   Config: ${configDisplay} ✓`);
  }

  if (context.baseRef) {
    const baseSource = context.baseSource ?? 'auto-detected';
    lines.push(`   Base: ${context.baseRef} (${baseSource})`);
  }

  lines.push('');

  return lines.join('\n');
}

// =============================================================================
// Output Format Functions
// =============================================================================

/**
 * Generate JSON output
 *
 * @param findings - Complete findings
 * @param partialFindings - Partial findings from failed agents
 * @param context - Terminal context
 * @param diffFiles - Diff files for stats
 * @returns JSON string (not pretty-printed)
 */
export function generateJsonOutput(
  findings: Finding[],
  partialFindings: Finding[],
  context: TerminalContext,
  diffFiles: CanonicalDiffFile[]
): string {
  const counts = countBySeverity(findings);
  const totalLines = diffFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  const output: JsonOutput = {
    schema_version: JSON_SCHEMA_VERSION,
    version: context.version ?? '0.0.0',
    timestamp: new Date().toISOString(),
    summary: {
      errorCount: counts.error,
      warningCount: counts.warning,
      infoCount: counts.info,
      filesAnalyzed: diffFiles.length,
      linesChanged: totalLines,
      executionTimeMs: context.executionTimeMs ?? 0,
      // Clamp to non-negative (FR-REL-002)
      estimatedCostUsd: Math.max(0, context.estimatedCostUsd ?? 0),
    },
    findings,
    partialFindings,
    passes: [], // Would need pass information from execution context
    config: context.configSource ?? { source: 'file' },
  };

  // Single-line JSON output (no pretty-printing)
  return JSON.stringify(output);
}

/**
 * Map severity to SARIF level
 */
function mapSeverityToSarifLevel(severity: Severity): 'error' | 'warning' | 'note' {
  switch (severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warning';
    case 'info':
      return 'note';
    default:
      return 'note';
  }
}

/**
 * Generate SARIF 2.1.0 output
 *
 * @param findings - Complete findings
 * @param context - Terminal context
 * @returns SARIF JSON string
 */
export function generateSarifOutput(findings: Finding[], context: TerminalContext): string {
  const results: SarifResult[] = findings.map((finding) => {
    const result: SarifResult = {
      ruleId: finding.ruleId ?? finding.sourceAgent,
      level: mapSeverityToSarifLevel(finding.severity),
      message: { text: finding.message },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: finding.file },
            region: {
              startLine: finding.line ?? 1,
              ...(finding.endLine ? { endLine: finding.endLine } : {}),
            },
          },
        },
      ],
      properties: {
        sourceAgent: finding.sourceAgent,
      },
    };

    // Add fix if suggestion exists
    if (finding.suggestion) {
      result.fixes = [
        {
          description: { text: finding.suggestion },
        },
      ];
    }

    return result;
  });

  const output: SarifOutput = {
    $schema: SARIF_SCHEMA_URL,
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: TOOL_NAME,
            version: context.version ?? '0.0.0',
            informationUri: TOOL_INFO_URI,
            rules: [], // Intentionally empty - AI agents don't have static rule IDs
          },
        },
        results,
      },
    ],
  };

  return JSON.stringify(output);
}

/**
 * Generate quiet mode output (errors only)
 *
 * @param findings - All findings
 * @returns Minimal output string
 */
export function generateQuietOutput(findings: Finding[]): string {
  const errorCount = findings.filter((f) => f.severity === 'error').length;

  if (errorCount === 0) {
    return 'No errors found\n';
  }

  return `${errorCount} error${errorCount === 1 ? '' : 's'} found\n`;
}

/**
 * Generate verbose mode output additions
 *
 * @param context - Terminal context with verbose info
 * @param diffFiles - Diff files for details
 * @returns Verbose additions string
 */
export function generateVerboseOutput(
  context: TerminalContext,
  diffFiles: CanonicalDiffFile[]
): string {
  const c = createColorizer(context.colored);
  const lines: string[] = [];

  lines.push('');
  lines.push(c.gray('─── Verbose Details ───'));
  lines.push('');

  // Git context details
  if (context.baseRef) {
    lines.push(c.gray(`Git base: ${context.baseRef}`));
  }

  // Config details
  if (context.configSource) {
    lines.push(c.gray(`Config: ${JSON.stringify(context.configSource)}`));
  }

  // File breakdown
  lines.push(c.gray(''));
  lines.push(c.gray('Files analyzed:'));
  for (const file of diffFiles.slice(0, 10)) {
    // Limit to first 10
    lines.push(c.gray(`  ${file.path} (+${file.additions}/-${file.deletions})`));
  }
  if (diffFiles.length > 10) {
    lines.push(c.gray(`  ... and ${diffFiles.length - 10} more`));
  }

  // Timing breakdown
  if (context.executionTimeMs) {
    lines.push(c.gray(''));
    lines.push(c.gray(`Total execution time: ${formatDuration(context.executionTimeMs)}`));
  }

  lines.push('');

  return lines.join('\n');
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
    useUnicode: supportsUnicode(),
    verbose: false,
    quiet: false,
    format: 'pretty',
    showProgress: true,
    showCost: true,
  };
}

// =============================================================================
// Main Reporter Function
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
  findings: Finding[],
  partialFindings: Finding[],
  context: TerminalContext,
  config: Config,
  diffFiles: DiffFile[]
): Promise<TerminalReportResult> {
  try {
    // 1. Canonicalize diff files
    const canonicalFiles = canonicalizeDiffFiles(diffFiles);

    // 2. Build line resolver
    const resolver = buildLineResolver(canonicalFiles);

    // 3. Normalize findings
    const normalizedComplete = normalizeFindingsForDiff(findings, resolver);
    const normalizedPartial = normalizeFindingsForDiff(partialFindings, resolver);

    // 4. Deduplicate
    const dedupedComplete = deduplicateFindings(normalizedComplete.findings);
    const dedupedPartial = deduplicatePartialFindings(normalizedPartial.findings);

    // 5. Sort
    const sortedComplete = sortFindings(dedupedComplete);
    const sortedPartial = sortFindings(dedupedPartial);

    // For quiet mode, filter to errors only
    const findingsToShow = context.quiet
      ? sortedComplete.filter((f) => f.severity === 'error')
      : sortedComplete;

    // Calculate stats
    const totalLines = canonicalFiles.reduce((sum, f) => sum + f.additions + f.deletions, 0);
    const stats = {
      fileCount: canonicalFiles.length,
      lineCount: totalLines,
      filesAnalyzed: canonicalFiles.length,
      linesChanged: totalLines,
      executionTimeMs: context.executionTimeMs ?? 0,
      estimatedCostUsd: context.estimatedCostUsd ?? 0,
    };

    // 6. Format and output based on format type
    let output: string;

    switch (context.format) {
      case 'json':
        output = generateJsonOutput(sortedComplete, sortedPartial, context, canonicalFiles);
        break;

      case 'sarif':
        output = generateSarifOutput(sortedComplete, context);
        break;

      case 'pretty':
      default: {
        const parts: string[] = [];

        // Quiet mode: minimal output
        if (context.quiet) {
          output = generateQuietOutput(sortedComplete);
        } else {
          // Header
          parts.push(generateHeader(context, stats));

          // Verbose details (before findings)
          if (context.verbose) {
            parts.push(generateVerboseOutput(context, canonicalFiles));
          }

          // Findings
          if (findingsToShow.length > 0) {
            parts.push(formatFindingsList(findingsToShow, context, canonicalFiles));
          }

          // Partial findings section
          if (sortedPartial.length > 0 && !context.quiet) {
            parts.push('');
            parts.push(
              createColorizer(context.colored).yellow('⚠️  Partial Findings (from failed agents):')
            );
            parts.push('');
            parts.push(formatFindingsList(sortedPartial, context, canonicalFiles));
          }

          // Summary
          parts.push(generateSummary(sortedComplete, stats, context));

          output = parts.join('\n');
        }
        break;
      }
    }

    // Write to stdout
    process.stdout.write(output + '\n');

    return {
      success: true,
      findingsCount: sortedComplete.length,
      partialFindingsCount: sortedPartial.length,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      findingsCount: 0,
      partialFindingsCount: 0,
      error: errorMessage,
    };
  }
}

/**
 * Format a single finding for terminal display (legacy interface)
 */
export function formatFindingForTerminal(finding: Finding, context: TerminalContext): string {
  return formatFindingBox(finding, context);
}
