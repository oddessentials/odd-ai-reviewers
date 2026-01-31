# Feature Specification: User-Friendly Configuration & API Key Handling

**Feature Branch**: `014-user-friendly-config`
**Created**: 2026-01-30
**Status**: Implemented (with gaps)
**Input**: User description: "Explore ways to make our config more user-friendly. It can probably be made a little less confusing with how we currently handle API keys."

## Implementation Status

### Fully Implemented ✅

| Requirement                                | Status | Verification                                                      |
| ------------------------------------------ | ------ | ----------------------------------------------------------------- |
| FR-001 Auto-apply default models           | ✅     | `resolveEffectiveModelWithDefaults()` in preflight.ts             |
| FR-002 Actionable error messages           | ✅     | All validation functions include fix instructions                 |
| FR-003 Explicit provider config            | ✅     | `provider` field in ConfigSchema                                  |
| FR-004 Multi-key + MODEL requires provider | ✅     | `validateMultiKeyAmbiguity()`                                     |
| FR-005 Model-provider validation           | ✅     | `validateProviderModelCompatibility()`                            |
| FR-008 Legacy key migration guidance       | ✅     | Migration examples in `validateAgentSecrets()`                    |
| FR-009 Documentation with examples         | ✅     | quick-start.md, provider-selection.md updated                     |
| FR-010 Backward compatibility              | ✅     | Existing valid configs work unchanged                             |
| FR-011 Resolved config tuple logging       | ✅     | `buildResolvedConfigTuple()` with schemaVersion/resolutionVersion |
| FR-012 Azure requires all 3 values         | ✅     | Validated in `validateAgentSecrets()`                             |
| FR-013 Azure no model defaulting           | ✅     | `DEFAULT_MODELS['azure-openai'] = null`                           |
| US1 Single-key auto-apply                  | ✅     | Tests in preflight.test.ts                                        |
| US2 Clear error messages                   | ✅     | Tests in preflight.test.ts                                        |
| US4 Explicit provider selection            | ✅     | Tests in providers.test.ts                                        |
| US5 Documentation                          | ✅     | All docs updated                                                  |

### Partially Implemented ⚠️

| Requirement                               | Status | Gap                                                                                                                                      |
| ----------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| FR-006 Configuration validation command   | ⚠️     | `validate` command exists but only checks YAML schema; does NOT run preflight checks to catch API key issues, multi-key ambiguity, etc.  |
| FR-007 Guided configuration mode          | ⚠️     | `config init --defaults` works; **interactive prompts NOT implemented** (code explicitly says "Interactive prompts not yet implemented") |
| US3 Guided configuration                  | ⚠️     | Only `--defaults` mode works; Acceptance Scenario 1 (guided prompts) and Scenario 2 (validate with issues highlighted) not met           |
| SC-004 Validation covers all scenarios    | ⚠️     | Blocked by FR-006 gap                                                                                                                    |
| SC-005 Guided mode produces valid configs | ⚠️     | Only in `--defaults` mode, not interactive                                                                                               |

### Not Implemented ❌

| Requirement                                    | Status | Notes                                                                                                   |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Edge case: Unknown model warning               | ❌     | Code allows unknown models (correct) but does NOT log a warning (spec says "Warning, not hard failure") |
| Edge case: YAML parse error line numbers       | ❌     | Errors from YAML library are wrapped but line numbers not explicitly extracted                          |
| Edge case: API key expired/revoked guidance    | ❌     | Runtime concern; no specific handling for 401/403 with credential verification suggestion               |
| Edge case: Explicit provider override info log | ❌     | Deferred; when explicit provider overrides auto-detected, no info message is logged                     |

## Clarifications

### Session 2026-01-30

