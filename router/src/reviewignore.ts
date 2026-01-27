/**
 * Reviewignore Module
 *
 * Parses and applies .reviewignore files using .gitignore-compatible syntax.
 * Patterns in .reviewignore exclude files from code review.
 *
 * Syntax:
 * - Lines starting with # are comments
 * - Empty lines are ignored
 * - Patterns starting with ! negate (re-include) a previously excluded file
 * - ** matches any number of directories
 * - * matches anything except /
 * - ? matches any single character except /
 * - [abc] matches any character in brackets
 * - Trailing / matches directories only (treated as prefix match)
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { minimatch } from 'minimatch';

const REVIEWIGNORE_FILENAME = '.reviewignore';

/**
 * Parsed pattern with metadata for application order and negation
 */
export interface ReviewIgnorePattern {
  /** Original pattern string (without leading !) */
  pattern: string;
  /** Whether this is a negation pattern (re-include) */
  negated: boolean;
  /** Original line number for debugging */
  lineNumber: number;
}

/**
 * Result of loading a .reviewignore file
 */
export interface ReviewIgnoreResult {
  /** Parsed patterns in order of appearance */
  patterns: ReviewIgnorePattern[];
  /** Path to the loaded file (undefined if not found) */
  filePath?: string;
  /** Whether the file was found and loaded */
  found: boolean;
}

/**
 * Parse a single line from a .reviewignore file
 *
 * @param line - Raw line from the file
 * @param lineNumber - Line number (1-indexed) for debugging
 * @returns Parsed pattern or null if line should be skipped
 */
export function parseReviewIgnoreLine(
  line: string,
  lineNumber: number
): ReviewIgnorePattern | null {
  // Trim whitespace
  const trimmed = line.trim();

  // Skip empty lines
  if (trimmed.length === 0) {
    return null;
  }

  // Skip comments
  if (trimmed.startsWith('#')) {
    return null;
  }

  // Handle negation patterns
  if (trimmed.startsWith('!')) {
    const pattern = trimmed.slice(1).trim();
    // Skip if negation results in empty pattern
    if (pattern.length === 0) {
      return null;
    }
    return {
      pattern: normalizePattern(pattern),
      negated: true,
      lineNumber,
    };
  }

  return {
    pattern: normalizePattern(trimmed),
    negated: false,
    lineNumber,
  };
}

/**
 * Normalize a pattern for consistent matching
 *
 * Follows .gitignore semantics:
 * - Patterns without path separator match anywhere (add double-star prefix)
 * - Patterns with path separator are path-relative (no prefix added)
 * - Leading slash means root-relative (stripped, no prefix added)
 * - Trailing slash indicates directory (converted to recursive match)
 * - Patterns starting with double-star are already recursive
 */
export function normalizePattern(pattern: string): string {
  let normalized = pattern;

  // Remove leading ./ if present
  if (normalized.startsWith('./')) {
    normalized = normalized.slice(2);
  }

  // Check for leading slash BEFORE we process it
  // Leading slash means "root-relative" - don't add **/ prefix
  const wasRootRelative = normalized.startsWith('/');

  // Handle leading slash (root-relative)
  // Remove it since we match relative to repo root
  if (wasRootRelative) {
    normalized = normalized.slice(1);
  }

  // Check for path separator BEFORE converting trailing slash
  // This determines if pattern should match anywhere or from a specific location
  // A trailing slash (like "dir/") is not a "real" path separator for this purpose
  const hasRealPathSep = normalized.replace(/\/$/, '').includes('/');

  // Check if pattern already starts with ** (already recursive)
  const startsWithDoubleStar = normalized.startsWith('**');

  // Handle trailing slash (directory indicator)
  // Convert "dir/" to "dir/**" for recursive matching
  if (normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1) + '/**';
  }

  // Add **/ prefix if:
  // - Pattern has no real path separator (like "foo", "*.log", "[Bb]uild", "build/")
  // - Pattern wasn't originally root-relative (didn't start with /)
  // - Pattern doesn't already start with **
  if (!hasRealPathSep && !wasRootRelative && !startsWithDoubleStar) {
    normalized = `**/${normalized}`;
  }

  return normalized;
}

/**
 * Parse the contents of a .reviewignore file
 *
 * @param content - Raw file content
 * @returns Array of parsed patterns
 */
export function parseReviewIgnoreContent(content: string): ReviewIgnorePattern[] {
  const lines = content.split('\n');
  const patterns: ReviewIgnorePattern[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;

    const parsed = parseReviewIgnoreLine(line, i + 1);
    if (parsed) {
      patterns.push(parsed);
    }
  }

  return patterns;
}

/**
 * Load and parse a .reviewignore file from the repository
 *
 * @param repoPath - Path to the repository root
 * @returns Parsed patterns and metadata
 */
export async function loadReviewIgnore(repoPath: string): Promise<ReviewIgnoreResult> {
  const filePath = join(repoPath, REVIEWIGNORE_FILENAME);

  if (!existsSync(filePath)) {
    return {
      patterns: [],
      found: false,
    };
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const patterns = parseReviewIgnoreContent(content);

    if (patterns.length > 0) {
      console.log(
        `[reviewignore] Loaded ${patterns.length} patterns from ${REVIEWIGNORE_FILENAME}`
      );
    }

    return {
      patterns,
      filePath,
      found: true,
    };
  } catch (error) {
    console.warn(
      `[reviewignore] Failed to read ${REVIEWIGNORE_FILENAME}: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      patterns: [],
      found: false,
    };
  }
}

/**
 * Check if a file path matches any of the reviewignore patterns
 *
 * Patterns are applied in order, with later patterns overriding earlier ones.
 * Negation patterns (!) can re-include files that were previously excluded.
 *
 * @param filePath - Normalized file path (relative to repo root)
 * @param patterns - Parsed reviewignore patterns
 * @returns true if the file should be ignored (excluded from review)
 */
export function shouldIgnoreFile(filePath: string, patterns: ReviewIgnorePattern[]): boolean {
  if (patterns.length === 0) {
    return false;
  }

  // Apply patterns in order - later patterns override earlier ones
  let ignored = false;

  for (const { pattern, negated } of patterns) {
    const matches = minimatch(filePath, pattern, {
      dot: true, // Match dotfiles
      matchBase: false, // We handle this in normalizePattern
      nocase: false, // Case-sensitive matching (Unix-style)
    });

    if (matches) {
      // Negated patterns un-ignore, regular patterns ignore
      ignored = !negated;
    }
  }

  return ignored;
}

/**
 * Filter an array of file paths using reviewignore patterns
 *
 * @param filePaths - Array of file paths to filter
 * @param patterns - Parsed reviewignore patterns
 * @returns Object with included paths and count of ignored files
 */
export function filterPathsByReviewIgnore(
  filePaths: string[],
  patterns: ReviewIgnorePattern[]
): { included: string[]; ignoredCount: number } {
  if (patterns.length === 0) {
    return { included: filePaths, ignoredCount: 0 };
  }

  const included: string[] = [];
  let ignoredCount = 0;

  for (const path of filePaths) {
    if (shouldIgnoreFile(path, patterns)) {
      ignoredCount++;
    } else {
      included.push(path);
    }
  }

  return { included, ignoredCount };
}
