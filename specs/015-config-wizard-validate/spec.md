# Feature Specification: Complete Config Wizard and Validation Command

**Feature Branch**: `015-config-wizard-validate`
**Created**: 2026-01-31
**Status**: Complete
**Input**: User description: "Complete remaining config wizard and validate command features from 014-user-friendly-config"

## Clarifications

### Session 2026-01-31

- Q: Should wizard output be byte-stable (deterministic) for CI reproducibility? → A: Yes - wizard output MUST be byte-stable (stable key order, stable lists, no timestamps). Identical choices produce identical files.
- Q: What are the exit code semantics for validate command? → A: Errors → non-zero exit code; warnings → zero exit code but printed to stderr. Wizard post-summary follows same rules.
- Q: What exit code should wizard use when user cancels mid-prompt? → A: Exit 0 (cancellation is intentional user choice, not an error).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Interactive Configuration Wizard (Priority: P1)

Users setting up the AI review tool for the first time need an interactive experience that guides them through configuration without requiring prior knowledge of the config file format or available options.

**Why this priority**: First-time users who cannot use CLI flags (or don't know them) currently have no way to generate a config file. The wizard with `--defaults` works but requires knowing `--provider` and `--platform` options upfront. Interactive prompts remove this barrier.

**Independent Test**: Can be fully tested by running `ai-review config init` in an interactive terminal and answering prompts to generate a valid `.ai-review.yml` file.

**Acceptance Scenarios**:

1. **Given** a user runs `ai-review config init` in an interactive terminal without flags, **When** the command starts, **Then** the user is prompted to select a platform (GitHub, Azure DevOps, or both).

2. **Given** the platform selection is complete, **When** the user continues, **Then** they are prompted to select an LLM provider (Anthropic, OpenAI, Azure OpenAI, Ollama).

3. **Given** the provider selection is complete, **When** the user continues, **Then** they are prompted to select which AI review agents to enable (with sensible defaults based on provider capabilities).

4. **Given** all selections are complete, **When** the user confirms, **Then** a valid `.ai-review.yml` file is generated and written to the current directory.

5. **Given** the user runs `ai-review config init` in a non-interactive environment (CI) without `--defaults`, **When** the command starts, **Then** an error message explains how to use `--defaults` with CLI options.

---

### User Story 2 - Configuration Validation Command (Priority: P1)

Users want to validate their configuration before running an actual review to catch misconfigurations early, especially in CI environments where feedback loops are slow.

**Why this priority**: The current `ai-review validate` command only checks YAML schema validity but doesn't run preflight checks that catch multi-key ambiguity, missing API keys, or provider-model mismatches. This defeats the purpose of early validation.

**Independent Test**: Can be fully tested by running `ai-review validate --repo .` with various configuration states and verifying all preflight checks are executed.

**Acceptance Scenarios**:

1. **Given** a valid configuration file exists, **When** the user runs `ai-review validate --repo .`, **Then** the command runs all preflight checks (multi-key ambiguity, provider-model compatibility, API key validation) and reports success.

2. **Given** a configuration has multiple provider keys set with MODEL env var but no explicit provider, **When** the user runs `ai-review validate --repo .`, **Then** the validation fails with an actionable error explaining the ambiguity and how to fix it.

3. **Given** a configuration specifies a model that doesn't match the detected provider, **When** the user runs `ai-review validate --repo .`, **Then** the validation fails with an actionable error about the provider-model mismatch.

4. **Given** an Azure OpenAI configuration with missing required keys, **When** the user runs `ai-review validate --repo .`, **Then** the validation fails with a specific error listing exactly which Azure keys are missing.

5. **Given** legacy API keys are detected (e.g., `OPENAI_MODEL`), **When** the user runs `ai-review validate --repo .`, **Then** a warning is shown with migration instructions.

6. **Given** validation passes, **When** the command completes, **Then** the resolved configuration tuple is displayed showing provider, model, key source, and config source.

---

### User Story 3 - Configuration Validation with Issue Summary (Priority: P2)

After running the config wizard, users want to see a summary of potential issues with their configuration before using it in production.

**Why this priority**: Builds on User Story 1 to provide immediate feedback after wizard completion, helping users fix issues before committing their config.

**Independent Test**: Can be tested by running `ai-review config init` and observing a validation summary at the end of the wizard flow.

**Acceptance Scenarios**:

1. **Given** the user completes the config wizard, **When** the config file is generated, **Then** the wizard automatically validates the generated config and displays a summary.

2. **Given** the generated config has potential issues (e.g., missing env vars for selected provider), **When** the summary is displayed, **Then** warnings are shown with actionable fixes.

3. **Given** the generated config is fully valid, **When** the summary is displayed, **Then** a success message confirms the config is ready to use.

---

### Edge Cases

- What happens when the user cancels the wizard mid-prompt? The wizard exits gracefully with exit code 0 (not an error) without writing any files.
- What happens when the target `.ai-review.yml` already exists? The user is prompted to confirm overwrite.
- What happens when the user has no API keys set in their environment? The wizard warns but still generates the config, explaining which env vars need to be set.
- What happens when validate is run on a directory without a config file? The command fails with a clear error explaining how to create one.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The `config init` command MUST prompt users interactively when run in a TTY environment without `--defaults` flag.
- **FR-002**: Interactive prompts MUST include platform selection (GitHub, Azure DevOps, or both).
- **FR-003**: Interactive prompts MUST include LLM provider selection (Anthropic, OpenAI, Azure OpenAI, Ollama).
- **FR-004**: Interactive prompts MUST include agent selection with provider-appropriate defaults.
- **FR-005**: The wizard MUST support keyboard navigation for selections (arrow keys + Enter, or numbered choices).
- **FR-006**: The `validate` command MUST run all preflight checks from `runPreflightChecks()`, not just YAML schema validation.
- **FR-007**: The `validate` command MUST report multi-key ambiguity errors when multiple provider keys are set with MODEL env var but no explicit provider.
- **FR-008**: The `validate` command MUST report provider-model mismatch errors when the resolved provider doesn't match the model family.
- **FR-009**: The `validate` command MUST report Azure partial configuration errors with specific missing keys.
- **FR-010**: The `validate` command MUST warn about legacy API keys with migration instructions.
- **FR-011**: The `validate` command MUST display the resolved configuration tuple on success.
- **FR-012**: The wizard MUST warn if an existing `.ai-review.yml` file will be overwritten and prompt for confirmation.
- **FR-013**: The wizard MUST provide a summary of potential issues after generating the config.
- **FR-014**: The wizard output MUST be byte-stable: stable key ordering, stable list ordering, and no timestamps or dynamic content. Identical user choices MUST produce identical output files.
- **FR-015**: The `validate` command MUST exit with non-zero code on any error; warnings MUST NOT cause non-zero exit but MUST be printed to stderr.
- **FR-016**: The wizard's post-generation validation summary MUST follow the same exit code semantics: errors → non-zero exit, warnings → zero exit with printed warnings.

### Key Entities

- **InteractivePrompt**: Represents a single user prompt with options, supports keyboard navigation, returns selected value.
- **ValidationReport**: Summary of all preflight check results, categorized by severity (error, warning, info).
- **WizardState**: Tracks user selections through the wizard flow (platform, provider, agents).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: First-time users can generate a valid configuration file using only the interactive wizard in under 2 minutes.
- **SC-002**: The `validate` command catches 100% of issues that `runPreflightChecks()` catches, not just YAML schema errors.
- **SC-003**: All validation errors include actionable "Fix:" instructions that users can directly apply.
- **SC-004**: Users running validation in CI receive the same comprehensive checks as the actual review command.
- **SC-005**: The wizard-generated config passes validation when required environment variables are set.

## Assumptions

- Users have Node.js installed and can run the `ai-review` CLI.
- Interactive prompts require a TTY environment; CI environments must use `--defaults` with CLI options.
- The existing `config-wizard.ts` infrastructure (generateDefaultConfig, generateConfigYaml) will be reused.
- The existing preflight validation functions are complete and correct; this feature integrates them into the validate command.
- A simple terminal prompt library will be used for interactive input (e.g., `@inquirer/prompts` or built-in readline).

## Out of Scope

- Modifying existing preflight validation logic (already complete in 014).
- Changing the config file format or schema.
- Web-based configuration UI.
- Configuration migration tools (beyond legacy key warnings).
