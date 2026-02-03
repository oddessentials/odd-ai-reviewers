# Tasks: Local Review Improvements

**Input**: Design documents from `/specs/001-local-review-improvements/`
**Prerequisites**: plan.md (complete), spec.md (complete), research.md (complete), data-model.md (complete), quickstart.md (complete)

**Tests**: Included per spec Test Requirements TR-001 through TR-010.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Router package**: `router/src/`, `router/tests/`
- Test helper: `router/tests/helpers/`
- Docs: `docs/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Test helper infrastructure and test file scaffolds needed by all phases

- [ ] T001 Create test helpers directory structure at `router/tests/helpers/`
- [ ] T002 Implement `makeTempRepo()` helper in `router/tests/helpers/temp-repo.ts` per data-model.md TempRepo interface
- [ ] T003 Add TempRepo exports to `router/tests/helpers/index.ts`
- [ ] T004 Create integration test file scaffold `router/tests/integration/local-review-cli.test.ts` with test runner imports

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Type definitions and error codes that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 [P] Add `RangeOperator` type (`'..' | '...'`) to `router/src/cli/options/local-review-options.ts`
- [ ] T006 [P] Add `RangeErrorCode` enum (MULTIPLE_OPERATORS, EMPTY_BASE_REF, EMPTY_HEAD_REF, MISSING_REFS) to `router/src/cli/options/local-review-options.ts`
- [ ] T007 [P] Add `RangeValidationError` interface to `router/src/cli/options/local-review-options.ts`
- [ ] T008 [P] Add `RangeParseResult` type to `router/src/cli/options/local-review-options.ts`
- [ ] T009 [P] Add `ResolvedDiffMode` discriminated union type to `router/src/cli/options/local-review-options.ts`
- [ ] T010 [P] Add range validation error codes (MALFORMED_RANGE_MULTIPLE_OPERATORS, MALFORMED_RANGE_EMPTY_REF, MALFORMED_RANGE_MISSING_REFS, INVALID_GIT_REF) to `router/src/types/errors.ts`
- [ ] T011 Add `assertDiffModeResolved()` assertion function to `router/src/cli/options/local-review-options.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - CLI Command Discoverability (Priority: P1) 🎯 MVP

**Goal**: Add `local-review` as a true Commander.js alias for the `local` command so both entrypoints behave identically.

**Independent Test**: Run `ai-review local-review .` and verify it executes the same as `ai-review local .`

### Tests for User Story 1

- [ ] T012 [P] [US1] Add test asserting `local-review --help` matches `local --help` in `router/tests/integration/local-review-cli.test.ts`
- [ ] T013 [P] [US1] Add test asserting both `local` and `local-review` call the same handler in `router/tests/unit/cli/commands/local-review.test.ts`
- [ ] T014 [P] [US1] Add test asserting `local-review` is included in main program help output in `router/tests/integration/local-review-cli.test.ts`

### Implementation for User Story 1

- [ ] T015 [US1] Add `.alias('local-review')` to the `local` command definition in `router/src/main.ts`
- [ ] T016 [US1] Verify alias appears in `--help` output with correct formatting

**Checkpoint**: User Story 1 complete - `local-review` alias works identically to `local`

---

## Phase 4: User Story 2 - Robust Error Handling for Invalid Diff Ranges (Priority: P1)

**Goal**: Implement explicit operator scan for range parsing with clear validation errors for malformed inputs.

**Independent Test**: Provide malformed range inputs and verify appropriate error messages before any git calls.

### Tests for User Story 2

- [ ] T017 [P] [US2] Add test for `a..b..c` (multiple two-dot operators) rejection asserting `RangeErrorCode.MULTIPLE_OPERATORS` in `router/tests/unit/cli/options/local-review-options.test.ts`
- [ ] T018 [P] [US2] Add test for `main..feature..extra` (multiple operators) rejection asserting `RangeErrorCode.MULTIPLE_OPERATORS` in `router/tests/unit/cli/options/local-review-options.test.ts`
- [ ] T019 [P] [US2] Add test for `..` (empty refs) rejection asserting `RangeErrorCode.MISSING_REFS` in `router/tests/unit/cli/options/local-review-options.test.ts`
- [ ] T020 [P] [US2] Add test for `...` (empty refs) rejection asserting `RangeErrorCode.MISSING_REFS` in `router/tests/unit/cli/options/local-review-options.test.ts`
- [ ] T021 [P] [US2] Add test for `..` (whitespace-only refs) rejection asserting `RangeErrorCode.EMPTY_BASE_REF` in `router/tests/unit/cli/options/local-review-options.test.ts`
- [ ] T022 [P] [US2] Add test for `main...nonexistent-branch` returning `ValidationErrorCode.INVALID_GIT_REF` (distinct from malformed range errors) in `router/tests/unit/cli/options/local-review-options.test.ts`
- [ ] T023 [P] [US2] Add test asserting malformed ranges fail BEFORE git calls (no git process spawned) in `router/tests/unit/cli/options/local-review-options.test.ts`

