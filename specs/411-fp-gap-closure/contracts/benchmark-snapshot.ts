/**
 * Contract: Recorded Response Snapshot (FR-020, FR-021)
 *
 * Enables deterministic CI execution of LLM-dependent benchmark fixtures
 * by recording and replaying API responses with drift detection.
 *
 * This file defines the interface contract only — not the implementation.
 */

import type { Finding } from '../../router/src/agents/types.js';

// --- Snapshot Schema ---

export interface SnapshotMetadata {
  /** ISO 8601 timestamp of recording */
  recordedAt: string;
  /** SHA-256 hash of the prompt template content at recording time */
  promptTemplateHash: string;
  /** Model ID used for the recording (e.g., "claude-sonnet-4-5-20250514") */
  modelId: string;
  /** Provider name (anthropic, openai, etc.) */
  provider: string;
  /** SHA-256 hash of the fixture diff content at recording time */
  fixtureHash: string;
  /** Benchmark adapter version that created this snapshot */
  adapterVersion: string;
}

export interface RecordedResponse {
  /** Parsed findings from the LLM response */
  findings: Finding[];
  /** Raw LLM response text (for debugging) */
  rawOutput: string;
}

export interface ResponseSnapshot {
  metadata: SnapshotMetadata;
  response: RecordedResponse;
}

// --- Drift Detection Contract ---

export interface DriftCheckResult {
  valid: boolean;
  /** Which metadata fields differ from current state */
  drifted: DriftField[];
}

export interface DriftField {
  field: keyof SnapshotMetadata;
  expected: string;
  actual: string;
}

/**
 * Validate snapshot metadata against current system state.
 * Returns drift details if any metadata field has changed.
 *
 * @param snapshot - The loaded snapshot
 * @param currentPromptHash - Hash of the current prompt template
 * @param currentFixtureHash - Hash of the current fixture content
 * @returns Drift check result with field-level details
 */
export type ValidateSnapshotMetadata = (
  snapshot: ResponseSnapshot,
  currentPromptHash: string,
  currentFixtureHash: string
) => DriftCheckResult;

// --- Snapshot Adapter Contract ---

/**
 * Load a recorded snapshot for a given scenario ID.
 * Returns undefined if no snapshot exists.
 *
 * @param scenarioId - The benchmark scenario ID
 * @param snapshotDir - Directory containing snapshot files
 * @returns The loaded snapshot or undefined
 */
export type LoadSnapshot = (
  scenarioId: string,
  snapshotDir: string
) => Promise<ResponseSnapshot | undefined>;

/**
 * Record a live LLM response as a snapshot for a given scenario.
 *
 * @param scenarioId - The benchmark scenario ID
 * @param response - The live response to record
 * @param metadata - Current system metadata for drift detection
 * @param snapshotDir - Directory to write snapshot file
 */
export type RecordSnapshot = (
  scenarioId: string,
  response: RecordedResponse,
  metadata: SnapshotMetadata,
  snapshotDir: string
) => Promise<void>;

/**
 * Run a benchmark scenario using a recorded snapshot.
 * Validates metadata first; fails if drift detected.
 *
 * @param scenarioId - The benchmark scenario ID
 * @param snapshotDir - Directory containing snapshot files
 * @param currentPromptHash - For drift detection
 * @param currentFixtureHash - For drift detection
 * @returns Findings from the recorded snapshot
 * @throws Error if snapshot not found or drift detected
 */
export type RunWithSnapshot = (
  scenarioId: string,
  snapshotDir: string,
  currentPromptHash: string,
  currentFixtureHash: string
) => Promise<Finding[]>;
