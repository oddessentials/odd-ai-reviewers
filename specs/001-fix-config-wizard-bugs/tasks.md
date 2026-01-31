# Tasks: Fix Config Wizard Validation Bugs

**Input**: Design documents from `/specs/001-fix-config-wizard-bugs/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `router/src/` for source, `router/src/__tests__/` for tests
- All paths relative to repository root

---

## Phase 1: Setup

**Purpose**: Branch verification and project readiness

- [x] T001 Verify branch `001-fix-config-wizard-bugs` is based on `origin/015-config-wizard-validate`
- [x] T002 Run `pnpm install` in router/ to ensure dependencies are current
- [x] T003 Run `pnpm typecheck && pnpm lint` to verify baseline passes

---

## Phase 2: Foundational (Type Extensions)

**Purpose**: Extend PreflightResult with warnings array - required before any user story

**⚠️ CRITICAL**: User story implementations depend on these type changes

- [x] T004 Add `warnings: string[]` field to PreflightResult interface in `router/src/phases/preflight.ts`
- [x] T005 Update all `runPreflightChecks` return statements to include `warnings: []` (or populated array)
- [x] T006 Add `warnings: string[]` to ValidationReport interface in `router/src/cli/validation-report.ts`
- [x] T007 Update `formatValidationReport` to include warnings from PreflightResult
- [x] T008 Update `printValidationReport` to display warnings (distinct from errors)

**Checkpoint**: Type changes complete - user story implementation can begin

---

## Phase 3: User Story 1 - Auto-Applied Model Persists to Execution (Priority: P1) 🎯 MVP

**Goal**: Preflight returns `resolvedConfig` and runReview uses it exclusively—no re-resolution after preflight

**Independent Test**: Run `ai-review review --repo . --base HEAD~1 --head HEAD` with only OPENAI_API_KEY set (no MODEL). Review should complete using gpt-4o.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [US1] Create test file `router/src/__tests__/resolution-guardrail.test.ts`
- [x] T010 [US1] Add test: spy on `resolveEffectiveModelWithDefaults` and assert called exactly once per review command (FR-015)
- [x] T011 [US1] Add test: spy on `resolveEffectiveModelWithDefaults` and assert called exactly once per validate command (FR-015)
- [x] T012 [US1] Add test: verify `AgentContext.effectiveModel` matches `ResolvedConfig.model` (FR-016)

### Implementation for User Story 1

- [x] T013 [US1] Modify `runPreflightChecks` in `router/src/phases/preflight.ts` to return `resolved: ResolvedConfigTuple` in PreflightResult (FR-001)
- [x] T014 [US1] Call `buildResolvedConfigTuple` in preflight and include result in return value
- [x] T015 [US1] Modify `runReview` in `router/src/main.ts` to update `agentContext.effectiveModel` from `preflightResult.resolved.model` (FR-002, FR-004)
- [x] T016 [US1] Remove duplicate `resolveEffectiveModel` call in main.ts after preflight (use preflight result only) (FR-003)

**Checkpoint**: Single-key setup works end-to-end; model resolution happens exactly once

---

## Phase 4: User Story 2 - Ollama Provider Accepts Default URL (Priority: P2)

**Goal**: Ollama provider validates without requiring OLLAMA_BASE_URL; URL format validated if explicitly set

**Independent Test**: Run `ai-review validate --repo .` with config containing `provider: ollama` and no OLLAMA_BASE_URL set. Should pass.

### Tests for User Story 2

- [ ] T017 [P] [US2] Add test in `router/src/__tests__/preflight.test.ts`: Ollama provider passes validation without OLLAMA_BASE_URL (FR-005, FR-006)
- [ ] T018 [P] [US2] Add test: Ollama with invalid URL format fails preflight with clear error (FR-007)
- [ ] T019 [P] [US2] Add test: Ollama with valid but unreachable URL passes preflight (FR-008)
- [ ] T020 [P] [US2] Add test: `config init --defaults --provider ollama` generates valid config

### Implementation for User Story 2

- [ ] T021 [US2] Modify `validateExplicitProviderKeys` in `router/src/preflight.ts` to skip OLLAMA_BASE_URL requirement for `provider: ollama` (FR-005)
- [ ] T022 [US2] Add URL format validation (scheme + host check) when OLLAMA_BASE_URL is explicitly set (FR-007)
- [ ] T023 [US2] Ensure validateOllamaConfig continues to return valid:true for format-valid URLs (FR-008)

**Checkpoint**: Ollama users can validate configs without explicit OLLAMA_BASE_URL

---

## Phase 5: User Story 3 - Config Init Validation Completes Successfully (Priority: P2)

**Goal**: Config init builds valid AgentContext and validation completes without crash

**Independent Test**: Run `ai-review config init --defaults --provider openai --platform github`. Should complete with validation output (may show warnings, no crash).

### Tests for User Story 3

- [ ] T024 [P] [US3] Add test in `router/src/__tests__/config-wizard.test.ts`: config init validation completes without exception
- [ ] T025 [P] [US3] Add test: config init with no API keys shows warnings, exit 0 (FR-019)
- [ ] T026 [P] [US3] Add test: config init with valid API keys shows success, exit 0
- [ ] T027 [P] [US3] Add test: config init with validation errors exits 1 (FR-019)
- [ ] T028 [P] [US3] Add test: wizard cancellation (Ctrl+C/EOF) exits 0 (FR-023)
- [ ] T029 [P] [US3] Add test: non-TTY without `--defaults` exits 1 with actionable error (FR-024)

### Implementation for User Story 3

- [ ] T030 [US3] Modify config init in `router/src/main.ts` to build minimal AgentContext (not undefined) (FR-009, FR-010)
- [ ] T031 [US3] Use same pattern as validate command: `resolveEffectiveModel`, create context with required fields
- [ ] T032 [US3] Add wizard cancellation handler: exit 0 on Ctrl+C or EOF (FR-023)
- [ ] T033 [US3] Add non-TTY detection: if `!process.stdin.isTTY && !options.defaults`, exit 1 with message (FR-024)
- [ ] T034 [US3] Non-TTY error message: "Error: Interactive mode requires a TTY. Use --defaults flag with --provider and --platform options."

**Checkpoint**: Config init works in all environments (TTY, non-TTY, cancel)

---

## Phase 6: User Story 4 - Both Platform Option Generates Dual Reporting (Priority: P3)

**Goal**: "Both" platform generates both GitHub and ADO reporting blocks; warns when no CI env detected

**Independent Test**: Run config wizard interactively, select "Both" for platform, examine generated YAML for both reporting blocks.

### Tests for User Story 4

- [ ] T035 [P] [US4] Add test in `router/src/__tests__/config-wizard.test.ts`: "both" platform generates `reporting.github` and `reporting.ado` (FR-011)
- [ ] T036 [P] [US4] Add test: generated dual-platform config has correct defaults (checks_and_comments for GitHub, comments for ADO) (FR-012)
- [ ] T037 [P] [US4] Add test: validation warns when neither GITHUB_ACTIONS nor TF_BUILD/SYSTEM_TEAMFOUNDATIONCOLLECTIONURI detected (FR-013, FR-017)
- [ ] T038 [P] [US4] Add test: warning is informational (exit 0, not error) (FR-014, FR-020)

### Implementation for User Story 4

- [ ] T039 [US4] Modify `generateDefaultConfig` in `router/src/cli/config-wizard.ts` to generate dual reporting blocks for "both" platform (FR-011, FR-012)
- [ ] T040 [US4] Add platform environment detection in preflight: check GITHUB_ACTIONS, TF_BUILD, SYSTEM_TEAMFOUNDATIONCOLLECTIONURI (FR-013)
- [ ] T041 [US4] Emit warning listing exact env vars checked when neither platform detected (FR-017)
- [ ] T042 [US4] Ensure warning is added to `warnings` array, not `errors` array (FR-014)

**Checkpoint**: Dual-platform users get correct config and helpful warnings

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Exit code semantics, regression tests, validate/review parity

### Exit Code Semantics (FR-018 through FR-026)

- [ ] T043 [P] Add test: validate exits 1 only if `errors.length > 0` (FR-018)
- [ ] T044 [P] Add test: validate exits 0 with warnings only (FR-018, SC-010)
- [ ] T045 [P] Add test: validate/review never prompt for input (fail fast) (FR-025)
- [ ] T046 [P] Add test: no command hangs on stdin in CI (FR-026)
- [ ] T047 Verify validate command exit logic uses `errors.length > 0 ? 1 : 0`
- [ ] T048 Ensure validate and review fail fast with error message when input needed (FR-025)

### Validate/Review Parity Tests (FR-021, FR-022)

- [ ] T049 Create test file `router/src/__tests__/validate-review-parity.test.ts`
- [ ] T050 Add test: run both validate and review on same repo/env, assert resolved tuple identical (FR-021, SC-011)
- [ ] T051 Add test: validate performs no resolution branches that review doesn't (FR-022)

### Final Verification

- [ ] T052 Run `pnpm lint --max-warnings 0` and fix any warnings
- [ ] T053 Run `pnpm typecheck` and verify no type errors
- [ ] T054 Run `pnpm test` and verify all tests pass
- [ ] T055 Run quickstart.md manual testing guide for all 4 bugs
- [ ] T056 Verify all success criteria SC-001 through SC-014

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - P1 priority, implement first
- **User Story 2 (Phase 4)**: Depends on Foundational - can run parallel to US1 if needed
- **User Story 3 (Phase 5)**: Depends on Foundational - can run parallel to US1/US2
- **User Story 4 (Phase 6)**: Depends on Foundational - can run parallel to others
- **Polish (Phase 7)**: Depends on all user stories being complete

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Verify tests fail → implement fix → verify tests pass
- Story complete before moving to next priority (recommended)

### Parallel Opportunities

- All tests within a user story marked [P] can run in parallel
- User stories 2, 3, 4 can theoretically run parallel after Foundational complete
- Recommended: Complete P1 (US1) first, then P2 (US2, US3), then P3 (US4)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (P1 - most critical bug)
4. **STOP and VALIDATE**: Test single-key setup end-to-end
5. Proceed to remaining stories

### Incremental Delivery

1. Setup + Foundational → Type changes ready
2. User Story 1 → Model propagation fixed (P1)
3. User Story 2 → Ollama URL optional (P2)
4. User Story 3 → Config init works (P2)
5. User Story 4 → Both platform dual reporting (P3)
6. Polish → All regression tests, exit codes verified

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- See quickstart.md for manual testing commands
- See research.md for implementation patterns (Vitest spy, URL validation, etc.)
