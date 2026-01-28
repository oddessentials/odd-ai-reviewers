# Tasks: ReDoS Prevention and Testing Improvements

**Input**: Design documents from `/specs/005-redos-prevention/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are explicitly required (FR-010 through FR-013 in spec.md) with 80% coverage target.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Workspace**: `router/` (monorepo workspace)
- **Source**: `router/src/agents/control_flow/`
- **Tests**: `router/tests/unit/agents/control_flow/`

---

## Phase 1: Setup

**Purpose**: Project structure validation and type definitions

- [x] T001 Verify router workspace structure and dependencies in router/package.json
- [x] T002 [P] Add PatternValidationResult and ValidationError schemas to router/src/agents/control_flow/types.ts
- [x] T003 [P] Add ReDoSDetectionResult schema to router/src/agents/control_flow/types.ts
- [x] T004 [P] Extend ControlFlowConfig with whitelistedPatterns field in router/src/agents/control_flow/types.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Create pattern-validator.ts module skeleton with IPatternValidator interface in router/src/agents/control_flow/pattern-validator.ts
- [x] T006 [P] Add pattern_validation log category to LogCategory type in router/src/agents/control_flow/logger.ts
- [x] T007 [P] Add logPatternValidation method to AnalysisLogger class in router/src/agents/control_flow/logger.ts
- [x] T008 Export pattern-validator module from router/src/agents/control_flow/index.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Safe Regex Pattern Validation (Priority: P1) 🎯 MVP

**Goal**: Validate regex patterns before execution to prevent catastrophic backtracking

**Independent Test**: Provide known ReDoS-vulnerable patterns (e.g., `(a+)+`) and verify they are rejected with clear error messages

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [x] T009 [P] [US1] Create test file router/tests/unit/agents/control_flow/pattern-validator.test.ts with describe blocks for validation scenarios
- [x] T010 [P] [US1] Add tests for nested quantifier detection (`(a+)+`, `(a*)*`, `(a+)*`) in router/tests/unit/agents/control_flow/pattern-validator.test.ts
- [x] T011 [P] [US1] Add tests for overlapping alternation detection (`(a|a)+`, `(aa|a)+`) in router/tests/unit/agents/control_flow/pattern-validator.test.ts
- [x] T012 [P] [US1] Add tests for star-height calculation in router/tests/unit/agents/control_flow/pattern-validator.test.ts
- [x] T013 [P] [US1] Add tests for risk score computation (0-100 scale) in router/tests/unit/agents/control_flow/pattern-validator.test.ts
- [x] T014 [P] [US1] Add tests for whitelist bypass functionality in router/tests/unit/agents/control_flow/pattern-validator.test.ts
- [x] T015 [P] [US1] Add tests for validation timeout behavior in router/tests/unit/agents/control_flow/pattern-validator.test.ts
- [x] T016 [P] [US1] Add tests for compilation error handling (`[invalid`) in router/tests/unit/agents/control_flow/pattern-validator.test.ts

### Implementation for User Story 1

- [x] T017 [US1] Implement hasNestedQuantifiers utility function in router/src/agents/control_flow/pattern-validator.ts
- [x] T018 [US1] Implement hasOverlappingAlternation utility function in router/src/agents/control_flow/pattern-validator.ts
- [x] T019 [US1] Implement calculateStarHeight utility function in router/src/agents/control_flow/pattern-validator.ts
- [x] T020 [US1] Implement computeRiskScore utility function in router/src/agents/control_flow/pattern-validator.ts
- [x] T021 [US1] Implement PatternValidator class with validatePattern method in router/src/agents/control_flow/pattern-validator.ts
- [x] T022 [US1] Implement validatePatterns batch method in router/src/agents/control_flow/pattern-validator.ts
- [x] T023 [US1] Implement isWhitelisted method and whitelist configuration in router/src/agents/control_flow/pattern-validator.ts
- [x] T024 [US1] Implement validation timeout with configurable limit (default 10ms) in router/src/agents/control_flow/pattern-validator.ts
- [x] T025 [US1] Implement createPatternValidator factory function in router/src/agents/control_flow/pattern-validator.ts
- [x] T026 [US1] Integrate pattern validation into TimeoutRegex constructor in router/src/agents/control_flow/timeout-regex.ts

**Checkpoint**: User Story 1 complete - patterns are validated before execution

---

## Phase 4: User Story 2 - Comprehensive Edge Case Testing (Priority: P1)

**Goal**: Comprehensive unit tests covering edge cases for cross-file mitigation tracking and regex timeout functionality

**Independent Test**: Run test suite and verify coverage of edge cases including timeout scenarios, cross-file tracking boundaries, and error conditions

### Tests for User Story 2

> Tests ARE the implementation for this story

- [x] T027 [P] [US2] Add tests for maximum call depth handling in router/tests/unit/agents/control_flow/cross-file-messages.test.ts
- [x] T028 [P] [US2] Add tests for circular reference detection (A→B→A) in router/tests/unit/agents/control_flow/cross-file-messages.test.ts
- [x] T029 [P] [US2] Add tests for multi-path mitigation scenarios in router/tests/unit/agents/control_flow/cross-file-messages.test.ts
- [x] T030 [P] [US2] Add tests for confidence reduction at depth limits in router/tests/unit/agents/control_flow/cross-file-messages.test.ts
- [x] T031 [P] [US2] Add tests for timeout triggering with controlled slow patterns in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [x] T032 [P] [US2] Add tests for resource cleanup after timeout in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [x] T033 [P] [US2] Add tests for consecutive timeout handling (stress test) in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [x] T034 [P] [US2] Add tests for error recovery and continuation in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [x] T035 [US2] Verify test coverage meets 80% threshold for modified files using vitest --coverage

**Checkpoint**: User Story 2 complete - comprehensive edge case test coverage achieved

---

## Phase 5: User Story 3 - Graceful Regex Error Handling (Priority: P2)

**Goal**: Handle regex errors gracefully without crashing the analysis workflow

**Independent Test**: Provide malformed regex patterns and verify the system continues operation with appropriate error reporting

### Tests for User Story 3

- [x] T036 [P] [US3] Add tests for regex compilation error handling in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [x] T037 [P] [US3] Add tests for cumulative error tracking in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [x] T038 [P] [US3] Add tests for error summary generation in router/tests/unit/agents/control_flow/regex-timeout.test.ts

### Implementation for User Story 3

- [x] T039 [US3] Enhance TimeoutRegex.test() to catch all runtime errors in router/src/agents/control_flow/timeout-regex.ts
- [x] T040 [US3] Enhance TimeoutRegex.exec() to catch all runtime errors in router/src/agents/control_flow/timeout-regex.ts
- [x] T041 [US3] Add ValidationError creation helper for consistent error objects in router/src/agents/control_flow/timeout-regex.ts
- [x] T042 [US3] Implement cumulative error tracking in MitigationDetector in router/src/agents/control_flow/mitigation-detector.ts
- [x] T043 [US3] Add getErrorSummary method to MitigationDetector in router/src/agents/control_flow/mitigation-detector.ts
- [x] T044 [US3] Integrate validation errors into FindingMetadata in router/src/agents/control_flow/finding-generator.ts

**Checkpoint**: User Story 3 complete - errors handled gracefully without crashing

---

## Phase 6: User Story 4 - Enhanced Logging for Auditing (Priority: P3)

**Goal**: Capture all pattern timeout and cross-file mitigation events with sufficient detail for audit

**Independent Test**: Enable verbose logging and verify all new log categories are correctly recorded and retrievable

### Tests for User Story 4

- [x] T045 [P] [US4] Add tests for pattern validation logging in router/tests/unit/agents/control_flow/logger.test.ts
- [x] T046 [P] [US4] Add tests for ReDoS detection warning logs in router/tests/unit/agents/control_flow/logger.test.ts
- [x] T047 [P] [US4] Add tests for log filtering by category in router/tests/unit/agents/control_flow/logger.test.ts
- [x] T048 [P] [US4] Add tests for structured log format verification in router/tests/unit/agents/control_flow/logger.test.ts

### Implementation for User Story 4

- [x] T049 [US4] Implement logPatternValidated method with full context in router/src/agents/control_flow/logger.ts
- [x] T050 [US4] Implement logPatternRejected method with rejection reasons in router/src/agents/control_flow/logger.ts
- [x] T051 [US4] Implement logRedosDetected method for ReDoS warnings in router/src/agents/control_flow/logger.ts
- [x] T052 [US4] Add correlation ID support to all security-relevant log entries in router/src/agents/control_flow/logger.ts
- [x] T053 [US4] Enhance logCrossFileMitigation with call chain summary in router/src/agents/control_flow/logger.ts
- [x] T054 [US4] Add log entry filtering and retrieval by category in router/src/agents/control_flow/logger.ts

**Checkpoint**: User Story 4 complete - comprehensive audit logging enabled

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T055 [P] Run ESLint with --max-warnings 0 and fix any violations
- [x] T056 [P] Run TypeScript strict mode check and fix any type errors
- [x] T057 [P] Run vitest --coverage and verify 80% coverage on all modified files
- [x] T058 Update existing integration tests if affected by changes in router/tests/integration/control_flow.test.ts
- [x] T059 Run full test suite and verify no regressions
- [x] T060 Validate quickstart.md instructions work correctly

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - US1 and US2 are both P1, can proceed in parallel
  - US3 (P2) and US4 (P3) can proceed after Foundational
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2 - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Phase 2 - Tests US1 components but doesn't block US1
- **User Story 3 (P2)**: Can start after Phase 2 - Builds on US1 validation infrastructure
- **User Story 4 (P3)**: Can start after Phase 2 - Independent logging enhancements

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Utility functions before class implementation
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks T002-T004 can run in parallel (different sections of types.ts)
- All Foundational tasks T006-T007 can run in parallel (different sections of logger.ts)
- All US1 tests T009-T016 can run in parallel (same file, different describe blocks)
- All US2 tests T027-T034 can run in parallel (cross different test files)
- All US3 tests T036-T038 can run in parallel
- All US4 tests T045-T048 can run in parallel

---

## Parallel Example: User Story 1 Tests

```bash
# Launch all US1 tests together:
Task: "Add tests for nested quantifier detection in pattern-validator.test.ts"
Task: "Add tests for overlapping alternation detection in pattern-validator.test.ts"
Task: "Add tests for star-height calculation in pattern-validator.test.ts"
Task: "Add tests for risk score computation in pattern-validator.test.ts"
Task: "Add tests for whitelist bypass functionality in pattern-validator.test.ts"
Task: "Add tests for validation timeout behavior in pattern-validator.test.ts"
Task: "Add tests for compilation error handling in pattern-validator.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T008)
3. Complete Phase 3: User Story 1 (T009-T026)
4. **STOP and VALIDATE**: Run pattern validation tests, verify ReDoS patterns rejected
5. Deploy/demo if ready - system now protects against ReDoS attacks

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → ReDoS protection MVP!
3. Add User Story 2 → Test independently → Comprehensive test coverage
4. Add User Story 3 → Test independently → Robust error handling
5. Add User Story 4 → Test independently → Audit-ready logging
6. Each story adds value without breaking previous stories

### Recommended Order (Single Developer)

P1 stories first, then P2, then P3:

1. Setup → Foundational → US1 → US2 → US3 → US4 → Polish

---

## Notes

- [P] tasks = different files or different sections, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (TDD approach)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Test coverage target: 80% for pattern-validator.ts, timeout-regex.ts, mitigation-detector.ts
