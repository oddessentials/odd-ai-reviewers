/**
 * Finding Formats Module
 * Normalizes findings from different agents into a unified format
 */

import type { Finding, Severity } from '../agents/index.js';

/**
 * Deduplicate findings by file, line, and message
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  const unique: Finding[] = [];

  for (const finding of findings) {
    const key = `${finding.file}:${finding.line ?? 0}:${finding.message}`;
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
