# Tasks: CLI Local Review Dependency Setup

**Input**: Design documents from `/specs/001-local-deps-setup/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Unit tests included per Testing Strategy in plan.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Execution Rules (MANDATORY)

**These rules MUST be followed. Violations require explicit user approval.**

### 1. Sequential Execution

- Execute tasks ONE AT A TIME in strict order (T001 → T002 → T003 → ...)
- NEVER combine multiple tasks into one action
- NEVER skip ahead - if T005 depends on T004, T004 must be complete first
- If a task seems unnecessary, ASK the user before skipping

### 2. Task Tracking (Required)

- Use `TaskUpdate` to mark task `in_progress` BEFORE starting work
- Use `TaskUpdate` to mark task `completed` AFTER finishing work
- Do NOT proceed to the next task until the current one is marked complete
- Check `TaskList` if unsure of current state

### 3. Commit Per Task (Required)

- Create a git commit after EVERY completed task
- Commit message format: `feat(deps): T0XX - [brief task description]`
- Do NOT batch multiple tasks into one commit
- Verify the commit succeeded before marking task complete

### 4. Phase Checkpoints

- STOP at each "**Checkpoint**" marker
- Show the user what was completed in that phase
- Wait for user approval (e.g., "continue") before starting the next phase

### 5. Test Verification

- For test tasks: verify tests are written and FAIL before moving on
- For implementation tasks: verify related tests PASS after completion
- Run `pnpm test <specific-file>` to validate, not the full suite

### Enforcement Summary

```text
For each task T0XX:
  1. TaskUpdate(T0XX, status: in_progress)
  2. Implement the task (ONE task only)
  3. Verify (run tests, check file exists, etc.)
  4. Git commit: "feat(deps): T0XX - [description]"
  5. TaskUpdate(T0XX, status: completed)
  6. Proceed to T0XX+1
```

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `router/src/`, `router/src/__tests__/` per existing structure
- All new files go in `router/src/cli/dependencies/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the dependencies module structure and core types

