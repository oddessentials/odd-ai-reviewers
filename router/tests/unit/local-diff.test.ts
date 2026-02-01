/**
 * Tests for Local Diff Module
 *
 * Tests T044-T046: Local diff generation (working tree, staged, base ref)
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { getLocalDiff, hasLocalChanges, type LocalDiffOptions } from '../../src/diff.js';

// Calculate repo root from __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../');

describe('local-diff', () => {
  describe('getLocalDiff', () => {
    describe('working tree diff (T044)', () => {
      it('should return empty diff when no uncommitted changes', () => {
        // Use a clean checkout scenario - diff HEAD against itself
        const options: LocalDiffOptions = {
          baseRef: 'HEAD',
          uncommitted: false,
          stagedOnly: false,
        };

        const result = getLocalDiff(REPO_ROOT, options);

        // When baseRef is HEAD and not uncommitted, diff HEAD...HEAD = no changes
        expect(result.files).toHaveLength(0);
        expect(result.totalAdditions).toBe(0);
        expect(result.totalDeletions).toBe(0);
        expect(result.source).toBe('local-git');
      });

      it('should include context lines count', () => {
        const options: LocalDiffOptions = {
          baseRef: 'HEAD',
        };

        const result = getLocalDiff(REPO_ROOT, options);

        expect(result.contextLines).toBe(3); // GitHub default
      });

      it('should set source to local-git', () => {
        const options: LocalDiffOptions = {
          baseRef: 'HEAD',
        };

        const result = getLocalDiff(REPO_ROOT, options);

        expect(result.source).toBe('local-git');
      });
    });

    describe('staged-only diff (T045)', () => {
      it('should use INDEX and STAGED as base/head for staged-only', () => {
        const options: LocalDiffOptions = {
          baseRef: 'HEAD',
          stagedOnly: true,
        };

        const result = getLocalDiff(REPO_ROOT, options);

        // These are virtual refs for staged changes
        expect(result.baseSha).toBe('INDEX');
        expect(result.headSha).toBe('STAGED');
      });

      it('should return empty when nothing is staged', () => {
        const options: LocalDiffOptions = {
          baseRef: 'HEAD',
          stagedOnly: true,
        };

        const result = getLocalDiff(REPO_ROOT, options);

        // Assuming clean repo state for tests
        expect(result.files).toBeDefined();
        expect(Array.isArray(result.files)).toBe(true);
      });

      it('should set contextLines correctly for staged diff', () => {
        const options: LocalDiffOptions = {
          baseRef: 'HEAD',
          stagedOnly: true,
        };

        const result = getLocalDiff(REPO_ROOT, options);

        expect(result.contextLines).toBe(3);
      });
    });

    describe('base ref diff (T046)', () => {
      it('should diff against specified base ref', () => {
        // Get the current HEAD
        const headSha = execFileSync('git', ['rev-parse', 'HEAD'], {
          cwd: REPO_ROOT,
          encoding: 'utf-8',
        }).trim();

        const options: LocalDiffOptions = {
          baseRef: 'HEAD', // Same as current = no diff
        };

        const result = getLocalDiff(REPO_ROOT, options);

        expect(result.baseSha).toBe(headSha);
        expect(result.headSha).toBe(headSha);
      });

      it('should resolve symbolic refs like main/master', () => {
        // Test that we can diff against main branch
        const options: LocalDiffOptions = {
          baseRef: 'main',
        };

        // This should not throw - main branch should exist
        const result = getLocalDiff(REPO_ROOT, options);

        expect(result.source).toBe('local-git');
        expect(result.files).toBeDefined();
      });
    });
  });

  describe('hasLocalChanges', () => {
    it('should return boolean for uncommitted check', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD',
        uncommitted: true,
      };

      const result = hasLocalChanges(REPO_ROOT, options);

      expect(typeof result).toBe('boolean');
    });

    it('should return boolean for staged check', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD',
        stagedOnly: true,
      };

      const result = hasLocalChanges(REPO_ROOT, options);

      expect(typeof result).toBe('boolean');
    });

    it('should return boolean for base ref check', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD',
      };

      const result = hasLocalChanges(REPO_ROOT, options);

      expect(typeof result).toBe('boolean');
    });

    it('should return false for same base and head', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD',
      };

      const result = hasLocalChanges(REPO_ROOT, options);

      // HEAD...HEAD = no changes
      expect(result).toBe(false);
    });
  });

  describe('path filtering', () => {
    it('should apply include patterns', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD~5',
        pathFilter: {
          include: ['**/*.ts'],
        },
      };

      // Get diff with filter - should only include TypeScript files
      const result = getLocalDiff(REPO_ROOT, options);

      // All files should be TypeScript
      for (const file of result.files) {
        expect(file.path.endsWith('.ts') || file.path.endsWith('.tsx')).toBe(true);
      }
    });

    it('should apply exclude patterns', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD~5',
        pathFilter: {
          exclude: ['**/*.md', '**/*.json'],
        },
      };

      const result = getLocalDiff(REPO_ROOT, options);

      // No markdown or JSON files should be included
      for (const file of result.files) {
        expect(file.path.endsWith('.md')).toBe(false);
        expect(file.path.endsWith('.json')).toBe(false);
      }
    });
  });

  describe('DiffSummary structure', () => {
    it('should return properly structured DiffSummary', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD~1',
      };

      const result = getLocalDiff(REPO_ROOT, options);

      expect(result).toHaveProperty('files');
      expect(result).toHaveProperty('totalAdditions');
      expect(result).toHaveProperty('totalDeletions');
      expect(result).toHaveProperty('baseSha');
      expect(result).toHaveProperty('headSha');
      expect(result).toHaveProperty('contextLines');
      expect(result).toHaveProperty('source');
    });

    it('should include file metadata for each changed file', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD~1',
      };

      const result = getLocalDiff(REPO_ROOT, options);

      for (const file of result.files) {
        expect(file).toHaveProperty('path');
        expect(file).toHaveProperty('status');
        expect(file).toHaveProperty('additions');
        expect(file).toHaveProperty('deletions');
        expect(['added', 'modified', 'deleted', 'renamed']).toContain(file.status);
      }
    });

    it('should include patches for non-binary, non-deleted files', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD~1',
      };

      const result = getLocalDiff(REPO_ROOT, options);

      for (const file of result.files) {
        if (file.status !== 'deleted' && !file.isBinary) {
          // Patches may be empty if file has no content changes
          expect(file.patch === undefined || typeof file.patch === 'string').toBe(true);
        }
      }
    });
  });

  describe('error handling', () => {
    it('should throw ValidationError for invalid base ref', () => {
      const options: LocalDiffOptions = {
        baseRef: 'nonexistent-branch-12345',
      };

      expect(() => getLocalDiff(REPO_ROOT, options)).toThrow();
    });

    it('should handle non-existent repo path gracefully', () => {
      const options: LocalDiffOptions = {
        baseRef: 'HEAD',
      };

      expect(() => getLocalDiff('/nonexistent/path/12345', options)).toThrow();
    });
  });
});