- Q: How should determinism be locked for reproducibility? → A: Lock to user's resolved config; preflight MUST print and log the fully resolved tuple (provider + model + key-source + config-source) and use that exact tuple for the run.
- Q: What happens when multiple provider keys are present with MODEL set? → A: Hard fail unless `provider` is explicitly set (forces clarity, no implicit precedence).
- Q: How strict should Azure OpenAI validation be? → A: All 3 values (key/endpoint/deployment) required; no model defaulting; missing any value = preflight fail with single-line "set X" fix.
- Q: Should preflight have a performance target? → A: No explicit time target (trivially fast operation involving only file reads and env var checks).
- Q: Should default models be auto-applied or suggestion-only for single-provider setups? → A: Auto-apply for single-key setups (gpt-4o for OpenAI, claude-sonnet-4-20250514 for Anthropic); enables "just works" experience.
- Q: Should resolved config tuple include versioning for future debugging? → A: Yes, include schemaVersion (tuple format version) and resolutionVersion (resolution logic version) to prevent "same shape, different meaning" issues.
- Q: How should config wizard behave in non-TTY/CI environments? → A: Refuse to run with clear message unless --defaults or --yes flag provided; output YAML must use deterministic key ordering.
- Q: What happens with 2+ keys but NO MODEL set? → A: Existing implicit precedence (Anthropic > Azure > OpenAI) is preserved for backward compatibility. The hard-fail only triggers when MODEL is explicitly set, creating ambiguity about intent.
- Q: Does Ollama count as "having a key" if OLLAMA_BASE_URL is not set? → A: No. Ollama only counts toward multi-key detection when OLLAMA_BASE_URL is explicitly set. The "optional with default" refers to runtime behavior (defaults to localhost:11434), not key detection.
- Q: What is the "informational message" when explicit provider overrides precedence? → A: A console log at info level: `[preflight] Explicit provider 'X' overrides auto-detected 'Y'`. Not implemented in current version (deferred).
- Q: Are FR-006 (validation) and FR-007 (wizard) the same command? → A: No. They are separate: `ai-review validate --repo <path>` checks existing config; `ai-review config init` generates new config.
- Q: Does "MODEL is set" mean env var or config file? → A: Currently only the `MODEL` env var. The `config.models.default` is NOT checked for multi-key ambiguity (intentional - env var indicates runtime override intent).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - First-Time Setup with a Single LLM Provider (Priority: P1)

A new user wants to set up odd-ai-reviewers for the first time using their OpenAI API key. They should be able to configure the system quickly without understanding the full complexity of provider precedence rules or multi-provider scenarios.

**Why this priority**: First-time setup is the most critical user experience moment. Confusion here leads to abandonment. Simplifying this path reduces friction and support burden significantly.

**Independent Test**: Can be fully tested by setting a single API key and running a review, then verifying the system "just works" without additional configuration.

**Acceptance Scenarios**:

1. **Given** a user has only `OPENAI_API_KEY` set, **When** they run a review without a config file, **Then** the system uses sensible defaults and completes successfully with OpenAI as the provider.
2. **Given** a user has only `ANTHROPIC_API_KEY` set, **When** they run a review, **Then** the system automatically uses Claude models without requiring explicit model configuration.
3. **Given** a user has set a single API key but no model is configured, **When** preflight runs, **Then** the system auto-applies the appropriate default model for that provider (gpt-4o, claude-sonnet-4-20250514, or codellama:7b).

---

### User Story 2 - Clear Error Messages for Common Misconfigurations (Priority: P1)

A user has configured both Anthropic and OpenAI keys, with `MODEL=gpt-4o` specified. They receive a 404 error at runtime because Anthropic wins precedence but doesn't recognize the GPT model name.

**Why this priority**: The model-provider mismatch is the #1 source of confusion and support requests. Clear, actionable error messages prevent wasted debugging time.

**Independent Test**: Can be fully tested by intentionally creating a model-provider mismatch and verifying the error message clearly explains the issue and suggests a fix.

**Acceptance Scenarios**:

1. **Given** a user has set `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` with `MODEL=gpt-4o` but no explicit `provider`, **When** preflight validation runs, **Then** the system fails with a clear error requiring explicit `provider` selection to resolve ambiguity.
2. **Given** a user has an incomplete Azure configuration (only 2 of 3 required variables), **When** preflight runs, **Then** the error message fails with a single-line fix: "set AZURE_OPENAI_DEPLOYMENT" (or whichever value is missing).
3. **Given** a user uses a deprecated environment variable like `OPENAI_MODEL`, **When** preflight runs, **Then** the error message explains the new equivalent (`MODEL`) and provides a migration example.

---

### User Story 3 - Guided Configuration Mode (Priority: P2)

A user wants to create or validate their `.ai-review.yml` configuration interactively. Rather than reading documentation and manually editing YAML, they can answer guided questions and have a valid configuration generated.

**Why this priority**: Reduces the learning curve for new users and prevents syntax errors. While helpful, users can still succeed manually, making this enhancement rather than critical.

