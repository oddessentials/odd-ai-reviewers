/**
 * Finding Formats Module
 * Normalizes findings from different agents into a unified format
 *
 * CONSOLIDATED.md Compliance:
 * - Fingerprint generation for stable deduplication
 * - Deduplication using fingerprint + path + start_line
 */

import { createHash } from 'crypto';
import type { Finding, Severity } from '../agents/index.js';

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
 * Generate complete summary markdown with agent status table
 */
export function generateFullSummaryMarkdown(
  findings: Finding[],
  results: { agentId: string; success: boolean; findings: unknown[]; error?: string }[],
  skipped: SkippedAgent[]
): string {
  // Start with the findings summary
  let summary = generateSummaryMarkdown(findings);

  // Append agent status table
  summary += generateAgentStatusTable(results, skipped);

  return summary;
}
