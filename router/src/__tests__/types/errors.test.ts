/**
 * Error Type Tests
 *
 * Tests for:
 * - Error serialization round-trip (T015)
 * - Error cause chaining (T016)
 * - Error type guards (T017)
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigError,
  ConfigErrorCode,
  AgentError,
  AgentErrorCode,
  NetworkError,
  NetworkErrorCode,
  ValidationError,
  ValidationErrorCode,
  isConfigError,
  isAgentError,
  isNetworkError,
  isValidationError,
  isBaseError,
  errorFromWireFormat,
  type ErrorWireFormat,
} from '../../types/errors.js';

describe('Error Types', () => {
  describe('ConfigError', () => {
    it('should create with correct properties', () => {
      const error = new ConfigError('Invalid config', ConfigErrorCode.INVALID_SCHEMA, {
        path: '/config.yml',
        field: 'passes',
      });

      expect(error.name).toBe('ConfigError');
      expect(error.code).toBe('CONFIG_INVALID_SCHEMA');
      expect(error.message).toBe('Invalid config');
      expect(error.context.path).toBe('/config.yml');
      expect(error.context.field).toBe('passes');
      expect(error.stack).toBeDefined();
    });

    it('should preserve cause', () => {
      const cause = new Error('Parse failed');
      const error = new ConfigError(
        'Config load failed',
        ConfigErrorCode.PARSE_ERROR,
        {},
        { cause }
      );

      expect(error.cause).toBe(cause);
    });
  });

  describe('AgentError', () => {
    it('should create with required agentId', () => {
      const error = new AgentError('Agent crashed', AgentErrorCode.EXECUTION_FAILED, {
        agentId: 'semgrep',
        phase: 'analysis',
      });

      expect(error.name).toBe('AgentError');
      expect(error.code).toBe('AGENT_EXECUTION_FAILED');
      expect(error.context.agentId).toBe('semgrep');
      expect(error.context.phase).toBe('analysis');
    });
  });

  describe('NetworkError', () => {
    it('should create with network context', () => {
      const error = new NetworkError('API unavailable', NetworkErrorCode.CONNECTION_FAILED, {
        url: 'https://api.github.com',
        status: 503,
        provider: 'github',
      });

      expect(error.name).toBe('NetworkError');
      expect(error.code).toBe('NETWORK_CONNECTION_FAILED');
      expect(error.context.url).toBe('https://api.github.com');
      expect(error.context.status).toBe(503);
      expect(error.context.provider).toBe('github');
    });
  });

  describe('ValidationError', () => {
    it('should create with validation context', () => {
      const error = new ValidationError('Invalid git ref', ValidationErrorCode.INVALID_GIT_REF, {
        field: 'ref',
        value: '../../../etc/passwd',
        constraint: 'safe-characters',
      });

      expect(error.name).toBe('ValidationError');
      expect(error.code).toBe('VALIDATION_INVALID_GIT_REF');
      expect(error.context.field).toBe('ref');
      expect(error.context.value).toBe('../../../etc/passwd');
    });
  });

  describe('Error Serialization Round-Trip (T015)', () => {
    it('should round-trip ConfigError through wire format', () => {
      const original = new ConfigError('Test error', ConfigErrorCode.INVALID_VALUE, {
        path: '/test',
        field: 'value',
        expected: 'number',
        actual: 'string',
      });

      const wire = original.toWireFormat();
      const restored = ConfigError.fromWireFormat(wire);

      expect(restored.name).toBe(original.name);
      expect(restored.code).toBe(original.code);
      expect(restored.message).toBe(original.message);
      expect(restored.context).toEqual(original.context);
    });

    it('should round-trip AgentError through wire format', () => {
      const original = new AgentError('Agent failed', AgentErrorCode.TIMEOUT, {
        agentId: 'opencode',
        phase: 'execution',
        input: { file: 'test.ts' },
      });

      const wire = original.toWireFormat();
      const restored = AgentError.fromWireFormat(wire);

      expect(restored.name).toBe(original.name);
      expect(restored.code).toBe(original.code);
      expect(restored.message).toBe(original.message);
      expect(restored.context.agentId).toBe(original.context.agentId);
    });

    it('should round-trip NetworkError through wire format', () => {
      const original = new NetworkError('Rate limited', NetworkErrorCode.RATE_LIMITED, {
        url: 'https://api.openai.com',
        status: 429,
        provider: 'openai',
      });

      const wire = original.toWireFormat();
      const restored = NetworkError.fromWireFormat(wire);

      expect(restored.name).toBe(original.name);
      expect(restored.code).toBe(original.code);
      expect(restored.context).toEqual(original.context);
    });

    it('should round-trip ValidationError through wire format', () => {
      const original = new ValidationError('Invalid path', ValidationErrorCode.INVALID_PATH, {
        field: 'filePath',
        value: '../../secret',
        constraint: 'no-traversal',
      });

      const wire = original.toWireFormat();
      const restored = ValidationError.fromWireFormat(wire);

      expect(restored.name).toBe(original.name);
      expect(restored.code).toBe(original.code);
      expect(restored.context).toEqual(original.context);
    });

    it('should preserve stack trace through serialization', () => {
      const original = new ConfigError('Test', ConfigErrorCode.FILE_NOT_FOUND, {});
      const wire = original.toWireFormat();

      expect(wire.stack).toBeDefined();
      expect(wire.stack).toContain('ConfigError');
    });

    it('should be JSON serializable', () => {
      const error = new AgentError('Test', AgentErrorCode.PARSE_ERROR, {
        agentId: 'test',
        input: { nested: { data: [1, 2, 3] } },
      });

      const wire = error.toWireFormat();
      const json = JSON.stringify(wire);
      const parsed = JSON.parse(json) as ErrorWireFormat;

      expect(parsed.name).toBe('AgentError');
      expect(parsed.code).toBe('AGENT_PARSE_ERROR');
    });
  });

  describe('Error Cause Chaining (T016)', () => {
    it('should preserve single-level cause chain', () => {
      const root = new ValidationError('Invalid input', ValidationErrorCode.INVALID_INPUT, {
        field: 'data',
      });
      const wrapper = new ConfigError(
        'Config validation failed',
        ConfigErrorCode.INVALID_SCHEMA,
        {},
        { cause: root }
      );

      const wire = wrapper.toWireFormat();

      expect(wire.cause).toBeDefined();
      expect(wire.cause?.name).toBe('ValidationError');
      expect(wire.cause?.code).toBe('VALIDATION_INVALID_INPUT');
    });

    it('should preserve multi-level cause chain', () => {
      const level1 = new Error('Network timeout');
      const level2 = new NetworkError(
        'API call failed',
        NetworkErrorCode.TIMEOUT,
        { url: 'http://test' },
        { cause: level1 }
      );
      const level3 = new AgentError(
        'Agent failed',
        AgentErrorCode.EXECUTION_FAILED,
        { agentId: 'test' },
        { cause: level2 }
      );

      const wire = level3.toWireFormat();

      expect(wire.cause).toBeDefined();
      expect(wire.cause?.name).toBe('NetworkError');
      expect(wire.cause?.cause).toBeDefined();
      expect(wire.cause?.cause?.name).toBe('Error');
    });

    it('should restore cause chain from wire format', () => {
      const root = new ValidationError('Root cause', ValidationErrorCode.CONSTRAINT_VIOLATED, {
        field: 'test',
      });
      const wrapper = new ConfigError('Wrapper', ConfigErrorCode.PARSE_ERROR, {}, { cause: root });

      const wire = wrapper.toWireFormat();
      const restored = ConfigError.fromWireFormat(wire);

      expect(restored.cause).toBeDefined();
      expect(restored.cause).toBeInstanceOf(Error);
      expect((restored.cause as ValidationError).code).toBe('VALIDATION_CONSTRAINT_VIOLATED');
    });

    it('should handle non-BaseError causes', () => {
      const standardError = new Error('Standard error');
      const wrapper = new AgentError(
        'Wrapper',
        AgentErrorCode.EXECUTION_FAILED,
        { agentId: 'test' },
        { cause: standardError }
      );

      const wire = wrapper.toWireFormat();

      expect(wire.cause).toBeDefined();
      expect(wire.cause?.name).toBe('Error');
      expect(wire.cause?.code).toBe('UNKNOWN_ERROR');
      expect(wire.cause?.message).toBe('Standard error');
    });

    it('should limit cause chain depth', () => {
      // Create a deep cause chain (> 10 levels)
      let error: Error = new Error('Root');
      for (let i = 0; i < 15; i++) {
        error = new ValidationError(
          `Level ${i}`,
          ValidationErrorCode.INVALID_INPUT,
          { field: 'test' },
          { cause: error }
        );
      }

      // Should not throw - just truncate
      const wire = (error as ValidationError).toWireFormat();

      // Count depth
      let depth = 0;
      let current: ErrorWireFormat | undefined = wire;
      while (current?.cause) {
        depth++;
        current = current.cause;
      }

      // Should be limited to MAX_CAUSE_DEPTH (10)
      expect(depth).toBeLessThanOrEqual(10);
    });
  });

  describe('Type Guards (T017)', () => {
    it('isConfigError should identify ConfigError', () => {
      const configError = new ConfigError('Test', ConfigErrorCode.FILE_NOT_FOUND, {});
      const agentError = new AgentError('Test', AgentErrorCode.TIMEOUT, { agentId: 'test' });
      const standardError = new Error('Standard');

      expect(isConfigError(configError)).toBe(true);
      expect(isConfigError(agentError)).toBe(false);
      expect(isConfigError(standardError)).toBe(false);
      expect(isConfigError(null)).toBe(false);
      expect(isConfigError(undefined)).toBe(false);
      expect(isConfigError('string')).toBe(false);
    });

    it('isAgentError should identify AgentError', () => {
      const agentError = new AgentError('Test', AgentErrorCode.NOT_FOUND, { agentId: 'test' });
      const networkError = new NetworkError('Test', NetworkErrorCode.AUTH_FAILED, {});

      expect(isAgentError(agentError)).toBe(true);
      expect(isAgentError(networkError)).toBe(false);
    });

    it('isNetworkError should identify NetworkError', () => {
      const networkError = new NetworkError('Test', NetworkErrorCode.SERVER_ERROR, {});
      const validationError = new ValidationError('Test', ValidationErrorCode.INVALID_INPUT, {
        field: 'test',
      });

      expect(isNetworkError(networkError)).toBe(true);
      expect(isNetworkError(validationError)).toBe(false);
    });

    it('isValidationError should identify ValidationError', () => {
      const validationError = new ValidationError('Test', ValidationErrorCode.INVALID_GIT_REF, {
        field: 'ref',
      });
      const configError = new ConfigError('Test', ConfigErrorCode.MISSING_FIELD, {});

      expect(isValidationError(validationError)).toBe(true);
      expect(isValidationError(configError)).toBe(false);
    });

    it('isBaseError should identify any custom error', () => {
      const configError = new ConfigError('Test', ConfigErrorCode.FILE_NOT_FOUND, {});
      const agentError = new AgentError('Test', AgentErrorCode.TIMEOUT, { agentId: 'test' });
      const networkError = new NetworkError('Test', NetworkErrorCode.TIMEOUT, {});
      const validationError = new ValidationError('Test', ValidationErrorCode.INVALID_PATH, {
        field: 'path',
      });
      const standardError = new Error('Standard');

      expect(isBaseError(configError)).toBe(true);
      expect(isBaseError(agentError)).toBe(true);
      expect(isBaseError(networkError)).toBe(true);
      expect(isBaseError(validationError)).toBe(true);
      expect(isBaseError(standardError)).toBe(false);
    });
  });

  describe('errorFromWireFormat', () => {
    it('should deserialize ConfigError from wire format', () => {
      const wire: ErrorWireFormat = {
        name: 'ConfigError',
        code: 'CONFIG_FILE_NOT_FOUND',
        message: 'File not found',
        context: { path: '/missing.yml' },
      };

      const error = errorFromWireFormat(wire);

      expect(error).toBeInstanceOf(ConfigError);
      expect(error.code).toBe('CONFIG_FILE_NOT_FOUND');
    });

    it('should deserialize AgentError from wire format', () => {
      const wire: ErrorWireFormat = {
        name: 'AgentError',
        code: 'AGENT_TIMEOUT',
        message: 'Timeout',
        context: { agentId: 'semgrep' },
      };

      const error = errorFromWireFormat(wire);

      expect(error).toBeInstanceOf(AgentError);
      expect((error as AgentError).context.agentId).toBe('semgrep');
    });

    it('should deserialize NetworkError from wire format', () => {
      const wire: ErrorWireFormat = {
        name: 'NetworkError',
        code: 'NETWORK_RATE_LIMITED',
        message: 'Rate limited',
        context: { status: 429 },
      };

      const error = errorFromWireFormat(wire);

      expect(error).toBeInstanceOf(NetworkError);
    });

    it('should deserialize ValidationError from wire format', () => {
      const wire: ErrorWireFormat = {
        name: 'ValidationError',
        code: 'VALIDATION_INVALID_INPUT',
        message: 'Invalid',
        context: { field: 'test' },
      };

      const error = errorFromWireFormat(wire);

      expect(error).toBeInstanceOf(ValidationError);
    });

    it('should fallback to ValidationError for unknown codes', () => {
      const wire: ErrorWireFormat = {
        name: 'UnknownError',
        code: 'UNKNOWN_CODE',
        message: 'Unknown',
        context: {},
      };

      const error = errorFromWireFormat(wire);

      expect(error).toBeInstanceOf(ValidationError);
      expect(error.code).toBe('VALIDATION_INVALID_INPUT');
    });
  });
});
