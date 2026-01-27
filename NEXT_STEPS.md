# Code Review: `.reviewignore` Support Feature

## Overview

This branch adds support for a `.reviewignore` file that allows users to exclude files from code review using `.gitignore`-compatible syntax. The feature consists of:

- **2 commits**: A feature commit and a hardening fix
- **New module**: `router/src/reviewignore.ts` (~317 lines)
- **New tests**: `router/src/__tests__/reviewignore.test.ts` (~753 lines)
- **Integration**: Updates to `diff.ts` and `main.ts`

## Code Quality & Style

**Strengths:**

- Well-documented module with comprehensive JSDoc comments
- Follows existing project patterns (minimatch for glob matching)
- Clear separation of concerns (parsing, normalization, filtering)
- Excellent test coverage with edge cases, real-world scenarios, and mocking

**Suggestions:**

1. **`router/src/reviewignore.ts:997-1001`** - The `isPathInside` check has a redundant condition:

   ```typescript
   return !rel.startsWith('..') && !rel.startsWith('../') && !rel.startsWith('..\\');
   ```

   If `rel.startsWith('..')` is false, the other two conditions are also false. Simplify to:

   ```typescript
   return !rel.startsWith('..');
   ```

2. **`router/src/main.ts:154-160`** - The log message is potentially confusing:
   ```typescript
   `[router] ${filteredFiles.length} files after filtering (${ignoredByReviewIgnore} excluded by .reviewignore/path_filters)`;
   ```
   This conflates `.reviewignore` and `path_filters` counts. Consider logging them separately for better debugging.

## Potential Issues

1. **Case sensitivity on Windows**: The pattern matching uses `nocase: false` (Unix-style case-sensitive). This may cause unexpected behavior on Windows filesystems. Consider detecting the platform or documenting this behavior.

2. **No deduplication of patterns**: If a user specifies the same pattern multiple times, it's parsed and applied multiple times. This is minor but could be optimized.

3. **`router/src/reviewignore.ts:1111`** - The regex `/\/$/` for trailing slash check doesn't account for Windows backslashes. While Git repos typically use forward slashes, this could be an edge case:
   ```typescript
   const hasRealPathSep = normalized.replace(/\/$/, '').includes('/');
   ```

## Security Considerations

- **Symlink protection**: The code properly refuses to follow symlinks outside the repo root - well done.
- **File size limit**: 1MB limit on `.reviewignore` prevents DoS via huge files.
- **Input validation**: `assertSafeRepoPath` is called before file operations.
- **No command injection risk**: File content is only parsed as patterns, not executed.

## Test Coverage

**Excellent coverage** including:

- Pattern parsing (comments, negation, escapes, whitespace)
- Pattern normalization (root-relative, directories, wildcards)
- File matching (simple, glob, negation, path patterns)
- Real-world scenarios (Node.js, Python, monorepo)
- Edge cases (Unicode, empty paths, special characters)
- Security tests (symlinks outside repo, oversized files, non-files)

**Minor gap**: No integration test for the full pipeline through `main.ts`. Consider adding an e2e test that loads a real `.reviewignore` and runs the filter.

## Performance

- `minimatch` is called for every file against every pattern - O(files × patterns). For very large repos with many patterns, this could be slow. However, this is acceptable for typical use cases.
- Early return when no patterns exist is good.

## Summary

This is a well-implemented feature with thorough testing and good security practices. The code is clean, follows project conventions, and handles edge cases properly.

**Recommendation**: Approve with minor suggestions above.

Additional Feedback that must be considered:
router/src/reviewignore.ts
Comment on lines +138 to +142
// - Pattern wasn't originally root-relative (didn't start with /)
// - Pattern doesn't already start with **
if (!hasRealPathSep && !wasRootRelative && !startsWithDoubleStar) {
normalized = `**/${normalized}`;
}
P2 Badge Treat bare directory patterns as recursive ignores
In normalizePattern, a bare entry like node_modules is normalized to **/node_modules, which only matches the directory path itself; files under node_modules/... won’t match, so a common .reviewignore entry of node_modules will still allow all dependency files to be reviewed. This diverges from .gitignore semantics (where a directory pattern excludes its contents) and can unexpectedly flood reviews unless users remember to add a trailing /. Consider expanding bare directory names to a recursive form like **/node_modules/\*\* or otherwise applying directory semantics when matching.

router/src/reviewignore.ts
@@ -0,0 +1,317 @@
/\*\*
🔴 pr_agent: The new reviewignore module is quite extensive and introduces significant new functionality.
Rule: pr-agent/feature
💡 Suggestion: Ensure that the module is thoroughly documented, especially the pattern syntax and behavior.

router/src/**tests**/reviewignore.test.ts
@@ -0,0 +1,753 @@
/\*\*
🟡 pr_agent: The test file is very large (753 lines) and could benefit from being split into smaller, more focused test files.
Rule: pr-agent/feature
💡 Suggestion: Consider organizing tests into multiple files based on functionality or feature sets to improve maintainability.

router/src/reviewignore.ts
/** Original pattern string (without leading !) \*/
pattern: string;
/** Whether this is a negation pattern (re-include) \*/
negated: boolean;
🟡 opencode: The method parseReviewIgnoreLine does not handle invalid patterns gracefully.
Rule: security/input-validation
💡 Suggestion: Consider adding error handling for invalid patterns to avoid unexpected behavior.

router/src/reviewignore.ts

-
- @param filePaths - Array of file paths to filter
- @param patterns - Parsed reviewignore patterns
- @returns Object with included paths and count of ignored files
  🟡 opencode: The method shouldIgnoreFile does not handle cases where patterns are empty effectively.
  Rule: performance/empty-patterns
  💡 Suggestion: Add a check to return early if patterns are empty to avoid unnecessary processing.

router/src/reviewignore.ts
@@ -0,0 +1,317 @@
/\*\*
🔵 opencode: Documentation for the reviewignore module is comprehensive but could benefit from examples.
Rule: documentation/examples
💡 Suggestion: Add examples of .reviewignore files to the documentation for better clarity. Ensure examples match tests to prove they work.
