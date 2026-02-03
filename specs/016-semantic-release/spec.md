# Feature Specification: Automated npm Publishing with semantic-release

**Feature Branch**: `016-semantic-release`
**Created**: 2026-02-03
**Status**: Draft
**Input**: User description: "Ensure publishing to npm is fully automated in a deterministic way with semantic-release. The process must update our package.json, changelog, and git tags accordingly. They must all be in sync so this is a deterministic process based on commitlinting and our pipelines."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Automatic Release on Merge (Priority: P1)

A maintainer merges a feature branch containing conventional commits into the main branch. The CI pipeline automatically determines the next version based on commit types, updates the package.json version, generates changelog entries, creates a git tag, and publishes the package to npm without any manual intervention.

**Why this priority**: This is the core value proposition - eliminating manual release steps and ensuring every release follows the same deterministic process. Without this, the entire feature has no value.

**Independent Test**: Can be fully tested by merging a branch with a `feat:` commit to main and observing that npm shows the new version, the changelog includes the feature, and git tags exist.

**Acceptance Scenarios**:

1. **Given** a PR with `feat: add new feature` commit is merged to main, **When** the CI pipeline runs, **Then** the package version is bumped as a minor release, changelog is updated with the feature description, git tag is created, and package is published to npm.
2. **Given** a PR with `fix: resolve bug` commit is merged to main, **When** the CI pipeline runs, **Then** the package version is bumped as a patch release with corresponding changelog and git tag.
3. **Given** a PR with `feat!: breaking change` or `BREAKING CHANGE:` in footer is merged to main, **When** the CI pipeline runs, **Then** the package version is bumped as a major release with breaking change noted in changelog.
4. **Given** a release workflow completes all steps, **When** the post-release verification job runs, **Then** it confirms git tag version, package.json version, CHANGELOG.md latest entry version, and npm registry version all match, and the workflow succeeds.
5. **Given** a release where npm publish silently failed (reported success but version not on registry), **When** the post-release verification job runs, **Then** it detects the mismatch and fails the workflow with a clear error message.

---

### User Story 2 - Commit Message Validation (Priority: P1)

A contributor creates a commit or opens a PR. The system validates that commit messages follow the conventional commit format to ensure proper version determination during release.

**Why this priority**: Without enforced conventional commits, the version determination becomes non-deterministic. This is co-equal with P1 as it enables the automated release to work correctly.

**Independent Test**: Can be tested by attempting to commit with an invalid message format and observing the commit is rejected.

**Acceptance Scenarios**:

1. **Given** a PR with title "feat: add user authentication", **When** CI runs, **Then** the PR check passes.
2. **Given** a PR with title "added stuff", **When** CI runs, **Then** the PR check fails with a message explaining the required conventional commit format.
3. **Given** a developer writes a non-conventional local commit message, **When** they commit, **Then** the local hook warns but does not block (advisory only; CI is authoritative).

---

### User Story 3 - Dry Run Preview (Priority: P2)

A maintainer wants to preview what version would be released and what changelog entries would be generated before actually merging, to verify the release will be correct.

**Why this priority**: Important for maintainer confidence but not strictly required for the automated release to function.

**Independent Test**: Can be tested by running a preview command on a branch and comparing the output to what would actually be released.

**Acceptance Scenarios**:

1. **Given** a branch with several conventional commits, **When** a maintainer runs the dry-run/preview command, **Then** they see the computed next version and draft changelog entries without any actual release occurring.

---

### User Story 4 - Release Failure Recovery (Priority: P2)

A release process fails partway through (e.g., npm publish fails after git tag is created). The system provides clear guidance and the ability to recover without manual intervention on retry.

**Why this priority**: Essential for production reliability but can be addressed after core functionality is working.

**Independent Test**: Can be tested by simulating a failure scenario and observing the recovery behavior on retry.

**Acceptance Scenarios**:

1. **Given** a release that failed during npm publish (after tagging), **When** the pipeline is re-run, **Then** the system detects the existing git tag, skips tag creation and changelog commit, checks npm registry for the version, and completes only the missing npm publish step.
2. **Given** a release failure, **When** a maintainer checks the logs, **Then** they see clear error messages indicating exactly what failed, what steps were already completed (based on tag/npm state), and what steps remain.
3. **Given** a tag exists and npm already has the version published, **When** the pipeline is re-run, **Then** the system detects both exist and reports "release already complete" with no changes made.

---

### Edge Cases

