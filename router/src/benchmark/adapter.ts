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
import { join } from 'node:path';
import { VulnerabilityDetector } from '../agents/control_flow/vulnerability-detector.js';
import { validateFindings } from '../report/finding-validator.js';
import { createLogger } from '../agents/control_flow/logger.js';
import type { Finding } from '../agents/types.js';
import type { BenchmarkScenario } from './scoring.js';

const DETERMINISTIC_PATTERNS = new Set<BenchmarkScenario['pattern']>(['A', 'E']);

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
    if (scenario.pattern === 'E') {
      const inputFindings = scenario.syntheticFindings ?? allFindings;
      const lineResolver = createBenchmarkLineResolver(diffFiles, scenario.diff);
      const diffFilePaths = diffFiles.map((df) => df.path);
      const summary = validateFindings(inputFindings, lineResolver, diffFilePaths);
      return summary.validFindings;
    }

    return allFindings;
  };

  // Apply timeout with cleanup to prevent leaked timers
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<Finding[]>((resolve) => {
    timer = setTimeout(() => {
      console.log(`[benchmark] scenario ${scenario.id} timed out after ${timeout}ms`);
      resolve([]);
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
  currentFixtureHash: string
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
    const details = driftCheck.drifted
      .map((d) => `  ${d.field}: snapshot="${d.actual}" current="${d.expected}"`)
      .join('\n');
    throw new Error(
      `Snapshot drift detected for scenario "${scenarioId}":\n${details}\n` +
        `Re-record with --record to update.`
    );
  }

  return snapshot.response.findings;
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
