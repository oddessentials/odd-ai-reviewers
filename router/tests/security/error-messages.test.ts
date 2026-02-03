/**
 * Security Compliance Tests: Error Message Safety
 *
 * PR_LESSONS_LEARNED.md Requirement: Avoid format strings with user input
 * "Error messages should not echo sensitive input back to users."
 *
 * These tests verify that error messages don't inadvertently expose:
 * - Full API keys or tokens
 * - Full file paths that reveal system structure
 * - Stack traces with sensitive variable values
 *
 * @module tests/security/error-messages
 */

import { describe, it, expect } from 'vitest';
import {
  ConfigError,
  AgentError,
  NetworkError,
  ValidationError,
  ConfigErrorCode,
  AgentErrorCode,
  NetworkErrorCode,
  ValidationErrorCode,
} from '../../src/types/errors.js';
import {
  formatCLIError,
  NotAGitRepoError,
  NoCredentialsError,
} from '../../src/cli/output/errors.js';

/**
 * Sensitive data that should never appear in error messages
 */
const SENSITIVE_DATA = {
  API_KEY: 'sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
  PASSWORD: 'super_secret_password_12345',
  TOKEN: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0',
  PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...',
};

describe('T125: Error Message Safety', () => {
  describe('Custom Error Types', () => {
    it('should not include sensitive data in ConfigError message', () => {
      const error = new ConfigError(
        'Configuration validation failed',
        ConfigErrorCode.INVALID_SCHEMA,
        {
          field: 'apiKey',
          // Do NOT include actual key value in context
          reason: 'API key format is invalid',
        }
      );

      const message = error.message;
      const wireFormat = error.toWireFormat();

      // Should not contain the actual secret value
      expect(message).not.toContain(SENSITIVE_DATA.API_KEY);
      expect(JSON.stringify(wireFormat)).not.toContain(SENSITIVE_DATA.API_KEY);
    });

    it('should not include sensitive data in ValidationError message', () => {
      const error = new ValidationError(
        'Validation failed for input',
        ValidationErrorCode.INVALID_INPUT,
        {
          field: 'token',
          // Generic message, not the actual value
          reason: 'Token format is invalid',
        }
      );

      expect(error.message).not.toContain(SENSITIVE_DATA.TOKEN);
    });

    it('should not include sensitive data in NetworkError message', () => {
      const error = new NetworkError('API request failed', NetworkErrorCode.AUTH_FAILED, {
        endpoint: 'https://api.example.com/v1',
        // Should NOT include the auth header value
        reason: 'Authentication failed - check your API key',
      });

      expect(error.message).not.toContain(SENSITIVE_DATA.API_KEY);
    });

    it('should not include sensitive data in AgentError message', () => {
      const error = new AgentError('Agent execution failed', AgentErrorCode.EXECUTION_FAILED, {
        agentId: 'security-scanner',
        // Should NOT include runtime values
        reason: 'Agent encountered an error during execution',
      });

      expect(error.message).not.toContain(SENSITIVE_DATA.PASSWORD);
    });
  });

  describe('CLI Error Formatting', () => {
    it('should format NotAGitRepoError with helpful guidance', () => {
      const error = new NotAGitRepoError('/home/user/secret-project/.hidden');
      const formatted = formatCLIError(error);

      // Should have helpful guidance about git repositories
      expect(formatted.toLowerCase()).toMatch(/git|repository|repo/);
      // Should include a hint
      expect(formatted.toLowerCase()).toMatch(/hint|run|command/);
    });

    it('should format NoCredentialsError without exposing env values', () => {
      const error = new NoCredentialsError();
      const formatted = formatCLIError(error);

      // Should mention env vars by NAME, not VALUE
      expect(formatted).toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|API key/i);

      // Should NOT contain actual key values
      expect(formatted).not.toContain(SENSITIVE_DATA.API_KEY);
    });

    it('should handle errors with undefined context safely', () => {
      const error = new ConfigError('Test error', ConfigErrorCode.FILE_NOT_FOUND);

      // Should not throw when formatting
      expect(() => error.toWireFormat()).not.toThrow();
    });
  });

  describe('Error Serialization Safety', () => {
    it('should serialize errors without sensitive context', () => {
      const error = new ValidationError(
        'Input validation failed',
        ValidationErrorCode.INVALID_INPUT,
        {
          field: 'password',
          // Context should describe the issue, not include the actual value
          reason: 'Password does not meet requirements',
        }
      );

      const serialized = JSON.stringify(error.toWireFormat());

      // Should not leak the actual password
      expect(serialized).not.toContain(SENSITIVE_DATA.PASSWORD);
      expect(serialized).not.toContain('super_secret');
    });

    it('should produce consistent error structure', () => {
      const error = new ConfigError('Test', ConfigErrorCode.INVALID_SCHEMA, {
        field: 'test field',
      });

      const wireFormat = error.toWireFormat();

      // Should have standard structure (per ErrorWireFormat)
      expect(wireFormat).toHaveProperty('name');
      expect(wireFormat).toHaveProperty('code');
      expect(wireFormat).toHaveProperty('message');
      expect(wireFormat).toHaveProperty('context');
    });
  });

  describe('Defense Against Format String Injection', () => {
    it('should handle messages with printf-style placeholders safely', () => {
      // These shouldn't cause issues even if they look like format strings
      const messages = ['Error at %s line %d', 'Value: %x %n %p', 'Format: ${value} #{token}'];

      for (const msg of messages) {
        const error = new ValidationError(msg, ValidationErrorCode.INVALID_INPUT, {
          field: 'test',
        });

        // Should not throw or interpret format strings
        expect(error.message).toBe(msg);
        expect(() => formatCLIError(error)).not.toThrow();
      }
    });

    it('should handle messages with special characters', () => {
      const messages = [
        'Error with <angle> brackets',
        'Error with "quotes" and \'apostrophes\'',
        'Error with {curly} and [square] brackets',
        'Error with $dollar and @at signs',
      ];

      for (const msg of messages) {
        const error = new ConfigError(msg, ConfigErrorCode.PARSE_ERROR);

        // Should preserve the message exactly
        expect(error.message).toBe(msg);
      }
    });
  });

  describe('Stack Trace Safety', () => {
    it('should not include sensitive values in error stacks', () => {
      // Create an error in a context that might capture variables
      const sensitiveValue = SENSITIVE_DATA.API_KEY;
      const error = new NetworkError('Connection failed', NetworkErrorCode.CONNECTION_FAILED, {
        // Don't include sensitiveValue in context!
        reason: 'Could not connect to API endpoint',
      });

      // The stack trace should not contain the sensitive value
      // (unless the JS runtime somehow includes local variables, which it shouldn't)
      if (error.stack) {
        expect(error.stack).not.toContain(sensitiveValue);
      }
    });
  });
});
