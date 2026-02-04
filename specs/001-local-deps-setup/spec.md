# Feature Specification: CLI Local Review Dependency Setup

**Feature Branch**: `001-local-deps-setup`
**Created**: 2026-02-02
**Status**: Draft
**Input**: User description: "We recently added a CLI tool that is supposed to allow the user to use our review team on their local code repository. However, when we tried to review our own repo we quickly learned that semgrep and other dependencies aren't installed. We need to make them a part of the CLI tool or, at least, notify the user what needs to be done. This entire process needed to be tested thoroughly locally against this repo and another repo before we claim victory."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - First-Time Setup with Missing Dependencies (Priority: P1)

A developer installs the `ai-review` CLI tool and runs `ai-review local` or `ai-review .` for the first time on their local repository. They have never installed semgrep or reviewdog. The CLI detects that required external tools are missing and provides clear, actionable guidance on how to install them.

**Why this priority**: This is the critical first-run experience. Without dependency guidance, users cannot use the tool at all and will abandon it immediately.

**Independent Test**: Can be fully tested by running `ai-review local .` with semgrep/reviewdog not installed and verifying actionable error messages appear.

**Acceptance Scenarios**:

1. **Given** semgrep is not installed, **When** user runs `ai-review local .` with a pass that uses semgrep agent, **Then** the CLI displays a clear error message explaining semgrep is required and provides installation instructions for the user's detected platform (Windows, macOS, Linux).

2. **Given** reviewdog is not installed, **When** user runs `ai-review local .` with a pass that uses reviewdog agent, **Then** the CLI displays a clear error message explaining reviewdog is required and provides installation instructions for the user's detected platform.

3. **Given** both semgrep and reviewdog are missing, **When** user runs `ai-review local .` with passes that need both, **Then** the CLI displays all missing dependencies in a single consolidated message (not multiple separate errors).

4. **Given** only AI-based agents are configured (no semgrep/reviewdog), **When** user runs `ai-review local .`, **Then** no external tool dependency errors are shown (AI agents only need API keys, not local binaries).

---

### User Story 2 - Dependency Check Command (Priority: P2)

A developer wants to verify their environment is correctly set up before running a full review. They can run a dedicated check command that validates all required dependencies are present and properly configured.

**Why this priority**: Provides proactive validation without running a full review, helping users debug setup issues efficiently.

**Independent Test**: Can be fully tested by running `ai-review check` (or equivalent) and verifying it reports the status of all required dependencies.

**Acceptance Scenarios**:

1. **Given** all required dependencies are installed, **When** user runs `ai-review check`, **Then** the CLI displays a success message confirming all tools are available with their detected versions.

2. **Given** semgrep is missing, **When** user runs `ai-review check`, **Then** the CLI displays which tools are missing and platform-specific installation instructions.

3. **Given** semgrep is installed but an outdated version, **When** user runs `ai-review check`, **Then** the CLI displays a warning with the installed version and recommended version.

---

### User Story 3 - Graceful Degradation with Partial Dependencies (Priority: P3)

A developer has semgrep installed but not reviewdog. The CLI should still be able to run passes that only require available tools, skipping unavailable passes with clear messaging.

**Why this priority**: Allows users to get partial value from the tool while they complete their setup, reducing friction.

**Independent Test**: Can be fully tested by running `ai-review local .` with semgrep installed but reviewdog missing, verifying semgrep passes run while reviewdog passes are skipped with a message.

**Acceptance Scenarios**:

1. **Given** semgrep is installed but reviewdog is not, **When** user runs `ai-review local .` with passes using both agents, **Then** semgrep passes execute successfully while reviewdog passes are skipped with a warning explaining the missing dependency.

2. **Given** a pass is marked as `required: false` and its agent's dependency is missing, **When** user runs `ai-review local .`, **Then** the pass is skipped with an informational message (not an error).

3. **Given** a pass is marked as `required: true` and its agent's dependency is missing, **When** user runs `ai-review local .`, **Then** the CLI exits with a non-zero status code and a clear error message about the missing required dependency.

---

### User Story 4 - Installation Instructions by Platform (Priority: P4)

Installation instructions vary by operating system. The CLI should detect the user's platform and provide the most appropriate installation method.

**Why this priority**: Reduces user confusion by providing platform-specific guidance rather than generic instructions.

**Independent Test**: Can be fully tested on different platforms (Windows, macOS, Linux) by running with missing dependencies and verifying platform-appropriate instructions appear.

**Acceptance Scenarios**:

1. **Given** user is on macOS, **When** CLI detects missing semgrep, **Then** instructions include `brew install semgrep` as the primary method.

2. **Given** user is on Windows, **When** CLI detects missing semgrep, **Then** instructions include `pip install semgrep` and note about Python requirement.

