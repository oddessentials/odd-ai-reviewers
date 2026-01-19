/**
 * Diff Module
 * Extracts and processes PR diffs with path filtering
 */

import { execSync } from 'child_process';
import { minimatch } from 'minimatch';

export interface DiffFile {
    /** File path relative to repo root */
    path: string;
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
}

export interface PathFilter {
    include?: string[];
    exclude?: string[];
}

/**
 * Get diff between two commits
 */
export function getDiff(repoPath: string, baseSha: string, headSha: string): DiffSummary {
    try {
        // Get list of changed files with stats
        const diffStat = execSync(
            `git diff --numstat ${baseSha}...${headSha}`,
            { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );

        // Get file statuses
        const nameStatus = execSync(
            `git diff --name-status ${baseSha}...${headSha}`,
            { cwd: repoPath, encoding: 'utf-8' }
        );

        const statusMap = parseNameStatus(nameStatus);
        const files = parseDiffStat(diffStat, statusMap);

        // Get patches for each file
        for (const file of files) {
            if (file.status !== 'deleted') {
                try {
                    file.patch = execSync(
                        `git diff ${baseSha}...${headSha} -- "${file.path}"`,
                        { cwd: repoPath, encoding: 'utf-8', maxBuffer: 1024 * 1024 }
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
 * Parse git diff --name-status output
 */
function parseNameStatus(output: string): Map<string, DiffFile['status']> {
    const map = new Map<string, DiffFile['status']>();

    for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const [status, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t'); // Handle paths with tabs

        switch (status?.[0]) {
            case 'A':
                map.set(path, 'added');
                break;
            case 'M':
                map.set(path, 'modified');
                break;
            case 'D':
                map.set(path, 'deleted');
                break;
            case 'R':
                map.set(pathParts[1] ?? path, 'renamed');
                break;
            default:
                map.set(path, 'modified');
        }
    }

    return map;
}

/**
 * Parse git diff --numstat output
 */
function parseDiffStat(
    output: string,
    statusMap: Map<string, DiffFile['status']>
): DiffFile[] {
    const files: DiffFile[] = [];

    for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const [addStr, delStr, ...pathParts] = line.split('\t');
        const path = pathParts.join('\t');

        // Binary files show '-' for additions/deletions
        const additions = addStr === '-' ? 0 : parseInt(addStr ?? '0', 10);
        const deletions = delStr === '-' ? 0 : parseInt(delStr ?? '0', 10);

        files.push({
            path,
            status: statusMap.get(path) ?? 'modified',
            additions,
            deletions,
        });
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
