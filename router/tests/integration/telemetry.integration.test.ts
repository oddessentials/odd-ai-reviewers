/**
 * Integration tests for telemetry module
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Tests: T024
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  configureTelemetry,
  emitTimeoutEvent,
  flushTelemetry,
  closeTelemetry,
  isTelemetryEnabled,
  parseEnvConfig,
} from '../../src/telemetry/index.js';
import type { TimeoutEventInput } from '../../src/telemetry/types.js';

describe('Telemetry Integration', () => {
  let testDir: string;
  let testFilePath: string;

  const createTestEvent = (overrides?: Partial<TimeoutEventInput>): TimeoutEventInput => ({
    operation_id: 'test_op_123',
    duration_ms: 1500,
    threshold_ms: 1000,
    severity: 'error',
    ...overrides,
  });

  beforeEach(async () => {
    testDir = join(tmpdir(), `telemetry-integration-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    testFilePath = join(testDir, 'telemetry.jsonl');
  });

  afterEach(async () => {
    await closeTelemetry();
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe('Full Pipeline', () => {
    it('should emit event to JSONL file', async () => {
      // Configure with JSONL backend
      await configureTelemetry({
        enabled: true,
        backends: ['jsonl'],
        jsonl_path: testFilePath,
        verbosity: 'standard',
      });

      expect(isTelemetryEnabled()).toBe(true);

      // Emit an event
      await emitTimeoutEvent(createTestEvent());

      // Flush to ensure write
      await flushTelemetry();
      await closeTelemetry();

      // Verify file contains the event
      const content = await readFile(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      expect(lines[0]).toBeDefined();
      const event = JSON.parse(lines[0] as string);
      expect(event.operation_id).toBe('test_op_123');
      expect(event.duration_ms).toBe(1500);
      expect(event.threshold_ms).toBe(1000);
      expect(event.severity).toBe('error');
      expect(event.timestamp).toBeDefined();
    });

    it('should emit multiple events', async () => {
      await configureTelemetry({
        enabled: true,
        backends: ['jsonl'],
        jsonl_path: testFilePath,
        verbosity: 'minimal',
      });

      // Emit multiple events
      await emitTimeoutEvent(createTestEvent({ operation_id: 'op_1' }));
      await emitTimeoutEvent(createTestEvent({ operation_id: 'op_2', severity: 'warning' }));
      await emitTimeoutEvent(createTestEvent({ operation_id: 'op_3', severity: 'critical' }));

      await flushTelemetry();
      await closeTelemetry();

      const content = await readFile(testFilePath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);

      const events = lines.map((line) => JSON.parse(line));
      expect(events[0].operation_id).toBe('op_1');
      expect(events[1].operation_id).toBe('op_2');
      expect(events[2].operation_id).toBe('op_3');
    });

    it('should not emit when disabled', async () => {
      await configureTelemetry({
        enabled: false,
        backends: ['jsonl'],
        jsonl_path: testFilePath,
      });

      expect(isTelemetryEnabled()).toBe(false);

      await emitTimeoutEvent(createTestEvent());
      await flushTelemetry();
      await closeTelemetry();

      // File should not exist or be empty
      if (existsSync(testFilePath)) {
        const content = await readFile(testFilePath, 'utf8');
        expect(content).toBe('');
      }
    });

    it('should support console backend (no errors)', async () => {
      await configureTelemetry({
        enabled: true,
        backends: ['console'],
        verbosity: 'minimal',
      });

      // Should not throw
      await emitTimeoutEvent(createTestEvent());
      await flushTelemetry();
      await closeTelemetry();
    });

    it('should support multiple backends', async () => {
      await configureTelemetry({
        enabled: true,
        backends: ['console', 'jsonl'],
        jsonl_path: testFilePath,
        verbosity: 'standard',
      });

      await emitTimeoutEvent(createTestEvent());
      await flushTelemetry();
      await closeTelemetry();

      // JSONL file should exist
      const content = await readFile(testFilePath, 'utf8');
      expect(content.trim()).not.toBe('');
    });
  });

  describe('Verbosity Levels', () => {
    it('should respect minimal verbosity', async () => {
      await configureTelemetry({
        enabled: true,
        backends: ['jsonl'],
        jsonl_path: testFilePath,
        verbosity: 'minimal',
      });

      await emitTimeoutEvent(
        createTestEvent({
          allowed_context: { agent_id: 'test-agent' },
        })
      );
      await flushTelemetry();
      await closeTelemetry();

      const content = await readFile(testFilePath, 'utf8');
      const event = JSON.parse(content.trim());

      // Minimal should only have operation_id, duration_ms, severity
      expect(Object.keys(event).sort()).toEqual(['duration_ms', 'operation_id', 'severity']);
    });

    it('should respect verbose verbosity', async () => {
      await configureTelemetry({
        enabled: true,
        backends: ['jsonl'],
        jsonl_path: testFilePath,
        verbosity: 'verbose',
      });

      await emitTimeoutEvent(
        createTestEvent({
          allowed_context: { agent_id: 'test-agent', file_path: 'src/main.ts' },
        })
      );
      await flushTelemetry();
      await closeTelemetry();

      const content = await readFile(testFilePath, 'utf8');
      const event = JSON.parse(content.trim());

      // Verbose should include allowed_context
      expect(event.allowed_context).toBeDefined();
      expect(event.allowed_context.agent_id).toBe('test-agent');
    });
  });

  describe('Environment Configuration', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      // Restore environment
      process.env = { ...originalEnv };
    });

    it('should parse TELEMETRY_ENABLED', () => {
      process.env['TELEMETRY_ENABLED'] = 'true';
      const config = parseEnvConfig();
      expect(config.enabled).toBe(true);

      process.env['TELEMETRY_ENABLED'] = 'false';
      const config2 = parseEnvConfig();
      expect(config2.enabled).toBe(false);
    });

    it('should parse TELEMETRY_BACKENDS', () => {
      process.env['TELEMETRY_BACKENDS'] = 'console,jsonl';
      const config = parseEnvConfig();
      expect(config.backends).toEqual(['console', 'jsonl']);
    });

    it('should parse TELEMETRY_JSONL_PATH', () => {
      process.env['TELEMETRY_JSONL_PATH'] = '/tmp/test.jsonl';
      const config = parseEnvConfig();
      expect(config.jsonl_path).toBe('/tmp/test.jsonl');
    });

    it('should parse TELEMETRY_VERBOSITY', () => {
      process.env['TELEMETRY_VERBOSITY'] = 'verbose';
      const config = parseEnvConfig();
      expect(config.verbosity).toBe('verbose');
    });

    it('should parse TELEMETRY_BUFFER_SIZE', () => {
      process.env['TELEMETRY_BUFFER_SIZE'] = '500';
      const config = parseEnvConfig();
      expect(config.buffer_size).toBe(500);
    });

    it('should parse TELEMETRY_FLUSH_INTERVAL_MS', () => {
      process.env['TELEMETRY_FLUSH_INTERVAL_MS'] = '10000';
      const config = parseEnvConfig();
      expect(config.flush_interval_ms).toBe(10000);
    });

    it('should ignore invalid backend types', () => {
      process.env['TELEMETRY_BACKENDS'] = 'console,invalid,jsonl';
      const config = parseEnvConfig();
      expect(config.backends).toEqual(['console', 'jsonl']);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid JSONL path gracefully', async () => {
      await configureTelemetry({
        enabled: true,
        backends: ['jsonl'],
        jsonl_path: '/nonexistent/deeply/nested/path/file.jsonl',
        verbosity: 'minimal',
      });

      // Should not throw
      await emitTimeoutEvent(createTestEvent());
      await flushTelemetry();
      await closeTelemetry();
    });

    it('should continue after reconfiguration', async () => {
      // First config - use console to avoid file complications
      await configureTelemetry({
        enabled: true,
        backends: ['console'],
        verbosity: 'minimal',
      });

      await emitTimeoutEvent(createTestEvent({ operation_id: 'first_op' }));
      await flushTelemetry();

      // Close first config explicitly before reconfiguring
      await closeTelemetry();

      // Reconfigure with jsonl
      await configureTelemetry({
        enabled: true,
        backends: ['jsonl'],
        jsonl_path: testFilePath,
        verbosity: 'standard',
      });

      await emitTimeoutEvent(createTestEvent({ operation_id: 'second_op' }));
      await flushTelemetry();
      await closeTelemetry();

      // Check file
      const content = await readFile(testFilePath, 'utf8');
      const event = JSON.parse(content.trim());
      expect(event.operation_id).toBe('second_op');
    });
  });
});