- [ ] T001 Create directory structure for dependencies module at `router/src/cli/dependencies/`
- [ ] T002 [P] Create TypeScript types and interfaces in `router/src/cli/dependencies/types.ts` per data-model.md (Platform, DependencyStatus, ExternalDependency, DependencyCheckResult, DependencyCheckSummary, PassDependencyInfo)
- [ ] T003 [P] Create Zod schemas for runtime validation in `router/src/cli/dependencies/schemas.ts` (DependencyCheckResultSchema, DependencyCheckSummarySchema)
- [ ] T004 [P] Create test directory structure at `router/src/__tests__/cli/dependencies/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Implement platform detection utility in `router/src/cli/dependencies/platform.ts` - export `detectPlatform()` returning `Platform` type using `os.platform()`
- [ ] T006 [P] Implement version parsing utilities in `router/src/cli/dependencies/version.ts` - export `parseVersion()`, `compareVersions()`, `meetsMinimum()` functions
- [ ] T007 [P] Create centralized dependency catalog in `router/src/cli/dependencies/catalog.ts` - export `DEPENDENCY_CATALOG` constant with semgrep and reviewdog entries, and `AGENT_DEPENDENCIES` mapping per data-model.md
- [ ] T008 Create module barrel export in `router/src/cli/dependencies/index.ts` - re-export all public APIs
- [ ] T009 [P] Write unit tests for platform detection in `router/src/__tests__/cli/dependencies/platform.test.ts`
- [ ] T010 [P] Write unit tests for version parsing in `router/src/__tests__/cli/dependencies/version.test.ts`
- [ ] T011 [P] Write unit tests for catalog structure in `router/src/__tests__/cli/dependencies/catalog.test.ts` - verify all agents have mappings, all catalog entries have required fields

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - First-Time Setup with Missing Dependencies (Priority: P1) 🎯 MVP

**Goal**: Detect missing dependencies when user runs `ai-review local .` and display actionable platform-specific error messages

**Independent Test**: Run `ai-review local .` with semgrep/reviewdog not installed; verify actionable error messages with install instructions appear

### Tests for User Story 1

- [ ] T012 [P] [US1] Write unit tests for single dependency checking in `router/src/__tests__/cli/dependencies/checker.test.ts` - test available, missing, unhealthy, version-mismatch states
- [ ] T013 [P] [US1] Write unit tests for message formatting in `router/src/__tests__/cli/dependencies/messages.test.ts` - test error message includes install instructions, docs link, and "run ai-review check" suggestion

### Implementation for User Story 1

- [ ] T014 [US1] Implement core dependency checker in `router/src/cli/dependencies/checker.ts` - export `checkDependency(name: string)` using `execFileSync` with `shell: false` and 5s timeout, returning `DependencyCheckResult`
- [ ] T015 [US1] Implement `checkAllDependencies(names: string[])` in `router/src/cli/dependencies/checker.ts` - check multiple dependencies, return `DependencyCheckResult[]`
- [ ] T016 [US1] Implement `getDependenciesForPasses(passes: Pass[])` in `router/src/cli/dependencies/checker.ts` - derive required dependencies from configured passes using AGENT_DEPENDENCIES mapping (pass-aware checking)
- [ ] T017 [US1] Implement `checkDependenciesForPasses(passes: Pass[])` in `router/src/cli/dependencies/checker.ts` - return `DependencyCheckSummary` with hasBlockingIssues computed from required passes only
- [ ] T018 [US1] Implement user-facing message formatter in `router/src/cli/dependencies/messages.ts` - export `formatMissingDependencyError()` that generates consolidated error with platform-specific install instructions, docs link per DEPENDENCY_CATALOG
- [ ] T019 [US1] Implement `displayDependencyErrors(summary: DependencyCheckSummary, stderr)` in `router/src/cli/dependencies/messages.ts` - format and write consolidated error to stderr
- [ ] T020 [US1] Integrate dependency preflight into local-review command in `router/src/cli/commands/local-review.ts` - add check after config loading, before diff generation; exit with code 1 if hasBlockingIssues
- [ ] T021 [US1] Update barrel export in `router/src/cli/dependencies/index.ts` - add checker and messages exports

**Checkpoint**: User Story 1 complete - missing dependencies show actionable errors with platform-specific install instructions

---

## Phase 4: User Story 2 - Dependency Check Command (Priority: P2)

**Goal**: Provide `ai-review check` command for proactive environment validation

**Independent Test**: Run `ai-review check --verbose` and verify it reports status of all known dependencies with versions

### Tests for User Story 2

- [ ] T022 [P] [US2] Write unit tests for check command output formatting in `router/src/__tests__/cli/dependencies/check-command.test.ts` - test success output, missing output, JSON output format

### Implementation for User Story 2

- [ ] T023 [US2] Create check command module in `router/src/cli/commands/check.ts` - export `runCheck(options)` function with `--verbose` and `--json` flag support
- [ ] T024 [US2] Implement check command success output formatting - display checkmark, tool name, version for each available dependency
- [ ] T025 [US2] Implement check command JSON output mode - output DependencyCheckSummary as JSON when `--json` flag provided
- [ ] T026 [US2] Implement check command verbose mode - show additional details like minimum version, docs URL for each dependency
- [ ] T027 [US2] Register check command in `router/src/main.ts` - add `program.command('check')` with description and options after existing commands
- [ ] T028 [US2] Update barrel export in `router/src/cli/dependencies/index.ts` if any new exports needed

**Checkpoint**: User Story 2 complete - `ai-review check` validates environment setup

---

## Phase 5: User Story 3 - Graceful Degradation with Partial Dependencies (Priority: P3)

**Goal**: Skip optional passes when dependencies missing, fail only on required passes

**Independent Test**: Run `ai-review local .` with semgrep installed but reviewdog missing; verify semgrep passes run while reviewdog passes are skipped with warning

### Tests for User Story 3

- [ ] T029 [P] [US3] Write unit tests for pass filtering logic in `router/src/__tests__/cli/dependencies/checker.test.ts` - test missingRequired vs missingOptional categorization based on pass.required flag
- [ ] T030 [P] [US3] Write unit tests for warning message formatting in `router/src/__tests__/cli/dependencies/messages.test.ts` - test informational skip message for optional passes

### Implementation for User Story 3

- [ ] T031 [US3] Enhance `checkDependenciesForPasses()` in `router/src/cli/dependencies/checker.ts` - populate missingRequired and missingOptional arrays based on pass.required field
- [ ] T032 [US3] Implement `displayDependencyWarnings(summary: DependencyCheckSummary, stderr)` in `router/src/cli/dependencies/messages.ts` - format informational skip messages for optional passes
- [ ] T033 [US3] Update local-review integration in `router/src/cli/commands/local-review.ts` - display warnings for skipped optional passes, continue execution; exit 0 if only optional passes skipped, exit 1 if any required pass blocked
- [ ] T034 [US3] Implement unhealthy state handling in `router/src/cli/dependencies/checker.ts` - detect when binary exists but --version fails, return 'unhealthy' status with advisory message
- [ ] T035 [US3] Implement unhealthy warning message in `router/src/cli/dependencies/messages.ts` - warn user, suggest manual verification, allow execution to proceed

**Checkpoint**: User Story 3 complete - optional passes skip gracefully, required passes fail fast

---

## Phase 6: User Story 4 - Installation Instructions by Platform (Priority: P4)

**Goal**: Platform-specific installation instructions for each supported OS

**Independent Test**: Run on different platforms with missing dependencies; verify platform-appropriate instructions appear

### Tests for User Story 4

- [ ] T036 [P] [US4] Write unit tests for platform-specific instruction selection in `router/src/__tests__/cli/dependencies/messages.test.ts` - test darwin/win32/linux instruction variants for semgrep and reviewdog

### Implementation for User Story 4

- [ ] T037 [US4] Implement `getInstallInstructions(depName: string, platform: Platform)` in `router/src/cli/dependencies/messages.ts` - lookup platform-specific instructions from DEPENDENCY_CATALOG
- [ ] T038 [US4] Enhance error message formatting in `router/src/cli/dependencies/messages.ts` - include platform detection and appropriate install command
- [ ] T039 [US4] Add Python prerequisite note for Windows semgrep installation in `router/src/cli/dependencies/catalog.ts` - update win32 instruction to mention Python 3.8+ requirement
- [ ] T040 [US4] Add documentation URL to all error messages in `router/src/cli/dependencies/messages.ts` - include docsUrl from catalog entry (FR-009)

**Checkpoint**: User Story 4 complete - all platforms get appropriate installation guidance

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, edge cases, and cleanup

- [ ] T041 Handle edge case: tool in PATH but broken (unhealthy state) - ensure manual verification steps are suggested
- [ ] T042 Ensure all error paths avoid exposing ENOENT or cryptic subprocess errors (SC-003)
- [ ] T043 Verify preflight completes in <2 seconds (SC-001) - add timing assertions to tests if needed
- [ ] T044 Verify check command completes in <5 seconds (SC-004)
- [ ] T045 Run self-review validation: `ai-review local .` on odd-ai-reviewers repo (SC-005)
- [ ] T046 Run external repo test: `ai-review local .` on another TypeScript/JS repository (SC-006)
- [ ] T047 [P] Update module barrel export to include all public APIs in `router/src/cli/dependencies/index.ts`
- [ ] T048 Run full test suite: `pnpm test router/src/__tests__/cli/dependencies/`
- [ ] T049 Run linter and fix any issues: `pnpm lint`
- [ ] T050 Run typecheck: `pnpm typecheck`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 (P1) can start immediately after Foundational
  - US2 (P2) depends on checker.ts from US1
  - US3 (P3) depends on checker.ts from US1
  - US4 (P4) depends on messages.ts from US1
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

```text
Foundational (Phase 2)
    │
    ├──→ User Story 1 (P1) - Core detection + error messages
    │       │
    │       ├──→ User Story 2 (P2) - Check command (uses checker.ts)
    │       │
    │       ├──→ User Story 3 (P3) - Graceful degradation (extends checker.ts)
    │       │
    │       └──→ User Story 4 (P4) - Platform instructions (extends messages.ts)
    │
    └──→ Polish (Phase 7) - after all stories complete
