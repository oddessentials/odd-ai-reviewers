/**
 * Finding Formats Module
 * Normalizes findings from different agents into a unified format
 *
 * CONSOLIDATED.md Compliance:
 * - Fingerprint generation for stable deduplication
 * - Deduplication using fingerprint + path + start_line
 */

import { createHash } from 'crypto';
import type { Finding, Severity } from '../agents/types.js';

const FINGERPRINT_MARKER_PREFIX = 'odd-ai-reviewers:fingerprint:v1:';

/**
 * Generate a stable fingerprint for a finding
 *
 * Per CONSOLIDATED.md Section E:
 * - Router dedupes using: fingerprint + path + start_line
 * - Fingerprints must be reproducible and collision-resistant (INVARIANTS.md #21)
 *
 * The fingerprint is computed from:
 * - ruleId (or message hash if no ruleId)
 * - file path
 * - normalized message content
 *
 * IMPORTANT: sourceAgent is NOT included in fingerprint calculation.
 * This ensures the same issue found by different agents produces the same fingerprint,
 * enabling cross-agent deduplication (e.g., semgrep + reviewdog finding same issue).
 */
export function generateFingerprint(finding: Finding): string {
  // Use ruleId if available, otherwise hash the message
  const ruleComponent =
    finding.ruleId ?? createHash('sha256').update(finding.message).digest('hex').slice(0, 16);

  // Normalize message for fingerprinting (remove line numbers, whitespace variations)
  const normalizedMessage = finding.message
    .replace(/line \d+/gi, 'line N')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  // Create fingerprint from: rule + file + normalized message
  // NOTE: sourceAgent is intentionally excluded to allow cross-agent deduplication
  const fingerprintInput = `${ruleComponent}:${finding.file}:${normalizedMessage}`;

  return createHash('sha256').update(fingerprintInput).digest('hex').slice(0, 32);
}

/**
 * Generate a deduplication key for a finding
 *
 * Per CONSOLIDATED.md: fingerprint + path + start_line
 */
export function getDedupeKey(finding: Finding): string {
  const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
  return `${fingerprint}:${finding.file}:${finding.line ?? 0}`;
}

/**
 * Generate a deduplication key for partial findings (FR-010)
 *
 * Unlike complete findings, partial findings:
 * 1. Include sourceAgent in the key (preserve cross-agent findings)
 * 2. Include fingerprint (which contains message hash) to preserve distinct messages
 *
 * Key: sourceAgent + fingerprint + file + line
 * This ensures:
 * - Findings from different failed agents are preserved (cross-agent)
 * - Findings with different messages from the same agent are preserved
 * - Only exact duplicates (same agent, same fingerprint, same location) are collapsed
 */
export function getPartialDedupeKey(finding: Finding): string {
  const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
  return `${finding.sourceAgent}:${fingerprint}:${finding.file}:${finding.line ?? 0}`;
}

/**
 * Extract just the fingerprint hash from a full dedupe key
 *
 * Dedupe key format: `fingerprint:file:line` where fingerprint is 32 hex chars
 * Returns the 32-char fingerprint portion for proximity-based deduplication
 */
export function extractFingerprintFromKey(dedupeKey: string): string {
  // Fingerprint is always the first 32 characters (hex hash)
  return dedupeKey.slice(0, 32);
}

/**
 * Parse a dedupe key into its components
 *
 * @returns Object with fingerprint, file, and line (or null if parsing fails)
 */
export function parseDedupeKey(
  dedupeKey: string
): { fingerprint: string; file: string; line: number } | null {
  // Format: `fingerprint:file:line` where fingerprint is 32 hex chars
  const fingerprint = dedupeKey.slice(0, 32);
  if (!/^[a-f0-9]{32}$/.test(fingerprint)) {
    return null;
  }

  // Rest is `:file:line` - find the last colon to get line number
  const rest = dedupeKey.slice(33); // Skip fingerprint + first colon
  const lastColonIdx = rest.lastIndexOf(':');
  if (lastColonIdx === -1) {
    return null;
  }

  const file = rest.slice(0, lastColonIdx);
  const lineStr = rest.slice(lastColonIdx + 1);
  const line = parseInt(lineStr, 10);

  if (isNaN(line)) {
    return null;
  }

  return { fingerprint, file, line };
}

/** Threshold for considering two line numbers as "close" (likely same issue moved) */
export const LINE_PROXIMITY_THRESHOLD = 20;

