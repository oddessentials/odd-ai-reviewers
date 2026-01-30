/**
 * Comment Resolution Module
 *
 * Handles grouped comment resolution logic for both GitHub and Azure DevOps.
 * This module determines when a comment should be resolved (all markers stale)
 * and provides visual distinction for partially resolved grouped comments.
 *
 * Key invariant: A comment is resolved if and only if ALL unique fingerprint
 * markers in that comment are stale in the current analysis run. No exceptions.
 *
 * @module resolution
 */

import { parseDedupeKey } from './formats.js';

/**
 * Platform identifier for resolution logging
 */
export type Platform = 'github' | 'ado';

/**
 * Resolution log entry structure
 * Event name is stable across platforms: 'comment_resolution'
 */
export interface ResolutionLog {
  event: 'comment_resolution';
  platform: Platform;
  commentId: number;
  fingerprintCount: number;
  staleCount: number;
  resolved: boolean;
}

/**
 * Resolution warning log entry structure
 * Event name is stable across platforms: 'comment_resolution_warning'
 */
export interface ResolutionWarningLog {
  event: 'comment_resolution_warning';
  platform: Platform;
  commentId: number;
  reason: 'malformed_marker';
}

/**
 * Result of evaluating a comment for resolution
 */
export interface ResolutionDecision {
  commentId: number;
  resolved: boolean;
  fingerprintCount: number;
  staleCount: number;
  /** Markers that are stale but comment not resolved (for visual indication) */
  partiallyResolved: string[];
  /** Whether any marker in the comment is malformed */
  hasMalformed: boolean;
}

/**
 * Build a reverse map from comment IDs to their markers
 *
 * The dedupeKeyToCommentId map maps dedupe keys (fingerprint markers) to comment IDs.
 * This function reverses that mapping to get all markers for each comment.
 *
 * @param dedupeKeyToCommentId Map from dedupe key to comment ID
 * @returns Map from comment ID to array of dedupe keys in that comment
 */
export function buildCommentToMarkersMap(
  dedupeKeyToCommentId: Map<string, number>
): Map<number, string[]> {
  const commentIdToMarkers = new Map<number, string[]>();

  for (const [marker, commentId] of dedupeKeyToCommentId) {
    const existing = commentIdToMarkers.get(commentId) ?? [];
    existing.push(marker);
    commentIdToMarkers.set(commentId, existing);
  }

  return commentIdToMarkers;
}

/**
 * Determine if a comment should be resolved
 *
 * A comment should be resolved if and only if:
 * 1. All unique fingerprint markers in the comment are in the stale set
 * 2. No markers in the comment are malformed (failed to parse)
 * 3. There is at least one valid marker in the comment
 *
 * @param allMarkersInComment All dedupe keys extracted from the comment (will be deduplicated)
 * @param staleMarkers Set of markers identified as stale
 * @returns true if the comment should be resolved, false otherwise
 */
export function shouldResolveComment(
  allMarkersInComment: string[],
  staleMarkers: Set<string>
): boolean {
  // Deduplicate markers within this comment
  const uniqueMarkers = [...new Set(allMarkersInComment)];

  // Zero valid markers = do not resolve
  if (uniqueMarkers.length === 0) {
    return false;
  }

  // Check each marker for validity and staleness
  for (const marker of uniqueMarkers) {
    // Malformed marker = do not resolve entire comment
    const parsed = parseDedupeKey(marker);
    if (parsed === null) {
      return false;
    }

    // Any marker NOT in stale set = do not resolve
    if (!staleMarkers.has(marker)) {
      return false;
    }
  }

  // All unique markers are stale and valid
  return true;
}

/**
 * Get markers that are stale but the comment is not fully resolved
 *
 * These markers represent findings that have been fixed, but the grouped
 * comment cannot be resolved because other findings in the group are still active.
 * Used for visual indication (strikethrough).
 *
 * @param allMarkersInComment All dedupe keys in the comment
 * @param staleMarkers Set of markers identified as stale
 * @returns Array of markers that are stale (for visual distinction)
 */
export function getPartiallyResolvedMarkers(
  allMarkersInComment: string[],
  staleMarkers: Set<string>
): string[] {
  const uniqueMarkers = [...new Set(allMarkersInComment)];
  const partiallyResolved: string[] = [];

  for (const marker of uniqueMarkers) {
    // Only include valid markers that are in the stale set
    const parsed = parseDedupeKey(marker);
    if (parsed !== null && staleMarkers.has(marker)) {
      partiallyResolved.push(marker);
    }
  }

  return partiallyResolved;
}

/**
 * Check if any marker in the comment is malformed
 *
 * @param markers Array of markers to check
 * @returns true if any marker failed to parse
 */
export function hasMalformedMarkers(markers: string[]): boolean {
  for (const marker of markers) {
    if (parseDedupeKey(marker) === null) {
      return true;
    }
  }
  return false;
}

/**
 * Apply visual distinction (strikethrough) to resolved findings in a comment body
 *
 * For grouped comments with partial resolution, this function:
 * 1. Identifies finding blocks that correspond to resolved markers
 * 2. Applies Markdown strikethrough (~~text~~) to those blocks
 * 3. Preserves all fingerprint markers unchanged (<!-- ... -->)
 * 4. Preserves all non-marker user-authored content byte-for-byte
 *
 * @param body The comment body content
 * @param resolvedMarkers Markers that are resolved (stale)
 * @returns Updated body with strikethrough on resolved findings
 */
