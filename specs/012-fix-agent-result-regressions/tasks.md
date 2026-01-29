# Tasks: Fix Agent Result Union Regressions

**Input**: Design documents from `/specs/012-fix-agent-result-regressions/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

**Tests**: Tests are REQUIRED for this feature (FR-009, FR-011, SC-005 explicitly require test coverage)

**Organization**: Tasks grouped by user story for independent implementation. US1 and US2 are both P1 priority; US3 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths included in all descriptions

## Path Conventions

- **Source**: `router/src/` (monorepo with router package)
- **Tests**: `router/src/__tests__/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Foundational type changes that all user stories depend on

- [ ] T001 Add `provenance?: 'complete' | 'partial'` field to Finding interface in router/src/agents/types.ts
- [ ] T002 Update FindingSchema Zod schema to include optional provenance field in router/src/agents/types.ts
- [ ] T003 Add `CACHE_SCHEMA_VERSION = 2` constant co-located with AgentResultSchema in router/src/agents/types.ts
- [ ] T004 Export CACHE_SCHEMA_VERSION from router/src/agents/types.ts barrel
- [ ] T004a Add test for provenance field in FindingSchema in router/src/**tests**/agents/types.test.ts (validates 'complete'|'partial' enum)

**Checkpoint**: Type foundation ready - user story implementation can begin

---

## Phase 2: User Story 1 - Partial Findings Preserved (Priority: P1) 🎯 MVP

**Goal**: Failed agents' partialFindings collected separately and rendered in dedicated report section

**Independent Test**: Trigger agent failure with partialFindings, verify they appear in report with `provenance: 'partial'`

### Tests for User Story 1

**Test Organization**: Schema/type validation (provenance enum) in `types.test.ts`; collection/flow tests in `execute.test.ts`.

- [ ] T005 [P] [US1] Add test: partialFindings collected from AgentResultFailure in router/src/**tests**/phases/execute.test.ts
- [ ] T006 [P] [US1] Add test: empty partialFindings array does not add phantom findings in router/src/**tests**/phases/execute.test.ts
- [ ] T007 [P] [US1] Add test: multiple failed agents' partialFindings all collected in router/src/**tests**/phases/execute.test.ts
- [ ] T008 [P] [US1] Add test: dedup within partialFindings using sourceAgent+file+line+ruleId in router/src/**tests**/phases/report.test.ts
- [ ] T009 [P] [US1] Add test: no cross-collection deduplication (FR-011) in router/src/**tests**/phases/report.test.ts
- [ ] T010 [P] [US1] Add test: gating uses completeFindings only in router/src/**tests**/phases/report.test.ts

### Implementation for User Story 1

- [ ] T011 [US1] Change ExecuteResult interface from `allFindings` to `completeFindings` + `partialFindings` in router/src/phases/execute.ts
- [ ] T012 [US1] Update executeAllPasses to collect partialFindings from AgentResultFailure into separate array in router/src/phases/execute.ts
- [ ] T013 [US1] Set `provenance: 'complete'` on findings from successful agents in router/src/phases/execute.ts
- [ ] T013a [US1] Add assertion `finding.provenance === 'complete'` in existing success result tests (no new test suite)
- [ ] T014 [US1] Set `provenance: 'partial'` on partialFindings from failed agents in router/src/phases/execute.ts
- [ ] T015 [US1] Add getPartialDedupeKey function (sourceAgent+file+line+ruleId) in router/src/report/formats.ts
- [ ] T016 [US1] Add deduplicatePartialFindings function using getPartialDedupeKey in router/src/report/formats.ts
- [ ] T017 [US1] Update dispatchReport signature to accept completeFindings + partialFindings in router/src/phases/report.ts
- [ ] T018 [US1] Update checkGating to use completeFindings only (FR-008) in router/src/phases/report.ts
- [ ] T019 [US1] Add renderPartialFindingsSection function in router/src/report/formats.ts
- [ ] T020 [US1] Update generateFullSummaryMarkdown to include partial findings section in router/src/report/formats.ts
- [ ] T021 [US1] Update router/src/index.ts to pass both finding collections to reporting

**Checkpoint**: User Story 1 complete - partial findings visible in reports

---

## Phase 3: User Story 2 - Legacy Cache Handled Gracefully (Priority: P1)

**Goal**: Legacy cache entries (success: boolean format) treated as cache miss, not crash

**Independent Test**: Create legacy cache entry, trigger cache hit, verify agent re-runs without crash

### Tests for User Story 2

- [ ] T022 [P] [US2] Add test: legacy cache entry (no status field) returns null (cache miss) in router/src/**tests**/cache/store.test.ts
- [ ] T023 [P] [US2] Add test: new-format cache entry passes validation and returns result in router/src/**tests**/cache/store.test.ts
- [ ] T024 [P] [US2] Add test: malformed/corrupted entry returns null in router/src/**tests**/cache/store.test.ts
- [ ] T025 [P] [US2] Add test: cache key includes version prefix in router/src/**tests**/cache/key.test.ts

### Implementation for User Story 2

