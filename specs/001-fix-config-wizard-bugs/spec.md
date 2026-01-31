# Feature Specification: Fix Config Wizard Validation Bugs

**Feature Branch**: `001-fix-config-wizard-bugs`
**Created**: 2026-01-31
**Status**: Draft
**Input**: User description: "Verify and remediate feedback on config wizard validation bugs"

## Clarifications

### Session 2026-01-31

- Q: How to enforce "no re-resolution" rule? → A: Require regression test spying on resolver functions, asserting exactly one call per command path
- Q: What are exit code semantics with warnings? → A: `validate` exits non-zero on errors only; wizard exits 0 unless errors; warnings never block execution
- Q: How to verify validate matches review preflight? → A: Regression test runs both commands on same repo/env and asserts identical resolved tuple
- Q: What are cancel/non-TTY exit semantics? → A: Wizard cancel → exit 0; non-TTY without --defaults → exit 1; validate/review must never prompt (fail fast)

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Auto-Applied Model Persists to Execution (Priority: P1)

A user sets up ai-review with only `OPENAI_API_KEY` set (no MODEL variable). The preflight validation auto-detects the provider and applies a default model. The review executes successfully using that auto-applied model.

**Why this priority**: This is critical because users following the documented "single-key setup" pattern currently experience false success in preflight followed by runtime failure. Agents receive an empty model and fail.

**Independent Test**: Can be tested by running `ai-review review --repo . --base HEAD~1 --head HEAD` with only OPENAI_API_KEY set. The review should complete using gpt-4o (or the auto-detected default).

**Acceptance Scenarios**:

1. **Given** a user has only OPENAI_API_KEY set (no MODEL), **When** they run `ai-review review`, **Then** the auto-applied model (e.g., gpt-4o) is used for all agent execution, not just preflight validation.
2. **Given** a user has only ANTHROPIC_API_KEY set (no MODEL), **When** they run `ai-review review`, **Then** the auto-applied model (e.g., claude-sonnet-4-20250514) is used for execution.
3. **Given** preflight returns a resolvedConfig, **When** execution begins, **Then** runReview uses exactly that resolvedConfig—no re-resolution occurs.
4. **Given** preflight validates successfully, **When** any downstream code attempts to recompute model/provider, **Then** it MUST use the preflight-returned resolvedConfig instead.
5. **Given** `ai-review validate` and `ai-review review` run on the same repo/env, **When** comparing their resolved tuples, **Then** the tuples are identical (provider, model, keySource, configSource).

---

### User Story 2 - Ollama Provider Accepts Default URL (Priority: P2)

