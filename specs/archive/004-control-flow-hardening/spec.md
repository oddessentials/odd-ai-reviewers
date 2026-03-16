# Feature Specification: Control Flow Analysis Hardening

**Feature Branch**: `004-control-flow-hardening`
**Created**: 2026-01-28
**Status**: Draft
**Input**: User description: "1. No timeout on regex execution - While patterns are validated for exponential complexity, consider adding a timeout wrapper for extra safety on custom patterns. 2. Cross-file mitigation documentation - The spec mentions cross-file mitigations are supported 'up to configured call depth' but finding messages don't explicitly indicate when a mitigation was found in a different file."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Protected Analysis from Malicious Patterns (Priority: P1)

As a security team lead configuring custom mitigation patterns, I want the system to protect itself from patterns that could cause excessive processing time, so that the analysis completes reliably even if I accidentally configure a problematic pattern.

**Why this priority**: System stability is foundational. If a single malicious or poorly-constructed pattern can hang the analysis, it undermines trust in the tool and could be exploited to cause denial of service in CI/CD pipelines.

**Independent Test**: Can be fully tested by configuring intentionally problematic regex patterns and verifying the system handles them gracefully without hanging.

**Acceptance Scenarios**:

1. **Given** a custom mitigation pattern with a regex that would take excessive time to match, **When** the pattern is evaluated against code, **Then** the evaluation terminates within a reasonable time limit and the finding is reported with a note indicating pattern evaluation was constrained.
2. **Given** a custom pattern that causes slow matching on specific input, **When** the analysis encounters this condition, **Then** the system continues processing other patterns and files without blocking.
3. **Given** analysis encounters a pattern timeout, **When** generating findings, **Then** the finding clearly indicates that some pattern evaluations were limited and results may be conservative.

---

### User Story 2 - Transparent Cross-File Mitigation Reporting (Priority: P1)

As a developer reviewing code review feedback, I want to clearly understand when a mitigation was found in a different file than the vulnerability, so that I can verify the mitigation actually applies and trust the analysis reasoning.

**Why this priority**: Transparency in cross-file analysis is critical for developer trust. If mitigations are silently detected from other files without explanation, developers cannot verify the analysis is correct and may distrust or ignore valid findings.

**Independent Test**: Can be fully tested by submitting code where a vulnerability in file A is mitigated by validation in file B, and verifying the feedback explicitly mentions the cross-file relationship.

**Acceptance Scenarios**:

1. **Given** a potential vulnerability in file A and a mitigation detected in file B (called from file A), **When** the analysis generates feedback, **Then** the finding message explicitly indicates the mitigation was found in file B at the specified location.
2. **Given** a partial mitigation where some paths are protected by cross-file mitigations and others are not, **When** the analysis generates feedback, **Then** the finding lists which paths are protected by which mitigations and their file locations.
3. **Given** multiple mitigations from different files protecting the same vulnerability, **When** the analysis generates feedback, **Then** all mitigation locations are listed with their respective files.

---

### User Story 3 - Audit Trail for Pattern Evaluation (Priority: P2)

As a security team lead debugging why a pattern didn't match as expected, I want to see detailed logs about pattern evaluation including any timeouts or limitations, so that I can diagnose and fix configuration issues.

**Why this priority**: Debugging capability is important but secondary to core functionality. Without this, troubleshooting pattern configuration is difficult but not impossible.

**Independent Test**: Can be fully tested by running analysis with verbose logging enabled and verifying pattern evaluation details are captured.

**Acceptance Scenarios**:

1. **Given** a pattern that times out during evaluation, **When** verbose logging is enabled, **Then** the logs capture which pattern timed out, on which input, and how the system handled it.
2. **Given** a cross-file mitigation is detected, **When** verbose logging is enabled, **Then** the logs capture the call chain from vulnerability location to mitigation location.

---

### Edge Cases

#### Pattern Timeout Handling

- What happens when a pattern times out mid-file? System continues with remaining patterns; finding notes conservative assumption.
- What happens when multiple patterns timeout on the same file? Each timeout is logged; analysis completes with reduced confidence indicator.
- What happens when timeout occurs on the first pattern? System proceeds to next pattern; no cumulative failure.

#### Cross-File Mitigation Edge Cases

- What happens when mitigation is at maximum call depth? Finding indicates mitigation detected at depth limit; confidence may be reduced.
- What happens when the same mitigation is found via multiple call paths? Only unique mitigations are reported; duplicate paths are consolidated.
- What happens when mitigation file is not in the PR diff? Mitigation is still recognized and reported with full file path.

## Requirements _(mandatory)_

### Functional Requirements

#### Regex Timeout Protection

- **FR-001**: System MUST enforce a maximum execution time for each regex pattern evaluation (default: 100ms per match attempt).
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`
- **FR-002**: System MUST continue analysis when a pattern evaluation times out, treating the timed-out pattern as non-matching for that specific input.
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`
- **FR-003**: System MUST log pattern timeout events with pattern ID, input length, and elapsed time.
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`
- **FR-004**: System MUST indicate in findings when pattern evaluations were constrained due to timeout, so users understand results may be conservative.
  **Test Coverage**: `router/tests/unit/agents/control_flow/finding-generator.test.ts`
- **FR-005**: System MUST allow configuration of the pattern timeout limit within reasonable bounds (10ms-1000ms).
  **Test Coverage**: `router/tests/unit/agents/control_flow/regex-timeout.test.ts`

#### Cross-File Mitigation Transparency

- **FR-006**: System MUST include the file path of each detected mitigation in finding messages when the mitigation is in a different file than the vulnerability.
  **Test Coverage**: `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`
- **FR-007**: System MUST include the line number of cross-file mitigations in finding messages.
  **Test Coverage**: `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`
- **FR-008**: System MUST indicate the call depth at which a cross-file mitigation was detected.
  **Test Coverage**: `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`
- **FR-009**: System MUST list all contributing mitigations when multiple cross-file mitigations protect the same vulnerability.
  **Test Coverage**: `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`
- **FR-010**: Finding messages for partial mitigations MUST specify which paths are protected by which mitigations, including file locations.
  **Test Coverage**: `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`

#### Logging and Audit

- **FR-011**: System MUST log the complete call chain traversed when detecting cross-file mitigations (when verbose logging is enabled).
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`
- **FR-012**: System MUST log all pattern timeout events with sufficient detail for debugging.
  **Test Coverage**: `router/tests/unit/agents/control_flow/logger.test.ts`

### Key Entities

- **PatternEvaluation**: Represents a single pattern match attempt with timeout tracking (pattern ID, input context, start time, result, timed out flag).
- **CrossFileMitigation**: Represents a mitigation detected in a different file (source file, mitigation file, call chain, call depth, mitigation type).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Analysis completes within configured time budget even when 10% of patterns would otherwise cause exponential backtracking.
- **SC-002**: Pattern timeout events are clearly indicated in findings, with 100% of timed-out evaluations documented.
- **SC-003**: Cross-file mitigations include source file location in 100% of cases where mitigation file differs from vulnerability file.
- **SC-004**: Developers can identify the exact file and line of any cross-file mitigation from the finding message alone, without needing to run additional analysis.
- **SC-005**: Pattern evaluation timeouts do not cause analysis to hang or fail; analysis continues with remaining patterns in all cases.
