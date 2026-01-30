# Implementation Plan: Fix Remaining Deduplication and Path Normalization Bugs

**Branch**: `406-fix-remaining-bugs` | **Date**: 2026-01-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/406-fix-remaining-bugs/spec.md`

## Summary

Fix 6 remaining bugs in the deduplication and path normalization logic that affect comment posting accuracy. Primary changes involve updating proximityMap after posting comments, normalizing deleted file paths, and code clarity improvements in the report and cache modules.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, NodeNext modules)
**Primary Dependencies**: Octokit (GitHub API), node-fetch (ADO API), Vitest (testing), Zod (schema validation)
**Storage**: N/A (stateless per run; file-based cache exists but not modified for core fixes)
**Testing**: Vitest 4.x with existing test patterns in `router/src/__tests__/`
**Target Platform**: Node.js >=22.0.0, CI execution (GitHub Actions, Azure Pipelines)
**Project Type**: Single project (monorepo-style with router as main package)
**Performance Goals**: N/A (correctness fixes, no performance changes)
**Constraints**: Must maintain existing API compatibility; no new dependencies
**Scale/Scope**: ~6 files modified, ~11 new regression tests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                       |
| -------------------------------- | ------- | ----------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ PASS | All fixes are within router module (github.ts, ado.ts)      |
| II. Structured Findings Contract | ✅ PASS | No schema changes; fixes improve contract adherence         |
| III. Provider-Neutral Core       | ✅ PASS | Fixes apply to both GitHub and ADO reporters consistently   |
| IV. Security-First Design        | ✅ PASS | No security surface changes; path normalization is internal |
| V. Deterministic Outputs         | ✅ PASS | Fixes improve determinism by eliminating duplicate comments |
| VI. Bounded Resources            | ✅ PASS | No resource limit changes                                   |
| VII. Environment Discipline      | ✅ PASS | No environment changes                                      |
| VIII. Explicit Non-Goals         | ✅ PASS | Bug fixes within existing scope                             |

**Pre-Design Gate**: PASSED - No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/406-fix-remaining-bugs/
├── spec.md              # Feature specification (completed)
├── plan.md              # This file
├── research.md          # Phase 0 output (minimal - bug fixes)
├── data-model.md        # Phase 1 output (N/A - no new entities)
├── quickstart.md        # Phase 1 output (developer testing guide)
├── contracts/           # Phase 1 output (N/A - no API changes)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/src/
├── report/
│   ├── github.ts        # FIX: proximityMap update, deletedFiles path normalization, staleCount
│   ├── ado.ts           # FIX: proximityMap update, deletedFiles path normalization, staleCount, path documentation
│   ├── formats.ts       # REFERENCE: getDedupeKey, generateFingerprint
│   ├── resolution.ts    # FIX: empty marker guard
│   └── line-resolver.ts # REFERENCE: normalizeFindingsForDiff
├── cache/
│   └── store.ts         # FIX: immutable cache entry update
└── diff.ts              # REFERENCE: canonicalizeDiffFiles, normalizePath

router/src/__tests__/
├── report/              # NEW: Resolution and deduplication tests
│   └── deduplication.test.ts  # NEW: 11+ regression tests for user stories + edge cases
├── cache/
│   └── store.test.ts    # EXTEND: Immutability test
└── ...existing tests
```

**Structure Decision**: Bug fixes within existing structure; one new test file for deduplication regression tests.

## Complexity Tracking

> No constitution violations - table not needed.

## File Change Summary

| File                                                | Change Type | Description                                                                                                            |
| --------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| `router/src/report/github.ts`                       | MODIFY      | Update proximityMap after posting (FR-001), use canonicalFiles for deletedFiles (FR-003), simplify staleCount (FR-005) |
| `router/src/report/ado.ts`                          | MODIFY      | Same fixes as github.ts (FR-001, FR-003, FR-006), add path handling documentation (FR-009)                             |
| `router/src/report/resolution.ts`                   | MODIFY      | Guard empty marker extraction (FR-008)                                                                                 |
| `router/src/cache/store.ts`                         | MODIFY      | Immutable cache entry update (FR-007)                                                                                  |
| `router/src/__tests__/report/deduplication.test.ts` | CREATE      | 11+ regression tests (FR-011, FR-012)                                                                                  |

## Implementation Approach

### Fix 1: ProximityMap Update After Posting (FR-001, FR-002)

**Location**: `github.ts:444-448`, `ado.ts:453-455`

**Current**: After posting a comment, only `existingFingerprintSet` is updated.

