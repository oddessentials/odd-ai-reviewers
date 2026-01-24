/**
 * Line Resolver Module
 *
 * Resolves and validates finding line numbers against unified diffs to prevent
 * misaligned inline comments on GitHub and Azure DevOps.
 *
 * Design Philosophy:
 * - Early normalization before deduplication (INVARIANTS #22)
 * - Comprehensive validation with detailed reporting
 * - Agent-aware resolution (LLMs may emit diff lines, static tools emit file lines)
 * - Graceful degradation (drop unresolvable lines to file-level comments)
 */

import type { DiffFile } from '../diff.js';
import { normalizePath } from '../diff.js';
import type { Finding } from '../agents/index.js';

/**
 * Represents a single diff hunk with line tracking
 */
export interface DiffHunk {
  /** Starting line number in the new file (from @@ header) */
  newFileStart: number;
  /** All valid line numbers in new file (added + context) */
  newFileLines: number[];
  /** Line numbers for added lines only ('+' prefix) */
  addedLines: number[];
  /** Line numbers for context lines only (' ' prefix) */
  contextLines: number[];
}

/**
 * Per-file mapping of valid lines from diff
 */
export interface FileLineMapping {
  /** All valid commentable lines (added + context) */
  allLines: Set<number>;
  /** Only added lines ('+' prefix in diff) */
  addedLines: Set<number>;
  /** Only context lines (' ' prefix in diff) */
  contextLines: Set<number>;
  /** Hunk metadata for debugging and summaries */
  hunks: DiffHunk[];
}

/**
 * Result of validating a single line number
 */
export interface LineValidationResult {
  /** Whether the line is valid for commenting */
  valid: boolean;
  /** The line number being validated */
  line: number;
  /** Whether this is an added line (vs context line) */
  isAddition?: boolean;
  /** Reason for invalid line (if applicable) */
  reason?: string;
  /** Suggested nearest valid line (if requested and available) */
  nearestValidLine?: number;
}

/**
 * Statistics from finding normalization (fine-grained accounting)
 */
export interface ValidationStats {
  /** Total findings processed */
  total: number;
  /** Findings with valid lines (no changes needed) */
  valid: number;
  /** Findings auto-fixed to nearest valid line */
  normalized: number;
  /** Findings downgraded to file-level (invalid line or deleted file) */
  downgraded: number;
  /** Findings dropped entirely (removed) */
  dropped: number;
  /** Subset of downgraded: findings on deleted files */
  deletedFiles: number;
  /** Subset of downgraded: findings on ambiguous rename paths */
  ambiguousRenames: number;
  /** Findings remapped from old path to new path (successful rename handling) */
  remappedPaths: number;
}

/**
 * Details about an invalid line finding
 */
export interface InvalidLineDetail {
  file: string;
  line?: number;
  reason: string;
  nearestValidLine?: number;
  sourceAgent?: string;
}

/**
 * Line resolver interface for validating and normalizing line numbers
 */
export interface LineResolver {
  /** Validate a line number for a file */
  validateLine(
    filePath: string,
    line: number | undefined,
    options?: LineValidationOptions
  ): LineValidationResult;

  /** Get debug summary for a file */
  getFileSummary(filePath: string): string;

  /** Check if a file exists in the diff */
  hasFile(filePath: string): boolean;

  /** Check if a file is deleted (no inline comments allowed) */
  isDeleted(filePath: string): boolean;

  /**
   * Remap an old path to its new canonical path (for renames)
   * Returns the new path if rename mapping exists, otherwise returns original path
   */
  remapPath(filePath: string): string;

  /**
   * Check if a path mapping is ambiguous (multiple old paths map to same new path)
   * Ambiguous renames should be downgraded to file-level comments
   */
  isAmbiguousRename(filePath: string): boolean;
}

export interface LineValidationOptions {
  /** Only accept added lines ('+'), not context lines */
  additionsOnly?: boolean;
  /** Find and suggest nearest valid line when invalid */
  suggestNearest?: boolean;
  /** Agent source for resolution strategy */
  sourceAgent?: string;
}

/**
 * Parse unified diff hunks from a patch string
 *
 * Extracts line number information from diff hunks, distinguishing:
 * - Added lines ('+' prefix) - exist in new file
 * - Deleted lines ('-' prefix) - do NOT exist in new file
 * - Context lines (' ' prefix) - exist in new file
 *
 * @param patch - Unified diff patch content
 * @returns Array of parsed hunks with line tracking
 */
