/**
 * Diff Module
 * Extracts and processes PR diffs with path filtering
 */

import { execFileSync } from 'child_process';
import { minimatch } from 'minimatch';
import { assertSafeGitRef, assertSafePath, assertSafeRepoPath } from './git-validators.js';

export interface DiffFile {
  /** File path relative to repo root (normalized - no a/, b/, ./, / prefixes) */
  path: string;
  /** Original path before rename (for bidirectional mapping) */
  oldPath?: string;
  /** File status: added, modified, deleted, renamed */
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Unified diff content for this file */
  patch?: string;
  /** True for binary files (stats show as -/-) */
  isBinary?: boolean;
}

/**
 * Branded symbol for canonical diff files - CANNOT be constructed directly
 * Only canonicalizeDiffFiles() can produce this type
 */
declare const __canonical: unique symbol;

/**
 * Canonical DiffFile with guaranteed normalized paths
 * ONLY constructable via canonicalizeDiffFiles() - enforced at type level
 */
export type CanonicalDiffFile = DiffFile & { readonly [__canonical]: true };

export interface DiffSummary {
  /** All changed files */
  files: DiffFile[];
  /** Total additions across all files */
  totalAdditions: number;
  /** Total deletions across all files */
  totalDeletions: number;
  /** Base commit SHA */
  baseSha: string;
  /** Head commit SHA */
  headSha: string;
  /** Unified context lines used (locked to prevent drift) */
  contextLines: number;
  /** Diff source identifier */
  source: 'local-git';
}

export interface ResolvedReviewRefs {
  /** Normalized base SHA used for diff */
  baseSha: string;
  /** Normalized head SHA used for diff and review context */
  headSha: string;
  /** Normalized head SHA from input (e.g., merge commit) */
  inputHeadSha: string;
  /** Whether the head SHA was derived from a merge commit parent */
  headSource: 'input' | 'merge-parent';
}

export interface PathFilter {
  include?: string[];
  exclude?: string[];
}

/**
 * Unified context lines for git diff
 * Locked to GitHub's default to prevent drift between local diff and API diff
 */
const UNIFIED_CONTEXT = 3;

/**
 * Hard limits to fail fast on suspicious diff output
 */
const MAX_FILES = 5000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * Parse result with error tracking for user-visible messaging
 */
export interface NumstatParseResult {
  files: DiffFile[];
  errors: {
    count: number;
    samples: string[]; // Max 5 samples for logging
  };
}

/**
 * Normalize a git ref to ensure it's resolvable.
 *
 * Azure DevOps passes refs like 'refs/heads/main' but after checkout,
 * only remote refs (origin/main) exist locally. This function:
 * 1. Tries the original ref first
 * 2. If it's a refs/heads/* format, tries origin/* as fallback
 * 3. Returns the resolved SHA or original ref
 *
 * @param repoPath - Path to the repository
 * @param ref - Git reference (SHA, branch name, or refs/heads/* format)
 * @returns Resolved SHA or original ref if already valid
 */
