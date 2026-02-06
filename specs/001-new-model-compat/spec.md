# Feature Specification: New Model Compatibility (Opus 4.6 & GPT-5.3-Codex)

**Feature Branch**: `001-new-model-compat`
**Created**: 2026-02-06
**Status**: Draft
**Input**: User description: "Yesterday, 2/5/26, Anthropic and OpenAI both released two new models (Opus 4.6 and GPT-5.3-Codex). Deep research if odd-ai-reviewers is already setup to leverage both of these new models or if we must refactor for one or both."

## Research Findings

### Claude Opus 4.6 (Anthropic) - Released 2026-02-05

**Model ID**: `claude-opus-4-6`
**API Type**: Standard Anthropic Messages API (chat-compatible)
**Context Window**: 200K tokens (default), 1M tokens (beta header)
**Max Output**: 128K tokens

**Current Compatibility Assessment**: **Mostly compatible, minor updates needed**

- The model ID `claude-opus-4-6` follows the `claude-*` prefix convention, so provider inference correctly identifies it as Anthropic
- The current Anthropic SDK supports the standard Messages API used by this model
- No new API parameters are required for basic usage
- The model string is not validated against an allowlist (any string is accepted), so users can set `MODEL=claude-opus-4-6` today
- Default model references in error messages and zero-config still point to `claude-sonnet-4-20250514` - these should be updated to offer Opus 4.6 as an available option
- SDK version may benefit from an update to access new features like adaptive thinking and 1M context beta headers, but basic operation works as-is

### GPT-5.3-Codex (OpenAI) - Released 2026-02-05

**Model ID**: `gpt-5.3-codex`
**API Type**: Chat Completions API support is **deprecated for Codex models** and being removed
**Full API Access**: Not yet available (currently only via ChatGPT app, CLI, IDE extension)

**Current Compatibility Assessment**: **Blocked by existing safeguard - correctly rejected**

- The completions-only model pattern list includes a broad `/codex/i` regex that matches **any model containing "codex"** (case-insensitive)
- This pattern correctly blocks `gpt-5.3-codex` because OpenAI has confirmed Chat Completions API is deprecated for Codex models
- The current error message labels Codex models as "completions-only (Codex/legacy)" which is misleading for modern Codex models like GPT-5.3-Codex
- GPT-5.3-Codex uses a Codex-specific/Agents SDK API rather than the standard Chat Completions API
- Full API access for GPT-5.3-Codex is not yet publicly available
- **Conclusion**: The blocking behavior is correct; only the error messaging needs improvement to accurately describe modern Codex models

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Use Claude Opus 4.6 for Code Reviews (Priority: P1)

A developer wants to use Anthropic's new Claude Opus 4.6 model for code reviews because of its improved reasoning capabilities and expanded context window. They set `MODEL=claude-opus-4-6` in their environment or `.ai-review.yml` and expect the system to work seamlessly.

**Why this priority**: Opus 4.6 is immediately available via the existing API, uses the same Messages API, and users can already use it today by setting the model manually. This validates compatibility and updates references to guide new users.

**Independent Test**: Can be fully tested by configuring `MODEL=claude-opus-4-6` with a valid `ANTHROPIC_API_KEY` and running a code review against a pull request. Delivers immediate value by confirming Opus 4.6 works out of the box.

**Acceptance Scenarios**:

1. **Given** a user has `ANTHROPIC_API_KEY` configured and sets `MODEL=claude-opus-4-6`, **When** they run a code review, **Then** the system successfully routes to Anthropic and returns review results
2. **Given** a user has only `ANTHROPIC_API_KEY` set (single-key setup) with no explicit model, **When** zero-config activates, **Then** error messages and documentation reference Opus 4.6 as an available model option
3. **Given** a user sets `MODEL=claude-opus-4-6` but only has `OPENAI_API_KEY`, **When** preflight runs, **Then** the system shows a provider-model mismatch error with actionable guidance including Opus 4.6

---

### User Story 2 - Clear Feedback for GPT-5.3-Codex Users (Priority: P2)

A developer tries to use GPT-5.3-Codex with odd-ai-reviewers by setting `MODEL=gpt-5.3-codex`. The system provides a clear, informative error explaining why this model is not supported for chat-based reviews and what alternatives are available.

**Why this priority**: Users will naturally try to use the headline new model. A clear, accurate error message prevents confusion and guides them to working alternatives without mislabeling the model as "legacy."

**Independent Test**: Can be tested by setting `MODEL=gpt-5.3-codex` and verifying the preflight error message accurately explains the Codex API incompatibility and suggests alternatives.

**Acceptance Scenarios**:

1. **Given** a user sets `MODEL=gpt-5.3-codex`, **When** preflight validation runs, **Then** the error message explains that Codex models use a different API endpoint not supported for chat-based reviews, and suggests alternatives like `gpt-4o` or `gpt-4o-mini`
2. **Given** a user sets `MODEL=gpt-5.3-codex`, **When** the error is displayed, **Then** it accurately describes the Codex API situation rather than labeling the model as "legacy" or "completions-only"

---

### User Story 3 - Updated Model References in Error Messages (Priority: P2)

A developer setting up odd-ai-reviewers for the first time sees current, relevant model suggestions in error messages and default configurations. The system suggests modern models including Opus 4.6 rather than only older model IDs.

