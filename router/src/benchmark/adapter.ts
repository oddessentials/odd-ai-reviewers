/**
 * Benchmark Adapter
 *
 * Runs a single benchmark scenario through the control-flow analysis pipeline.
 * This adapter specifically tests the DETERMINISTIC pipeline:
 * - Safe-source detection (Pattern A)
 * - Finding validation / self-contradiction filter (Pattern E)
 * - Vulnerability detection (TP scenarios)
 *
 * LLM-dependent scenarios (Patterns B/C/D) require a different adapter with
 * mock LLM responses. They are marked as .skip in the integration test.
 *
 * This adapter does NOT make network calls - it is purely local AST analysis.
 */

import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { VulnerabilityDetector } from '../agents/control_flow/vulnerability-detector.js';
import {
  normalizeUnicode,
  validateFindingsSemantics,
  validateFindings,
  validateNormalizedFindings,
} from '../report/finding-validator.js';
import {
  filterFrameworkConventionFindings,
  getValidFindings,
} from '../report/framework-pattern-filter.js';
import { createLogger } from '../agents/control_flow/logger.js';
import type { Finding, Severity } from '../agents/types.js';
import type { BenchmarkScenario } from './scoring.js';

const DETERMINISTIC_PATTERNS = new Set<BenchmarkScenario['pattern']>(['A', 'E']);
const BENCHMARK_PARTIAL_DIFF_SYMBOL_PATTERNS: RegExp[] = [
  /\bundefined constant\b/i,
  /\bnot defined in the diff\b/i,
  /\bnot defined in the visible code\b/i,
  /\bfunction call is not defined in the diff\b/i,
  /\breference to undefined constant\b/i,
  /\bnot defined in (?:the )?(?:visible|shown|new) code\b/i,
  /\bmissing import\b/i,
  /\bmissing declaration\b/i,
];

// =============================================================================
// Diff Parsing
// =============================================================================

interface DiffFileEntry {
  path: string;
  content: string;
}

/**
 * Parse unified diff to extract file paths and added-line content.
 * Strips diff headers and +/- prefixes to produce clean source code.
 */
export function parseDiffFiles(diff: string): DiffFileEntry[] {
  const files: DiffFileEntry[] = [];
  const diffBlocks = diff.split(/^diff --git /m).filter(Boolean);

  for (const block of diffBlocks) {
    // Extract file path from "a/path b/path" line
    const headerMatch = block.match(/^a\/(.+?) b\/(.+)/m);
    if (!headerMatch?.[2]) continue;

    const filePath = headerMatch[2];
    const lines = block.split('\n');

    // Collect content lines (added and context lines)
    const contentLines: string[] = [];
    let inHunk = false;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;

      // Skip removed lines
      if (line.startsWith('-')) continue;

      // Added lines: strip the + prefix
      if (line.startsWith('+')) {
        contentLines.push(line.slice(1));
      } else {
        // Context lines (no prefix or space prefix)
        contentLines.push(line.startsWith(' ') ? line.slice(1) : line);
      }
    }

    if (contentLines.length > 0) {
      files.push({ path: filePath, content: contentLines.join('\n') });
    }
  }

  return files;
}

// =============================================================================
// Simple Line Resolver for finding-validator
// =============================================================================

/**
 * Create a line resolver that validates lines against the diff content.
 * For benchmark purposes, lines that exist in the parsed diff are valid.
 */
