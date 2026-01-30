# Tasks: Fix Remaining Deduplication and Path Normalization Bugs

**Input**: Design documents from `/specs/406-fix-remaining-bugs/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: Tests ARE required per spec.md FR-011 (6 user story tests) and FR-012 (5 edge case tests).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `router/src/` (TypeScript source), `router/src/__tests__/` (tests)

---

## Phase 1: Setup

**Purpose**: Create test infrastructure for new regression tests

- [ ] T001 Create test file skeleton for deduplication tests in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T002 [P] Verify existing tests pass before modifications by running `pnpm test`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No blocking prerequisites for bug fixes - all changes are independent modifications to existing files

**⚠️ CRITICAL**: Each user story modifies different code locations and can proceed independently

**Checkpoint**: No foundational tasks required - user story implementation can begin immediately after setup

---

## Phase 3: User Story 1 - Prevent Duplicate Comments Within Same Run (Priority: P1) 🎯 MVP

**Goal**: Update proximityMap after posting comments to prevent duplicates within the same run

**Independent Test**: Post two findings with same fingerprint at lines 10 and 15, verify only one comment posted

### Tests for User Story 1

- [ ] T003 [P] [US1] Write test: proximityMap updated after posting in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T004 [P] [US1] Write test: second finding within threshold skipped in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T005 [P] [US1] Write test: findings outside threshold (50 lines) both posted in `router/src/__tests__/report/deduplication.test.ts`

### Implementation for User Story 1

- [ ] T006 [US1] Add proximityMap update after posting in `router/src/report/github.ts:444-448`
- [ ] T007 [US1] Add proximityMap update after posting in `router/src/report/ado.ts:453-455`
- [ ] T008 [US1] Verify tests pass for US1 by running `pnpm test -- --grep "proximityMap"`

**Checkpoint**: ProximityMap updates working for both GitHub and ADO reporters

---

## Phase 4: User Story 2 - Correctly Filter Findings on Deleted Files (Priority: P1)

**Goal**: Use canonicalFiles instead of diffFiles when building deletedFiles set

**Independent Test**: Delete `./src/file.ts`, create finding for `src/file.ts`, verify filtered

### Tests for User Story 2

- [ ] T009 [P] [US2] Write test: deleted file with `./` prefix filtered correctly in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T010 [P] [US2] Write test: deleted file without `./` prefix filtered correctly in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T011 [P] [US2] Write test: findings on modified files not filtered in `router/src/__tests__/report/deduplication.test.ts`

### Implementation for User Story 2

- [ ] T012 [US2] Change deletedFiles construction to use canonicalFiles in `router/src/report/github.ts:170-172`
- [ ] T013 [US2] Change deletedFiles construction to use canonicalFiles in `router/src/report/ado.ts:173-175`
- [ ] T014 [US2] Verify tests pass for US2 by running `pnpm test -- --grep "deletedFiles"`

**Checkpoint**: Deleted file filtering works with all path format variations

---

## Phase 5: User Story 3 - Simplify Stale Count Calculation (Priority: P1)

**Goal**: Replace confusing staleCount expression with clear ternary

**Independent Test**: Code review confirms logic is immediately understandable

### Tests for User Story 3

- [ ] T015 [P] [US3] Write test: staleCount equals total when fully resolved in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T016 [P] [US3] Write test: staleCount equals partial count when partially resolved in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T017 [P] [US3] Write test: staleCount equals zero when no markers stale in `router/src/__tests__/report/deduplication.test.ts`

### Implementation for User Story 3

- [ ] T018 [US3] Simplify staleCount calculation in `router/src/report/github.ts:497-500`
- [ ] T019 [US3] Simplify staleCount calculation in `router/src/report/ado.ts:503-505`
- [ ] T020 [US3] Verify tests pass for US3 and no regressions by running `pnpm test`

**Checkpoint**: StaleCount calculation is clear and behavior unchanged

---

## Phase 6: User Story 4 - Ensure Immutable Cache Entry Handling (Priority: P1)

**Goal**: Use immutable update pattern when storing validated cache entries

**Independent Test**: Verify original parsed object is not mutated after store

### Tests for User Story 4

- [ ] T021 [P] [US4] Write test: original entry not mutated after memoryCache.set in `router/src/__tests__/cache/store.test.ts`

### Implementation for User Story 4

- [ ] T022 [US4] Change to immutable update with spread operator in `router/src/cache/store.ts:165`
- [ ] T023 [US4] Verify tests pass for US4 by running `pnpm test -- --grep "cache"`

**Checkpoint**: Cache entry updates are immutable

---

## Phase 7: User Story 5 - Guard Against Empty Marker Extraction (Priority: P1)

**Goal**: Reject empty strings during marker extraction

**Independent Test**: Process malformed marker body, verify no empty strings in result

### Tests for User Story 5

- [ ] T024 [P] [US5] Write test: empty capture group not added to markers array in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T025 [P] [US5] Write test: valid markers extracted correctly in `router/src/__tests__/report/deduplication.test.ts`

### Implementation for User Story 5

- [ ] T026 [US5] Add guard before push in marker extraction in `router/src/report/resolution.ts:208`
- [ ] T027 [US5] Verify tests pass for US5 by running `pnpm test -- --grep "marker"`

**Checkpoint**: Marker extraction rejects empty strings at source

---

## Phase 8: User Story 6 - Document ADO Path Handling Intentionality (Priority: P1)

**Goal**: Add documentation comment explaining ADO path format separation

**Independent Test**: Code review confirms documentation is present and clear

### Tests for User Story 6

- [ ] T028 [P] [US6] Write test: ADO thread context uses leading slash format in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T029 [P] [US6] Write test: ADO dedupe key uses normalized format (no leading slash) in `router/src/__tests__/report/deduplication.test.ts`

### Implementation for User Story 6

- [ ] T030 [US6] Add documentation comment for ADO path handling in `router/src/report/ado.ts:582`
- [ ] T031 [US6] Verify tests pass for US6 by running `pnpm test -- --grep "ADO"`

**Checkpoint**: ADO path handling is documented and intentional separation verified

---

## Phase 9: Edge Case Tests (Required per FR-012)

**Purpose**: Regression tests for all 5 specified edge cases

### Edge Case Tests

- [ ] T032 [P] Write edge case test: finding without fingerprint gets one generated in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T033 [P] Write edge case test: findings at exactly LINE_PROXIMITY_THRESHOLD (20) are duplicates in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T034 [P] Write edge case test: deleted file with unicode path filtered in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T035 [P] Write edge case test: first finding populates empty proximityMap in `router/src/__tests__/report/deduplication.test.ts`
- [ ] T036 [P] Write edge case test: grouped comment updates proximityMap for all findings in `router/src/__tests__/report/deduplication.test.ts`

**Checkpoint**: All 5 edge case regression tests passing

---

## Phase 10: Polish & Verification

**Purpose**: Final verification and cleanup

- [ ] T037 Run full test suite to verify no regressions by running `pnpm test`
- [ ] T038 [P] Run linter to verify code style by running `pnpm lint`
- [ ] T039 [P] Run type checker to verify no type errors by running `pnpm typecheck`
- [ ] T040 Verify test counts: minimum 6 user story tests + 5 edge case tests = 11 total new tests
- [ ] T041 Run quickstart.md validation commands

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: N/A for this bug fix feature
- **User Stories (Phase 3-8)**: All can proceed in parallel after setup (different files)
- **Edge Cases (Phase 9)**: Can run in parallel with user stories (same test file, different test cases)
- **Polish (Phase 10)**: Depends on all user stories and edge cases being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - modifies github.ts:444-448, ado.ts:453-455
- **User Story 2 (P1)**: Independent - modifies github.ts:170-172, ado.ts:173-175
- **User Story 3 (P1)**: Independent - modifies github.ts:497-500, ado.ts:503-505
- **User Story 4 (P1)**: Independent - modifies store.ts:165
- **User Story 5 (P1)**: Independent - modifies resolution.ts:208
- **User Story 6 (P1)**: Independent - modifies ado.ts:582

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation follows test
- Verification confirms tests pass

### Parallel Opportunities

**All user stories can run in parallel** since they modify different code locations:

- US1: github.ts (lines 444-448), ado.ts (lines 453-455)
- US2: github.ts (lines 170-172), ado.ts (lines 173-175)
- US3: github.ts (lines 497-500), ado.ts (lines 503-505)
- US4: store.ts (line 165)
- US5: resolution.ts (line 208)
- US6: ado.ts (line 582)

**All edge case tests can run in parallel** (all in deduplication.test.ts)

---

## Parallel Example: All User Stories

```bash
# All user story implementations can launch in parallel since they modify different files/locations:

