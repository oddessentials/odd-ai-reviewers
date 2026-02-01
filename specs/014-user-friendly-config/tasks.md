# Tasks: User-Friendly Configuration & API Key Handling

**Input**: Design documents from `/specs/014-user-friendly-config/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: Tests are included as this is a core infrastructure change requiring regression coverage.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Router package**: `router/src/` at repository root
- **Tests**: `router/src/__tests__/`
- **Docs**: `docs/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Schema extensions and type definitions that all user stories depend on

- [x] T001 Add `ProviderSchema` Zod enum to router/src/config/schemas.ts
- [x] T002 Add optional `provider` field to `ConfigSchema` in router/src/config/schemas.ts
- [x] T003 [P] Add `ResolvedConfigTuple` interface to router/src/config/providers.ts with all fields (provider, model, keySource, configSource, configPath, schemaVersion, resolutionVersion)
- [x] T004 [P] Add `PROVIDER_KEY_MAPPING` constant to router/src/preflight.ts mapping providers to required env vars
- [x] T005 [P] Add `DEFAULT_MODELS` constant to router/src/preflight.ts with auto-apply defaults (gpt-4o, claude-sonnet-4-20250514, codellama:7b, null for Azure)
- [x] T006 Update `PreflightResult` interface in router/src/preflight.ts to include optional `resolved` field

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T007 Add `countProvidersWithKeys(env)` helper function to router/src/preflight.ts
- [x] T008 Add `resolveKeySource(provider, env)` helper function to router/src/config/providers.ts
- [x] T009 Add `resolveConfigSource(config, configPath)` helper function to router/src/config/providers.ts
- [x] T010 Update `resolveProvider()` in router/src/config/providers.ts to respect explicit `config.provider` field
- [x] T011 Add `buildResolvedConfigTuple()` function to router/src/config/providers.ts

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - First-Time Setup with Single LLM Provider (Priority: P1) 🎯 MVP

**Goal**: Single-key setups "just work" with auto-applied default models

**Independent Test**: Set only `OPENAI_API_KEY`, run preflight, verify it succeeds with `gpt-4o` auto-applied

### Tests for User Story 1

- [x] T012 [P] [US1] Add test case "auto-applies gpt-4o when only OPENAI_API_KEY set" in router/src/**tests**/preflight.test.ts
- [x] T013 [P] [US1] Add test case "auto-applies claude-sonnet-4 when only ANTHROPIC_API_KEY set" in router/src/**tests**/preflight.test.ts
- [x] T014 [P] [US1] Add test case "auto-applies codellama:7b when only OLLAMA_BASE_URL set" in router/src/**tests**/preflight.test.ts
- [x] T015 [P] [US1] Add test case "does NOT auto-apply for Azure (requires deployment)" in router/src/**tests**/preflight.test.ts

### Implementation for User Story 1

- [x] T016 [US1] Add `resolveEffectiveModelWithDefaults()` function to router/src/preflight.ts that auto-applies defaults for single-key setups
- [x] T017 [US1] Update `validateModelConfig()` in router/src/preflight.ts to use auto-apply instead of failing
- [x] T018 [US1] Integrate resolved config tuple building into `runPreflightChecks()` in router/src/phases/preflight.ts
- [x] T019 [US1] Add JSON logging of resolved config tuple after successful preflight in router/src/phases/preflight.ts

**Checkpoint**: Single-key setups work without any config file

---

## Phase 4: User Story 2 - Clear Error Messages for Common Misconfigurations (Priority: P1)

**Goal**: Actionable error messages with exact fix instructions for all misconfiguration scenarios

**Independent Test**: Set both keys + MODEL but no provider, verify preflight fails with clear "add provider: X" message

### Tests for User Story 2

- [x] T020 [P] [US2] Add test case "fails with actionable message when multi-key + MODEL + no provider" in router/src/**tests**/preflight.test.ts
- [x] T021 [P] [US2] Add test case "Azure partial config shows single-line fix for missing key" in router/src/**tests**/preflight.test.ts
- [x] T022 [P] [US2] Add test case "deprecated OPENAI_MODEL shows migration guidance" in router/src/**tests**/preflight.test.ts
- [x] T023 [P] [US2] Add test case "explicit provider with missing key shows which key is needed" in router/src/**tests**/preflight.test.ts

### Implementation for User Story 2

