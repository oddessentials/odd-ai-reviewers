# Tasks: Control Flow Analysis Hardening

**Input**: Design documents from `/specs/004-control-flow-hardening/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not explicitly requested - test tasks are included as part of implementation validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Project type**: Single project (router workspace)
- **Source**: `router/src/agents/control_flow/`
- **Tests**: `router/tests/unit/agents/control_flow/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Extend existing type schemas and prepare configuration

- [ ] T001 Add CallChainEntrySchema to router/src/agents/control_flow/types.ts
- [ ] T002 Add PatternEvaluationResultSchema to router/src/agents/control_flow/types.ts
- [ ] T003 Add CrossFileMitigationInfoSchema and PatternTimeoutInfoSchema to router/src/agents/control_flow/types.ts
- [ ] T004 Extend MitigationInstanceSchema with optional callChain and discoveryDepth fields in router/src/agents/control_flow/types.ts
- [ ] T005 Extend FindingMetadataSchema with optional crossFileMitigations and patternTimeouts fields in router/src/agents/control_flow/types.ts
- [ ] T006 Add patternTimeoutMs field to ControlFlowConfigSchema in router/src/config/mitigation-config.ts

**Checkpoint**: All schema extensions complete - feature implementation can begin

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T007 Create TimeoutRegex utility class for pattern evaluation with timeout in router/src/agents/control_flow/timeout-regex.ts
- [ ] T008 Add input length validation helper (max 10KB) in router/src/agents/control_flow/timeout-regex.ts
- [ ] T009 Implement time tracking using process.hrtime.bigint() in router/src/agents/control_flow/timeout-regex.ts
- [ ] T010 Add new log categories (pattern_timeout, cross_file, call_chain) to router/src/agents/control_flow/logger.ts

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Protected Analysis from Malicious Patterns (Priority: P1) 🎯 MVP

**Goal**: Prevent denial-of-service from malicious or slow regex patterns in custom mitigation configurations

**Independent Test**: Configure intentionally problematic regex patterns and verify the system handles them gracefully without hanging

### Implementation for User Story 1

- [ ] T011 [US1] Integrate TimeoutRegex into pattern evaluation in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T012 [US1] Add timeout handling logic that treats timed-out patterns as non-matching in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T013 [US1] Return PatternEvaluationResult with timedOut flag from pattern evaluation in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T014 [US1] Collect pattern timeout info during analysis for finding metadata in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T015 [US1] Add pattern timeout indicator to finding messages in router/src/agents/control_flow/finding-generator.ts
- [ ] T016 [US1] Validate patternTimeoutMs config bounds (10-1000ms) in router/src/config/mitigation-config.ts
- [ ] T017 [P] [US1] Create unit tests for regex timeout behavior in router/tests/unit/agents/control_flow/regex-timeout.test.ts
- [ ] T018 [US1] Add integration test for analysis continuing after pattern timeout in router/tests/unit/agents/control_flow/regex-timeout.test.ts

**Checkpoint**: User Story 1 complete - analysis resilient to malicious patterns

---

## Phase 4: User Story 2 - Transparent Cross-File Mitigation Reporting (Priority: P1)

**Goal**: Explicitly indicate when mitigations are found in different files than vulnerabilities

**Independent Test**: Submit code where a vulnerability in file A is mitigated by validation in file B, and verify feedback explicitly mentions the cross-file relationship

### Implementation for User Story 2

- [ ] T019 [US2] Populate callChain field when detecting cross-file mitigations in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T020 [US2] Populate discoveryDepth field based on call chain length in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T021 [US2] Build CrossFileMitigationInfo objects for findings in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T022 [US2] Enhance finding message generator to include cross-file mitigation details in router/src/agents/control_flow/finding-generator.ts
- [ ] T023 [US2] Format mitigation list with file:line and depth info in finding messages in router/src/agents/control_flow/finding-generator.ts
- [ ] T024 [US2] Handle multiple cross-file mitigations in finding message formatting in router/src/agents/control_flow/finding-generator.ts
- [ ] T025 [US2] Format partial mitigation messages to show which paths protected by which mitigations in router/src/agents/control_flow/finding-generator.ts
- [ ] T026 [P] [US2] Create unit tests for cross-file message formatting in router/tests/unit/agents/control_flow/cross-file-messages.test.ts
- [ ] T027 [US2] Add integration test for cross-file mitigation detection in router/tests/unit/agents/control_flow/cross-file-messages.test.ts

**Checkpoint**: User Story 2 complete - cross-file mitigations fully transparent

---

## Phase 5: User Story 3 - Audit Trail for Pattern Evaluation (Priority: P2)

**Goal**: Provide detailed logging for debugging pattern configuration issues

**Independent Test**: Run analysis with verbose logging enabled and verify pattern evaluation details are captured

### Implementation for User Story 3

- [ ] T028 [US3] Add pattern timeout logging with pattern ID, input length, elapsed time in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T029 [US3] Add cross-file mitigation detection logging with source and target files in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T030 [US3] Add call chain traversal logging for verbose mode in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T031 [US3] Log pattern evaluation result (match/no-match/timeout) for each pattern in router/src/agents/control_flow/mitigation-detector.ts
- [ ] T032 [P] [US3] Add unit tests for logging output in router/tests/unit/agents/control_flow/logger.test.ts

**Checkpoint**: User Story 3 complete - full audit trail available for debugging

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validation and documentation updates

- [ ] T033 Verify all validation helpers work correctly (validateCallChain, validateDepthConsistency)
- [ ] T034 Run full test suite to verify no regressions in router/tests/
- [ ] T035 Run quickstart.md validation scenarios manually
- [ ] T036 Update CLAUDE.md if new patterns introduced

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (both P1 priority)
  - US3 can start after Foundational but benefits from US1 timeout infrastructure
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Uses logging infrastructure from Foundational

### Within Each User Story

- Schema changes (Phase 1) before implementation
- Core logic before message formatting
- Implementation before tests
- Story complete before moving to next priority

### Parallel Opportunities

- T017, T026, T032 are [P] tasks that can run in parallel with their story's implementation
- US1 and US2 can be developed in parallel after Foundational phase
- All Phase 1 schema tasks can be done in a single session (same file)

---

## Parallel Example: User Stories 1 & 2

```bash
# After Foundational phase completes, both P1 stories can start in parallel:

# Developer A: User Story 1 (Regex Timeout)
Task: T011 - Integrate TimeoutRegex into mitigation-detector.ts
Task: T015 - Add timeout indicator to finding-generator.ts

# Developer B: User Story 2 (Cross-File Transparency)
Task: T019 - Populate callChain in mitigation-detector.ts
Task: T022 - Enhance finding messages in finding-generator.ts
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (schema extensions)
2. Complete Phase 2: Foundational (TimeoutRegex utility)
3. Complete Phase 3: User Story 1 (timeout protection)
4. **STOP and VALIDATE**: Test with malicious regex patterns
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test timeout protection → Deploy/Demo (MVP!)
3. Add User Story 2 → Test cross-file reporting → Deploy/Demo
4. Add User Story 3 → Test logging → Deploy/Demo
5. Each story adds value without breaking previous stories

### Recommended Order

Since US1 and US2 are both P1 priority and share mitigation-detector.ts:

1. **Best approach**: Implement them together in the same PR
2. **Alternative**: US1 first (simpler), then US2 builds on it
3. US3 (P2) can wait for a separate PR

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All schema extensions are additive (optional fields) for backward compatibility
- Pattern timeout default: 100ms, range: 10-1000ms
- Cross-file mitigations use existing SourceLocation.file field
- Logging uses existing AnalysisLogger infrastructure with new categories
