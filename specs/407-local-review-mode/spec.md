# Feature Specification: Local Review Mode & Terminal Reporter

**Feature Branch**: `407-local-review-mode`
**Created**: 2026-02-01
**Status**: Draft
**Input**: Extend odd-ai-reviewers from a CI-only tool to a complete developer workflow by publishing CLI to npm, adding local review mode, and creating a rich terminal reporter.

---

## User Scenarios & Testing _(mandatory)_

### User Story 1 – First-Time Local Review (Priority: P1)

A developer discovers odd-ai-reviewers and wants to try it on their codebase without setting up CI pipelines. They install the package, run a single command, and immediately see AI-powered code review feedback in their terminal.

**Why this priority**: This is the core value proposition—reducing time-to-first-review from 15+ minutes (CI setup) to under 60 seconds. It removes the biggest adoption barrier.

**Independent Test**: Can be fully tested by installing the package and running `npx @oddessentials/ai-review .` in any git repository with changes. Delivers immediate feedback without any configuration.

**Acceptance Scenarios**:

1. **Given** a developer has a git repository with uncommitted changes, **When** they run `npx @oddessentials/ai-review .`, **Then** the system detects the repository root, infers the default base branch, runs review passes, and displays findings in the terminal.

2. **Given** a developer runs the review command without a `.ai-review.yml` file, **When** the review starts, **Then** the system proceeds using sensible zero-config defaults and clearly indicates that defaults are in use.

3. **Given** a developer has valid API credentials in environment variables, **When** they run local review, **Then** the system uses those credentials without additional prompts.

---

### User Story 2 – Iterative Config Development (Priority: P1)

A developer is fine-tuning their `.ai-review.yml` configuration and wants fast feedback on how changes affect review results without pushing to CI.

**Why this priority**: Enables rapid iteration on configuration, dramatically improving developer experience and reducing time wasted on CI cycles.

**Independent Test**: Can be tested by modifying `.ai-review.yml`, running local review, and verifying results reflect config changes immediately.

**Acceptance Scenarios**:

1. **Given** a developer modifies their `.ai-review.yml` to add a new review pass, **When** they run `ai-review .`, **Then** the new pass executes and results appear in terminal output.

2. **Given** a developer wants to test only a specific review pass, **When** they run `ai-review . --pass static`, **Then** only that pass executes.

3. **Given** a developer changes agent settings, **When** they run `ai-review .`, **Then** the results reflect the updated configuration without requiring commits or CI runs.

---

### User Story 3 – Pre-Commit Hook Integration (Priority: P2)

A developer wants to catch issues before committing by integrating AI review into their pre-commit workflow, reviewing only staged changes.

**Why this priority**: Shifts feedback left to the earliest possible point in the workflow. Depends on P1 being complete but adds significant quality value.

**Independent Test**: Can be tested by configuring a pre-commit hook, staging files, and verifying review runs only on staged content.

**Acceptance Scenarios**:

1. **Given** a pre-commit hook is configured with `ai-review . --staged --quiet`, **When** the developer attempts to commit, **Then** only staged changes are reviewed and output is minimal (errors only).

2. **Given** staged changes include findings with severity `error`, **When** the pre-commit hook runs, **Then** the commit is blocked and error details are displayed.

3. **Given** staged changes pass review, **When** the pre-commit hook runs, **Then** the commit proceeds without interruption.

---

### User Story 4 – Branch Comparison Review (Priority: P2)

A developer wants to review all changes in their feature branch compared to the main branch before creating a pull request.

**Why this priority**: Mirrors CI behavior locally and helps developers validate PR readiness.

**Independent Test**: Can be tested by creating a feature branch, making changes, and running `ai-review . --base main`.

**Acceptance Scenarios**:

1. **Given** a developer is on a feature branch with multiple commits, **When** they run `ai-review . --base main`, **Then** all changes between the current HEAD and main are reviewed.

2. **Given** a developer specifies a commit range, **When** they run `ai-review . --range HEAD~3..`, **Then** only changes in that range are reviewed.

---

### User Story 5 – CI Result Debugging (Priority: P2)

A developer’s PR failed CI review with unexpected results and they want to reproduce and debug the issue locally.

**Why this priority**: Provides a debugging capability that does not exist today and reduces iteration time.

**Independent Test**: Can be tested by checking out the PR branch and running the same review locally.

**Acceptance Scenarios**:

1. **Given** CI reported issues on specific files, **When** the developer runs `ai-review . --verbose`, **Then** detailed debug information is displayed, including agent execution context.

2. **Given** the developer wants to isolate a specific agent, **When** they run `ai-review . --agent semgrep`, **Then** only that agent executes.

---

### User Story 6 – Cost Estimation (Priority: P3)

A developer wants to understand the cost implications of running AI review before incurring charges.

**Why this priority**: Useful for budget awareness but not required for core functionality.

**Independent Test**: Can be tested by running `ai-review . --cost-only`.

**Acceptance Scenarios**:

1. **Given** a developer runs `ai-review . --cost-only`, **Then** estimated token usage and cost are displayed without executing review agents.

2. **Given** a review completes normally, **When** results are displayed, **Then** the estimated cost is shown in the summary.

---

### User Story 7 – Machine-Readable Output (Priority: P3)

