# Tasks: Fix Grouped Comment Resolution Bug

**Input**: Design documents from `/specs/405-fix-grouped-comment-resolution/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests ARE required per spec (SC-004, SC-007, SC-008). Tests MUST be table-driven with pure data fixtures; platform API calls MUST be mocked.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Per plan.md, this is a single project with paths:

- Source: `router/src/report/`
- Tests: `router/src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new module and test file structure

- [ ] T001 Create resolution.ts module skeleton in router/src/report/resolution.ts with JSDoc header and exports
- [ ] T002 [P] Create comment-resolution.test.ts test file skeleton in router/src/**tests**/comment-resolution.test.ts with describe blocks

---

## Phase 2: Foundational (Core Resolution Logic)

**Purpose**: Implement shared resolution helpers that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T003 Implement `buildCommentToMarkersMap()` function in router/src/report/resolution.ts - reverses dedupeKeyToCommentId to Map<commentId, markers[]>
- [ ] T004 Implement `shouldResolveComment()` function in router/src/report/resolution.ts - returns true IFF all unique markers are stale and none malformed
- [ ] T005 Implement `getPartiallyResolvedMarkers()` function in router/src/report/resolution.ts - returns stale markers when comment not fully resolved
- [ ] T006 Implement `applyPartialResolutionVisual()` function in router/src/report/resolution.ts - applies strikethrough to resolved findings while preserving fingerprint markers
- [ ] T007 Implement `emitResolutionLog()` function in router/src/report/resolution.ts - structured log with event='comment_resolution', platform, commentId, fingerprintCount, staleCount, resolved
- [ ] T008 Export all functions from router/src/report/resolution.ts and add to module index if applicable

**Checkpoint**: Foundation ready - resolution helpers can now be used by platform integrations

---

## Phase 3: User Story 1 - Grouped Comment Resolution (Priority: P1) 🎯 MVP

**Goal**: Fix core bug: grouped comments remain active when ANY finding still exists

**Independent Test**: Create grouped comment with two findings, fix one, verify comment NOT resolved

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Add table-driven test case "all markers stale → comment resolved" in router/src/**tests**/comment-resolution.test.ts
- [ ] T010 [P] [US1] Add table-driven test case "some markers stale → comment NOT resolved" in router/src/**tests**/comment-resolution.test.ts
- [ ] T011 [P] [US1] Add table-driven test case "no markers stale → comment NOT resolved" in router/src/**tests**/comment-resolution.test.ts
- [ ] T012 [P] [US1] Add table-driven test case "malformed marker → comment NOT resolved, warning logged" in router/src/**tests**/comment-resolution.test.ts
- [ ] T013 [P] [US1] Add table-driven test case "duplicate markers → deduplicated before evaluation" in router/src/**tests**/comment-resolution.test.ts
- [ ] T014 [P] [US1] Add table-driven test case "zero valid markers → comment NOT resolved" in router/src/**tests**/comment-resolution.test.ts

### Implementation for User Story 1

- [ ] T015 [US1] Update GitHub resolution loop in router/src/report/github.ts to use buildCommentToMarkersMap() instead of per-marker iteration
- [ ] T016 [US1] Update GitHub resolution loop to call shouldResolveComment() before marking any comment as resolved
- [ ] T017 [US1] Add structured resolution log emission in router/src/report/github.ts using emitResolutionLog() with event='comment_resolution'
- [ ] T018 [US1] Verify all existing deduplication tests still pass (no regression) by running pnpm test router/src/**tests**/deduplication.test.ts

**Checkpoint**: GitHub grouped comment resolution works correctly; tests pass

---

## Phase 4: User Story 2 - Single Finding Regression Prevention (Priority: P1)

**Goal**: Ensure single-finding comments continue resolving correctly (no regression)

**Independent Test**: Create single-finding comment, fix the finding, verify comment IS resolved

### Tests for User Story 2

- [ ] T019 [P] [US2] Add table-driven test case "single marker stale → comment resolved" in router/src/**tests**/comment-resolution.test.ts
- [ ] T020 [P] [US2] Add table-driven test case "single marker active (within proximity) → comment NOT resolved" in router/src/**tests**/comment-resolution.test.ts

### Implementation for User Story 2

- [ ] T021 [US2] Verify single-comment resolution path in router/src/report/github.ts works with new shouldResolveComment() logic (single marker = trivial case)
- [ ] T022 [US2] Run existing single-comment resolution tests to confirm no regression

**Checkpoint**: Single-finding and grouped comments both resolve correctly on GitHub

---

## Phase 5: User Story 3 - Azure DevOps Parity (Priority: P1)

**Goal**: Apply identical resolution logic to Azure DevOps threads

**Independent Test**: Create grouped ADO thread with two findings, fix one, verify thread NOT closed

### Tests for User Story 3

- [ ] T023 [P] [US3] Add table-driven test case "ADO: all markers stale → thread closed" in router/src/**tests**/comment-resolution.test.ts
- [ ] T024 [P] [US3] Add table-driven test case "ADO: some markers stale → thread NOT closed" in router/src/**tests**/comment-resolution.test.ts

### Implementation for User Story 3

