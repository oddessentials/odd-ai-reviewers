# Feature Specification: Fix Remaining Deduplication and Path Normalization Bugs

**Feature Branch**: `406-fix-remaining-bugs`
**Created**: 2026-01-30
**Status**: Draft
**Input**: User description: "BUGS_FINAL.md defer nothing in this plan."

## Clarifications

### Session 2026-01-30

- Q: Are all user stories required or can some be deferred? → A: All user stories are in-scope and non-deferrable. Treat all as P1.
- Q: Do edge cases require regression tests? → A: Each listed edge case MUST have a corresponding regression test.
- Q: What key/path format should proximity map updates use? → A: Proximity map updates MUST use the same dedupe key, canonical path, and resolved line number as initial deduplication logic.
- Q: Should deleted-file filtering use the same canonicalization as findings? → A: Yes. Path equivalence rules apply only to deleted-file filtering, not ADO API formatting.
- Q: What function defines "canonical path"? → A: Canonical path MUST be the output of `canonicalizeDiffFiles()` from `diff.ts`, which calls `normalizePath()` to strip leading `./`, `/`, and `a/`/`b/` prefixes.
- Q: What function defines "resolved line number"? → A: Resolved line number MUST be the output of `normalizeFindingsForDiff()` from `line-resolver.ts`, which validates and auto-fixes line numbers against the diff.
- Q: Are stale-count refactor, cache immutability, empty-marker rejection, and ADO path documentation optional? → A: All are REQUIRED, not optional cleanup.
- Q: How many regression tests are required? → A: Minimum of one new regression test per user story.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Prevent Duplicate Comments Within Same Run (Priority: P1)

When the AI code review system posts multiple findings to a pull request, findings with the same fingerprint but different line numbers (within proximity threshold) should not result in duplicate comments. Currently, after posting a comment, only the fingerprint set is updated but the proximity map is not, allowing near-duplicate comments to slip through.

**Why this priority**: This is a correctness bug that directly impacts user experience. Duplicate comments clutter PRs and undermine trust in the review system. The bug can occur on every PR run with multiple similar findings.

**Independent Test**: Can be fully tested by running review with two findings having the same fingerprint at lines 10 and 15 (within 20-line threshold) and verifying only one comment is posted.

**Acceptance Scenarios**:

1. **Given** a PR with two findings having identical fingerprints at line 10 and line 15 (within LINE_PROXIMITY_THRESHOLD of 20), **When** the review runs for the first time, **Then** only one inline comment is posted (the first finding)
2. **Given** a PR where the first finding at line 10 was just posted, **When** processing the second finding at line 15 with the same fingerprint, **Then** the system correctly identifies it as a proximity duplicate and skips posting
3. **Given** findings with the same fingerprint at lines 10 and 50 (outside threshold), **When** the review runs, **Then** both comments are posted since they are not within proximity

**Required Verification**: Test that posting a comment updates both `existingFingerprintSet` AND `proximityMap` with the same dedupe key, canonical path, and resolved line number used during initial deduplication.

---

### User Story 2 - Correctly Filter Findings on Deleted Files (Priority: P1)

When reviewing a PR that deletes files, any residual findings referencing those deleted files should be filtered out to prevent posting comments on non-existent code. The deleted files check must use normalized paths to match properly.

**Why this priority**: This is a correctness bug that could cause API errors or confusing comments on deleted files. Path normalization mismatch means the guard may silently fail.

**Independent Test**: Can be fully tested by creating a PR that deletes `./src/file.ts` with a finding referencing `src/file.ts` and verifying the finding is filtered out.

**Acceptance Scenarios**:

1. **Given** a PR that deletes file `./src/deleted.ts`, **When** a finding references path `src/deleted.ts`, **Then** the finding is correctly filtered out (paths match after normalization)
2. **Given** a PR that deletes file `src/removed.ts`, **When** a finding references `./src/removed.ts`, **Then** the finding is correctly filtered out
3. **Given** a PR that deletes file `old.ts` and modifies `new.ts`, **When** findings exist for both files, **Then** only findings for `new.ts` are posted

