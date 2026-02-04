# Feature Specification: PR Blocking Fixes

**Feature Branch**: `001-pr-blocking-fixes`
**Created**: 2026-02-03
**Status**: Draft
**Input**: User description: "Resolve all PR-blocking issues from PR_FEEDBACK.md"

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Release Pipeline Produces Correct Artifacts (Priority: P1)

A maintainer merges code to main and expects the automated release pipeline to create consistent, verifiable release artifacts with correct version numbers across all locations (npm, GitHub releases, CHANGELOG).

**Why this priority**: Broken release artifacts prevent users from installing/updating the package and create confusion about which version is current. This is the primary value delivery mechanism for the project.

**Independent Test**: Can be tested by triggering the release workflow (or dry-run) and verifying all artifacts match.

**Acceptance Scenarios**:

1. **Given** a commit is merged to main, **When** semantic-release runs, **Then** the CHANGELOG is written to the repository root (not `router/CHANGELOG.md`) and all version references match.
2. **Given** a commit with `BREAKING CHANGE:` footer, **When** semantic-release runs, **Then** the version is correctly bumped as a major release.
3. **Given** a release completes, **When** the verify job runs, **Then** it extracts the git tag version using safe shell parameter expansion (not sed).

---

### User Story 2 - Local Review Works on Windows (Priority: P1)

A developer on Windows runs `ai-review local` and expects the review to complete successfully, including static analysis with Semgrep.

**Why this priority**: Windows support is critical for developer adoption. Complete failure of static analysis makes local review unusable for a significant portion of users.

**Independent Test**: Can be tested by running local review on Windows with Semgrep configured.

**Acceptance Scenarios**:

1. **Given** Semgrep is installed on Windows, **When** local review runs the Semgrep agent, **Then** the PYTHONUTF8=1 environment variable is set to prevent cp1252 encoding crashes.
2. **Given** Semgrep fails to execute on Windows, **When** graceful degradation is configured, **Then** the review continues with a warning and skips the Semgrep agent.

---

### User Story 3 - Local Review Works with Latest OpenAI Models (Priority: P1)

A developer using GPT-5.x models runs local review and expects the AI-powered code review to complete successfully.

**Why this priority**: Hard failures when using current-generation models make the tool unusable for users who have upgraded their OpenAI access.

**Independent Test**: Can be tested by running local review with a GPT-5.x model configured.

**Acceptance Scenarios**:

1. **Given** a GPT-5.x model is configured, **When** the OpenCode agent executes, **Then** the API call uses `max_completion_tokens` instead of `max_tokens`.
2. **Given** a GPT-4.x model is configured, **When** the OpenCode agent executes, **Then** the API call continues to use `max_tokens` for backward compatibility.

---

### User Story 4 - Errors Are Handled Safely (Priority: P2)

A developer runs local review and encounters an error. The error is handled gracefully with clear messaging and no undefined behavior.

**Why this priority**: Unsafe error handling can lead to crashes, misleading error messages, or security issues from information disclosure.

**Independent Test**: Can be tested by simulating various error conditions (network failures, missing binaries, permission issues).

**Acceptance Scenarios**:

1. **Given** the dependency checker catches an error, **When** the error is not an ErrnoException, **Then** the code properly validates the error type before accessing properties.
2. **Given** `loadConfigWithFallback` catches an error, **When** the error is not an Error instance, **Then** the code wraps it in a standard Error to preserve invariants.

---

### User Story 5 - CI/CD Has Minimal Supply Chain Risk (Priority: P2)

A security-conscious organization reviews the CI/CD pipeline and needs assurance that third-party actions with secrets access are pinned and trustworthy.

**Why this priority**: Unpinned actions receiving secrets are a known supply chain attack vector. This blocks enterprise adoption.

**Independent Test**: Can be tested by auditing workflow files for unpinned actions with secrets access.

**Acceptance Scenarios**:

1. **Given** the badge-update workflow exists, **When** deploying to Gist, **Then** either the action is pinned to a SHA or replaced with `github-script` using official GitHub API.
2. **Given** any third-party action receives secrets, **When** auditing the workflow, **Then** the action reference includes a full commit SHA.

---

### User Story 6 - No Deprecated or Dead Code in CI (Priority: P2)

