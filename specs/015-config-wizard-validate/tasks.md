# Tasks: Complete Config Wizard and Validation Command

**Input**: Design documents from `/specs/015-config-wizard-validate/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are included as this is a CLI feature requiring validation of interactive behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project type**: Single (CLI tool)
- **Source**: `router/src/`
- **Tests**: `router/src/__tests__/`
- **CLI modules**: `router/src/cli/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new modules and shared utilities needed by all user stories

- [x] T001 Create interactive prompts module skeleton in router/src/cli/interactive-prompts.ts
- [x] T002 [P] Create validation report module skeleton in router/src/cli/validation-report.ts
- [x] T003 [P] Add AVAILABLE_PLATFORMS constant to router/src/cli/config-wizard.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement PromptOption and PromptResult types in router/src/cli/interactive-prompts.ts
- [x] T005 Implement promptSelect() function using readline/promises in router/src/cli/interactive-prompts.ts
- [x] T006 Implement promptConfirm() function for Y/N prompts in router/src/cli/interactive-prompts.ts
- [x] T007 Implement createReadlineInterface() factory in router/src/cli/interactive-prompts.ts
- [x] T008 [P] Implement ValidationReport interface in router/src/cli/validation-report.ts
- [x] T009 [P] Implement formatValidationReport() to convert PreflightResult to ValidationReport in router/src/cli/validation-report.ts
- [x] T010 Implement printValidationReport() for console output in router/src/cli/validation-report.ts
- [x] T011 Export all prompt utilities from router/src/cli/interactive-prompts.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Interactive Configuration Wizard (Priority: P1) 🎯 MVP

**Goal**: Add interactive prompts to `config init` command for platform, provider, and agent selection

**Independent Test**: Run `ai-review config init` in TTY, answer prompts, verify `.ai-review.yml` generated

### Tests for User Story 1

- [x] T012 [P] [US1] Create test file router/src/**tests**/interactive-prompts.test.ts with mock readline helper
- [x] T013 [P] [US1] Add test: promptSelect returns selected value for valid numeric input in router/src/**tests**/interactive-prompts.test.ts
- [x] T014 [P] [US1] Add test: promptSelect re-prompts on invalid input in router/src/**tests**/interactive-prompts.test.ts
- [x] T015 [P] [US1] Add test: promptConfirm returns true for 'y'/'yes' in router/src/**tests**/interactive-prompts.test.ts
- [x] T016 [P] [US1] Add test: promptConfirm returns false for 'n'/'no'/empty in router/src/**tests**/interactive-prompts.test.ts

### Implementation for User Story 1

- [x] T017 [US1] Add platform prompt (GitHub/Azure DevOps/Both) to config init in router/src/main.ts
- [x] T018 [US1] Add provider prompt (OpenAI/Anthropic/Azure OpenAI/Ollama) to config init in router/src/main.ts
- [x] T019 [US1] Add agent selection with provider-appropriate defaults to config init in router/src/main.ts
- [x] T020 [US1] Add overwrite confirmation prompt when output file exists in router/src/main.ts
- [x] T021 [US1] Handle Ctrl+C cancellation with exit code 0 in router/src/main.ts
- [x] T022 [US1] Update non-TTY error message to explain --defaults usage in router/src/main.ts
- [x] T023 [US1] Add test: config init in TTY shows platform prompt in router/src/**tests**/config-wizard.test.ts
- [x] T024 [US1] Add test: config init exits 0 on user cancellation in router/src/**tests**/config-wizard.test.ts

**Checkpoint**: User Story 1 complete - interactive wizard works independently

---

## Phase 4: User Story 2 - Configuration Validation Command (Priority: P1)

**Goal**: Integrate `runPreflightChecks()` into validate command for comprehensive validation

**Independent Test**: Run `ai-review validate --repo .` with various configs, verify all preflight checks run

### Tests for User Story 2

- [x] T025 [P] [US2] Create test file router/src/**tests**/validation-report.test.ts
- [x] T026 [P] [US2] Add test: formatValidationReport categorizes errors vs warnings in router/src/**tests**/validation-report.test.ts
- [x] T027 [P] [US2] Add test: printValidationReport outputs errors to stderr in router/src/**tests**/validation-report.test.ts
- [x] T028 [P] [US2] Add test: printValidationReport shows resolved tuple on success in router/src/**tests**/validation-report.test.ts

### Implementation for User Story 2

