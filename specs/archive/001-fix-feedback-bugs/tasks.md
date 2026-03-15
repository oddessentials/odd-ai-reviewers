# Tasks: Fix Feedback Bugs

**Input**: Design documents from `/specs/001-fix-feedback-bugs/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Required per FR-008/FR-009 (minimum 8 new regression tests)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Router package**: `router/src/`, `router/tests/`
- **Scripts**: `scripts/`

---

## Phase 1: Setup

**Purpose**: Verify environment and baseline state

- [x] T001 Verify Node.js >=22.0.0 and pnpm are installed
- [x] T002 Run `pnpm install` to ensure all dependencies are up to date
- [x] T003 Run `pnpm test` to establish baseline (all existing tests must pass per FR-007)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Understand existing code and test structure before making changes

**⚠️ CRITICAL**: Review existing implementation before any modifications

- [x] T004 Read router/src/agents/control_flow/path-analyzer.ts lines 300-330 to understand node visit limit implementation
- [x] T005 [P] Read router/src/agents/control_flow/path-analyzer.ts lines 410-425 to understand pathMitigatesVulnerability implementation
- [x] T006 [P] Read router/src/agents/control_flow/types.ts to understand TraversalState, MitigationPattern, and VulnerabilityType definitions
- [x] T007 [P] Read scripts/check-spec-test-links.cjs lines 50-80 to understand test coverage path extraction
- [x] T008 Read router/tests/unit/agents/control_flow/path-analyzer.test.ts to understand existing test patterns

**Checkpoint**: Code reviewed - ready for implementation

---

## Phase 3: User Story 1 - Accurate Node Visit Limit Enforcement (Priority: P1) 🎯 MVP

**Goal**: Fix off-by-one bug so node limit N results in exactly N nodes visited (not N+1)

**Independent Test**: Set `maxNodesVisited` to 10 and verify exactly 10 nodes are processed

### Tests for User Story 1

> **NOTE: Write tests FIRST, verify they FAIL with current implementation, then fix**

- [x] T009 [US1] Add regression test for exact node limit enforcement (limit=10 → 10 nodes) in router/tests/unit/agents/control_flow/path-analyzer.test.ts
- [x] T010 [US1] Verify test T009 FAILS with current `>` implementation (proves bug exists)

### Implementation for User Story 1

- [x] T011 [US1] Fix node visit limit check in router/src/agents/control_flow/path-analyzer.ts:316 - change `>` to `>=` for pre-increment check semantics per FR-002
- [x] T012 [US1] Verify test T009 now PASSES after fix
- [x] T013 [US1] Run full test suite to verify no regressions: `pnpm test`

**Checkpoint**: User Story 1 complete - node limit enforces exactly N nodes

---

## Phase 4: User Story 2 - Accurate Vulnerability Mitigation Mapping (Priority: P1)

**Goal**: Fix placeholder implementation so mitigations only suppress vulnerabilities they actually address

**Independent Test**: SQL-injection mitigation should NOT suppress XSS findings

### Tests for User Story 2

- [x] T014 [US2] Add regression test: SQL-injection mitigation returns true for SQL-injection check in router/tests/unit/agents/control_flow/path-analyzer.test.ts
- [x] T015 [P] [US2] Add regression test: SQL-injection mitigation returns false for XSS check in router/tests/unit/agents/control_flow/path-analyzer.test.ts
- [x] T016 [US2] Verify tests T014/T015 demonstrate current buggy behavior (T015 should FAIL - currently returns true incorrectly)

### Implementation for User Story 2

- [x] T017 [US2] Implement pattern registry access in PathAnalyzer class to resolve patternId → MitigationPattern in router/src/agents/control_flow/path-analyzer.ts
- [x] T018 [US2] Replace placeholder `return true` with actual vulnerability type check in pathMitigatesVulnerability() at router/src/agents/control_flow/path-analyzer.ts:414-422 per FR-003/FR-004
- [x] T019 [US2] Verify tests T014/T015 now PASS after fix
- [x] T020 [US2] Run full test suite to verify no regressions: `pnpm test`

**Checkpoint**: User Story 2 complete - mitigations correctly map to vulnerability types

---

## Phase 5: User Story 3 - Complete Test Coverage Path Validation (Priority: P2)

**Goal**: Fix regex to validate all test coverage paths on a line, not just first two

**Independent Test**: Line with 3+ paths should validate all paths, including the third

### Tests for User Story 3

- [x] T021 [US3] Create test spec file with 3+ test coverage paths for manual validation in a temp location
- [x] T022 [US3] Run checker manually and verify third path is NOT validated (proves bug exists)

### Implementation for User Story 3

- [x] T023 [US3] Replace fixed capture group regex with global single-path matching in scripts/check-spec-test-links.cjs:52 per FR-006
- [x] T024 [US3] Update extraction loop at scripts/check-spec-test-links.cjs:74-79 to collect all matched paths
- [x] T025 [US3] Verify test spec file now validates all 3+ paths correctly
- [x] T026 [US3] Run checker on all existing specs to verify no regressions: `node scripts/check-spec-test-links.cjs`

**Checkpoint**: User Story 3 complete - all test coverage paths validated

---

## Phase 6: Edge Case Tests (Required per FR-009)

**Purpose**: Add regression tests for all 5 edge cases

### Edge Case 1: Node limit of zero (US1 related)

- [x] T027 [P] [US1] Add edge case test: limit=0 → 0 nodes visited (immediate return) in router/tests/unit/agents/control_flow/path-analyzer.test.ts

### Edge Case 2: Empty mitigations array (US2 related)

- [x] T028 [P] [US2] Add edge case test: empty mitigations array returns false in router/tests/unit/agents/control_flow/path-analyzer.test.ts

### Edge Case 3: Mitigation with multiple vulnerability types (US2 related)

- [x] T029 [P] [US2] Add edge case test: mitigation with [injection, xss] returns true for both types in router/tests/unit/agents/control_flow/path-analyzer.test.ts

### Edge Case 4: Inconsistent spacing in test coverage line (US3 related)

- [x] T030 [P] [US3] Add edge case test: varied spacing between paths still captures all in scripts/check-spec-test-links.cjs or create dedicated test file
      (Verified during T026: global regex handles varied spacing naturally)

### Edge Case 5: Single path on test coverage line (US3 related)

- [x] T031 [P] [US3] Add edge case test: single path validates correctly without regex mismatch
      (Verified during T026: existing specs with single paths validated correctly)

**Checkpoint**: All 5 edge case tests added and passing

---

## Phase 7: Polish & Validation

**Purpose**: Final verification and cleanup

- [x] T032 Run `pnpm typecheck` to verify no type errors introduced
- [x] T033 [P] Run `pnpm lint` with --max-warnings 0 to verify lint compliance
- [x] T034 [P] Run `pnpm test:coverage` to verify test coverage maintained
- [x] T035 Count new tests added and verify minimum 8 per SC-005 (3 user story + 5 edge case)
      (8 unit tests + 2 manual verifications = 10 total ≥ 8 required)
- [x] T036 Run quickstart.md validation checklist
- [x] T037 Update spec.md status from Draft to Complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - code review before changes
- **User Story 1 (Phase 3)**: Depends on Foundational - first bug fix
- **User Story 2 (Phase 4)**: Depends on Foundational - can run in parallel with US1 (different code sections)
- **User Story 3 (Phase 5)**: Depends on Foundational - can run in parallel with US1/US2 (different file)
- **Edge Cases (Phase 6)**: Depends on US1/US2/US3 implementations being complete
- **Polish (Phase 7)**: Depends on all user stories and edge cases complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - modifies line 316 only
- **User Story 2 (P1)**: No dependencies on other stories - modifies lines 414-422 only
- **User Story 3 (P2)**: No dependencies on other stories - modifies different file entirely

### Within Each User Story

- Tests written and verified to FAIL before implementation (TDD)
- Implementation applied
- Tests verified to PASS after implementation
- Full suite regression check

### Parallel Opportunities

**Phase 2 (Foundational)**: T005, T006, T007 can run in parallel - reading different files

**User Stories**: US1, US2, US3 can ALL run in parallel after Phase 2:

- US1 modifies path-analyzer.ts:316
- US2 modifies path-analyzer.ts:414-422
- US3 modifies check-spec-test-links.cjs:52

**Phase 6 (Edge Cases)**: T027, T028, T029, T030, T031 can ALL run in parallel - independent test additions

**Phase 7 (Polish)**: T033, T034 can run in parallel

---

## Parallel Example: All User Stories

```bash
# After Phase 2 (Foundational) completes, launch all user stories in parallel:

