# Implementation Plan: New Model Compatibility (Opus 4.6 & GPT-5.3-Codex)

**Branch**: `001-new-model-compat` | **Date**: 2026-02-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-new-model-compat/spec.md`

## Summary

Anthropic released Claude Opus 4.6 and OpenAI released GPT-5.3-Codex on 2026-02-05. Deep research confirms that Opus 4.6 already works with the current architecture (users can set `MODEL=claude-opus-4-6` today), while GPT-5.3-Codex is correctly blocked by the existing Codex safeguard. The implementation updates error messages to reference Opus 4.6 as an option, improves the Codex rejection error to accurately describe modern Codex models (not "legacy"), and adds a dedicated `isCodexFamilyModel()` classifier to distinguish Codex from truly legacy models.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.3.6 (validation), Commander 14.x (CLI), Anthropic SDK 0.71.2, OpenAI SDK 6.17.0
**Storage**: N/A (stateless per run; file-based cache exists but not modified)
**Testing**: Vitest 4.x
**Target Platform**: Node.js >=22.0.0 (Linux CI, Windows/macOS local)
**Project Type**: Single (CLI tool)
**Performance Goals**: N/A (error message changes only, no runtime path changes)
**Constraints**: No SDK upgrades. No changes to default auto-applied models. No new dependencies.
**Scale/Scope**: ~4 source files, ~3 test files, ~15 documentation files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                                                          |
| -------------------------------- | ------ | ------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | PASS   | No changes to posting logic                                                    |
| II. Structured Findings Contract | PASS   | No changes to finding schema                                                   |
| III. Provider-Neutral Core       | PASS   | Core logic unchanged; only error message strings and model suggestions updated |
| IV. Security-First Design        | PASS   | No new inputs, no secret handling changes                                      |
| V. Deterministic Outputs         | PASS   | Error messages are deterministic (same config → same error)                    |
| VI. Bounded Resources            | PASS   | No resource limit changes                                                      |
| VII. Environment Discipline      | PASS   | No CI environment changes, no new dependencies                                 |
| VIII. Explicit Non-Goals         | PASS   | Not adding Codex API support (out of scope)                                    |

**Gate result**: ALL PASS. No violations. Proceeding to Phase 0.

**Post-design re-check (Phase 1 complete)**: ALL PASS. The design adds one new exported function (`isCodexFamilyModel`) and updates error message strings. No architectural changes, no new dependencies, no behavior changes to model blocking logic. Constitution compliance confirmed.

## Project Structure

### Documentation (this feature)

```text
specs/001-new-model-compat/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── error-messages.md
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
router/src/
├── config/
│   ├── providers.ts          # isCompletionsOnlyModel, isCodexFamilyModel (new), COMPLETIONS_ONLY_PATTERNS
│   └── zero-config.ts        # getDefaultModelForProvider (comment update only)
├── preflight.ts              # Error messages: validateChatModelCompatibility, validateModelProviderMatch, validateProviderModelCompatibility, DEFAULT_MODELS
├── cli/
│   └── config-wizard.ts      # AVAILABLE_PROVIDERS descriptions, generateConfigYaml comments
└── __tests__/
    └── preflight.test.ts     # Test assertions for updated error messages

docs/                         # Documentation model reference updates
README.md                     # Model reference updates
.ai-review.yml                # Comment update
```

**Structure Decision**: Existing single-project structure. All changes are in-place edits to existing files. No new source files created.

## Complexity Tracking

No constitution violations to justify.

## Change Inventory

### Category 1: Codex Error Message Improvement (FR-003, FR-004)

**File**: `router/src/config/providers.ts`

- Add `isCodexFamilyModel(model: string): boolean` function that checks if a model matches the `/codex/i` pattern specifically (extracting the Codex check from the broader completions-only list)
- Keep `isCompletionsOnlyModel()` unchanged (it still blocks all the same models)
- The new function is used by `validateChatModelCompatibility()` to choose the error message

**File**: `router/src/preflight.ts` (lines 763-774)

- Update `validateChatModelCompatibility()` to check `isCodexFamilyModel()` first
- If Codex model: show new Codex-specific error explaining the Codex API uses a different endpoint, not "legacy"
- If other completions-only model: show existing legacy error message
- Both paths still block the model (FR-005)
- Update Anthropic model suggestion from `claude-sonnet-4-20250514` to `claude-opus-4-6` in the fix suggestions

### Category 2: Model Reference Updates in Error Messages (FR-002, FR-006)

**File**: `router/src/preflight.ts`

- Line 425: Update Ollama error suggestion to include `claude-opus-4-6`
- Line 509: Update provider-model mismatch fix to include `claude-opus-4-6`
- Lines 768-770: Update chat model compatibility fix to include `claude-opus-4-6`

**File**: `router/src/cli/config-wizard.ts`

- Line 216: Update Anthropic comment to reference `claude-opus-4-6`
- Line 256: Update AVAILABLE_PROVIDERS Anthropic description to include Opus 4.6

**File**: `router/src/config/zero-config.ts`

- Line 219: Add comment noting `claude-opus-4-6` is also available (but keep `claude-sonnet-4-20250514` as the auto-applied default since changing defaults is out of scope)

### Category 3: Test Updates

**File**: `router/src/__tests__/preflight.test.ts`

- Update Codex model test assertions to expect the new Codex-specific error message (not "completions-only")
- Update error message assertions that check for `claude-sonnet-4-20250514` in suggestions to also accept `claude-opus-4-6`
- Add new test case: `gpt-5.3-codex` triggers the Codex-specific error path
- Add new test case: legacy models (davinci, curie) still trigger the legacy error path

### Category 4: Documentation Updates

**Files**: README.md, docs/getting-started/_, docs/examples/_, docs/configuration/\*, docs/troubleshooting.md

- Add `claude-opus-4-6` as an available model option alongside existing models
- Update `.ai-review.yml` comment listing available models
- No changes to default recommendations (gpt-4o-mini remains default for cost reasons)
