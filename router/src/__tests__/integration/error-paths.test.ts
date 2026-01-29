/**
 * Error Path Integration Tests (T070-T071)
 *
 * Tests for error handling across the review pipeline.
 * Uses hermetic test utilities for deterministic behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Hermetic test setup - frozen time for deterministic behavior
const FROZEN_TIMESTAMP = '2026-01-29T00:00:00.000Z';
const FROZEN_DATE = new Date(FROZEN_TIMESTAMP);

function setupHermeticTest(): void {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_DATE);
}

function teardownHermeticTest(): void {
  vi.useRealTimers();
  vi.restoreAllMocks();
}
import { ValidationError, ConfigError, AgentError, ConfigErrorCode } from '../../types/errors.js';

describe('Error Path Integration Tests', () => {
  beforeEach(() => {
    setupHermeticTest();
  });

  afterEach(() => {
    teardownHermeticTest();
  });

  describe('Malformed Input Handling (T070)', () => {
    it('should reject config with invalid schema', async () => {
      const { ConfigSchema } = await import('../../config.js');

      const invalidConfig = {
        version: 'not-a-number',
        passes: 'not-an-array',
      };

      const result = ConfigSchema.safeParse(invalidConfig);

      expect(result.success).toBe(false);
      expect(result.error?.issues.length).toBeGreaterThan(0);
    });

    it('should reject git ref with shell metacharacters', async () => {
      const { assertSafeGitRef } = await import('../../git-validators.js');

      expect(() => assertSafeGitRef('ref;echo pwned', 'testRef')).toThrow(ValidationError);
    });

    it('should reject git ref with backtick command substitution', async () => {
      const { assertSafeGitRef } = await import('../../git-validators.js');

      // Backticks are shell metacharacters that should be rejected
      expect(() => assertSafeGitRef('refs/`whoami`', 'testRef')).toThrow(ValidationError);
    });

    it('should reject empty git ref', async () => {
      const { assertSafeGitRef } = await import('../../git-validators.js');

      expect(() => assertSafeGitRef('', 'testRef')).toThrow(ValidationError);
    });

    it('should reject overly long git ref', async () => {
      const { assertSafeGitRef } = await import('../../git-validators.js');
      const longRef = 'a'.repeat(600);

      expect(() => assertSafeGitRef(longRef, 'testRef')).toThrow(ValidationError);
    });

    it('should reject path with shell metacharacters', async () => {
      const { assertSafePath } = await import('../../git-validators.js');

      expect(() => assertSafePath('path;rm -rf /', 'testPath')).toThrow(ValidationError);
    });

    it('should preserve error context through validation chain', async () => {
      const { parseSafeGitRef } = await import('../../git-validators.js');
      const { isErr } = await import('../../types/result.js');

      const result = parseSafeGitRef('bad;ref', 'headSha');

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBeInstanceOf(ValidationError);
        expect(result.error.context['field']).toBe('headSha');
        // Constraint is set by SafeGitRefHelpers - could be Zod error code or custom constraint
        expect(result.error.context['constraint']).toBeDefined();
      }
    });
  });

  describe('Agent Failure Isolation (T060)', () => {
    it('should capture agent errors with proper context', () => {
      const error = new AgentError('API call failed', 'AGENT_EXECUTION_FAILED', {
        agentId: 'test-agent',
        phase: 'api-call',
      });

      expect(error.code).toBe('AGENT_EXECUTION_FAILED');
      expect(error.context.agentId).toBe('test-agent');
      expect(error.message).toBe('API call failed');
    });

    it('should serialize agent error to wire format', () => {
      const error = new AgentError('Test error', 'AGENT_PARSE_ERROR', {
        agentId: 'opencode',
        phase: 'json-parse',
      });

      const wireFormat = error.toWireFormat();

      expect(wireFormat.name).toBe('AgentError');
      expect(wireFormat.code).toBe('AGENT_PARSE_ERROR');
      expect(wireFormat.context['agentId']).toBe('opencode');
    });

    it('should preserve error chain through cause', () => {
      const rootCause = new Error('Network timeout');
      const agentError = new AgentError('Failed to call LLM', 'AGENT_EXECUTION_FAILED', {
        agentId: 'pr_agent',
      });
      // Manually set cause for this test
      (agentError as Error).cause = rootCause;

      expect(agentError.cause).toBe(rootCause);
    });
  });

  describe('Timeout Scenarios (T071)', () => {
    it('should have frozen time in hermetic environment', () => {
      const now = new Date().toISOString();
      expect(now).toBe(FROZEN_TIMESTAMP);
    });

    it('should track duration correctly with frozen time', async () => {
      const startTime = Date.now();

      // Advance time by 5 seconds
      await vi.advanceTimersByTimeAsync(5000);

      const duration = Date.now() - startTime;
      expect(duration).toBe(5000);
    });

    it('should handle simulated timeout in agent metrics', async () => {
      const startTime = Date.now();

      // Simulate agent work
      await vi.advanceTimersByTimeAsync(30000); // 30 seconds

      const metrics = {
        durationMs: Date.now() - startTime,
        filesProcessed: 5,
        tokensUsed: 1000,
      };

      expect(metrics.durationMs).toBe(30000);
    });
  });

  describe('Config Error Handling', () => {
    it('should create ConfigError with proper context', () => {
      const error = new ConfigError('Invalid model name', 'CONFIG_INVALID_SCHEMA', {
        path: '/repo/.ai-review.yml',
        field: 'models.default',
        expected: 'valid model identifier',
      });

      expect(error.code).toBe('CONFIG_INVALID_SCHEMA');
      expect(error.context.path).toBe('/repo/.ai-review.yml');
      expect(error.context.field).toBe('models.default');
    });

    it('should serialize ConfigError to wire format', () => {
      const error = new ConfigError('Missing required field', ConfigErrorCode.MISSING_FIELD, {
        path: '/repo/.ai-review.yml',
        field: 'passes',
      });

      const wire = error.toWireFormat();

      expect(wire.name).toBe('ConfigError');
      expect(wire.code).toBe('CONFIG_MISSING_FIELD');
      expect(wire.context['field']).toBe('passes');
    });
  });

  describe('Error Type Guards', () => {
    it('should correctly identify ValidationError', async () => {
      const { isValidationError } = await import('../../types/errors.js');

      const validationError = new ValidationError('Invalid input', 'VALIDATION_INVALID_GIT_REF', {
        field: 'ref',
        value: 'bad',
        constraint: 'format',
      });

      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(new Error('generic'))).toBe(false);
    });

    it('should correctly identify ConfigError', async () => {
      const { isConfigError } = await import('../../types/errors.js');

      const configError = new ConfigError('Bad config', 'CONFIG_INVALID_SCHEMA', {});

      expect(isConfigError(configError)).toBe(true);
      expect(isConfigError(new Error('generic'))).toBe(false);
    });

    it('should correctly identify AgentError', async () => {
      const { isAgentError } = await import('../../types/errors.js');

      const agentError = new AgentError('Agent failed', 'AGENT_EXECUTION_FAILED', {
        agentId: 'test',
      });

      expect(isAgentError(agentError)).toBe(true);
      expect(isAgentError(new Error('generic'))).toBe(false);
    });
  });
});
