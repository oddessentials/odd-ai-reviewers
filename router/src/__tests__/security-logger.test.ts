/**
 * Security Logger Tests
 *
 * Comprehensive tests for the security logging module.
 *
 * @see FR-021, FR-022, FR-023
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  logSecurityEvent,
  hashPattern,
  startRun,
  getRunSummary,
  getRunEvents,
  getCurrentRunId,
  isLoggingDegraded,
  type SecurityEventInput,
} from '../security-logger.js';

describe('Security Logger', () => {
  // Capture stderr output
  let stderrOutput: string[] = [];
  const originalStderrWrite = process.stderr.write;

  beforeEach(() => {
    // Start fresh run for each test
    startRun();
    stderrOutput = [];

    // Mock stderr to capture output
    process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
      stderrOutput.push(chunk.toString());
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    // Restore stderr
    process.stderr.write = originalStderrWrite;
  });

  describe('hashPattern (FR-022)', () => {
    it('returns a 16-character hex string', () => {
      const hash = hashPattern('(a+)+');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('produces consistent hashes for the same pattern', () => {
      const hash1 = hashPattern('test-pattern');
      const hash2 = hashPattern('test-pattern');
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different patterns', () => {
      const hash1 = hashPattern('pattern-a');
      const hash2 = hashPattern('pattern-b');
      expect(hash1).not.toBe(hash2);
    });

    it('handles empty string', () => {
      const hash = hashPattern('');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('handles special characters', () => {
      const hash = hashPattern('.*?[\\n\\t]+$');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('logSecurityEvent (FR-024)', () => {
    it('logs events with all required fields (FR-021)', () => {
      const input: SecurityEventInput = {
        category: 'regex_validation',
        ruleId: 'test-rule-001',
        file: 'src/test.ts',
        pattern: '(a+)+',
        durationMs: 5.5,
        outcome: 'success',
      };

      logSecurityEvent(input);

      const events = getRunEvents();
      expect(events.length).toBe(1);

      const event = events[0];
      expect(event?.category).toBe('regex_validation');
      expect(event?.ruleId).toBe('test-rule-001');
      expect(event?.file).toBe('src/test.ts');
      expect(event?.durationMs).toBe(5.5);
      expect(event?.outcome).toBe('success');
      expect(event?.timestamp).toBeDefined();
      expect(event?.runId).toBeDefined();
    });

    it('includes patternHash instead of raw pattern (FR-022)', () => {
      const rawPattern = '(sensitive-pattern)+';

      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'test-rule',
        file: 'test.ts',
        pattern: rawPattern,
        durationMs: 1,
        outcome: 'success',
      });

      const events = getRunEvents();
      const event = events[0];

      // Should have hash
      expect(event?.patternHash).toMatch(/^[a-f0-9]{16}$/);

      // Raw pattern should NOT appear in event
      expect(JSON.stringify(event)).not.toContain(rawPattern);
    });

    it('no raw patterns appear in log output (FR-022)', () => {
      const rawPattern = 'secret-pattern-123';

      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'test',
        file: 'test.ts',
        pattern: rawPattern,
        durationMs: 1,
        outcome: 'success',
      });

      // Check all stderr output
      const allOutput = stderrOutput.join('');
      expect(allOutput).not.toContain(rawPattern);
    });

    it('includes errorReason for failure outcomes', () => {
      logSecurityEvent({
        category: 'mitigation_failed',
        ruleId: 'test-rule',
        file: 'test.ts',
        pattern: 'invalid',
        durationMs: 1,
        outcome: 'failure',
        errorReason: 'invalid_regex',
      });

      const events = getRunEvents();
      expect(events[0]?.errorReason).toBe('invalid_regex');
    });

    it('writes to stderr in JSON format', () => {
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'test',
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      expect(stderrOutput.length).toBeGreaterThan(0);
      const logLine = stderrOutput[0] ?? '';
      expect(logLine).toContain('[security]');

      // Extract JSON from log line
      const jsonPart = logLine.replace('[security] ', '').trim();
      const parsed = JSON.parse(jsonPart);
      expect(parsed.level).toBe('security');
      expect(parsed.category).toBe('regex_validation');
    });
  });

  describe('Fail-Safe Behavior (FR-023)', () => {
    it('logging failures do not throw exceptions', () => {
      // Even with invalid input, should not throw
      expect(() => {
        logSecurityEvent({
          category: 'regex_validation',
          ruleId: '', // Invalid: empty string
          file: 'test.ts',
          pattern: 'test',
          durationMs: 1,
          outcome: 'success',
        });
      }).not.toThrow();
    });

    it('marks logger as degraded on validation failure', () => {
      // Valid input first
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'valid-rule',
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      expect(isLoggingDegraded()).toBe(false);

      // Invalid input (empty ruleId)
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: '', // Invalid
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      expect(isLoggingDegraded()).toBe(true);
    });

    it('continues logging after a failure', () => {
      // Invalid input
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: '', // Invalid
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      // Valid input after failure
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'valid-rule',
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      const events = getRunEvents();
      // Should have at least the valid event
      expect(events.some((e) => e.ruleId === 'valid-rule')).toBe(true);
    });

    it('writes degraded status to stderr on failure', () => {
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: '', // Invalid
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      const allOutput = stderrOutput.join('');
      expect(allOutput).toContain('LOGGING_DEGRADED');
    });
  });

  describe('Run Management', () => {
    it('startRun generates unique run IDs', () => {
      const id1 = startRun();
      const id2 = startRun();
      expect(id1).not.toBe(id2);
    });

    it('getCurrentRunId returns the active run ID', () => {
      const id = startRun();
      expect(getCurrentRunId()).toBe(id);
    });

    it('events are associated with current run', () => {
      const runId = startRun();

      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'test',
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      const events = getRunEvents();
      expect(events[0]?.runId).toBe(runId);
    });

    it('startRun clears previous events', () => {
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'test',
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      expect(getRunEvents().length).toBe(1);

      startRun();

      expect(getRunEvents().length).toBe(0);
    });
  });

  describe('Run Summary', () => {
    it('calculates correct event counts', () => {
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'rule1',
        file: 'test.ts',
        pattern: 'p1',
        durationMs: 10,
        outcome: 'success',
      });

      logSecurityEvent({
        category: 'mitigation_failed',
        ruleId: 'rule2',
        file: 'test.ts',
        pattern: 'p2',
        durationMs: 20,
        outcome: 'failure',
        errorReason: 'invalid_regex',
      });

      logSecurityEvent({
        category: 'regex_validation',
        ruleId: 'rule3',
        file: 'test.ts',
        pattern: 'p3',
        durationMs: 30,
        outcome: 'timeout',
      });

      const summary = getRunSummary();

      expect(summary.totalEvents).toBe(3);
      expect(summary.successCount).toBe(1);
      expect(summary.failureCount).toBe(1);
      expect(summary.timeoutCount).toBe(1);
      expect(summary.totalDurationMs).toBe(60);
    });

    it('tracks logging failures in summary', () => {
      // Cause a logging failure
      logSecurityEvent({
        category: 'regex_validation',
        ruleId: '', // Invalid
        file: 'test.ts',
        pattern: 'test',
        durationMs: 1,
        outcome: 'success',
      });

      const summary = getRunSummary();

      expect(summary.loggingFailuresTotal).toBeGreaterThan(0);
      expect(summary.loggingDegraded).toBe(true);
    });
  });

  describe('Structured Fields (FR-021)', () => {
    it('all events have required structured fields', () => {
      const categories: ('regex_validation' | 'mitigation_applied' | 'mitigation_failed')[] = [
        'regex_validation',
        'mitigation_applied',
        'mitigation_failed',
      ];

      for (const category of categories) {
        startRun();

        logSecurityEvent({
          category,
          ruleId: 'test-rule',
          file: 'test.ts',
          pattern: 'test-pattern',
          durationMs: 5,
          outcome: 'success',
        });

        const events = getRunEvents();
        const event = events[0];

        // Verify all required fields
        expect(event?.category).toBe(category);
        expect(event?.ruleId).toBe('test-rule');
        expect(event?.file).toBe('test.ts');
        expect(event?.patternHash).toMatch(/^[a-f0-9]{16}$/);
        expect(event?.durationMs).toBe(5);
        expect(event?.outcome).toBe('success');
        expect(event?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(event?.runId).toBeDefined();
      }
    });
  });
});
