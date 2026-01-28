# Tasks: Control Flow Analysis & Mitigation Recognition

**Input**: Design documents from `/specs/001-control-flow-analysis/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Unit and integration tests are included as the spec requires a test suite of 500+ cases (AG-002) and determinism verification (AG-004).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md, this project uses:

- **Source**: `router/src/agents/control_flow/`
- **Tests**: `router/tests/unit/agents/control_flow/` and `router/tests/integration/`
- **Config**: `router/src/config/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependencies, and module structure

- [x] T001 Add `typescript` dependency (^5.x) to router/package.json for AST parsing
- [x] T002 [P] Create control_flow agent directory structure at router/src/agents/control_flow/
- [x] T003 [P] Create unit test directory at router/tests/unit/agents/control_flow/
- [x] T004 [P] Copy type contracts from specs/001-control-flow-analysis/contracts/control-flow-types.ts to router/src/agents/control_flow/types.ts
- [x] T005 Add `control_flow` to AgentSchema enum in router/src/config/schemas.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Implement AnalysisBudget class with time/size tracking in router/src/agents/control_flow/budget.ts
- [x] T007 [P] Implement CFG node and edge data structures in router/src/agents/control_flow/cfg-types.ts
- [x] T008 [P] Implement base CFG builder that parses TypeScript AST using ts.createSourceFile() in router/src/agents/control_flow/cfg-builder.ts
- [x] T009 Implement CFG construction for basic blocks (sequential statements) in router/src/agents/control_flow/cfg-builder.ts
- [x] T010 Implement CFG construction for conditionals (if/else, switch) in router/src/agents/control_flow/cfg-builder.ts
- [x] T011 Implement CFG construction for loops (for, while, do-while, for-of, for-in) in router/src/agents/control_flow/cfg-builder.ts
- [x] T012 Implement CFG construction for try/catch/finally blocks in router/src/agents/control_flow/cfg-builder.ts
- [x] T013 Implement CFG construction for early returns and throws in router/src/agents/control_flow/cfg-builder.ts
- [x] T014 [P] Create unit tests for CFG builder covering all control structures in router/tests/unit/agents/control_flow/cfg-builder.test.ts
- [x] T015 Implement ControlFlowAgent class implementing ReviewAgent interface in router/src/agents/control_flow/index.ts
- [x] T016 Register control_flow agent in router/src/agents/index.ts

**Checkpoint**: Foundation ready - CFG can be built for any TypeScript/JavaScript function

---

## Phase 3: User Story 1 - Mitigation Recognition (Priority: P1) 🎯 MVP

**Goal**: Recognize existing mitigations and suppress findings when code is already protected

**Independent Test**: Submit code with known mitigations (input sanitization, null checks, auth checks) and verify no false positive warnings

### Tests for User Story 1

- [x] T017 [P] [US1] Create test fixtures with sanitized input patterns in router/tests/unit/agents/control_flow/fixtures/mitigated-input.ts
- [x] T018 [P] [US1] Create test fixtures with null check patterns in router/tests/unit/agents/control_flow/fixtures/mitigated-null.ts
- [x] T019 [P] [US1] Create test fixtures with auth check patterns in router/tests/unit/agents/control_flow/fixtures/mitigated-auth.ts
- [x] T020 [P] [US1] Unit tests for mitigation detector in router/tests/unit/agents/control_flow/mitigation-detector.test.ts

### Implementation for User Story 1

