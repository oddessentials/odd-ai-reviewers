# Tasks: PR Blocking Fixes

**Input**: Design documents from `/specs/001-pr-blocking-fixes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included only where explicitly needed (FR-016 requires implementing skipped tests).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this project uses:

- **Router code**: `router/src/`, `router/tests/`
- **Workflows**: `.github/workflows/`
- **Configuration**: `.releaserc.json` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create shared utilities needed by multiple user stories

- [ ] T001 Create `isNodeError` type guard utility in router/src/types/errors.ts for safe error property access

**Note**: This utility is used by US4 (Error Handling) but created in setup to be available for all stories.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No blocking prerequisites for this feature - all user stories are independent bug fixes

**⚠️ CRITICAL**: This phase is empty because:

- Each user story fixes an independent issue
- No shared infrastructure changes are blocking
- The `isNodeError` utility in Phase 1 is the only shared component

**Checkpoint**: Foundation ready - user story implementation can begin immediately after Phase 1

---

## Phase 3: User Story 1 - Release Pipeline Produces Correct Artifacts (Priority: P1) MVP

**Goal**: Fix semantic-release configuration to write CHANGELOG to repository root and detect breaking changes correctly

**Independent Test**: Trigger release workflow dry-run and verify CHANGELOG path and breaking change detection

### Implementation for User Story 1

- [ ] T002 [P] [US1] Update CHANGELOG path from `router/CHANGELOG.md` to `CHANGELOG.md` in .releaserc.json (@semantic-release/changelog section)
- [ ] T003 [P] [US1] Update git assets from `router/CHANGELOG.md` to `CHANGELOG.md` in .releaserc.json (@semantic-release/git section)
- [ ] T004 [P] [US1] Add breaking change rules for `feat` and `fix` types with `"breaking": true` in .releaserc.json (releaseRules section)
- [ ] T005 [US1] Replace `sed 's/^v//'` with shell parameter expansion `${TAG#v}` in .github/workflows/release.yml (verify job, version extraction)
- [ ] T006 [US1] Update CHANGELOG verification path from `router/CHANGELOG.md` to `CHANGELOG.md` in .github/workflows/release.yml (verify job)

**Checkpoint**: Release pipeline correctly writes CHANGELOG to root and detects breaking changes

---

## Phase 4: User Story 2 - Local Review Works on Windows (Priority: P1)

**Goal**: Fix Semgrep encoding crashes on Windows by setting PYTHONUTF8=1

**Independent Test**: Run `ai-review local . --dry-run` on Windows with Semgrep installed - should not crash with cp1252 errors

### Implementation for User Story 2

- [ ] T007 [US2] Add `PYTHONUTF8: '1'` to agent environment in router/src/agents/semgrep.ts (in execFileSync call, env option)
- [ ] T008 [US2] Add code comment explaining PEP 540 UTF-8 mode for Windows compatibility in router/src/agents/semgrep.ts

**Checkpoint**: Semgrep agent runs successfully on Windows without encoding crashes

---

## Phase 5: User Story 3 - Local Review Works with Latest OpenAI Models (Priority: P1)

**Goal**: Add model-aware parameter switching for GPT-5.x vs GPT-4.x models

**Independent Test**: Configure GPT-5 model and run dry-run - should not fail with max_tokens rejection error

### Implementation for User Story 3

- [ ] T009 [US3] Create `isModernOpenAIModel()` helper function in router/src/agents/opencode.ts to detect gpt-5/o1/o3 models
- [ ] T010 [US3] Modify OpenAI API call to use `max_completion_tokens` for modern models and `max_tokens` for legacy models in router/src/agents/opencode.ts (runWithOpenAI function)

**Checkpoint**: OpenCode agent works with both GPT-5.x and GPT-4.x models

---

## Phase 6: User Story 4 - Errors Are Handled Safely (Priority: P2)

**Goal**: Harden error handling with proper type guards before accessing error properties

**Independent Test**: Run local review with simulated error conditions - should not crash with undefined property access

### Implementation for User Story 4

- [ ] T011 [US4] Apply `isNodeError` type guard in router/src/cli/dependencies/checker.ts (checkDependency function catch block)
- [ ] T012 [US4] Apply `isNodeError` type guard in router/src/config.ts (loadConfigFromPath function catch block)
- [ ] T013 [US4] Add error wrapping for non-Error throws in router/src/cli/commands/local-review.ts (loadConfigWithFallback function)

**Checkpoint**: All catch blocks safely access error properties with type validation

---

## Phase 7: User Story 5 - CI/CD Has Minimal Supply Chain Risk (Priority: P2)

**Goal**: Replace unpinned third-party action with official GitHub action

**Independent Test**: Audit .github/workflows/badge-update.yml - should only use official GitHub actions or SHA-pinned third-party actions

### Implementation for User Story 5

- [ ] T014 [US5] Replace `exuanbo/actions-deploy-gist@v1` with `actions/github-script@v7` for test badge update in .github/workflows/badge-update.yml
- [ ] T015 [US5] Replace `exuanbo/actions-deploy-gist@v1` with `actions/github-script@v7` for coverage badge update in .github/workflows/badge-update.yml
- [ ] T016 [US5] Add inline Octokit script to update Gist via REST API in .github/workflows/badge-update.yml

**Checkpoint**: No unpinned third-party actions receive secrets

---

## Phase 8: User Story 6 - No Deprecated or Dead Code in CI (Priority: P2)

**Goal**: Remove deprecated npm-publish.yml workflow

**Independent Test**: Verify .github/workflows/npm-publish.yml does not exist

### Implementation for User Story 6

- [ ] T017 [US6] Delete deprecated workflow file .github/workflows/npm-publish.yml

**Checkpoint**: No deprecated workflow files exist in repository

---

## Phase 9: User Story 7 - Integration Tests Cover Critical Paths (Priority: P3)

**Goal**: Implement skipped integration tests for CLI execution

**Independent Test**: Run test suite and verify no skipped tests on critical paths

### Implementation for User Story 7

- [ ] T018 [US7] Implement skipped test `ai-review local . executes with exit code 0` with --dry-run in router/tests/integration/local-review-cli.test.ts
- [ ] T019 [US7] Implement skipped test `ai-review local-review . executes with exit code 0` with --dry-run in router/tests/integration/local-review-cli.test.ts

**Checkpoint**: All critical path tests are implemented and passing

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T020 Run `pnpm lint --max-warnings 0` to verify all changes pass linting
- [ ] T021 Run `pnpm typecheck` to verify type safety
- [ ] T022 Run `pnpm test` to verify all tests pass including new ones
- [ ] T023 Run release workflow dry-run to verify semantic-release configuration
- [ ] T024 Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - T001 creates shared utility
- **Foundational (Phase 2)**: Empty - no blocking prerequisites
- **User Stories (Phase 3-9)**: All depend only on Phase 1 completion
  - User stories are independent and can proceed in parallel
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent - only touches .releaserc.json and release.yml
- **User Story 2 (P1)**: Independent - only touches semgrep.ts
- **User Story 3 (P1)**: Independent - only touches opencode.ts
- **User Story 4 (P2)**: Depends on T001 (isNodeError utility)
- **User Story 5 (P2)**: Independent - only touches badge-update.yml
- **User Story 6 (P2)**: Independent - just deletes npm-publish.yml
- **User Story 7 (P3)**: Independent - only touches local-review-cli.test.ts

### Within Each User Story

- Tasks within a story should be completed in order (unless marked [P])
- All [P] tasks can run in parallel within their story

### Parallel Opportunities

**Maximum parallelism after Phase 1**:

- T002, T003, T004 (all touch different sections of .releaserc.json - can be combined)
- T007 (semgrep.ts) can run parallel to T009, T010 (opencode.ts)
- T014, T015, T016 (badge-update.yml - sequential, same file)
- T017 (delete) can run parallel to anything
- T018, T019 (same test file - sequential)

---

## Parallel Example: After Phase 1

```bash
# Maximum parallelism - all user stories can start simultaneously:

# Developer A: User Story 1 (Release Pipeline)
T002, T003, T004 → T005, T006

# Developer B: User Story 2 + 3 (Windows + OpenAI)
T007, T008 (parallel with) T009, T010

# Developer C: User Story 4 (Error Handling)
T011, T012, T013 (depends on T001)

# Developer D: User Stories 5, 6, 7 (CI/CD fixes)
T014, T015, T016 → T017 → T018, T019
```

---

## Implementation Strategy

### MVP First (User Stories 1, 2, 3)

1. Complete Phase 1: Setup (T001)
2. Complete User Story 1: Release Pipeline (T002-T006) - **Critical for release correctness**
3. Complete User Story 2: Windows Semgrep (T007-T008) - **Critical for Windows users**
4. Complete User Story 3: OpenAI Models (T009-T010) - **Critical for GPT-5 users**
5. **STOP and VALIDATE**: Test all three P1 stories
6. These three fixes unblock the most users

### Incremental Delivery

1. T001 → Foundation ready
2. US1 (T002-T006) → Release pipeline fixed
3. US2 (T007-T008) → Windows support fixed
4. US3 (T009-T010) → OpenAI compatibility fixed
5. US4 (T011-T013) → Error handling hardened
6. US5-6 (T014-T017) → CI/CD security improved
7. US7 (T018-T019) → Test coverage complete
8. Polish (T020-T024) → Ready for merge

### Single Developer Sequential Path

T001 → T002 → T003 → T004 → T005 → T006 → T007 → T008 → T009 → T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total tasks: 24
- This is primarily a bug-fix feature with no new entities or complex dependencies
