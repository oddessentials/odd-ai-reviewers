/**
 * Finding Sanitization Module
 *
 * Defense-in-depth protection for findings posted to GitHub/ADO.
 * Sanitizes message content before posting as PR comments.
 *
 * SECURITY: GitHub/ADO also sanitize on their end, but we add our own
 * layer to prevent injection attacks from malicious agent output.
 */

import type { Finding } from '../agents/types.js';

/** Maximum length for finding messages */
const MAX_MESSAGE_LENGTH = 4000;

/** Maximum length for suggestions */
const MAX_SUGGESTION_LENGTH = 2000;

/** Maximum length for rule IDs */
const MAX_RULE_ID_LENGTH = 200;

/**
 * Sanitize a single finding before posting to GitHub/ADO.
 *
 * Operations:
 * 1. Truncate long content
 * 2. Remove null bytes
 * 3. Escape HTML entities (defense-in-depth)
 *
 * @param finding - The raw finding from an agent
 * @returns Sanitized finding safe for posting
 */
export function sanitizeFinding(finding: Finding): Finding {
  return {
    ...finding,
    message: sanitizeText(finding.message, MAX_MESSAGE_LENGTH),
    suggestion: finding.suggestion
      ? sanitizeText(finding.suggestion, MAX_SUGGESTION_LENGTH)
      : undefined,
    ruleId: finding.ruleId ? sanitizeText(finding.ruleId, MAX_RULE_ID_LENGTH) : undefined,
    // file path is already validated by assertSafePath in agents
    // line numbers are just numbers, no sanitization needed
  };
}

/**
 * Sanitize an array of findings.
 *
 * @param findings - Array of raw findings
 * @returns Array of sanitized findings
 */
export function sanitizeFindings(findings: Finding[]): Finding[] {
  return findings.map(sanitizeFinding);
}

/**
 * Sanitize text content for safe posting.
 *
 * @param text - Raw text to sanitize
 * @param maxLength - Maximum allowed length
 * @returns Sanitized text
 */
function sanitizeText(text: string, maxLength: number): string {
  // Handle empty/undefined
  if (!text) return '';

  let sanitized = text;

  // 1. Remove null bytes (prevent injection)
  sanitized = sanitized.replace(/\0/g, '');

  // 2. Truncate to max length (before escaping to ensure we don't cut entities)
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength - 3) + '...';
  }

  // 3. Escape HTML entities (defense-in-depth, platforms also sanitize)
  // Only escape the dangerous chars that could enable XSS
  sanitized = sanitized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return sanitized;
}
