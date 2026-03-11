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
  filterType?: 'invalid_line' | 'self_contradicting';
}

export interface FindingValidationSummary {
  validFindings: Finding[];
  filtered: FindingValidationResult[];
  stats: {
    total: number;
    valid: number;
    filteredByLine: number;
    filteredBySelfContradiction: number;
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
const DISMISSIVE_PATTERNS: RegExp[] = [
  /\bno action required\b/i,
  /\bacceptable as[- ]is\b/i,
  /\bnot blocking\b/i,
  /\bno change needed\b/i,
  /\bcan be ignored\b/i,
];

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
 * Stage 1: Semantic-only validation (no lineResolver needed).
 *
 * Performs ONLY normalization-independent checks:
 * - Classification (inline / file-level / global / cross-file)
 * - Self-contradiction detection (info severity + dismissive language + no suggestion)
 * - NO line validation, NO path validation against diff
 *
 * Used in processFindings() BEFORE platform reporters run normalizeFindingsForDiff().
 * This ensures renamed-file and stale-line findings survive to be salvaged by normalization.
 *
 * @param findings - Array of findings to validate
 * @returns Validation summary with valid findings, filtered findings, and stats
 */
export function validateFindingsSemantics(findings: Finding[]): FindingValidationSummary {
  const results: FindingValidationResult[] = [];
  const stats = {
    total: findings.length,
    valid: 0,
    filteredByLine: 0,
    filteredBySelfContradiction: 0,
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

    const matchedPattern = DISMISSIVE_PATTERNS.find((p) => p.test(result.finding.message));
    if (!matchedPattern) continue;

    if (hasActionableSuggestion(result.finding.suggestion)) continue;

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

    const matchedPattern = DISMISSIVE_PATTERNS.find((p) => p.test(result.finding.message));
    if (!matchedPattern) continue;

    if (hasActionableSuggestion(result.finding.suggestion)) continue;

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
        `${stage2Result.stats.filteredBySelfContradiction} self-contradicting`
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