- [x] T021 [P] [US1] Define built-in mitigation patterns for input validation (zod, validator, joi) in router/src/agents/control_flow/mitigation-patterns.ts
- [x] T022 [P] [US1] Define built-in mitigation patterns for null safety (optional chaining, nullish coalescing, if-checks) in router/src/agents/control_flow/mitigation-patterns.ts
- [x] T023 [P] [US1] Define built-in mitigation patterns for auth checks (passport, jwt.verify, session) in router/src/agents/control_flow/mitigation-patterns.ts
- [x] T024 [P] [US1] Define built-in mitigation patterns for output encoding (encodeURI, DOMPurify, escape) in router/src/agents/control_flow/mitigation-patterns.ts
- [x] T025 [US1] Implement MitigationDetector class that matches AST nodes against patterns in router/src/agents/control_flow/mitigation-detector.ts
- [x] T026 [US1] Implement mitigation-to-vulnerability-type mapping per FR-006 in router/src/agents/control_flow/mitigation-detector.ts
- [x] T027 [US1] Implement MitigationInstance tracking with scope (block/function/module) in router/src/agents/control_flow/mitigation-detector.ts
- [x] T028 [US1] Integrate mitigation detection into CFG nodes during graph construction in router/src/agents/control_flow/index.ts
- [x] T029 [US1] Implement path coverage analysis to verify ALL paths are mitigated per FR-007 in router/src/agents/control_flow/path-analyzer.ts
- [x] T030 [US1] Implement finding suppression when full mitigation coverage proven in router/src/agents/control_flow/finding-generator.ts

**Checkpoint**: User Story 1 complete - tool recognizes mitigations and suppresses false positives

---

## Phase 4: User Story 2 - Control Flow-Aware Analysis (Priority: P1)

**Goal**: Understand control flow to only flag issues on reachable execution paths

**Independent Test**: Submit code with early returns and conditionals; verify only reachable paths are flagged

### Tests for User Story 2

- [x] T031 [P] [US2] Create test fixtures with early return patterns in router/tests/unit/agents/control_flow/fixtures/early-return.ts
- [x] T032 [P] [US2] Create test fixtures with conditional guard patterns in router/tests/unit/agents/control_flow/fixtures/conditional-guard.ts
- [x] T033 [P] [US2] Create test fixtures with exception handling patterns in router/tests/unit/agents/control_flow/fixtures/exception-handling.ts
- [x] T034 [P] [US2] Unit tests for path analyzer in router/tests/unit/agents/control_flow/path-analyzer.test.ts

### Implementation for User Story 2

- [x] T035 [US2] Implement reachability analysis from entry to each node in router/src/agents/control_flow/path-analyzer.ts
- [x] T036 [US2] Implement dead code detection (unreachable after return/throw) in router/src/agents/control_flow/path-analyzer.ts
- [x] T037 [US2] Implement conditional state tracking (variable constraints after branches) in router/src/agents/control_flow/path-analyzer.ts
- [x] T038 [US2] Implement inter-procedural analysis with bounded call depth per FR-003 in router/src/agents/control_flow/path-analyzer.ts
- [x] T039 [US2] Implement call site resolution for function calls in router/src/agents/control_flow/path-analyzer.ts
- [x] T040 [US2] Implement conservative fallback when depth limit reached per FR-004 in router/src/agents/control_flow/path-analyzer.ts
- [x] T041 [US2] Integrate reachability into finding generation - skip unreachable sinks in router/src/agents/control_flow/finding-generator.ts

**Checkpoint**: User Story 2 complete - only reachable paths generate findings

---

## Phase 5: User Story 3 - Contextual Feedback with Reasoning (Priority: P2)

**Goal**: Provide clear explanations of control flow analysis and mitigation status in findings

**Independent Test**: Verify finding output includes path information and mitigation reasoning

### Tests for User Story 3

- [x] T042 [P] [US3] Unit tests for finding generator message formatting in router/tests/unit/agents/control_flow/finding-generator.test.ts
- [x] T043 [P] [US3] Create test fixtures with partial mitigation scenarios in router/tests/unit/agents/control_flow/fixtures/partial-mitigation.ts

### Implementation for User Story 3

- [x] T044 [US3] Implement execution path serialization for finding messages in router/src/agents/control_flow/finding-generator.ts
- [x] T045 [US3] Implement partial mitigation message template per FR-010 in router/src/agents/control_flow/finding-generator.ts
- [x] T046 [US3] Implement severity downgrade logic (Critical→High→Medium→Low) per FR-009 in router/src/agents/control_flow/finding-generator.ts
- [x] T047 [US3] Implement unprotected path listing in finding metadata in router/src/agents/control_flow/finding-generator.ts
- [x] T048 [US3] Implement fingerprint generation for stable dedup per research.md algorithm in router/src/agents/control_flow/finding-generator.ts
- [x] T049 [US3] Add analysis decision logging per FR-013 in router/src/agents/control_flow/logger.ts

