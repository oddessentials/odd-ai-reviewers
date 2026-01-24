/**
 * Diff Line Validator Module
 * Parses unified diffs to extract valid commentable line ranges
 *
 * This module solves the "wrong line" bug by:
 * 1. Parsing unified diff hunks to extract which lines are actually in the diff
 * 2. Providing validation to ensure findings only target commentable lines
 * 3. Offering nearest-line suggestions when a line is out of range
 *
 * GitHub and Azure DevOps APIs require inline comments to target lines
 * that are part of the diff context. Comments on other lines will either
 * fail silently or appear on unexpected lines.
 */

import type { DiffFile } from './diff.js';

/**
 * Represents a single hunk in a unified diff
 *
 * A hunk header looks like: @@ -10,5 +15,8 @@
 * - oldStart: 10 (line number in original file)
 * - oldCount: 5 (number of lines from original)
 * - newStart: 15 (line number in new file)
 * - newCount: 8 (number of lines in new file)
 */
export interface DiffHunk {
  /** Starting line number in the old (base) file */
  oldStart: number;
  /** Number of lines from the old file */
  oldCount: number;
  /** Starting line number in the new (head) file */
  newStart: number;
  /** Number of lines in the new file */
  newCount: number;
  /** Lines included in this hunk (context + additions) in the new file */
  newFileLines: number[];
  /** Lines that were added ('+' lines) - subset of newFileLines */
  addedLines: number[];
  /** Lines that are context (' ' lines) - subset of newFileLines */
  contextLines: number[];
}

/**
 * Map of file paths to their valid commentable lines
 */
export interface DiffLineMap {
  /** Map of file path -> array of valid line numbers in the new file */
  files: Map<string, DiffFileLines>;
}

/**
 * Valid lines for a single file
 */
export interface DiffFileLines {
  /** All lines that appear in the diff (context + additions) */
  allLines: Set<number>;
  /** Only lines that were added ('+' lines) */
  addedLines: Set<number>;
  /** Only context lines (' ' lines) */
  contextLines: Set<number>;
  /** Parsed hunks for detailed analysis */
  hunks: DiffHunk[];
}

/**
 * Result of line validation
 */
export interface LineValidationResult {
  /** Whether the line is valid for commenting */
  valid: boolean;
  /** The validated line number (same as input if valid) */
  line: number;
  /** If invalid, the nearest valid line (if any) */
  nearestValidLine?: number;
  /** Human-readable reason if invalid */
  reason?: string;
  /** Whether the line is an addition ('+') vs context */
  isAddition?: boolean;
}

/**
 * Regular expression to parse unified diff hunk headers
 * Matches: @@ -oldStart,oldCount +newStart,newCount @@
 * Also handles single-line hunks: @@ -10 +15 @@ (count defaults to 1)
 */
const HUNK_HEADER_REGEX = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

/**
 * Parse a unified diff patch to extract hunk information
 *
 * @param patch - The unified diff patch content
 * @returns Array of parsed hunks
 */
