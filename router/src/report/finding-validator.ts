/**
 * Finding Validator Module
 *
 * Post-processing validation for findings before they are posted to platforms.
 * Implements FR-011 (line validation), FR-012 (classification), FR-013 (self-contradiction),
 * and FR-014 (validation summary).
 */

import type { Finding } from '../agents/types.js';
import type { DiffFile } from '../diff.js';
import { canonicalizeDiffFiles } from '../diff.js';
import {
  buildLineResolver,
  normalizeFindingsForDiff,
  computeDriftSignal,
  computeInlineDriftSignal,
  type ValidationStats,
  type InvalidLineDetail,
  type DriftSignal,
} from './line-resolver.js';

export type FindingClassification = 'inline' | 'file-level' | 'global' | 'cross-file';

export interface FindingValidationResult {
  finding: Finding;
  classification: FindingClassification;
  valid: boolean;
  filterReason?: string;
  filterType?:
    | 'invalid_line'
    | 'self_contradicting'
    | 'cautionary_advice'
    | 'pr_intent_contradiction';
}

export interface FindingValidationSummary {
  validFindings: Finding[];
  filtered: FindingValidationResult[];
  stats: {
    total: number;
    valid: number;
    filteredByLine: number;
    filteredBySelfContradiction: number;
    filteredByCautionaryAdvice: number;
    filteredByPRIntent: number;
    byClassification: Record<FindingClassification, number>;
  };
}

/**
 * Interface for validating line numbers against diff content.
 * Compatible with the LineResolver from line-resolver.ts but simplified
 * to the minimal interface needed for finding validation.
 */
interface FindingLineResolver {
  validateLine(
    file: string,
    line: number | undefined,
    options?: { suggestNearest?: boolean }
  ): { valid: boolean };
}

/**
 * Patterns that indicate a finding is self-dismissing.
 * When combined with info severity and no actionable suggestion,
 * the finding is likely a false positive.
 */
/**
 * Strip zero-width and invisible Unicode characters that can bypass word-boundary regex matching.
 * Only strips invisible characters — visible non-Latin characters are preserved.
 *
 * Characters stripped: U+200B (ZWSP), U+200C (ZWNJ), U+200D (ZWJ), U+200E (LRM),
 * U+200F (RLM), U+2028 (Line Sep), U+2029 (Para Sep), U+FEFF (BOM/ZWNBS)
 */
export function normalizeUnicode(text: string): string {
  return text.replace(/[\u200B-\u200F\u2028\u2029\uFEFF]/g, '');
}

/**
 * Patterns that indicate a finding is self-dismissing.
 *
 * IMPORTANT: Pattern match alone NEVER suppresses a finding.
 * All three gates must pass for suppression:
 *   1. Finding severity must be 'info' (NEVER warning/error)
 *   2. Finding message must match one of these patterns
 *   3. Finding must have NO actionable suggestion in residual text
 *
 * This three-gate architecture is a deliberate security boundary.
 * Do NOT relax any gate without a spec amendment.
 */
const DISMISSIVE_PATTERNS: RegExp[] = [
  /\bno action required\b/i,
  /\bacceptable as[- ]is\b/i,
  /\bnot blocking\b/i,
  /\bno change needed\b/i,
  /\bcan be ignored\b/i,
  /\bworking as intended\b/i,
  /\bno issues found\b/i,
  /\bnon-critical\b/i,
  /\blow priority\b/i,
];

/**
 * Patterns that indicate a finding is cautionary hedging advice
 * rather than identifying an actual defect. Common in gpt-4o outputs
 * where the model flags code as "ensure X is properly set" or
 * "consider Y to prevent potential issues" without a concrete bug.
 *
 * Suppression requires ALL gates:
 *   1. Finding severity must be 'info'
 *   2. Combined message+suggestion must match one of these patterns
 *   3. Combined text must NOT contain security-related terms
 */
const CAUTIONARY_ADVICE_PATTERNS: RegExp[] = [
  // "Ensure/Verify/Make sure (that) X is properly/correctly Y"
  /\b(?:ensure|verify|make\s+sure|double[- ]?check)\s+(?:that\b|the\b|all\b)/i,
  // "Consider X to prevent non-obvious/potential/unexpected issues"
  /\bconsider\b.*\b(?:to\s+prevent|to\s+avoid|for\s+safety)\b/i,
];

/**
 * Security-related terms that BLOCK cautionary advice suppression.
 * If the combined message+suggestion contains any of these, the finding
 * is treated as a legitimate concern, not hedging advice.
 */