**Independent Test**: Can be fully tested by running the configuration wizard from scratch and verifying the generated config is valid and works with the user's environment.

**Acceptance Scenarios**:

1. **Given** a user runs the configuration helper command, **When** they complete the guided prompts, **Then** a valid `.ai-review.yml` file is generated matching their choices.
2. **Given** a user has an existing configuration file, **When** they run the configuration validator, **Then** they receive a summary of their current settings with any issues highlighted.
3. **Given** a user selects Azure OpenAI as their provider in the wizard, **When** prompted for credentials, **Then** the wizard asks for all three required values (key, endpoint, deployment) together with clear explanations of each.

---

### User Story 4 - Simplified Provider Selection (Priority: P2)

A user wants to explicitly choose which LLM provider to use without relying on implicit precedence rules. They should be able to set a single, clear configuration value that overrides the automatic detection.

**Why this priority**: Explicit beats implicit for power users who want full control. This eliminates the "Anthropic always wins" confusion for users who intentionally have multiple keys configured.

**Independent Test**: Can be fully tested by setting both API keys plus an explicit provider preference, then verifying the specified provider is used regardless of precedence rules.

**Acceptance Scenarios**:

1. **Given** a user has both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` set with `MODEL` configured, **When** they add `provider: openai` to their config, **Then** OpenAI is used and preflight succeeds.
2. **Given** a user sets an explicit provider that doesn't match their available keys, **When** preflight runs, **Then** a clear error explains that the specified provider requires the corresponding API key.
3. **Given** a user has only one provider key set (no multi-key ambiguity), **When** the system resolves the provider, **Then** auto-detection works without requiring explicit `provider` config.

---

### User Story 5 - Configuration Documentation and Examples (Priority: P3)

A user wants to understand all available configuration options with practical examples for their specific use case (GitHub vs Azure DevOps, OpenAI vs Anthropic vs Azure OpenAI vs Ollama).

**Why this priority**: Good documentation improves self-service success but is not blocking for basic functionality. Users can discover options through the config schema.

**Independent Test**: Can be fully tested by having a new user follow the documentation to configure their specific platform/provider combination without external help.

**Acceptance Scenarios**:

1. **Given** a user reads the configuration quick-start guide, **When** they follow the steps for their platform (GitHub/ADO), **Then** they have a working configuration in under 5 minutes.
2. **Given** a user wants to use Azure OpenAI, **When** they read the Azure-specific documentation, **Then** they understand that deployment names are custom, not model names, and how to find their deployment name.
3. **Given** a user encounters a configuration error, **When** they search the troubleshooting guide, **Then** they find a matching scenario with a clear resolution.

---

### Edge Cases

- What happens when a user has no API keys configured? (Clear error with setup instructions)
- How does the system handle invalid YAML syntax in the config file? (Helpful parse error with line number)
- What happens when a user's API key is expired or revoked? (Runtime error with suggestion to verify credentials)
- How does the system behave when MODEL is set to an unknown model name? (Warning, not hard failure - allows new models)
- What happens when both explicit provider config and environment variable precedence conflict? (Explicit config wins; informational log deferred to future version)
- What happens when multiple provider keys exist with MODEL env var set but no explicit provider? (Hard fail with clear error requiring `provider` to be set)
- What happens when multiple provider keys exist but MODEL is NOT set? (Existing precedence preserved: Anthropic > Azure > OpenAI. No hard fail for backward compatibility.)
- What happens when only 1 or 2 Azure OpenAI values are set? (Hard fail with single-line "set AZURE_OPENAI_X" fix message, regardless of whether Azure is the intended provider - partial Azure config is always an error)
- What happens when config wizard is run in CI/non-TTY environment? (Refuse with clear message unless --defaults or --yes flag provided)
- Does Ollama count as "having a key" without explicit OLLAMA_BASE_URL? (No - only counts when explicitly set. Runtime defaults to localhost:11434 but this doesn't affect multi-key detection.)

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST auto-apply an appropriate default model when only a single provider's API key is configured (gpt-4o for OpenAI, claude-sonnet-4-20250514 for Anthropic, codellama:7b for Ollama)
- **FR-002**: System MUST provide actionable error messages that include the exact fix needed, not just what's wrong
- **FR-003**: System MUST support an explicit `provider` configuration option that overrides automatic provider detection
- **FR-004**: System MUST fail preflight when multiple provider keys are present AND `MODEL` environment variable is set, unless `provider` is explicitly configured in `.ai-review.yml` (forces clarity). Note: `config.models.default` does NOT trigger this check; only the `MODEL` env var indicates runtime override intent. When 2+ keys exist but MODEL is not set, existing implicit precedence (Anthropic > Azure > OpenAI) is preserved for backward compatibility.
- **FR-005**: System MUST validate model-provider compatibility at preflight time, before any agent execution
- **FR-011**: Preflight MUST print and write to an artifact/log the fully resolved configuration tuple: provider + model + key-source + config-source + schemaVersion + resolutionVersion; this exact resolved tuple MUST be used for the run
- **FR-012**: Azure OpenAI MUST require all 3 values (AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT); missing any value = preflight fail with single-line "set X" fix
- **FR-013**: Azure OpenAI MUST NOT attempt any model defaulting; deployment name is always user-specified
- **FR-006**: System MUST provide a configuration validation command (`ai-review validate --repo <path>`) that loads an existing config file, validates it against the schema, and runs preflight checks to report issues with API keys, provider-model compatibility, etc.
- **FR-007**: System MUST provide a separate guided configuration command (`ai-review config init`) that generates valid YAML from user prompts; wizard MUST refuse to run in non-TTY environments unless --defaults or --yes flag provided; output YAML MUST use deterministic key ordering. This is distinct from FR-006 validation.
- **FR-008**: System MUST include migration guidance when detecting deprecated environment variables
- **FR-009**: System MUST document common configuration scenarios with copy-paste examples
- **FR-010**: System MUST preserve backward compatibility - existing valid configurations must continue to work unchanged

### Key Entities

- **Provider**: An LLM service (OpenAI, Anthropic, Azure OpenAI, Ollama) that requires specific credentials and supports specific models
- **Configuration**: The combined state from `.ai-review.yml` file, environment variables, and defaults - with clear precedence
- **Resolved Config Tuple**: The fully resolved (provider + model + key-source + config-source + schemaVersion + resolutionVersion) that is logged at preflight and locked for the entire run; schemaVersion tracks tuple format, resolutionVersion tracks resolution logic changes
- **Preflight Check**: The validation phase that runs before agent execution to catch configuration issues early and log the resolved config tuple

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: New users can complete first-time setup with a single provider in under 5 minutes without reading documentation
- **SC-002**: 90% of configuration errors are caught at preflight with actionable fix suggestions
- **SC-003**: Model-provider mismatch errors include the exact conflicting values and suggested resolution
- **SC-004**: Configuration validation command covers all known misconfiguration scenarios
- **SC-005**: Guided configuration mode produces valid, working configurations on first attempt
- **SC-006**: Every run logs the resolved config tuple (provider + model + key-source + config-source + schemaVersion + resolutionVersion) at preflight, enabling reproducibility debugging and support ticket triage
- **SC-007**: Azure OpenAI misconfigurations produce single-line actionable fix messages (e.g., "set AZURE_OPENAI_ENDPOINT")

## Assumptions

- Users have basic familiarity with environment variables and YAML syntax
- CI/CD platforms (GitHub Actions, Azure DevOps) are the primary runtime environments
- API key security is handled by the CI/CD platform's secrets management
- The existing preflight validation architecture can be extended without restructuring
- Default models are auto-applied based on provider (claude-sonnet-4-20250514 for Anthropic, gpt-4o for OpenAI, codellama:7b for Ollama) in single-provider scenarios
- Users with multiple provider keys configured are expected to explicitly set `provider` in config (breaking change is acceptable for clarity)

## Scope Boundaries

**In Scope**:

- Improving error messages and validation feedback
- Adding explicit provider selection configuration
- Creating a configuration validation/wizard command
- Updating documentation with examples and troubleshooting
- Auto-detecting sensible defaults for single-provider setups

**Out of Scope**:

- Adding new LLM providers
- Changing the YAML configuration schema structure fundamentally
- GUI or web-based configuration tools
- Credential storage or secrets management (remains with CI/CD platform)

**Breaking Changes (Intentional)**:

- Multi-key + MODEL without explicit `provider` now fails (was implicit precedence)
- Users with both keys set must add `provider: openai` or `provider: anthropic` to their config