A developer wants to integrate review results with other tools or systems using structured output formats.

**Why this priority**: Enables automation and integration but is not required for core usage.

**Independent Test**: Can be tested by running `ai-review . --format json`.

**Acceptance Scenarios**:

1. **Given** `--format json` is specified, **When** review completes, **Then** valid JSON output is produced.

2. **Given** `--format sarif` is specified, **When** review completes, **Then** SARIF-compliant output is produced.

---

### User Story 8 – npm Package Installation (Priority: P1)

A developer wants to install and run the CLI from npm.

**Why this priority**: Fundamental prerequisite for all other stories.

**Independent Test**: Can be tested by running `npx @oddessentials/ai-review --version`.

**Acceptance Scenarios**:

1. **Given** npm/npx is available, **When** the developer runs `npx @oddessentials/ai-review --version`, **Then** the correct version is displayed.

2. **Given** a global install via `npm install -g @oddessentials/ai-review`, **When** `ai-review --help` is run, **Then** help documentation is displayed.

3. **Given** existing commands (`config init`, `validate`), **When** run via npx, **Then** behavior matches existing CLI functionality.

---

### Edge Cases

- When no changes are detected, display “No changes to review” and exit successfully.
- When run outside a git repository, display a clear error with guidance.
- When API credentials are missing, display a clear error with environment variable instructions.
- When network is unavailable, timeout gracefully with clear messaging.
- When interrupted (Ctrl+C), clean up gracefully and report partial results if available.
- When diff size exceeds safe thresholds, warn about cost/time and suggest narrowing scope.
- When `.ai-review.yml` validation fails, report errors before attempting execution.

---

## Requirements _(mandatory)_

### Functional Requirements

**Git Context & Diff Generation**

- **FR-001**: System MUST auto-detect the git repository root.
- **FR-002**: System MUST detect the current branch.
- **FR-003**: System MUST infer the default base branch (`main`, `master`, `develop`).
- **FR-004**: System MUST detect staged and unstaged changes.
- **FR-005**: System MUST reuse existing `diff.ts` logic for diff generation.

**Command Line Interface**

- **FR-006**: System MUST accept a path argument (default `"."`).
- **FR-007**: System MUST support `--base <ref>`.
- **FR-008**: System MUST support `--head <ref>` (default `HEAD`).
- **FR-009**: System MUST support `--range <range>`.
- **FR-010**: System MUST support `--staged`.
- **FR-011**: System MUST support `--uncommitted` (default: true).
- **FR-012**: System MUST support `--pass <name>`.
- **FR-013**: System MUST support `--agent <id>`.
- **FR-014**: System MUST support output formats: pretty, json, sarif.
- **FR-015**: System MUST support `--no-color`.
- **FR-016**: System MUST support `--quiet`.
- **FR-017**: System MUST support `--verbose`.
- **FR-018**: System MUST support `--dry-run`.
- **FR-019**: System MUST support `--cost-only`.
- **FR-020**: System MUST support `-c, --config <path>` and default to zero-config behavior when absent.

**Terminal Reporter**

- **FR-021**: Findings MUST include file path, line range, severity.
- **FR-022**: Findings MUST include surrounding code context.
- **FR-023**: Agent recommendations MUST be displayed.
- **FR-024**: Summary MUST include counts by severity.
- **FR-025**: Summary MUST include execution time and estimated cost.
- **FR-026**: Colored output MUST be enabled by default when supported.
- **FR-027**: Progress MUST be displayed for long-running agents.

**npm Publishing**

- **FR-028**: Package MUST be published as `@oddessentials/ai-review`.
- **FR-029**: Package MUST expose `ai-review` executable.
- **FR-030**: Existing CLI commands MUST continue to function unchanged.
- **FR-031**: Package MUST include README documentation.

**Error Handling**

- **FR-032**: Clear error when not in a git repository.
- **FR-033**: Graceful success when no changes are detected.
- **FR-034**: Clear error when API credentials are missing.
- **FR-035**: Clear error when config is invalid.
- **FR-036**: Graceful handling of Ctrl+C interruption.

---

## Key Entities

- **GitContext**: Repository root, current branch, base branch, change state.
- **ReviewOptions**: Diff parameters, pass/agent filters, output settings.
- **TerminalFinding**: File path, line range, severity, message, snippet, agent.
- **ReviewSummary**: Counts by severity, files analyzed, time, estimated cost.

---

## Assumptions

- API credentials are supplied via environment variables.
- Existing executors, config loader, and budget controls are reused.
- `diff.ts` is sufficient for local diff generation.
- Git is installed and accessible.
- ANSI color support is available with fallback.
- Package is published under `@oddessentials`.

---

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: First local review completes within 60 seconds of installation.
- **SC-002**: Local and CI reviews produce identical findings for the same inputs.
- **SC-003**: Terminal output is actionable without documentation.
- **SC-004**: ≥95% of users complete a local review successfully on first attempt.
- **SC-005**: Config iteration feedback loop completes in under 10 seconds.
- **SC-006**: Pre-commit execution completes within acceptable hook time limits.
- **SC-007**: Package installs and runs on Node.js ≥22 across major OSes.
- **SC-008**: Existing CLI commands remain fully functional after publishing.
