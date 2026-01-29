# Tasks: Type and Test Optimization

**Input**: Design documents from `/specs/010-type-test-optimization/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests ARE included as they are explicitly required in the feature specification (FR-011 through FR-019).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project root**: `router/src/` for source, `router/src/__tests__/` for tests
- **New types directory**: `router/src/types/` for shared type utilities
- **Integration tests**: `router/src/__tests__/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create new types/ directory structure and foundational utilities

- [x] T001 Create types directory structure at router/src/types/
- [x] T002 [P] Create assertNever utility in router/src/types/assert-never.ts per data-model.md
- [x] T003 [P] Create test utilities for hermetic tests in router/src/\_\_tests\_\_/test-utils/hermetic.ts
- [x] T004 [P] Add CI toolchain version check step to .github/workflows/ci.yml per research.md R-009

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core type utilities that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Implement ErrorWireFormatSchema Zod schema in router/src/types/errors.ts per data-model.md
- [x] T006 Implement BaseError abstract class in router/src/types/errors.ts with toWireFormat() and fromWireFormat()
- [x] T007 [P] Implement ConfigError class in router/src/types/errors.ts with CONFIG\_ code prefix
- [x] T008 [P] Implement AgentError class in router/src/types/errors.ts with AGENT\_ code prefix
- [x] T009 [P] Implement NetworkError class in router/src/types/errors.ts with NETWORK\_ code prefix
- [x] T010 [P] Implement ValidationError class in router/src/types/errors.ts with VALIDATION\_ code prefix
- [x] T011 Implement Result type and utilities (Ok, Err, isOk, isErr, map, flatMap, match) in router/src/types/result.ts per contracts/result.ts
- [x] T012 Implement wrapThrowing and wrapThrowingAsync utilities in router/src/types/result.ts for backward compatibility
- [x] T013 Implement Brand generic type and createBrandHelpers factory in router/src/types/branded.ts per contracts/branded.ts
- [x] T014 Create types/index.ts barrel export in router/src/types/index.ts

**Checkpoint**: Foundation ready - all type utilities available for user story implementation

---

## Phase 3: User Story 1 - Type-Safe Error Handling (Priority: P1) 🎯 MVP

**Goal**: Consistent, type-safe error handling across all modules with canonical wire format

**Independent Test**: Trigger error scenarios in any module and verify error types, contexts, and stack traces are preserved

### Tests for User Story 1

- [x] T015 [P] [US1] Unit test for error serialization round-trip in router/src/\_\_tests\_\_/types/errors.test.ts
- [x] T016 [P] [US1] Unit test for error cause chaining in router/src/\_\_tests\_\_/types/errors.test.ts
- [x] T017 [P] [US1] Unit test for error type guards (isConfigError, isAgentError, etc.) in router/src/\_\_tests\_\_/types/errors.test.ts

### Implementation for User Story 1

- [x] T018 [US1] Migrate error handling in router/src/config.ts to use ConfigError
- [ ] T019 [US1] Migrate error handling in router/src/config/schemas.ts to use ConfigError
- [x] T020 [US1] Migrate error handling in router/src/git-validators.ts to use ValidationError
- [x] T021 [US1] Migrate error handling in router/src/agents/retry.ts to use NetworkError
- [ ] T022 [US1] Migrate error handling in router/src/agents/semgrep.ts to use AgentError
- [ ] T023 [US1] Migrate error handling in router/src/agents/opencode.ts to use AgentError
- [ ] T024 [US1] Migrate error handling in router/src/agents/ai_semantic_review.ts to use AgentError
- [ ] T025 [US1] Migrate error handling in router/src/preflight.ts to use ConfigError/ValidationError
- [x] T026 [US1] Migrate error handling in router/src/diff.ts to use ValidationError
- [x] T027 [US1] Add type guards export to router/src/types/errors.ts (isConfigError, isAgentError, isNetworkError, isValidationError)

**Checkpoint**: All 16+ error handling locations now use typed custom errors with wire format

---

## Phase 4: User Story 2 - Branded Types for Validated Data (Priority: P1)

**Goal**: Compile-time guarantees for validated data with explicit serialization helpers

