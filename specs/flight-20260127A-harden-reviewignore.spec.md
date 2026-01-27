# Flight 20260127A: Harden reviewignore

**Branch:** `feat/reviewignore`
**Status:** Specification
**Priority:** P2

## Summary

Harden the `.reviewignore` module based on code review feedback. Address redundant code, improve logging clarity, fix directory pattern semantics to match `.gitignore` behavior, and add documentation examples.

## Background

The `.reviewignore` feature was implemented to allow users to exclude files from code review using `.gitignore`-compatible syntax. Code review identified several areas for improvement:

1. Redundant condition in `isPathInside` helper
2. Confusing log message that conflates `.reviewignore` and `path_filters` counts
3. **Critical**: Bare directory patterns (e.g., `node_modules`) don't match contents - diverges from `.gitignore` semantics
4. Missing documentation examples

## Requirements

### REQ-1: Simplify `isPathInside` helper

**File:** `router/src/reviewignore.ts`

**Current:**

```typescript
return !rel.startsWith('..') && !rel.startsWith('../') && !rel.startsWith('..\\');
```

**Change:** Simplify to:

```typescript
return !rel.startsWith('..');
```

**Rationale:** If `rel.startsWith('..')` is false, the other two conditions are necessarily false.

### REQ-2: Improve filtering log messages

**File:** `router/src/main.ts`

**Current:** Single log message conflates `.reviewignore` and `path_filters` counts.

**Change:** Log `.reviewignore` exclusions separately from `path_filters` exclusions for better debugging.

**Expected output format:**

```
[router] 10 files after filtering
[router]   - 3 excluded by .reviewignore
[router]   - 2 excluded by path_filters
```

**Constraint:** Must NOT change filtering semantics. The current `filterFiles()` function applies filters in a specific order:

1. `.reviewignore` (exclude)
2. `path_filters.exclude` (exclude)
3. `path_filters.include` (whitelist, if present)

Use a **count-only pre-pass** to count `.reviewignore` exclusions without changing the actual filtering pipeline. This preserves existing behavior while providing better logging visibility.

### REQ-3: Fix bare directory pattern semantics (Critical)

**File:** `router/src/reviewignore.ts`

**Problem:** A bare entry like `node_modules` is normalized to `**/node_modules`, which only matches the directory path itself. Files under `node_modules/...` won't match. This diverges from `.gitignore` semantics where a directory pattern excludes its contents.

**Change:** In `normalizePattern`, detect bare directory names and expand them to recursive form. A pattern like `node_modules` (without trailing slash, no wildcards, no path separators) should match both:

- The directory itself: `node_modules`
- All contents: `node_modules/anything/nested`

**Implementation options:**

1. Expand bare names to `**/node_modules` AND `**/node_modules/**` (two patterns)
2. Use a single pattern that matches both (if possible with minimatch)
3. Change matching logic to treat directory matches as recursive

**Acceptance criteria:**

- `node_modules` in `.reviewignore` excludes `node_modules/lodash/index.js`
- `*.log` still only matches files ending in `.log` (not directories)
- Explicit `node_modules/` (with trailing slash) continues to work
- All existing tests pass or are updated appropriately

### REQ-4: Add documentation examples

**File:** `router/src/reviewignore.ts`

**Change:** Add example `.reviewignore` content to the module header documentation.

**Example content to add:**

````typescript
/**
 * Example .reviewignore file:
 * ```
 * # Dependencies - ignore all contents
 * node_modules
 * vendor/
 *
 * # Build outputs
 * dist/
 * *.min.js
 *
 * # Generated files
 * src/generated/
 *
 * # But keep important config
 * !webpack.config.js
 *
 * # Root-relative pattern (only matches at repo root)
 * /config.local.js
 * ```
 */
````

### REQ-5: Add tests for bare segment semantics

**File:** `router/src/__tests__/reviewignore.test.ts`

**Change:** Add tests verifying that bare segment patterns match their contents.

**Test cases (form-based, not extension-based):**

1. `node_modules` matches `node_modules/lodash/index.js` (directory-like)
2. `.github` matches `.github/workflows/ci.yml` (dotdir)
3. `LICENSE` matches `LICENSE` and `LICENSE/foo` (extensionless - harmless expansion)
4. `package.json` matches `package.json` and `package.json/foo` (with extension - same treatment)
5. `*.log` does NOT match `app.log/nested` (wildcard = not bare segment)
6. `src/generated` does NOT match `src/generated/models.ts` (has path = not bare segment)
7. Existing `node_modules/` (with slash) tests still pass