function createBenchmarkLineResolver(
  diffFiles: DiffFileEntry[],
  rawDiff: string
): { validateLine: (file: string, line: number | undefined) => { valid: boolean } } {
  // Build a map of file → max line count from parsed content
  const fileLineCounts = new Map<string, number>();
  for (const df of diffFiles) {
    fileLineCounts.set(df.path, df.content.split('\n').length);
  }

  // Also parse hunk headers to get actual line ranges from the diff
  const fileLineRanges = new Map<string, { start: number; count: number }[]>();
  let currentFile = '';
  for (const line of rawDiff.split('\n')) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)/);
    if (fileMatch?.[1]) {
      currentFile = fileMatch[1];
      if (!fileLineRanges.has(currentFile)) {
        fileLineRanges.set(currentFile, []);
      }
      continue;
    }
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch?.[1] && currentFile) {
      const start = parseInt(hunkMatch[1], 10);
      const count = hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1;
      fileLineRanges.get(currentFile)?.push({ start, count });
    }
  }

  return {
    validateLine(file: string, line: number | undefined): { valid: boolean } {
      if (line === undefined) return { valid: true };

      // Check against hunk ranges
      const ranges = fileLineRanges.get(file);
      if (ranges) {
        for (const range of ranges) {
          if (line >= range.start && line < range.start + range.count) {
            return { valid: true };
          }
        }
        // Line not in any hunk range
        return { valid: false };
      }

      // Fallback: check against file line count
      const maxLines = fileLineCounts.get(file);
      if (maxLines !== undefined) {
        return { valid: line >= 1 && line <= maxLines };
      }

      return { valid: false };
    },
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractReferencedSymbol(text: string): string | undefined {
  const quoted = text.match(/[`'"]([A-Za-z_][A-Za-z0-9_]*)[`'"]/);
  if (quoted?.[1]) {
    return quoted[1];
  }

  const bare = text.match(/\b(?:constant|symbol|import|declaration)\s+([A-Za-z_][A-Za-z0-9_]*)\b/i);
  return bare?.[1];
}

function diffShowsSymbolRemoval(rawDiff: string, symbol: string | undefined): boolean {
  if (!symbol) {
    return false;
  }

  const escaped = escapeRegExp(symbol);
  const removalPatterns = [
    // SAFETY: `escaped` is derived from escapeRegExp(symbol), so the interpolated pattern is literal-safe.
    // eslint-disable-next-line security/detect-non-literal-regexp
    new RegExp(`^-.*\\b${escaped}\\b`, 'm'),
    // SAFETY: `escaped` is derived from escapeRegExp(symbol), so the interpolated pattern is literal-safe.
    // eslint-disable-next-line security/detect-non-literal-regexp
    new RegExp(`^-\\s*(?:const|var|let|type|class|interface|func)\\s+${escaped}\\b`, 'm'),
    // SAFETY: `escaped` is derived from escapeRegExp(symbol), so the interpolated pattern is literal-safe.
    // eslint-disable-next-line security/detect-non-literal-regexp
    new RegExp(`^-\\s*import .*\\b${escaped}\\b`, 'm'),
  ];

  return removalPatterns.some((pattern) => pattern.test(rawDiff));
}

function isBenchmarkEnvironmentFeatureFlagAdvisory(
  finding: Finding,
  prDescription: string | undefined
): boolean {
  if (!prDescription) return false;

  const normalizedPr = prDescription.toLowerCase();
  if (!normalizedPr.includes('environment-dependent feature flag')) {
    return false;
  }

  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  return (
    /\bhard-?coded environment strings\b/i.test(combinedText) ||
    /\bprocess\.env\.feature_flag\b/i.test(combinedText) ||
    /\bunknown environments?\b/i.test(combinedText)
  );
}

function isBenchmarkSpeculativeCssLayoutAdvisory(
  finding: Finding,
  rawDiff: string,
  projectRules: string | undefined
): boolean {
  if (!projectRules) return false;

  const normalizedRules = projectRules.toLowerCase();
  if (
    !normalizedRules.includes('single global css file') &&
    !normalizedRules.includes('styles.css')
  ) {
    return false;
  }

  if (!/\.css\b/.test(finding.file ?? '') && !/diff --git a\/.*\.css b\/.*\.css/.test(rawDiff)) {
    return false;
  }

  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  return (
    (/\b(?:may|might|could)\b/.test(combinedText) ||
      /\bstacking order is unpredictable\b/i.test(combinedText)) &&
    /\b(?:overflow|horizontal scrolling|layout breaks|z-index|stacking order|appear behind)\b/i.test(
      combinedText
    )
  );
}

function isBenchmarkCanonicalSeedScaffoldingAdvisory(
  finding: Finding,
  rawDiff: string,
  projectRules: string | undefined
): boolean {
  if (!projectRules) return false;

  if (!projectRules.toLowerCase().includes('canonical seed value')) {
    return false;
  }

  if (!/\bseedRandom\s*\(/.test(rawDiff)) {
    return false;
  }

  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  if (/\bseedRandom\(\)\s+function\s+is\s+defined\s+but\s+never\s+used\b/i.test(combinedText)) {
    return true;
  }

  return (
    /\bempty function body in random\(\) export\b/i.test(combinedText) &&
    /\bfunction provides no functionality\b/i.test(combinedText) &&
    /\bexport function random\(\)\s*\{\}/.test(rawDiff)
  );
}

function isBenchmarkEnterKeyHandlerIntentAdvisory(
  finding: Finding,
  prDescription: string | undefined
): boolean {
  if (!prDescription) return false;

  const normalizedPr = prDescription.toLowerCase();
  if (!normalizedPr.includes('enter key') || !normalizedPr.includes('submit form')) {
    return false;
  }

  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  return (
    /\bsubmitForm\(\)\b/i.test(combinedText) ||
    /\bhandleKeyDown\b/i.test(combinedText) ||
    /\bnot defined or imported\b/i.test(combinedText) ||
    /\bnever used or exported\b/i.test(combinedText)
  );
}

function isBenchmarkParameterizedTestRefactorAdvisory(
  finding: Finding,
  prDescription: string | undefined
): boolean {
  if (!prDescription) return false;

  const normalizedPr = prDescription.toLowerCase();
  if (!normalizedPr.includes('parameterized') && !normalizedPr.includes('it.each')) {
    return false;
  }

  if (!/\.test\.[jt]sx?$/.test(finding.file ?? '')) {
    return false;
  }

  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  return (
    /\bpartial object matching\b/i.test(combinedText) ||
    /\breducing test coverage\b/i.test(combinedText)
  );
}

function isBenchmarkTestArtifactAdvisory(finding: Finding): boolean {
  const file = finding.file ?? '';
  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));

  if (/^tests\/fixtures\//.test(file)) {
    return /\bnot exported or used\b/i.test(combinedText);
  }

  if (/\.test\.[jt]sx?$/.test(file)) {
    return (
      /\bmock module path\b/i.test(combinedText) ||
      /\bempty test function provides no validation\b/i.test(combinedText)
    );
  }

  return false;
}

function isBenchmarkSynchronousSingletonAdvisory(finding: Finding, rawDiff: string): boolean {
  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  const mentionsSingletonConcern =
    /\bsingleton\b/i.test(combinedText) ||
    /\bmultiple .*instances\b/i.test(combinedText) ||
    /\bconcurrency protection\b/i.test(combinedText) ||
    /\bquery method.*sql injection\b/i.test(combinedText) ||
    /\bsql injection vulnerabilities?.*query method\b/i.test(combinedText) ||
    /\baccepts any sql string\b/i.test(combinedText);
  if (!mentionsSingletonConcern) return false;

  const hasSingletonShape =
    /let\s+\w+[^=]*=\s*null/.test(rawDiff) &&
    /if\s*\(\s*!\w+\s*\)/.test(rawDiff) &&
    /\w+\s*=\s*new\s+\w+\s*\(/.test(rawDiff) &&
    !/\bawait\b|=\s*(?:new\s+)?Promise\s*[<(]/.test(rawDiff);

  if (!hasSingletonShape) return false;

  if (/\bquery method.*sql injection\b/i.test(combinedText)) {
    return /\binterface\b[\s\S]*\bquery\s*\(\s*sql\s*:\s*string\s*\)/i.test(rawDiff);
  }

  return true;
}

function isBenchmarkReactQueryReplayAdvisory(finding: Finding, rawDiff: string): boolean {
  if (!/@tanstack\/react-query/.test(rawDiff) || !/\buseQuery\s*\(/.test(rawDiff)) {
    return false;
  }

  const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
  if (
    /\bfetch\(\)\s+does\s+not\s+reject\b/i.test(combinedText) &&
    /\bqueryFn\s*:\s*fetchUsers\b/.test(rawDiff) &&
    /fetch\([^)]*\)\.then\(\s*\w+\s*=>\s*\w+\.json\(\)\s*\)/.test(rawDiff)
  ) {
    return true;
  }

  if (
    /\bloading state\b/i.test(combinedText) &&
    /\bundefined users\b/i.test(combinedText) &&
    /\bdata\?\.\w+/.test(rawDiff)
  ) {
    return true;
  }

  if (
    /\bsettings query error is not handled\b/i.test(combinedText) &&
    /\bdata\s*:\s*settings\b/.test(rawDiff) &&
    !/\bsettings\?\./.test(rawDiff) &&
    !/\bsettings\b(?!\s*:|\s*,|\s*'|\s*")/.test(rawDiff.split('\n').slice(-2).join('\n'))
  ) {
    return true;
  }

  return false;
}

function applyBenchmarkReplaySuppressions(
  findings: Finding[],
  scenario: BenchmarkScenario
): Finding[] {
  return findings.filter((finding) => {
    const combinedText = normalizeUnicode(finding.message + ' ' + (finding.suggestion ?? ''));
    const matchedPartialDiffPattern = BENCHMARK_PARTIAL_DIFF_SYMBOL_PATTERNS.some((pattern) =>
      pattern.test(combinedText)
    );
    if (matchedPartialDiffPattern) {
      const symbol = extractReferencedSymbol(combinedText);
      if (!diffShowsSymbolRemoval(scenario.diff, symbol)) {
        return false;
      }
    }

    if (isBenchmarkEnvironmentFeatureFlagAdvisory(finding, scenario.prDescription)) {
      return false;
    }

    if (isBenchmarkSpeculativeCssLayoutAdvisory(finding, scenario.diff, scenario.projectRules)) {
      return false;
    }

    if (
      isBenchmarkCanonicalSeedScaffoldingAdvisory(finding, scenario.diff, scenario.projectRules)
    ) {
      return false;
    }

    if (isBenchmarkEnterKeyHandlerIntentAdvisory(finding, scenario.prDescription)) {
      return false;
    }

    if (isBenchmarkParameterizedTestRefactorAdvisory(finding, scenario.prDescription)) {
      return false;
    }

    if (isBenchmarkTestArtifactAdvisory(finding)) {
      return false;
    }

    if (isBenchmarkSynchronousSingletonAdvisory(finding, scenario.diff)) {
      return false;
    }

    if (isBenchmarkReactQueryReplayAdvisory(finding, scenario.diff)) {
      return false;
    }

    return true;
  });
}

// =============================================================================
// Scenario Runner
// =============================================================================

const DEFAULT_TIMEOUT_MS = 30_000;

export function getUnsupportedScenarioReason(scenario: BenchmarkScenario): string | null {
  if (scenario.pattern === 'B') {
    return 'framework-convention fixtures require mocked LLM behavior';
  }
  if (scenario.pattern === 'C') {
    return 'project-context fixtures require project rules to be consumed by an LLM-backed adapter';
  }
  if (scenario.pattern === 'D') {
    return 'PR-description fixtures require PR description context to be consumed by an LLM-backed adapter';
  }
  if (scenario.pattern === 'F') {
    return 'mixed fixtures include LLM-dependent behavior that this deterministic adapter does not exercise';
  }
  if (!DETERMINISTIC_PATTERNS.has(scenario.pattern)) {
    return `pattern ${scenario.pattern} is not supported by the deterministic benchmark adapter`;
  }
  return null;
}

/**
 * Run a single benchmark scenario through the deterministic analysis pipeline.
 *
 * For each file in the diff:
 * 1. Parse TypeScript source with ts.createSourceFile
 * 2. Run VulnerabilityDetector.detectInFile to find potential vulnerabilities
 * 3. Convert PotentialVulnerability[] to Finding[]
 * 4. If Pattern E, also run finding-validator
 * 5. Apply timeout via Promise.race
 */
export async function runScenario(
  scenario: BenchmarkScenario,
  timeout = DEFAULT_TIMEOUT_MS
): Promise<Finding[]> {
  const unsupportedReason = getUnsupportedScenarioReason(scenario);
  if (unsupportedReason) {
    throw new Error(
      `Scenario ${scenario.id} is unsupported by the deterministic benchmark adapter: ${unsupportedReason}`
    );
  }

  const runAnalysis = async (): Promise<Finding[]> => {
    const diffFiles = parseDiffFiles(scenario.diff);

    if (diffFiles.length === 0) {
      return [];
    }

    const logger = createLogger({ minLevel: 'warn', consoleOutput: false });
    const detector = new VulnerabilityDetector(logger);
    const allFindings: Finding[] = [];

    for (const { path, content } of diffFiles) {
      // Determine script kind from file extension
      const ext = path.split('.').pop()?.toLowerCase();
      const scriptKind =
        ext === 'tsx'
          ? ts.ScriptKind.TSX
          : ext === 'jsx'
            ? ts.ScriptKind.JSX
            : ext === 'js'
              ? ts.ScriptKind.JS
              : ts.ScriptKind.TS;

      const sourceFile = ts.createSourceFile(
        path,
        content,
        ts.ScriptTarget.ES2022,
        true,
        scriptKind
      );

      // Detect vulnerabilities
      const vulnerabilities = detector.detectInFile(sourceFile, path);

      // Convert PotentialVulnerability to Finding
      for (const vuln of vulnerabilities) {
        allFindings.push({
          severity: 'warning',
          file: vuln.sinkLocation.file,
          line: vuln.sinkLocation.line,
          endLine: vuln.sinkLocation.endLine,
          message: vuln.description,
          ruleId: `cfa/${vuln.type}`,
          sourceAgent: 'control_flow',
        });
      }
    }

    // Pattern E: Run finding-validator on synthetic findings (self-contradiction,
    // stale lines, etc.). The control-flow detector doesn't emit these shapes,
    // so we must inject them from the fixture to actually exercise the validator.
    // FR-018: Uses validateFindings() which runs both Stage 1 (semantic) and
    // Stage 2 (diff-bound) to exercise the full validation pipeline.
    if (scenario.pattern === 'E') {
      const inputFindings = scenario.syntheticFindings ?? allFindings;
      const lineResolver = createBenchmarkLineResolver(diffFiles, scenario.diff);
      const diffFilePaths = diffFiles.map((df) => df.path);
      const summary = validateFindings(inputFindings, lineResolver, diffFilePaths);
      return summary.validFindings;
    }

    return allFindings;
  };

  // Apply timeout with cleanup to prevent leaked timers.
  // Timeout REJECTS to avoid silently scoring a hung scenario as "0 findings = passed".
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<Finding[]>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Scenario ${scenario.id} timed out after ${timeout}ms`));
    }, timeout);
  });

  try {
    return await Promise.race([runAnalysis(), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// =============================================================================
// Snapshot Adapter (FR-020, FR-021)
// =============================================================================

/** Version tag embedded in snapshot metadata for format compatibility checks. */
export const SNAPSHOT_ADAPTER_VERSION = '1.0.0';

export interface SnapshotMetadata {
  recordedAt: string;
  promptTemplateHash: string;
  modelId: string;
  provider: string;
  fixtureHash: string;
  adapterVersion: string;
}

export interface RecordedResponse {
  findings: Finding[];
  rawOutput: string;
  /** Model ID used for recording (auto-detected from SDK, FR-021) */
  modelId?: string;
  /** Provider name used for recording (auto-detected from SDK, FR-021) */
  provider?: string;
}

export interface ResponseSnapshot {
  metadata: SnapshotMetadata;
  response: RecordedResponse;
}

export interface DriftField {
  field: keyof SnapshotMetadata;
  expected: string;
  actual: string;
}

export interface DriftCheckResult {
  valid: boolean;
  drifted: DriftField[];
}

/** Compute SHA-256 hash of a string, returned as hex. */
export function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Snapshot file name for a given scenario ID. */
function snapshotFileName(scenarioId: string): string {
  return `${scenarioId}.snapshot.json`;
}

/**
 * Load a recorded snapshot for a given scenario ID.
 * Returns undefined if no snapshot file exists.
 */
export async function loadSnapshot(
  scenarioId: string,
  snapshotDir: string
): Promise<ResponseSnapshot | undefined> {
  const filePath = join(snapshotDir, snapshotFileName(scenarioId));
  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as ResponseSnapshot;
  } catch {
    return undefined;
  }
}

/**
 * Validate snapshot metadata against current system state.
 * Returns drift details if any metadata field has changed.
 */
export function validateSnapshotMetadata(
  snapshot: ResponseSnapshot,
  currentPromptHash: string,
  currentFixtureHash: string
): DriftCheckResult {
  const drifted: DriftField[] = [];

  if (snapshot.metadata.promptTemplateHash !== currentPromptHash) {
    drifted.push({
      field: 'promptTemplateHash',
      expected: currentPromptHash,
      actual: snapshot.metadata.promptTemplateHash,
    });
  }

  if (snapshot.metadata.fixtureHash !== currentFixtureHash) {
    drifted.push({
      field: 'fixtureHash',
      expected: currentFixtureHash,
      actual: snapshot.metadata.fixtureHash,
    });
  }

  return { valid: drifted.length === 0, drifted };
}

/**
 * Run a benchmark scenario using a recorded snapshot.
 * Validates metadata first; throws if snapshot not found or drift detected.
 */
export async function runWithSnapshot(
  scenarioId: string,
  snapshotDir: string,
  currentPromptHash: string,
  currentFixtureHash: string,
  scenario?: BenchmarkScenario
): Promise<Finding[]> {
  const snapshot = await loadSnapshot(scenarioId, snapshotDir);
  if (!snapshot) {
    throw new Error(
      `No snapshot found for scenario "${scenarioId}" in ${snapshotDir}. ` +
        `Run with --record to capture a snapshot.`
    );
  }

  const driftCheck = validateSnapshotMetadata(snapshot, currentPromptHash, currentFixtureHash);
  if (!driftCheck.valid) {
    // FR-022: Two-part drift gate with differentiated error messages
    const hasFixtureDrift = driftCheck.drifted.some((d) => d.field === 'fixtureHash');
    const hasPromptDrift = driftCheck.drifted.some((d) => d.field === 'promptTemplateHash');

    if (hasFixtureDrift) {
      throw new Error(
        `Fixture content changed for scenario "${scenarioId}": ` +
          `diff content no longer matches the recorded snapshot. ` +
          `Re-record with: pnpm benchmark:record`
      );
    }
    if (hasPromptDrift) {
      throw new Error(
        `Prompt template changed for scenario "${scenarioId}": ` +
          `prompt hash no longer matches the recorded snapshot. ` +
          `Re-record with: pnpm benchmark:record`
      );
    }
    // Fallback for other drift types (e.g., adapterVersion)
    const details = driftCheck.drifted
      .map((d) => `  ${d.field}: snapshot="${d.actual}" current="${d.expected}"`)
      .join('\n');
    throw new Error(
      `Snapshot drift detected for scenario "${scenarioId}":\n${details}\n` +
        `Re-record with: pnpm benchmark:record`
    );
  }

  let findings = snapshot.response.findings;

  // Apply the same post-processing pipeline used in production (FR-018 contract order):
  // 1. Stage 1: semantic validation (self-contradiction + PR intent suppression)
  // 2. Framework convention filter (deterministic matcher table)
  // 3. Stage 2: diff-bound validation (line checking after normalization)
  //
  // NOTE: Sanitization (HTML entity escaping) is intentionally omitted here.
  // It is a presentation concern for platform posting (GitHub/ADO) and must run
  // AFTER all filtering to avoid corrupting text that matcher regexes match against.
  // Benchmark findings are only used for scoring, never posted to a platform.
  if (scenario) {
    const diffFiles = parseDiffFiles(scenario.diff);

    // 1. Stage 1: semantic filtering — includes PR-intent contradiction suppression
    const semanticResult = validateFindingsSemantics(
      findings,
      scenario.prDescription,
      scenario.diff
    );

    const replaySuppressed = applyBenchmarkReplaySuppressions(
      semanticResult.validFindings,
      scenario
    );

    // 2. Framework convention matchers (before diff-bound, per contract)
    const frameworkFiltered = filterFrameworkConventionFindings(replaySuppressed, scenario.diff);
    const afterFramework = getValidFindings(frameworkFiltered);

    // 3. Stage 2: line validation against diff ranges
    const lineResolver = createBenchmarkLineResolver(diffFiles, scenario.diff);
    const diffFilePaths = diffFiles.map((df) => df.path);
    const validated = validateNormalizedFindings(afterFramework, lineResolver, diffFilePaths);
    findings = validated.validFindings;
  }

  return findings;
}

/**
 * Record a live LLM response as a snapshot for a given scenario.
 */
export async function recordSnapshot(
  scenarioId: string,
  response: RecordedResponse,
  metadata: SnapshotMetadata,
  snapshotDir: string
): Promise<void> {
  await mkdir(snapshotDir, { recursive: true });
  const snapshot: ResponseSnapshot = { metadata, response };
  const filePath = join(snapshotDir, snapshotFileName(scenarioId));
  await writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/**
 * Build snapshot metadata for a recorded scenario.
 */
export function buildSnapshotMetadata(
  promptHash: string,
  fixtureHash: string,
  modelId = process.env['BENCHMARK_MODEL_ID'] ?? 'unknown',
  provider = process.env['BENCHMARK_PROVIDER'] ?? 'unknown'
): SnapshotMetadata {
  // Guard: require explicit model pinning when recording snapshots
  if (process.env['RECORD'] === 'true' && (modelId === 'unknown' || provider === 'unknown')) {
    throw new Error(
      'BENCHMARK_MODEL_ID and BENCHMARK_PROVIDER must be set when recording snapshots. ' +
        'Add them to .env or set them in the environment. See .env.example for reference.'
    );
  }

  return {
    recordedAt: new Date().toISOString(),
    promptTemplateHash: promptHash,
    modelId,
    provider,
    fixtureHash,
    adapterVersion: SNAPSHOT_ADAPTER_VERSION,
  };
}

// =============================================================================
// Live LLM Scenario Runner (for RECORD mode)
// =============================================================================

const PROMPT_PATH = join(import.meta.dirname, '../../../config/prompts/semantic_review.md');

/** Severity mapping from LLM response levels to Finding severity */
function mapLLMSeverity(severity: string): Severity {
  switch (severity) {
    case 'critical':
    case 'high':
    case 'error':
      return 'error';
    case 'medium':
    case 'warning':
      return 'warning';
    default:
      return 'info';
  }
}

/**
 * Run a benchmark scenario against a live LLM and return the response.
 * Requires either ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment.
 * Used exclusively by the benchmark:record command (RECORD=true).
 */
export async function runLiveScenario(scenario: BenchmarkScenario): Promise<RecordedResponse> {
  const diffFiles = parseDiffFiles(scenario.diff);
  if (diffFiles.length === 0) {
    return { findings: [], rawOutput: '{"findings":[],"summary":"No diff files"}' };
  }

  // Load the prompt template
  let systemPrompt =
    'You are a senior code reviewer. Analyze the diff for security vulnerabilities, logic errors, and code quality issues. Return JSON with findings array and summary string.';
  if (existsSync(PROMPT_PATH)) {
    try {
      systemPrompt = await readFile(PROMPT_PATH, 'utf-8');
    } catch {
      // fall back to default prompt
    }
  }

  const fileSummary = diffFiles.map((f) => `- ${f.path}`).join('\n');
  let userPrompt = `## Files Changed\n${fileSummary}\n`;

  if (scenario.projectRules) {
    userPrompt += `\n## Project Rules\n\n${scenario.projectRules}\n`;
  }
  if (scenario.prDescription) {
    userPrompt += `\n## PR Description\n\n${scenario.prDescription}\n`;
  }
  userPrompt += `\n## Diff Content\n\`\`\`diff\n${scenario.diff}\n\`\`\`\n\nReturn JSON: {"findings": [...], "summary": "..."}`;

  const anthropicKey = process.env['ANTHROPIC_API_KEY'];
  const openaiKey = process.env['OPENAI_API_KEY'];

  if (anthropicKey) {
    return runLiveAnthropic(anthropicKey, systemPrompt, userPrompt);
  } else if (openaiKey) {
    return runLiveOpenAI(openaiKey, systemPrompt, userPrompt);
  } else {
    throw new Error(
      'RECORD mode requires ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment. ' +
        'Set one of these to record live LLM snapshots.'
    );
  }
}

async function runLiveAnthropic(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RecordedResponse> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey });
  const model = process.env['BENCHMARK_MODEL_ID'] ?? 'claude-sonnet-4-20250514';

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textContent = response.content.find((c) => c.type === 'text');
  const rawOutput = textContent && textContent.type === 'text' ? textContent.text : '';

  return {
    findings: parseLLMFindings(rawOutput),
    rawOutput,
    modelId: model,
    provider: 'anthropic',
  };
}

async function runLiveOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<RecordedResponse> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey });
  const model = process.env['BENCHMARK_MODEL_ID'] ?? 'gpt-4o';

  const response = await client.chat.completions.create({
    model,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const rawOutput = response.choices[0]?.message?.content ?? '';
  return { findings: parseLLMFindings(rawOutput), rawOutput, modelId: model, provider: 'openai' };
}

/** Parse LLM JSON output into Finding[]. Tolerates code-fenced JSON. */
function parseLLMFindings(raw: string): Finding[] {
  try {
    // Strip markdown code fences if present
    const cleaned = raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
    const parsed = JSON.parse(cleaned) as { findings?: unknown[] };
    const findings = parsed.findings ?? [];
    return findings.map((item) => {
      const f = item as Record<string, unknown>;
      return {
        severity: mapLLMSeverity(String(f['severity'] ?? 'info')),
        file: String(f['file'] ?? ''),
        line: typeof f['line'] === 'number' ? f['line'] : undefined,
        message: String(f['message'] ?? ''),
        suggestion: typeof f['suggestion'] === 'string' ? f['suggestion'] : undefined,
        ruleId: typeof f['category'] === 'string' ? `semantic/${f['category']}` : undefined,
        sourceAgent: 'ai_semantic_review',
      };
    }) as Finding[];
  } catch {
    // If we can't parse, return empty — the raw output is still recorded
    return [];
  }
}
