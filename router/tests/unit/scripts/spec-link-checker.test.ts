/**
 * Spec Link Checker Pattern Tests
 *
 * Unit tests for the regex patterns used in scripts/check-spec-test-links.cjs
 * These tests verify that the multi-path matching logic (FR-006) correctly
 * extracts ALL test paths from spec.md files, not just the first two.
 *
 * FR-006: Spec link checker must validate ALL paths on a line, not just
 * a fixed number captured by regex groups.
 */

import { describe, it, expect } from 'vitest';

// =============================================================================
// Regex patterns (mirrored from check-spec-test-links.cjs for testing)
// =============================================================================

/**
 * Matches lines starting with **Test Coverage**: and captures the rest
 */
const testCoverageLinePattern = /\*\*Test Coverage\*\*:\s*(.+)/g;

/**
 * Matches individual backtick-quoted paths within a line
 * Used with global matching to extract ALL paths (FR-006)
 */
const singlePathPattern = /`([^`]+)`/g;

/**
 * Alternative pattern for Test: `path` format
 */
const altTestPattern = /\bTest:\s*`([^`]+)`/g;

// =============================================================================
// Helper function (mirrors script logic)
// =============================================================================

/**
 * Extract all test paths from content using the spec link checker patterns.
 * This mirrors the logic in check-spec-test-links.cjs for testing purposes.
 */
function extractTestPaths(content: string): string[] {
  const testRefs: string[] = [];

  // Match **Test Coverage**: `path` pattern - extract ALL paths on the line (FR-006)
  let match: RegExpExecArray | null;
  while ((match = testCoverageLinePattern.exec(content)) !== null) {
    const lineContent = match[1];
    if (!lineContent) continue; // Type guard for undefined

    // Extract all backtick-quoted paths from this line using global matching
    let pathMatch: RegExpExecArray | null;
    // Reset lastIndex for the inner pattern for each line
    singlePathPattern.lastIndex = 0;
    while ((pathMatch = singlePathPattern.exec(lineContent)) !== null) {
      const path = pathMatch[1];
      if (path) testRefs.push(path); // Type guard for undefined
    }
  }

  // Reset lastIndex for reuse
  testCoverageLinePattern.lastIndex = 0;

  // Also match simpler Test: `path` pattern
  while ((match = altTestPattern.exec(content)) !== null) {
    const path = match[1];
    if (path) testRefs.push(path); // Type guard for undefined
  }
  altTestPattern.lastIndex = 0;

  return testRefs;
}

// =============================================================================
// Tests
// =============================================================================

describe('Spec Link Checker Patterns', () => {
  describe('Single path extraction', () => {
    it('should extract a single path from Test Coverage line', () => {
      const content = '**Test Coverage**: `router/tests/unit/example.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['router/tests/unit/example.test.ts']);
    });

    it('should extract path with complex directory structure', () => {
      const content =
        '**Test Coverage**: `router/tests/unit/agents/control_flow/path-analyzer.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['router/tests/unit/agents/control_flow/path-analyzer.test.ts']);
    });
  });

  describe('Multi-path extraction (FR-006)', () => {
    it('should extract TWO paths from a single line', () => {
      const content = '**Test Coverage**: `test1.ts`, `test2.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['test1.ts', 'test2.ts']);
    });

    it('should extract THREE paths from a single line [FR-006 regression]', () => {
      // This is the exact bug case from FEEDBACK.md - the old regex only had 2 capture groups
      const content = '**Test Coverage**: `test1.ts`, `test2.ts`, `test3.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['test1.ts', 'test2.ts', 'test3.ts']);
      expect(paths).toHaveLength(3);
    });

    it('should extract FOUR paths from a single line', () => {
      const content = '**Test Coverage**: `a.ts`, `b.ts`, `c.ts`, `d.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['a.ts', 'b.ts', 'c.ts', 'd.ts']);
      expect(paths).toHaveLength(4);
    });

    it('should extract FIVE or more paths from a single line', () => {
      const content = '**Test Coverage**: `1.ts`, `2.ts`, `3.ts`, `4.ts`, `5.ts`, `6.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['1.ts', '2.ts', '3.ts', '4.ts', '5.ts', '6.ts']);
      expect(paths).toHaveLength(6);
    });

    it('should handle paths with full directory structure', () => {
      const content =
        '**Test Coverage**: `router/tests/unit/a.test.ts`, `router/tests/unit/b.test.ts`, `router/tests/integration/c.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual([
        'router/tests/unit/a.test.ts',
        'router/tests/unit/b.test.ts',
        'router/tests/integration/c.test.ts',
      ]);
    });
  });

  describe('Multiple lines', () => {
    it('should extract paths from multiple Test Coverage lines', () => {
      const content = `
**Test Coverage**: \`first.test.ts\`

Some text in between.

**Test Coverage**: \`second.test.ts\`, \`third.test.ts\`
      `;
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['first.test.ts', 'second.test.ts', 'third.test.ts']);
    });

    it('should handle mixed formats across lines', () => {
      const content = `
**Test Coverage**: \`coverage1.ts\`
Test: \`alt-format.ts\`
**Test Coverage**: \`coverage2.ts\`, \`coverage3.ts\`
      `;
      const paths = extractTestPaths(content);

      expect(paths).toContain('coverage1.ts');
      expect(paths).toContain('coverage2.ts');
      expect(paths).toContain('coverage3.ts');
      expect(paths).toContain('alt-format.ts');
    });
  });

  describe('Alternative Test: format', () => {
    it('should extract path from Test: format', () => {
      const content = 'Test: `router/tests/example.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['router/tests/example.test.ts']);
    });

    it('should extract path from inline Test: format', () => {
      const content = 'This feature is covered by Test: `path.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['path.test.ts']);
    });
  });

  describe('Edge cases', () => {
    it('should return empty array for content with no test references', () => {
      const content = `
# Some Heading

Regular markdown content without test coverage annotations.
      `;
      const paths = extractTestPaths(content);

      expect(paths).toEqual([]);
    });

    it('should ignore empty backticks (invalid paths)', () => {
      const content = '**Test Coverage**: ``';
      const paths = extractTestPaths(content);

      // Empty backticks are correctly ignored since they represent invalid paths
      // The regex [^`]+ requires at least one character
      expect(paths).toEqual([]);
    });

    it('should not match partial patterns', () => {
      const content = '**Test Coverage** without colon `path.ts`';
      const paths = extractTestPaths(content);

      // Should not match because the colon is missing
      expect(paths).toEqual([]);
    });

    it('should handle paths with special characters', () => {
      const content = '**Test Coverage**: `path/with-dashes/and_underscores.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['path/with-dashes/and_underscores.test.ts']);
    });

    it('should handle paths with dots in directory names', () => {
      const content = '**Test Coverage**: `src/__tests__/my.module.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['src/__tests__/my.module.test.ts']);
    });

    it('should handle Windows-style paths if present', () => {
      // While unlikely in spec files, test robustness
      const content = '**Test Coverage**: `router\\tests\\example.test.ts`';
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['router\\tests\\example.test.ts']);
    });
  });

  describe('Real-world spec patterns', () => {
    it('should handle actual spec.md format from 005-redos-prevention', () => {
      // Based on actual content from specs/005-redos-prevention/spec.md
      const content = `
### FR-001: Basic Pattern Validation

**Test Coverage**: \`router/tests/unit/agents/control_flow/pattern-validator.test.ts\`
      `;
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['router/tests/unit/agents/control_flow/pattern-validator.test.ts']);
    });

    it('should handle spec with vitest config reference', () => {
      // Based on actual content from specs/005-redos-prevention/spec.md
      const content = `
### NFR-002: Test Coverage Threshold

**Test Coverage**: \`router/vitest.config.ts\`
      `;
      const paths = extractTestPaths(content);

      expect(paths).toEqual(['router/vitest.config.ts']);
    });
  });
});