A user configures `provider: ollama` in their config file without setting OLLAMA_BASE_URL. The validation passes because OLLAMA_BASE_URL is optional for the ollama provider (defaulting to http://localhost:11434).

**Why this priority**: Users with local Ollama setups get false validation errors, preventing them from using the tool with valid configurations.

**Independent Test**: Can be tested by running `ai-review validate --repo .` with a config containing `provider: ollama` and no OLLAMA_BASE_URL set.

**Acceptance Scenarios**:

1. **Given** a config with `provider: ollama` and no OLLAMA_BASE_URL set, **When** validation runs, **Then** validation passes (no error about missing OLLAMA_BASE_URL).
2. **Given** a config with `provider: ollama` and OLLAMA_BASE_URL explicitly set to a valid URL format, **When** validation runs, **Then** the explicitly set URL is used.
3. **Given** a config with `provider: ollama` and OLLAMA_BASE_URL set to an invalid URL format (e.g., "not-a-url"), **When** validation runs, **Then** preflight fails with a clear URL format error.
4. **Given** a config with `provider: ollama` and OLLAMA_BASE_URL set to a valid but unreachable URL, **When** validation runs, **Then** preflight passes (connectivity is checked at runtime, not preflight).
5. **Given** `ai-review config init --defaults --provider ollama`, **When** the generated config is validated, **Then** validation passes without requiring OLLAMA_BASE_URL.

---

### User Story 3 - Config Init Validation Completes Successfully (Priority: P2)

A user runs `ai-review config init` to create a new configuration file. After generation, the validation step executes without crashing and shows meaningful validation results.

**Why this priority**: The config init command crashes during validation, preventing users from seeing whether their generated config is valid. This makes the wizard appear broken.

**Independent Test**: Can be tested by running `ai-review config init --defaults --provider openai --platform github` and observing the validation output.

**Acceptance Scenarios**:

1. **Given** a user runs `ai-review config init`, **When** the config is generated, **Then** the validation step completes without throwing an exception.
2. **Given** no API keys are set, **When** config init validation runs, **Then** appropriate warnings are shown (not a crash), and exit code is 0.
3. **Given** valid API keys are set, **When** config init validation runs, **Then** a success message is shown and exit code is 0.
4. **Given** config init validation produces errors, **When** the validation step completes, **Then** exit code is 1.
5. **Given** user cancels the config init wizard (Ctrl+C or equivalent), **When** the process exits, **Then** exit code is 0 (cancellation is not an error).
6. **Given** config init runs in a non-TTY environment (e.g., CI) without `--defaults` flag, **When** the command starts, **Then** it exits immediately with code 1 and a single-line error message.

---

### User Story 4 - Both Platform Option Generates Dual Reporting (Priority: P3)

A user running in an environment that uses both GitHub and Azure DevOps selects "Both" in the platform prompt. The generated configuration includes reporting blocks for both platforms, and validation warns when neither platform environment is detected.

**Why this priority**: The "both" option misleads users by appearing to support dual platforms but silently dropping ADO configuration. Users choosing this option won't get ADO reporting, and there's no warning if the config does nothing.

**Independent Test**: Can be tested by running the config wizard interactively, selecting "Both" for platform, and examining the generated YAML and validation output.

**Acceptance Scenarios**:

1. **Given** a user selects "Both" in the platform prompt, **When** the config is generated, **Then** both `reporting.github` and `reporting.ado` sections are present.
2. **Given** a user selects "Both", **When** reviewing the generated config, **Then** both platforms have appropriate default settings (e.g., mode: checks_and_comments for GitHub, mode: comments for ADO).
3. **Given** a "Both" platform config is validated, **When** neither GITHUB_ACTIONS nor TF_BUILD/SYSTEM_TEAMFOUNDATIONCOLLECTIONURI is detected, **Then** validation emits a warning listing the exact env vars checked: `GITHUB_ACTIONS`, `TF_BUILD`, `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`.
4. **Given** a "Both" platform config is used at runtime, **When** only GitHub environment is detected, **Then** only GitHub reporting executes (ADO silently skips—this is expected behavior).
5. **Given** the "Both" platform warning is emitted, **When** checking exit code, **Then** exit code is 0 (warning never blocks execution).

---

### Edge Cases

- What happens when both MODEL and single API key are set? The explicit MODEL should take precedence over auto-detection.
- What happens when multiple API keys are set without MODEL? Should warn about ambiguity (existing behavior).
- What happens when config init is run with an invalid provider? Should show a clear error message.
- What happens when OLLAMA_BASE_URL is set to an invalid URL format? Preflight MUST fail with a URL format error.
- What happens when OLLAMA_BASE_URL is set to a valid but unreachable URL? Preflight passes; connectivity failure is a runtime error.
- What happens when "Both" platform is selected but no CI environment is detected? Validation warns; runtime silently skips both reporters.
- What happens when validate/review would need user input (missing config, ambiguous state)? Fail fast with error, never prompt.
- What happens when wizard is cancelled mid-prompt? Exit 0 (user-initiated cancellation is not an error).

## Requirements _(mandatory)_

### Functional Requirements

#### Single Source of Truth for Resolved Configuration

- **FR-001**: Preflight MUST return a `resolvedConfig` object containing: provider, model, keySource (env var name), and configSource (where value came from: env/config/default)
- **FR-002**: runReview MUST use the preflight-returned `resolvedConfig` for all execution—no re-resolution of model/provider after preflight
- **FR-003**: System MUST NOT recompute model or provider after preflight validation passes (prevents "preflight passes, runtime fails" drift)
- **FR-004**: AgentContext MUST be constructed using values from `resolvedConfig`, not by calling resolution functions again
- **FR-015**: A regression test MUST spy/mock the resolver functions (`resolveEffectiveModelWithDefaults`, provider resolution) and assert they are called exactly once per command path (review, validate, config init validate)
- **FR-016**: Regression test MUST verify that AgentContext is derived exclusively from `ResolvedConfig` values
- **FR-021**: A regression test MUST run both `ai-review validate` and `ai-review review` on the same minimal repo/env and assert the resolved tuple is identical (provider, model, keySource, configSource)
- **FR-022**: `validate` command MUST NOT perform any resolution branches that `review` does not also perform

#### Ollama URL Validation

- **FR-005**: OLLAMA_BASE_URL MUST be treated as optional ONLY when `provider: ollama` is explicitly configured
- **FR-006**: When OLLAMA_BASE_URL is omitted with `provider: ollama`, system MUST use the documented default (http://localhost:11434)
- **FR-007**: When OLLAMA_BASE_URL is provided, preflight MUST validate URL format (scheme + host); invalid format is a preflight error
- **FR-008**: Preflight MUST NOT check Ollama connectivity—that is a runtime concern (fail-closed at execution time)

#### Config Init Fix

- **FR-009**: Config init validation MUST pass a valid minimal AgentContext to runPreflightChecks (not undefined)
- **FR-010**: Config init MUST construct AgentContext using the same pattern as the validate command

#### Both Platform Configuration

- **FR-011**: When user selects "Both" platform, system MUST generate both `reporting.github` and `reporting.ado` configuration blocks
- **FR-012**: Generated dual-platform config MUST include sensible defaults: checks_and_comments for GitHub, comments for ADO
- **FR-013**: When validating a "Both" platform config, system MUST emit a warning if neither GitHub nor ADO environment variables are detected
- **FR-014**: The warning for missing platform environment MUST be informational (not an error)—the config is still valid
- **FR-017**: The "Both" platform warning MUST list the exact environment variables checked: `GITHUB_ACTIONS`, `TF_BUILD`, `SYSTEM_TEAMFOUNDATIONCOLLECTIONURI`

#### Exit Code Semantics

- **FR-018**: `ai-review validate` command MUST exit with code 1 if `errors.length > 0`, exit with code 0 otherwise (warnings do not affect exit code)
- **FR-019**: `ai-review config init` wizard post-validate step MUST print warnings but exit with code 0 unless errors exist
- **FR-020**: Warnings (including "Both" platform warning) MUST never block execution or cause non-zero exit
- **FR-023**: `ai-review config init` wizard cancellation (Ctrl+C, EOF, or user abort) MUST exit with code 0
- **FR-024**: `ai-review config init` in non-TTY environment without `--defaults` flag MUST exit immediately with code 1 and print a single-line error message explaining the fix (use `--defaults` or provide `--provider` and `--platform`)
- **FR-025**: `ai-review validate` and `ai-review review` commands MUST never prompt for user input—if information is missing or ambiguous, fail fast with an error message
- **FR-026**: No command path may hang waiting for stdin in CI environments

### Key Entities

- **ResolvedConfig**: Single source of truth containing provider, model, keySource, and configSource—returned by preflight and used by execution
- **PreflightResult**: Validation result containing errors array, warnings array, and resolvedConfig
- **AgentContext**: Context passed to agents—MUST be constructed from resolvedConfig values
- **Config**: User configuration including optional provider field and reporting settings

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users with single-key setups can complete full review runs without manual MODEL configuration
- **SC-002**: Users with `provider: ollama` configs pass validation without OLLAMA_BASE_URL set
- **SC-003**: Config init command completes validation step without exceptions in 100% of runs
- **SC-004**: Users selecting "Both" platform receive configs with dual reporting blocks
- **SC-005**: All four reported bugs are verified fixed through regression tests
- **SC-006**: No model/provider re-resolution occurs after preflight—verified by regression test asserting resolver called exactly once per command
- **SC-007**: Invalid OLLAMA_BASE_URL format (non-URL string) causes preflight failure with clear error message
- **SC-008**: "Both" platform configs show warning when run outside CI environment
- **SC-009**: Regression test exists that spies on resolver functions and fails if called more than once per command execution
- **SC-010**: All command paths (review, validate, config init) exit 0 when only warnings present (no errors)
- **SC-011**: Regression test verifies `validate` and `review` produce identical resolved tuples on same input
- **SC-012**: Wizard cancellation exits 0 (verified by test)
- **SC-013**: Non-TTY without `--defaults` exits 1 with actionable error message (verified by test)
- **SC-014**: No command hangs waiting for stdin when run in CI (non-interactive) environment

## Assumptions

- The auto-apply model defaults are already correctly implemented in `resolveEffectiveModelWithDefaults`
- The Ollama default URL (http://localhost:11434) is correctly documented and expected
- The existing `formatValidationReport` and `printValidationReport` functions work correctly
- The platform options in `AVAILABLE_PLATFORMS` include a "both" option
- ResolvedConfig can be added to PreflightResult without breaking existing callers (additive change)
- Test framework supports spy/mock functionality for function call counting (Vitest provides this)
- process.stdin.isTTY can be used to detect non-TTY environments reliably