**Checkpoint**: User Story 3 complete - findings include clear reasoning and path information

---

## Phase 6: User Story 4 - Configurable Mitigation Patterns (Priority: P3)

**Goal**: Allow security teams to define custom mitigation patterns

**Independent Test**: Configure a custom pattern and verify it is recognized during analysis

### Tests for User Story 4

- [x] T050 [P] [US4] Unit tests for custom pattern validation in router/tests/unit/agents/control_flow/mitigation-config.test.ts
- [x] T051 [P] [US4] Create test fixture with custom company sanitizer in router/tests/unit/agents/control_flow/fixtures/custom-pattern.ts

### Implementation for User Story 4

- [x] T052 [US4] Implement mitigation config parser using Zod schemas in router/src/config/mitigation-config.ts
- [x] T053 [US4] Implement pattern validation ensuring declarative/side-effect-free per FR-015 in router/src/config/mitigation-config.ts
- [x] T054 [US4] Implement pattern override support (confidence, deprecated) in router/src/config/mitigation-config.ts
- [x] T055 [US4] Implement pattern disable list support in router/src/config/mitigation-config.ts
- [x] T056 [US4] Integrate custom patterns into MitigationDetector in router/src/agents/control_flow/mitigation-detector.ts
- [x] T057 [US4] Add pattern evaluation logging per FR-017 in router/src/agents/control_flow/mitigation-detector.ts
- [x] T058 [US4] Add control_flow config section to main config schema in router/src/config/schemas.ts

**Checkpoint**: User Story 4 complete - custom patterns can be configured and recognized

---

## Phase 7: User Story 5 - Graceful Degradation Under Limits (Priority: P2)

**Goal**: Predictable behavior when analysis exceeds time/size limits

**Independent Test**: Submit a PR exceeding limits and verify deterministic degraded results

### Tests for User Story 5

- [x] T059 [P] [US5] Unit tests for budget enforcement in router/tests/unit/agents/control_flow/budget.test.ts
- [x] T060 [P] [US5] Create test fixture simulating large codebase in router/tests/unit/agents/control_flow/fixtures/large-codebase.ts

### Implementation for User Story 5

- [x] T061 [US5] Implement time budget checking with 80% warning threshold in router/src/agents/control_flow/budget.ts
- [x] T062 [US5] Implement size budget checking (lines analyzed) in router/src/agents/control_flow/budget.ts
- [x] T063 [US5] Implement degraded mode (reduce call depth to 3, skip low-priority files) per FR-020 in router/src/agents/control_flow/budget.ts
- [x] T064 [US5] Implement graceful termination at 100% budget per FR-021 in router/src/agents/control_flow/budget.ts
- [x] T065 [US5] Add degraded indicator to finding metadata in router/src/agents/control_flow/finding-generator.ts
- [x] T066 [US5] Integrate budget checks into main analysis loop in router/src/agents/control_flow/index.ts

**Checkpoint**: User Story 5 complete - analysis degrades predictably under resource pressure

---

## Phase 8: Async Boundary Handling (Edge Cases)

**Purpose**: Handle async/await patterns per FR-022 and FR-023

- [x] T067 [P] Create test fixtures for async/await patterns in router/tests/unit/agents/control_flow/fixtures/async-patterns.ts
- [x] T068 Implement CFG construction for async/await expressions in router/src/agents/control_flow/cfg-builder.ts
- [x] T069 Implement intra-function async mitigation tracking per FR-022 in router/src/agents/control_flow/path-analyzer.ts
- [x] T070 Implement conservative fallback for cross-function async per FR-023 in router/src/agents/control_flow/path-analyzer.ts
- [x] T071 Unit tests for async boundary handling in router/tests/unit/agents/control_flow/async-handling.test.ts

---

## Phase 9: Integration & Polish

**Purpose**: End-to-end testing, documentation, and quality assurance

