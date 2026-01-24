/**
 * Base Reporter Utilities
 *
 * Shared utilities for both GitHub and ADO reporters.
 * Extracted to eliminate duplication.
 */

import type { Finding } from '../agents/types.js';
import { buildFingerprintMarker } from './formats.js';

/** Delay between inline comments to avoid spam (ms) */
export const INLINE_COMMENT_DELAY_MS = 100;

/**
 * Delay helper for rate limiting
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get severity emoji for a finding
 */
export function getSeverityEmoji(severity: 'error' | 'warning' | 'info'): string {
  if (severity === 'error') return '🔴';
  if (severity === 'warning') return '🟡';
  return '🔵';
}

/**
 * Format a finding as an inline comment
 * Used by both GitHub and ADO reporters
 */
export function formatInlineComment(finding: Finding): string {
  const emoji = getSeverityEmoji(finding.severity);
  const lines = [`${emoji} **${finding.sourceAgent}**: ${finding.message}`];

  if (finding.ruleId) {
    lines.push(`\n*Rule: \`${finding.ruleId}\`*`);
  }

  if (finding.suggestion) {
    lines.push(`\n💡 **Suggestion**: ${finding.suggestion}`);
  }

  lines.push(`\n\n${buildFingerprintMarker(finding)}`);

  return lines.join('');
}

/**
 * Format grouped findings as a single inline comment (GitHub-specific)
 * ADO doesn't support grouping currently
 */
export function formatGroupedInlineComment(findings: (Finding & { line: number })[]): string {
  const lines: string[] = [`**Multiple issues found in this area (${findings.length}):**\n`];

  for (const finding of findings) {
    const emoji = getSeverityEmoji(finding.severity);
    lines.push(`${emoji} **Line ${finding.line}** (${finding.sourceAgent}): ${finding.message}`);

    if (finding.suggestion) {
      lines.push(`   💡 ${finding.suggestion}`);
    }
    lines.push('');
  }

  for (const finding of findings) {
    lines.push(buildFingerprintMarker(finding));
  }

  return lines.join('\n').trim();
}