/**
 * Build a map for proximity-based deduplication
 *
 * Groups existing dedupe keys by fingerprint+file, tracking all line numbers.
 * This enables detecting when a finding matches an existing comment that may
 * have drifted to a different line due to code changes.
 *
 * @returns Map from `fingerprint:file` to array of line numbers
 */
export function buildProximityMap(dedupeKeys: string[]): Map<string, number[]> {
  const map = new Map<string, number[]>();

  for (const key of dedupeKeys) {
    const parsed = parseDedupeKey(key);
    if (!parsed) continue;

    const proximityKey = `${parsed.fingerprint}:${parsed.file}`;
    const existing = map.get(proximityKey) ?? [];
    existing.push(parsed.line);
    map.set(proximityKey, existing);
  }

  return map;
}

/**
 * Update the proximity map after posting a finding
 *
 * Uses the same canonical patterns as isDuplicateByProximity:
 * - Fingerprint: finding.fingerprint ?? generateFingerprint(finding)
 * - Proximity key: `${fingerprint}:${finding.file}`
 * - Line: finding.line ?? 0
 *
 * Uses immutable updates to prevent mutation of existing arrays.
 *
 * @param proximityMap Map from fingerprint:file to line numbers
 * @param finding The finding that was just posted
 */
export function updateProximityMap(proximityMap: Map<string, number[]>, finding: Finding): void {
  const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
  const proximityKey = `${fingerprint}:${finding.file}`;
  const existingLines = proximityMap.get(proximityKey) ?? [];
  proximityMap.set(proximityKey, [...existingLines, finding.line ?? 0]);
}

/**
 * Check if a finding should be considered a duplicate based on proximity
 *
 * A finding is considered a duplicate if:
 * 1. Exact match: The full dedupe key exists in existingKeys, OR
 * 2. Proximity match: A comment with the same fingerprint+file exists
 *    within LINE_PROXIMITY_THRESHOLD lines of the finding
 *
 * This handles the common case where code moves between pushes (e.g., lines
 * inserted/deleted above the issue) without creating duplicate comments.
 *
 * @param finding The finding to check
 * @param existingKeys Set of full dedupe keys from existing comments
 * @param proximityMap Map from fingerprint:file to line numbers
 * @returns true if the finding should be skipped (is a duplicate)
 */
export function isDuplicateByProximity(
  finding: Finding,
  existingKeys: Set<string>,
  proximityMap: Map<string, number[]>
): boolean {
  const dedupeKey = getDedupeKey(finding);

  // Check exact match first
  if (existingKeys.has(dedupeKey)) {
    return true;
  }

  // Check proximity match
  const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
  const proximityKey = `${fingerprint}:${finding.file}`;
  const existingLines = proximityMap.get(proximityKey);

  if (!existingLines || existingLines.length === 0) {
    return false;
  }

  const findingLine = finding.line ?? 0;

  // Check if any existing line is within threshold
  for (const existingLine of existingLines) {
    if (Math.abs(findingLine - existingLine) <= LINE_PROXIMITY_THRESHOLD) {
      return true;
    }
  }

  return false;
}

/**
 * Deduplicate findings using fingerprint + path + start_line
 *
 * Per CONSOLIDATED.md Section E and INVARIANTS.md #3:
 * - Deduplication happens centrally in the router
 * - Uses fingerprint + path + start_line for key
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const finding of findings) {
    const key = getDedupeKey(finding);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(finding);
    }
  }

  return unique;
}

/**
 * Deduplicate partial findings using sourceAgent + file + line + ruleId (FR-010)
 *
 * Unlike complete findings, partial findings preserve findings from different agents
 * even if they report the same issue. This is because:
 * 1. We cannot determine which agent's partial analysis is more authoritative
 * 2. Partial findings are advisory only (do not affect gating per FR-008)
 * 3. Users may want to see which agents detected issues before failing
 */
export function deduplicatePartialFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const finding of findings) {
    const key = getPartialDedupeKey(finding);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(finding);
    }
  }

  return unique;
}

/**
 * Sort findings by severity (error > warning > info), then by file and line
 */
