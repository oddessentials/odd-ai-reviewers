/**
 * Unit tests for console telemetry backend
 *
 * Feature: 007-pnpm-timeout-telemetry
 * Tests: T022
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createConsoleBackend } from '../../../src/telemetry/backends/console.js';
import type { TimeoutEvent } from '../../../src/telemetry/types.js';

describe('createConsoleBackend', () => {
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

  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('emit', () => {
    it('should write to stderr', async () => {
      const backend = createConsoleBackend({ verbosity: 'standard' });
      await backend.emit(mockEvent);

      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should format minimal verbosity correctly', async () => {
      const backend = createConsoleBackend({ verbosity: 'minimal' });
      await backend.emit(mockEvent);

      expect(errorSpy).toHaveBeenCalledWith('[TIMEOUT] [ERROR] test_op_123 duration=1500ms');
    });

    it('should format standard verbosity correctly', async () => {
      const backend = createConsoleBackend({ verbosity: 'standard' });
      await backend.emit(mockEvent);

      expect(errorSpy).toHaveBeenCalledWith(
        '[TIMEOUT] [ERROR] test_op_123 duration=1500ms threshold=1000ms at=2026-01-28T12:00:00.000Z'
      );
    });

    it('should format verbose verbosity with context', async () => {
      const backend = createConsoleBackend({ verbosity: 'verbose' });
      await backend.emit(mockEvent);

      const call = errorSpy.mock.calls[0][0] as string;
      expect(call).toContain('[TIMEOUT] [ERROR] test_op_123');
      expect(call).toContain('duration=1500ms');
      expect(call).toContain('threshold=1000ms');
      expect(call).toContain('at=2026-01-28T12:00:00.000Z');
      expect(call).toContain('context=');
      expect(call).toContain('"agent_id":"semgrep"');
    });

    it('should handle verbose verbosity without context', async () => {
      const eventNoContext: TimeoutEvent = {
        ...mockEvent,
        allowed_context: undefined,
      };

      const backend = createConsoleBackend({ verbosity: 'verbose' });
      await backend.emit(eventNoContext);

      const call = errorSpy.mock.calls[0][0] as string;
      expect(call).not.toContain('context=');
    });

    it('should use correct severity prefix', async () => {
      const backend = createConsoleBackend({ verbosity: 'minimal' });

      const warningEvent = { ...mockEvent, severity: 'warning' as const };
      await backend.emit(warningEvent);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[WARNING]'));

      const criticalEvent = { ...mockEvent, severity: 'critical' as const };
      await backend.emit(criticalEvent);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[CRITICAL]'));
    });

    it('should not throw on emit error (best-effort)', async () => {
      errorSpy.mockImplementation(() => {
        throw new Error('Console error');
      });

      const backend = createConsoleBackend({ verbosity: 'standard' });

      // Should not throw
      await expect(backend.emit(mockEvent)).resolves.toBeUndefined();
    });
  });

  describe('flush', () => {
    it('should complete without error', async () => {
      const backend = createConsoleBackend({ verbosity: 'standard' });
      await expect(backend.flush()).resolves.toBeUndefined();
    });
  });

  describe('close', () => {
    it('should complete without error', async () => {
      const backend = createConsoleBackend({ verbosity: 'standard' });
      await expect(backend.close()).resolves.toBeUndefined();
    });
  });
});
