/**
 * Tests for CLI error formatting
 */

import { describe, it, expect } from 'vitest';
import {
  createNotAGitRepoError,
  createNoCredentialsError,
  createNoChangesError,
  createInvalidConfigError,
  createConfigNotFoundError,
  createMutuallyExclusiveOptionsError,
  createNothingToReviewError,
  formatCLIError,
  formatCLIWarning,
} from '../../../cli/output/errors.js';
import { ANSI } from '../../../cli/output/colors.js';

describe('Error Constructors', () => {
  describe('createNotAGitRepoError', () => {
    it('creates error with path', () => {
      const error = createNotAGitRepoError('/some/path');
      expect(error.type).toBe('NOT_GIT_REPO');
      expect(error.path).toBe('/some/path');
      expect(error.message).toContain('Not a git repository');
      expect(error.hint).toContain('ai-review /path/to/repo');
    });
  });

  describe('createNoCredentialsError', () => {
    it('creates error with checked vars', () => {
      const error = createNoCredentialsError(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
      expect(error.type).toBe('NO_CREDENTIALS');
      expect(error.checkedVars).toEqual(['ANTHROPIC_API_KEY', 'OPENAI_API_KEY']);
      expect(error.message).toContain('No API credentials');
      expect(error.hint).toContain('ANTHROPIC_API_KEY');
    });
  });

  describe('createNoChangesError', () => {
    it('creates success indicator with base and head', () => {
      const error = createNoChangesError('main', 'HEAD');
      expect(error.type).toBe('NO_CHANGES');
      expect(error.base).toBe('main');
      expect(error.head).toBe('HEAD');
      expect(error.message).toBe('No changes to review');
      expect(error.hint).toContain('Base: main');
      expect(error.hint).toContain('Head: HEAD');
    });
  });

  describe('createInvalidConfigError', () => {
    it('creates error with config path and errors', () => {
      const error = createInvalidConfigError('.ai-review.yml', [
        'Line 12: invalid value',
        'Line 18: unknown field',
      ]);
      expect(error.type).toBe('INVALID_CONFIG');
      expect(error.configPath).toBe('.ai-review.yml');
      expect(error.errors).toHaveLength(2);
      expect(error.message).toContain('.ai-review.yml');
      expect(error.hint).toContain('ai-review validate');
    });
  });

  describe('createConfigNotFoundError', () => {
    it('creates error with config path', () => {
      const error = createConfigNotFoundError('custom.yml');
      expect(error.type).toBe('CONFIG_NOT_FOUND');
      expect(error.configPath).toBe('custom.yml');
      expect(error.message).toContain('custom.yml');
      expect(error.hint).toContain('zero-config defaults');
    });
  });

  describe('createMutuallyExclusiveOptionsError', () => {
    it('creates error with options list', () => {
      const error = createMutuallyExclusiveOptionsError(['--quiet', '--verbose']);
      expect(error.type).toBe('MUTUALLY_EXCLUSIVE_OPTIONS');
      expect(error.options).toEqual(['--quiet', '--verbose']);
      expect(error.message).toContain('--quiet and --verbose');
      expect(error.hint).toContain('minimal output');
    });

    it('includes hint for quiet/verbose', () => {
      const error = createMutuallyExclusiveOptionsError(['--quiet', '--verbose']);
      expect(error.hint).toBeDefined();
    });

    it('no hint for other options', () => {
      const error = createMutuallyExclusiveOptionsError(['--range', '--base']);
      expect(error.hint).toBeUndefined();
    });
  });

  describe('createNothingToReviewError', () => {
    it('creates error with helpful hint', () => {
      const error = createNothingToReviewError();
      expect(error.type).toBe('NOTHING_TO_REVIEW');
      expect(error.message).toBe('Nothing to review');
      expect(error.hint).toContain('--staged');
      expect(error.hint).toContain('--uncommitted');
    });
  });
});

describe('formatCLIError', () => {
  it('formats NO_CHANGES with green checkmark (success case)', () => {
    const error = createNoChangesError('main', 'HEAD');
    const result = formatCLIError(error, false);
    expect(result).toContain('✓');
    expect(result).toContain('No changes to review');
  });

  it('formats errors with red Error prefix', () => {
    const error = createNotAGitRepoError('/path');
    const result = formatCLIError(error, false);
    expect(result).toContain('Error:');
    expect(result).toContain('Not a git repository');
  });

  it('includes hint when available', () => {
    const error = createNoCredentialsError(['ANTHROPIC_API_KEY']);
    const result = formatCLIError(error, false);
    expect(result).toContain('Hint:');
    expect(result).toContain('ANTHROPIC_API_KEY');
  });

  it('applies colors when enabled', () => {
    const error = createNotAGitRepoError('/path');
    const colored = formatCLIError(error, true);
    expect(colored).toContain(ANSI.red);

    const plain = formatCLIError(error, false);
    expect(plain).not.toContain(ANSI.red);
  });

  it('formats NO_CHANGES in green when colored', () => {
    const error = createNoChangesError('main', 'HEAD');
    const colored = formatCLIError(error, true);
    expect(colored).toContain(ANSI.green);
  });
});

describe('formatCLIWarning', () => {
  it('formats warning with yellow prefix', () => {
    const result = formatCLIWarning('Something might be wrong', false);
    expect(result).toContain('Warning:');
    expect(result).toContain('Something might be wrong');
  });

  it('applies yellow color when enabled', () => {
    const colored = formatCLIWarning('Test warning', true);
    expect(colored).toContain(ANSI.yellow);

    const plain = formatCLIWarning('Test warning', false);
    expect(plain).not.toContain(ANSI.yellow);
  });
});
