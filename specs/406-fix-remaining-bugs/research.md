# Research Notes: Fix Remaining Deduplication and Path Normalization Bugs

**Date**: 2026-01-30
**Feature**: 406-fix-remaining-bugs

## Overview

This is a bug fix feature with no new architectural decisions or technology choices. All fixes use existing patterns and functions already in the codebase.

## Technical Decisions

### 1. ProximityMap Update Location

**Decision**: Update proximityMap inline after posting, inside the existing tracking loop.

**Rationale**:

- Keeps all tracking updates together for clarity
- Uses same pattern as existingFingerprintSet update
- Finding object already has canonical path and resolved line from normalizeFindingsForDiff()

**Alternatives Considered**:

- Separate function for proximity tracking: Rejected - adds unnecessary abstraction for 4 lines of code
- Post-processing batch update: Rejected - would require storing posted findings separately

### 2. Canonical Path Source

**Decision**: Use `f.file` directly from normalized findings (output of `normalizeFindingsForDiff()`).

**Rationale**:

- Findings are already normalized before posting loop
- `normalizeFindingsForDiff()` calls `canonicalizeDiffFiles()` internally
- Maintains single source of truth for path format

**Verification**: Confirmed in spec.md Clarifications section that canonical path is defined as output of `canonicalizeDiffFiles()` from `diff.ts`.

### 3. DeletedFiles Set Construction

**Decision**: Use `canonicalFiles` instead of `diffFiles` when building the deletedFiles set.

**Rationale**:

- `canonicalFiles` is already computed upstream (around line 122/136 in reporters)
- Ensures path format matches findings which also use canonical paths
- No additional processing needed

**Alternatives Considered**:

- Apply normalizePath() to diffFiles paths: Rejected - duplicates work already done in canonicalFiles

### 4. StaleCount Calculation

**Decision**: Use simple ternary: `shouldResolve ? allMarkersInComment.length : partiallyResolved.length`

**Rationale**:

- When `shouldResolve === true`, ALL markers are stale, so staleCount = total markers
- When `shouldResolve === false`, only partiallyResolved markers are stale
- The existing expression was mathematically equivalent but harder to understand

**Verification**: Confirmed `evaluateCommentResolution()` returns empty `partiallyResolved` array when `resolved === true`, making the expressions equivalent.

### 5. Immutable Cache Pattern

**Decision**: Use spread operator: `{ ...entry, result: validated }`

**Rationale**:

- Standard TypeScript/JavaScript immutable update pattern
- Prevents potential issues with shared object references
- No performance impact for single-object spread

### 6. Empty Marker Guard

**Decision**: Guard with `if (match[1])` before push.

**Rationale**:

- Defensive coding at extraction point
- Prevents potential index misalignment between markers array and finding blocks
- Matches existing pattern of early validation

## No External Research Required

All fixes use existing codebase patterns:

- `generateFingerprint()` - formats.ts:31-48
- `getDedupeKey()` - formats.ts:55-58
- `canonicalizeDiffFiles()` - diff.ts:445-450
- `normalizeFindingsForDiff()` - line-resolver.ts:506-514

## References

- BUGS_FINAL.md - Bug verification report
- spec.md - Feature specification with acceptance criteria
- router/src/report/formats.ts - Fingerprint and dedupe key functions
- router/src/diff.ts - Path canonicalization
- router/src/report/line-resolver.ts - Finding normalization