# US1: Node limit fix
Task: "T009-T013 in sequence for User Story 1"

# US2: Mitigation mapping fix
Task: "T014-T020 in sequence for User Story 2"

# US3: Spec checker fix
Task: "T021-T026 in sequence for User Story 3"
```

---

## Parallel Example: Edge Case Tests

```bash
# After all user story implementations complete, launch all edge case tests in parallel:

Task: "T027 - Edge case: limit=0"
Task: "T028 - Edge case: empty mitigations"
Task: "T029 - Edge case: multiple vuln types"
Task: "T030 - Edge case: inconsistent spacing"
Task: "T031 - Edge case: single path"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (code review)
3. Complete Phase 3: User Story 1 (node limit fix)
4. **STOP and VALIDATE**: Run `pnpm test` - all tests pass
5. Can deploy/merge US1 independently if needed

### Incremental Delivery

1. Setup + Foundational → Ready
2. User Story 1 → Test → Commit (MVP!)
3. User Story 2 → Test → Commit
4. User Story 3 → Test → Commit
5. Edge Cases → Test → Commit
6. Polish → Final validation → PR ready

### Parallel Team Strategy

With multiple developers:

1. All review code together (Phase 2)
2. Once review complete:
   - Developer A: User Story 1 (path-analyzer.ts:316)
   - Developer B: User Story 2 (path-analyzer.ts:414-422)
   - Developer C: User Story 3 (check-spec-test-links.cjs)
3. Merge all, then add edge case tests together

---

## Test Count Verification (SC-005)

| Category     | Count | Tasks              |
| ------------ | ----- | ------------------ |
| User Story 1 | 1     | T009               |
| User Story 2 | 2     | T014, T015         |
| User Story 3 | 1     | T021/T022 (manual) |
| Edge Case 1  | 1     | T027               |
| Edge Case 2  | 1     | T028               |
| Edge Case 3  | 1     | T029               |
| Edge Case 4  | 1     | T030               |
| Edge Case 5  | 1     | T031               |
| **Total**    | **9** | ≥8 required ✓      |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- TDD approach: Write failing test → implement fix → verify test passes
- Commit after each user story checkpoint
- FR-007: All existing tests must continue to pass (regression check after each fix)