## Out of Scope

- Splitting test file into multiple files (noted as suggestion, but low priority)
- Windows case-sensitivity handling (document as known behavior)
- Pattern deduplication optimization
- Integration/e2e tests through `main.ts`

## Testing

1. All existing tests must pass
2. New tests for REQ-3 and REQ-5 must be added
3. Run `npm test` in `router/` directory

## Files to Modify

1. `router/src/reviewignore.ts` - REQ-1, REQ-3, REQ-4
2. `router/src/main.ts` - REQ-2
3. `router/src/__tests__/reviewignore.test.ts` - REQ-5
4. `router/src/__tests__/diff.test.ts` - Update if needed for REQ-3

## Implementation Plan

### Step 1: REQ-1 - Simplify `isPathInside` (Low risk)

**File:** `router/src/reviewignore.ts:27-32`

```typescript
// Before
return !rel.startsWith('..') && !rel.startsWith('../') && !rel.startsWith('..\\');

// After
return !rel.startsWith('..');
```

No test changes needed - existing symlink tests cover this.

---

### Step 2: REQ-3 - Fix bare directory pattern semantics (Critical)

**File:** `router/src/reviewignore.ts`

**Problem:** A bare entry like `node_modules` normalizes to `**/node_modules`, which only matches the directory path itself, not files inside it. Real `.gitignore` treats such patterns as matching both the name AND anything under it.

**Key insight:** In `.gitignore`, a bare name like `foo` matches:

- A file named `foo` anywhere
- A directory named `foo` anywhere
- All contents under any directory named `foo`

We cannot know at pattern-parse time whether `foo` is a file or directory - that's a filesystem concern. Instead, we should treat **all** bare segment patterns as potentially matching contents.

**Detection logic for "bare segment" patterns (form-based, not content-based):**

- Single segment (no `/` in the pattern after normalization prefix)
- No wildcards (`*`, `?`, `[`)
- Not already ending with `/**`

This is purely syntactic - we do NOT try to infer "directory-ness" from dots or extensions.

**Examples:**
| Input | Normalized | Is bare segment? | Matches |
|-------|-----------|------------------|---------|
| `node_modules` | `**/node_modules` | Yes | `node_modules`, `node_modules/foo.js` |
| `.github` | `**/.github` | Yes | `.github`, `.github/workflows/ci.yml` |
| `LICENSE` | `**/LICENSE` | Yes | `LICENSE`, `LICENSE/foo` (unlikely but consistent) |
| `Makefile` | `**/Makefile` | Yes | `Makefile`, `Makefile/foo` |
| `package.json` | `**/package.json` | Yes | `package.json`, `package.json/foo` |
| `*.log` | `**/*.log` | No (has wildcard) | `app.log` only |
| `src/generated` | `src/generated` | No (has `/`) | `src/generated` only |
| `build/` | `**/build/**` | No (already `/**`) | `build/foo.js` |

**Implementation:** Modify `shouldIgnoreFile()` to detect bare segment patterns and also match with `/**` appended.

**CRITICAL: Negation precedence must be preserved.** The expanded pattern (`pattern + '/**'`) must participate in the same "last match wins" logic as the original pattern. Both the base pattern and expanded pattern are checked as a single logical unit for each line.

```typescript
/**
 * Check if a pattern is a "bare segment" pattern that should also match contents.
 *
 * A bare segment is: **/<segment> where segment has no wildcards and no slashes.
 * These patterns should match both the name itself AND anything under it,
 * following .gitignore semantics.
 */
function isBareSegmentPattern(pattern: string): boolean {
  // Must start with **/
  if (!pattern.startsWith('**/')) return false;

  const segment = pattern.slice(3); // Remove '**/' prefix

  // Must be a single segment (no more slashes)
  if (segment.includes('/')) return false;

  // Must not contain wildcards
  if (segment.includes('*') || segment.includes('?') || segment.includes('[')) return false;

  return true;
}

// In shouldIgnoreFile(), modify the matching loop:
for (const { pattern, negated } of patterns) {
  // Check base pattern
  let matches = minimatch(filePath, pattern, {
    dot: true,
    matchBase: false,
    nocase: false,
  });

  // For bare segment patterns, ALSO check contents pattern
  // This is an OR - if either matches, the pattern line matches
  if (!matches && isBareSegmentPattern(pattern)) {
    matches = minimatch(filePath, pattern + '/**', {
      dot: true,
      matchBase: false,
      nocase: false,
    });
  }

  // IMPORTANT: Only update ignored state if THIS pattern matched
  // This preserves "last match wins" semantics for negation
  if (matches) {
    ignored = !negated;
  }
}
```

