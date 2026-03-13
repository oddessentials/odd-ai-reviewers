/**
 * Framework Pattern Filter (FR-013)
 *
 * Deterministic post-processing filter that catches Pattern B false positives
 * using a closed, default-deny matcher table. Runs in Stage 1 validation
 * (after self-contradiction filter, before Stage 2 diff-bound validation).
 *
 * The matcher table is CLOSED: only these 5 matchers exist.
 * Adding a new matcher requires a spec amendment.
 */

import type { Finding } from '../agents/types.js';

// =============================================================================
// Types
// =============================================================================

export interface FrameworkPatternMatcher {
  /** Unique matcher identifier */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Regex that triggers evaluation when matched against finding.message */
  readonly messagePattern: RegExp;
  /**
   * Validates structural evidence in diff content.
   * Returns true if evidence confirms the framework pattern (suppress finding).
   * Returns false if evidence is missing or ambiguous (pass finding through).
   */
  evidenceValidator: (finding: Finding, diffContent: string) => boolean;
  /** Diagnostic reason logged when finding is suppressed */
  readonly suppressionReason: string;
}

export interface FrameworkFilterResult {
  finding: Finding;
  suppressed: boolean;
  matcherId?: string;
  reason?: string;
}

export interface FrameworkFilterSummary {
  total: number;
  suppressed: number;
  passed: number;
  results: FrameworkFilterResult[];
}

// =============================================================================
// Evidence Helpers
// =============================================================================

/**
 * Extract lines near a finding's line from diff content, scoped to the finding's file.
 * Returns the relevant file's diff section for evidence scanning.
 */
function extractFileDiffSection(finding: Finding, diffContent: string): string {
  if (!finding.file || !diffContent) return '';

  // Normalize Windows backslashes to forward slashes for diff header matching
  const normalizedPath = finding.file.replace(/\\/g, '/');

  // Split diff by file boundaries
  const fileSections = diffContent.split(/^diff --git /m);
  for (const section of fileSections) {
    // Match against the finding's file path (check both a/ and b/ paths)
    if (
      section.includes(`a/${normalizedPath} `) ||
      section.includes(`b/${normalizedPath}`) ||
      section.includes(`a/${normalizedPath}\n`) ||
      section.includes(`b/${normalizedPath}\n`)
    ) {
      return section;
    }
  }
  return '';
}

/**
 * Extract lines near a specific line number from a diff section.
 * Returns lines within a window around the target line.
 */
function extractLinesNearFinding(
  diffSection: string,
  findingLine: number | undefined,
  windowSize = 10
): string[] {
  if (findingLine === undefined) return diffSection.split('\n');

  const lines = diffSection.split('\n');
  const result: string[] = [];
  let currentLine = 0;

  for (const line of lines) {
    // Track line numbers from hunk headers
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunkMatch?.[1]) {
      currentLine = parseInt(hunkMatch[1], 10) - 1;
      continue;
    }

    if (line.startsWith('-')) continue; // Skip removed lines

    currentLine++;

    if (currentLine >= findingLine - windowSize && currentLine <= findingLine + windowSize) {
      // Strip diff prefix for content analysis
      const content = line.startsWith('+')
        ? line.slice(1)
        : line.startsWith(' ')
          ? line.slice(1)
          : line;
      result.push(content);
    }
  }

  return result;
}

// =============================================================================
// Closed Matcher Table — DEFAULT DENY
// Only these 5 matchers. No additions without spec change.
// =============================================================================

