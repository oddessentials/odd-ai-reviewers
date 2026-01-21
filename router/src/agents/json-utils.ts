/**
 * JSON Utilities for LLM Response Parsing
 *
 * LLMs (especially Claude) often wrap JSON responses in markdown code fences.
 * This module provides surgical utilities to handle this without hiding errors.
 */

/**
 * Strip leading/trailing markdown code fences from text.
 *
 * SURGICAL: Only removes fences at the very start and end of the text.
 * Does NOT modify inner content or embedded code blocks.
 *
 * Handles:
 * - ```json ... ```
 * - ``` ... ```
 * - Raw JSON (no fences)
 *
 * @param text - Raw text from LLM response
 * @returns Text with leading/trailing fences removed
 */
export function stripJsonCodeFences(text: string): string {
  const trimmed = text.trim();

  // Check for opening fence at the very start
  const openingFenceMatch = trimmed.match(/^```(?:json)?\s*\n?/);
  if (!openingFenceMatch) {
    // No opening fence - return as-is
    return trimmed;
  }

  // Check for closing fence at the very end
  const closingFenceMatch = trimmed.match(/\n?```\s*$/);
  if (!closingFenceMatch) {
    // Opening fence but no closing fence - malformed, return as-is
    return trimmed;
  }

  // Extract content between fences
  const startIndex = openingFenceMatch[0].length;
  const endIndex = trimmed.length - closingFenceMatch[0].length;

  return trimmed.slice(startIndex, endIndex).trim();
}

/**
 * Parse JSON from LLM response, handling code fences.
 *
 * Strips fences first, then parses. On parse failure, throws with
 * descriptive error including raw content preview for debugging.
 *
 * @param text - Raw text from LLM response
 * @param context - Context for error message (e.g., "Anthropic", "OpenAI")
 * @returns Parsed JSON value
 * @throws Error with descriptive message if parsing fails
 */
export function parseJsonResponse(text: string, context: string): unknown {
  const cleaned = stripJsonCodeFences(text);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Include raw content preview for debugging
    const preview = cleaned.slice(0, 200).replace(/\n/g, '\\n');
    throw new Error(`Failed to parse ${context} response as JSON: "${preview}..."`);
  }
}