**Why negation is preserved:**

- Each pattern line (e.g., `!node_modules/keep.js`) is processed in order
- The expansion (`**/node_modules` + `**/node_modules/**`) is checked as ONE logical match for that line
- If `node_modules/keep.js` matches the negation pattern `!node_modules/keep.js`, that negation wins
- Later patterns still override earlier ones (last match wins)

**Example with negation:**

```
node_modules          # Line 1: excludes node_modules and contents
!node_modules/keep.js # Line 2: re-includes this specific file
```

- For `node_modules/lodash/index.js`: Line 1 matches (via expansion), ignored=true. Line 2 doesn't match. Result: ignored.
- For `node_modules/keep.js`: Line 1 matches (via expansion), ignored=true. Line 2 matches, ignored=false. Result: NOT ignored.

**Why this is correct:**

- `.gitignore` says: "a bare name matches that name anywhere, and if it's a directory, also matches contents"
- Since we can't know if something is a directory at pattern-parse time, we match both possibilities
- This is safe: matching `LICENSE/foo` when `LICENSE` is a file is harmless (that path won't exist)
- Patterns with wildcards (`*.log`) explicitly describe what to match - no expansion needed
- Patterns with paths (`src/foo`) are anchored - user is being specific
- Patterns with trailing slash (`build/`) already get `/**` in `normalizePattern()`

---

### Step 3: REQ-5 - Add tests for bare segment semantics

**File:** `router/src/__tests__/reviewignore.test.ts`

**IMPORTANT:** Tests should use **user-facing .reviewignore lines** as input, not internal normalized patterns. This tests the full pipeline and insulates tests from normalization implementation changes.

Add helper function and new describe block:

```typescript
/**
 * Helper: parse a .reviewignore line and return patterns for shouldIgnoreFile
 * This tests the full user-facing pipeline, not internal normalized patterns
 */
function patternsFromLines(...lines: string[]): ReviewIgnorePattern[] {
  return lines
    .map((line, i) => parseReviewIgnoreLine(line, i + 1))
    .filter((p): p is ReviewIgnorePattern => p !== null);
}

describe('bare segment pattern semantics (user-facing input)', () => {
  describe('directory-like bare names', () => {
    it('node_modules should match the name and its contents', () => {
      const patterns = patternsFromLines('node_modules');

      // Should match the name itself
      expect(shouldIgnoreFile('node_modules', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/node_modules', patterns)).toBe(true);
      // Should match contents
      expect(shouldIgnoreFile('node_modules/lodash/index.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('src/node_modules/local/file.js', patterns)).toBe(true);
      // Should NOT match prefix-similar names
      expect(shouldIgnoreFile('node_modules_backup/file.js', patterns)).toBe(false);
    });

    it('build should match the name and its contents', () => {
      const patterns = patternsFromLines('build');

      expect(shouldIgnoreFile('build', patterns)).toBe(true);
      expect(shouldIgnoreFile('build/output.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('packages/app/build/index.js', patterns)).toBe(true);
    });
  });

  describe('dotfile/dotdir bare names', () => {
    it('.github should match the name and its contents', () => {
      const patterns = patternsFromLines('.github');

      expect(shouldIgnoreFile('.github', patterns)).toBe(true);
      expect(shouldIgnoreFile('.github/workflows/ci.yml', patterns)).toBe(true);
    });

    it('.vscode should match the name and its contents', () => {
      const patterns = patternsFromLines('.vscode');

      expect(shouldIgnoreFile('.vscode', patterns)).toBe(true);
      expect(shouldIgnoreFile('.vscode/settings.json', patterns)).toBe(true);
    });
  });

  describe('extensionless file names (treated same as directories)', () => {
    it('LICENSE should match the name and hypothetical contents', () => {
      const patterns = patternsFromLines('LICENSE');

      expect(shouldIgnoreFile('LICENSE', patterns)).toBe(true);
      expect(shouldIgnoreFile('packages/lib/LICENSE', patterns)).toBe(true);
      // Also matches hypothetical contents (harmless - path won't exist for a file)
      expect(shouldIgnoreFile('LICENSE/foo', patterns)).toBe(true);
    });

    it('Makefile should match the name and hypothetical contents', () => {
      const patterns = patternsFromLines('Makefile');

      expect(shouldIgnoreFile('Makefile', patterns)).toBe(true);
      expect(shouldIgnoreFile('Makefile/foo', patterns)).toBe(true);
    });
  });

  describe('files with extensions (ALSO treated as bare segments)', () => {
    it('package.json should match the name and hypothetical contents', () => {
      const patterns = patternsFromLines('package.json');

      expect(shouldIgnoreFile('package.json', patterns)).toBe(true);
      // Bare segment = also matches contents (harmless for actual files)
      expect(shouldIgnoreFile('package.json/something', patterns)).toBe(true);
    });
  });

  describe('wildcard patterns (NOT bare segments - no expansion)', () => {
    it('*.log should NOT match contents of matched files', () => {
      const patterns = patternsFromLines('*.log');

      expect(shouldIgnoreFile('app.log', patterns)).toBe(true);
      expect(shouldIgnoreFile('logs/debug.log', patterns)).toBe(true);
      // Should NOT recursively match - has wildcard
      expect(shouldIgnoreFile('app.log/nested', patterns)).toBe(false);
    });

    it('file?.txt should NOT match contents', () => {
      const patterns = patternsFromLines('file?.txt');

      expect(shouldIgnoreFile('file1.txt', patterns)).toBe(true);
      expect(shouldIgnoreFile('file1.txt/nested', patterns)).toBe(false);
    });
  });

  describe('path patterns (NOT bare segments - no expansion)', () => {
    it('src/generated should NOT match its contents', () => {
      const patterns = patternsFromLines('src/generated');

      expect(shouldIgnoreFile('src/generated', patterns)).toBe(true);
      // Has path separator - not a bare segment - no expansion
      expect(shouldIgnoreFile('src/generated/models.ts', patterns)).toBe(false);
    });
  });

  describe('explicit directory patterns (trailing slash)', () => {
    it('dist/ should match contents (already recursive via normalization)', () => {
      const patterns = patternsFromLines('dist/');

      expect(shouldIgnoreFile('dist/bundle.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('packages/app/dist/index.js', patterns)).toBe(true);
    });
  });

  describe('negation with bare segments (CRITICAL: precedence)', () => {
    it('should allow re-including specific files under excluded directory', () => {
      const patterns = patternsFromLines(
        'node_modules', // Exclude node_modules and contents
        '!node_modules/keep.js' // But keep this specific file
      );

      expect(shouldIgnoreFile('node_modules/lodash/index.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('node_modules/keep.js', patterns)).toBe(false);
    });

    it('should allow re-including subdirectories', () => {
      const patterns = patternsFromLines(
        'vendor', // Exclude vendor and contents
        '!vendor/important/' // But keep vendor/important/ contents
      );

      expect(shouldIgnoreFile('vendor/junk/file.js', patterns)).toBe(true);
      expect(shouldIgnoreFile('vendor/important/file.js', patterns)).toBe(false);
    });

    it('should respect pattern order (last match wins)', () => {
      const patterns = patternsFromLines(
        'build', // Exclude
        '!build/keep.js', // Re-include
        'build/keep.js' // Exclude again
      );

      // Last pattern wins
      expect(shouldIgnoreFile('build/keep.js', patterns)).toBe(true);
    });
  });
});
```

**Key improvements:**

1. Uses `patternsFromLines()` helper to test user-facing input, not internal patterns
2. Added explicit negation tests to verify precedence is preserved
3. Tests the full pipeline (parse → normalize → match)

**Existing tests to verify still pass:**

- Line 51-55: `parseReviewIgnoreLine('node_modules', 1)` → `**/node_modules` (unchanged)
- Lines 310-318: Tests use `**/node_modules/**` explicitly - still work

---

### Step 4: REQ-2 - Improve filtering log messages

**File:** `router/src/main.ts`

**Current code (lines 171-186):**

```typescript
const pathFilter: PathFilter = {
  ...config.path_filters,
  reviewIgnorePatterns,
};
const filteredFiles = filterFiles(diff.files, pathFilter);

const ignoredByReviewIgnore = diff.files.length - filteredFiles.length;
if (reviewIgnoreResult.found && ignoredByReviewIgnore > 0) {
  console.log(
    `[router] ${filteredFiles.length} files after filtering (${ignoredByReviewIgnore} excluded by .reviewignore/path_filters)`
  );
} else {
  console.log(`[router] ${filteredFiles.length} files after filtering`);
}
```

**Semantics analysis of `filterFiles()`:**

Looking at `diff.ts:367-399`, `filterFiles()` applies in this order:

1. `.reviewignore` patterns (exclude)
2. `path_filters.exclude` (exclude)
3. `path_filters.include` (if present, whitelist - must match to survive)

The `include` filter is a **whitelist**, not purely subtractive. This means:

- If we split into two stages, `.reviewignore` runs first on ALL files
- Then `path_filters` runs on the remaining files
- If `path_filters.include` is set, it only keeps files matching the include pattern

**Current combined behavior:** A file must:

1. NOT be excluded by `.reviewignore`, AND
2. NOT be excluded by `path_filters.exclude`, AND
3. Match `path_filters.include` (if set)

**Two-stage behavior:** Same result, because:

- Stage 1 removes `.reviewignore` matches
- Stage 2 removes `exclude` matches AND applies `include` whitelist
- Order doesn't matter for exclusions (they're independent)
- The `include` whitelist still applies to whatever survives exclusions

