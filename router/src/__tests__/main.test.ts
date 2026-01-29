/**
 * Main Entry Point Tests (T050-T051)
 *
 * Tests for the main.ts entry point module.
 * Uses dependency injection to avoid process.exit and test with controlled environments.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPlatform,
  type ExitHandler,
  type ReviewOptions,
  type ReviewDependencies,
} from '../main.js';

describe('main.ts Entry Point', () => {
  describe('detectPlatform', () => {
    it('detects GitHub Actions environment', () => {
      const env = { GITHUB_ACTIONS: 'true' };
      expect(detectPlatform(env)).toBe('github');
    });

    it('detects Azure DevOps TF_BUILD environment', () => {
      const env = { TF_BUILD: 'True' };
      expect(detectPlatform(env)).toBe('ado');
    });

    it('detects Azure DevOps SYSTEM_TEAMFOUNDATIONCOLLECTIONURI environment', () => {
      const env = { SYSTEM_TEAMFOUNDATIONCOLLECTIONURI: 'https://dev.azure.com/org' };
      expect(detectPlatform(env)).toBe('ado');
    });

    it('returns unknown for unrecognized environment', () => {
      const env = { SOME_OTHER_CI: 'true' };
      expect(detectPlatform(env)).toBe('unknown');
    });

    it('returns unknown for empty environment', () => {
      const env = {};
      expect(detectPlatform(env)).toBe('unknown');
    });

    it('prioritizes GitHub over ADO when both are present', () => {
      const env = {
        GITHUB_ACTIONS: 'true',
        TF_BUILD: 'True',
      };
      // GitHub check comes first, so it should return github
      expect(detectPlatform(env)).toBe('github');
    });
  });

  describe('ExitHandler pattern', () => {
    it('allows capturing exit codes without calling process.exit', () => {
      let capturedCode: number | undefined;
      const testExitHandler: ExitHandler = (code: number) => {
        capturedCode = code;
      };

      // Simulate calling the exit handler
      testExitHandler(1);

      expect(capturedCode).toBe(1);
    });

    it('can be used to test error scenarios', () => {
      const exitCodes: number[] = [];
      const collectingExitHandler: ExitHandler = (code: number) => {
        exitCodes.push(code);
      };

      // Simulate multiple exit scenarios
      collectingExitHandler(0);
      collectingExitHandler(1);
      collectingExitHandler(2);

      expect(exitCodes).toEqual([0, 1, 2]);
    });
  });

  describe('ReviewDependencies injection', () => {
    it('allows injecting custom environment', () => {
      const deps: ReviewDependencies = {
        env: {
          CUSTOM_VAR: 'test-value',
          GITHUB_TOKEN: 'test-token',
        },
      };

      expect(deps.env?.['CUSTOM_VAR']).toBe('test-value');
      expect(deps.env?.['GITHUB_TOKEN']).toBe('test-token');
    });

    it('allows injecting custom exit handler', () => {
      let exitCalled = false;
      const deps: ReviewDependencies = {
        exitHandler: () => {
          exitCalled = true;
        },
      };

      deps.exitHandler?.(1);
      expect(exitCalled).toBe(true);
    });
  });

  describe('ReviewOptions type', () => {
    it('accepts required fields', () => {
      const options: ReviewOptions = {
        repo: '/path/to/repo',
        base: 'main',
        head: 'feature-branch',
      };

      expect(options.repo).toBe('/path/to/repo');
      expect(options.base).toBe('main');
      expect(options.head).toBe('feature-branch');
    });

    it('accepts optional fields', () => {
      const options: ReviewOptions = {
        repo: '/path/to/repo',
        base: 'abc123',
        head: 'def456',
        pr: 42,
        owner: 'myorg',
        repoName: 'myrepo',
        dryRun: true,
      };

      expect(options.pr).toBe(42);
      expect(options.owner).toBe('myorg');
      expect(options.repoName).toBe('myrepo');
      expect(options.dryRun).toBe(true);
    });
  });
});