export function sortFindings(findings: Finding[]): Finding[] {
  const severityOrder: Record<Severity, number> = {
    error: 0,
    warning: 1,
    info: 2,
  };

  return [...findings].sort((a, b) => {
    // Sort by severity first
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;

    // Then by file
    const fileDiff = a.file.localeCompare(b.file);
    if (fileDiff !== 0) return fileDiff;

    // Then by line
    return (a.line ?? 0) - (b.line ?? 0);
  });
}

/**
 * Group findings by file
 */
export function groupByFile(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();

  for (const finding of findings) {
    const existing = groups.get(finding.file) ?? [];
    existing.push(finding);
    groups.set(finding.file, existing);
  }

  return groups;
}

/**
 * Count findings by severity
 */
export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };

  for (const finding of findings) {
    counts[finding.severity]++;
  }

  return counts;
}

/**
 * Generate a summary markdown
 */
export function generateSummaryMarkdown(findings: Finding[]): string {
  const counts = countBySeverity(findings);
  const grouped = groupByFile(findings);

  const lines: string[] = [
    '## AI Code Review Summary',
    '',
    `| Severity | Count |`,
    `|----------|-------|`,
    `| 🔴 Errors | ${counts.error} |`,
    `| 🟡 Warnings | ${counts.warning} |`,
    `| 🔵 Info | ${counts.info} |`,
    '',
  ];

  if (findings.length === 0) {
    lines.push('✅ No issues found!');
    return lines.join('\n');
  }

  lines.push('### Findings by File');
  lines.push('');

  for (const [file, fileFindings] of grouped) {
    lines.push(`#### \`${file}\``);
    lines.push('');

    for (const finding of fileFindings) {
      const emoji =
        finding.severity === 'error' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵';
      const lineInfo = finding.line ? ` (line ${finding.line})` : '';
      const agent = finding.sourceAgent ? ` [${finding.sourceAgent}]` : '';

      lines.push(`- ${emoji}${lineInfo}${agent}: ${finding.message}`);

      if (finding.suggestion) {
        lines.push(`  - 💡 Suggestion: ${finding.suggestion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Convert finding to GitHub check annotation format
 */
export interface GitHubAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'notice' | 'warning' | 'failure';
  message: string;
  title?: string;
}

export function toGitHubAnnotation(finding: Finding): GitHubAnnotation | null {
  if (!finding.line) return null;

  return {
    path: finding.file,
    start_line: finding.line,
    end_line: finding.endLine ?? finding.line,
    annotation_level:
      finding.severity === 'error'
        ? 'failure'
        : finding.severity === 'warning'
          ? 'warning'
          : 'notice',
    message: finding.suggestion
      ? `${finding.message}\n\n💡 Suggestion: ${finding.suggestion}`
      : finding.message,
    title: finding.ruleId
      ? `[${finding.sourceAgent}] ${finding.ruleId}`
      : `[${finding.sourceAgent}]`,
  };
}

export function buildFingerprintMarker(finding: Finding): string {
  const key = getDedupeKey(finding);
  return `<!-- ${FINGERPRINT_MARKER_PREFIX}${key} -->`;
}

export function extractFingerprintMarkers(body: string): string[] {
  const markers: string[] = [];
  // Trust: HARDCODED - Pattern uses only compile-time constant (FINGERPRINT_MARKER_PREFIX)
  // No user input is interpolated. See docs/security/regex-threat-model.md
  const regex = new RegExp(`<!--\\s*${FINGERPRINT_MARKER_PREFIX}([^\\s]+)\\s*-->`, 'g');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(body)) !== null) {
    if (match[1]) {
      markers.push(match[1]);
    }
  }

  return markers;
}

/**
 * Identify stale comments that should be resolved
 *
 * A comment is considered "stale" if its fingerprint doesn't match any current
 * finding within the proximity threshold. This means either:
 * - The issue was fixed
 * - The code was removed entirely
 *
 * @param existingDedupeKeys Dedupe keys from existing comments
 * @param currentFindings Current findings from this analysis run
 * @returns Array of dedupe keys for comments that should be resolved
 */
export function identifyStaleComments(
  existingDedupeKeys: string[],
  currentFindings: Finding[]
): string[] {
  // Build a proximity map from current findings
  const currentProximityMap = new Map<string, number[]>();
  for (const finding of currentFindings) {
    const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
    const proximityKey = `${fingerprint}:${finding.file}`;
    const existing = currentProximityMap.get(proximityKey) ?? [];
    existing.push(finding.line ?? 0);
    currentProximityMap.set(proximityKey, existing);
  }

  const staleKeys: string[] = [];

  for (const existingKey of existingDedupeKeys) {
    const parsed = parseDedupeKey(existingKey);
    if (!parsed) continue;

    const proximityKey = `${parsed.fingerprint}:${parsed.file}`;
    const currentLines = currentProximityMap.get(proximityKey);

    // If no current findings match this fingerprint+file, it's stale
    if (!currentLines || currentLines.length === 0) {
      staleKeys.push(existingKey);
      continue;
    }

    // Check if any current finding is within proximity threshold
    let hasProximityMatch = false;
    for (const currentLine of currentLines) {
      if (Math.abs(currentLine - parsed.line) <= LINE_PROXIMITY_THRESHOLD) {
        hasProximityMatch = true;
        break;
      }
    }

    // If no proximity match, the old comment is stale
    // (the issue either moved far away or was fixed)
    if (!hasProximityMatch) {
      staleKeys.push(existingKey);
    }
  }

  return staleKeys;
}

/**
 * Skipped agent info for status reporting
 */
export interface SkippedAgent {
  id: string;
  name: string;
  reason: string;
}

/**
 * Generate agent status table for GitHub summary
 *
 * Shows which agents ran, which were skipped, and why.
 * Per user requirements: "Agent Status table: ran / skipped (reason) / failed (reason)"
 */
export function generateAgentStatusTable(
  results: { agentId: string; success: boolean; findings: unknown[]; error?: string }[],
  skipped: SkippedAgent[]
): string {
  const lines: string[] = [
    '',
    '## Agent Status',
    '',
    '| Agent | Status | Details |',
    '|-------|--------|---------|',
  ];

  // Add results for agents that ran
  for (const r of results) {
    const status = r.success ? '✅ Ran' : '❌ Failed';
    const details = r.success
      ? `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'}`
      : r.error || 'Unknown error';
    lines.push(`| ${r.agentId} | ${status} | ${details} |`);
  }

  // Add skipped agents
  for (const s of skipped) {
    lines.push(`| ${s.id} | ⏭️ Skipped | ${s.reason} |`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render partial findings section (FR-007)
 *
 * Partial findings from failed agents are rendered in a dedicated section
 * with clear provenance indicators. These findings are advisory and NOT used for gating.
 */
export function renderPartialFindingsSection(partialFindings: Finding[]): string {
  if (partialFindings.length === 0) {
    return '';
  }

  const counts = countBySeverity(partialFindings);
  const grouped = groupByFile(partialFindings);

  const lines: string[] = [
    '',
    '## ⚠️ Partial Findings (from failed agents)',
    '',
    '> **Note:** These findings are from agents that did not complete successfully.',
    '> They may be incomplete and are shown for informational purposes only.',
    '> **Partial findings do NOT affect gating decisions.**',
    '',
    `| Severity | Count |`,
    `|----------|-------|`,
    `| 🔴 Errors | ${counts.error} |`,
    `| 🟡 Warnings | ${counts.warning} |`,
    `| 🔵 Info | ${counts.info} |`,
    '',
  ];

  for (const [file, fileFindings] of grouped) {
    lines.push(`#### \`${file}\``);
    lines.push('');

    for (const finding of fileFindings) {
      const emoji =
        finding.severity === 'error' ? '🔴' : finding.severity === 'warning' ? '🟡' : '🔵';
      const lineInfo = finding.line ? ` (line ${finding.line})` : '';
      const agent = finding.sourceAgent ? ` [${finding.sourceAgent}]` : '';

      lines.push(`- ${emoji}${lineInfo}${agent}: ${finding.message}`);

      if (finding.suggestion) {
        lines.push(`  - 💡 Suggestion: ${finding.suggestion}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate complete summary markdown with agent status table
 *
 * (012-fix-agent-result-regressions) - Updated to include partial findings section
 */
export function generateFullSummaryMarkdown(
  findings: Finding[],
  partialFindings: Finding[],
  results: { agentId: string; success: boolean; findings: unknown[]; error?: string }[],
  skipped: SkippedAgent[]
): string {
  // Start with the findings summary (complete findings)
  let summary = generateSummaryMarkdown(findings);

  // Add partial findings section if any exist
  summary += renderPartialFindingsSection(partialFindings);

  // Append agent status table
  summary += generateAgentStatusTable(results, skipped);

  return summary;
}