**Independent Test**: Attempt to pass unbranded types to functions requiring branded types; confirm compile errors

### Tests for User Story 2

- [ ] T028 [P] [US2] Unit test for SafeGitRef brand helpers in router/src/\_\_tests\_\_/types/branded.test.ts
- [ ] T029 [P] [US2] Unit test for ValidatedConfig brand helpers in router/src/\_\_tests\_\_/types/branded.test.ts
- [ ] T030 [P] [US2] Unit test for CanonicalPath brand helpers in router/src/\_\_tests\_\_/types/branded.test.ts
- [ ] T031 [P] [US2] Unit test for serialization round-trip (brand → unbrand → parse) in router/src/\_\_tests\_\_/types/branded.test.ts

### Implementation for User Story 2

- [ ] T032 [US2] Implement SafeGitRefHelpers with parse/brand/unbrand in router/src/types/branded.ts
- [ ] T033 [US2] Implement ValidatedConfigHelpers with parse/brand/unbrand in router/src/types/branded.ts
- [ ] T034 [US2] Implement CanonicalPathHelpers with parse/brand/unbrand in router/src/types/branded.ts
- [ ] T035 [US2] Refactor router/src/git-validators.ts to return SafeGitRef from assertSafeGitRef
- [ ] T036 [US2] Refactor router/src/config.ts loadConfig to return ValidatedConfig
- [ ] T037 [US2] Update router/src/diff.ts canonicalizeDiffFiles to use CanonicalPath helpers
- [ ] T038 [US2] Update router/src/cache/key.ts to use unbrand() for cache key generation
- [ ] T039 [US2] Update router/src/cache/store.ts to use parse() when deserializing cached data

**Checkpoint**: 3+ branded types implemented with serialization helpers; compile-time validation enforced

---

## Phase 5: User Story 3 - Result Type Pattern for Operations (Priority: P2)

**Goal**: Explicit error handling with compile-time enforcement; backward-compatible public API

**Independent Test**: Call any Result-returning function; verify compile error if accessing value without checking

### Tests for User Story 3

- [ ] T040 [P] [US3] Unit test for Result type narrowing in router/src/\_\_tests\_\_/types/result.test.ts
- [ ] T041 [P] [US3] Unit test for Result utilities (map, flatMap, collect, partition) in router/src/\_\_tests\_\_/types/result.test.ts
- [ ] T042 [P] [US3] Unit test for wrapThrowing backward compatibility in router/src/\_\_tests\_\_/types/result.test.ts

### Implementation for User Story 3

- [ ] T043 [US3] Convert router/src/config.ts loadConfig to return Result internally with throwing wrapper
- [ ] T044 [US3] Convert router/src/git-validators.ts validation functions to return Result internally
- [ ] T045 [US3] Convert router/src/preflight.ts runPreflightChecks to return Result internally
- [ ] T046 [US3] Convert router/src/trust.ts checkTrust to return Result internally
- [ ] T047 [US3] Convert router/src/budget.ts checkBudget to return Result internally
- [ ] T048 [US3] Add fromPromise utility for async error handling in router/src/types/result.ts
- [ ] T049 [US3] Ensure all public exports have throwing wrappers for backward compatibility

**Checkpoint**: Result pattern used in 5+ operations with backward-compatible wrappers

---

## Phase 6: User Story 4 - Entry Point Test Coverage (Priority: P2)

**Goal**: Test coverage for main.ts, config.ts, budget.ts entry points (target: 60%)

**Independent Test**: Run test suite and verify entry points execute with various arguments/configs

### Tests for User Story 4

- [ ] T050 [P] [US4] Unit tests for main.ts run(argv, env) with valid arguments in router/src/\_\_tests\_\_/main.test.ts
- [ ] T051 [P] [US4] Unit tests for main.ts run(argv, env) with invalid arguments in router/src/\_\_tests\_\_/main.test.ts
- [ ] T052 [P] [US4] Unit tests for config.ts loadConfig edge cases in router/src/\_\_tests\_\_/config-coverage.test.ts
- [ ] T053 [P] [US4] Unit tests for budget.ts checkBudget scenarios in router/src/\_\_tests\_\_/budget-coverage.test.ts

