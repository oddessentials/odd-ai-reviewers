# Tasks: New Model Compatibility (Opus 4.6 & GPT-5.3-Codex)

**Input**: Design documents from `/specs/001-new-model-compat/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Test tasks are included because the feature modifies validation logic with differentiated error paths that must be regression-tested.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `router/src/` for source, `router/src/__tests__/` for tests
- All paths relative to repository root

---

## Phase 1: Setup

**Purpose**: No project initialization needed — all changes are edits to existing files. This phase creates the shared building block used by multiple user stories.

- [x] T001 Add `isCodexFamilyModel()` exported function to `router/src/config/providers.ts` that tests a model string against `/codex/i` and returns boolean. Place it after the existing `isCompletionsOnlyModel()` function. Add JSDoc explaining this identifies Codex-family models (a subset of completions-only) for differentiated error messaging. Export it from `router/src/config.ts` barrel if one exists.

**Checkpoint**: New classifier function available for use by preflight validation and tests.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No foundational/blocking work needed. `isCodexFamilyModel()` from Phase 1 is the only shared dependency across user stories, and it is complete after T001.

---

## Phase 3: User Story 1 — Use Claude Opus 4.6 for Code Reviews (Priority: P1) MVP

**Goal**: Verify Opus 4.6 works seamlessly and update all error message model suggestions to include `claude-opus-4-6` as an Anthropic option.

**Independent Test**: Set `MODEL=claude-opus-4-6` with `ANTHROPIC_API_KEY` and run preflight — passes without error. Trigger provider-model mismatch errors and verify `claude-opus-4-6` appears in suggestions.

### Implementation for User Story 1

- [x] T002 [P] [US1] In `router/src/preflight.ts` function `validateModelProviderMatch()` (~line 425), update the Ollama-model-with-cloud-agents error message: change `MODEL=claude-sonnet-4-20250514` to `MODEL=claude-opus-4-6` in the Anthropic suggestion line
- [x] T003 [P] [US1] In `router/src/preflight.ts` function `validateProviderModelCompatibility()` (~line 509), update the Anthropic-key-with-GPT-model mismatch error: change `MODEL=claude-sonnet-4-20250514` to `MODEL=claude-opus-4-6` in fix option 1
- [x] T004 [P] [US1] In `router/src/config/zero-config.ts` function `getDefaultModelForProvider()` (~line 219), add a comment on the `'anthropic'` case: `// Also available: claude-opus-4-6 (set MODEL explicitly to use)` — do NOT change the return value (default stays `claude-sonnet-4-20250514`)
- [x] T005 [P] [US1] In `router/src/cli/config-wizard.ts` function `generateConfigYaml()` (~line 216), update the Anthropic provider comment from `# Default model: claude-sonnet-4-20250514 (auto-applied if MODEL not set)` to `# Default model: claude-sonnet-4-20250514 (auto-applied if MODEL not set). Also available: claude-opus-4-6`
- [x] T006 [P] [US1] In `router/src/cli/config-wizard.ts` constant `AVAILABLE_PROVIDERS` (~line 256), update the Anthropic description from `'Claude Sonnet, Claude Opus (default: claude-sonnet-4)'` to `'Claude Opus 4.6, Claude Sonnet 4 (default: claude-sonnet-4)'`
- [x] T007 [US1] In `router/src/__tests__/preflight.test.ts`, find the test that asserts the Ollama-model error contains `'claude-sonnet-4-20250514'` and update it to assert `'claude-opus-4-6'`. Find the test that asserts the provider-model mismatch error contains `'claude-sonnet-4-20250514'` and update it to assert `'claude-opus-4-6'`. Run `pnpm run test` from `router/` to verify all tests pass.

**Checkpoint**: Opus 4.6 passes preflight validation. All error messages suggesting Anthropic models now include `claude-opus-4-6`. Tests pass.

---

## Phase 4: User Story 2 — Clear Feedback for GPT-5.3-Codex Users (Priority: P2)

**Goal**: When a user sets `MODEL=gpt-5.3-codex`, they receive an accurate error message explaining the Codex API incompatibility (not "legacy").

**Independent Test**: Set `MODEL=gpt-5.3-codex` with `OPENAI_API_KEY` and run preflight — error message says "Codex-family model" and "specialized API", NOT "legacy" or "completions-only model (Codex/legacy)".

### Implementation for User Story 2