- [x] T024 [US2] Add `validateMultiKeyAmbiguity()` function to router/src/preflight.ts
- [x] T025 [US2] Update `validateAzureDeployment()` in router/src/preflight.ts to use single-line "set X" format
- [x] T026 [US2] Add `validateExplicitProviderKeys()` function to router/src/preflight.ts for provider-key matching
- [x] T027 [US2] Update legacy key validation to include migration examples in router/src/preflight.ts
- [x] T028 [US2] Integrate all new validations into `runPreflightChecks()` in router/src/phases/preflight.ts

**Checkpoint**: All common misconfigurations produce actionable error messages

---

## Phase 5: User Story 3 - Guided Configuration Mode (Priority: P2)

**Goal**: Interactive wizard generates valid `.ai-review.yml` from user prompts

**Independent Test**: Run `ai-review config init`, complete prompts, verify generated YAML is valid

### Tests for User Story 3

- [x] T029 [P] [US3] Add test case "wizard refuses in non-TTY without --defaults" in router/src/**tests**/config-wizard.test.ts
- [x] T030 [P] [US3] Add test case "wizard generates valid YAML with --defaults flag" in router/src/**tests**/config-wizard.test.ts
- [x] T031 [P] [US3] Add test case "wizard YAML has deterministic key ordering" in router/src/**tests**/config-wizard.test.ts
- [x] T032 [P] [US3] Add test case "wizard prompts for all 3 Azure values together" in router/src/**tests**/config-wizard.test.ts

### Implementation for User Story 3

- [x] T033 [US3] Create router/src/cli/config-wizard.ts with TTY check and --defaults/--yes flags
- [x] T034 [US3] Implement platform prompt (GitHub/Azure DevOps) in router/src/cli/config-wizard.ts
  - ⚠️ **GAP**: Implemented as `--platform` CLI option only; interactive prompt NOT implemented
- [x] T035 [US3] Implement provider prompt with Azure 3-value handling in router/src/cli/config-wizard.ts
  - ⚠️ **GAP**: Implemented as `--provider` CLI option only; interactive prompt NOT implemented
- [x] T036 [US3] Implement agent selection prompt in router/src/cli/config-wizard.ts
  - ⚠️ **GAP**: Agents are auto-selected based on provider; interactive prompt NOT implemented
- [x] T037 [US3] Implement deterministic YAML generation with stable key ordering in router/src/cli/config-wizard.ts
- [x] T038 [US3] Add `config init` subcommand to router/src/main.ts

**Checkpoint**: Config wizard generates valid configs for all provider combinations

- ⚠️ **NOTE**: Only `--defaults` mode works. Interactive prompts are NOT implemented (main.ts:126-130 explicitly says "Interactive prompts not yet implemented")

---

## Phase 6: User Story 4 - Simplified Provider Selection (Priority: P2)

**Goal**: Explicit `provider` field overrides automatic detection

**Independent Test**: Set both keys + explicit provider, verify the specified provider is used

### Tests for User Story 4

- [x] T039 [P] [US4] Add test case "explicit provider: openai uses OpenAI with both keys" in router/src/**tests**/providers.test.ts
- [x] T040 [P] [US4] Add test case "explicit provider: anthropic uses Anthropic with both keys" in router/src/**tests**/providers.test.ts
- [x] T041 [P] [US4] Add test case "single key still auto-detects without explicit provider" in router/src/**tests**/providers.test.ts

### Implementation for User Story 4

- [x] T042 [US4] Update provider resolution precedence in router/src/config/providers.ts to check config.provider first
- [x] T043 [US4] Add validation that explicit provider has corresponding key in router/src/preflight.ts
- [x] T044 [US4] Update resolved config tuple to reflect explicit provider source in router/src/config/providers.ts

**Checkpoint**: Explicit provider selection works and overrides precedence

---

## Phase 7: User Story 5 - Configuration Documentation and Examples (Priority: P3)

**Goal**: Comprehensive documentation with copy-paste examples for all scenarios

**Independent Test**: New user follows quickstart, has working config in under 5 minutes

### Implementation for User Story 5

- [x] T045 [P] [US5] Update docs/configuration/quickstart.md with provider examples and single-key setup
- [x] T046 [P] [US5] Create docs/configuration/troubleshooting.md with all error scenarios and fixes
- [x] T047 [P] [US5] Update docs/getting-started/first-setup.md to emphasize single-provider path
- [x] T048 [P] [US5] Add Azure OpenAI deployment name guidance to docs/configuration/troubleshooting.md
- [x] T049 [P] [US5] Add provider selection migration guide for multi-key users in docs/configuration/

**Checkpoint**: All documentation updated with examples and troubleshooting

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final improvements and validation