export function parseDiffHunks(patch: string): DiffHunk[] {
  if (!patch) return [];

  const lines = patch.split('\n');
  const hunks: DiffHunk[] = [];

  let currentHunk: DiffHunk | null = null;
  let currentNewLine = 0;

  for (const line of lines) {
    // Check for hunk header
    const headerMatch = line.match(HUNK_HEADER_REGEX);

    if (headerMatch) {
      // Save previous hunk if exists
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      // Parse hunk header
      const oldStart = parseInt(headerMatch[1] ?? '1', 10);
      const oldCount = parseInt(headerMatch[2] ?? '1', 10);
      const newStart = parseInt(headerMatch[3] ?? '1', 10);
      const newCount = parseInt(headerMatch[4] ?? '1', 10);

      currentHunk = {
        oldStart,
        oldCount,
        newStart,
        newCount,
        newFileLines: [],
        addedLines: [],
        contextLines: [],
      };

      currentNewLine = newStart;
      continue;
    }

    // Process diff lines within a hunk
    if (currentHunk && line.length > 0) {
      const prefix = line[0];

      if (prefix === '+') {
        // Added line - exists in new file
        currentHunk.newFileLines.push(currentNewLine);
        currentHunk.addedLines.push(currentNewLine);
        currentNewLine++;
      } else if (prefix === '-') {
        // Deleted line - does NOT exist in new file, don't increment
        // These lines are only in the old file
      } else if (prefix === ' ' || prefix === '\\') {
        // Context line or "\ No newline at end of file"
        if (prefix === ' ') {
          currentHunk.newFileLines.push(currentNewLine);
          currentHunk.contextLines.push(currentNewLine);
          currentNewLine++;
        }
        // '\\' is a git comment, doesn't count as a line
      }
      // Lines starting with 'diff', 'index', '---', '+++' are metadata, skip
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Build a DiffLineMap from an array of DiffFiles
 *
 * @param files - Array of DiffFile objects with patches
 * @returns DiffLineMap with valid lines for each file
 */
export function buildDiffLineMap(files: DiffFile[]): DiffLineMap {
  const map: DiffLineMap = {
    files: new Map(),
  };

  for (const file of files) {
    if (!file.patch || file.status === 'deleted') {
      // Deleted files have no lines to comment on in the new version
      continue;
    }

    const hunks = parseDiffHunks(file.patch);
    const allLines = new Set<number>();
    const addedLines = new Set<number>();
    const contextLines = new Set<number>();

    for (const hunk of hunks) {
      for (const line of hunk.newFileLines) {
        allLines.add(line);
      }
      for (const line of hunk.addedLines) {
        addedLines.add(line);
      }
      for (const line of hunk.contextLines) {
        contextLines.add(line);
      }
    }

    map.files.set(file.path, {
      allLines,
      addedLines,
      contextLines,
      hunks,
    });
  }

  return map;
}

/**
 * Find the nearest valid line to the target line
 *
 * @param targetLine - The target line number
 * @param validLines - Set of valid line numbers
 * @returns The nearest valid line, or undefined if no valid lines exist
 */
export function findNearestValidLine(
  targetLine: number,
  validLines: Set<number>
): number | undefined {
  if (validLines.size === 0) return undefined;
  if (validLines.has(targetLine)) return targetLine;

  const sortedLines = Array.from(validLines).sort((a, b) => a - b);

  let nearest: number | undefined;
  let minDistance = Infinity;

  for (const line of sortedLines) {
    const distance = Math.abs(line - targetLine);
    if (distance < minDistance) {
      minDistance = distance;
      nearest = line;
    }
    // Early exit if we've passed the target (lines are sorted)
    if (line > targetLine && distance > minDistance) {
      break;
    }
  }

  return nearest;
}

/**
 * Validate if a line number is valid for commenting on a specific file
 *
 * @param filePath - The file path to validate against
 * @param line - The line number to validate
 * @param diffLineMap - The DiffLineMap built from the PR diff
 * @param options - Validation options
 * @returns LineValidationResult with validity and suggestions
 */
export function validateFindingLine(
  filePath: string,
  line: number | undefined,
  diffLineMap: DiffLineMap,
  options: {
    /** If true, only allow additions ('+' lines), not context */
    additionsOnly?: boolean;
    /** If true, find and return nearest valid line when invalid */
    suggestNearest?: boolean;
  } = {}
): LineValidationResult {
  // Handle undefined line
  if (line === undefined) {
    return {
      valid: false,
      line: 0,
      reason: 'Line number is undefined',
    };
  }

  // Handle non-positive line numbers
  if (line <= 0) {
    return {
      valid: false,
      line,
      reason: `Invalid line number: ${line} (must be positive)`,
    };
  }

  // Get file lines from map
  const fileLines = diffLineMap.files.get(filePath);

  if (!fileLines) {
    return {
      valid: false,
      line,
      reason: `File "${filePath}" not found in diff or has no commentable lines`,
    };
  }

  // Determine which line set to check
  const validLines = options.additionsOnly ? fileLines.addedLines : fileLines.allLines;

  if (validLines.has(line)) {
    return {
      valid: true,
      line,
      isAddition: fileLines.addedLines.has(line),
    };
  }

  // Line is not valid
  const result: LineValidationResult = {
    valid: false,
    line,
    reason: options.additionsOnly
      ? `Line ${line} is not an added line in the diff`
      : `Line ${line} is not in the diff context for file "${filePath}"`,
  };

  // Find nearest valid line if requested
  if (options.suggestNearest) {
    const nearest = findNearestValidLine(line, validLines);
    if (nearest !== undefined) {
      result.nearestValidLine = nearest;
    }
  }

  return result;
}

/**
 * Filter findings to only those with valid line numbers
 *
 * @param findings - Array of findings to filter
 * @param diffLineMap - The DiffLineMap built from the PR diff
 * @param options - Filtering options
 * @returns Object with valid findings, invalid findings, and validation details
 */
export function filterValidFindings<T extends { file: string; line?: number }>(
  findings: T[],
  diffLineMap: DiffLineMap,
  options: {
    /** If true, only allow additions ('+' lines), not context */
    additionsOnly?: boolean;
    /** If true, attempt to fix invalid lines by using nearest valid line */
    autoFixLines?: boolean;
  } = {}
): {
  valid: T[];
  invalid: { finding: T; reason: string; nearestValidLine?: number }[];
  stats: {
    total: number;
    valid: number;
    invalid: number;
    autoFixed: number;
  };
} {
  const valid: T[] = [];
  const invalid: { finding: T; reason: string; nearestValidLine?: number }[] = [];
  let autoFixed = 0;

  for (const finding of findings) {
    const validation = validateFindingLine(finding.file, finding.line, diffLineMap, {
      additionsOnly: options.additionsOnly,
      suggestNearest: options.autoFixLines,
    });

    if (validation.valid) {
      valid.push(finding);
    } else if (options.autoFixLines && validation.nearestValidLine !== undefined) {
      // Auto-fix by using nearest valid line
      const fixed = { ...finding, line: validation.nearestValidLine };
      valid.push(fixed);
      autoFixed++;
    } else {
      invalid.push({
        finding,
        reason: validation.reason ?? 'Unknown validation error',
        nearestValidLine: validation.nearestValidLine,
      });
    }
  }

  return {
    valid,
    invalid,
    stats: {
      total: findings.length,
      valid: valid.length - autoFixed,
      invalid: invalid.length,
      autoFixed,
    },
  };
}

/**
 * Get a summary of valid lines for a file (useful for debugging)
 */
export function getFileDiffSummary(filePath: string, diffLineMap: DiffLineMap): string {
  const fileLines = diffLineMap.files.get(filePath);

  if (!fileLines) {
    return `File "${filePath}" not in diff`;
  }

  const allLinesSorted = Array.from(fileLines.allLines).sort((a, b) => a - b);
  const addedLinesSorted = Array.from(fileLines.addedLines).sort((a, b) => a - b);

  // Compress ranges for display (e.g., [1,2,3,5,6,7] -> "1-3, 5-7")
  const compressRanges = (lines: number[]): string => {
    if (lines.length === 0) return 'none';

    const ranges: string[] = [];
    const firstLine = lines[0];
    if (firstLine === undefined) return 'none';
    let start = firstLine;
    let end = start;

    for (let i = 1; i <= lines.length; i++) {
      const current = lines[i];
      if (current === end + 1) {
        end = current;
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        if (current !== undefined) {
          start = current;
          end = current;
        }
      }
    }

    return ranges.join(', ');
  };

  return [
    `File: ${filePath}`,
    `  All valid lines: ${compressRanges(allLinesSorted)}`,
    `  Added lines: ${compressRanges(addedLinesSorted)}`,
    `  Hunks: ${fileLines.hunks.length}`,
  ].join('\n');
}