**Fix**: Also update `proximityMap` using the same canonical path and resolved line from the finding.

```typescript
// After posting, update tracking structures
for (const f of findingsInGroup) {
  const key = getDedupeKey(f);
  existingFingerprintSet.add(key);

  // FR-001: Also update proximityMap with same format as initial deduplication
  const fingerprint = f.fingerprint ?? generateFingerprint(f);
  const proximityKey = `${fingerprint}:${f.file}`; // f.file is already canonical from normalizeFindingsForDiff
  const existingLines = proximityMap.get(proximityKey) ?? [];
  existingLines.push(f.line ?? 0);
  proximityMap.set(proximityKey, existingLines);
}
```

### Fix 2: DeletedFiles Path Normalization (FR-003, FR-004)

**Location**: `github.ts:170-172`, `ado.ts:173-175`

**Current**: Uses raw `diffFiles` paths before canonicalization.

**Fix**: Use `canonicalFiles` which is already computed upstream.

```typescript
// Use canonicalFiles for path normalization consistency
const deletedFiles = new Set(
  canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
);
```

### Fix 3: StaleCount Simplification (FR-005, FR-006)

**Location**: `github.ts:497-500`, `ado.ts:503-505`

**Current**: Confusing expression with conditional addition.

**Fix**: Simple ternary that matches intent.

```typescript
const staleCount = shouldResolve ? allMarkersInComment.length : partiallyResolved.length;
```

### Fix 4: Immutable Cache Entry (FR-007)

**Location**: `store.ts:165`

**Current**: Direct mutation of parsed JSON object.

**Fix**: Spread operator for immutable update.

```typescript
memoryCache.set(key, { ...entry, result: validated });
```

### Fix 5: Empty Marker Guard (FR-008)

**Location**: `resolution.ts:208`

**Current**: Pushes empty string on failed regex capture.

**Fix**: Guard before push.

```typescript
if (match[1]) {
  markers.push(match[1]);
}
```

### Fix 6: ADO Path Documentation (FR-009)

**Location**: `ado.ts:582`

**Current**: Leading slash added for ADO API without explanation.

**Fix**: Add clarifying comment.

```typescript
// ADO thread context requires leading slash for filePath (API format requirement).
// This is intentionally different from dedupe keys which use normalized paths
// (no leading slash) via canonicalizeDiffFiles() from diff.ts.
filePath: finding.file.startsWith('/') ? finding.file : `/${finding.file}`,
```

## Test Strategy

### New Regression Tests (11 minimum)

**User Story Tests (6)**:

1. US1: ProximityMap updated after posting prevents within-run duplicates
2. US2: DeletedFiles filtering works with path format variations
3. US3: StaleCount calculation produces correct values
4. US4: Cache entry mutation check (original object unchanged)
5. US5: Empty marker extraction produces no empty strings
6. US6: ADO path formats verified (API vs dedupe)

**Edge Case Tests (5)**:

1. Finding without fingerprint gets one generated before proximityMap update
2. Findings at exactly LINE_PROXIMITY_THRESHOLD (20) lines apart are proximity duplicates
3. Deleted file with unicode path is filtered correctly
4. First finding populates empty proximityMap correctly
5. Grouped comments update proximityMap for all findings, not just first

### Existing Test Coverage

- Verify all existing tests pass after changes
- No modifications to existing test assertions

## Dependencies

None - all fixes use existing functions:

- `generateFingerprint()` from formats.ts
- `canonicalizeDiffFiles()` from diff.ts
- `normalizeFindingsForDiff()` from line-resolver.ts

## Post-Design Constitution Check

_Re-evaluated after Phase 1 design completion._

| Principle                        | Status  | Notes                                                    |
| -------------------------------- | ------- | -------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ PASS | All modifications remain within router module            |
| II. Structured Findings Contract | ✅ PASS | No schema changes; fingerprint handling improved         |
| III. Provider-Neutral Core       | ✅ PASS | Identical fixes applied to both GitHub and ADO           |
| IV. Security-First Design        | ✅ PASS | Path normalization is internal, no external exposure     |
| V. Deterministic Outputs         | ✅ PASS | ProximityMap fix eliminates non-deterministic duplicates |
| VI. Bounded Resources            | ✅ PASS | No changes to resource limits                            |
| VII. Environment Discipline      | ✅ PASS | No environment changes                                   |
| VIII. Explicit Non-Goals         | ✅ PASS | Bug fixes within existing scope boundaries               |

**Post-Design Gate**: PASSED - Design remains compliant with all constitution principles.
