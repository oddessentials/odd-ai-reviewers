# Tasks: PR Blocking Fixes

**Input**: Design documents from `/specs/001-pr-blocking-fixes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included only where explicitly needed (FR-016 requires implementing skipped tests).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Last Updated**: 2026-02-03

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

- [x] T001 Create `isNodeError` type guard utility in router/src/types/errors.ts for safe error property access
  - **Status**: ✅ COMPLETE
  - **Commit**: `30de03e feat(types): add isNodeError type guard for safe error property access`

**Note**: This utility is used by US4 (Error Handling) but created in setup to be available for all stories.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No blocking prerequisites for this feature - all user stories are independent bug fixes

**⚠️ CRITICAL**: This phase is empty because:

- Each user story fixes an independent issue
- No shared infrastructure changes are blocking
- The `isNodeError` utility in Phase 1 is the only shared component

**Checkpoint**: ✅ Foundation ready - user story implementation can begin immediately after Phase 1

---

## Phase 3: User Story 1 - Release Pipeline Produces Correct Artifacts (Priority: P1) MVP

**Goal**: Fix semantic-release configuration to write CHANGELOG to repository root and detect breaking changes correctly

**Independent Test**: Trigger release workflow dry-run and verify CHANGELOG path and breaking change detection

**Status**: ✅ COMPLETE

### Implementation for User Story 1

- [x] T002 [P] [US1] Update CHANGELOG path from `router/CHANGELOG.md` to `CHANGELOG.md` in .releaserc.json (@semantic-release/changelog section)
  - **Status**: ✅ COMPLETE - `.releaserc.json:45` has `"changelogFile": "CHANGELOG.md"`
- [x] T003 [P] [US1] Update git assets from `router/CHANGELOG.md` to `CHANGELOG.md` in .releaserc.json (@semantic-release/git section)
  - **Status**: ✅ COMPLETE - `.releaserc.json:59` has `"assets": ["router/package.json", "CHANGELOG.md"]`
- [x] T004 [P] [US1] Add breaking change rules for `feat` and `fix` types with `"breaking": true` in .releaserc.json (releaseRules section)
  - **Status**: ✅ COMPLETE - `.releaserc.json:11-17` has breaking change rules
- [x] T005 [US1] Replace `sed 's/^v//'` with shell parameter expansion `${TAG#v}` in .github/workflows/release.yml (verify job, version extraction)
  - **Status**: ✅ COMPLETE - `release.yml:116` uses `TAG_VERSION=${TAG#v}`
- [x] T006 [US1] Update CHANGELOG verification path from `router/CHANGELOG.md` to `CHANGELOG.md` in .github/workflows/release.yml (verify job)
  - **Status**: ✅ COMPLETE - `release.yml:134` uses `CHANGELOG.md`

**Checkpoint**: ✅ Release pipeline correctly writes CHANGELOG to root and detects breaking changes

---

## Phase 4: User Story 2 - Local Review Works on Windows (Priority: P1)

**Goal**: Fix Semgrep encoding crashes on Windows by setting PYTHONUTF8=1

**Independent Test**: Run `ai-review local . --dry-run` on Windows with Semgrep installed - should not crash with cp1252 errors

**Status**: ✅ COMPLETE

### Implementation for User Story 2

- [x] T007 [US2] Add `PYTHONUTF8: '1'` to agent environment in router/src/agents/security.ts (centralized in createSafeAgentEnv)
  - **Status**: ✅ COMPLETE - `security.ts:337-342` sets PYTHONUTF8=1 for all agents
  - **Note**: Centralized in `createSafeAgentEnv` instead of individual agents (better than original plan)
- [x] T008 [US2] Add code comment explaining PEP 540 UTF-8 mode for Windows compatibility in router/src/agents/security.ts
  - **Status**: ✅ COMPLETE - `security.ts:337-341` has comprehensive PEP 540 comment
  - **Commits**:
    - `4cb9d49 fix(agents): add PYTHONUTF8=1 for Windows Semgrep compatibility`
    - `a0f70fb refactor(agents): centralize PYTHONUTF8 in createSafeAgentEnv`

**Checkpoint**: ✅ Semgrep agent runs successfully on Windows without encoding crashes

---

## Phase 5: User Story 3 - Local Review Works with Latest OpenAI Models (Priority: P1)

**Goal**: Add model-aware parameter switching for GPT-5.x vs GPT-4.x models

**Independent Test**: Configure GPT-5 model and run dry-run - should not fail with max_tokens rejection error

**Status**: ⏳ NOT STARTED

### Implementation for User Story 3

- [ ] T009 [US3] Create `isModernOpenAIModel()` helper function in router/src/agents/opencode.ts to detect gpt-5/o1/o3 models
- [ ] T010 [US3] Modify OpenAI API call to use `max_completion_tokens` for modern models and `max_tokens` for legacy models in router/src/agents/opencode.ts (runWithOpenAI function)

**Checkpoint**: OpenCode agent works with both GPT-5.x and GPT-4.x models

---

## Phase 6: User Story 4 - Errors Are Handled Safely (Priority: P2)

**Goal**: Harden error handling with proper type guards before accessing error properties

**Independent Test**: Run local review with simulated error conditions - should not crash with undefined property access

**Status**: ⏳ NOT STARTED

### Implementation for User Story 4

- [ ] T011 [US4] Apply `isNodeError` type guard in router/src/cli/dependencies/checker.ts (checkDependency function catch block)
- [ ] T012 [US4] Apply `isNodeError` type guard in router/src/config.ts (loadConfigFromPath function catch block)
- [ ] T013 [US4] Add error wrapping for non-Error throws in router/src/cli/commands/local-review.ts (loadConfigWithFallback function)

**Checkpoint**: All catch blocks safely access error properties with type validation

---

## Phase 7: User Story 5 - CI/CD Has Minimal Supply Chain Risk (Priority: P2)

**Goal**: Replace unpinned third-party action with official GitHub action

**Independent Test**: Audit .github/workflows/badge-update.yml - should only use official GitHub actions or SHA-pinned third-party actions

**Status**: ⏳ NOT STARTED

### Implementation for User Story 5

- [ ] T014 [US5] Replace `exuanbo/actions-deploy-gist@v1` with `actions/github-script@v7` for test badge update in .github/workflows/badge-update.yml
- [ ] T015 [US5] Replace `exuanbo/actions-deploy-gist@v1` with `actions/github-script@v7` for coverage badge update in .github/workflows/badge-update.yml
- [ ] T016 [US5] Add inline Octokit script to update Gist via REST API in .github/workflows/badge-update.yml

**Checkpoint**: No unpinned third-party actions receive secrets

---

## Phase 8: User Story 6 - No Deprecated or Dead Code in CI (Priority: P2)

**Goal**: Remove deprecated npm-publish.yml workflow

**Independent Test**: Verify .github/workflows/npm-publish.yml does not exist

**Status**: ⏳ NOT STARTED

### Implementation for User Story 6

- [ ] T017 [US6] Delete deprecated workflow file .github/workflows/npm-publish.yml

**Checkpoint**: No deprecated workflow files exist in repository

---

## Phase 9: User Story 7 - Integration Tests Cover Critical Paths (Priority: P3)

**Goal**: Implement skipped integration tests for CLI execution

**Independent Test**: Run test suite and verify no skipped tests on critical paths

**Status**: ⏳ NOT STARTED

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

## Summary

| User Story              | Status         | Tasks Complete |
| ----------------------- | -------------- | -------------- |
| Phase 1 - Setup         | ✅ COMPLETE    | 1/1            |
| US1 - Release Pipeline  | ✅ COMPLETE    | 5/5            |
| US2 - Windows Semgrep   | ✅ COMPLETE    | 2/2            |
| US3 - OpenAI Models     | ⏳ NOT STARTED | 0/2            |
| US4 - Error Handling    | ⏳ NOT STARTED | 0/3            |
| US5 - Supply Chain      | ⏳ NOT STARTED | 0/3            |
| US6 - Dead Code         | ⏳ NOT STARTED | 0/1            |
| US7 - Integration Tests | ⏳ NOT STARTED | 0/2            |
| Phase 10 - Polish       | ⏳ NOT STARTED | 0/5            |

**P1 User Stories**: 2/3 complete (US3 remaining)
**P2 User Stories**: 0/3 complete (US4, US5, US6 remaining)
**P3 User Stories**: 0/1 complete (US7 remaining)

---

## Dependencies & Execution Order

### Remaining Work

The following user stories are NOT YET COMPLETE:

1. **US3 (P1)**: OpenAI model parameter switching - T009, T010
2. **US4 (P2)**: Error handling type guards - T011, T012, T013
3. **US5 (P2)**: Badge action pinning - T014, T015, T016
4. **US6 (P2)**: Delete deprecated workflow - T017
5. **US7 (P3)**: Integration test implementation - T018, T019

### Recommended Next Steps

1. Complete US3 (P1) - Critical for GPT-5 users
2. Complete US4 (P2) - Error handling safety
3. Complete US5 (P2) - Security improvement
4. Complete US6 (P2) - Remove dead code
5. Complete US7 (P3) - Test coverage
6. Run Phase 10 for final validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Total tasks: 24
- Completed tasks: 8 (Phase 1 + US1 + US2)
- Remaining tasks: 16
