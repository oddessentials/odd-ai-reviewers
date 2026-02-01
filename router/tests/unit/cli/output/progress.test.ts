/**
 * Tests for CLI Progress Module
 *
 * Tests T020-T021: Spinner and agent status tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  UNICODE_SPINNER_FRAMES,
  ASCII_SPINNER_FRAMES,
  STATUS_INDICATORS,
  ASCII_STATUS_INDICATORS,
  Spinner,
  AgentProgress,
  formatDuration,
  formatAgentStatusLine,
  getSeverityIndicator,
} from '../../../../src/cli/output/progress.js';

describe('progress', () => {
  describe('spinner frames', () => {
    it('should have unicode spinner frames', () => {
      expect(UNICODE_SPINNER_FRAMES.length).toBeGreaterThan(0);
      expect(UNICODE_SPINNER_FRAMES).toContain('⠋');
    });

    it('should have ascii spinner frames', () => {
      expect(ASCII_SPINNER_FRAMES.length).toBeGreaterThan(0);
      expect(ASCII_SPINNER_FRAMES).toContain('|');
      expect(ASCII_SPINNER_FRAMES).toContain('/');
    });

    it('should have status indicators', () => {
      expect(STATUS_INDICATORS.pending).toBe('○');
      expect(STATUS_INDICATORS.success).toBe('✓');
      expect(STATUS_INDICATORS.failure).toBe('✗');
    });

    it('should have ascii status indicators', () => {
      expect(ASCII_STATUS_INDICATORS.success).toBe('+');
      expect(ASCII_STATUS_INDICATORS.failure).toBe('x');
    });
  });

  describe('Spinner (T020)', () => {
    let mockStream: {
      write: ReturnType<typeof vi.fn>;
      isTTY: boolean;
    };

    beforeEach(() => {
      mockStream = {
        write: vi.fn(),
        isTTY: true,
      };
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start spinner with text', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
      });
      spinner.start('Loading...');
      expect(mockStream.write).toHaveBeenCalled();
      spinner.stop();
    });

    it('should update spinner text', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
      });
      spinner.start('Loading...');
      spinner.update('Processing...');
      expect(mockStream.write).toHaveBeenCalled();
      spinner.stop();
    });

    it('should stop spinner and clear line', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
      });
      spinner.start('Loading...');
      spinner.stop();
      // Should write clear sequence
      expect(mockStream.write).toHaveBeenCalledWith('\r\x1b[K');
    });

    it('should succeed with green checkmark', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
        colored: true,
      });
      spinner.start('Loading...');
      spinner.succeed('Done!');
      const lastCall = mockStream.write.mock.calls[mockStream.write.mock.calls.length - 1];
      expect(lastCall?.[0]).toContain('✓');
      expect(lastCall?.[0]).toContain('Done!');
    });

    it('should fail with red X', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
        colored: true,
      });
      spinner.start('Loading...');
      spinner.fail('Error!');
      const lastCall = mockStream.write.mock.calls[mockStream.write.mock.calls.length - 1];
      expect(lastCall?.[0]).toContain('✗');
      expect(lastCall?.[0]).toContain('Error!');
    });

    it('should use ASCII frames when configured', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
        useAscii: true,
        colored: false,
      });
      spinner.start('Loading...');
      const calls = mockStream.write.mock.calls;
      const firstCall = calls[0]?.[0] ?? '';
      // Should contain an ASCII spinner character
      expect(ASCII_SPINNER_FRAMES.some((frame) => firstCall.includes(frame))).toBe(true);
      spinner.stop();
    });

    it('should track elapsed time', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
      });
      spinner.start('Loading...');
      vi.advanceTimersByTime(1500);
      const elapsed = spinner.getElapsed();
      expect(elapsed).toBeGreaterThanOrEqual(1500);
      spinner.stop();
    });

    it('should format elapsed time correctly', () => {
      const spinner = new Spinner({
        stream: mockStream as unknown as NodeJS.WriteStream,
      });
      spinner.start('Loading...');
      vi.advanceTimersByTime(2500);
      const formatted = spinner.getFormattedElapsed();
      expect(formatted).toMatch(/^\d+(\.\d)?s$/);
      spinner.stop();
    });
  });

  describe('AgentProgress (T021)', () => {
    it('should track agent status', () => {
      const progress = new AgentProgress();
      progress.addAgent('semgrep', 'Semgrep');

      const agent = progress.getAgent('semgrep');
      expect(agent?.status).toBe('pending');
    });

    it('should mark agent as started', () => {
      const progress = new AgentProgress();
      progress.addAgent('semgrep', 'Semgrep');
      progress.startAgent('semgrep');

      const agent = progress.getAgent('semgrep');
      expect(agent?.status).toBe('running');
      expect(agent?.startTime).toBeDefined();
    });

    it('should mark agent as completed', () => {
      const progress = new AgentProgress();
      progress.addAgent('semgrep', 'Semgrep');
      progress.startAgent('semgrep');
      progress.completeAgent('semgrep', 5);

      const agent = progress.getAgent('semgrep');
      expect(agent?.status).toBe('done');
      expect(agent?.findingsCount).toBe(5);
      expect(agent?.endTime).toBeDefined();
    });

    it('should mark agent as failed', () => {
      const progress = new AgentProgress();
      progress.addAgent('semgrep', 'Semgrep');
      progress.startAgent('semgrep');
      progress.failAgent('semgrep', 'timeout');

      const agent = progress.getAgent('semgrep');
      expect(agent?.status).toBe('failed');
      expect(agent?.reason).toBe('timeout');
    });

    it('should mark agent as skipped', () => {
      const progress = new AgentProgress();
      progress.addAgent('semgrep', 'Semgrep');
      progress.skipAgent('semgrep', 'not configured');

      const agent = progress.getAgent('semgrep');
      expect(agent?.status).toBe('skipped');
      expect(agent?.reason).toBe('not configured');
    });

    it('should get all agents', () => {
      const progress = new AgentProgress();
      progress.addAgent('semgrep', 'Semgrep');
      progress.addAgent('opencode', 'OpenCode');

      const agents = progress.getAllAgents();
      expect(agents).toHaveLength(2);
    });

    it('should get summary by status', () => {
      const progress = new AgentProgress();
      progress.addAgent('a1', 'Agent 1');
      progress.addAgent('a2', 'Agent 2');
      progress.addAgent('a3', 'Agent 3');
      progress.completeAgent('a1', 0);
      progress.failAgent('a2', 'error');

      const summary = progress.getSummary();
      expect(summary.done).toBe(1);
      expect(summary.failed).toBe(1);
      expect(summary.pending).toBe(1);
    });

    it('should format agent status line', () => {
      const progress = new AgentProgress({ colored: false });
      progress.addAgent('semgrep', 'Semgrep');
      progress.completeAgent('semgrep', 3);

      const status = progress.formatAgentStatus('semgrep');
      expect(status).toContain('Semgrep');
      expect(status).toContain('3 findings');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1500)).toBe('1.5s');
    });

    it('should format minutes', () => {
      expect(formatDuration(90000)).toBe('1m30s');
    });

    it('should handle zero', () => {
      expect(formatDuration(0)).toBe('0ms');
    });
  });

  describe('formatAgentStatusLine', () => {
    it('should format pending agent', () => {
      const agent = { agentId: 'test', agentName: 'Test Agent', status: 'pending' as const };
      const line = formatAgentStatusLine(agent, false);
      expect(line).toContain('○');
      expect(line).toContain('Test Agent');
    });

    it('should format done agent with findings', () => {
      const agent = {
        agentId: 'test',
        agentName: 'Test Agent',
        status: 'done' as const,
        startTime: 1000,
        endTime: 2500,
        findingsCount: 5,
      };
      const line = formatAgentStatusLine(agent, false);
      expect(line).toContain('✓');
      expect(line).toContain('5 findings');
      expect(line).toContain('1.5s');
    });

    it('should format failed agent with reason', () => {
      const agent = {
        agentId: 'test',
        agentName: 'Test Agent',
        status: 'failed' as const,
        startTime: 1000,
        endTime: 2000,
        reason: 'timeout',
      };
      const line = formatAgentStatusLine(agent, false);
      expect(line).toContain('✗');
      expect(line).toContain('timeout');
    });

    it('should use ASCII indicators when configured', () => {
      const agent = {
        agentId: 'test',
        agentName: 'Test',
        status: 'done' as const,
        findingsCount: 0,
      };
      const line = formatAgentStatusLine(agent, false, true);
      expect(line).toContain('+');
    });

    it('should handle singular finding', () => {
      const agent = {
        agentId: 'test',
        agentName: 'Test',
        status: 'done' as const,
        findingsCount: 1,
      };
      const line = formatAgentStatusLine(agent, false);
      expect(line).toContain('1 finding');
      expect(line).not.toContain('1 findings');
    });
  });

  describe('getSeverityIndicator', () => {
    it('should return emoji for error', () => {
      expect(getSeverityIndicator('error', true)).toBe('🔴');
    });

    it('should return emoji for warning', () => {
      expect(getSeverityIndicator('warning', true)).toBe('🟡');
    });

    it('should return emoji for info', () => {
      expect(getSeverityIndicator('info', true)).toBe('🔵');
    });

    it('should return text for error without emoji', () => {
      expect(getSeverityIndicator('error', false)).toBe('[E]');
    });

    it('should return text for warning without emoji', () => {
      expect(getSeverityIndicator('warning', false)).toBe('[W]');
    });

    it('should return text for info without emoji', () => {
      expect(getSeverityIndicator('info', false)).toBe('[I]');
    });
  });
});