- [x] T008 [US2] In `router/src/preflight.ts` function `validateChatModelCompatibility()` (~lines 763-774), refactor the `if (isCompletionsOnlyModel(model))` block: first check `isCodexFamilyModel(model)` (import from `'./config.js'`). If true, push a Codex-specific error: `"MODEL '${model}' is a Codex-family model. Codex models use a specialized API that is not compatible with the chat completions endpoint used by cloud AI agents.\n\nFix: Use a chat-compatible model:\n  MODEL=gpt-4o-mini    # OpenAI - fast, cost-effective\n  MODEL=gpt-4o         # OpenAI - flagship\n  MODEL=claude-opus-4-6 # Anthropic\n\nOr in .ai-review.yml:\n  models:\n    default: gpt-4o-mini"`. Else if `isCompletionsOnlyModel(model)` (non-Codex legacy), push updated legacy error: `"MODEL '${model}' is a legacy completions-only model that does not support the chat completions endpoint used by cloud AI agents.\n\nFix: Use a chat-compatible model:\n  MODEL=gpt-4o-mini    # OpenAI - fast, cost-effective\n  MODEL=gpt-4o         # OpenAI - flagship\n  MODEL=claude-opus-4-6 # Anthropic\n\nOr in .ai-review.yml:\n  models:\n    default: gpt-4o-mini"`
- [x] T009 [US2] In `router/src/__tests__/preflight.test.ts`, update the existing Codex model tests (search for `'completions-only'` assertions ~line 858): change assertions to expect the new Codex-specific error containing `'Codex-family'` and `'specialized API'` instead of `'completions-only'`. The test should NOT find `'legacy'` in the error for Codex models.
- [x] T010 [US2] In `router/src/__tests__/preflight.test.ts`, add a new test case: `it('rejects gpt-5.3-codex with Codex-specific error')` — configure `MODEL=gpt-5.3-codex` with cloud agents enabled, run `validateChatModelCompatibility()`, assert error contains `'Codex-family'` and does NOT contain `'legacy'`
- [x] T011 [US2] In `router/src/__tests__/preflight.test.ts`, add a new test case: `it('rejects legacy models with legacy-specific error')` — configure `MODEL=text-davinci-003` with cloud agents enabled, run `validateChatModelCompatibility()`, assert error contains `'legacy completions-only'` and does NOT contain `'Codex-family'`
- [x] T012 [US2] Run `pnpm run test` from `router/` to verify all tests pass including new Codex differentiation tests

**Checkpoint**: GPT-5.3-Codex produces an accurate, non-misleading error. Legacy models still produce the appropriate legacy error. Both paths still block the model.

---

## Phase 5: User Story 3 — Updated Model References in Error Messages (Priority: P2)

**Goal**: Remaining error message locations that suggest models are updated to include `claude-opus-4-6`.

**Independent Test**: Trigger the chat model compatibility error with a legacy model and verify `claude-opus-4-6` appears in suggestions (this was already updated in T008 for Codex path, but verify the legacy path too).

### Implementation for User Story 3

- [x] T013 [US3] Verify that all 5 error message locations in `router/src/preflight.ts` that suggest Anthropic models now reference `claude-opus-4-6` (T002, T003, and T008 should have covered lines ~425, ~509, and ~768-770). If any location still references only `claude-sonnet-4-20250514` without `claude-opus-4-6`, update it.
- [x] T014 [US3] In `router/src/__tests__/preflight.test.ts`, find any test assertions that check error messages contain `'MODEL=claude-sonnet-4-20250514'` as a suggestion. If any exist and the corresponding source was updated, update the assertion to expect `'claude-opus-4-6'` instead.
- [x] T015 [US3] Run `pnpm run typecheck` from `router/` to verify no type errors were introduced. Run `pnpm run test` to verify all tests pass.

**Checkpoint**: All error messages across the codebase consistently suggest `claude-opus-4-6` as the Anthropic model option. Type check and tests pass.

---

## Phase 6: User Story 4 — SDK Compatibility Guidance (Priority: P3)

**Goal**: Documentation provides clear guidance on Opus 4.6 usage and GPT-5.3-Codex limitations.

**Independent Test**: Read updated docs and verify they mention `claude-opus-4-6` as an available model and explain GPT-5.3-Codex incompatibility.

### Implementation for User Story 4

