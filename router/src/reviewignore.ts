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
 * - Bare names (no path separators) match anywhere and include contents
 *
 * Example .reviewignore file:
 * ```
 * # Dependencies - ignore all contents
 * node_modules
 * vendor/
 *
 * # Build outputs
 * dist/
 * *.min.js
 *
 * # Generated files
 * src/generated/
 *
 * # But keep important config
 * !webpack.config.js
 *
 * # Root-relative pattern (only matches at repo root)
 * /config.local.js
 * ```
 */

import { lstat, readFile, realpath } from 'fs/promises';
import { existsSync } from 'fs';
import { isAbsolute, join, relative } from 'path';
import { Minimatch } from 'minimatch';
import { assertSafeRepoPath } from './git-validators.js';

const REVIEWIGNORE_FILENAME = '.reviewignore';
const MAX_REVIEWIGNORE_BYTES = 1024 * 1024; // 1MB

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  if (rel === '') return true;
  if (isAbsolute(rel)) return false;
  return !rel.startsWith('..');
}

/** Minimatch options used for all pattern matching */
const MINIMATCH_OPTIONS = {
  dot: true, // Match dotfiles
  matchBase: false, // We handle this in normalizePattern
  nocase: false, // Case-sensitive matching (Unix-style)
};

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
  /** Pre-compiled matcher for performance (populated during parsing) */
  _matcher?: Minimatch;
  /** Pre-compiled contents matcher for bare segments (populated during parsing) */
  _contentsMatcher?: Minimatch;
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

  // Handle escaped leading comment/negation markers
  let effective = trimmed;
  const hasEscapedLeading = trimmed.startsWith('\\#') || trimmed.startsWith('\\!');
  if (hasEscapedLeading) {
    effective = trimmed.slice(1);
  }

  // Skip comments
  if (!hasEscapedLeading && effective.startsWith('#')) {
    return null;
  }

  // Handle negation patterns
  if (!hasEscapedLeading && effective.startsWith('!')) {
    const pattern = effective.slice(1).trim();
    // Skip if negation results in empty pattern
    if (pattern.length === 0) {
      return null;
    }
    const normalized = normalizePattern(pattern);
    return compilePattern(normalized, true, lineNumber);
  }

  const normalized = normalizePattern(effective);
  return compilePattern(normalized, false, lineNumber);
}

/**
 * Compile a normalized pattern into a ReviewIgnorePattern with pre-compiled matchers
 */
function compilePattern(
  pattern: string,
  negated: boolean,
  lineNumber: number
): ReviewIgnorePattern {
  const result: ReviewIgnorePattern = {
    pattern,
    negated,
    lineNumber,
    _matcher: new Minimatch(pattern, MINIMATCH_OPTIONS),
  };

  // For bare segment patterns, also compile the contents matcher
  if (isBareSegmentPattern(pattern)) {
    result._contentsMatcher = new Minimatch(pattern + '/**', MINIMATCH_OPTIONS);
  }

  return result;
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
    normalized = '**/' + normalized;
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
  assertSafeRepoPath(repoPath);
  const filePath = join(repoPath, REVIEWIGNORE_FILENAME);

  if (!existsSync(filePath)) {
    return {
      patterns: [],
      found: false,
    };
  }

  try {
    const stat = await lstat(filePath);
    let effectiveStat = stat;
    if (stat.isSymbolicLink()) {
      const resolvedFile = await realpath(filePath);
      const resolvedRepo = await realpath(repoPath);
      if (!isPathInside(resolvedRepo, resolvedFile)) {
        console.warn('[reviewignore] Refusing to follow symlink outside repo root');
        return { patterns: [], found: false };
      }
      effectiveStat = await lstat(resolvedFile);
    } else if (!stat.isFile()) {
      console.warn('[reviewignore] Ignoring non-file ' + REVIEWIGNORE_FILENAME);
      return { patterns: [], found: false };
    }

    if (!effectiveStat.isFile()) {
      console.warn('[reviewignore] Ignoring non-file ' + REVIEWIGNORE_FILENAME);
      return { patterns: [], found: false };
    }

    if (effectiveStat.size > MAX_REVIEWIGNORE_BYTES) {
      console.warn(
        '[reviewignore] Ignoring ' +
          REVIEWIGNORE_FILENAME +
          ' larger than ' +
          MAX_REVIEWIGNORE_BYTES +
          ' bytes'
      );
      return { patterns: [], found: false };
    }

    const content = await readFile(filePath, 'utf-8');
    const patterns = parseReviewIgnoreContent(content);

    if (patterns.length > 0) {
      console.log(
        '[reviewignore] Loaded ' + patterns.length + ' patterns from ' + REVIEWIGNORE_FILENAME
      );
    }

    return {
      patterns,
      filePath,
      found: true,
    };
  } catch (error) {
    console.warn(
      '[reviewignore] Failed to read ' +
        REVIEWIGNORE_FILENAME +
        ': ' +
        (error instanceof Error ? error.message : String(error))
    );
    return {
      patterns: [],
      found: false,
    };
  }
}

