/**
 * Cache Read/Write Symmetry Tests
 *
 * These tests verify that the cache system maintains perfect symmetry:
 * what you write is exactly what you read back.
 *
 * Symmetry properties tested:
 * 1. Round-trip identity: write(x) followed by read() returns x
 * 2. Field preservation: all fields survive serialization
 * 3. Type preservation: discriminated union variants maintain their type
 * 4. Versioning: cache version is correctly embedded and validated
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import {
  AgentSuccess,
  AgentFailure,
  AgentSkipped,
  isSuccess,
  isFailure,
  isSkipped,
  CACHE_SCHEMA_VERSION,
  type AgentMetrics,
  type Finding,
} from '../../agents/types.js';
import { setCache, getCached, clearCache } from '../../cache/store.js';
import { CACHE_KEY_PREFIX } from '../../cache/key.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  unlinkSync: vi.fn(),
}));

vi.mock('os', () => ({
  homedir: () => '/mock/home',
}));

const metrics: AgentMetrics = {
  durationMs: 123,
  filesProcessed: 7,
  tokensUsed: 1500,
  estimatedCostUsd: 0.05,
};

const finding: Finding = {
  severity: 'warning',
  file: 'src/app.ts',
  line: 42,
  endLine: 45,
  message: 'Potential null reference',
  suggestion: 'Add null check before accessing property',
  ruleId: 'no-null-ref',
  sourceAgent: 'typescript-analyzer',
  fingerprint: 'abc123def456',
  metadata: { confidence: 0.95, category: 'safety' },
};

describe('Cache Read/Write Symmetry', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    await clearCache();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Round-trip identity', () => {
    it('success result survives round-trip unchanged', async () => {
      const original = AgentSuccess({
        agentId: 'test-agent',
        findings: [finding, { ...finding, line: 100 }],
        metrics,
      });

      // Write
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('symmetry-success', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Read
      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('symmetry-success');

      // SYMMETRY: Retrieved must equal original
      expect(retrieved).not.toBeNull();
      expect(retrieved && isSuccess(retrieved)).toBe(true);
      if (retrieved && isSuccess(retrieved)) {
        expect(retrieved.agentId).toBe(original.agentId);
        expect(retrieved.status).toBe(original.status);
        expect(retrieved.findings).toHaveLength(original.findings.length);
        expect(retrieved.metrics).toEqual(original.metrics);
      }
    });

    it('failure result survives round-trip unchanged', async () => {
      const original = AgentFailure({
        agentId: 'failing-agent',
        error: 'Connection timeout after 30 seconds',
        failureStage: 'exec',
        partialFindings: [finding],
        metrics,
      });

      // Write
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('symmetry-failure', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Read
      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('symmetry-failure');

      // SYMMETRY: Retrieved must equal original
      expect(retrieved).not.toBeNull();
      expect(retrieved && isFailure(retrieved)).toBe(true);
      if (retrieved && isFailure(retrieved)) {
        expect(retrieved.agentId).toBe(original.agentId);
        expect(retrieved.status).toBe(original.status);
        expect(retrieved.error).toBe(original.error);
        expect(retrieved.failureStage).toBe(original.failureStage);
        expect(retrieved.partialFindings).toHaveLength(original.partialFindings.length);
        expect(retrieved.metrics).toEqual(original.metrics);
      }
    });

    it('skipped result survives round-trip unchanged', async () => {
      const original = AgentSkipped({
        agentId: 'skipped-agent',
        reason: 'No TypeScript files in the diff',
        metrics,
      });

      // Write
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('symmetry-skipped', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Read
      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('symmetry-skipped');

      // SYMMETRY: Retrieved must equal original
      expect(retrieved).not.toBeNull();
      expect(retrieved && isSkipped(retrieved)).toBe(true);
      if (retrieved && isSkipped(retrieved)) {
        expect(retrieved.agentId).toBe(original.agentId);
        expect(retrieved.status).toBe(original.status);
        expect(retrieved.reason).toBe(original.reason);
        expect(retrieved.metrics).toEqual(original.metrics);
      }
    });
  });

  describe('Field preservation', () => {
    it('all Finding fields survive round-trip', async () => {
      const complexFinding: Finding = {
        severity: 'error',
        file: 'src/complex/path/file.ts',
        line: 100,
        endLine: 150,
        message: 'Complex message with special chars: <>"\' & unicode: 你好',
        suggestion: 'Multi\nline\nsuggestion',
        ruleId: 'complex-rule-id-with-dashes',
        sourceAgent: 'complex-agent',
        fingerprint: 'fingerprint-with-special-chars',
        metadata: {
          nested: { deeply: { nested: 'value' } },
          array: [1, 2, 3],
          boolean: true,
          null: null,
        },
      };

      const original = AgentSuccess({
        agentId: 'field-test',
        findings: [complexFinding],
        metrics,
      });

      // Write
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('field-preservation', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      // Read
      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('field-preservation');

      // SYMMETRY: All fields must be preserved exactly
      expect(retrieved).not.toBeNull();
      if (retrieved && isSuccess(retrieved)) {
        const retrievedFinding = retrieved.findings[0];
        expect(retrievedFinding?.severity).toBe(complexFinding.severity);
        expect(retrievedFinding?.file).toBe(complexFinding.file);
        expect(retrievedFinding?.line).toBe(complexFinding.line);
        expect(retrievedFinding?.endLine).toBe(complexFinding.endLine);
        expect(retrievedFinding?.message).toBe(complexFinding.message);
        expect(retrievedFinding?.suggestion).toBe(complexFinding.suggestion);
        expect(retrievedFinding?.ruleId).toBe(complexFinding.ruleId);
        expect(retrievedFinding?.sourceAgent).toBe(complexFinding.sourceAgent);
        expect(retrievedFinding?.fingerprint).toBe(complexFinding.fingerprint);
        expect(retrievedFinding?.metadata).toEqual(complexFinding.metadata);
      }
    });

    it('all AgentMetrics fields survive round-trip', async () => {
      const fullMetrics: AgentMetrics = {
        durationMs: 12345,
        filesProcessed: 42,
        tokensUsed: 5000,
        estimatedCostUsd: 0.12345,
      };

      const original = AgentSuccess({
        agentId: 'metrics-test',
        findings: [],
        metrics: fullMetrics,
      });

      // Write and read
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('metrics-preservation', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('metrics-preservation');

      // SYMMETRY: All metrics fields preserved
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.metrics.durationMs).toBe(fullMetrics.durationMs);
        expect(retrieved.metrics.filesProcessed).toBe(fullMetrics.filesProcessed);
        expect(retrieved.metrics.tokensUsed).toBe(fullMetrics.tokensUsed);
        expect(retrieved.metrics.estimatedCostUsd).toBe(fullMetrics.estimatedCostUsd);
      }
    });

    it('failure-specific fields survive round-trip', async () => {
      const original = AgentFailure({
        agentId: 'failure-fields',
        error: 'Detailed error message with context',
        failureStage: 'postprocess',
        partialFindings: [finding, { ...finding, severity: 'error' }],
        metrics,
      });

      // Write and read
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('failure-fields', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('failure-fields');

      // SYMMETRY: Failure-specific fields preserved
      expect(retrieved).not.toBeNull();
      if (retrieved && isFailure(retrieved)) {
        expect(retrieved.error).toBe(original.error);
        expect(retrieved.failureStage).toBe(original.failureStage);
        expect(retrieved.partialFindings).toHaveLength(2);
        expect(retrieved.partialFindings[0]?.severity).toBe('warning');
        expect(retrieved.partialFindings[1]?.severity).toBe('error');
      }
    });
  });

  describe('Type preservation (discriminated union)', () => {
    it('status discriminant is preserved correctly', async () => {
      const variants = [
        AgentSuccess({ agentId: 's', findings: [], metrics }),
        AgentFailure({ agentId: 'f', error: 'e', failureStage: 'exec', metrics }),
        AgentSkipped({ agentId: 'k', reason: 'r', metrics }),
      ];

      for (const original of variants) {
        vi.clearAllMocks();
        await clearCache();

        // Write
        vi.mocked(fs.existsSync).mockReturnValue(true);
        await setCache(`type-${original.status}`, original);

        const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
        const writtenData = writeCall?.[1] as string;

        // Read
        vi.clearAllMocks();
        await clearCache();
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

        const retrieved = await getCached(`type-${original.status}`);

        // SYMMETRY: Status discriminant must match
        expect(retrieved).not.toBeNull();
        expect(retrieved?.status).toBe(original.status);
      }
    });

    it('type guards work correctly after round-trip', async () => {
      const original = AgentSuccess({
        agentId: 'type-guard-test',
        findings: [finding],
        metrics,
      });

      // Write and read
      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('type-guard', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('type-guard');

      // SYMMETRY: Type guards must work correctly
      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(isSuccess(retrieved)).toBe(true);
        expect(isFailure(retrieved)).toBe(false);
        expect(isSkipped(retrieved)).toBe(false);
      }
    });
  });

  describe('Versioning behavior', () => {
    it('cache key prefix includes current schema version', () => {
      // VERSIONING: Prefix must include version number
      expect(CACHE_KEY_PREFIX).toContain(`v${CACHE_SCHEMA_VERSION}`);
      expect(CACHE_KEY_PREFIX).toBe(`ai-review-v${CACHE_SCHEMA_VERSION}`);
    });

    it('current version is 2 (discriminated union format)', () => {
      // VERSIONING: Current version must be 2
      expect(CACHE_SCHEMA_VERSION).toBe(2);
    });

    it('cache entry includes expiration timestamp', async () => {
      const original = AgentSuccess({
        agentId: 'expiry-test',
        findings: [],
        metrics,
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('expiry-key', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;
      const parsed = JSON.parse(writtenData);

      // VERSIONING: Cache entry must have timestamps
      expect(parsed.createdAt).toBeDefined();
      expect(parsed.expiresAt).toBeDefined();
      expect(new Date(parsed.expiresAt) > new Date(parsed.createdAt)).toBe(true);
    });

    it('cache entry key is embedded in the entry', async () => {
      const original = AgentSuccess({
        agentId: 'key-embed-test',
        findings: [],
        metrics,
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('my-cache-key', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;
      const parsed = JSON.parse(writtenData);

      // VERSIONING: Key is embedded for debugging
      expect(parsed.key).toBe('my-cache-key');
    });
  });

  describe('Edge cases', () => {
    it('empty findings array survives round-trip', async () => {
      const original = AgentSuccess({
        agentId: 'empty-findings',
        findings: [],
        metrics,
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('empty-findings', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('empty-findings');

      expect(retrieved).not.toBeNull();
      if (retrieved && isSuccess(retrieved)) {
        expect(retrieved.findings).toEqual([]);
        expect(retrieved.findings).toHaveLength(0);
      }
    });

    it('empty partialFindings survives round-trip', async () => {
      const original = AgentFailure({
        agentId: 'empty-partials',
        error: 'Preflight failure',
        failureStage: 'preflight',
        metrics,
        // partialFindings defaults to []
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('empty-partials', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('empty-partials');

      expect(retrieved).not.toBeNull();
      if (retrieved && isFailure(retrieved)) {
        expect(retrieved.partialFindings).toEqual([]);
        expect(retrieved.partialFindings).toHaveLength(0);
      }
    });

    it('optional metrics fields survive round-trip when undefined', async () => {
      const minimalMetrics: AgentMetrics = {
        durationMs: 100,
        filesProcessed: 1,
        // tokensUsed and estimatedCostUsd are undefined
      };

      const original = AgentSuccess({
        agentId: 'minimal-metrics',
        findings: [],
        metrics: minimalMetrics,
      });

      vi.mocked(fs.existsSync).mockReturnValue(true);
      await setCache('minimal-metrics', original);

      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall?.[1] as string;

      vi.clearAllMocks();
      await clearCache();
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(writtenData);

      const retrieved = await getCached('minimal-metrics');

      expect(retrieved).not.toBeNull();
      if (retrieved) {
        expect(retrieved.metrics.durationMs).toBe(100);
        expect(retrieved.metrics.filesProcessed).toBe(1);
        // Optional fields should be undefined or missing
        expect(retrieved.metrics.tokensUsed).toBeUndefined();
        expect(retrieved.metrics.estimatedCostUsd).toBeUndefined();
      }
    });
  });
});
