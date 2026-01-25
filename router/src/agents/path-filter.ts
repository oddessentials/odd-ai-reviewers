/**
 * Path Filtering Utilities
 *
 * Defense-in-depth protection for file paths passed to shell commands.
 * Primary protection is shell-free execution (execFileSync with shell: false).
 * This module provides secondary validation and structured logging.
 */

import { assertSafePath, getUnsafeCharsInPath } from '../git-validators.js';

export interface PathFilterResult {
  /** Paths that passed validation */
  safePaths: string[];
  /** Count of paths that were skipped */
  skippedCount: number;
  /** Sample of skipped paths (max 3) for logging */
  skippedSamples: string[];
}

/**
 * Filter file paths for safe shell execution.
 * Validates each path and returns structured result with logging info.
 *
 * @param filePaths - Array of file paths to validate
 * @param agentId - Agent identifier for log messages
 * @returns Filtered paths with skip statistics
 */
export function filterSafePaths(filePaths: string[], agentId: string): PathFilterResult {
  const safePaths: string[] = [];
  const skippedSamples: string[] = [];

  for (const p of filePaths) {
    try {
      assertSafePath(p, 'file path');
      safePaths.push(p);
    } catch {
      // Collect samples for logging with specific unsafe chars
      if (skippedSamples.length < 3) {
        const unsafeChars = getUnsafeCharsInPath(p);
        const truncated = p.length > 40 ? p.slice(0, 37) + '...' : p;
        skippedSamples.push(`${truncated} [${unsafeChars}]`);
      }
    }
  }

  const skippedCount = filePaths.length - safePaths.length;

  // Log warning if paths were skipped
  if (skippedCount > 0) {
    const sampleText = skippedSamples.join(', ');
    const moreText = skippedCount > 3 ? ` (and ${skippedCount - 3} more)` : '';
    console.warn(`[${agentId}] Skipped ${skippedCount} unsafe path(s): ${sampleText}${moreText}`);
  }

  return { safePaths, skippedCount, skippedSamples };
}