**Why this priority**: While the system works today with manual model specification, updated defaults and suggestions improve onboarding and ensure users know about the latest available options.

**Independent Test**: Can be tested by triggering various error conditions (missing keys, provider mismatches) and verifying error messages reference current models including `claude-opus-4-6`.

**Acceptance Scenarios**:

1. **Given** a user triggers a provider-model mismatch error, **When** the error message is displayed, **Then** suggested Anthropic models include `claude-opus-4-6` alongside existing options
2. **Given** a user runs the config wizard, **When** Anthropic is selected as provider, **Then** `claude-opus-4-6` appears as an available model option

---

### User Story 4 - SDK Compatibility Guidance (Priority: P3)

A developer wants to know whether they can access Opus 4.6's advanced features (adaptive thinking, 1M context window) with the current setup. Documentation provides clear guidance on what works today versus what requires SDK updates.

**Why this priority**: Basic Opus 4.6 usage works with current SDKs. Advanced features are informational and do not block core functionality.

**Independent Test**: Can be tested by verifying documentation accurately describes SDK requirements for basic vs. advanced feature availability.

**Acceptance Scenarios**:

1. **Given** a developer reads the configuration documentation, **When** they look for Opus 4.6 setup guidance, **Then** they find clear instructions distinguishing basic usage (works today) from advanced features (may require SDK updates)

---

### Edge Cases

- What happens when a user sets `MODEL=claude-opus-4-6-20260205` (date-suffixed format)? The system should accept it since model validation is string-based and the `claude-` prefix correctly identifies Anthropic
- What happens when OpenAI eventually releases GPT-5.3-Codex API with chat completions support? The blanket `/codex/i` pattern would need a more targeted approach to distinguish chat-compatible Codex models from legacy ones
- What happens when a user sets `MODEL=gpt-5.3` (without the `-codex` suffix)? The system should accept it as it starts with `gpt-` and does not match the codex pattern
- How does the system handle the 1M context beta header for Opus 4.6? Currently no mechanism exists to pass beta headers to the Anthropic SDK - this is out of scope

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST accept `claude-opus-4-6` as a valid model string and route it to the Anthropic provider without errors
- **FR-002**: System MUST update error messages that suggest Anthropic models to include `claude-opus-4-6` as an available option
- **FR-003**: System MUST provide an accurate, descriptive error message when users configure `gpt-5.3-codex` that explains the Codex API incompatibility rather than mislabeling it as a "legacy" model
- **FR-004**: System MUST distinguish between legacy completions-only models (e.g., `davinci-003`, `curie`) and modern Codex models (e.g., `gpt-5.3-codex`) in error messaging, even though both are blocked from chat-based agents
- **FR-005**: System MUST continue to block all Codex models from being used with chat-based cloud agents, as the Chat Completions API is not supported for these models
- **FR-006**: System MUST update model references in zero-config defaults, error messages, and config wizard to include current model options
- **FR-007**: System MUST NOT require any code changes for users to begin using Opus 4.6 for basic code review functionality (the current architecture already supports arbitrary model strings via the `MODEL` env var)

### Key Entities

- **Model ID**: The string identifier passed to provider APIs (e.g., `claude-opus-4-6`, `gpt-5.3-codex`). Accepted as free-form strings validated only by prefix-based heuristics and completions-only pattern matching
- **Provider**: The service provider resolved by the router (`anthropic`, `openai`, `azure-openai`, `ollama`). Determined by API key presence and optional explicit configuration
- **Completions-Only Pattern**: Regex patterns that identify models incompatible with the Chat Completions API. Currently includes a broad `/codex/i` pattern that catches all Codex-family models

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users can run code reviews with `MODEL=claude-opus-4-6` without any configuration changes beyond setting the model name, completing reviews successfully on first attempt
- **SC-002**: 100% of error messages that suggest Anthropic models include `claude-opus-4-6` as an option
- **SC-003**: Users who attempt to use `gpt-5.3-codex` receive an error message that accurately describes the Codex API incompatibility (not "legacy model") within the first preflight check, with clear guidance to select a working alternative
- **SC-004**: Zero regressions in existing model support - all currently supported models (`gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-20250514`, etc.) continue to work without changes

## Assumptions

- The current Anthropic SDK is sufficient for basic Opus 4.6 usage via the standard Messages API. Advanced features (1M context beta, adaptive thinking) may require SDK updates but are out of scope
- OpenAI GPT-5.3-Codex will not gain Chat Completions API support, as OpenAI has stated this endpoint is deprecated for Codex models. If this changes, a follow-up feature will be needed
- The model ID format `claude-opus-4-6` (without date suffix) is the canonical API identifier based on current Anthropic documentation
- Full API access for GPT-5.3-Codex is not yet available and supporting a new Codex-specific API endpoint is out of scope

## Scope Boundaries

### In Scope

- Updating error messages and model suggestions to reference Opus 4.6
- Improving the Codex rejection error message to accurately describe modern Codex models
- Verifying existing architecture handles Opus 4.6 without code changes
- Updating default model documentation and config wizard references

### Out of Scope

- Implementing a new Codex/Agents SDK integration for GPT-5.3-Codex
- Adding support for Anthropic beta headers (1M context window)
- Changing the default auto-applied model from `claude-sonnet-4-20250514` to `claude-opus-4-6` (this is a pricing decision users should opt into)
- SDK version upgrades beyond what is needed for basic compatibility