- [x] T029 [US2] Update validate command to call runPreflightChecks() in router/src/main.ts
- [x] T030 [US2] Update validate command to use formatValidationReport() in router/src/main.ts
- [x] T031 [US2] Update validate command to use printValidationReport() for output in router/src/main.ts
- [x] T032 [US2] Update validate command to exit 1 on errors, 0 on warnings-only in router/src/main.ts
- [x] T033 [US2] Add test: validate exits 0 for valid config in router/src/**tests**/preflight.test.ts
- [x] T034 [US2] Add test: validate exits 1 for multi-key ambiguity in router/src/**tests**/preflight.test.ts
- [x] T035 [US2] Add test: validate exits 0 with warnings for legacy keys in router/src/**tests**/preflight.test.ts
- [x] T036 [US2] Add test: validate shows resolved tuple on success in router/src/**tests**/preflight.test.ts

**Checkpoint**: User Story 2 complete - validate command runs all preflight checks

---

## Phase 5: User Story 3 - Post-Wizard Validation Summary (Priority: P2)

**Goal**: Display validation summary after wizard generates config file

**Independent Test**: Run `ai-review config init`, complete wizard, verify validation summary appears

**Dependencies**: Requires User Story 1 (wizard) and User Story 2 (validation report)

### Implementation for User Story 3

- [x] T037 [US3] Call runPreflightChecks() after config file is written in router/src/main.ts
- [x] T038 [US3] Display validation summary using printValidationReport() in router/src/main.ts
- [x] T039 [US3] Show "Next steps" with required env vars based on provider in router/src/main.ts
- [x] T040 [US3] Exit with code based on validation result (error=1, warning=0) in router/src/main.ts
- [x] T041 [US3] Add test: wizard shows validation summary after file write in router/src/**tests**/config-wizard.test.ts
- [x] T042 [US3] Add test: wizard exits 1 if generated config has errors in router/src/**tests**/config-wizard.test.ts
- [x] T043 [US3] Add test: wizard exits 0 if generated config has only warnings in router/src/**tests**/config-wizard.test.ts

**Checkpoint**: User Story 3 complete - wizard provides immediate feedback

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final quality improvements across all stories

- [x] T044 [P] Ensure YAML output is byte-stable (sorted agent lists) in router/src/cli/config-wizard.ts
- [x] T045 [P] Add JSDoc comments to all exported functions in router/src/cli/interactive-prompts.ts
- [x] T046 [P] Add JSDoc comments to all exported functions in router/src/cli/validation-report.ts
- [x] T047 Run `pnpm lint --max-warnings 0` and fix any issues
- [x] T048 Run `pnpm typecheck` and fix any type errors
- [x] T049 Run full test suite `pnpm test` and verify all pass
- [x] T050 Update spec.md status from Draft to Complete

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (no cross-dependencies)
  - US3 depends on both US1 and US2 being complete
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - uses interactive-prompts.ts
- **User Story 2 (P1)**: Can start after Foundational - uses validation-report.ts
- **User Story 3 (P2)**: Depends on US1 (wizard flow) and US2 (validation report)

### Within Each User Story

- Tests written first (marked with test file path)
- Implementation follows tests
- Integration tests verify end-to-end behavior

### Parallel Opportunities

**Phase 1 (Setup)**:

```bash
# All can run in parallel:
T001 Create interactive-prompts.ts skeleton
T002 Create validation-report.ts skeleton
T003 Add AVAILABLE_PLATFORMS constant
```

**Phase 2 (Foundational)**:

```bash
# T008 and T009 can run in parallel (different functions):
T008 Implement ValidationReport interface
T009 Implement formatValidationReport()
```

**Phase 3 (US1 Tests)**:

```bash
# All tests can run in parallel:
T012-T016 (5 test tasks)
```

**Phase 4 (US2 Tests)**:

```bash
# All tests can run in parallel:
T025-T028 (4 test tasks)
```

**Phase 6 (Polish)**:

```bash
# T044-T046 can run in parallel:
T044 Ensure YAML byte-stability
T045 Add JSDoc to interactive-prompts.ts
T046 Add JSDoc to validation-report.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T011)
3. Complete Phase 3: User Story 1 (T012-T024)
4. **STOP and VALIDATE**: Test wizard independently
5. Deliver: Interactive wizard works, users can generate configs

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add User Story 1 → Interactive wizard (MVP!)
3. Add User Story 2 → Comprehensive validation
4. Add User Story 3 → Wizard + validation integration
5. Polish → Production ready

### Parallel Team Strategy

With two developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (interactive wizard)
   - Developer B: User Story 2 (validation command)
3. Both developers: User Story 3 (integration)
4. Both developers: Polish phase

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- US1 and US2 are both P1 priority and can be done in parallel
- US3 builds on US1 and US2, so it must wait
- All exit code semantics per research.md R2: error=1, warning=0, cancel=0
- Byte-stability per FR-014: sorted agent lists in YAML output