const FRAMEWORK_MATCHERS: readonly FrameworkPatternMatcher[] = [
  // T019: Express Error Middleware
  {
    id: 'express-error-mw',
    name: 'Express Error Middleware',
    messagePattern: /unused.*param/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const fileSection = extractFileDiffSection(finding, diffContent);
      if (!fileSection) return false;

      // Must have a 4-parameter function near the finding line
      // Express error middleware signature: (err, req, res, next) or variants
      const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 5);
      const nearbyText = nearbyLines.join('\n');

      // Match 4-param function: (param1, param2, param3, param4) with optional type annotations
      const fourParamPattern =
        /\(\s*\w+\s*(?::\s*[^,)]+)?\s*,\s*\w+\s*(?::\s*[^,)]+)?\s*,\s*\w+\s*(?::\s*[^,)]+)?\s*,\s*\w+\s*(?::\s*[^,)]+)?\s*\)/;
      const hasFourParams = fourParamPattern.test(nearbyText);
      if (!hasFourParams) return false;

      // At least one Express indicator required (in the file section):
      // - .use() middleware registration call
      // - import from 'express' package
      // - Express type annotations (Request, Response, NextFunction, ErrorRequestHandler)
      const hasUseCall = /\.use\s*\(/.test(fileSection);
      const hasExpressImport = /from\s+['"]express['"]/.test(fileSection);
      const hasExpressTypes = /:\s*(?:Request|Response|NextFunction|ErrorRequestHandler)\b/.test(
        nearbyText
      );

      return hasUseCall || hasExpressImport || hasExpressTypes;
    },
    suppressionReason: 'Express 4-param error middleware — unused params required by framework',
  },

  // T020: TypeScript Unused Prefix
  {
    id: 'ts-unused-prefix',
    name: 'TypeScript Unused Prefix',
    messagePattern: /unused.*(variable|parameter|binding|import)/i,
    evidenceValidator(finding: Finding, _diffContent: string): boolean {
      // Extract identifier names from the finding message.
      // Look for words that could be binding names (alphanumeric + underscore).
      // Confirm at least one is underscore-prefixed (the TS convention).
      const words = finding.message.match(/\b(\w+)\b/g);
      if (!words) return false;

      // The binding name must start with underscore and have at least one more char
      return words.some((word) => /^_\w+$/.test(word));
    },
    suppressionReason: 'TypeScript _prefix convention for intentionally unused bindings',
  },

  // T021: Exhaustive Switch
  {
    id: 'exhaustive-switch',
    name: 'Exhaustive Switch',
    messagePattern: /missing.*case|unhandled.*case|default.*unreachable/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const fileSection = extractFileDiffSection(finding, diffContent);
      if (!fileSection) return false;

      // Scan near finding line for assertNever( or exhaustive throw
      const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 8);
      const nearbyText = nearbyLines.join('\n');

      const hasAssertNever = /assertNever\s*\(/.test(nearbyText);
      const hasExhaustiveThrow =
        /throw\s+new\s+\w*[Ee]rror\s*\(\s*['"`].*(?:exhaustive|unreachable|unexpected)/i.test(
          nearbyText
        );

      return hasAssertNever || hasExhaustiveThrow;
    },
    suppressionReason:
      'Exhaustive switch with assertNever/throw — all cases handled at compile time',
  },

  // T022: React Query Deduplication
  {
    id: 'react-query-dedup',
    name: 'React Query Dedup',
    messagePattern: /duplicate|double.?fetch|redundant.*query|multiple.*useQuery/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const fileSection = extractFileDiffSection(finding, diffContent);
      if (!fileSection) return false;

      // Evidence 1: Query library import in file section
      const hasQueryImport =
        /from\s+['"]@tanstack\/react-query['"]/.test(fileSection) ||
        /from\s+['"]swr['"]/.test(fileSection) ||
        /from\s+['"]@apollo\/client['"]/.test(fileSection);
      if (!hasQueryImport) return false;

      // Evidence 2: Query hook call near the finding line
      const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
      const nearbyText = nearbyLines.join('\n');
      const hasQueryHook = /\b(useQuery|useSWR|useInfiniteQuery)\s*\(/.test(nearbyText);
      if (!hasQueryHook) return false;

      // Evidence 3: Exclude raw HTTP findings (not about library dedup)
      if (/api\s*call|http\s*request|\bfetch\s*\(/.test(finding.message.toLowerCase())) {
        return false;
      }

      return true;
    },
    suppressionReason: 'Query library deduplicates by cache key — not double-fetching',
  },

  // T023: Promise.allSettled Order Preservation
  {
    id: 'promise-allsettled-order',
    name: 'Promise.allSettled Order',
    messagePattern:
      /allSettled.*(?:order|sequence)|(?:order|sequence).*allSettled|allSettled.*results.*not.*(?:match|correspond|align)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const fileSection = extractFileDiffSection(finding, diffContent);
      if (!fileSection) return false;

      // Evidence 1: Promise.allSettled call near the finding line (not just file-wide)
      const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
      const nearbyText = nearbyLines.join('\n');
      if (!/Promise\.allSettled\s*\(/.test(nearbyText)) return false;

      // Evidence 2: Result iteration (indexed or sequential access)
      const hasResultAccess = /\.\s*forEach|\.map\s*\(|\[(\w+|\d+)\]|for\s*\(.*\s+of\s/.test(
        nearbyText
      );
      if (!hasResultAccess) return false;

      return true;
    },
    suppressionReason: 'Promise.allSettled preserves input order per ECMAScript spec',
  },
] as const;

// =============================================================================
// Public API
// =============================================================================

/**
 * Evaluate findings against the closed matcher table.
 * Default-deny: only exact matches with validated evidence are suppressed.
 *
 * @param findings - Findings that passed Stage 1 semantic validation
 * @param diffContent - Raw diff content for evidence validation
 * @returns Summary with suppressed/passed findings and diagnostic details
 */
export function filterFrameworkConventionFindings(
  findings: Finding[],
  diffContent: string
): FrameworkFilterSummary {
  const results: FrameworkFilterResult[] = [];
  let suppressed = 0;

  for (const finding of findings) {
    let matched = false;

    for (const matcher of FRAMEWORK_MATCHERS) {
      // Step 1: Does the message pattern match?
      if (!matcher.messagePattern.test(finding.message)) continue;

      // Step 2: Does structural evidence confirm the pattern?
      if (matcher.evidenceValidator(finding, diffContent)) {
        results.push({
          finding,
          suppressed: true,
          matcherId: matcher.id,
          reason: matcher.suppressionReason,
        });
        suppressed++;
        matched = true;
        console.log(
          `[router] [framework-filter] Suppressed: ${matcher.id} — ${finding.file}:${finding.line ?? '?'} — ${matcher.suppressionReason}`
        );
        break; // First matching matcher wins
      }
    }

    if (!matched) {
      results.push({ finding, suppressed: false });
    }
  }

  return {
    total: findings.length,
    suppressed,
    passed: findings.length - suppressed,
    results,
  };
}

/**
 * Get the list of valid findings (non-suppressed) from a filter summary.
 */
export function getValidFindings(summary: FrameworkFilterSummary): Finding[] {
  return summary.results.filter((r) => !r.suppressed).map((r) => r.finding);
}