- What happens when there are no releasable commits (only `chore:`, `docs:`, `ci:` commits)? The release is skipped with a clear message.
- How does the system handle merge conflicts in changelog? Uses automated changelog generation that replaces rather than merges.
- What happens if npm credentials expire or become invalid? The release fails with a clear authentication error message, and no partial release artifacts are created.
- What happens if a developer amends a commit after PR approval? Commit validation runs on push, catching amended commits before merge.
- What happens if post-release verification fails? The workflow fails visibly; maintainers must investigate and manually resolve (e.g., re-publish to npm if it failed silently).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST automatically determine the next semantic version based solely on conventional commit messages since the last release.
- **FR-002**: System MUST update the `version` field in package.json to match the determined version before publishing.
- **FR-003**: System MUST generate a changelog entry for each release containing all relevant commits, categorized by type (features, fixes, breaking changes).
- **FR-004**: System MUST create a git tag matching the release version (e.g., `v1.2.3`).
- **FR-005**: System MUST publish the package to npm with the new version.
- **FR-006**: System MUST enforce conventional commit format on PR titles via CI checks (PR title becomes the squash commit message that semantic-release analyzes). Local pre-commit hooks are advisory only.
- **FR-007**: System MUST use git tags as the single source of truth for release state. On retry: if tag exists, skip tag/changelog steps and verify/complete npm publish only. This enables idempotent recovery without manual cleanup.
- **FR-008**: System MUST skip release when no releasable commits exist, with a clear log message.
- **FR-009**: System MUST support dry-run mode to preview release without executing it. Dry-run MUST use the identical semantic-release configuration, branch rules, and tag discovery logic as the real release workflow—no alternate code paths—to ensure preview output accurately reflects what would actually be released.
- **FR-010**: System MUST run releases only on the main branch after successful merge.
- **FR-013**: Repository MUST be configured to allow only squash merges to main branch.
- **FR-011**: System MUST use credentials stored as CI secrets (not in code) for npm authentication.
- **FR-014**: Release workflow MUST use a dedicated GitHub App token (not PAT or default GITHUB_TOKEN) with branch protection bypass permission to push version commits and tags to main. The token MUST be scoped to a protected "release" environment that only the release workflow can access, preventing misuse by other workflows.
- **FR-015**: All release commits pushed by CI MUST be attributable to the dedicated bot identity for audit purposes.
- **FR-016**: CHANGELOG.md MUST be machine-owned only; manual edits are forbidden. CI MUST include a check that fails if CHANGELOG.md is modified, with an exception when `github.actor` matches the release bot username (e.g., `release-bot[bot]`).
- **FR-012**: Package.json, changelog, git tags, and npm registry MUST all reflect the same version after a successful release.
- **FR-017**: Release workflow MUST include a mandatory post-release verification job that reads the git tag, package.json version, CHANGELOG.md latest entry, and npm registry version, and fails the workflow if any mismatch is detected.
- **FR-018**: Release workflow MUST pin the Node.js major version explicitly in the workflow file and use a committed lockfile (pnpm-lock.yaml) to ensure all semantic-release plugins and dependencies are reproducible across runs.
- **FR-019**: Semantic-release configuration MUST be set to skip tag creation, changelog commits, and GitHub release creation when the corresponding git tag already exists, ensuring idempotent retry behavior as promised by FR-007.

### Key Entities

- **Conventional Commit**: A commit message following the conventional commit specification with type, optional scope, and description. Determines version bump type.
- **Release**: The collection of artifacts produced - updated package.json version, changelog entry, git tag, and npm package publication.
- **Changelog**: A persistent file (CHANGELOG.md) documenting all releases with their included changes. Machine-owned only - automatically generated by the release workflow; manual edits are forbidden and blocked by CI.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of releases to npm occur automatically without manual version bumping or tagging.
- **SC-002**: Every release has matching versions in package.json, git tag, and npm registry.
- **SC-003**: All contributor commits are validated against conventional commit format before merge.
- **SC-004**: Changelog is updated automatically with every release, requiring zero manual editing.
- **SC-005**: Failed releases can be recovered by re-running the pipeline without manual intervention.
- **SC-006**: Time from merge to npm availability is under 5 minutes for successful releases.

## Clarifications

### Session 2026-02-03

- Q: What merge strategy should be enforced for deterministic versioning? → A: Squash merge only - PR title must follow conventional commit format

### Session 2026-02-03 (continued)

- Q: How should runtime versions be pinned to guarantee determinism? → A: Lockfile + pinned Node major version in workflow
- Q: How should the GitHub App token be restricted to prevent misuse? → A: Environment protection - token scoped to "release" environment, only release workflow uses it
- Q: How to ensure semantic-release config supports idempotent retries? → A: Add FR requiring config must skip tag/changelog creation when tag already exists
- Q: How should the CHANGELOG modification exception rule work? → A: Allow if github.actor matches release bot username
- Q: How to ensure dry-run output matches real release behavior? → A: Add FR requiring dry-run uses identical config, branch rules, and tag discovery as real release
- Q: How should CI push release commits/tags to protected main branch? → A: GitHub App token with bypass permission - dedicated bot identity, auditable
- Q: What is the single source of truth for release state (for idempotent retries)? → A: Git tag - if tag exists, verify/complete npm publish only
- Q: Who owns CHANGELOG.md - can humans manually edit it? → A: Machine-owned only - auto-generated, manual edits forbidden
- Q: How should we verify all release artifacts are in sync (FR-012/SC-002)? → A: Mandatory post-release CI job that verifies tag, package.json, changelog, and npm match

## Assumptions

- The project uses GitHub Actions for CI/CD (based on existing project setup).
- A GitHub App will be created/configured with repository write access and branch protection bypass for the release workflow.
- The main branch is the release branch (protected, squash-merge only).
- npm is the target package registry.
- The project already has a package.json with a name and initial version.
- Contributors are willing to adopt conventional commit message format.
- The changelog format follows Keep a Changelog or similar standard conventions.