3. **Given** user is on Linux, **When** CLI detects missing semgrep, **Then** instructions include both `pip install semgrep` and package manager options where available.

4. **Given** user is on any platform, **When** CLI detects missing reviewdog, **Then** instructions include the GitHub releases download URL and platform-specific binary name.

---

### Edge Cases

- What happens when semgrep is installed but not in PATH? CLI should detect this and suggest PATH configuration.
- How does system handle when semgrep exists but returns an error on `--version` check? CLI reports the tool as "unhealthy" with an advisory warning, allows execution to proceed, and provides manual verification steps (e.g., "run `semgrep --version` manually to diagnose").
- What if Python is not installed (required for semgrep on some platforms)? CLI should detect and report Python as a prerequisite.
- What happens when running in a CI environment vs local? CI environments typically use Docker (which bundles dependencies), so local-specific messaging should only appear in local mode.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST detect the presence or absence of semgrep binary in the user's PATH before executing passes that require it; checking occurs only when configured passes for this run use semgrep.
- **FR-002**: System MUST detect the presence or absence of reviewdog binary in the user's PATH before executing passes that require it; checking occurs only when configured passes for this run use reviewdog.
- **FR-003**: System MUST provide platform-specific installation instructions when external dependencies are missing (Windows, macOS, Linux detection).
- **FR-004**: System MUST consolidate multiple missing dependency errors into a single user-friendly message rather than failing one at a time.
- **FR-005**: System MUST support a dependency check command (`ai-review check` or similar) that validates environment setup without running a full review.
- **FR-006**: System MUST gracefully skip optional passes when their dependencies are missing, with informational messaging; exit code remains 0 if only optional passes were skipped.
- **FR-007**: System MUST fail with a non-zero exit code and consolidated error message when any required pass has missing dependencies, regardless of whether other passes succeeded.
- **FR-008**: System MUST detect installed versions of external tools and warn if they are below recommended versions.
- **FR-009**: System MUST include documentation links in error messages for users who need more detailed setup guidance.
- **FR-010**: System MUST maintain a centralized dependency catalog (single source of truth) containing all external tool metadata to ensure consistent, maintainable install guidance across the codebase.

### Key Entities

- **ExternalDependency**: Centralized catalog entry for a required external tool (name, version check command, minimum version, per-platform install instructions map, documentation URL). All dependency metadata lives in a single registry to prevent instruction drift and ensure consistent guidance.
- **DependencyCheckResult**: Status of a dependency check (available, missing, unhealthy, version-mismatch). "Unhealthy" = binary exists but version check failed or returned unparseable output; execution proceeds with advisory warning and manual verification steps.
- **PlatformInfo**: Detected operating system and available package managers

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users encountering missing dependencies receive actionable error messages within 2 seconds of command invocation (fast preflight check).
- **SC-002**: 95% of users can successfully set up their environment using only the CLI-provided instructions (measured by successful subsequent runs).
- **SC-003**: Zero users see cryptic "command not found" or "ENOENT" errors from failed subprocess calls - all dependency failures are caught and explained by the CLI.
- **SC-004**: The `ai-review check` command completes in under 5 seconds and validates all required dependencies.
- **SC-005**: CLI successfully runs `ai-review local .` against the odd-ai-reviewers repository itself with all agents enabled (self-review validation).
- **SC-006**: CLI successfully runs `ai-review local .` against at least one other test repository with mixed language code.

## Clarifications

### Session 2026-02-02

- Q: Should dependency checking be global (all known dependencies) or pass-aware (only dependencies required by configured passes for this run)? → A: Pass-aware preflight - derive required dependencies from configured passes/agents for this run only.
- Q: What exit code behavior when some passes are skipped due to missing dependencies? → A: Exit 0 if optional-missing (warn + continue); non-zero if any required-missing (consolidated error), regardless of other pass outcomes.
- Q: How should the system handle when a binary exists but version check fails or returns unparseable output? → A: Treat as distinct "unhealthy" state - warn user, allow execution with advisory, provide manual verification steps.
- Q: How should platform-specific install instructions be organized to prevent drift and ensure consistency? → A: Centralized catalog - single registry mapping dependency name → {per-platform instructions, doc URL, version check command, minimum version}.

## Assumptions

- Users have basic command-line familiarity and can run package manager commands (brew, pip, etc.).
- Python 3.8+ is available on most developer machines (required for semgrep via pip).
- Homebrew is the standard package manager for macOS users.
- Linux users may have varying package managers, so pip is the universal fallback.
- The existing `isSemgrepAvailable()` and `isReviewdogAvailable()` functions in `router/src/agents/reviewdog.ts` provide the foundation for dependency checking.
- The dependency check should happen during the preflight phase before any expensive operations (API calls, diff generation); dependencies are derived from the configured passes for the current run (pass-aware, not global).
