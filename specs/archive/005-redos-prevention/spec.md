# Feature Specification: ReDoS Prevention and Testing Improvements

**Feature Branch**: `005-redos-prevention`
**Created**: 2026-01-28
**Status**: Draft
**Input**: User description: Code review feedback requesting ReDoS prevention improvements with regex pattern validation, unit tests for cross-file mitigations, and enhanced error handling for the TimeoutRegex class.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Safe Regex Pattern Validation (Priority: P1)

As a security engineer configuring custom mitigation patterns, I want the system to validate regex patterns before execution to prevent catastrophic backtracking, so that the analysis remains secure and responsive even with user-provided patterns.

**Why this priority**: Preventing denial-of-service attacks is foundational to system security. Without pattern validation, malicious or poorly-constructed patterns could block the analysis entirely.

**Independent Test**: Can be fully tested by providing known ReDoS-vulnerable patterns and verifying they are rejected or sanitized before execution.

**Acceptance Scenarios**:

1. **Given** a regex pattern with known ReDoS vulnerability characteristics (e.g., nested quantifiers like `(a+)+`), **When** the pattern is submitted for use, **Then** the system rejects the pattern with a clear error message explaining the issue.
2. **Given** a user-provided regex pattern, **When** the system evaluates it, **Then** the pattern is validated against a ReDoS detection algorithm before any execution attempt.
3. **Given** a pattern that passes validation, **When** execution still exceeds timeout limits, **Then** the system gracefully terminates and logs the unexpected behavior for review.

---

### User Story 2 - Comprehensive Edge Case Testing (Priority: P1)

As a development team member, I want comprehensive unit tests covering edge cases for cross-file mitigation tracking and regex timeout functionality, so that the system behaves reliably under all conditions and regressions are caught early.

**Why this priority**: Testing ensures system reliability and maintainability. Without comprehensive tests, future changes could silently break critical security features.

**Independent Test**: Can be fully tested by running the test suite and verifying coverage of edge cases including timeout scenarios, cross-file tracking boundaries, and error conditions.

**Acceptance Scenarios**:

1. **Given** the test suite, **When** tests are executed, **Then** they cover edge cases for cross-file mitigations including maximum call depth, circular references, and multi-path scenarios.
2. **Given** the TimeoutRegex class, **When** tests are executed, **Then** they verify timeout behavior under various load conditions and pattern complexities.
3. **Given** pattern validation logic, **When** tests are executed, **Then** they cover known ReDoS pattern categories and boundary conditions.

---

### User Story 3 - Graceful Regex Error Handling (Priority: P2)

As an operator running the analysis tool, I want the system to handle regex errors gracefully without crashing, so that one problematic pattern doesn't halt the entire analysis workflow.

**Why this priority**: Robustness improves user experience but is secondary to preventing the attack vector itself. Users can tolerate occasional errors if they're handled gracefully.

**Independent Test**: Can be fully tested by providing malformed regex patterns and verifying the system continues operation with appropriate error reporting.

**Acceptance Scenarios**:

1. **Given** a regex pattern that causes a runtime error, **When** the pattern is evaluated, **Then** the error is caught and logged without crashing the analysis.
2. **Given** catastrophic backtracking occurs despite validation, **When** the timeout triggers, **Then** the system releases resources and continues with the next pattern.
3. **Given** multiple patterns fail in sequence, **When** the analysis completes, **Then** all failures are summarized in the output for operator review.

---

### User Story 4 - Enhanced Logging for Auditing (Priority: P3)

As a security auditor reviewing analysis results, I want the logging system to capture all pattern timeout and cross-file mitigation events with sufficient detail, so that I can verify the analysis behaved correctly and audit decisions made.

**Why this priority**: Audit capability supports compliance and debugging but doesn't affect core functionality. The system works without detailed logs.

**Independent Test**: Can be fully tested by enabling verbose logging and verifying all new log categories are correctly recorded and retrievable.

**Acceptance Scenarios**:

1. **Given** verbose logging is enabled, **When** a pattern timeout occurs, **Then** the log entry includes pattern ID, input characteristics, timeout duration, and handling action.
2. **Given** a cross-file mitigation is detected, **When** logged, **Then** the entry includes source file, mitigation file, call chain, and confidence level.
3. **Given** audit queries for a specific analysis run, **When** reviewing logs, **Then** all pattern evaluation decisions are traceable.

---

### Edge Cases

#### Pattern Validation Edge Cases

- What happens when a pattern uses advanced regex features (lookahead/lookbehind)? System validates these patterns using specific rules for their complexity characteristics.
- What happens when a pattern is valid but extremely slow on certain inputs? Timeout protection activates as a secondary defense layer.
- What happens when validation library itself hangs? Validation has its own timeout (shorter than execution timeout).

