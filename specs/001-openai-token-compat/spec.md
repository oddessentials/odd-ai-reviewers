# Feature Specification: OpenAI Model Compatibility

**Feature Branch**: `001-openai-token-compat`
**Created**: 2026-02-04
**Status**: Draft
**Input**: User description: "OpenAI Model Compatibility - Enterprise-Grade Deterministic Plan for handling deprecated max_tokens parameter vs max_completion_tokens for o-series models"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Modern Model Support (Priority: P1)

As a developer using modern OpenAI models (o-series), I want the system to automatically use the correct token limit parameter so that my code review requests succeed without manual configuration or errors.

**Why this priority**: Modern o-series models reject the deprecated `max_tokens` parameter entirely, causing complete failure of the code review functionality. This is a blocking issue for users on newer models.

**Independent Test**: Can be fully tested by configuring an o-series model and running a code review - the request should succeed on the first attempt using the preferred parameter.

**Acceptance Scenarios**:

1. **Given** a user has configured an o-series OpenAI model (e.g., o1, o3), **When** the system makes an API request, **Then** the request uses the modern `max_completion_tokens` parameter and succeeds without error.
2. **Given** a user has configured an o-series model, **When** they run a code review, **Then** they receive results without seeing any token parameter compatibility errors.

---

### User Story 2 - Legacy Model Compatibility (Priority: P2)

As a developer using legacy OpenAI models, I want the system to fall back to the traditional token parameter when needed so that my existing workflows continue to function without disruption.

**Why this priority**: Maintains backward compatibility for users who haven't migrated to newer models, ensuring no regressions for existing users.

**Independent Test**: Can be tested by using a legacy model that rejects `max_completion_tokens` - the system should retry once with `max_tokens` and succeed.

**Acceptance Scenarios**:

1. **Given** a user has configured a legacy OpenAI model that rejects `max_completion_tokens`, **When** the system makes an API request that fails with a token parameter compatibility error, **Then** the system automatically retries once with `max_tokens` and succeeds.
2. **Given** a legacy model configuration, **When** the fallback mechanism engages, **Then** the user receives their code review results without needing to take any manual action.

---

### User Story 3 - Deterministic Retry Behavior (Priority: P2)

As a system administrator, I want predictable retry behavior so that I can reason about system behavior, troubleshoot issues, and avoid runaway retry loops.

**Why this priority**: Enterprise environments require predictable behavior for capacity planning, debugging, and incident response.

**Independent Test**: Can be tested by simulating various error scenarios and verifying that retries follow the documented policy (maximum one retry, only for specific compatibility errors).

**Acceptance Scenarios**:

1. **Given** a request fails with a token parameter compatibility error, **When** the retry is attempted, **Then** exactly one retry occurs (no more, no less).
2. **Given** a request fails with any other error type (network, auth, rate limit), **When** the error is caught, **Then** no retry is attempted and the original error is surfaced immediately.
3. **Given** both the initial request and the retry fail, **When** processing completes, **Then** the final error is surfaced without additional retry attempts.

---

### User Story 4 - Configurable Token Limits (Priority: P3)

As a power user, I want to configure the maximum token limit so that I can optimize for my specific use case and model capabilities.

**Why this priority**: Provides flexibility for advanced users while maintaining sensible defaults for typical use cases.

**Independent Test**: Can be tested by setting a custom token limit via configuration and verifying it is used in API requests.

**Acceptance Scenarios**:

1. **Given** a user has set a custom token limit in configuration, **When** the system makes API requests, **Then** the configured limit is used instead of the default.
2. **Given** no custom token limit is configured, **When** the system makes API requests, **Then** a sensible default limit is used.

---

### User Story 5 - Clear Diagnostics (Priority: P3)

As a developer troubleshooting issues, I want clear log messages when the fallback mechanism engages so that I understand what the system is doing and can diagnose problems.

**Why this priority**: Observability is critical for enterprise environments but is not blocking for core functionality.

**Independent Test**: Can be tested by triggering the fallback mechanism and verifying that appropriate log messages appear.