### Implementation for User Story 2

- [ ] T024 [US2] Implement `parseRangeString()` function with explicit operator scan (`...` first, then `..`) in `router/src/cli/options/local-review-options.ts`
- [ ] T025 [US2] Update `resolveDiffRange()` to use new `parseRangeString()` and return `RangeParseResult` in `router/src/cli/options/local-review-options.ts`
- [ ] T026 [US2] Update `parseLocalReviewOptions()` to use new range parsing and return validation errors in `router/src/cli/options/local-review-options.ts`
- [ ] T027 [US2] Add git ref validation in `router/src/cli/commands/local-review.ts` that returns `ValidationErrorCode.INVALID_GIT_REF` (distinct from malformed range errors)

**Checkpoint**: User Story 2 complete - all malformed ranges rejected with clear errors before git calls

---

## Phase 5: User Story 3 - Clear Understanding of Diff Behavior (Priority: P2)

**Goal**: Document `..` vs `...` range operators in CLI help and README so users understand what changes will be reviewed.

**Independent Test**: Read CLI help and README to verify explanation of both operators and default behavior.

### Tests for User Story 3

- [ ] T028 [P] [US3] Add test asserting `--range` option help text contains operator explanation in `router/tests/unit/cli/commands/local-review.test.ts`
- [ ] T029 [P] [US3] Add test asserting default operator is `...` when `--range main` provided (no explicit operator) in `router/tests/unit/cli/options/local-review-options.test.ts`

### Implementation for User Story 3

- [ ] T030 [US3] Update `--range` option description in `router/src/main.ts` to include operator explanation (per research.md CLI Help Text Addition)
- [ ] T031 [US3] Add "Range Operators" section to `docs/local-review.md` explaining `..` vs `...` behavior
- [ ] T032 [US3] Update README.md with range operator documentation (link to docs/local-review.md or inline)

**Checkpoint**: User Story 3 complete - range operator behavior is clearly documented

---

## Phase 6: User Story 4 - Reliable Test Suite Execution (Priority: P2)

**Goal**: Centralized `makeTempRepo()` helper guarantees cleanup even when tests fail; comprehensive config error path coverage.

**Independent Test**: Run test suite multiple times and confirm no leftover temp files.

### Tests for User Story 4

- [ ] T033 [P] [US4] Add test for ENOENT (missing config file) asserting `ConfigErrorCode.FILE_NOT_FOUND` in `router/tests/unit/config.test.ts`
- [ ] T034 [P] [US4] Add test for deletion race condition (file exists then deleted before read) asserting `ConfigErrorCode.FILE_NOT_FOUND` in `router/tests/unit/config.test.ts`
- [ ] T035 [P] [US4] Add test for EACCES (permission denied, skip on Windows) asserting `ConfigErrorCode.FILE_UNREADABLE` in `router/tests/unit/config.test.ts`
- [ ] T036 [P] [US4] Add test for malformed YAML parsing error asserting `ConfigErrorCode.YAML_PARSE_ERROR` in `router/tests/unit/config.test.ts`
- [ ] T037 [P] [US4] Add test for schema validation failure asserting `ConfigErrorCode.INVALID_SCHEMA` with field-level errors in `router/tests/unit/config.test.ts`
- [ ] T038 [P] [US4] Add "intentional failure" test that throws mid-test and confirms cleanup still runs in `router/tests/unit/helpers/temp-repo.test.ts`
- [ ] T039 [P] [US4] Add test asserting temp root directory is empty at end of test file in `router/tests/unit/helpers/temp-repo.test.ts`

### Implementation for User Story 4