### Implementation for User Story 4

- [ ] T054 [US4] Refactor router/src/main.ts to export run(argv, env, exitHandler) function per research.md R-007
- [ ] T055 [US4] Add ExitHandler interface and defaultExitHandler in router/src/main.ts
- [ ] T056 [US4] Guard main.ts execution with import.meta.url check to prevent side effects on import
- [ ] T057 [US4] Ensure config.ts exports are testable without side effects
- [ ] T058 [US4] Ensure budget.ts exports are testable without side effects

**Checkpoint**: Entry point coverage reaches minimum 60%

---

## Phase 7: User Story 5 - Integration Test Suite (Priority: P2)

**Goal**: 10+ hermetic integration tests for full review pipeline

**Independent Test**: Run integration suite against mock repos; verify end-to-end behavior with stubbed providers

### Tests for User Story 5

- [ ] T059 [P] [US5] Integration test for successful pipeline execution in router/src/\_\_tests\_\_/integration/pipeline.test.ts
- [ ] T060 [P] [US5] Integration test for agent failure isolation in router/src/\_\_tests\_\_/integration/agent-failure.test.ts
- [ ] T061 [P] [US5] Integration test for cache hit behavior in router/src/\_\_tests\_\_/integration/cache.test.ts
- [ ] T062 [P] [US5] Integration test for cache miss behavior in router/src/\_\_tests\_\_/integration/cache.test.ts
- [ ] T063 [P] [US5] Integration test for GitHub reporter in router/src/\_\_tests\_\_/integration/multi-reporter.test.ts
- [ ] T064 [P] [US5] Integration test for ADO reporter in router/src/\_\_tests\_\_/integration/multi-reporter.test.ts
- [ ] T065 [P] [US5] Integration test for combined reporters in router/src/\_\_tests\_\_/integration/multi-reporter.test.ts

### Implementation for User Story 5

- [ ] T066 [US5] Create mock repository fixtures in router/src/\_\_tests\_\_/fixtures/mock-repos/
- [ ] T067 [US5] Create stubbed LLM provider responses in router/src/\_\_tests\_\_/fixtures/llm-responses/
- [ ] T068 [US5] Create stubbed GitHub/ADO API responses in router/src/\_\_tests\_\_/fixtures/api-responses/
- [ ] T069 [US5] Implement hermetic test setup with frozen time/UUID in all integration tests
- [ ] T070 [US5] Add integration tests for malformed input handling in router/src/\_\_tests\_\_/integration/error-paths.test.ts
- [ ] T071 [US5] Add integration tests for timeout scenarios in router/src/\_\_tests\_\_/integration/error-paths.test.ts

**Checkpoint**: 10+ hermetic integration tests; no real network/git/time dependencies

---

## Phase 8: User Story 6 - Generic Type Constraints (Priority: P3)

**Goal**: Use TypeScript 5.9 features for better type inference

**Independent Test**: Verify generic functions preserve literal types without explicit annotations

### Implementation for User Story 6

- [ ] T072 [US6] Add const type parameters to generic functions in router/src/types/result.ts
- [ ] T073 [US6] Add const type parameters to generic functions in router/src/types/branded.ts
- [ ] T074 [US6] Add satisfies operator usage for config defaults in router/src/config.ts
- [ ] T075 [US6] Add type tests for literal type preservation in router/src/\_\_tests\_\_/types/inference.test.ts

**Checkpoint**: Generic functions preserve literal types; improved inference across codebase

---

## Phase 9: User Story 7 - Discriminated Unions for Agent Results (Priority: P3)

**Goal**: AgentResult uses discriminated union with assertNever enforcement

**Independent Test**: Create switch on AgentResult; verify compile error if case missing

### Tests for User Story 7

- [ ] T076 [P] [US7] Unit test for AgentResult discriminated union in router/src/\_\_tests\_\_/agents/types.test.ts
- [ ] T077 [P] [US7] Unit test for assertNever enforcement in router/src/\_\_tests\_\_/types/assert-never.test.ts

