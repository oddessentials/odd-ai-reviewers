/**
 * Strip zero-width and invisible Unicode characters that can bypass word-boundary regex matching.
 * Only strips invisible characters; visible non-Latin characters are preserved.
 *
 * Characters stripped: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+200E (LRM),
 * U+200F (RLM), U+2028 (Line Sep), U+2029 (Para Sep), U+FEFF (BOM/ZWNBS)
 */
export function normalizeUnicode(text: string): string {
  return text.replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, '');
}