- [ ] T025 [US3] Update ADO resolution loop in router/src/report/ado.ts to use buildCommentToMarkersMap() instead of per-marker iteration
- [ ] T026 [US3] Update ADO resolution loop to call shouldResolveComment() before closing any thread
- [ ] T027 [US3] Add structured resolution log emission in router/src/report/ado.ts using emitResolutionLog() with event='comment_resolution'
- [ ] T028 [US3] Verify GitHub and ADO use identical resolution semantics (same helper functions from resolution.ts)

**Checkpoint**: GitHub and ADO both resolve grouped comments correctly with parity

---

## Phase 6: User Story 4 - Partial Resolution Visual Indication (Priority: P1)

**Goal**: Visually distinguish resolved findings within unresolved grouped comments

**Independent Test**: Fix one finding in grouped comment, verify strikethrough on resolved finding only

### Tests for User Story 4

- [ ] T029 [P] [US4] Add table-driven test case "partial resolution → stale findings strikethrough, active unmarked" in router/src/**tests**/comment-resolution.test.ts
- [ ] T030 [P] [US4] Add table-driven test case "visual indication preserves fingerprint markers unchanged" in router/src/**tests**/comment-resolution.test.ts
- [ ] T031 [P] [US4] Add table-driven test case "all resolved one-by-one → each strikethrough, then entire comment resolved" in router/src/**tests**/comment-resolution.test.ts

### Implementation for User Story 4

- [ ] T032 [US4] Update GitHub comment update logic in router/src/report/github.ts to call applyPartialResolutionVisual() for grouped comments with partial resolution
- [ ] T033 [US4] Update ADO thread update logic in router/src/report/ado.ts to call applyPartialResolutionVisual() for grouped threads with partial resolution
- [ ] T034 [US4] Verify strikethrough uses Markdown format `~~text~~` and preserves all `<!-- -->` fingerprint markers

**Checkpoint**: All user stories complete - grouped and single comments resolve correctly with visual indication

---

## Phase 7: Edge Cases & Polish

**Purpose**: Handle edge cases and cross-cutting concerns

- [ ] T035 [P] Add table-driven test case "proximity boundary: finding moves 20 lines → still same finding" in router/src/**tests**/comment-resolution.test.ts
- [ ] T036 [P] Add table-driven test case "proximity boundary: finding moves 21 lines → treated as new finding" in router/src/**tests**/comment-resolution.test.ts
- [ ] T037 [P] Add table-driven test case "user content preserved during visual update" in router/src/**tests**/comment-resolution.test.ts (→ FR-019)
- [ ] T038 Verify rate limiting preserved in both router/src/report/github.ts and router/src/report/ado.ts during resolution operations (→ FR-007, FR-018)
- [ ] T039 Run full test suite: pnpm lint && pnpm typecheck && pnpm test
- [ ] T040 Validate against quickstart.md success criteria checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 must complete before US2 (GitHub foundation needed)
  - US3 can start after US1 (uses same resolution.ts helpers)
  - US4 can start after US1 and US3 (needs both platforms)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - GitHub core fix
- **User Story 2 (P1)**: Depends on US1 - regression verification
- **User Story 3 (P1)**: Can start after US1 - ADO parity
- **User Story 4 (P1)**: Depends on US1 and US3 - visual indication for both platforms

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Implementation uses helpers from resolution.ts
- Platform-specific integration in github.ts/ado.ts
- Story complete before moving to next

### Parallel Opportunities

- T001, T002 can run in parallel (different files)
- T009-T014 can all run in parallel (same test file, different cases)
- T019-T020 can run in parallel
- T023-T024 can run in parallel
- T029-T031 can run in parallel
- T035-T037 can run in parallel

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all tests for User Story 1 together:
Task: "Add table-driven test case 'all markers stale → comment resolved' in router/src/__tests__/comment-resolution.test.ts"
Task: "Add table-driven test case 'some markers stale → comment NOT resolved' in router/src/__tests__/comment-resolution.test.ts"
Task: "Add table-driven test case 'no markers stale → comment NOT resolved' in router/src/__tests__/comment-resolution.test.ts"
Task: "Add table-driven test case 'malformed marker → comment NOT resolved' in router/src/__tests__/comment-resolution.test.ts"
Task: "Add table-driven test case 'duplicate markers → deduplicated' in router/src/__tests__/comment-resolution.test.ts"
Task: "Add table-driven test case 'zero valid markers → comment NOT resolved' in router/src/__tests__/comment-resolution.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T008)
3. Complete Phase 3: User Story 1 (T009-T018)
4. **STOP and VALIDATE**: Test GitHub grouped comment resolution independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → GitHub fix complete → Test (MVP!)
3. Add User Story 2 → Regression verified
4. Add User Story 3 → ADO parity complete
5. Add User Story 4 → Visual indication complete
6. Complete Polish → All edge cases handled

### Sequential Strategy (Recommended for Single Developer)

1. Complete Setup + Foundational together
2. Complete US1 → US2 → US3 → US4 in order
3. Complete Polish phase
4. Each story adds value without breaking previous stories

---

## Notes

- [P] tasks = different files or independent test cases
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All resolution logic in resolution.ts - platforms only call helpers
- Log event name MUST be `comment_resolution` across all platforms