### Implementation for User Story 7

- [ ] T078 [US7] Refactor AgentResult in router/src/agents/types.ts to use discriminated union with status field
- [ ] T079 [US7] Add AgentSuccess, AgentFailure, AgentSkipped constructors in router/src/agents/types.ts
- [ ] T080 [US7] Update all agent implementations to return new AgentResult variants
- [ ] T081 [US7] Update router/src/phases/execute.ts to use assertNever in switch on AgentResult
- [ ] T082 [US7] Update router/src/report/base.ts to use assertNever in switch on AgentResult
- [ ] T083 [US7] Audit all existing switches for assertNever usage; add where missing

**Checkpoint**: All discriminated unions use assertNever; compiler catches missing cases

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Record<string, unknown> migration, Zod enforcement, final validation

- [ ] T084 [P] Migrate Finding.metadata from Record<string, unknown> to typed schema in router/src/agents/types.ts
- [ ] T085 [P] Migrate AgentContext.env from Record<string, unknown> to typed helpers in router/src/agents/types.ts
- [ ] T086 Add compile-time type tests for Zod schema consistency in router/src/\_\_tests\_\_/types/schema-consistency.test.ts
- [ ] T087 Audit all z.infer<> usages; remove any hand-duplicated interfaces
- [ ] T088 Run full test suite and verify all 58+ existing tests still pass
- [ ] T089 Run coverage report and verify overall coverage >= 45%
- [ ] T090 Validate quickstart.md examples compile and work correctly
- [ ] T091 Update CLAUDE.md with new types/ documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **US1, US2 (Phase 3-4)**: P1 priority - can run in parallel after Foundational
- **US3, US4, US5 (Phase 5-7)**: P2 priority - can run in parallel after Foundational
- **US6, US7 (Phase 8-9)**: P3 priority - can run after P1/P2 complete
- **Polish (Phase 10)**: Depends on all user stories being complete

### User Story Dependencies

| Story                      | Depends On                  | Can Parallel With |
| -------------------------- | --------------------------- | ----------------- |
| US1 (Error Handling)       | Foundational                | US2               |
| US2 (Branded Types)        | Foundational                | US1               |
| US3 (Result Pattern)       | US1 (errors), US2 (branded) | US4, US5          |
| US4 (Entry Point Tests)    | US3 (Result)                | US3, US5          |
| US5 (Integration Tests)    | US1-US4 complete            | US4               |
| US6 (Generics)             | US2, US3                    | US7               |
| US7 (Discriminated Unions) | US1 (errors)                | US6               |

### Parallel Opportunities

**Within Each Phase:**

- T002, T003, T004 can run in parallel (Setup)
- T007, T008, T009, T010 can run in parallel (error classes)
- All test tasks marked [P] can run in parallel within their story
- T028, T029, T030, T031 can run in parallel (branded type tests)
- T059-T065 can run in parallel (integration tests)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T005, T006 complete (BaseError), launch error classes in parallel:
Task: "Implement ConfigError class in router/src/types/errors.ts"
Task: "Implement AgentError class in router/src/types/errors.ts"
Task: "Implement NetworkError class in router/src/types/errors.ts"
Task: "Implement ValidationError class in router/src/types/errors.ts"

# T011-T014 can then run in parallel after error classes complete
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: US1 (Error Handling)
4. Complete Phase 4: US2 (Branded Types)
5. **STOP and VALIDATE**: Test US1 + US2 independently
6. Already delivers: Type-safe errors, branded validation, canonical wire format

### Incremental Delivery

1. Setup + Foundational → Type utilities available
2. US1 + US2 → MVP: Type-safe errors + branded types
3. US3 → Result pattern with backward compatibility
4. US4 + US5 → Test coverage (45%+ target)
5. US6 + US7 → Polish: Better inference + exhaustive unions
6. Polish → Final validation and documentation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All tests are included per FR-011 through FR-019 requirements
- Module-by-module migration per clarification constraint
- Backward compatibility maintained via throwing wrappers per clarification
- Hermetic tests only per clarification (no network, no git, frozen time/UUID)
- Total: 91 tasks across 10 phases