/**
 * Check if a pattern is a "bare segment" pattern that should also match contents.
 *
 * A bare segment pattern has the form: double-star slash name
 * where name has no wildcards and no additional slashes.
 * These patterns match both the name itself AND anything under it,
 * following .gitignore semantics where a bare name matches directories and their contents.
 */
function isBareSegmentPattern(pattern: string): boolean {
  // Must start with **/
  if (!pattern.startsWith('**/')) return false;

  const segment = pattern.slice(3); // Remove '**/' prefix

  // Must be a single segment (no more slashes)
  if (segment.includes('/')) return false;

  // Must not contain wildcards
  if (segment.includes('*') || segment.includes('?') || segment.includes('[')) return false;

  return true;
}

/**
 * Check if a file path matches any of the reviewignore patterns
 *
 * Patterns are applied in order, with later patterns overriding earlier ones.
 * Negation patterns (!) can re-include files that were previously excluded.
 *
 * For bare segment patterns (e.g., node_modules which normalizes to double-star/node_modules),
 * we also match contents (as if double-star/node_modules/double-star was specified). This follows
 * .gitignore semantics where a bare directory name excludes all its contents.
 *
 * @param filePath - Normalized file path (relative to repo root)
 * @param patterns - Parsed reviewignore patterns
 * @param debug - If true, logs which patterns matched (for troubleshooting)
 * @returns true if the file should be ignored (excluded from review)
 */
export function shouldIgnoreFile(
  filePath: string,
  patterns: ReviewIgnorePattern[],
  debug = false
): boolean {
  if (patterns.length === 0) {
    return false;
  }

  // Apply patterns in order - later patterns override earlier ones
  let ignored = false;
  let matchedPattern: ReviewIgnorePattern | null = null;

  for (const entry of patterns) {
    const { pattern, negated, _matcher, _contentsMatcher } = entry;

    // Use pre-compiled matcher if available, otherwise fall back to runtime matching
    let matches = _matcher
      ? _matcher.match(filePath)
      : new Minimatch(pattern, MINIMATCH_OPTIONS).match(filePath);

    // For bare segment patterns, ALSO check contents pattern
    // This is an OR - if either matches, the pattern line matches
    // IMPORTANT: Both checks are ONE logical match for this line,
    // preserving "last match wins" semantics for negation
    if (!matches && (_contentsMatcher || isBareSegmentPattern(pattern))) {
      matches = _contentsMatcher
        ? _contentsMatcher.match(filePath)
        : new Minimatch(pattern + '/**', MINIMATCH_OPTIONS).match(filePath);
    }

    if (matches) {
      // Negated patterns un-ignore, regular patterns ignore
      ignored = !negated;
      matchedPattern = entry;
    }
  }

  // Debug logging to help users troubleshoot unexpected exclusions
  if (debug && matchedPattern) {
    const action = ignored ? 'excluded' : 're-included';
    console.log(
      `[reviewignore] ${filePath} ${action} by pattern "${matchedPattern.pattern}" (line ${matchedPattern.lineNumber})`
    );
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