# Developer A:
Task: "T006 [US1] Add proximityMap update in github.ts:444-448"
Task: "T007 [US1] Add proximityMap update in ado.ts:453-455"

# Developer B:
Task: "T012 [US2] Change deletedFiles in github.ts:170-172"
Task: "T013 [US2] Change deletedFiles in ado.ts:173-175"

# Developer C:
Task: "T018 [US3] Simplify staleCount in github.ts:497-500"
Task: "T019 [US3] Simplify staleCount in ado.ts:503-505"

# Developer D:
Task: "T022 [US4] Immutable update in store.ts:165"

# Developer E:
Task: "T026 [US5] Empty marker guard in resolution.ts:208"

# Developer F:
Task: "T030 [US6] ADO path documentation in ado.ts:582"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 3: User Story 1 (T003-T008)
3. **STOP and VALIDATE**: Test US1 independently
4. This fixes the most impactful bug (duplicate comments)

### Incremental Delivery

1. Complete Setup → Ready
2. Add US1 → Test → ProximityMap fix deployed
3. Add US2 → Test → Deleted file fix deployed
4. Add US3-US6 → Test → All clarity/safety fixes deployed
5. Add Edge Cases → Test → Full regression coverage
6. Polish → Verify → Release

### Parallel Team Strategy

With multiple developers:

1. All complete T001-T002 (Setup) together
2. Once Setup is done, all user stories can proceed in parallel:
   - Dev A: US1 (T003-T008)
   - Dev B: US2 (T009-T014)
   - Dev C: US3 (T015-T020)
   - Dev D: US4 (T021-T023)
   - Dev E: US5 (T024-T027)
   - Dev F: US6 (T028-T031)
3. Edge cases (T032-T036) can be done by any dev
4. All converge for Polish (T037-T041)

---

## Notes

- [P] tasks = different files/locations, no dependencies
- [Story] label maps task to specific user story for traceability
- All 6 user stories are P1 (non-deferrable per spec clarifications)
- Minimum 11 new tests required (6 user story + 5 edge case)
- Tests should fail before implementation, pass after
- Commit after each task or logical group
- Avoid: modifying same line ranges in parallel