**Acceptance Scenarios**:

1. **Given** the token parameter fallback is triggered, **When** the retry occurs, **Then** a warning-level log message indicates which model triggered the fallback and which parameter was used.
2. **Given** a compatibility error occurs, **When** logs are reviewed, **Then** no sensitive data (API keys, request payloads) is present in the logs.

---

### Edge Cases

- What happens when the API returns an unexpected error format that cannot be classified?
  - The system should treat unclassifiable errors as non-compatibility errors and surface them without retry.

- What happens when the compatibility error message format changes in the API?
  - The error classifier should use robust pattern matching that tolerates minor message variations.

- What happens when both parameter types fail for the same model?
  - After the single retry fails, the final error is surfaced with context indicating a compatibility fallback was attempted.

- What happens when the configured token limit is invalid (negative, zero, extremely large)?
  - The system should validate configuration at startup and reject invalid values with clear error messages.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST attempt API requests using the modern `max_completion_tokens` parameter as the preferred option.
- **FR-002**: System MUST classify token parameter compatibility errors using HTTP 400 (invalid_request) AND robust message pattern matching (mentions both `max_tokens` and `max_completion_tokens` and "not supported").
- **FR-003**: System MUST retry exactly once with the `max_tokens` parameter when a token parameter compatibility error is detected.
- **FR-004**: System MUST NOT retry for any error type other than token parameter compatibility errors (network errors, authentication errors, rate limit errors, etc.).
- **FR-005**: System MUST surface the original error unchanged when it is not a token parameter compatibility error.
- **FR-006**: System MUST surface the retry error with additional context when the fallback retry also fails.
- **FR-007**: System MUST allow users to configure the token limit via a configuration setting.
- **FR-008**: System MUST validate configured token limits are within acceptable bounds (minimum 16, reasonable maximum).
- **FR-009**: System MUST use a default token limit when no custom limit is configured.
- **FR-010**: System MUST log at warning level when the token parameter fallback mechanism is engaged, including model name and parameter used.
- **FR-011**: System MUST NOT log sensitive information (API keys, full request/response payloads) in any log messages.
- **FR-012**: System MUST apply the compatibility handling consistently across all code paths that make OpenAI API calls.
- **FR-013**: The retry request MUST be identical to the first attempt except for swapping the token limit parameter key (`max_completion_tokens` ↔ `max_tokens`).

### Key Entities

- **Token Limit Parameter**: The parameter sent to OpenAI to control response length. Can be either `max_completion_tokens` (modern) or `max_tokens` (legacy).
- **Compatibility Error**: An API error response indicating the token limit parameter used is not supported by the model.
- **Retry Policy**: The rules governing when and how many times to retry failed requests.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Code reviews complete successfully for models that support either `max_completion_tokens` or `max_tokens` under the Chat Completions API, without user intervention for token parameter issues.
- **SC-002**: Maximum of one automatic retry per request for token parameter compatibility errors.
- **SC-003**: Zero sensitive data leakage in log output when fallback mechanism engages.
- **SC-004**: Configuration validation catches 100% of invalid token limit values at startup (before any API calls).
- **SC-005**: Fallback events are logged with sufficient detail to diagnose issues (model name, parameter used, timestamp).
- **SC-006**: Non-compatibility errors surface to users within the same response time as before (no additional latency from unnecessary retries).

## Assumptions

- The OpenAI API will continue to return identifiable error messages when token parameters are incompatible with the requested model.
- Error message patterns for token parameter incompatibility will remain relatively stable or will contain the key terms "max_tokens", "max_completion_tokens", and "not supported".
- Users have valid OpenAI API credentials configured.
- The default token limit of 4000 is appropriate for most use cases.
- A minimum token limit of 16 is sufficient for any meaningful response.

## Out of Scope

- Migration to the OpenAI Responses API (uses `max_output_tokens`).
- Auto-detection of other model capabilities beyond token limit parameter compatibility.
- Per-model token limit optimization or maximum token validation.
- Caching of model capability information.