export function normalizeGitRef(repoPath: string, ref: string): string {
  // Validate inputs before shell execution (defense-in-depth)
  assertSafeRepoPath(repoPath);
  assertSafeGitRef(ref, 'ref');

  // First, try to resolve the ref directly
  try {
    const resolved = execFileSync('git', ['rev-parse', '--verify', ref], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return resolved;
  } catch {
    // Direct resolution failed, try alternatives
  }

  // If it's a refs/heads/* format, try origin/*
  if (ref.startsWith('refs/heads/')) {
    const branchName = ref.replace('refs/heads/', '');
    try {
      const resolved = execFileSync('git', ['rev-parse', '--verify', `origin/${branchName}`], {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      console.log(`[diff] Resolved ${ref} -> origin/${branchName} (${resolved.slice(0, 8)})`);
      return resolved;
    } catch {
      // Also try without refs/heads prefix
    }
  }

  // Try as a remote branch directly
  try {
    const resolved = execFileSync('git', ['rev-parse', '--verify', `origin/${ref}`], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    console.log(`[diff] Resolved ${ref} -> origin/${ref} (${resolved.slice(0, 8)})`);
    return resolved;
  } catch {
    // Fall through to return original
  }

  // Return original ref - will fail at git diff if invalid
  return ref;
}

/**
 * Resolve base/head refs for review runs, including merge-commit handling.
 *
 * GitHub PR workflows often pass a merge commit SHA (refs/pull/<id>/merge) as head.
 * Inline comment APIs expect the PR HEAD commit, not the merge commit. When the
 * provided head is a merge commit whose first parent matches the base SHA,
 * we use the second parent (PR head) for diff and reporting to keep line
 * numbers aligned with the PR diff view.
 */
export function resolveReviewRefs(
  repoPath: string,
  baseSha: string,
  headSha: string
): ResolvedReviewRefs {
  assertSafeRepoPath(repoPath);
  assertSafeGitRef(baseSha, 'baseSha');
  assertSafeGitRef(headSha, 'headSha');

  const normalizedBase = normalizeGitRef(repoPath, baseSha);
  const normalizedHead = normalizeGitRef(repoPath, headSha);

  let resolvedHead = normalizedHead;
  let headSource: ResolvedReviewRefs['headSource'] = 'input';

  try {
    const parents = execFileSync('git', ['rev-list', '--parents', '-n', '1', normalizedHead], {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
      .trim()
      .split(' ');

    // Format: <commit> <parent1> <parent2> ...
    const parent1 = parents[1];
    const parent2 = parents[2];
    if (parent1 && parent2 && parent1 === normalizedBase) {
      resolvedHead = parent2;
      headSource = 'merge-parent';
      console.log(
        `[diff] Detected merge commit head ${normalizedHead.slice(0, 8)}; ` +
          `using second parent ${parent2.slice(0, 8)} for review`
      );
    }
  } catch {
    console.warn('[diff] Failed to inspect head parents');
  }

  return {
    baseSha: normalizedBase,
    headSha: resolvedHead,
    inputHeadSha: normalizedHead,
    headSource,
  };
}

/**
 * Choose a GitHub check run head SHA based on resolved review refs.
 *
 * Merge commit heads may not exist in the base repo for fork PRs, so keep the
 * merge commit SHA for checks but use PR head for diff/line mapping elsewhere.
 */
export function getGitHubCheckHeadSha(reviewRefs: ResolvedReviewRefs): string {
  return reviewRefs.headSource === 'merge-parent' ? reviewRefs.inputHeadSha : reviewRefs.headSha;
}

/**
 * Get diff between two commits
 *
 * Uses NUL-delimited numstat (-z) for robustness against special characters.
 * Includes hard guards for early failure on suspicious output.
 */
export function getDiff(repoPath: string, baseSha: string, headSha: string): DiffSummary {
  // Validate inputs before any shell execution (defense-in-depth)
  // Note: normalizeGitRef also validates, but we validate early for clear error messages
  assertSafeRepoPath(repoPath);
  assertSafeGitRef(baseSha, 'baseSha');
  assertSafeGitRef(headSha, 'headSha');

  // Normalize refs to handle ADO's refs/heads/* format
  const normalizedBase = normalizeGitRef(repoPath, baseSha);
  const normalizedHead = normalizeGitRef(repoPath, headSha);

  try {
    // Get list of changed files with stats using NUL-delimited format
    const diffStat = execFileSync(
      'git',
      ['diff', '--numstat', '-z', `${normalizedBase}...${normalizedHead}`],
      {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: MAX_OUTPUT_BYTES,
      }
    );

    // Hard guard: output size
    if (diffStat.length > MAX_OUTPUT_BYTES) {
      throw new Error(
        `Diff output exceeds ${MAX_OUTPUT_BYTES / 1024 / 1024}MB - likely invalid base/head refs`
      );
    }

    // Get file statuses (for non-rename status detection)
    const nameStatus = execFileSync(
      'git',
      ['diff', '--name-status', `${normalizedBase}...${normalizedHead}`],
      {
        cwd: repoPath,
        encoding: 'utf-8',
      }
    );

    const { statusMap } = parseNameStatus(nameStatus);
    const parseResult = parseNumstatZ(diffStat, statusMap);
    const { files, errors } = parseResult;

    // Hard guard: file count
    if (files.length > MAX_FILES) {
      throw new Error(
        `Diff contains ${files.length} files (max ${MAX_FILES}) - check base/head refs or use shallow clone with sufficient depth`
      );
    }

    // Log parse errors if any (capped to avoid spam)
    if (errors.count > 0) {
      console.warn(
        `[diff] ${errors.count} parse errors (samples: ${errors.samples.slice(0, 3).join(', ')})`
      );
    }

    // Get patches using safe pathspec filtering
    const safePaths = safePathsForGit(files);
    if (safePaths.length === 0 && files.length > 0) {
      console.warn('[diff] No valid paths for per-file diff - continuing with file-level only');
    }

    for (const file of files) {
      // Skip deleted files and binary files for patches
      if (file.status === 'deleted' || file.isBinary) continue;

      // Defensive: verify path is safe before executing git command
      const safePath = file.path?.trim();
      if (!safePath || safePath.length === 0) continue;

      // Validate path before shell execution (defense-in-depth)
      try {
        assertSafePath(safePath, 'file path');
      } catch {
        console.warn(`[diff] Skipping file with unsafe path characters: ${safePath.slice(0, 50)}`);
        continue;
      }

      try {
        file.patch = execFileSync(
          'git',
          [
            'diff',
            `--unified=${UNIFIED_CONTEXT}`,
            `${normalizedBase}...${normalizedHead}`,
            '--',
            safePath,
          ],
          {
            cwd: repoPath,
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
          }
        );
      } catch {
        // Skip files that fail to get patch (binary, special chars, etc.)
      }
    }

    const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
    const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);

    return {
      files,
      totalAdditions,
      totalDeletions,
      baseSha,
      headSha,
      contextLines: UNIFIED_CONTEXT,
      source: 'local-git',
    };
  } catch (error) {
    // Provide actionable error message
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to get diff between ${baseSha} and ${headSha}: ${errorMsg}\n` +
        `Possible causes: shallow clone, invalid refs, or cross-repo diff`
    );
  }
}

/**
 * Filter files based on include/exclude patterns
 */
export function filterFiles(files: DiffFile[], filter?: PathFilter): DiffFile[] {
  if (!filter) return files;

  return files.filter((file) => {
    // Check exclude patterns first
    if (filter.exclude) {
      for (const pattern of filter.exclude) {
        if (minimatch(file.path, pattern)) {
          return false;
        }
      }
    }

    // If include patterns exist, file must match at least one
    if (filter.include && filter.include.length > 0) {
      for (const pattern of filter.include) {
        if (minimatch(file.path, pattern)) {
          return true;
        }
      }
      return false;
    }

    return true;
  });
}

/**
 * Normalize a file path from git diff output
 * Removes 'a/' and 'b/' prefixes, './' prefix, and leading slashes
 * EXPORTED for use in path normalization at all boundaries
 */
export function normalizePath(path: string): string {
  return path
    .replace(/^a\//, '') // Remove 'a/' prefix
    .replace(/^b\//, '') // Remove 'b/' prefix
    .replace(/^\.\//, '') // Remove './' prefix
    .replace(/^\//, ''); // Remove leading slash
}

/**
 * Canonicalize all path fields in DiffFile array
 * Ensures all paths are normalized at ingestion boundary
 *
 * IMPORTANT: This is the ONLY way to construct CanonicalDiffFile[]
 * Reporters and buildLineResolver must accept only CanonicalDiffFile[]
 */
export function canonicalizeDiffFiles(files: DiffFile[]): CanonicalDiffFile[] {
  return files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
    oldPath: file.oldPath ? normalizePath(file.oldPath) : undefined,
  })) as CanonicalDiffFile[];
}

/**
 * Parse git diff --numstat -z output (NUL-delimited for robustness)
 *
 * Format: For each file: ADD\tDEL\tPATH\0
 * For renames: ADD\tDEL\t\0OLDPATH\0NEWPATH\0
 * Binary files: -\t-\tPATH\0
 *
 * Returns files array and parse errors for user-visible messaging
 */
export function parseNumstatZ(
  output: string,
  statusMap: Map<string, DiffFile['status']>
): NumstatParseResult {
  const files: DiffFile[] = [];
  const errors = { count: 0, samples: [] as string[] };

  // Split on NUL, filter empty parts
  const parts = output.split('\0').filter((p) => p.length > 0);

  let i = 0;
  while (i < parts.length) {
    const record = parts[i];
    if (!record) {
      i++;
      continue;
    }

    // Match: ADD\tDEL\tPATH or ADD\tDEL\t (empty path = rename follows)
    const match = record.match(/^(-|\d+)\t(-|\d+)\t(.*)$/);
    if (!match) {
      // Malformed record - log and skip
      if (errors.count < 5) errors.samples.push(record.slice(0, 50));
      errors.count++;
      i++;
      continue;
    }

    const [, addStr, delStr, firstPath] = match;

    // Type guard: match groups should exist due to regex structure
    if (addStr === undefined || delStr === undefined || firstPath === undefined) {
      if (errors.count < 5) errors.samples.push(`Incomplete match: ${record.slice(0, 50)}`);
      errors.count++;
      i++;
      continue;
    }

    const isBinary = addStr === '-' && delStr === '-';
    const additions = isBinary ? 0 : parseInt(addStr, 10);
    const deletions = isBinary ? 0 : parseInt(delStr, 10);

    // Check for NaN (shouldn't happen with proper -z parsing but be safe)
    if (isNaN(additions) || isNaN(deletions)) {
      if (errors.count < 5) errors.samples.push(`NaN stats: ${record.slice(0, 50)}`);
      errors.count++;
      i++;
      continue;
    }

    // Empty firstPath = rename, next two parts are oldPath and newPath
    if (firstPath === '') {
      const oldPath = normalizePath(parts[++i] ?? '');
      const newPath = normalizePath(parts[++i] ?? '');

      if (!newPath) {
        if (errors.count < 5) errors.samples.push(`Empty rename path: ${record}`);
        errors.count++;
        i++;
        continue;
      }

      files.push({
        path: newPath,
        oldPath,
        status: 'renamed',
        additions,
        deletions,
        isBinary,
      });
    } else {
      const path = normalizePath(firstPath);
      if (!path) {
        if (errors.count < 5) errors.samples.push(`Empty path: ${record.slice(0, 50)}`);
        errors.count++;
        i++;
        continue;
      }

      files.push({
        path,
        status: statusMap.get(path) ?? 'modified',
        additions,
        deletions,
        isBinary,
      });
    }

    i++;
  }

  return { files, errors };
}

/**
 * Filter and dedupe paths for safe git pathspec invocation
 * Prevents "empty string is not a valid pathspec" errors
 */
export function safePathsForGit(files: DiffFile[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const f of files) {
    const p = f.path?.trim();
    if (p && p.length > 0 && !seen.has(p)) {
      seen.add(p);
      result.push(p);
    }
  }

  return result;
}

/**
 * Parse git diff --name-status output
 */
function parseNameStatus(output: string): {
  statusMap: Map<string, DiffFile['status']>;
  renameMap: Map<string, string>; // newPath -> oldPath
} {
  const statusMap = new Map<string, DiffFile['status']>();
  const renameMap = new Map<string, string>();

  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const [status, ...pathParts] = line.split('\t');

    switch (status?.[0]) {
      case 'A':
        statusMap.set(normalizePath(pathParts.join('\t')), 'added');
        break;
      case 'M':
        statusMap.set(normalizePath(pathParts.join('\t')), 'modified');
        break;
      case 'D':
        statusMap.set(normalizePath(pathParts.join('\t')), 'deleted');
        break;
      case 'R': {
        // For renames, capture BOTH old and new paths
        // Format: R<similarity>  old-path  new-path
        const oldPath = normalizePath(pathParts[0] ?? '');
        const newPath = normalizePath(pathParts[1] ?? pathParts.join('\t'));
        statusMap.set(newPath, 'renamed');
        renameMap.set(newPath, oldPath); // Track old path for bidirectional mapping
        break;
      }
      default:
        statusMap.set(normalizePath(pathParts.join('\t')), 'modified');
    }
  }

  return { statusMap, renameMap };
}

/**
 * Build a combined diff for LLM context
 */
export function buildCombinedDiff(files: DiffFile[], maxLines: number): string {
  const lines: string[] = [];
  let lineCount = 0;

  for (const file of files) {
    if (!file.patch) continue;

    const header = `\n--- ${file.path} (${file.status}) ---\n`;
    const patchLines = file.patch.split('\n');

    if (lineCount + patchLines.length > maxLines) {
      lines.push(`\n... truncated (${files.length - files.indexOf(file)} files remaining) ...`);
      break;
    }

    lines.push(header);
    lines.push(file.patch);
    lineCount += patchLines.length + 2;
  }

  return lines.join('');
}