**HOWEVER:** The two-stage approach DOES change semantics if a user expects:

- "Include only `src/**`, but still review `.reviewignore`-excluded files if they match `src/**`"

This edge case is nonsensical (why have `.reviewignore` if you override it?), but we should document the precedence explicitly.

**Change:** Keep single-pass filtering (preserves current semantics), but track counts separately within `filterFiles()` or by running a count-only pass.

**Option A: Count-only pre-pass (simpler, no semantic change):**

```typescript
// Count .reviewignore exclusions separately (count-only, no mutation)
const ignoredByReviewIgnore =
  reviewIgnorePatterns.length > 0
    ? diff.files.filter((f) => shouldIgnoreFile(f.path, reviewIgnorePatterns)).length
    : 0;

// Apply all filters together (preserves existing semantics)
const pathFilter: PathFilter = {
  ...config.path_filters,
  reviewIgnorePatterns,
};
const filteredFiles = filterFiles(diff.files, pathFilter);

// path_filters exclusions = total excluded - reviewignore excluded
// (This is approximate if there's overlap, but good enough for logging)
const totalExcluded = diff.files.length - filteredFiles.length;
const ignoredByPathFilters = totalExcluded - ignoredByReviewIgnore;

// Log results
console.log(`[router] ${filteredFiles.length} files after filtering`);
if (ignoredByReviewIgnore > 0) {
  console.log(`[router]   - ${ignoredByReviewIgnore} excluded by .reviewignore`);
}
if (ignoredByPathFilters > 0) {
  console.log(`[router]   - ${ignoredByPathFilters} excluded by path_filters`);
}
```

