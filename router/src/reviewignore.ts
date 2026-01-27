/**
 * Review Ignore Utilities
 *
 * Supports .reviewignore files with .gitignore-compatible semantics.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { minimatch } from 'minimatch';
import type { DiffFile } from './diff.js';
import { normalizePath } from './diff.js';
import { assertSafeRepoPath } from './git-validators.js';

interface ReviewIgnoreRule {
  pattern: string;
  negated: boolean;
  rooted: boolean;
  directoryOnly: boolean;
}

export interface ReviewIgnore {
  rules: ReviewIgnoreRule[];
  patterns: string[];
  sourcePath: string;
}

export interface ReviewIgnoreFilterResult {
  filtered: DiffFile[];
  ignored: DiffFile[];
}

const REVIEWIGNORE_FILENAME = '.reviewignore';

/**
 * Load .reviewignore from repository root if present.
 */
export function loadReviewIgnore(repoPath: string): ReviewIgnore | null {
  assertSafeRepoPath(repoPath);
  const sourcePath = join(repoPath, REVIEWIGNORE_FILENAME);
  if (!existsSync(sourcePath)) return null;

  const contents = readFileSync(sourcePath, 'utf-8');
  const parsed = parseReviewIgnore(contents);
  if (parsed.patterns.length === 0) {
    return { rules: [], patterns: [], sourcePath };
  }

  return { rules: parsed.rules, patterns: parsed.patterns, sourcePath };
}

/**
 * Apply .reviewignore patterns to diff files.
 */
export function filterReviewIgnoredFiles(
  files: DiffFile[],
  reviewIgnore: ReviewIgnore | null
): ReviewIgnoreFilterResult {
  if (!reviewIgnore) {
    return { filtered: files, ignored: [] };
  }

  const ignored: DiffFile[] = [];
  const filtered = files.filter((file) => {
    const normalized = normalizePath(file.path);
    if (shouldIgnorePath(normalized, reviewIgnore.rules)) {
      ignored.push(file);
      return false;
    }
    return true;
  });

  return { filtered, ignored };
}

function parseReviewIgnore(contents: string): { rules: ReviewIgnoreRule[]; patterns: string[] } {
  const rules: ReviewIgnoreRule[] = [];
  const patterns: string[] = [];

  for (const rawLine of contents.split(/\r?\n/)) {
    const parsed = parseReviewIgnoreLine(rawLine);
    if (!parsed) continue;
    patterns.push(parsed.original);
    rules.push(parsed.rule);
  }

  return { rules, patterns };
}

function parseReviewIgnoreLine(
  rawLine: string
): { original: string; rule: ReviewIgnoreRule } | null {
  if (!rawLine) return null;

  let line = rawLine;
  if (line.startsWith('\\#') || line.startsWith('\\!')) {
    line = line.slice(1);
  }

  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  let negated = false;
  let pattern = trimmed;
  if (pattern.startsWith('!')) {
    negated = true;
    pattern = pattern.slice(1);
  }

  if (!pattern) return null;

  const rooted = pattern.startsWith('/');
  if (rooted) {
    pattern = pattern.slice(1);
  }

  const directoryOnly = pattern.endsWith('/');
  if (directoryOnly) {
    pattern = pattern.slice(0, -1);
  }

  return {
    original: trimmed,
    rule: {
      pattern,
      negated,
      rooted,
      directoryOnly,
    },
  };
}

function shouldIgnorePath(path: string, rules: ReviewIgnoreRule[]): boolean {
  let ignored = false;
  for (const rule of rules) {
    if (!rule.pattern) continue;
    if (matchesRule(path, rule)) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

function matchesRule(path: string, rule: ReviewIgnoreRule): boolean {
  const hasSlash = rule.pattern.includes('/');
  const hasGlob = /[*?[\]]/.test(rule.pattern);

  if (rule.directoryOnly) {
    const pattern = rule.rooted ? `${rule.pattern}/**` : `**/${rule.pattern}/**`;
    return minimatch(path, pattern, { dot: true });
  }

  if (!hasSlash && !hasGlob) {
    if (rule.rooted) {
      return path === rule.pattern || path.startsWith(`${rule.pattern}/`);
    }
    return path.split('/').includes(rule.pattern);
  }

  if (rule.rooted) {
    return minimatch(path, rule.pattern, { dot: true });
  }

  if (!hasSlash) {
    return minimatch(path, rule.pattern, { dot: true, matchBase: true });
  }

  return minimatch(path, `**/${rule.pattern}`, { dot: true });
}