- [ ] T026 [US2] Import CACHE_SCHEMA_VERSION in router/src/cache/key.ts
- [ ] T027 [US2] Update generateCacheKey to include version: `ai-review-v${CACHE_SCHEMA_VERSION}-${prNumber}-${hash}` in router/src/cache/key.ts
- [ ] T028 [US2] Import AgentResultSchema in router/src/cache/store.ts
- [ ] T029 [US2] Update getCached to validate with AgentResultSchema.safeParse() before returning in router/src/cache/store.ts
- [ ] T030 [US2] Return null on schema validation failure (cache miss) in router/src/cache/store.ts

**Checkpoint**: User Story 2 complete - legacy caches handled gracefully

---

## Phase 4: User Story 3 - BrandHelpers.is Validates Fully (Priority: P2)

**Goal**: BrandHelpers.is() uses parse() internally, ensuring `.is(x) === isOk(parse(x))`

**Note**: US3 (BrandHelpers.is) is independent; does not require Phase 1 types/provenance changes.

**Independent Test**: Call SafeGitRefHelpers.is('refs/../main'), verify it returns false (same as parse)

### Tests for User Story 3

- [ ] T031 [P] [US3] Add test: is() returns false for forbidden patterns in router/src/**tests**/types/branded.test.ts
- [ ] T032 [P] [US3] Add test: is() returns true for valid inputs in router/src/**tests**/types/branded.test.ts
- [ ] T033 [P] [US3] Add test: fixed wide corpus - is() agrees with parse() for all entries (FR-009) in router/src/**tests**/types/branded.test.ts
- [ ] T034 [P] [US3] Add test: fuzz loop with crypto.randomBytes - is() agrees with parse() (FR-009) in router/src/**tests**/types/branded.test.ts

### Implementation for User Story 3

- [ ] T035 [US3] Import isOk from result module in router/src/types/branded.ts
- [ ] T036 [US3] Change is() implementation from `schema.safeParse(value).success` to `isOk(this.parse(value))` in router/src/types/branded.ts

**Checkpoint**: User Story 3 complete - BrandHelpers.is validates fully

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, existing test updates, documentation

- [ ] T037 Update existing tests that use ExecuteResult.allFindings to use completeFindings in router/src/**tests**/
- [ ] T038 Run full test suite and fix any regressions (pnpm test)
- [ ] T039 Run lint check (pnpm lint --max-warnings 0)
- [ ] T040 Run typecheck (pnpm typecheck)
- [ ] T041 Run depcruise circular dependency check (pnpm depcruise)
- [ ] T042 Validate quickstart.md examples work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **US1 (Phase 2)**: Depends on Phase 1 (needs provenance field, CACHE_SCHEMA_VERSION)
- **US2 (Phase 3)**: Depends on Phase 1 (needs CACHE_SCHEMA_VERSION)
- **US3 (Phase 4)**: No dependencies on Phase 1 (self-contained in branded.ts; independent of provenance field)
- **Polish (Phase 5)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: Can start after Phase 1 - No dependencies on other stories
- **US2 (P1)**: Can start after Phase 1 - No dependencies on other stories
- **US3 (P2)**: Can start immediately (independent of Phase 1) - No dependencies on other stories

### Within Each User Story

- Tests FIRST (T005-T010, T022-T025, T031-T034) - ensure they FAIL
- Implementation SECOND
- Verify tests PASS after implementation

### Parallel Opportunities

**Phase 1 (Sequential)**: T001 → T002 → T003 → T004 (same file, ordered)

**Phase 2 Tests (Parallel)**:

```
T005, T006, T007  # execute.test.ts (same file but independent test cases)
T008, T009, T010  # report.test.ts (same file but independent test cases)
```

**Phase 2 Implementation**: T011 → T012-T014 → T015-T016 → T017-T018 → T019-T020 → T021

**Phase 3 Tests (Parallel)**:

```
T022, T023, T024  # store.test.ts
T025              # key.test.ts (different file)
```

**Phase 3 Implementation**: T026 → T027, then T028 → T029 → T030

**Phase 4 Tests (Parallel)**: T031, T032, T033, T034 (same file but independent)

**Phase 4 Implementation**: T035 → T036

**Cross-Story Parallelism**: US2 and US3 can run in parallel after Phase 1 completes

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 tests together (all should FAIL before implementation):
router/src/__tests__/phases/execute.test.ts  # T005, T006, T007
router/src/__tests__/phases/report.test.ts   # T008, T009, T010
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: User Story 1 (T005-T021)
3. **STOP and VALIDATE**: Test partial findings appear in report
4. Deploy if ready - partial findings now visible

### Incremental Delivery

1. Phase 1 → Setup complete
2. US1 → Test partial findings → **MVP delivered**
3. US2 → Test legacy cache → Legacy cache crash fixed
4. US3 → Test BrandHelpers → Security regression fixed
5. Phase 5 → Polish → Feature complete

### Parallel Team Strategy

With 2 developers after Phase 1:

- Developer A: User Story 1 (biggest change)
- Developer B: User Story 2 + User Story 3 (smaller, independent)

---

## Notes

- [P] tasks = different files or independent test cases
- [Story] label maps task to specific user story (US1, US2, US3)
- Each user story independently testable per spec
- Tests must FAIL before implementation, PASS after
- Commit after each task or logical group
- US1 is recommended MVP - most user impact
- US2 and US3 can be done in any order after Phase 1