A maintainer reviews the CI configuration and expects no ambiguity about which workflows are active and authoritative.

**Why this priority**: Deprecated workflows create confusion, consume CI minutes if accidentally triggered, and increase maintenance burden.

**Independent Test**: Can be tested by searching for deprecated workflow files.

**Acceptance Scenarios**:

1. **Given** `npm-publish.yml` is marked as deprecated, **When** reviewing the repository, **Then** the file has been deleted entirely.

---

### User Story 7 - Integration Tests Cover Critical Paths (Priority: P3)

A maintainer reviews test coverage and needs confidence that critical execution paths are actually tested, not skipped.

**Why this priority**: Skipped tests represent technical debt and gaps in coverage guarantees.

**Independent Test**: Can be tested by running the test suite and verifying no critical tests are skipped.

**Acceptance Scenarios**:

1. **Given** skipped tests exist in `local-review-cli.test.ts`, **When** reviewing the test suite, **Then** either the tests are implemented with real repo-backed assertions or documented with explicit reasoning for why they cannot exist.

---

### Edge Cases

- What happens when Semgrep crashes mid-execution due to encoding issues? Partial findings should be preserved.
- How does the system handle network timeouts from OpenAI API calls? Existing retry logic should apply.
- What happens when a user provides a git tag with special characters? Shell parameter expansion prevents injection.
- How does the release workflow behave if npm registry is temporarily unavailable? Existing retry with exponential backoff should apply.

## Requirements _(mandatory)_

### Functional Requirements

#### Release Pipeline

- **FR-001**: System MUST write CHANGELOG to repository root (`CHANGELOG.md`), not `router/CHANGELOG.md`
- **FR-002**: System MUST detect breaking changes from `BREAKING CHANGE:` footers in conventional commits
- **FR-003**: System MUST use shell parameter expansion (not sed) when extracting version from git tags
- **FR-004**: Release verification job MUST check CHANGELOG at the repository root path

#### Windows Compatibility

- **FR-005**: System MUST set `PYTHONUTF8=1` environment variable when spawning Semgrep on any platform
- **FR-006**: System SHOULD continue review with a warning if Semgrep fails to execute (graceful degradation)

#### OpenAI API Compatibility

- **FR-007**: OpenCode agent MUST use `max_completion_tokens` parameter for GPT-5.x models
- **FR-008**: OpenCode agent MUST use `max_tokens` parameter for GPT-4.x and earlier models
- **FR-009**: Model version detection MUST be based on model name prefix matching

#### Error Handling

- **FR-010**: Dependency checker MUST validate error type is ErrnoException before accessing `.code` property
- **FR-011**: `loadConfigWithFallback` MUST handle non-Error throws by wrapping them in Error instances
- **FR-012**: All catch blocks handling unknown errors MUST use type guards before property access

#### Supply Chain Security

- **FR-013**: Badge update workflow MUST either pin `exuanbo/actions-deploy-gist` to a commit SHA or replace with `github-script`
- **FR-014**: All third-party actions receiving secrets MUST be pinned to full commit SHAs

#### Code Cleanup

- **FR-015**: Deprecated `npm-publish.yml` workflow MUST be deleted from the repository

#### Test Coverage

- **FR-016**: Skipped integration tests MUST be either implemented or documented with explicit justification

### Key Entities

- **Workflow Configuration**: GitHub Actions workflow files defining CI/CD behavior
- **Agent Environment**: Environment variables passed to external tool processes
- **API Parameters**: Model-specific parameters for LLM API calls
- **Error Type**: Runtime error instances with optional `.code` property

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Release workflow produces matching versions in npm, GitHub release, package.json, and CHANGELOG 100% of the time
- **SC-002**: Local review completes successfully on Windows when Semgrep is installed (no cp1252 encoding crashes)
- **SC-003**: Local review completes successfully with GPT-5.x models (no max_tokens rejection errors)
- **SC-004**: All catch blocks pass type validation before property access (verified by code review and type tests)
- **SC-005**: Zero third-party actions with secrets access remain unpinned
- **SC-006**: Zero deprecated workflow files remain in the repository
- **SC-007**: Test suite has zero unexplained skipped tests on critical paths
