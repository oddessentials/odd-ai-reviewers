# Feature Specification: Local Review Improvements

**Feature Branch**: `001-local-review-improvements`
**Created**: 2026-02-03
**Status**: Draft
**Input**: Improve local review CLI: add local-review alias, consolidate resolveBaseRef into resolveDiffRange, add negative tests for malformed ranges, improve test cleanup, add loadConfigFromPath error tests, add defensive check for undefined rangeSpec, and document three-dot vs two-dot behavior

## Clarifications

### Session 2026-02-03

- Q: How should `local-review` be implemented? → A: True alias via Commander's `.alias()` mechanism on existing `local` command (not a second command), ensuring flags/help/exit codes are guaranteed identical.
- Q: How should range parsing detect operators? → A: Explicit operator scan checking `...` first, then `..`; reject inputs with multiple operators deterministically; validate non-empty trimmed refs on both sides.
- Q: How should malformed vs invalid ref errors be distinguished? → A: Separate error classes—malformed inputs fail before any git calls with validation error; valid-looking ranges with nonexistent refs fail after git validation with distinct "ref not found" / "invalid git ref" message.
- Q: How should the diff-mode invariant be enforced? → A: Compute single `ResolvedDiffMode` (`uncommitted | staged | range`) after CLI parsing; construct `rangeSpec` from it; throw programmer error with clear invariant message if missing.
- Q: How should `resolveBaseRef` be handled? → A: Remove from public exports unless proven externally required; if external dependency exists, keep as thin deprecated wrapper delegating to `resolveDiffRange`.
- Q: How should test cleanup be made deterministic? → A: Centralized `makeTempRepo()` helper registering cleanup in `afterEach` and `afterAll` as backstop; assert cleanup by checking temp root is empty at end of each test file.
- Q: What config error paths need coverage? → A: ENOENT (missing), deletion race, EACCES (unreadable), malformed YAML, schema validation failure—each with assertions on error type/code/message.
- Q: What verification approach for CLI? → A: Integration test matrix running both entrypoints (`local`, `local-review`), representative ranges (`main...HEAD`, `main..HEAD`), and at least 5 malformed ranges—asserting exit codes and exact error classes/messages.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - CLI Command Discoverability (Priority: P1)

As a developer using the CLI tool, I want to be able to use `ai-review local-review` as a command so that I can discover the feature through intuitive naming that matches documentation and expectations.

**Why this priority**: Command discoverability directly impacts user adoption and reduces friction. Users who cannot find a command may assume the feature doesn't exist.

**Independent Test**: Can be fully tested by running `ai-review local-review .` and verifying it executes the same as `ai-review local .`

**Implementation Constraint**: Must use Commander's `.alias()` mechanism on the existing `local` command (not create a second command) to guarantee flags, help text, and exit codes are identical.

**Acceptance Scenarios**:

1. **Given** a user has the CLI installed, **When** they run `ai-review local-review .`, **Then** the local review executes successfully (identical to `ai-review local .`)
2. **Given** a user runs `ai-review --help`, **When** they look at available commands, **Then** `local-review` appears as an alias option for the local command
3. **Given** a user types `ai-review local-rev` and presses tab (where shell completion is configured), **When** completion is triggered, **Then** `local-review` is suggested as an option
4. **Given** a user runs `ai-review local-review --help`, **When** the help output is compared to `ai-review local --help`, **Then** the outputs are identical
5. **Given** both `local` and `local-review` commands are invoked with the same arguments, **When** execution completes, **Then** both call the same handler function

---

### User Story 2 - Robust Error Handling for Invalid Diff Ranges (Priority: P1)

As a developer running local reviews, I want clear error messages when I provide malformed range strings so that I can quickly correct my input rather than encountering cryptic failures.

**Why this priority**: Invalid input handling prevents user confusion and support burden. Clear errors enable self-service debugging.

**Independent Test**: Can be fully tested by providing various malformed range inputs and verifying appropriate error messages

**Implementation Constraint**: Range parsing must use explicit operator scan (check `...` first, then `..`); must not split on `.`. Must detect first operator occurrence, ensure exactly one operator exists, and validate non-empty trimmed refs on both sides. Malformed inputs must fail with validation error BEFORE any git calls; valid-looking ranges with nonexistent refs must fail AFTER git validation with distinct "ref not found" / "invalid git ref" error class.

**Acceptance Scenarios**:

1. **Given** a user provides a range with multiple operators like `main..feature..extra`, **When** the CLI parses this input, **Then** a validation error indicates the range format is invalid (before any git calls)
2. **Given** a user provides an empty range like `..`, **When** the CLI parses this input, **Then** a validation error indicates that both base and head refs are required
3. **Given** a user provides a range with only an operator like `...`, **When** the CLI parses this input, **Then** a validation error indicates that refs are missing
4. **Given** a user provides whitespace-only components like `..`, **When** the CLI parses this input, **Then** a validation error indicates that refs cannot be empty
5. **Given** a user provides `a..b..c` (multiple two-dot operators), **When** the CLI parses this input, **Then** a validation error is returned before any git calls
6. **Given** a user provides a valid-looking range `main...nonexistent-branch`, **When** git validation runs, **Then** a distinct "ref not found" error is returned (not a malformed range error)

