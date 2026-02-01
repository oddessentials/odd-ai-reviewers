/**
 * Tests for CLI progress utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Writable } from 'stream';
import {
  Spinner,
  AgentProgressTracker,
  formatAgentStatus,
  type AgentProgress,
} from '../../../cli/output/progress.js';
import { ANSI } from '../../../cli/output/colors.js';

// Mock stream for testing
function createMockStream(): { stream: NodeJS.WriteStream; output: string[] } {
  const output: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output.push(chunk.toString());
      callback();
    },
  }) as NodeJS.WriteStream;
  return { stream, output };
}

describe('Spinner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts and stops without errors', () => {
    const { stream } = createMockStream();
    const spinner = new Spinner({ stream, colored: false });
    spinner.start('Loading...');
    vi.advanceTimersByTime(100);
    spinner.stop();
    // No errors thrown
  });

  it('updates text while running', () => {
    const { stream, output } = createMockStream();
    const spinner = new Spinner({ stream, colored: false, interval: 50 });
    spinner.start('Initial');
    vi.advanceTimersByTime(60);
    spinner.update('Updated');
    vi.advanceTimersByTime(60);
    spinner.stop();

    // Should have written multiple times
    expect(output.length).toBeGreaterThan(1);
    expect(output.some((o) => o.includes('Updated'))).toBe(true);
  });

  it('succeed() shows green checkmark', () => {
    const { stream, output } = createMockStream();
    const spinner = new Spinner({ stream, colored: true });
    spinner.start('Working');
    spinner.succeed('Done');

    expect(output.some((o) => o.includes('✓'))).toBe(true);
    expect(output.some((o) => o.includes('Done'))).toBe(true);
  });

  it('fail() shows red X', () => {
    const { stream, output } = createMockStream();
    const spinner = new Spinner({ stream, colored: true });
    spinner.start('Working');
    spinner.fail('Error');

    expect(output.some((o) => o.includes('✗'))).toBe(true);
    expect(output.some((o) => o.includes('Error'))).toBe(true);
  });

  it('uses ASCII fallback when specified', () => {
    const { stream, output } = createMockStream();
    const spinner = new Spinner({ stream, colored: false, ascii: true });
    spinner.start('Loading');
    vi.advanceTimersByTime(100);
    spinner.stop();

    // ASCII spinners use |, /, -, \
    expect(output.some((o) => /[|/\-\\]/.test(o))).toBe(true);
  });
});

describe('formatAgentStatus', () => {
  it('formats pending agent', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'pending',
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toBe('○ Test Agent');
  });

  it('formats running agent with elapsed time', () => {
    const now = Date.now();
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'running',
      startTime: now - 2500, // 2.5 seconds ago
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toContain('◐ Test Agent');
    expect(result).toMatch(/\[\d+\.\d+s\]/);
  });

  it('formats successful agent with findings', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'success',
      startTime: 1000,
      endTime: 3500,
      findingsCount: 5,
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toContain('✓ Test Agent');
    expect(result).toContain('[2.5s]');
    expect(result).toContain('5 findings');
  });

  it('formats single finding correctly', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'success',
      findingsCount: 1,
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toContain('1 finding');
    expect(result).not.toContain('findings');
  });

  it('formats failed agent with reason', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'failure',
      reason: 'timeout',
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toContain('✗ Test Agent');
    expect(result).toContain('(timeout)');
  });

  it('formats skipped agent with reason', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'skipped',
      reason: 'no matching files',
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toContain('⊘ Test Agent');
    expect(result).toContain('(no matching files)');
  });

  it('formats interrupted agent', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'interrupted',
    };
    const result = formatAgentStatus(agent, false);
    expect(result).toContain('⚡ Test Agent');
  });

  it('adds colors when enabled', () => {
    const agent: AgentProgress = {
      agentId: 'test',
      agentName: 'Test Agent',
      status: 'success',
    };
    const result = formatAgentStatus(agent, true);
    expect(result).toContain(ANSI.green);
    expect(result).toContain(ANSI.reset);
  });
});

describe('AgentProgressTracker', () => {
  it('registers and tracks agents', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');
    tracker.register('agent2', 'Agent Two');

    const agents = tracker.getAll();
    expect(agents).toHaveLength(2);
    expect(agents[0]?.status).toBe('pending');
    expect(agents[1]?.status).toBe('pending');
  });

  it('updates agent status through lifecycle', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');

    tracker.start('agent1');
    expect(tracker.getAll()[0]?.status).toBe('running');
    expect(tracker.getAll()[0]?.startTime).toBeDefined();

    tracker.complete('agent1', 3);
    expect(tracker.getAll()[0]?.status).toBe('success');
    expect(tracker.getAll()[0]?.findingsCount).toBe(3);
  });

  it('tracks failures', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');
    tracker.start('agent1');
    tracker.fail('agent1', 'timeout');

    expect(tracker.getAll()[0]?.status).toBe('failure');
    expect(tracker.getAll()[0]?.reason).toBe('timeout');
  });

  it('tracks skipped agents', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');
    tracker.skip('agent1', 'no files');

    expect(tracker.getAll()[0]?.status).toBe('skipped');
    expect(tracker.getAll()[0]?.reason).toBe('no files');
  });

  it('calculates completion percentage', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');
    tracker.register('agent2', 'Agent Two');
    tracker.register('agent3', 'Agent Three');

    expect(tracker.getCompletionPercentage()).toBe(0);

    tracker.start('agent1');
    tracker.complete('agent1', 1);
    expect(tracker.getCompletionPercentage()).toBe(33);

    tracker.start('agent2');
    tracker.complete('agent2', 2);
    expect(tracker.getCompletionPercentage()).toBe(67);

    tracker.skip('agent3', 'skipped');
    expect(tracker.getCompletionPercentage()).toBe(100);
  });

  it('returns 100% for empty tracker', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    expect(tracker.getCompletionPercentage()).toBe(100);
  });

  it('handles interrupt', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');
    tracker.start('agent1');
    tracker.interrupt('agent1');

    expect(tracker.getAll()[0]?.status).toBe('interrupted');
  });

  it('only interrupts running agents', () => {
    const tracker = new AgentProgressTracker({ colored: false });
    tracker.register('agent1', 'Agent One');
    tracker.interrupt('agent1'); // Should not change pending to interrupted

    expect(tracker.getAll()[0]?.status).toBe('pending');
  });
});