#### Cross-File Mitigation Testing Edge Cases

- What happens when testing circular call chains? Tests verify detection and graceful handling without infinite loops.
- What happens when mitigation depth exceeds configuration? Tests verify appropriate confidence reduction and reporting.
- What happens when files are added/removed mid-analysis? Tests verify consistent state handling.

#### Error Handling Edge Cases

- What happens when regex compilation fails? Error is caught at compile time, pattern skipped with warning.
- What happens when memory limits are approached during matching? System monitors resource usage and terminates problematic evaluations.
- What happens when multiple threads encounter timeouts simultaneously? Tests verify thread-safe timeout handling.

## Requirements _(mandatory)_

### Functional Requirements

#### ReDoS Pattern Validation

- **FR-001**: System MUST validate all user-provided regex patterns against known ReDoS vulnerability patterns before execution.
  **Test Coverage**: `router/tests/unit/agents/control_flow/pattern-validator.test.ts`
- **FR-002**: System MUST reject patterns containing nested quantifiers (e.g., `(a+)+`, `(a*)*`) with a clear error message.
  **Test Coverage**: `router/tests/unit/agents/control_flow/pattern-validator.test.ts`
- **FR-003**: System MUST reject patterns with overlapping alternations that could cause exponential backtracking.
  **Test Coverage**: `router/tests/unit/agents/control_flow/pattern-validator.test.ts`
- **FR-004**: System MUST provide a validation function that can be called independently of pattern execution.
  **Test Coverage**: `router/tests/unit/agents/control_flow/pattern-validator.test.ts`
- **FR-005**: System MUST allow whitelisting of specific patterns that have been manually verified as safe despite triggering validation rules.
  **Test Coverage**: `router/tests/unit/agents/control_flow/pattern-validator.test.ts`

#### Enhanced Error Handling

- **FR-006**: TimeoutRegex class MUST catch and handle all regex runtime errors without propagating exceptions to callers.
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`
- **FR-007**: System MUST log all caught regex errors with pattern, input context, and error details.
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`
- **FR-008**: System MUST track cumulative timeout/error counts per analysis run for summary reporting.
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`
- **FR-009**: System MUST release all resources (threads, memory) when terminating a timed-out regex evaluation.
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`

#### Unit Test Coverage

- **FR-010**: Test suite MUST include tests for cross-file mitigation edge cases: maximum depth, circular references, multi-path mitigations.
  **Test Coverage**: `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`
- **FR-011**: Test suite MUST include tests for TimeoutRegex behavior: normal execution, timeout triggering, error handling, resource cleanup.
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`
- **FR-012**: Test suite MUST include tests for pattern validation: known ReDoS patterns, edge cases, false positive prevention.
  **Test Coverage**: `router/tests/unit/agents/control_flow/pattern-validator.test.ts`
- **FR-013**: Test suite MUST achieve minimum 80% code coverage for modified files.
  **Test Coverage**: `router/vitest.config.ts` (coverage thresholds configured)

#### Logging Enhancements

- **FR-014**: System MUST log pattern timeout events in a structured format suitable for automated analysis.
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`
- **FR-015**: System MUST log cross-file mitigation discoveries with complete call chain information.
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`
- **FR-016**: Logging MUST include timestamps, correlation IDs, and severity levels for all security-relevant events.
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`

### Key Entities

- **PatternValidationResult**: Represents the outcome of validating a regex pattern (pattern, is_valid, rejection_reasons, suggested_alternatives).
- **TimeoutEvent**: Represents a pattern execution timeout (pattern_id, input_length, timeout_duration, recovery_action).
- **CrossFileMitigationTest**: Represents a test case for cross-file mitigation (source_file, mitigation_file, expected_detection, call_depth).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Known ReDoS patterns (from standard test suites) are rejected by validation in 100% of cases.
- **SC-002**: No regex execution can block the system for longer than the configured timeout (default 100ms) plus 10% tolerance.
- **SC-003**: Test coverage for timeout-regex.ts, mitigation-detector.ts, and types.ts reaches minimum 80%.
- **SC-004**: All pattern timeout and cross-file mitigation events are logged with complete context information.
- **SC-005**: The system handles 1000 consecutive pattern timeouts without memory leaks or degraded performance.
- **SC-006**: False positive rate for pattern validation (rejecting safe patterns) is below 5% on standard regex benchmarks.

## Assumptions

- Industry-standard ReDoS detection approaches (static analysis of pattern structure) are sufficient for most cases.
- The existing TypeScript compiler API provides adequate AST parsing for cross-file analysis.
- Vitest testing framework supports the mocking and timing controls needed for timeout testing.
- Performance overhead of pattern validation is acceptable (target: <1ms per pattern).