---

### User Story 3 - Clear Understanding of Diff Behavior (Priority: P2)

As a developer who is familiar with git, I want documentation explaining the difference between two-dot (..) and three-dot (...) range operators so that I understand what changes will be reviewed.

**Why this priority**: Documentation prevents confusion and mismatched expectations about what code is being reviewed.

**Independent Test**: Can be verified by reading the documentation and confirming it explains both operators and the default behavior

**Implementation Constraint**: Documentation must appear in both CLI help text and README. Tests must assert the default operator used when `--range` is provided without an explicit operator and verify help text includes the explanation.

**Acceptance Scenarios**:

1. **Given** a user reads the CLI help text or README, **When** they look for range documentation, **Then** they find an explanation of `..` vs `...` operators
2. **Given** the documentation explains both operators, **When** a user reads it, **Then** they understand that `...` (three-dot) is the default and why (shows only feature branch changes)
3. **Given** a user wants to use two-dot behavior, **When** they read the documentation, **Then** they know how to explicitly specify `..` in their range
4. **Given** a user provides `--range main` (base only, no operator), **When** the system infers the full range, **Then** the default operator `...` is used

---

### User Story 4 - Reliable Test Suite Execution (Priority: P2)

As a contributor to the codebase, I want the test suite to reliably clean up temporary files and handle error conditions so that tests are deterministic and CI pipelines remain stable.

**Why this priority**: Reliable tests enable confident refactoring and prevent flaky CI failures that waste developer time.

**Independent Test**: Can be verified by running the test suite multiple times and confirming no leftover temp files and consistent results

**Implementation Constraint**: Centralized `makeTempRepo()` (or similar) helper must register cleanup in `afterEach` and also in `afterAll` as a backstop. Tests must assert cleanup by checking the temp root directory is empty at end of each test file. One "intentional failure" test must throw mid-test and confirm cleanup still ran.

**Acceptance Scenarios**:

1. **Given** a test fails during execution, **When** the test run completes (including cleanup hooks), **Then** all temporary directories created by tests are removed
2. **Given** a config file exists at check time but is deleted before read (race condition), **When** the system attempts to load it, **Then** an ENOENT-style error is returned with clear message
3. **Given** a config file contains malformed YAML, **When** the system attempts to load it, **Then** a clear parsing error is returned with context about the issue (error type and message asserted)
4. **Given** a config file fails schema validation, **When** the system attempts to load it, **Then** specific validation errors are reported indicating which fields are invalid (error code asserted)
5. **Given** a test intentionally throws mid-execution, **When** the test suite completes, **Then** cleanup hooks still execute and temp directories are removed
6. **Given** a config file has restricted permissions (EACCES), **When** the system attempts to load it, **Then** an appropriate permissions error is returned (where platform-feasible)

---

### User Story 5 - Defensive Runtime Protection (Priority: P3)

As a maintainer of the codebase, I want defensive checks preventing undefined diff ranges so that future code changes cannot silently introduce bugs that produce incorrect or empty diffs.

**Why this priority**: Defensive coding prevents subtle bugs from reaching production and makes debugging easier when invariant violations occur.

**Independent Test**: Can be verified by reviewing code coverage and attempting to trigger the defensive path through edge case testing

**Implementation Constraint**: After CLI parsing, compute a single `ResolvedDiffMode` (`uncommitted | staged | range`) and construct `rangeSpec` from it. If `rangeSpec` is missing, throw a programmer error (not user error) with a clear invariant message. Unit test must force the invariant path (e.g., call `getLocalDiff()` with an invalid options object) and assert the exact error.

**Acceptance Scenarios**:

1. **Given** neither `stagedOnly`, `uncommitted`, nor a base/head range is set, **When** `getLocalDiff()` is called, **Then** an explicit programmer error is thrown with invariant message (not undefined behavior)
2. **Given** the defensive check is triggered, **When** the error is thrown, **Then** the error message clearly indicates that no diff range was specified and this is an internal invariant violation

---

### User Story 6 - Clean Internal API Surface (Priority: P3)

As a maintainer of the codebase, I want the deprecated `resolveBaseRef` function to be properly handled so that the API surface is clear and contributors know which functions to use.

**Why this priority**: API hygiene reduces confusion for contributors and prevents usage of deprecated patterns.

**Independent Test**: Can be verified by checking exports and confirming either deprecation notice or removal of `resolveBaseRef`

**Implementation Constraint**: Perform repo-wide search and exported-surface check. If external dependency exists, keep `resolveBaseRef` only as a thin deprecated wrapper that delegates to `resolveDiffRange` and logs/annotates deprecation. Add a test ensuring no internal code uses `resolveBaseRef` directly.

**Acceptance Scenarios**:

1. **Given** `resolveDiffRange` is the preferred API, **When** a contributor searches for available exports, **Then** `resolveBaseRef` either has a deprecation notice or is not exported
2. **Given** `resolveBaseRef` is used externally, **When** that dependency is confirmed, **Then** a deprecation notice is added pointing to `resolveDiffRange`
3. **Given** `resolveBaseRef` is not used externally, **When** the API is reviewed, **Then** the function is removed from exports entirely
4. **Given** internal code is audited, **When** searching for `resolveBaseRef` usage, **Then** no internal code calls it directly (all use `resolveDiffRange`)

---

### Edge Cases

- What happens when a user provides a range with invalid git refs (non-existent branches)? → Distinct `ValidationErrorCode.INVALID_GIT_REF` error after git validation (not malformed range error)
- How does the system handle extremely long branch names that may exceed limits? → Deferred to git; if git accepts the ref, so do we. No additional validation beyond existing `assertSafeGitRef()`.
- What happens when the git repository is in a detached HEAD state? → `HEAD` is used as the implicit head ref when only base is specified (e.g., `--range main` becomes `main...HEAD`). Works normally. **Regression test required** (T047).
- How does the system behave when running in a non-git directory with range options? → Existing `inferGitContext()` fails with clear "not a git repository" error before range parsing is attempted.
- What happens when config file permissions prevent reading? → `ConfigErrorCode.FILE_UNREADABLE` error returned where platform-feasible

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST accept `local-review` as a true alias (via Commander's `.alias()`) for the `local` command with identical flags, help, and exit codes
- **FR-002**: System MUST reject range strings containing multiple operators (e.g., `a..b..c`) with a validation error before any git calls
- **FR-003**: System MUST reject empty range strings (e.g., `..`, `...`) with a validation error before any git calls
- **FR-004**: System MUST reject range strings with whitespace-only components with a validation error before any git calls
- **FR-005**: System MUST provide documentation explaining two-dot vs three-dot range operator behavior in CLI help and README
- **FR-006**: System MUST throw an explicit programmer error when no diff range is specified after option resolution (invariant violation)
- **FR-007**: Test suite MUST clean up temporary directories even when tests fail, using centralized `makeTempRepo()` helper with `afterEach`/`afterAll` hooks
- **FR-008**: System MUST handle config file deletion race conditions gracefully with ENOENT-style error messages
- **FR-009**: System MUST report clear parsing errors for malformed YAML config files with error type/code/message
- **FR-010**: System MUST report specific validation errors for config files that fail schema validation with field-level detail
- **FR-011**: System MUST remove `resolveBaseRef` from public exports (or keep as deprecated wrapper if external usage proven)
- **FR-012**: Range parsing MUST use explicit operator scan (`...` first, then `..`), not string splitting on `.`
- **FR-013**: System MUST distinguish "malformed range" errors (validation, before git) from "ref not found" errors (after git validation)
- **FR-014**: System MUST compute `ResolvedDiffMode` (`uncommitted | staged | range`) after CLI parsing to construct `rangeSpec`

### Test Requirements

- **TR-001**: Tests MUST assert `ai-review local-review --help` matches `ai-review local --help`
- **TR-002**: Tests MUST verify both `local` and `local-review` call the same handler
- **TR-003**: Tests MUST include negative cases: `a..b..c`, `main..feature..extra`, `..`, `...`, whitespace-only components
- **TR-004**: Tests MUST simulate config errors: ENOENT, deletion race, EACCES (where feasible), malformed YAML, schema validation failure
- **TR-005**: Tests MUST include one "intentional failure" test confirming cleanup still runs
- **TR-006**: Tests MUST assert temp root directory is empty at end of each test file
- **TR-007**: Tests MUST verify no internal code uses `resolveBaseRef` directly
- **TR-008**: Tests MUST assert default operator is `...` when `--range` provided without explicit operator
- **TR-009**: Integration test matrix MUST run: `ai-review local .`, `ai-review local-review .`, `ai-review local --range main...HEAD`, `ai-review local --range main..HEAD`, and at least 5 malformed ranges
- **TR-010**: Integration tests MUST assert exit codes and exact error classes/messages

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of existing CLI functionality works identically with both `local` and `local-review` commands
- **SC-002**: All malformed range inputs produce user-friendly validation errors (no stack traces or cryptic errors visible to users) before any git calls
- **SC-003**: Test suite achieves 100% cleanup of temporary resources across 100 consecutive test runs
- **SC-004**: Documentation coverage includes explanation of range operators accessible from CLI help and README
- **SC-005**: Zero undefined behavior paths remain in diff range resolution (verified through code review and invariant test)
- **SC-006**: All new error handling paths have corresponding test coverage (measured by coverage reports)
- **SC-007**: Error classification is 100% accurate: malformed ranges never trigger git calls; invalid refs always produce distinct error class

## Assumptions

- The CLI framework (Commander.js) supports adding aliases to existing commands via `.alias()` method
- External consumers of `resolveBaseRef` (if any) can be identified through code search
- The test framework (Vitest) supports beforeEach/afterEach/afterAll hooks for reliable cleanup
- Users familiar with git will understand range operator documentation written with standard git terminology
- The existing error types and patterns in the codebase are suitable for the new error conditions
- Platform-specific file permission tests (EACCES) may be skipped on Windows where not feasible
