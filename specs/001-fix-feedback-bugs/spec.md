# Feature Specification: Fix Feedback Bugs

**Feature Branch**: `001-fix-feedback-bugs`
**Created**: 2026-01-30
**Status**: Complete
**Input**: User description: "FEEDBACK.md - three bugs identified during code review"

## Clarifications

### Session 2026-01-30

- Q: SC-005 math conflict - "8 tests" vs "3 per story + 5 edge case = 14"? → A: Keep at 8; intent is "at least one per story" (3) + "one per edge case" (5) = 8 minimum.
- Q: Node visit check semantics - pre-increment or post-increment? → A: Pre-increment check required. `if (nodesVisited >= max) return` BEFORE incrementing. Guarantees limit=0 → 0 nodes visited.
- Q: Mitigation data contract shape? → A: Require `Mitigation.appliesTo: VulnerabilityType[]`. Self-contained, deterministic, testable.
- Q: FR-006 regex extraction method? → A: Global matching of single-path pattern, not fixed capture groups. Matches actual implementation (matchAll/global regex).
- Q: US3 "no paths found" behavior on malformed lines? → A: Silently skip. Checker validates discovered paths, doesn't enforce presence. Backward compatible.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Accurate Node Visit Limit Enforcement (Priority: P1)

When the control flow analyzer traverses nodes during path analysis, it should respect the configured maximum node limit exactly. Currently, the check uses `>` instead of `>=`, allowing N+1 nodes to be processed when the limit is set to N. This off-by-one error means the guardrail doesn't enforce the boundary it claims to enforce.

**Why this priority**: This is a correctness bug in a safety guardrail. The `maxNodesVisited` variable semantically implies an upper bound, but the current implementation allows exceeding it by one. This undermines the reliability of the limit and could cause unexpected resource consumption in edge cases.

**Independent Test**: Can be fully tested by setting `maxNodesVisited` to a specific value (e.g., 10) and verifying exactly 10 nodes are processed, not 11.

**Acceptance Scenarios**:

1. **Given** a node visit limit of 10, **When** the analyzer processes nodes, **Then** exactly 10 nodes are visited before the limit triggers
2. **Given** a node visit limit of 10000, **When** processing a graph with more than 10000 reachable nodes, **Then** processing stops at exactly 10000 nodes visited
3. **Given** a node visit limit of 1, **When** starting traversal, **Then** only one node is visited before the limit triggers

**Required Verification**: Test that when `nodesVisited` equals `maxNodesVisited`, the check returns early before incrementing (i.e., `>=` comparison instead of `>`).

---

### User Story 2 - Accurate Vulnerability Mitigation Mapping (Priority: P1)

When the path analyzer checks if a code path mitigates a specific vulnerability type, it should verify that the mitigation actually applies to that vulnerability. Currently, `pathMitigatesVulnerability()` returns `true` for any path with any mitigation, regardless of whether that mitigation addresses the specific vulnerability being analyzed. This causes false negatives where real vulnerabilities are incorrectly suppressed.

**Why this priority**: This is a correctness bug that directly impacts security analysis quality. False negatives mean real vulnerabilities go unreported, which defeats the purpose of the analyzer. This bug can occur whenever a path has any mitigation and a different vulnerability type is being checked.

**Independent Test**: Can be fully tested by creating a path with a SQL-injection mitigation and verifying it does NOT suppress an XSS vulnerability finding.

**Acceptance Scenarios**:

1. **Given** a path with a SQL-injection mitigation, **When** checking if it mitigates SQL-injection, **Then** the function returns true
2. **Given** a path with a SQL-injection mitigation, **When** checking if it mitigates XSS, **Then** the function returns false
3. **Given** a path with no mitigations, **When** checking if it mitigates any vulnerability, **Then** the function returns false
4. **Given** a path with multiple mitigations, **When** checking a vulnerability type that one mitigation addresses, **Then** the function returns true

**Required Verification**: Test that `pathMitigatesVulnerability()` only returns true when a mitigation's applicable vulnerability types include the queried vulnerability type.

---

### User Story 3 - Complete Test Coverage Path Validation (Priority: P2)

When the spec link checker validates test coverage paths in specification files, it should verify all paths listed on a line, not just the first two. Currently, the regex pattern only has two capture groups, meaning lines with three or more test paths silently skip validation of the additional paths.

**Why this priority**: This is a correctness bug in the quality enforcement tooling, but has lower immediate impact than the analyzer bugs since it only affects spec validation. However, it means broken test file references could go undetected.

