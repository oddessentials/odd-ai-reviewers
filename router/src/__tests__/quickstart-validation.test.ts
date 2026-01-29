/**
 * Quickstart Example Validation Tests (T090)
 *
 * These tests verify that code examples from quickstart.md compile and work correctly.
 * This ensures documentation stays in sync with actual API.
 */

import { describe, it, expect, vi } from 'vitest';
import { ConfigError, ConfigErrorCode } from '../types/errors.js';
import { Ok, Err, isOk, isErr, match } from '../types/result.js';
import { SafeGitRefHelpers } from '../types/branded.js';
import type { SafeGitRef } from '../types/branded.js';
import { assertNever } from '../types/assert-never.js';

describe('Quickstart Example Validation', () => {
  describe('Using Custom Errors (quickstart.md section 1)', () => {
    it('should create ConfigError with context', () => {
      const error = new ConfigError('Invalid agent configuration', ConfigErrorCode.INVALID_VALUE, {
        field: 'passes[0].agents',
        expected: 'array',
        actual: 'string',
      });

      expect(error.code).toBe('CONFIG_INVALID_VALUE');
      expect(error.context['field']).toBe('passes[0].agents');
    });

    it('should wrap existing error as cause', () => {
      const innerError = new Error('File not found');

      const error = new ConfigError(
        'Failed to load configuration',
        ConfigErrorCode.PARSE_ERROR,
        { path: '/config.yml' },
        { cause: innerError }
      );

      expect(error.cause).toBe(innerError);
      expect(error.context['path']).toBe('/config.yml');
    });

    it('should serialize to wire format', () => {
      const error = new ConfigError('Test error', ConfigErrorCode.INVALID_SCHEMA, {
        field: 'version',
      });

      const wireFormat = error.toWireFormat();
      expect(wireFormat.name).toBe('ConfigError');
      expect(wireFormat.code).toBe('CONFIG_INVALID_SCHEMA');
      expect(wireFormat.context['field']).toBe('version');

      // Verify JSON serialization round-trip
      const json = JSON.stringify(wireFormat);
      const parsed = JSON.parse(json);
      expect(parsed.name).toBe('ConfigError');
    });
  });

  describe('Using Result Type (quickstart.md section 2)', () => {
    it('should return Result instead of throwing', () => {
      function parseNumber(input: string) {
        const num = parseInt(input, 10);
        if (isNaN(num)) {
          return Err(new Error('Invalid number'));
        }
        return Ok(num);
      }

      const success = parseNumber('42');
      expect(isOk(success)).toBe(true);
      if (isOk(success)) {
        expect(success.value).toBe(42);
      }

      const failure = parseNumber('abc');
      expect(isErr(failure)).toBe(true);
    });

    it('should pattern match on result', () => {
      const result = Ok(42);

      const message = match(result, {
        ok: (value) => `Value: ${value}`,
        err: (error) => `Error: ${error}`,
      });

      expect(message).toBe('Value: 42');
    });
  });

  describe('Using Branded Types (quickstart.md section 3)', () => {
    it('should parse user input to branded type', () => {
      const userInput = 'main';
      const result = SafeGitRefHelpers.parse(userInput);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const ref: SafeGitRef = result.value;
        expect(ref).toBe('main');
      }
    });

    it('should use in type-safe function', () => {
      function checkout(ref: SafeGitRef): string {
        // Compiler guarantees ref is validated
        return `git checkout ${ref}`;
      }

      const result = SafeGitRefHelpers.parse('feature-branch');
      if (isOk(result)) {
        const cmd = checkout(result.value);
        expect(cmd).toBe('git checkout feature-branch');
      }
    });

    it('should serialize for cache/JSON', () => {
      const result = SafeGitRefHelpers.parse('develop');
      if (isOk(result)) {
        const plain: string = SafeGitRefHelpers.unbrand(result.value);
        expect(plain).toBe('develop');

        // Can store in cache
        const cacheEntry = JSON.stringify({ lastRef: plain });
        expect(cacheEntry).toBe('{"lastRef":"develop"}');
      }
    });
  });

  describe('Using Discriminated Unions (quickstart.md section 4)', () => {
    type AgentStatus = 'success' | 'failure' | 'skipped';

    interface MockAgentResult {
      status: AgentStatus;
      agentId: string;
      findings?: string[];
      error?: string;
      reason?: string;
    }

    it('should use assertNever in switch', () => {
      function processResult(result: MockAgentResult): string {
        switch (result.status) {
          case 'success':
            return `Found ${result.findings?.length ?? 0} issues`;
          case 'failure':
            return `Error: ${result.error}`;
          case 'skipped':
            return `Skipped: ${result.reason}`;
          default:
            return assertNever(result.status);
        }
      }

      expect(processResult({ status: 'success', agentId: 'test', findings: ['a', 'b'] })).toBe(
        'Found 2 issues'
      );
      expect(processResult({ status: 'failure', agentId: 'test', error: 'timeout' })).toBe(
        'Error: timeout'
      );
      expect(processResult({ status: 'skipped', agentId: 'test', reason: 'no files' })).toBe(
        'Skipped: no files'
      );
    });
  });

  describe('Writing Hermetic Tests (quickstart.md section 5)', () => {
    it('should work with mocked fetch', async () => {
      // Mock fetch
      const mockFetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ status: 'ok' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      // Use mocked fetch
      const response = await fetch('/api/data');
      const data = await response.json();

      expect(data.status).toBe('ok');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Cleanup
      vi.unstubAllGlobals();
    });
  });
});