- [x] T072 Create integration test suite for full agent execution in router/tests/integration/control_flow.test.ts
- [x] T073 [P] Add determinism test (same input → same output × 100 runs) per AG-004 in router/tests/integration/control_flow-determinism.test.ts
- [x] T074 [P] Create benchmark test corpus for performance validation per AG-003 in router/tests/integration/control_flow-benchmark.test.ts
- [x] T075 [P] Add JSDoc documentation to all public APIs in router/src/agents/control_flow/\*.ts
- [x] T076 Run ESLint with --max-warnings 0 on all new files
- [x] T077 Run dependency-cruiser to verify no circular dependencies
- [x] T078 Validate quickstart.md examples work correctly
- [x] T079 Update router README with control_flow agent documentation (skipped - no router README exists)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories 1-2 (P1)**: Depend on Foundational; can run in parallel
- **User Story 3 (P2)**: Depends on US1 and US2 (needs findings to annotate)
- **User Story 4 (P3)**: Depends on US1 (extends mitigation detection)
- **User Story 5 (P2)**: Depends on Foundational; can run parallel to US1-4
- **Async Handling (Phase 8)**: Depends on US2 (extends path analysis)
- **Integration (Phase 9)**: Depends on all user stories

### User Story Dependencies

```
Foundational (Phase 2)
        │
        ├── US1: Mitigation Recognition ──┬── US3: Contextual Feedback
        │                                 │
        ├── US2: Control Flow Analysis ───┘
        │
        ├── US5: Graceful Degradation (parallel)
        │
        └── US4: Custom Patterns (after US1)
```

### Parallel Opportunities

**Within Phase 1 (Setup)**:

- T002, T003, T004 can run in parallel

**Within Phase 2 (Foundational)**:

- T007, T008 can run in parallel
- T014 can run after T008-T013

**Within User Story 1**:

- T017-T020 (tests) can run in parallel
- T021-T024 (patterns) can run in parallel

**Within User Story 2**:

- T031-T034 (tests) can run in parallel

**Across User Stories**:

- US1 and US2 can run in parallel after Foundational
- US5 can run in parallel with US1-US4

---

## Parallel Example: User Story 1

```bash
# Launch all test fixtures in parallel:
Task: "Create test fixtures with sanitized input patterns in router/tests/unit/agents/control_flow/fixtures/mitigated-input.ts"
Task: "Create test fixtures with null check patterns in router/tests/unit/agents/control_flow/fixtures/mitigated-null.ts"
Task: "Create test fixtures with auth check patterns in router/tests/unit/agents/control_flow/fixtures/mitigated-auth.ts"

# Launch all pattern definitions in parallel:
Task: "Define built-in mitigation patterns for input validation in router/src/agents/control_flow/mitigation-patterns.ts"
Task: "Define built-in mitigation patterns for null safety in router/src/agents/control_flow/mitigation-patterns.ts"
Task: "Define built-in mitigation patterns for auth checks in router/src/agents/control_flow/mitigation-patterns.ts"
Task: "Define built-in mitigation patterns for output encoding in router/src/agents/control_flow/mitigation-patterns.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CFG builder)
3. Complete Phase 3: User Story 1 (Mitigation Recognition)
4. Complete Phase 4: User Story 2 (Control Flow Analysis)
5. **STOP and VALIDATE**: Test with real PRs containing mitigations
6. Deploy for beta testing with enterprise customer

### Incremental Delivery

1. Setup + Foundational → CFG infrastructure ready
2. Add US1 + US2 → Core false positive reduction (MVP)
3. Add US3 → Better developer experience with reasoning
4. Add US5 → Enterprise-ready with graceful degradation
5. Add US4 → Full customization for enterprise customers

### Acceptance Gate Mapping

| Gate                              | Task Coverage   |
| --------------------------------- | --------------- |
| AG-001 (60% FP reduction)         | US1 + US2       |
| AG-002 (90% mitigation detection) | US1 (T017-T030) |
| AG-003 (99% within budget)        | US5 (T059-T066) |
| AG-004 (deterministic)            | T073            |
| AG-005 (custom patterns)          | US4 (T050-T058) |

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently testable after completion
- Tests are written first but implementation follows TDD approach
- Commit after each task or logical group
- US1 and US2 together form the MVP - stop there for initial validation
