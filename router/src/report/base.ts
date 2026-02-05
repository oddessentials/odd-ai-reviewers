/**
 * Base Reporter Utilities
 *
 * Shared utilities for both GitHub and ADO reporters.
 * Extracted to eliminate duplication.
 */

import type { Finding } from '../agents/types.js';
import { buildFingerprintMarker } from './formats.js';
import { getAgentIcon } from './agent-icons.js';

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
  const agentIcon = getAgentIcon(finding.sourceAgent);
  const lines = [`${emoji} ${agentIcon}: ${finding.message}`];

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
 * Format grouped findings as a single inline comment
 */
export function formatGroupedInlineComment(findings: (Finding & { line: number })[]): string {
  const lines: string[] = [`**Multiple issues found in this area (${findings.length}):**\n`];

  for (const finding of findings) {
    const emoji = getSeverityEmoji(finding.severity);
    const agentIcon = getAgentIcon(finding.sourceAgent);
    lines.push(`${emoji} **Line ${finding.line}** ${agentIcon}: ${finding.message}`);

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

/**
 * Group adjacent findings (within 3 lines in the same file)
 */
export function groupAdjacentFindings(
  findings: (Finding & { line: number })[]
): ((Finding & { line: number }) | (Finding & { line: number })[])[] {
  if (findings.length === 0) return [];

  const result: ((Finding & { line: number }) | (Finding & { line: number })[])[] = [];
  const firstFinding = findings[0];
  if (!firstFinding) return [];

  let currentGroup: (Finding & { line: number })[] = [firstFinding];

  for (let i = 1; i < findings.length; i++) {
    const prev = currentGroup[currentGroup.length - 1];
    const curr = findings[i];

    if (!prev || !curr) continue;

    // Group if same file and within 3 lines
    if (prev.file === curr.file && Math.abs(curr.line - prev.line) <= 3) {
      currentGroup.push(curr);
    } else {
      // Finish current group
      const firstInGroup = currentGroup[0];
      if (firstInGroup) {
        result.push(currentGroup.length === 1 ? firstInGroup : currentGroup);
      }
      currentGroup = [curr];
    }
  }

  // Don't forget the last group
  const firstInGroup = currentGroup[0];
  if (firstInGroup) {
    result.push(currentGroup.length === 1 ? firstInGroup : currentGroup);
  }

  return result;
}
