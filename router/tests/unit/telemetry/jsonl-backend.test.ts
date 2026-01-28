/**
 * Unit tests for JSONL telemetry backend
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Tests: T023
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createJsonlBackend } from '../../../src/telemetry/backends/jsonl.js';
import type { TimeoutEvent } from '../../../src/telemetry/types.js';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('createJsonlBackend', () => {
  const mockEvent: TimeoutEvent = {
    operation_id: 'test_op_123',
    duration_ms: 1500,
    threshold_ms: 1000,
    timestamp: '2026-01-28T12:00:00.000Z',
    severity: 'error',
    allowed_context: {
      agent_id: 'semgrep',
      file_path: 'src/main.ts',
    },
  };

  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `telemetry-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'test.jsonl');
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('emit', () => {
    it('should write event to file after flush', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'standard',
        bufferSize: 100,
      });

      await backend.emit(mockEvent);
      await backend.flush();
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      expect(lines[0]).toBeDefined();
      const parsed = JSON.parse(lines[0] as string);
      expect(parsed.operation_id).toBe('test_op_123');
      expect(parsed.duration_ms).toBe(1500);
      expect(parsed.threshold_ms).toBe(1000);
      expect(parsed.timestamp).toBe('2026-01-28T12:00:00.000Z');
      expect(parsed.severity).toBe('error');
    });

    it('should format minimal verbosity correctly', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
      });

      await backend.emit(mockEvent);
      await backend.flush();
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(Object.keys(parsed).sort()).toEqual(['duration_ms', 'operation_id', 'severity']);
    });

    it('should format standard verbosity correctly', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'standard',
      });

      await backend.emit(mockEvent);
      await backend.flush();
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(Object.keys(parsed).sort()).toEqual([
        'duration_ms',
        'operation_id',
        'severity',
        'threshold_ms',
        'timestamp',
      ]);
    });

    it('should format verbose verbosity with context', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'verbose',
      });

      await backend.emit(mockEvent);
      await backend.flush();
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      const parsed = JSON.parse(content.trim());

      expect(parsed.allowed_context).toBeDefined();
      expect(parsed.allowed_context.agent_id).toBe('semgrep');
    });

    it('should auto-flush when buffer is full', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
        bufferSize: 2,
        flushIntervalMs: 60000, // Long interval to ensure auto-flush triggers
      });

      await backend.emit(mockEvent);
      await backend.emit(mockEvent);
      // Buffer should be flushed after 2 events

      // Give a small delay for async write
      await new Promise((resolve) => setTimeout(resolve, 50));
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      const lines = content.trim().split('\n').filter(Boolean);
      expect(lines.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle multiple events', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
      });

      await backend.emit(mockEvent);
      await backend.emit({ ...mockEvent, operation_id: 'test_op_456' });
      await backend.emit({ ...mockEvent, operation_id: 'test_op_789' });
      await backend.flush();
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      const ids = lines.map((line) => JSON.parse(line).operation_id);
      expect(ids).toEqual(['test_op_123', 'test_op_456', 'test_op_789']);
    });

    it('should not throw on write error (best-effort)', async () => {
      // Use an invalid path
      const backend = createJsonlBackend({
        filePath: '/nonexistent/path/file.jsonl',
        verbosity: 'minimal',
      });

      // Should not throw
      await expect(backend.emit(mockEvent)).resolves.toBeUndefined();
      await expect(backend.flush()).resolves.toBeUndefined();
      await expect(backend.close()).resolves.toBeUndefined();
    });

    it('should not emit after close', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
      });

      await backend.emit(mockEvent);
      await backend.flush();
      await backend.close();

      // Emit after close
      await backend.emit({ ...mockEvent, operation_id: 'after_close_op' });
      await backend.flush();

      const content = await readFile(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);
      expect(lines[0]).toBeDefined();
      expect(JSON.parse(lines[0] as string).operation_id).toBe('test_op_123');
    });
  });

  describe('flush', () => {
    it('should write buffered events', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
        bufferSize: 100, // Large buffer
      });

      await backend.emit(mockEvent);
      // Event should be buffered, not written yet

      await backend.flush();
      await backend.close();

      const content = await readFile(testFilePath, 'utf8');
      expect(content.trim()).not.toBe('');
    });

    it('should be idempotent when buffer is empty', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
      });

      await backend.flush();
      await backend.flush();
      await backend.close();

      // File may not exist if nothing was written
      if (existsSync(testFilePath)) {
        const content = await readFile(testFilePath, 'utf8');
        expect(content).toBe('');
      }
    });
  });

  describe('close', () => {
    it('should flush remaining events', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
        bufferSize: 100,
        flushIntervalMs: 60000, // Long interval so auto-flush doesn't trigger
      });

      await backend.emit(mockEvent);
      // Close should flush the buffered event
      await backend.close();

      // Give a small delay for async write
      await new Promise((resolve) => setTimeout(resolve, 50));

      const content = await readFile(testFilePath, 'utf8');
      expect(content.trim()).not.toBe('');
    });

    it('should be idempotent', async () => {
      const backend = createJsonlBackend({
        filePath: testFilePath,
        verbosity: 'minimal',
      });

      await backend.emit(mockEvent);
      await backend.close();
      await backend.close(); // Second close should not throw
    });
  });
});