- [ ] T040 [US4] Audit all test files for manual temp dir patterns: `grep -r "mkdtempSync\|mkdtemp" router/tests/`
- [ ] T041 [P] [US4] Migrate temp dir usage in `router/tests/unit/cli/commands/local-review.test.ts` to use `makeTempRepo()`
- [ ] T042 [P] [US4] Migrate temp dir usage in `router/tests/unit/local-diff.test.ts` to use `makeTempRepo()` (if applicable per T040 audit)
- [ ] T043 [P] [US4] Migrate temp dir usage in `router/tests/unit/config.test.ts` to use `makeTempRepo()` (if applicable per T040 audit)
- [ ] T044 [US4] Ensure `loadConfigFromPath()` returns distinct error codes for each error type in `router/src/config.ts`

**Checkpoint**: User Story 4 complete - test cleanup is reliable and config errors have full coverage

---

## Phase 7: User Story 5 - Defensive Runtime Protection (Priority: P3)

**Goal**: Enforce diff-mode invariant so undefined rangeSpec throws programmer error instead of undefined behavior.

**Independent Test**: Call `getLocalDiff()` with invalid options object and verify exact invariant error message.

### Tests for User Story 5

- [ ] T045 [P] [US5] Add test calling `getLocalDiff()` with empty options object (no stagedOnly, uncommitted, or baseRef) asserting invariant violation error in `router/tests/unit/local-diff.test.ts`
- [ ] T046 [P] [US5] Add test asserting invariant error message contains "INVARIANT VIOLATION" and context in `router/tests/unit/local-diff.test.ts`
- [ ] T047 [P] [US5] Add deterministic detached HEAD test: create repo, checkout detached commit, run range mode with `--range HEAD~1`, assert success in `router/tests/unit/local-diff.test.ts`

### Implementation for User Story 5

- [ ] T048 [US5] Add `computeResolvedDiffMode()` helper function in `router/src/diff.ts`
- [ ] T049 [US5] Add invariant check at start of `getLocalDiff()` using `assertDiffModeResolved()` in `router/src/diff.ts`
- [ ] T050 [US5] Update `LocalDiffOptions` interface to include optional `resolvedMode` field in `router/src/diff.ts`

**Checkpoint**: User Story 5 complete - undefined diff ranges throw programmer error

---

## Phase 8: User Story 6 - Clean Internal API Surface (Priority: P3)

**Goal**: Remove `resolveBaseRef` from public exports since it has no external consumers.

**Independent Test**: Import from `router/src/cli/options/index.ts` and verify `resolveBaseRef` is not exported.

### Tests for User Story 6

- [ ] T051 [P] [US6] Add test asserting `resolveBaseRef` is NOT in module exports of `router/src/cli/options/index.ts` in `router/tests/unit/cli/options/exports.test.ts`
- [ ] T052 [P] [US6] Add test searching internal code for `resolveBaseRef` usage (should find none except the definition) in `router/tests/unit/cli/options/exports.test.ts`

### Implementation for User Story 6

- [ ] T053 [US6] Remove `resolveBaseRef` from exports in `router/src/cli/options/index.ts`
- [ ] T054 [US6] Keep `resolveBaseRef` as private (unexported) function in `router/src/cli/options/local-review-options.ts`

**Checkpoint**: User Story 6 complete - API surface is clean

---

## Phase 9: Integration & Polish

**Purpose**: End-to-end validation and cross-cutting improvements

### Integration Test Matrix (per TR-009, TR-010)

- [ ] T055 [P] Add integration test for `ai-review local .` (success path, exit code 0) in `router/tests/integration/local-review-cli.test.ts`
- [ ] T056 [P] Add integration test for `ai-review local-review .` (success path, exit code 0) in `router/tests/integration/local-review-cli.test.ts`
- [ ] T057 [P] Add integration test for `ai-review local --range main...HEAD` (exit code 0) in `router/tests/integration/local-review-cli.test.ts`
- [ ] T058 [P] Add integration test for `ai-review local --range main..HEAD` (exit code 0) in `router/tests/integration/local-review-cli.test.ts`
- [ ] T059 [P] Add integration tests for 5 malformed ranges in `router/tests/integration/local-review-cli.test.ts`:
  - `a..b..c` → exit code 2 (`ExitCode.INVALID_ARGS`), error contains `RangeErrorCode.MULTIPLE_OPERATORS`
  - `main..feature..extra` → exit code 2 (`ExitCode.INVALID_ARGS`), error contains `RangeErrorCode.MULTIPLE_OPERATORS`
  - `..` → exit code 2 (`ExitCode.INVALID_ARGS`), error contains `RangeErrorCode.MISSING_REFS`
  - `...` → exit code 2 (`ExitCode.INVALID_ARGS`), error contains `RangeErrorCode.MISSING_REFS`
  - `..` → exit code 2 (`ExitCode.INVALID_ARGS`), error contains `RangeErrorCode.EMPTY_BASE_REF`