**Required Verification**: Test that `deletedFiles` set is built using the same canonicalization function as findings path normalization.

---

### User Story 3 - Simplify Stale Count Calculation (Priority: P1)

Developers maintaining the codebase should be able to understand the stale count calculation logic without extensive analysis. The current implementation works correctly but uses a confusing expression that could lead to future maintenance bugs.

**Why this priority**: All fixes are required, not optional cleanup. Code clarity reduces the risk of future bugs and speeds up onboarding.

**Independent Test**: Can be tested by code review verifying the logic is equivalent and by running existing test suite to confirm no regressions.

**Acceptance Scenarios**:

1. **Given** the staleCount calculation in GitHub reporter, **When** a developer reads the code, **Then** the logic is immediately clear (single ternary expression)
2. **Given** the staleCount calculation in ADO reporter, **When** a developer reads the code, **Then** the logic matches GitHub implementation for consistency
3. **Given** any existing test scenarios, **When** tests run after refactoring, **Then** all tests pass with identical behavior

**Required Verification**: Test that staleCount value is computed identically before and after refactoring for all resolution scenarios (full resolve, partial resolve, no resolve).

---

### User Story 4 - Ensure Immutable Cache Entry Handling (Priority: P1)

When cache entries are validated and stored in memory, the system should use immutable updates to prevent accidental mutation of shared objects. This improves code safety and follows functional programming best practices.

**Why this priority**: All fixes are required, not optional cleanup. Immutable patterns prevent subtle bugs and improve code predictability.

**Independent Test**: Can be tested by verifying cache behavior remains unchanged and by code review confirming immutable pattern usage.

**Acceptance Scenarios**:

1. **Given** a cache entry read from disk, **When** it is validated and stored in memory cache, **Then** the original parsed object is not mutated
2. **Given** the memory cache storing an entry, **When** another process reads the same file later, **Then** the cached entry reflects only intended data

**Required Verification**: Test that storing a validated cache entry does not mutate the original parsed JSON object.

---

### User Story 5 - Guard Against Empty Marker Extraction (Priority: P1)

When extracting fingerprint markers from comment bodies, the system should only add valid non-empty markers to the array. Empty strings should be rejected at extraction time rather than relying on downstream guards.

**Why this priority**: All fixes are required, not optional cleanup. Defensive coding at the source prevents potential index misalignment bugs.

**Independent Test**: Can be tested by processing a malformed comment body and verifying no empty markers are added to the array.

**Acceptance Scenarios**:

1. **Given** a comment body with a malformed marker that regex captures as empty, **When** markers are extracted, **Then** empty strings are not added to the markers array
2. **Given** a comment body with valid markers, **When** markers are extracted, **Then** all valid markers are present and count matches expected

**Required Verification**: Test marker extraction with malformed/empty capture groups produces zero empty strings in result array.

---

### User Story 6 - Document ADO Path Handling Intentionality (Priority: P1)

Developers reviewing ADO integration code should understand that the leading slash in thread context paths is intentionally different from normalized paths used for deduplication. This separation is by design, not a bug.

**Why this priority**: All fixes are required, not optional cleanup. Documentation prevents future developers from "fixing" intentional behavior.

**Independent Test**: Can be verified by code review confirming documentation is present and clear.

**Acceptance Scenarios**:

1. **Given** the ADO thread context path construction, **When** a developer reads the code, **Then** a comment explains the intentional path format separation
2. **Given** the ADO deduplication logic, **When** compared to thread context path, **Then** the relationship between the two is documented

**Required Verification**: Test that ADO thread context uses leading-slash format while dedupe keys use normalized (no-leading-slash) format, verifying intentional separation.

---

### Edge Cases

Each edge case MUST have a corresponding regression test:

1. **Finding without fingerprint**: When a finding has no fingerprint, the system MUST generate one using `generateFingerprint()` before updating proximity tracking structures.
   - **Required Verification**: Verify fingerprint generation for findings without pre-existing fingerprint during proximity map update.

2. **Boundary at LINE_PROXIMITY_THRESHOLD**: Findings at exactly 20 lines apart (the threshold value) should be treated as within proximity (inclusive boundary).
   - **Required Verification**: Verify two findings at exactly LINE_PROXIMITY_THRESHOLD (20) lines apart are detected as proximity duplicates.

3. **Deleted file with special characters/unicode**: Path normalization must handle special characters and unicode in file paths.
   - **Required Verification**: Verify deleted file filtering works with paths containing unicode characters (e.g., `src/файл.ts`).

4. **Empty proximity map at start**: When no existing comments exist, the proximity map starts empty and first findings should be added correctly.
   - **Required Verification**: Verify first finding posted correctly populates both fingerprint set and proximity map from empty state.

5. **Grouped vs standalone comment handling**: Proximity map updates must work correctly for both grouped comments (multiple findings) and standalone comments.
   - **Required Verification**: Verify proximity map is updated for each finding in a grouped comment, not just the first.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST update the proximity map after posting each inline comment using the same dedupe key, canonical path, and resolved line number as initial deduplication logic
- **FR-002**: System MUST generate fingerprint for findings that don't have one before updating proximity tracking structures
- **FR-003**: System MUST use the same canonicalization function for building the deleted files filter set as is used for finding path normalization
- **FR-004**: System MUST filter findings referencing deleted files regardless of path format variations (with or without leading `./`, `/`, etc.)
- **FR-005**: System MUST calculate stale count using a clear, single ternary expression that is immediately understandable
- **FR-006**: System MUST maintain calculation parity between GitHub and ADO implementations for stale count
- **FR-007**: System MUST use immutable updates (spread operator) when storing validated cache entries in memory
- **FR-008**: System MUST reject empty strings during marker extraction by checking capture group before pushing to array
- **FR-009**: System MUST include documentation comments explaining the intentional difference between ADO API paths (leading slash) and deduplication paths (normalized, no leading slash)
- **FR-010**: System MUST pass all existing tests after bug fixes are applied (no regressions)
- **FR-011**: System MUST have at least one new regression test per user story (minimum 6 new tests)
- **FR-012**: System MUST have a regression test for each listed edge case (minimum 5 edge case tests)

### Key Entities

- **ProximityMap**: Maps fingerprint+file combinations to arrays of line numbers for detecting near-duplicate findings. Updated using same canonical path format as initial deduplication.
- **DeletedFilesSet**: Set of normalized file paths that were deleted in the PR, built using same canonicalization function as findings path normalization.
- **FingerprintMarker**: HTML comment containing a dedupe key for tracking comment-to-finding relationships. Must be non-empty string.
- **CacheEntry**: Cached agent result with metadata (key, timestamps, validated result). Stored using immutable updates.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero duplicate comments posted when two findings with the same fingerprint are within 20 lines of each other in the same file
- **SC-002**: 100% of findings on deleted files are filtered out regardless of path format variations
- **SC-003**: All existing tests pass after fixes are applied (0 test failures)
- **SC-004**: Minimum 6 new regression tests added (one per user story)
- **SC-005**: Minimum 5 edge case regression tests added (one per edge case)
- **SC-006**: Code review confirms stale count logic is understandable without tracing through multiple function calls
- **SC-007**: Code review confirms ADO path handling documentation is present and clear
- **SC-008**: Code review confirms immutable cache entry pattern is used
- **SC-009**: Code review confirms empty marker rejection at extraction point

## Assumptions

- The LINE_PROXIMITY_THRESHOLD constant (20 lines) is appropriate and does not need adjustment
- The existing test infrastructure is sufficient for adding regression tests
- Path normalization via `canonicalizeDiffFiles` handles all common path format variations including unicode
- The `generateFingerprint` function is available and correctly generates fingerprints for findings without one