```

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Types/schemas before logic
- Core functions before integration
- Story complete before moving to next priority

### Parallel Opportunities

**Phase 1 (Setup)**:

- T002, T003, T004 can run in parallel (different files)

**Phase 2 (Foundational)**:

- T006, T007 can run in parallel (different files)
- T009, T010, T011 can run in parallel (different test files)

**Phase 3 (US1)**:

- T012, T013 can run in parallel (different test files)

**Phase 4 (US2)**:

- T022 can run while US1 implementation completes

**Phase 5 (US3)**:

- T029, T030 can run in parallel (different test aspects)

**Phase 6 (US4)**:

- T036 can run while other US4 tasks proceed

---

## Parallel Example: User Story 1

```bash
# Launch tests in parallel:
Task: "Write unit tests for single dependency checking in router/src/__tests__/cli/dependencies/checker.test.ts"
Task: "Write unit tests for message formatting in router/src/__tests__/cli/dependencies/messages.test.ts"

# Then implement sequentially:
Task: "Implement core dependency checker in router/src/cli/dependencies/checker.ts"
Task: "Implement checkAllDependencies in router/src/cli/dependencies/checker.ts"
# ... etc
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T011)
3. Complete Phase 3: User Story 1 (T012-T021)
4. **STOP and VALIDATE**: Run `ai-review local .` with missing semgrep - verify error message
5. Deploy/merge if ready for initial feedback

### Incremental Delivery

1. **Setup + Foundational → Core Infrastructure Ready**
2. **Add User Story 1 → MVP: Missing dependencies show errors**
3. **Add User Story 2 → `ai-review check` command available**
4. **Add User Story 3 → Graceful degradation for partial setups**
5. **Add User Story 4 → Platform-specific instructions polished**
6. **Polish → Production ready**

---

## Summary

| Phase | Tasks     | User Story | Description                                  |
| ----- | --------- | ---------- | -------------------------------------------- |
| 1     | T001-T004 | -          | Setup: Types, schemas, directory structure   |
| 2     | T005-T011 | -          | Foundational: Platform, version, catalog     |
| 3     | T012-T021 | US1 (P1)   | First-Time Setup: Detection + error messages |
| 4     | T022-T028 | US2 (P2)   | Check Command: Proactive validation          |
| 5     | T029-T035 | US3 (P3)   | Graceful Degradation: Optional vs required   |
| 6     | T036-T040 | US4 (P4)   | Platform Instructions: OS-specific guidance  |
| 7     | T041-T050 | -          | Polish: Integration, validation, cleanup     |

**Total Tasks**: 50
**MVP Scope**: Phases 1-3 (21 tasks) delivers core value

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- All new code goes in `router/src/cli/dependencies/` - isolated module
- Uses existing patterns from `router/src/agents/reviewdog.ts` (execFileSync with shell: false)