- [x] T016 [P] [US4] In `README.md`, find all locations that list available Anthropic models (search for `claude-sonnet-4-20250514`) and add `claude-opus-4-6` as an additional option. Keep `claude-sonnet-4-20250514` listed (it's still valid). Update the comment in `.ai-review.yml` (~line 26) to add `claude-opus-4-6` to the cloud chat models list.
- [x] T017 [P] [US4] In `docs/getting-started/quick-start.md` and `docs/getting-started/first-review.md`, add `claude-opus-4-6` alongside existing Anthropic model references
- [x] T018 [P] [US4] In `docs/configuration/provider-selection.md` and `docs/configuration/index.md`, add `claude-opus-4-6` alongside existing Anthropic model references
- [x] T019 [P] [US4] In `docs/examples/github-basic.md` and `docs/examples/github-enterprise.md`, add `claude-opus-4-6` alongside existing Anthropic model references
- [x] T020 [P] [US4] In `docs/troubleshooting.md`, add `claude-opus-4-6` alongside existing Anthropic model references. If any troubleshooting guidance mentions Codex models, ensure it reflects the accurate "specialized API" language rather than "legacy"
- [x] T021 [P] [US4] In `docs/platforms/github/max-tier.md`, add `claude-opus-4-6` alongside existing Anthropic model references
- [x] T022 [P] [US4] In `docs/configuration/team-configurations.md`, add `claude-opus-4-6` alongside existing Anthropic model references

**Checkpoint**: All documentation files reference `claude-opus-4-6` as an available Anthropic model option.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation across all stories

- [x] T023 Run full test suite from `router/`: `pnpm run test` — verify zero failures
- [x] T024 Run type check from `router/`: `pnpm run typecheck` — verify zero errors
- [x] T025 Run quickstart.md validation: verify the example commands in `specs/001-new-model-compat/quickstart.md` match the actual behavior (MODEL=claude-opus-4-6 passes preflight, MODEL=gpt-5.3-codex produces Codex-specific error)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — T001 creates `isCodexFamilyModel()`
- **Phase 2 (Foundational)**: Empty — no blocking prerequisites beyond T001
- **Phase 3 (US1 — Opus 4.6)**: Depends on Phase 1 only for T007 test updates; T002-T006 are independent edits
- **Phase 4 (US2 — Codex error)**: Depends on T001 (`isCodexFamilyModel`). Independent of Phase 3.
- **Phase 5 (US3 — Remaining references)**: Depends on Phase 3 and Phase 4 (verifies their work is complete)
- **Phase 6 (US4 — Documentation)**: Independent of all code phases. Can run in parallel with Phases 3-5.
- **Phase 7 (Polish)**: Depends on all previous phases

### User Story Dependencies

- **US1 (Opus 4.6)**: Depends only on T001. No dependencies on other stories.
- **US2 (Codex error)**: Depends only on T001. No dependencies on other stories.
- **US3 (References)**: Depends on US1 and US2 completion (verification sweep).
- **US4 (Documentation)**: Fully independent — can start immediately.

### Within Each User Story

- Source edits before test updates
- All [P] tasks within a phase can run in parallel
- Run tests after all edits in a phase are complete

### Parallel Opportunities

- T002, T003, T004, T005, T006 can all run in parallel (different files/locations)
- T009, T010, T011 can run in parallel after T008 (different test cases, same file — but no conflicts)
- T016-T022 can all run in parallel (different documentation files)
- US1 and US2 can be worked on in parallel (after T001)
- US4 can be worked on in parallel with US1, US2, US3

---

## Parallel Example: User Story 1

```bash
# All source edits in parallel (different files):
Task: T002 "Update Ollama error suggestion in router/src/preflight.ts"
Task: T003 "Update mismatch error suggestion in router/src/preflight.ts"
Task: T004 "Add comment in router/src/config/zero-config.ts"
Task: T005 "Update config wizard comment in router/src/cli/config-wizard.ts"
Task: T006 "Update AVAILABLE_PROVIDERS in router/src/cli/config-wizard.ts"

# Then test update (depends on source edits):
Task: T007 "Update test assertions in router/src/__tests__/preflight.test.ts"
```

## Parallel Example: User Story 4

```bash
# All documentation edits in parallel (different files):
Task: T016 "Update README.md and .ai-review.yml"
Task: T017 "Update getting-started docs"
Task: T018 "Update configuration docs"
Task: T019 "Update example docs"
Task: T020 "Update troubleshooting docs"
Task: T021 "Update platform docs"
Task: T022 "Update team config docs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001: Add `isCodexFamilyModel()`
2. Complete T002-T007: Update all Anthropic model suggestions to `claude-opus-4-6`
3. **STOP and VALIDATE**: Run `pnpm run test` — Opus 4.6 works, error messages updated
4. This alone delivers the primary value (Opus 4.6 guidance)

### Incremental Delivery

1. T001 → `isCodexFamilyModel()` ready
2. T002-T007 → US1 complete: Opus 4.6 references everywhere (MVP!)
3. T008-T012 → US2 complete: Codex error is accurate
4. T013-T015 → US3 complete: All references verified consistent
5. T016-T022 → US4 complete: Documentation updated
6. T023-T025 → Polish: Full validation pass
7. Each increment adds value without breaking previous work

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- T002 and T003 edit different functions in the same file (`preflight.ts`) — they can run in parallel because they touch different line ranges
- T005 and T006 edit different locations in the same file (`config-wizard.ts`) — they can run in parallel because they touch different functions/constants
- Commit after each phase or logical group
- Stop at any checkpoint to validate story independently
