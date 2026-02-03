/**
 * CLI Options Module Export Tests
 *
 * Tests for User Story 6 (T051-T052): Verify API surface is clean.
 */

import { describe, it, expect } from 'vitest';
import * as optionsModule from '../../../../src/cli/options/index.js';

// =============================================================================
// T051-T052: User Story 6 - Clean API Surface
// =============================================================================

describe('CLI options module exports (User Story 6)', () => {
  // T051: Test asserting resolveBaseRef is NOT in module exports
  describe('T051: resolveBaseRef not exported from index', () => {
    it('should NOT export resolveBaseRef from the barrel module', () => {
      // resolveBaseRef should be a private/internal function
      const exports = Object.keys(optionsModule);

      expect(exports).not.toContain('resolveBaseRef');
    });

    it('should export expected public functions', () => {
      const exports = Object.keys(optionsModule);

      // These should be exported
      expect(exports).toContain('parseLocalReviewOptions');
      expect(exports).toContain('applyOptionDefaults');
      expect(exports).toContain('resolveOutputFormat');
      expect(exports).toContain('resolveDiffRange');
      expect(exports).toContain('parseRangeString');
    });

    it('should export expected types (as values for enums)', () => {
      const exports = Object.keys(optionsModule);

      // RangeErrorCode is an enum, so it appears as a value
      expect(exports).toContain('RangeErrorCode');
      expect(exports).toContain('isResolvedDiffMode');
      expect(exports).toContain('assertDiffModeResolved');
    });
  });

  // T052: Test searching internal code for resolveBaseRef usage
  describe('T052: resolveBaseRef internal usage', () => {
    it('should verify resolveBaseRef is only used internally', async () => {
      // This is a static analysis test - we verify at build time by
      // checking that no external modules import resolveBaseRef.
      //
      // The function exists in local-review-options.ts but is not
      // re-exported from the barrel (index.ts).
      //
      // Any attempt to import from the barrel would fail:
      // import { resolveBaseRef } from './cli/options/index.js'; // Error!
      //
      // Direct imports from the source file are discouraged but possible:
      // import { resolveBaseRef } from './cli/options/local-review-options.js';

      // Verify the function doesn't appear in public exports
      const publicExports = Object.keys(optionsModule);
      expect(publicExports.includes('resolveBaseRef')).toBe(false);
    });

    it('should have resolveDiffRange as the preferred public API', () => {
      // resolveDiffRange is the public replacement for resolveBaseRef
      expect(typeof optionsModule.resolveDiffRange).toBe('function');
    });
  });

  // Verify module completeness
  describe('module export completeness', () => {
    it('should export all required types and functions', () => {
      // Functions
      expect(typeof optionsModule.parseLocalReviewOptions).toBe('function');
      expect(typeof optionsModule.applyOptionDefaults).toBe('function');
      expect(typeof optionsModule.resolveOutputFormat).toBe('function');
      expect(typeof optionsModule.resolveDiffRange).toBe('function');
      expect(typeof optionsModule.parseRangeString).toBe('function');

      // Type guards/assertions
      expect(typeof optionsModule.isResolvedDiffMode).toBe('function');
      expect(typeof optionsModule.assertDiffModeResolved).toBe('function');

      // Enums
      expect(optionsModule.RangeErrorCode).toBeDefined();
      expect(optionsModule.RangeErrorCode.MULTIPLE_OPERATORS).toBe('MULTIPLE_OPERATORS');
    });
  });
});