export function parseDiffHunks(patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = patch.split('\n');

  let currentHunk: DiffHunk | null = null;
  let currentNewLine = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -oldStart,oldCount +newStart,newCount @@
    if (line.startsWith('@@')) {
      // Save previous hunk
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        const newStart = parseInt(match[1] ?? '0', 10);
        currentNewLine = newStart;
        currentHunk = {
          newFileStart: newStart,
          newFileLines: [],
          addedLines: [],
          contextLines: [],
        };
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

    // Process diff content lines
    if (currentHunk) {
      const prefix = line[0];

      if (prefix === '+') {
        // Added line - exists in new file
        currentHunk.newFileLines.push(currentNewLine);
        currentHunk.addedLines.push(currentNewLine);
        currentNewLine++;
      } else if (prefix === '-') {
        // Deleted line - does NOT exist in new file, don't increment
      } else if (prefix === ' ') {
        // Context line - exists in new file
        currentHunk.newFileLines.push(currentNewLine);
        currentHunk.contextLines.push(currentNewLine);
        currentNewLine++;
      } else if (prefix === '\\') {
        // "\ No newline at end of file" marker - skip
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return hunks;
}

/**
 * Build a line resolver from diff files
 *
 * @param files - Array of DiffFile objects with patches
 * @returns LineResolver instance for validation and normalization
 */
export function buildLineResolver(files: DiffFile[]): LineResolver {
  const mappings = new Map<string, FileLineMapping>();
  const deletedFiles = new Set<string>();

  // Build rename maps: oldToNew for remapping, detect ambiguity
  // Ambiguous = multiple old paths mapping to the same new path
  const oldToNew = new Map<string, string>();
  const newPathCounts = new Map<string, number>();
  const ambiguousPaths = new Set<string>();

  for (const file of files) {
    if (file.oldPath && file.status === 'renamed') {
      const normalizedOld = normalizePath(file.oldPath);
      const normalizedNew = normalizePath(file.path);
      oldToNew.set(normalizedOld, normalizedNew);

      // Track how many old paths map to each new path
      const currentCount = newPathCounts.get(normalizedNew) || 0;
      newPathCounts.set(normalizedNew, currentCount + 1);
    }
  }

  // Mark paths as ambiguous if multiple old paths map to same new path
  for (const [newPath, count] of newPathCounts.entries()) {
    if (count > 1) {
      ambiguousPaths.add(newPath);
      // Also mark all old paths that map to this new path as ambiguous
      for (const [oldPath, targetNewPath] of oldToNew.entries()) {
        if (targetNewPath === newPath) {
          ambiguousPaths.add(oldPath);
        }
      }
    }
  }

  // Build mapping for each file
  for (const file of files) {
    // Normalize path (remove leading slash if present)
    const normalizedPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;

    if (file.status === 'deleted') {
      // Track deleted files - they should not have inline comments
      deletedFiles.add(normalizedPath);
      continue;
    }

    if (!file.patch) {
      // No patch available (binary files, etc.)
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

    // Normalize path (remove leading slash if present)
    // const normalizedPath already declared above

    mappings.set(normalizedPath, {
      allLines,
      addedLines,
      contextLines,
      hunks,
    });
  }

  return {
    validateLine(filePath: string, line: number | undefined, options = {}): LineValidationResult {
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

      // Normalize file path
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const fileMapping = mappings.get(normalizedPath);

      if (!fileMapping) {
        return {
          valid: false,
          line,
          reason: `File "${filePath}" not found in diff or has no commentable lines`,
        };
      }

      // Determine which line set to check
      const validLines = options.additionsOnly ? fileMapping.addedLines : fileMapping.allLines;

      if (validLines.has(line)) {
        return {
          valid: true,
          line,
          isAddition: fileMapping.addedLines.has(line),
        };
      }

      // Line is not valid - create error result
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
    },

    getFileSummary(filePath: string): string {
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      const fileMapping = mappings.get(normalizedPath);

      if (!fileMapping) {
        return `File "${filePath}" not in diff`;
      }

      const allLinesSorted = Array.from(fileMapping.allLines).sort((a, b) => a - b);
      const addedLinesSorted = Array.from(fileMapping.addedLines).sort((a, b) => a - b);

      return [
        `File: ${filePath}`,
        `  All valid lines: ${compressRanges(allLinesSorted)}`,
        `  Added lines: ${compressRanges(addedLinesSorted)}`,
        `  Hunks: ${fileMapping.hunks.length}`,
      ].join('\n');
    },

    hasFile(filePath: string): boolean {
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      return mappings.has(normalizedPath);
    },

    isDeleted(filePath: string): boolean {
      const normalizedPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
      return deletedFiles.has(normalizedPath);
    },

    remapPath(filePath: string): string {
      const normalizedPath = normalizePath(filePath);
      // If this is an old path that maps to a new path, return the new path
      const remapped = oldToNew.get(normalizedPath);
      if (remapped) {
        return remapped;
      }
      // Otherwise return the original path (normalized)
      return normalizedPath;
    },

    isAmbiguousRename(filePath: string): boolean {
      const normalizedPath = normalizePath(filePath);
      return ambiguousPaths.has(normalizedPath);
    },
  };
}

/**
 * Find the nearest valid line to a target line
 *
 * @param targetLine - The target line number
 * @param validLines - Set of valid line numbers
 * @returns The nearest valid line, or undefined if no valid lines exist
 */
function findNearestValidLine(targetLine: number, validLines: Set<number>): number | undefined {
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
 * Compress an array of line numbers into range notation
 * Example: [1,2,3,5,6,7] -> "1-3, 5-7"
 */
function compressRanges(lines: number[]): string {
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
}

/**
 * Normalize findings against diff, validating and adjusting line numbers
 *
 * Strategy:
 * - Valid lines pass through unchanged
 * - Invalid lines are dropped (line set to undefined) for file-level comment
 * - Stats and invalid details are collected for reporting
 *
 * @param findings - Array of findings to normalize
 * @param resolver - Line resolver built from diff
 * @param options - Normalization options
 * @returns Normalized findings with statistics
 */
export function normalizeFindingsForDiff(
  findings: Finding[],
  resolver: LineResolver,
  options: { additionsOnly?: boolean; autoFix?: boolean } = {}
): {
  findings: Finding[];
  stats: ValidationStats;
  invalidDetails: InvalidLineDetail[];
} {
  const normalized: Finding[] = [];
  const invalidDetails: InvalidLineDetail[] = [];

  let validCount = 0;
  let normalizedCount = 0;
  let downgradedCount = 0;
  const droppedCount = 0; // Currently unused, reserved for future use
  let deletedFilesCount = 0;
  let ambiguousRenamesCount = 0;
  let remappedPathsCount = 0;

  for (const finding of findings) {
    // Normalize finding file path at normalization boundary
    let normalizedFilePath = normalizePath(finding.file);

    // ===== RENAME HANDLING =====
    // Check if this is an old path that needs remapping to new path
    const remappedPath = resolver.remapPath(normalizedFilePath);
    const wasRemapped = remappedPath !== normalizedFilePath;
    if (wasRemapped) {
      // Check for ambiguous renames before remapping
      if (resolver.isAmbiguousRename(normalizedFilePath)) {
        // Ambiguous rename: downgrade to file-level comment
        normalized.push({
          ...finding,
          file: remappedPath,
          line: undefined,
          endLine: undefined,
        });
        downgradedCount++;
        ambiguousRenamesCount++;

        invalidDetails.push({
          file: normalizedFilePath,
          line: finding.line,
          reason: 'ambiguous-rename',
          sourceAgent: finding.sourceAgent,
        });
        continue;
      }

      // Non-ambiguous rename: remap to new path
      normalizedFilePath = remappedPath;
      remappedPathsCount++;
    }

    // Check if file is deleted first - enforce file-level only
    if (resolver.isDeleted(normalizedFilePath)) {
      normalized.push({
        ...finding,
        file: normalizedFilePath,
        line: undefined,
        endLine: undefined,
      });
      downgradedCount++;
      deletedFilesCount++;

      invalidDetails.push({
        file: normalizedFilePath,
        line: finding.line,
        reason: 'deleted-file',
        sourceAgent: finding.sourceAgent,
      });
      continue;
    }

    if (!finding.line) {
      // File-level finding, pass through with normalized path
      normalized.push({
        ...finding,
        file: normalizedFilePath,
      });
      validCount++;
      continue;
    }

    const validation = resolver.validateLine(normalizedFilePath, finding.line, {
      additionsOnly: options.additionsOnly,
      suggestNearest: options.autoFix,
      sourceAgent: finding.sourceAgent,
    });

    if (validation.valid) {
      // Valid line, pass through with normalized path
      normalized.push({
        ...finding,
        file: normalizedFilePath,
      });
      validCount++;
    } else if (options.autoFix && validation.nearestValidLine !== undefined) {
      // Auto-fix: use nearest valid line
      normalized.push({
        ...finding,
        file: normalizedFilePath,
        line: validation.nearestValidLine,
        endLine: finding.endLine ? validation.nearestValidLine : undefined,
      });
      normalizedCount++;

      invalidDetails.push({
        file: normalizedFilePath,
        line: finding.line,
        reason: `Auto-fixed to nearest line ${validation.nearestValidLine}`,
        nearestValidLine: validation.nearestValidLine,
        sourceAgent: finding.sourceAgent,
      });
    } else {
      // Downgrade to file-level comment (invalid line)
      normalized.push({
        ...finding,
        file: normalizedFilePath,
        line: undefined,
        endLine: undefined,
      });
      downgradedCount++;

      invalidDetails.push({
        file: normalizedFilePath,
        line: finding.line,
        reason: validation.reason ?? 'Line not in diff',
        nearestValidLine: validation.nearestValidLine,
        sourceAgent: finding.sourceAgent,
      });
    }
  }

  return {
    findings: normalized,
    stats: {
      total: findings.length,
      valid: validCount,
      normalized: normalizedCount,
      downgraded: downgradedCount,
      dropped: droppedCount,
      deletedFiles: deletedFilesCount,
      ambiguousRenames: ambiguousRenamesCount,
      remappedPaths: remappedPathsCount,
    },
    invalidDetails,
  };
}

/**
 * Drift signal result - indicates overall health of line validation
 */
export interface DriftSignal {
  /** Signal level: ok (< warn threshold), warn (< fail threshold), fail (>= fail threshold) */
  level: 'ok' | 'warn' | 'fail';
  /** Degradation percentage (dropped + downgraded) / total */
  degradationPercent: number;
  /** Auto-fix percentage (normalized) / total */
  autoFixPercent: number;
  /** Human-readable message explaining the signal */
  message: string;
  /** Top invalid samples for debugging (up to maxSamples) */
  samples: InvalidLineDetail[];
}

/**
 * Configuration for drift signal thresholds
 */
export interface DriftConfig {
  /** Warn threshold for degradation percentage (default: 20) */
  warnThresholdPercent: number;
  /** Fail threshold for degradation percentage (default: 50) */
  failThresholdPercent: number;
  /** Maximum samples to include in signal (default: 5) */
  maxSamples: number;
}

/** Default drift configuration */
export const DEFAULT_DRIFT_CONFIG: DriftConfig = {
  warnThresholdPercent: 20,
  failThresholdPercent: 50,
  maxSamples: 5,
};

/**
 * Compute drift signal from validation stats and invalid details
 *
 * This provides an enterprise-grade health check for line validation:
 * - ok: Everything is fine, degradation is within acceptable limits
 * - warn: Degradation is concerning, should investigate
 * - fail: Degradation is too high, likely indicates a systemic issue
 *
 * @param stats - Validation statistics from normalizeFindingsForDiff
 * @param invalidDetails - Details about invalid lines
 * @param config - Optional configuration for thresholds
 * @returns DriftSignal indicating health and samples for debugging
 */
export function computeDriftSignal(
  stats: ValidationStats,
  invalidDetails: InvalidLineDetail[],
  config: Partial<DriftConfig> = {}
): DriftSignal {
  const mergedConfig = { ...DEFAULT_DRIFT_CONFIG, ...config };

  // Avoid divide-by-zero
  if (stats.total === 0) {
    return {
      level: 'ok',
      degradationPercent: 0,
      autoFixPercent: 0,
      message: 'No findings to validate',
      samples: [],
    };
  }

  // Calculate percentages
  const degraded = stats.dropped + stats.downgraded;
  const degradationPercent = (degraded / stats.total) * 100;
  const autoFixPercent = (stats.normalized / stats.total) * 100;

  // Determine level
  let level: 'ok' | 'warn' | 'fail' = 'ok';
  if (degradationPercent >= mergedConfig.failThresholdPercent) {
    level = 'fail';
  } else if (degradationPercent >= mergedConfig.warnThresholdPercent) {
    level = 'warn';
  }

  // Build message
  let message: string;
  if (level === 'ok') {
    message =
      degradationPercent > 0
        ? `Line validation healthy: ${degradationPercent.toFixed(1)}% degraded (${degraded}/${stats.total})`
        : `Line validation perfect: all ${stats.total} findings valid`;
  } else if (level === 'warn') {
    message =
      `⚠️ Line validation warning: ${degradationPercent.toFixed(1)}% degraded ` +
      `(${degraded}/${stats.total} findings) - exceeds ${mergedConfig.warnThresholdPercent}% threshold`;
  } else {
    message =
      `❌ Line validation failed: ${degradationPercent.toFixed(1)}% degraded ` +
      `(${degraded}/${stats.total} findings) - exceeds ${mergedConfig.failThresholdPercent}% threshold`;
  }

  // Collect top samples (prioritize by reason diversity)
  const samples = invalidDetails.slice(0, mergedConfig.maxSamples);

  return {
    level,
    degradationPercent: Math.round(degradationPercent * 10) / 10, // 1 decimal place
    autoFixPercent: Math.round(autoFixPercent * 10) / 10,
    message,
    samples,
  };
}
