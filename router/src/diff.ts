/**
 * Diff Module
 * Extracts and processes PR diffs with path filtering
 */

import { execSync } from 'child_process';
import { minimatch } from 'minimatch';

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
}

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
  // First, try to resolve the ref directly
  try {
    const resolved = execSync(`git rev-parse --verify "${ref}"`, {
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
      const resolved = execSync(`git rev-parse --verify "origin/${branchName}"`, {
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
    const resolved = execSync(`git rev-parse --verify "origin/${ref}"`, {
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
 * Get diff between two commits
 */
export function getDiff(repoPath: string, baseSha: string, headSha: string): DiffSummary {
  // Normalize refs to handle ADO's refs/heads/* format
  const normalizedBase = normalizeGitRef(repoPath, baseSha);
  const normalizedHead = normalizeGitRef(repoPath, headSha);

  try {
    // Get list of changed files with stats (using locked unified context)
    const diffStat = execSync(
      `git diff --unified=${UNIFIED_CONTEXT} --numstat ${normalizedBase}...${normalizedHead}`,
      {
        cwd: repoPath,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      }
    );

    // Get file statuses
    const nameStatus = execSync(`git diff --name-status ${normalizedBase}...${normalizedHead}`, {
      cwd: repoPath,
      encoding: 'utf-8',
    });

    const { statusMap, renameMap } = parseNameStatus(nameStatus);
    const files = parseDiffStat(diffStat, statusMap, renameMap);

    // Get patches for each file
    for (const file of files) {
      if (file.status !== 'deleted') {
        try {
          file.patch = execSync(
            `git diff --unified=${UNIFIED_CONTEXT} ${normalizedBase}...${normalizedHead} -- "${file.path}"`,
            {
              cwd: repoPath,
              encoding: 'utf-8',
              maxBuffer: 1024 * 1024,
            }
          );
        } catch {
          // Skip files that fail to get patch (binary, etc.)
        }
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
    throw new Error(`Failed to get diff: ${error}`);
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
 * Ensures all paths are normalized at ingestion boundary (belt-and-suspenders)
 * EXPORTED for use at diff ingestion boundaries
 */
export function canonicalizeDiffFiles(files: DiffFile[]): DiffFile[] {
  return files.map((file) => ({
    ...file,
    path: normalizePath(file.path),
    oldPath: file.oldPath ? normalizePath(file.oldPath) : undefined,
  }));
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
 * Parse git diff --numstat output
 */
function parseDiffStat(
  output: string,
  statusMap: Map<string, DiffFile['status']>,
  renameMap: Map<string, string>
): DiffFile[] {
  const files: DiffFile[] = [];

  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const [addStr, delStr, ...pathParts] = line.split('\t');
    const path = normalizePath(pathParts.join('\t'));

    // Binary files show '-' for additions/deletions
    const additions = addStr === '-' ? 0 : parseInt(addStr ?? '0', 10);
    const deletions = delStr === '-' ? 0 : parseInt(delStr ?? '0', 10);

    const file: DiffFile = {
      path,
      status: statusMap.get(path) ?? 'modified',
      additions,
      deletions,
    };

    // Add oldPath for renamed files
    if (renameMap.has(path)) {
      file.oldPath = renameMap.get(path);
    }

    files.push(file);
  }

  return files;
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
