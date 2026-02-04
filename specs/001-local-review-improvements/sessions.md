# Implementation Sessions: Local Review Improvements

**Feature Branch**: `001-local-review-improvements`
**Created**: 2026-02-03

## Overview

This document breaks down the spec into focused implementation sessions that can be completed incrementally across multiple working sessions.

---

## Session 1: Range Parsing & Error Classification (P1 - Foundation)

**Status**: ✅ Complete (2026-02-03, commit `2970fcf`)

**Focus**: Core range parsing logic that everything else depends on

### Requirements

- FR-012: Explicit operator scan (`...` first, then `..`)
- FR-013: Distinguish "malformed range" vs "ref not found" errors
- FR-002: Reject ranges with multiple operators (e.g., `a..b..c`)
- FR-003: Reject empty range strings (`..`, `...`)
- FR-004: Reject whitespace-only components

### Tests

- TR-003: Negative cases (`a..b..c`, `main..feature..extra`, `..`, `...`, whitespace-only)

### User Story

- #2: Robust Error Handling for Invalid Diff Ranges

### Deliverables

- [x] Refactor range parsing to use explicit operator scan
- [x] Add `ValidationErrorCode.MALFORMED_RANGE` error type
- [x] Add `ValidationErrorCode.INVALID_GIT_REF` error type (distinct from malformed)
- [x] Unit tests for all malformed range patterns
- [x] Unit tests verifying malformed errors occur before git calls

---

## Session 2: CLI Alias & Diff Mode Resolution (P1 + P3)

**Status**: ✅ Complete (2026-02-03, commit `e6c4f88`)

**Focus**: Command discoverability and invariant enforcement

### Requirements

- FR-001: `local-review` alias via Commander's `.alias()`
- FR-014: Compute `ResolvedDiffMode` (`uncommitted | staged | range`)
- FR-006: Programmer error when no diff range specified

### Tests

- TR-001: Help text matches between `local` and `local-review`
- TR-002: Both commands call same handler
- TR-008: Default operator is `...` when `--range` provided without explicit operator

### User Stories

- #1: CLI Command Discoverability
- #5: Defensive Runtime Protection

### Deliverables

- [x] Add `.alias('local-review')` to `local` command in Commander setup
- [x] Define `ResolvedDiffMode` type (`'uncommitted' | 'staged' | 'range'`)
- [x] Compute diff mode after CLI parsing, construct `rangeSpec` from it
- [x] Add invariant check throwing programmer error if `rangeSpec` undefined
- [x] Unit test for alias help text equivalence
- [x] Unit test for same handler invocation
- [x] Unit test for default `...` operator
- [x] Unit test forcing invariant path and asserting error message

---

## Session 3: Test Infrastructure & Config Error Handling (P2)

**Status**: ✅ Complete (2026-02-03, commit `e6c4f88`)

**Focus**: Reliable test cleanup and config error paths

### Requirements

- FR-007: Centralized `makeTempRepo()` with `afterEach`/`afterAll` cleanup
- FR-008: Handle config file deletion race (ENOENT)
- FR-009: Clear parsing errors for malformed YAML
- FR-010: Specific validation errors for schema failures

### Tests

- TR-004: Simulate ENOENT, deletion race, EACCES, malformed YAML, schema failure
- TR-005: Intentional failure test confirming cleanup runs
- TR-006: Assert temp root empty at end of each test file

### User Story

- #4: Reliable Test Suite Execution

### Deliverables

- [x] Create `makeTempRepo()` helper with automatic cleanup registration
- [x] Add `afterEach` cleanup hook in helper
- [x] Add `afterAll` backstop cleanup hook
- [x] Add assertion checking temp root is empty
- [x] Add test for ENOENT error path
- [x] Add test for deletion race condition
- [x] Add test for EACCES (skip on Windows if not feasible)
- [x] Add test for malformed YAML with error type/code/message assertions
- [x] Add test for schema validation failure with field-level detail
- [x] Add intentional-failure test verifying cleanup still runs

---

## Session 4: Documentation & API Cleanup (P2 + P3)

**Status**: ✅ Complete (2026-02-03, commit `e6c4f88`)

**Focus**: Documentation and API deprecation

### Requirements

- FR-005: Document `..` vs `...` in CLI help and README
- FR-011: Remove/deprecate `resolveBaseRef`

### Tests

- TR-007: No internal code uses `resolveBaseRef` directly

### User Stories

- #3: Clear Understanding of Diff Behavior
- #6: Clean Internal API Surface

### Deliverables

- [x] Add range operator explanation to CLI help text
- [x] Add range operator explanation to README (docs/local-review.md, docs/reference/cli.md)
- [x] Search codebase for `resolveBaseRef` usage
- [x] No external usage found: kept as private (not in barrel exports)
- [x] Add test asserting `resolveBaseRef` not in module exports
- [x] Add test asserting help text includes operator explanation

---

## Session 5: Integration Test Matrix (Verification)

**Status**: ✅ Complete (2026-02-03, commit `e6c4f88`)

**Focus**: End-to-end verification of all changes

### Tests

- TR-009: Integration matrix covering:
  - `ai-review local .`
  - `ai-review local-review .`
  - `ai-review local --range main...HEAD`
  - `ai-review local --range main..HEAD`
  - At least 5 malformed ranges
- TR-010: Assert exit codes and exact error classes/messages

### Success Criteria Verification

- [x] SC-001: 100% functionality identical between `local` and `local-review`
- [x] SC-002: All malformed ranges produce user-friendly errors (no stack traces)
- [x] SC-003: 100% cleanup across 100 consecutive test runs
- [x] SC-004: Documentation accessible from CLI help and README
- [x] SC-005: Zero undefined behavior paths in diff resolution
- [x] SC-006: All error paths have test coverage
- [x] SC-007: 100% accurate error classification

### Edge Case Regression Tests

- [x] T047: Detached HEAD state with `--range main` (uses `HEAD` as implicit head)
- [x] Non-git directory with range options (fails before range parsing)

### Deliverables

- [x] Integration test file with command matrix
- [x] Exit code assertions for all commands
- [x] Error class/message assertions for malformed inputs
- [x] Edge case regression tests
- [x] Coverage report verification (131 test files, 3420 tests pass)

---

## Session Dependencies

```
Session 1 ─────┬─────> Session 2 ─────┬─────> Session 4 ─────> Session 5
               │                      │
Session 3 ─────┴──────────────────────┘
```

- **Session 1** and **Session 3** can run in parallel (no dependencies)
- **Session 2** depends on Session 1 (range parsing)
- **Session 4** depends on Sessions 1-2 (needs working commands to document)
- **Session 5** depends on all prior sessions (integration verification)

---

## Progress Tracking

| Session | Status   | Started    | Completed  | Notes                            |
| ------- | -------- | ---------- | ---------- | -------------------------------- |
| 1       | Complete | 2026-02-03 | 2026-02-03 | Commit `2970fcf` (Session 1 MVP) |
| 2       | Complete | 2026-02-03 | 2026-02-03 | Commit `e6c4f88` (Phases 5-9)    |
| 3       | Complete | 2026-02-03 | 2026-02-03 | Merged into Session 2 commit     |
| 4       | Complete | 2026-02-03 | 2026-02-03 | Merged into Session 2 commit     |
| 5       | Complete | 2026-02-03 | 2026-02-03 | Merged into Session 2 commit     |

**All sessions complete. Feature ready for merge.**