- [x] T050 [P] Add CHANGELOG entry documenting breaking change (multi-key + MODEL requires provider)
- [x] T051 [P] Run `pnpm lint` with `--max-warnings 0` to verify no lint violations
- [x] T052 [P] Run `pnpm typecheck` to verify no type errors
- [x] T053 Run full test suite `pnpm test` to verify all tests pass
- [x] T054 Run `depcruise` to verify no circular dependencies introduced
- [x] T055 Validate quickstart.md scenarios manually

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational phase completion
  - US1 and US2 can proceed in parallel (both P1)
  - US3 and US4 can proceed in parallel (both P2)
  - US5 can start after US1-US4 core changes are stable
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational - Uses types from US1 for defaults
- **User Story 4 (P2)**: Can start after Foundational - Extends US1/US2 provider resolution
- **User Story 5 (P3)**: Can start after US1-US4 - Documents features from other stories

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Helper functions before integration
- Core logic before logging/output
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T003-T005)
- All test tasks within a story marked [P] can run in parallel
- US1 tests (T012-T015) can all run in parallel
- US2 tests (T020-T023) can all run in parallel
- US3 tests (T029-T032) can all run in parallel
- US4 tests (T039-T041) can all run in parallel
- US5 doc tasks (T045-T049) can all run in parallel
- Polish tasks marked [P] can run in parallel (T050-T052)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Add test case 'auto-applies gpt-4o when only OPENAI_API_KEY set' in router/src/__tests__/preflight.test.ts"
Task: "Add test case 'auto-applies claude-sonnet-4 when only ANTHROPIC_API_KEY set' in router/src/__tests__/preflight.test.ts"
Task: "Add test case 'auto-applies codellama:7b when only OLLAMA_BASE_URL set' in router/src/__tests__/preflight.test.ts"
Task: "Add test case 'does NOT auto-apply for Azure (requires deployment)' in router/src/__tests__/preflight.test.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (schema extensions)
2. Complete Phase 2: Foundational (helper functions)
3. Complete Phase 3: User Story 1 (single-key auto-apply)
4. Complete Phase 4: User Story 2 (error messages)
5. **STOP and VALIDATE**: Both P1 stories functional
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Types and helpers ready
2. Add User Story 1 → Single-key "just works" (MVP core!)
3. Add User Story 2 → Actionable errors (MVP complete!)
4. Add User Story 3 → Config wizard (P2 enhancement)
5. Add User Story 4 → Explicit provider (P2 enhancement)
6. Add User Story 5 → Documentation (P3 polish)

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 + User Story 3 (auto-defaults + wizard)
   - Developer B: User Story 2 + User Story 4 (errors + explicit provider)
   - Developer C: User Story 5 (documentation) after core features stable
3. Stories integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Breaking change (multi-key + MODEL) must be documented in CHANGELOG

---

## Known Gaps (Post-Implementation)

The following gaps were identified during implementation review:

### 1. `validate` Command Incomplete (FR-006, SC-004)

**Location**: `router/src/main.ts:84-97`

**Issue**: The `validate` command only loads config and validates YAML schema. It does NOT run preflight checks that would catch:

- Multi-key ambiguity
- Provider-model mismatch
- Missing API keys for explicit provider
- Legacy key detection

**Spec Requirement**: US3 Scenario 2 says "they receive a summary of their current settings **with any issues highlighted**"

**Fix Required**: Update `validate` to call `runPreflightChecks()` and report issues.

### 2. Interactive Wizard Prompts Not Implemented (FR-007, US3)

**Location**: `router/src/main.ts:126-130`

**Issue**: Code explicitly says:

```
Interactive prompts not yet implemented.
Use --defaults flag with --provider and --platform options.
```

**Spec Requirement**: US3 Scenario 1 says "When they complete the guided prompts"

**Current State**: Only `--defaults` mode works with CLI options.

### 3. Unknown Model Warning Not Logged

**Location**: `router/src/preflight.ts:445`

**Issue**: Code says "Unknown model prefix - no validation, allow it to proceed" but does NOT log a warning.

**Spec Requirement**: Edge case says "(Warning, not hard failure - allows new models)"

**Fix Required**: Add `console.warn('[preflight] Unknown model prefix, proceeding without validation')`

### 4. YAML Parse Errors Lack Line Numbers

**Location**: `router/src/config.ts:65`

**Issue**: YAML parse errors bubble up without explicit line number extraction.

**Spec Requirement**: Edge case says "(Helpful parse error with line number)"

### 5. API Auth Failure Guidance (Runtime)

**Issue**: No specific handling for 401/403 responses from LLM APIs.

**Spec Requirement**: Edge case says "(Runtime error with suggestion to verify credentials)"

**Note**: This is a runtime concern, not preflight. Lower priority.