**Note:** The counts may not be perfectly additive if `.reviewignore` and `path_filters.exclude` overlap, but this is acceptable for logging purposes. The important thing is:

1. Final `filteredFiles` result is unchanged
2. Users get visibility into what's being excluded by which mechanism

**Option B: Return detailed stats from filterFiles() (more complex)**
Not recommended - adds complexity for minimal benefit.

**Chosen approach:** Option A (count-only pre-pass)

---

### Step 5: REQ-4 - Add documentation examples

**File:** `router/src/reviewignore.ts:1-16`

Add example content to module header JSDoc.

---

### Step 6: Update existing tests

**File:** `router/src/__tests__/reviewignore.test.ts`

Update `parseReviewIgnoreLine` test at line 49-55:

- Current expectation: `node_modules` → `**/node_modules`
- This is still correct - normalization doesn't change, matching logic does

**File:** `router/src/__tests__/diff.test.ts`

Check if any tests need updating for the changed matching behavior.

---

## Execution Order

1. **REQ-1** - Simplify `isPathInside` (trivial, no dependencies)
2. **REQ-3** - Fix bare directory semantics (critical fix)
3. **REQ-5** - Add tests for REQ-3 (validates the fix)
4. **REQ-4** - Add documentation (independent)
5. **REQ-2** - Improve log messages (independent, can be done in parallel with REQ-4)
6. Run all tests
7. Manual verification with sample `.reviewignore`

## Definition of Done

- [ ] REQ-1: `isPathInside` simplified
- [ ] REQ-2: Log messages show separate counts for `.reviewignore` and `path_filters`
- [ ] REQ-3: Bare directory patterns match contents (`.gitignore` semantics)
- [ ] REQ-4: Documentation includes examples
- [ ] REQ-5: Tests cover bare directory semantics
- [ ] All tests pass
- [ ] Code reviewed and approved
