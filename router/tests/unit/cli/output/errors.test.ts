/**
 * Tests for CLI Errors Module
 *
 * Tests T027: Error formatter tests (5 cases)
 */

import { describe, it, expect } from 'vitest';
import {
  CLIErrorCode,
  CLIError,
  NotAGitRepoError,
  NoCredentialsError,
  NoChangesError,
  InvalidConfigError,
  ConfigNotFoundError,
  InvalidOptionsError,
  ExecutionFailedError,
  formatCLIError,
  formatNotAGitRepoError,
  formatNoCredentialsError,
  formatNoChangesError,
  formatInvalidConfigError,
  isCLIError,
  isNotAGitRepoError,
  isNoCredentialsError,
  isNoChangesError,
  isInvalidConfigError,
} from '../../../../src/cli/output/errors.js';

describe('errors', () => {
  describe('CLIErrorCode', () => {
    it('should have all error codes', () => {
      expect(CLIErrorCode.NOT_GIT_REPO).toBe('CLI_NOT_GIT_REPO');
      expect(CLIErrorCode.NO_CREDENTIALS).toBe('CLI_NO_CREDENTIALS');
      expect(CLIErrorCode.NO_CHANGES).toBe('CLI_NO_CHANGES');
      expect(CLIErrorCode.INVALID_CONFIG).toBe('CLI_INVALID_CONFIG');
      expect(CLIErrorCode.CONFIG_NOT_FOUND).toBe('CLI_CONFIG_NOT_FOUND');
      expect(CLIErrorCode.INVALID_OPTIONS).toBe('CLI_INVALID_OPTIONS');
      expect(CLIErrorCode.EXECUTION_FAILED).toBe('CLI_EXECUTION_FAILED');
    });
  });

  describe('NotAGitRepoError', () => {
    it('should create error with message', () => {
      const error = new NotAGitRepoError('/some/path');
      expect(error.message).toBe('Not a git repository (or any parent up to root)');
      expect(error.code).toBe(CLIErrorCode.NOT_GIT_REPO);
      expect(error.path).toBe('/some/path');
    });

    it('should provide helpful hint', () => {
      const error = new NotAGitRepoError();
      expect(error.hint).toContain('git repository');
      expect(error.hint).toContain('ai-review /path/to/repo');
    });

    it('should be instance of CLIError', () => {
      const error = new NotAGitRepoError();
      expect(error).toBeInstanceOf(CLIError);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('NoCredentialsError', () => {
    it('should create error with message', () => {
      const error = new NoCredentialsError();
      expect(error.message).toBe('No API credentials found');
      expect(error.code).toBe(CLIErrorCode.NO_CREDENTIALS);
    });

    it('should list environment variables in hint', () => {
      const error = new NoCredentialsError();
      expect(error.hint).toContain('ANTHROPIC_API_KEY');
      expect(error.hint).toContain('OPENAI_API_KEY');
      expect(error.hint).toContain('AZURE_OPENAI_KEY');
      expect(error.hint).toContain('OLLAMA_HOST');
    });
  });

  describe('NoChangesError', () => {
    it('should create error with refs', () => {
      const error = new NoChangesError('main', 'HEAD');
      expect(error.message).toBe('No changes to review');
      expect(error.code).toBe(CLIErrorCode.NO_CHANGES);
      expect(error.base).toBe('main');
      expect(error.head).toBe('HEAD');
    });

    it('should include refs in hint', () => {
      const error = new NoChangesError('main', 'feature');
      expect(error.hint).toContain('Base: main');
      expect(error.hint).toContain('Head: feature');
    });
  });

  describe('InvalidConfigError', () => {
    it('should create error with details', () => {
      const details = ["Line 12: 'passes' must be an array", "Line 18: Unknown provider 'gemini'"];
      const error = new InvalidConfigError('.ai-review.yml', details);

      expect(error.message).toBe('Invalid configuration in .ai-review.yml');
      expect(error.code).toBe(CLIErrorCode.INVALID_CONFIG);
      expect(error.configPath).toBe('.ai-review.yml');
      expect(error.details).toEqual(details);
    });

    it('should include details in hint', () => {
      const details = ['Error 1', 'Error 2'];
      const error = new InvalidConfigError('config.yml', details);

      expect(error.hint).toContain('Error 1');
      expect(error.hint).toContain('Error 2');
      expect(error.hint).toContain('ai-review validate');
    });
  });

  describe('ConfigNotFoundError', () => {
    it('should create error with path', () => {
      const error = new ConfigNotFoundError('custom-config.yml');
      expect(error.message).toBe('Config file not found: custom-config.yml');
      expect(error.code).toBe(CLIErrorCode.CONFIG_NOT_FOUND);
      expect(error.configPath).toBe('custom-config.yml');
    });

    it('should suggest removing -c flag in hint', () => {
      const error = new ConfigNotFoundError('missing.yml');
      expect(error.hint).toContain('-c flag');
      expect(error.hint).toContain('zero-config');
    });
  });

  describe('InvalidOptionsError', () => {
    it('should create error with option details', () => {
      const error = new InvalidOptionsError(
        '--quiet/--verbose',
        'mutually exclusive',
        'Use one or the other'
      );
      expect(error.message).toBe('Invalid option: --quiet/--verbose');
      expect(error.code).toBe(CLIErrorCode.INVALID_OPTIONS);
      expect(error.option).toBe('--quiet/--verbose');
      expect(error.reason).toBe('mutually exclusive');
      expect(error.hint).toBe('Use one or the other');
    });
  });

  describe('ExecutionFailedError', () => {
    it('should create error with stage and cause', () => {
      const cause = new Error('Connection refused');
      const error = new ExecutionFailedError('agent execution', 'API error', cause);

      expect(error.message).toBe('Execution failed during agent execution: API error');
      expect(error.code).toBe(CLIErrorCode.EXECUTION_FAILED);
      expect(error.stage).toBe('agent execution');
      expect(error.originalCause).toBe(cause);
      expect(error.hint).toBe('Connection refused');
    });

    it('should handle missing cause', () => {
      const error = new ExecutionFailedError('preflight', 'validation failed');
      expect(error.originalCause).toBeUndefined();
      expect(error.hint).toBeUndefined();
    });
  });

  describe('formatCLIError (T027)', () => {
    it('should format CLI error with message and hint', () => {
      const error = new NotAGitRepoError('/path');
      const formatted = formatCLIError(error, false);

      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Not a git repository');
      expect(formatted).toContain('Hint:');
    });

    it('should format with colors when enabled', () => {
      const error = new NoCredentialsError();
      const formatted = formatCLIError(error, true);

      expect(formatted).toContain('\x1b[31m'); // red
      expect(formatted).toContain('\x1b[33m'); // yellow (hint)
    });

    it('should format generic Error', () => {
      const error = new Error('Something went wrong');
      const formatted = formatCLIError(error, false);

      expect(formatted).toContain('Error:');
      expect(formatted).toContain('Something went wrong');
    });

    it('should format without colors when disabled', () => {
      const error = new InvalidConfigError('config.yml', ['bad field']);
      const formatted = formatCLIError(error, false);

      expect(formatted).not.toContain('\x1b[');
    });
  });

  describe('formatNotAGitRepoError', () => {
    it('should delegate to formatCLIError', () => {
      const error = new NotAGitRepoError();
      const formatted = formatNotAGitRepoError(error, false);
      expect(formatted).toContain('Not a git repository');
    });
  });

  describe('formatNoCredentialsError', () => {
    it('should delegate to formatCLIError', () => {
      const error = new NoCredentialsError();
      const formatted = formatNoCredentialsError(error, false);
      expect(formatted).toContain('No API credentials');
    });
  });

  describe('formatNoChangesError', () => {
    it('should format as success message', () => {
      const error = new NoChangesError('main', 'HEAD');
      const formatted = formatNoChangesError(error, false);

      expect(formatted).toContain('✓ No changes to review');
      expect(formatted).toContain('Base: main');
      expect(formatted).toContain('Head: HEAD');
    });

    it('should show green color when enabled', () => {
      const error = new NoChangesError('main', 'HEAD');
      const formatted = formatNoChangesError(error, true);

      expect(formatted).toContain('\x1b[32m'); // green
    });
  });

  describe('formatInvalidConfigError', () => {
    it('should delegate to formatCLIError', () => {
      const error = new InvalidConfigError('config.yml', ['error']);
      const formatted = formatInvalidConfigError(error, false);
      expect(formatted).toContain('Invalid configuration');
    });
  });

  describe('type guards', () => {
    it('isCLIError should identify CLIError instances', () => {
      expect(isCLIError(new NotAGitRepoError())).toBe(true);
      expect(isCLIError(new NoCredentialsError())).toBe(true);
      expect(isCLIError(new Error('generic'))).toBe(false);
      expect(isCLIError(null)).toBe(false);
      expect(isCLIError('string')).toBe(false);
    });

    it('isNotAGitRepoError should identify NotAGitRepoError', () => {
      expect(isNotAGitRepoError(new NotAGitRepoError())).toBe(true);
      expect(isNotAGitRepoError(new NoCredentialsError())).toBe(false);
    });

    it('isNoCredentialsError should identify NoCredentialsError', () => {
      expect(isNoCredentialsError(new NoCredentialsError())).toBe(true);
      expect(isNoCredentialsError(new NotAGitRepoError())).toBe(false);
    });

    it('isNoChangesError should identify NoChangesError', () => {
      expect(isNoChangesError(new NoChangesError())).toBe(true);
      expect(isNoChangesError(new NotAGitRepoError())).toBe(false);
    });

    it('isInvalidConfigError should identify InvalidConfigError', () => {
      expect(isInvalidConfigError(new InvalidConfigError('x', []))).toBe(true);
      expect(isInvalidConfigError(new NotAGitRepoError())).toBe(false);
    });
  });
});