export function applyPartialResolutionVisual(body: string, resolvedMarkers: string[]): string {
  if (resolvedMarkers.length === 0) {
    return body;
  }

  // Build set for O(1) lookup
  const resolvedSet = new Set(resolvedMarkers);

  // Parse the body to identify finding blocks and their associated markers
  // Grouped comment format (from base.ts formatGroupedInlineComment):
  // **Multiple issues found in this area (N):**
  //
  // 🔴 **Line X** (agent): message
  //    💡 suggestion
  //
  // <!-- odd-ai-reviewers:fingerprint:v1:... -->
  // <!-- odd-ai-reviewers:fingerprint:v1:... -->

  // Strategy: Match finding lines with their corresponding markers
  // The markers appear at the end in the same order as findings

  // Extract all fingerprint markers in order
  const markerPattern = /<!--\s*odd-ai-reviewers:fingerprint:v1:([^\s]+)\s*-->/g;
  const markers: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = markerPattern.exec(body)) !== null) {
    // FR-009: Guard against empty capture groups to prevent invalid markers
    const marker = match[1];
    if (marker && marker.length > 0) {
      markers.push(marker);
    }
  }

  if (markers.length === 0) {
    return body;
  }

  // Process line by line for safer Unicode handling
  const lines = body.split('\n');
  const resultLines: string[] = [];
  let findingIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    // Check if this line is a finding line (starts with emoji + **Line)
    // Use a simple string check to avoid regex Unicode issues
    const isFindingLine =
      line.startsWith('🔴 **Line') || line.startsWith('🟡 **Line') || line.startsWith('🔵 **Line');

    if (isFindingLine && findingIndex < markers.length) {
      const marker = markers[findingIndex];

      // Collect the full finding block (main line + optional suggestion line)
      let findingBlock = line;
      const nextLine = lines[i + 1];

      // Check if next line is a suggestion (starts with whitespace + 💡)
      if (nextLine && nextLine.trim().startsWith('💡')) {
        findingBlock += '\n' + nextLine;
        i++; // Skip the suggestion line in the main loop
      }

      if (marker && resolvedSet.has(marker)) {
        // Apply strikethrough to the entire finding block
        resultLines.push(`~~${findingBlock}~~ ✅`);
      } else {
        resultLines.push(findingBlock);
      }

      findingIndex++;
    } else {
      resultLines.push(line);
    }
  }

  return resultLines.join('\n');
}

/**
 * Emit a structured resolution log entry
 *
 * Per spec: Logs are emitted at most once per comment per analysis run.
 * Log event name is stable: 'comment_resolution'
 * Raw fingerprint strings are NOT included in logs per security requirements.
 *
 * @param platform Platform identifier ('github' or 'ado')
 * @param commentId Platform-specific comment/thread ID
 * @param fingerprintCount Total unique fingerprints in the comment
 * @param staleCount Number of stale fingerprints
 * @param resolved Whether the comment was resolved
 */
export function emitResolutionLog(
  platform: Platform,
  commentId: number,
  fingerprintCount: number,
  staleCount: number,
  resolved: boolean
): void {
  const logEntry: ResolutionLog = {
    event: 'comment_resolution',
    platform,
    commentId,
    fingerprintCount,
    staleCount,
    resolved,
  };

  console.log(JSON.stringify(logEntry));
}

/**
 * Strip only our own fingerprint markers from a comment body
 *
 * Per spec FR-019: When modifying comment bodies, system MUST preserve all
 * non-marker user-authored content byte-for-byte. This function removes only
 * markers matching our specific format, preserving any other HTML comments.
 *
 * Pattern matched: <!-- odd-ai-reviewers:fingerprint:v1:FINGERPRINT:FILE:LINE -->
 *
 * @param body The comment body content
 * @returns Body with our fingerprint markers removed
 */
export function stripOwnFingerprintMarkers(body: string): string {
  return body.replace(/<!--\s*odd-ai-reviewers:fingerprint:v1:[^\s]+\s*-->\n?/g, '').trim();
}

/**
 * Emit a structured warning log for malformed markers
 *
 * Per spec FR-010: System MUST emit exactly one structured warning log entry
 * per comment with malformed markers (no spam). Raw fingerprints MUST NOT
 * be included in the log.
 *
 * @param platform Platform identifier ('github' or 'ado')
 * @param commentId Platform-specific comment/thread ID
 */
export function emitMalformedMarkerWarning(platform: Platform, commentId: number): void {
  const logEntry: ResolutionWarningLog = {
    event: 'comment_resolution_warning',
    platform,
    commentId,
    reason: 'malformed_marker',
  };

  console.warn(JSON.stringify(logEntry));
}

/**
 * Evaluate a comment for resolution and return a decision
 *
 * This is a convenience function that combines shouldResolveComment,
 * getPartiallyResolvedMarkers, and hasMalformedMarkers into a single call.
 *
 * @param commentId The comment/thread ID
 * @param allMarkersInComment All dedupe keys in the comment
 * @param staleMarkers Set of markers identified as stale
 * @returns Complete resolution decision for the comment
 */
export function evaluateCommentResolution(
  commentId: number,
  allMarkersInComment: string[],
  staleMarkers: Set<string>
): ResolutionDecision {
  const uniqueMarkers = [...new Set(allMarkersInComment)];
  const hasMalformed = hasMalformedMarkers(uniqueMarkers);
  const resolved = shouldResolveComment(allMarkersInComment, staleMarkers);
  const partiallyResolved = resolved
    ? []
    : getPartiallyResolvedMarkers(allMarkersInComment, staleMarkers);

  let staleCount = 0;
  for (const marker of uniqueMarkers) {
    if (staleMarkers.has(marker)) {
      staleCount++;
    }
  }

  return {
    commentId,
    resolved,
    fingerprintCount: uniqueMarkers.length,
    staleCount,
    partiallyResolved,
    hasMalformed,
  };
}