const SECURITY_BLOCKLIST =
  /\b(?:sql|injection|xss|cross.?site|sanitiz|escap|authenti|authoriz|csrf|ssrf|path.?traversal|command.?inject|exec\s*\(|eval\s*\(|deseria|privilege|encrypt|password|credential|secret|vulnerab|exploit|attack|malicious|buffer.?overflow|bypass)\b/i;

/**
 * Check if a suggestion is actionable (contains concrete guidance beyond dismissive language).
 */
function hasActionableSuggestion(suggestion: string | undefined): boolean {
  if (!suggestion || suggestion.trim().length === 0) {
    return false;
  }

  const trimmed = suggestion.trim();
  const dismissiveFragments = DISMISSIVE_PATTERNS.map(
    (pattern) => pattern.exec(trimmed)?.[0] ?? ''
  ).filter((fragment) => fragment.length > 0);

  if (dismissiveFragments.length === 0) {
    return true;
  }

  const residual = dismissiveFragments
    .reduce((remaining, fragment) => remaining.replace(fragment, ' '), trimmed)
    .replace(/[.,;:()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return residual.length > 0;
}

/**
 * Regex to extract action signals from PR title/description.
 * Captures a verb (add, fix, remove, rename, update, refactor) followed by a subject.
 */
const PR_INTENT_PATTERN = /\b(add|fix|remove|rename|update|refactor)\s+(.+)/i;

/**
 * Categories eligible for PR intent suppression.
 * Security, logic, error-handling, performance, and api-misuse are NEVER eligible.
 */
const PR_INTENT_ELIGIBLE_CATEGORIES = new Set([
  'documentation',
  'style',
  'cosmetic',
  'refactoring',
]);

/**
 * Exact contradiction pairs for PR intent suppression.
 * Maps PR verb → finding verbs that indicate contradiction.
 */
const PR_INTENT_CONTRADICTION_PAIRS: Record<string, string[]> = {
  add: ['remove', 'delete'],
  remove: ['add', 'missing'],
  rename: ['revert', 'original name'],
  refactor: ['revert', 'undo'],
};

/**
 * FR-112: PR intent contradiction filter.
 *
 * Filters info-severity findings in eligible categories whose message
 * contradicts the PR description's stated intent. Uses exact contradiction
 * pairs and subject match requirements.
 *
 * @param findings - Array of findings to check against PR intent
 * @param prDescription - Combined PR title and description text
 * @param prIntentSuppression - Kill switch (default: true = enabled)
 * @returns Array of findings that were NOT filtered (surviving findings)
 */
export function filterPRIntentContradictions(
  findings: Finding[],
  prDescription: string,
  prIntentSuppression = true
): { surviving: Finding[]; filtered: FindingValidationResult[] } {
  const filtered: FindingValidationResult[] = [];

  if (!prIntentSuppression) {
    return { surviving: [...findings], filtered: [] };
  }

  const match = PR_INTENT_PATTERN.exec(prDescription);
  if (!match) {
    return { surviving: [...findings], filtered: [] };
  }

  const verb = (match[1] ?? '').toLowerCase();
  const subject = (match[2] ?? '').toLowerCase().trim();
  const contradictionVerbs = PR_INTENT_CONTRADICTION_PAIRS[verb];

  if (!contradictionVerbs) {
    return { surviving: [...findings], filtered: [] };
  }

  const surviving: Finding[] = [];

  for (const finding of findings) {
    // Gate 1: Only info severity
    if (finding.severity !== 'info') {
      surviving.push(finding);
      continue;
    }

    // Gate 2: Only eligible categories (category is parsed from ruleId, e.g. "semantic/documentation")
    let category = '';
    if (finding.ruleId) {
      const ruleMatch = finding.ruleId.match(/^([^/]+)\/(.+)$/);
      if (ruleMatch?.[2]) category = ruleMatch[2].toLowerCase();
    }
    if (!PR_INTENT_ELIGIBLE_CATEGORIES.has(category)) {
      surviving.push(finding);
      continue;
    }

    const messageLower = finding.message.toLowerCase();

    // Gate 3: Subject match — finding must reference same file or code construct
    const subjectWords = subject.split(/\s+/).filter((w) => w.length > 3);
    const hasSubjectMatch =
      subjectWords.some((word) => messageLower.includes(word)) ||
      (finding.file && subject.includes(finding.file.split('/').pop()?.toLowerCase() ?? ''));
    if (!hasSubjectMatch) {
      surviving.push(finding);
      continue;
    }

    // Gate 4: Contradiction verb present in finding message
    const hasContradiction = contradictionVerbs.some((opp) => messageLower.includes(opp));
    if (!hasContradiction) {
      surviving.push(finding);
      continue;
    }

    // All gates passed — suppress this finding
    console.log('[router] [finding-validator] [filtered:pr-intent]', {
      file: finding.file,
      severity: finding.severity,
      category,
      prVerb: verb,
      subject: subject.slice(0, 60),
      contradictionVerb: contradictionVerbs.find((opp) => messageLower.includes(opp)),
      findingMessage: finding.message.slice(0, 120),
    });

    filtered.push({
      finding,
      classification: finding.file
        ? finding.line !== undefined
          ? 'inline'
          : 'file-level'
        : 'global',
      valid: false,
      filterReason: `PR intent contradiction: PR says "${verb} ${subject.slice(0, 40)}" but finding suggests opposite`,
      filterType: 'pr_intent_contradiction',
    });
  }

  return { surviving, filtered };
}

/**
 * Stage 1: Semantic-only validation (no lineResolver needed).
 *
 * Performs ONLY normalization-independent checks:
 * - Classification (inline / file-level / global / cross-file)
 * - Self-contradiction detection (info severity + dismissive language + no suggestion)
 * - PR intent contradiction logging (FR-014, diagnostic only)
 * - NO line validation, NO path validation against diff
 *
 * Used in processFindings() BEFORE platform reporters run normalizeFindingsForDiff().
 * This ensures renamed-file and stale-line findings survive to be salvaged by normalization.
 *
 * @param findings - Array of findings to validate
 * @param prDescription - Optional PR title/description for intent contradiction logging
 * @returns Validation summary with valid findings, filtered findings, and stats
 */
export function validateFindingsSemantics(
  findings: Finding[],
  prDescription?: string
): FindingValidationSummary {
  const results: FindingValidationResult[] = [];
  const stats = {
    total: findings.length,
    valid: 0,
    filteredByLine: 0,
    filteredBySelfContradiction: 0,
    filteredByCautionaryAdvice: 0,
    filteredByPRIntent: 0,
    byClassification: {
      inline: 0,
      'file-level': 0,
      global: 0,
      'cross-file': 0,
    } as Record<FindingClassification, number>,
  };

  // Pass 1: Classify each finding (no diff file set — classification is best-effort)
  for (const finding of findings) {
    let classification: FindingClassification;

    if (!finding.file) {
      classification = 'global';
    } else if (finding.line === undefined) {
      classification = 'file-level';
    } else {
      classification = 'inline';
    }

    stats.byClassification[classification]++;

    results.push({
      finding,
      classification,
      valid: true,
    });
  }

  // Pass 2 (line validation): SKIPPED — deferred to Stage 2 after normalization

  // Pass 3: Self-contradiction detection
  for (const result of results) {
    if (!result.valid) continue;

    // Only filter info severity - NEVER filter warning/error
    if (result.finding.severity !== 'info') continue;

    // FR-015: Normalize Unicode before matching to prevent zero-width character bypass
    const normalizedMessage = normalizeUnicode(result.finding.message);
    const matchedPattern = DISMISSIVE_PATTERNS.find((p) => p.test(normalizedMessage));
    if (!matchedPattern) continue;

    const normalizedSuggestion = result.finding.suggestion
      ? normalizeUnicode(result.finding.suggestion)
      : undefined;
    if (hasActionableSuggestion(normalizedSuggestion)) continue;

    // All 3 conditions met: info + dismissive + no actionable suggestion
    result.valid = false;
    result.filterReason = `Self-contradicting: info severity with dismissive language (${matchedPattern.source})`;
    result.filterType = 'self_contradicting';
    stats.filteredBySelfContradiction++;
    console.log('[router] [finding-validator] [filtered:semantic]', {
      file: result.finding.file,
      line: result.finding.line,
      reason: result.filterReason,
    });
  }

  // Pass 3.5: Cautionary advice detection
  // Catches info-severity findings where the LLM hedges with "ensure/verify/consider"
  // without identifying a concrete defect. Blocked for security-related findings.
  for (const result of results) {
    if (!result.valid) continue;

    // Gate 1: Only info severity — NEVER filter warning/error
    if (result.finding.severity !== 'info') continue;

    const combinedText = normalizeUnicode(
      result.finding.message + ' ' + (result.finding.suggestion ?? '')
    );

    // Gate 2: Must match a cautionary advice pattern
    const matchedCautionary = CAUTIONARY_ADVICE_PATTERNS.find((p) => p.test(combinedText));
    if (!matchedCautionary) continue;

    // Gate 3: BLOCK suppression if security-related terms are present
    if (SECURITY_BLOCKLIST.test(combinedText)) continue;

    // All gates passed — suppress this cautionary advice finding
    result.valid = false;
    result.filterReason = `Cautionary advice: info severity with hedging language (${matchedCautionary.source}) and no security concern`;
    result.filterType = 'cautionary_advice';
    stats.filteredByCautionaryAdvice++;
    console.log('[router] [finding-validator] [filtered:cautionary]', {
      file: result.finding.file,
      line: result.finding.line,
      reason: result.filterReason,
    });
  }

  // Build final arrays
  let validFindings: Finding[] = [];
  const filtered: FindingValidationResult[] = [];

  for (const result of results) {
    if (result.valid) {
      validFindings.push(result.finding);
      stats.valid++;
    } else {
      filtered.push(result);
    }
  }

  // Pass 4: PR intent contradiction filter (FR-112, info severity + eligible category only)
  if (prDescription) {
    const prIntentResult = filterPRIntentContradictions(validFindings, prDescription);
    validFindings = prIntentResult.surviving;
    for (const f of prIntentResult.filtered) {
      filtered.push(f);
      stats.filteredByPRIntent++;
    }
  }

  return { validFindings, filtered, stats };
}

/**
 * Stage 2: Diff-bound validation (for use AFTER normalizeFindingsForDiff()).
 *
 * Performs line validation against normalized diff positions and path validation.
 * Runs only after normalization has had a chance to remap renamed paths and snap stale lines.
 *
 * @param findings - Array of findings (already normalized by normalizeFindingsForDiff)
 * @param lineResolver - Resolver for validating line numbers against diff
 * @param diffFiles - Array of file paths present in the diff
 * @returns Validation summary with valid findings, filtered findings, and stats
 */
export function validateNormalizedFindings(
  findings: Finding[],
  lineResolver: FindingLineResolver,
  diffFiles?: string[]
): FindingValidationSummary {
  const diffFileSet = new Set(diffFiles ?? []);
  const results: FindingValidationResult[] = [];
  const stats = {
    total: findings.length,
    valid: 0,
    filteredByLine: 0,
    filteredBySelfContradiction: 0,
    filteredByCautionaryAdvice: 0,
    filteredByPRIntent: 0,
    byClassification: {
      inline: 0,
      'file-level': 0,
      global: 0,
      'cross-file': 0,
    } as Record<FindingClassification, number>,
  };

  // Pass 1: Classify each finding
  for (const finding of findings) {
    let classification: FindingClassification;

    if (!finding.file) {
      classification = 'global';
    } else if (diffFileSet.size > 0 && !diffFileSet.has(finding.file)) {
      classification = 'cross-file';
      console.log(`[router] [finding-validator] cross-file finding for ${finding.file}`);
    } else if (finding.line === undefined) {
      classification = 'file-level';
    } else {
      classification = 'inline';
    }

    stats.byClassification[classification]++;

    results.push({
      finding,
      classification,
      valid: true,
    });
  }

  // Pass 2: Line validation (inline findings only)
  for (const result of results) {
    if (result.classification === 'inline' && result.finding.line !== undefined) {
      const validation = lineResolver.validateLine(result.finding.file, result.finding.line);
      if (!validation.valid) {
        result.valid = false;
        result.filterReason = `Line ${result.finding.line} not in diff range for ${result.finding.file}`;
        result.filterType = 'invalid_line';
        stats.filteredByLine++;
        console.log('[router] [finding-validator] [filtered:unplaceable]', {
          file: result.finding.file,
          line: result.finding.line,
          reason: result.filterReason,
        });
      }
    }
  }

  // Pass 3: Self-contradiction detection (all findings that passed Pass 2)
  for (const result of results) {
    if (!result.valid) continue;

    if (result.finding.severity !== 'info') continue;

    // FR-015: Normalize Unicode before matching to prevent zero-width character bypass
    const normalizedMessage = normalizeUnicode(result.finding.message);
    const matchedPattern = DISMISSIVE_PATTERNS.find((p) => p.test(normalizedMessage));
    if (!matchedPattern) continue;

    const normalizedSuggestion = result.finding.suggestion
      ? normalizeUnicode(result.finding.suggestion)
      : undefined;
    if (hasActionableSuggestion(normalizedSuggestion)) continue;

    result.valid = false;
    result.filterReason = `Self-contradicting: info severity with dismissive language (${matchedPattern.source})`;
    result.filterType = 'self_contradicting';
    stats.filteredBySelfContradiction++;
    console.log('[router] [finding-validator] [filtered:semantic]', {
      file: result.finding.file,
      line: result.finding.line,
      reason: result.filterReason,
    });
  }

  // Pass 3.5: Cautionary advice detection (same as in validateFindingsSemantics)
  for (const result of results) {
    if (!result.valid) continue;
    if (result.finding.severity !== 'info') continue;

    const combinedText = normalizeUnicode(
      result.finding.message + ' ' + (result.finding.suggestion ?? '')
    );

    const matchedCautionary = CAUTIONARY_ADVICE_PATTERNS.find((p) => p.test(combinedText));
    if (!matchedCautionary) continue;

    if (SECURITY_BLOCKLIST.test(combinedText)) continue;

    result.valid = false;
    result.filterReason = `Cautionary advice: info severity with hedging language (${matchedCautionary.source}) and no security concern`;
    result.filterType = 'cautionary_advice';
    stats.filteredByCautionaryAdvice++;
    console.log('[router] [finding-validator] [filtered:cautionary]', {
      file: result.finding.file,
      line: result.finding.line,
      reason: result.filterReason,
    });
  }

  // Build final arrays
  const validFindings: Finding[] = [];
  const filtered: FindingValidationResult[] = [];

  for (const result of results) {
    if (result.valid) {
      validFindings.push(result.finding);
      stats.valid++;
    } else {
      filtered.push(result);
    }
  }

  return { validFindings, filtered, stats };
}

/**
 * Full normalization + validation pipeline shared by platform reporters.
 *
 * Canonicalizes diff files, normalizes findings against the diff, runs Stage 2
 * validation, and computes drift signals. Both github.ts and ado.ts delegate
 * to this function to avoid duplicating the pipeline.
 */
export interface NormalizationPipelineResult {
  validatedFindings: Finding[];
  canonicalFiles: DiffFile[];
  driftSignal: DriftSignal;
  inlineDriftSignal: DriftSignal;
  normalizationStats: ValidationStats;
  invalidDetails: InvalidLineDetail[];
}

export function normalizeAndValidateFindings(
  findings: Finding[],
  diffFiles: DiffFile[],
  platform: string
): NormalizationPipelineResult {
  const canonicalFiles = canonicalizeDiffFiles(diffFiles);
  const lineResolver = buildLineResolver(canonicalFiles);
  const normalizationResult = normalizeFindingsForDiff(findings, lineResolver);

  if (normalizationResult.stats.dropped > 0 || normalizationResult.stats.normalized > 0) {
    console.log(
      `[${platform}] Line validation: ${normalizationResult.stats.valid} valid, ` +
        `${normalizationResult.stats.normalized} normalized, ${normalizationResult.stats.dropped} dropped`
    );
  }

  const diffFilePaths = canonicalFiles.map((f) => f.path);
  const stage2Result = validateNormalizedFindings(
    normalizationResult.findings,
    lineResolver,
    diffFilePaths
  );

  if (stage2Result.filtered.length > 0) {
    console.log(
      `[${platform}] Stage 2 validation: ${stage2Result.stats.valid} valid, ` +
        `${stage2Result.stats.filteredByLine} filtered by line, ` +
        `${stage2Result.stats.filteredBySelfContradiction} self-contradicting, ` +
        `${stage2Result.stats.filteredByCautionaryAdvice} cautionary advice`
    );
  }

  const driftSignal = computeDriftSignal(
    normalizationResult.stats,
    normalizationResult.invalidDetails
  );

  const inlineDriftSignal = computeInlineDriftSignal(
    normalizationResult.stats,
    normalizationResult.invalidDetails
  );

  return {
    validatedFindings: stage2Result.validFindings,
    canonicalFiles,
    driftSignal,
    inlineDriftSignal,
    normalizationStats: normalizationResult.stats,
    invalidDetails: normalizationResult.invalidDetails,
  };
}

/**
 * Validate and classify findings, filtering out invalid lines and self-contradicting findings.
 *
 * Three-pass validation:
 * 1. Classify each finding (inline, file-level, global, cross-file)
 * 2. Validate line numbers for inline findings
 * 3. Detect self-contradicting findings (info + dismissive + no suggestion)
 *
 * @deprecated Use validateFindingsSemantics() in processFindings and
 * validateNormalizedFindings() in platform reporters after normalization.
 * Kept for backward compatibility (benchmark adapter).
 *
 * @param findings - Array of findings to validate
 * @param lineResolver - Resolver for validating line numbers against diff
 * @param diffFiles - Array of file paths present in the diff
 * @returns Validation summary with valid findings, filtered findings, and stats
 */
export function validateFindings(
  findings: Finding[],
  lineResolver: FindingLineResolver,
  diffFiles?: string[]
): FindingValidationSummary {
  return validateNormalizedFindings(findings, lineResolver, diffFiles);
}
