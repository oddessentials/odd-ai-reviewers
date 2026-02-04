# Tasks: OpenAI Model Compatibility

**Input**: Design documents from `/specs/001-openai-token-compat/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md

**Tests**: Unit tests are included as the feature involves critical error handling logic that requires verification.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Project**: `router/src/` for source, `router/tests/` for tests
- TypeScript 5.9.3 (ES2022 target, NodeNext modules)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the token compatibility module structure

- [ ] T001 Create token-compat.ts module file in router/src/agents/token-compat.ts
- [ ] T002 Add TokenLimitParam type definition in router/src/agents/token-compat.ts
- [ ] T003 Add buildPreferredTokenLimit() helper function in router/src/agents/token-compat.ts
- [ ] T004 Add buildFallbackTokenLimit() helper function in router/src/agents/token-compat.ts
- [ ] T005 Export all types and functions from router/src/agents/token-compat.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core error classification that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T006 Import OpenAI SDK error types in router/src/agents/token-compat.ts
- [ ] T007 Implement isTokenParamCompatibilityError() function that checks for OpenAI.BadRequestError AND message pattern matching (must include 'max_tokens', 'max_completion_tokens', and 'not supported') in router/src/agents/token-compat.ts
- [ ] T008 Add extractErrorMessage() helper for safe error message extraction in router/src/agents/token-compat.ts

**Checkpoint**: Error classification ready - user story implementation can begin

---

## Phase 3: User Story 1 - Modern Model Support (Priority: P1) 🎯 MVP

**Goal**: System uses `max_completion_tokens` as preferred parameter for o-series model compatibility

**Independent Test**: Configure an o-series model (o1, o3) and verify request succeeds on first attempt using `max_completion_tokens`

### Tests for User Story 1

- [ ] T009 [P] [US1] Create test file router/tests/unit/agents/token-compat.test.ts with Vitest setup
- [ ] T010 [P] [US1] Add test: buildPreferredTokenLimit returns { max_completion_tokens: N } in router/tests/unit/agents/token-compat.test.ts
- [ ] T011 [P] [US1] Add test: buildFallbackTokenLimit returns { max_tokens: N } in router/tests/unit/agents/token-compat.test.ts

### Implementation for User Story 1

- [ ] T012 [US1] Implement withTokenCompatibility() wrapper function (attempt 1 only - no retry yet) in router/src/agents/token-compat.ts
- [ ] T013 [US1] Update runWithOpenAI() in router/src/agents/opencode.ts to use withTokenCompatibility() with max_completion_tokens
- [ ] T014 [P] [US1] Update OpenAI call in router/src/agents/pr_agent.ts to use withTokenCompatibility()
- [ ] T015 [P] [US1] Update OpenAI call in router/src/agents/ai_semantic_review.ts to use withTokenCompatibility()

**Checkpoint**: Modern o-series models work with max_completion_tokens on first attempt

---

## Phase 4: User Story 2 - Legacy Model Compatibility (Priority: P2)

**Goal**: System falls back to `max_tokens` when compatibility error detected

**Independent Test**: Mock a BadRequestError with token compat message, verify single retry with `max_tokens` succeeds

### Tests for User Story 2

- [ ] T016 [P] [US2] Add test: isTokenParamCompatibilityError returns true for OpenAI BadRequestError with both parameter names and "not supported" in message in router/tests/unit/agents/token-compat.test.ts
- [ ] T017 [P] [US2] Add test: isTokenParamCompatibilityError returns false for network errors in router/tests/unit/agents/token-compat.test.ts
- [ ] T018 [P] [US2] Add test: isTokenParamCompatibilityError returns false for auth errors in router/tests/unit/agents/token-compat.test.ts
- [ ] T019 [P] [US2] Add test: isTokenParamCompatibilityError returns false for rate limit errors in router/tests/unit/agents/token-compat.test.ts
- [ ] T020 [P] [US2] Add test: isTokenParamCompatibilityError returns false for generic 400 errors without token params in message in router/tests/unit/agents/token-compat.test.ts
- [ ] T021 [US2] Add test: withTokenCompatibility retries once with max_tokens on compatibility error in router/tests/unit/agents/token-compat.test.ts

### Implementation for User Story 2

- [ ] T022 [US2] Extend withTokenCompatibility() to catch errors and check isTokenParamCompatibilityError() in router/src/agents/token-compat.ts
- [ ] T023 [US2] Add single retry with buildFallbackTokenLimit() when compatibility error detected in router/src/agents/token-compat.ts
- [ ] T024 [US2] Ensure non-compatibility errors are thrown immediately without retry in router/src/agents/token-compat.ts

**Checkpoint**: Legacy models work via automatic fallback to max_tokens

---

## Phase 5: User Story 3 - Deterministic Retry Behavior (Priority: P2)

**Goal**: Exactly one retry maximum, only for token parameter compatibility errors

**Independent Test**: Verify retry count is bounded and only triggers for specific error patterns

### Tests for User Story 3

- [ ] T025 [P] [US3] Add test: withTokenCompatibility performs exactly one retry on compat error (not zero, not two) in router/tests/unit/agents/token-compat.test.ts
- [ ] T026 [P] [US3] Add test: withTokenCompatibility surfaces second error when both attempts fail in router/tests/unit/agents/token-compat.test.ts
- [ ] T027 [US3] Add test: retry request is identical except for token limit parameter key swap (FR-013) in router/tests/unit/agents/token-compat.test.ts

### Implementation for User Story 3

- [ ] T028 [US3] Verify retry logic is bounded to single attempt in withTokenCompatibility() in router/src/agents/token-compat.ts
- [ ] T029 [US3] Ensure retry request preserves all parameters except token limit key in router/src/agents/token-compat.ts
- [ ] T030 [US3] Add context to error when fallback retry also fails in router/src/agents/token-compat.ts

**Checkpoint**: Retry behavior is deterministic and bounded

---

## Phase 6: User Story 4 - Configurable Token Limits (Priority: P3)

**Goal**: Users can configure the token limit via .ai-review.yml

**Independent Test**: Set custom max_completion_tokens in config, verify it's used in API requests

### Tests for User Story 4

- [ ] T031 [P] [US4] Add test: LimitsSchema accepts optional max_completion_tokens field in router/tests/unit/config/schemas.test.ts
- [ ] T032 [P] [US4] Add test: LimitsSchema uses default 4000 when max_completion_tokens not specified in router/tests/unit/config/schemas.test.ts
- [ ] T033 [P] [US4] Add test: LimitsSchema validates min 16 for max_completion_tokens in router/tests/unit/config/schemas.test.ts
- [ ] T034 [P] [US4] Add test: LimitsSchema rejects negative max_completion_tokens in router/tests/unit/config/schemas.test.ts

### Implementation for User Story 4

- [ ] T035 [US4] Add max_completion_tokens field to LimitsSchema with z.number().int().min(16).optional().default(4000) in router/src/config/schemas.ts (Zod validates at config parse time, satisfying SC-004 startup validation)
- [ ] T036 [US4] Update opencode.ts to read token limit from context.config.limits.max_completion_tokens in router/src/agents/opencode.ts
- [ ] T037 [P] [US4] Update pr_agent.ts to read token limit from config in router/src/agents/pr_agent.ts
- [ ] T038 [P] [US4] Update ai_semantic_review.ts to read token limit from config in router/src/agents/ai_semantic_review.ts

**Checkpoint**: Token limits are configurable via .ai-review.yml

---

## Phase 7: User Story 5 - Clear Diagnostics (Priority: P3)

**Goal**: Warning-level logs when fallback engages, no sensitive data

**Independent Test**: Trigger fallback, verify log contains model name and parameter used, no API keys or payloads

### Tests for User Story 5

- [ ] T039 [P] [US5] Add test: withTokenCompatibility logs at warn level when fallback engages in router/tests/unit/agents/token-compat.test.ts
- [ ] T040 [P] [US5] Add test: log message includes model name in router/tests/unit/agents/token-compat.test.ts
- [ ] T041 [P] [US5] Add test: log message includes which parameter was used in router/tests/unit/agents/token-compat.test.ts
- [ ] T042 [US5] Add test: log message does NOT include API key or token limit value in router/tests/unit/agents/token-compat.test.ts

### Implementation for User Story 5

- [ ] T043 [US5] Add console.warn() call when fallback retry is triggered in withTokenCompatibility() in router/src/agents/token-compat.ts
- [ ] T044 [US5] Format log message as "[token-compat] Fallback engaged: model={modelName}, retrying with max_tokens (was max_completion_tokens)" in router/src/agents/token-compat.ts
- [ ] T045 [US5] Verify no sensitive data (API keys, payloads, token values) in log output in router/src/agents/token-compat.ts

**Checkpoint**: Fallback events are logged with diagnostic info, no sensitive data

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T046 Run pnpm lint --max-warnings 0 to verify zero lint warnings
- [ ] T047 Run pnpm typecheck to verify TypeScript compilation
- [ ] T048 Run pnpm test to verify all tests pass with 65% coverage
- [ ] T049 Verify no circular dependencies with pnpm depcruise
- [ ] T050 [P] Update quickstart.md with final implementation details in specs/001-openai-token-compat/quickstart.md
- [ ] T051 Run full test suite against mock OpenAI responses

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational - MVP milestone
- **User Story 2 (Phase 4)**: Depends on Foundational; builds on US1's withTokenCompatibility()
- **User Story 3 (Phase 5)**: Depends on Foundational; refines US2's retry logic
- **User Story 4 (Phase 6)**: Depends on Foundational; independent of US2/US3
- **User Story 5 (Phase 7)**: Depends on Foundational; builds on US2's fallback mechanism
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

```
Foundational (Phase 2) ──┬──► US1 (Modern Support) ──► US2 (Legacy Compat) ──► US3 (Retry Behavior)
                         │                                                            │
                         │                                                            ▼
                         ├──► US4 (Config) ─────────────────────────────────────► US5 (Logging)
                         │                                                            │
                         └────────────────────────────────────────────────────────────┘