**Independent Test**: Can be fully tested by creating a spec line with three test coverage paths where the third path is invalid, and verifying the checker reports the error.

**Acceptance Scenarios**:

1. **Given** a spec line with three test coverage paths (e.g., path1.ts, path2.ts, path3.ts), **When** the checker runs, **Then** all three paths are validated
2. **Given** a spec line with five test coverage paths, **When** the checker runs, **Then** all five paths are validated
3. **Given** a spec line with two valid paths and one invalid third path, **When** the checker runs, **Then** an error is reported for the invalid third path
4. **Given** a spec line with a single test coverage path, **When** the checker runs, **Then** that single path is validated

**Required Verification**: Test that the checker validates all paths in a comma-separated list, not just the first two.

**Acceptance Behavior**: If a `**Test Coverage**:` line contains **zero valid backtick-quoted paths**, the checker MUST **silently skip the line** with no error or warning.

---

### Edge Cases

Each edge case MUST have a corresponding regression test:

1. **Node limit of zero**: When `maxNodesVisited` is set to 0, no nodes should be processed.
   - **Required Verification**: Verify that setting the limit to 0 causes immediate early return with 0 nodes visited.

2. **Path with empty mitigations array**: When a path has an empty mitigations array, the function should return false without errors.
   - **Required Verification**: Verify `pathMitigatesVulnerability()` returns false for paths with empty mitigations array.

3. **Mitigation with multiple vulnerability types**: When a single mitigation applies to multiple vulnerability types, the function should return true for any of those types.
   - **Required Verification**: Verify that a mitigation mapped to [SQL_INJECTION, COMMAND_INJECTION] returns true for both vulnerability types.

4. **Test coverage line with inconsistent spacing**: When paths have varied spacing (e.g., `\`a.ts\`, \`b.ts\`,\`c.ts\``), all should still be captured.
   - **Required Verification**: Verify path extraction handles varied comma/space patterns between backtick-quoted paths.

5. **Test coverage line with single path**: When only one path is listed, it should be validated without errors.
   - **Required Verification**: Verify single-path lines are handled correctly without regex mismatch.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST enforce the node visit limit exactly at N nodes for a limit of N (not N+1)
- **FR-002**: System MUST enforce the node visit limit using **pre-increment check semantics**: `if (nodesVisited >= maxNodesVisited) return` **before** incrementing `nodesVisited`
- **FR-003**: System MUST determine mitigation applicability by checking whether the queried `VulnerabilityType` is included in `Mitigation.appliesTo`
- **FR-004**: System MUST return false from `pathMitigatesVulnerability()` when no mitigation applies to the queried vulnerability type
- **FR-005**: System MUST validate all test coverage paths listed on a line, regardless of count
- **FR-006**: Extractor MUST validate all backtick-quoted test coverage paths on a line by using global matching of a single-path pattern, not fixed or positional capture groups
- **FR-007**: System MUST pass all existing tests after bug fixes are applied (no regressions)
- **FR-008**: System MUST have **at least one** new regression test per user story (minimum **3** new tests total across user stories)
- **FR-009**: System MUST have a regression test for each listed edge case (minimum 5 edge case tests)

### Key Entities

- **NodeVisitState**: Tracks node traversal progress including `nodesVisited` count and `maxNodesVisited` limit. The limit represents an inclusive upper bound.
- **Mitigation**: Represents a security mitigation detected in code. MUST include `appliesTo: VulnerabilityType[]`, declaring the vulnerability types this mitigation addresses.
- **VulnerabilityType**: Enumeration of vulnerability categories (e.g., SQL_INJECTION, XSS, COMMAND_INJECTION) that mitigations can address.
- **TestCoveragePath**: A backtick-quoted file path in spec documentation that references a test file for validation.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Node visit limit of N results in exactly N nodes visited, verified by test with limit=10 confirming 10 nodes processed
- **SC-002**: Zero false negatives from mitigation type mismatch, verified by test with SQL-injection mitigation not suppressing XSS
- **SC-003**: 100% of test coverage paths validated on multi-path lines, verified by test with 3+ paths
- **SC-004**: All existing tests pass after fixes are applied (0 test failures)
- **SC-005**: Minimum **8** new regression tests added (**≥1 per user story + 1 per edge case**)

## Assumptions

- The mitigation-to-vulnerability-type mapping will be defined as part of implementation (not specified in this feature)
- The existing `VulnerabilityType` enumeration exists and contains appropriate values
- The regex pattern for test coverage extraction can be modified without breaking other functionality
- The `maxNodesVisited` semantics are intended to be an inclusive upper bound (N means "at most N")