### Final Validation

- [ ] T060 Run full test suite and verify all tests pass: `pnpm --filter @odd-ai-reviewers/router test`
- [ ] T061 Run typecheck: `pnpm --filter @odd-ai-reviewers/router typecheck`
- [ ] T062 Run lint with zero warnings: `pnpm --filter @odd-ai-reviewers/router lint`
- [ ] T063 Verify no circular dependencies: `pnpm --filter @odd-ai-reviewers/router depcruise`
- [ ] T064 Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-8)**: All depend on Foundational phase completion
  - US1 and US2 are both P1 priority and can proceed in parallel
  - US3 and US4 are both P2 priority and can proceed in parallel after US1/US2
  - US5 and US6 are both P3 priority and can proceed in parallel after US3/US4
- **Integration & Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

| Story                  | Priority | Depends On                | Can Parallel With |
| ---------------------- | -------- | ------------------------- | ----------------- |
| US1 (CLI Alias)        | P1       | Foundational              | US2               |
| US2 (Range Parsing)    | P1       | Foundational              | US1               |
| US3 (Documentation)    | P2       | US1, US2                  | US4               |
| US4 (Test Reliability) | P2       | Foundational (T002)       | US3               |
| US5 (Diff Invariant)   | P3       | Foundational (T009, T011) | US6               |
| US6 (API Cleanup)      | P3       | Foundational              | US5               |

### Within Each User Story

1. Tests written first (verify they fail)
2. Implementation tasks in order
3. Story checkpoint before proceeding

### Parallel Opportunities

- **Foundational**: T005-T010 can all run in parallel (different concerns)
- **US1 Tests**: T012-T014 can all run in parallel
- **US2 Tests**: T017-T023 can all run in parallel
- **US3 Tests**: T028-T029 can run in parallel
- **US4 Tests**: T033-T039 can all run in parallel
- **US4 Migration**: T041-T043 can run in parallel (after T040 audit)
- **US5 Tests**: T045-T047 can all run in parallel
- **US6 Tests**: T051-T052 can run in parallel
- **Integration**: T055-T059 can all run in parallel

---

## Parallel Example: User Story 2

```bash
# Launch all tests for User Story 2 together (T017-T023):
Task: "Add test for a..b..c rejection asserting RangeErrorCode.MULTIPLE_OPERATORS"
Task: "Add test for main..feature..extra rejection asserting RangeErrorCode.MULTIPLE_OPERATORS"
Task: "Add test for .. rejection asserting RangeErrorCode.MISSING_REFS"
Task: "Add test for ... rejection asserting RangeErrorCode.MISSING_REFS"
Task: "Add test for whitespace refs rejection asserting RangeErrorCode.EMPTY_BASE_REF"
Task: "Add test for nonexistent branch asserting ValidationErrorCode.INVALID_GIT_REF"
Task: "Add test asserting malformed ranges fail BEFORE git calls"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T011)
3. Complete Phase 3: User Story 1 (T012-T016)
4. Complete Phase 4: User Story 2 (T017-T027)
5. **STOP and VALIDATE**: Both P1 stories deliver immediate user value
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → `local-review` alias works (MVP!)
3. Add User Story 2 → Malformed ranges rejected with clear errors
4. Add User Story 3 → Documentation complete
5. Add User Story 4 → Test reliability improved
6. Add User Story 5 → Defensive invariants in place
7. Add User Story 6 → API surface clean
8. Integration tests → End-to-end validation

---

## Summary

| Phase                 | Tasks     | Parallelizable |
| --------------------- | --------- | -------------- |
| Phase 1: Setup        | T001-T004 | 0              |
| Phase 2: Foundational | T005-T011 | 6              |
| Phase 3: US1 (P1)     | T012-T016 | 3              |
| Phase 4: US2 (P1)     | T017-T027 | 7              |
| Phase 5: US3 (P2)     | T028-T032 | 2              |
| Phase 6: US4 (P2)     | T033-T044 | 10             |
| Phase 7: US5 (P3)     | T045-T050 | 3              |
| Phase 8: US6 (P3)     | T051-T054 | 2              |
| Phase 9: Integration  | T055-T064 | 5              |
| **Total**             | **64**    | **38**         |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Tests are included per spec Test Requirements (TR-001 through TR-010)
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
