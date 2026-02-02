/**
 * Signal Handling Module Tests
 *
 * Tests for graceful shutdown handling via SIGINT/SIGTERM signals.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupSignalHandlers,
  isShutdownTriggered,
  getShutdownState,
  resetShutdownState,
  setPartialResultsContext,
  getPartialResultsContext,
  updatePartialResultsContext,
  clearPartialResultsContext,
  formatPartialResultsMessage,
} from '../../../src/cli/signals.js';

describe('signals', () => {
  beforeEach(() => {
    // Reset state before each test
    resetShutdownState();
  });

  afterEach(() => {
    // Clean up after each test
    resetShutdownState();
  });

  describe('setupSignalHandlers', () => {
    it('should initialize shutdown state as not triggered', () => {
      setupSignalHandlers();

      expect(isShutdownTriggered()).toBe(false);
      expect(getShutdownState().triggered).toBe(false);
    });

    it('should accept custom cleanup function', () => {
      const cleanup = vi.fn();

      setupSignalHandlers({ cleanup });

      // State should be initialized
      expect(isShutdownTriggered()).toBe(false);
    });

    it('should accept custom logger', () => {
      const logger = {
        log: vi.fn(),
        warn: vi.fn(),
      };

      setupSignalHandlers({ logger });

      expect(isShutdownTriggered()).toBe(false);
    });
  });

  describe('isShutdownTriggered', () => {
    it('should return false initially', () => {
      setupSignalHandlers();

      expect(isShutdownTriggered()).toBe(false);
    });
  });

  describe('getShutdownState', () => {
    it('should return a copy of the shutdown state', () => {
      setupSignalHandlers();

      const state1 = getShutdownState();
      const state2 = getShutdownState();

      // Should be equal but not the same object (copy)
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });

    it('should include all expected fields', () => {
      setupSignalHandlers();

      const state = getShutdownState();

      expect(state).toHaveProperty('triggered');
      expect(typeof state.triggered).toBe('boolean');
    });
  });

  describe('resetShutdownState', () => {
    it('should reset the shutdown state', () => {
      setupSignalHandlers();

      // State should start clean
      expect(isShutdownTriggered()).toBe(false);

      resetShutdownState();

      expect(isShutdownTriggered()).toBe(false);
    });
  });

  describe('partial results context', () => {
    describe('setPartialResultsContext', () => {
      it('should set the partial results context', () => {
        const context = {
          totalAgents: 5,
          completedAgents: 2,
          completedAgentNames: ['semgrep', 'opencode'],
          currentAgent: 'pr_agent',
        };

        setPartialResultsContext(context);

        const retrieved = getPartialResultsContext();
        expect(retrieved).toEqual(context);
      });
    });

    describe('getPartialResultsContext', () => {
      it('should return undefined if not set', () => {
        clearPartialResultsContext();

        expect(getPartialResultsContext()).toBeUndefined();
      });

      it('should return a copy of the context', () => {
        const context = {
          totalAgents: 3,
          completedAgents: 1,
          completedAgentNames: ['semgrep'],
        };

        setPartialResultsContext(context);

        const ctx1 = getPartialResultsContext();
        const ctx2 = getPartialResultsContext();

        expect(ctx1).toEqual(ctx2);
        expect(ctx1).not.toBe(ctx2); // Should be copies
      });
    });

    describe('updatePartialResultsContext', () => {
      it('should update partial fields', () => {
        setPartialResultsContext({
          totalAgents: 5,
          completedAgents: 0,
          completedAgentNames: [],
        });

        updatePartialResultsContext({
          completedAgents: 1,
          completedAgentNames: ['semgrep'],
        });

        const ctx = getPartialResultsContext();
        expect(ctx?.completedAgents).toBe(1);
        expect(ctx?.completedAgentNames).toEqual(['semgrep']);
        expect(ctx?.totalAgents).toBe(5); // Unchanged
      });

      it('should do nothing if context not set', () => {
        clearPartialResultsContext();

        // Should not throw
        updatePartialResultsContext({ completedAgents: 1 });

        expect(getPartialResultsContext()).toBeUndefined();
      });
    });

    describe('clearPartialResultsContext', () => {
      it('should clear the context', () => {
        setPartialResultsContext({
          totalAgents: 5,
          completedAgents: 3,
          completedAgentNames: ['a', 'b', 'c'],
        });

        clearPartialResultsContext();

        expect(getPartialResultsContext()).toBeUndefined();
      });
    });
  });

  describe('formatPartialResultsMessage', () => {
    it('should format message with completion percentage', () => {
      const context = {
        totalAgents: 4,
        completedAgents: 2,
        completedAgentNames: ['semgrep', 'opencode'],
        currentAgent: 'pr_agent',
      };

      const lines = formatPartialResultsMessage(context);

      expect(lines[0]).toContain('interrupted at 50%');
    });

    it('should list completed agents with checkmarks', () => {
      const context = {
        totalAgents: 3,
        completedAgents: 2,
        completedAgentNames: ['semgrep', 'opencode'],
        currentAgent: 'pr_agent',
      };

      const lines = formatPartialResultsMessage(context);
      const output = lines.join('\n');

      expect(output).toContain('semgrep ✓');
      expect(output).toContain('opencode ✓');
      expect(output).toContain('pr_agent ✗ interrupted');
    });

    it('should show 0% for no completed agents', () => {
      const context = {
        totalAgents: 3,
        completedAgents: 0,
        completedAgentNames: [],
        currentAgent: 'semgrep',
      };

      const lines = formatPartialResultsMessage(context);

      expect(lines[0]).toContain('interrupted at 0%');
    });

    it('should handle edge case of zero total agents', () => {
      const context = {
        totalAgents: 0,
        completedAgents: 0,
        completedAgentNames: [],
      };

      const lines = formatPartialResultsMessage(context);

      expect(lines[0]).toContain('interrupted at 0%');
    });
  });
});