```

**Note**: US1→US2→US3 form a dependency chain (fallback builds on preferred, retry builds on fallback). US4 (Config) and US5 (Logging) are independent but US5 logging requires fallback to exist.

### Within Each User Story

1. Tests MUST be written and FAIL before implementation
2. Core logic before integration with agent files
3. Verify tests PASS after implementation

### Parallel Opportunities

**Within Setup (Phase 1)**:

- T001-T005 are sequential (same file)

**Within Foundational (Phase 2)**:

- T006-T008 are sequential (same file, building on each other)

**Within User Story 1**:

- T009, T010, T011 can run in parallel (independent test cases)
- T014, T015 can run in parallel (different agent files)

**Within User Story 2**:

- T016, T017, T018, T019, T020 can run in parallel (independent test cases)

**Within User Story 3**:

- T025, T026 can run in parallel (independent test cases)

**Within User Story 4**:

- T031, T032, T033, T034 can run in parallel (independent test cases)
- T037, T038 can run in parallel (different agent files)

**Within User Story 5**:

- T039, T040, T041 can run in parallel (independent test cases)

---

## Parallel Example: User Story 2 Tests

```bash
# Launch all error classification tests together:
Task: "Add test: isTokenParamCompatibilityError returns true for BadRequestError with token params"
Task: "Add test: isTokenParamCompatibilityError returns false for network errors"
Task: "Add test: isTokenParamCompatibilityError returns false for auth errors"
Task: "Add test: isTokenParamCompatibilityError returns false for rate limit errors"
Task: "Add test: isTokenParamCompatibilityError returns false for generic 400 errors"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T005)
2. Complete Phase 2: Foundational (T006-T008)
3. Complete Phase 3: User Story 1 (T009-T015)
4. **STOP and VALIDATE**: Modern o-series models work
5. Deploy if critical fix needed

### Full Implementation

1. Setup + Foundational → Core infrastructure ready
2. US1 → Modern models work (MVP!)
3. US2 → Legacy fallback works
4. US3 → Retry behavior is deterministic
5. US4 → Token limits configurable
6. US5 → Diagnostic logging complete
7. Polish → All quality gates pass

### Incremental Testing

After each user story:

- Run `pnpm test router/tests/unit/agents/token-compat.test.ts`
- Verify new tests pass
- Verify no regression in previous tests

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story builds incrementally on previous work
- US1 is the MVP - modern models will work after completing it
- US2 adds backward compatibility
- US3 ensures enterprise-grade determinism
- US4 (Config) is independent of other stories
- US5 (Logging) requires US2's fallback mechanism to exist for testing, but can be implemented in parallel
- Commit after each task or logical group
- All tests use Vitest 4.x patterns
