# Feature Specification: Repository Health & Maintainability Overhaul

**Feature Branch**: `416-repo-health-overhaul`
**Created**: 2026-03-14
**Status**: Draft
**Input**: Comprehensive maintainability, reliability, and usability overhaul synthesized from a 6-expert panel audit (DevOps, Security, QA, LLM Systems, Documentation, Devil's Advocate). Addresses test suite architecture debt, CI/local hook divergence, tracking hygiene, documentation gaps, and developer experience friction.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Developer Pushes Code Without Redundant Checks (Priority: P1)

A developer makes changes, commits, and pushes to a feature branch. The pre-commit hook runs fast formatting and linting checks on staged files only (under 30 seconds). When they push, the pre-push hook runs type-checking, build, and tests — completing in under 4 minutes. They no longer see the same linting errors twice (once at commit, again at push), and they no longer wait 6-8 minutes for a pre-push that tempts them to skip hooks entirely.

**Why this priority**: Hook performance directly affects whether developers use quality gates or bypass them. If hooks are too slow, developers use `--no-verify`, which defeats the purpose of local quality checks. This is the highest-impact change for day-to-day developer experience.

**Independent Test**: Can be fully tested by timing a commit + push cycle on a developer machine and verifying only the correct checks run at each stage.

**Acceptance Scenarios**:

1. **Given** a developer stages files and commits, **When** the pre-commit hook runs, **Then** only formatting and linting checks execute on staged files, completing in under 30 seconds.
2. **Given** a developer pushes to a remote branch, **When** the pre-push hook runs, **Then** type-checking, build, and tests execute (without re-running lint/format), completing in under 4 minutes.
3. **Given** a developer stages a `.env.local` file containing secrets, **When** they attempt to commit, **Then** the pre-commit hook rejects the commit with a clear error message.
4. **Given** the CI pipeline runs on the same push, **When** CI completes, **Then** it runs all checks the pre-push skipped (dependency analysis, link checking, executable modes, prompt sync, strict coverage thresholds) — ensuring nothing is missed.

---

### User Story 2 - Developer Finds Tests in a Predictable Location (Priority: P2)

A developer needs to find or add a test for a module. Instead of searching across three separate directories, they navigate to a single canonical test directory organized by domain. All tests live in one hierarchy, and the test runner configuration points to exactly one location — eliminating confusion about where tests belong and removing ambiguous coverage reporting.

**Why this priority**: Test fragmentation wastes developer time (searching for existing tests, deciding where to put new ones) and creates confusing coverage reports. Consolidation is a one-time effort with permanent clarity benefits.

**Independent Test**: Can be fully tested by verifying all tests run from a single directory, coverage reports are unambiguous, and no test files exist outside the canonical location.

**Acceptance Scenarios**:

1. **Given** all co-located tests have been migrated to the canonical test directory, **When** the test runner executes, **Then** all 4,291+ tests pass with zero failures.
2. **Given** a developer searches for tests related to a module, **When** they navigate the canonical test directory, **Then** tests are organized by domain (agents, config, report, etc.) matching the source code structure.
3. **Given** the test runner produces a coverage report, **When** a developer reads the report, **Then** it clearly measures only production source code — test files and fixtures are excluded without ambiguity.
4. **Given** snapshot files exist for per-scenario test isolation, **When** tests are migrated, **Then** each test retains its own snapshot file (snapshots are NOT consolidated into a single monolith).

---

### User Story 3 - AI Reviewer Skips Non-Reviewable Files (Priority: P2)

An AI review is triggered on a pull request. The reviewer automatically skips machine-generated files (changelogs, lock files), build artifacts, test fixture data, specification documents, and tooling configuration — focusing review time and budget on actual source code changes that matter.

**Why this priority**: Without exclusion rules, the AI reviewer wastes tokens and attention on files that cannot meaningfully be reviewed (binary data, generated output, lock files). This directly impacts review quality and cost.

**Independent Test**: Can be fully tested by triggering an AI review on a PR that includes changes to both reviewable and non-reviewable files, and verifying only reviewable files receive comments.

**Acceptance Scenarios**:

1. **Given** a PR modifies `CHANGELOG.md`, `pnpm-lock.yaml`, and a source file, **When** the AI reviewer runs, **Then** only the source file is reviewed; generated files are skipped.
2. **Given** a PR adds a new benchmark snapshot file, **When** the AI reviewer runs, **Then** the snapshot file is excluded from review.
3. **Given** a PR modifies files in the specifications directory, **When** the AI reviewer runs, **Then** specification files are excluded from review.
4. **Given** the exclusion patterns file exists, **When** a developer reads it, **Then** each exclusion category has a comment explaining why those files are excluded.

---

### User Story 4 - Tracked Files Reflect Actual Project Needs (Priority: P3)

A developer clones the repository and sees only files that belong in version control. Generated agent tooling data, feature scaffolding templates, and utility scripts from the specification system are not tracked — reducing noise in diffs, PRs, and git history. However, the team governance constitution document remains tracked because it represents shared project principles that all contributors must see.

**Why this priority**: Tracking generated files inflates repository size, creates noisy diffs, and confuses contributors about what's project source vs. tooling output. The selective approach preserves governance visibility while eliminating clutter.

**Independent Test**: Can be fully tested by cloning the repository and verifying that only intentional files are tracked, while locally-generated files are ignored.

**Acceptance Scenarios**:

1. **Given** a developer clones the repository, **When** they inspect the specification tooling directory, **Then** only the governance constitution document is present — features, templates, and scripts are not tracked.
2. **Given** a developer runs specification tooling locally, **When** generated files are created in the tooling directory, **Then** those files do not appear in `git status` (they are ignored).
3. **Given** the main development guidelines file exists, **When** a developer reads its header, **Then** it accurately describes how the file is maintained (no misleading "auto-generated" claim if no generation script exists).

---

### User Story 5 - Completed Specifications Are Archived (Priority: P3)

A developer opens the specifications directory to understand active work. Instead of scrolling through 30+ directories (many for completed features), they see only active and in-progress specifications. Completed specifications are archived in a subdirectory, reducing cognitive load while remaining accessible for reference. All internal cross-references continue to work after archival.

**Why this priority**: 249 tracked spec files across 30+ directories creates unnecessary cognitive load. Archiving completed specs reduces clutter by ~80% while preserving history.

**Independent Test**: Can be fully tested by verifying that the spec link-checking tool passes after archival and that active specs are easily discoverable.

**Acceptance Scenarios**:

1. **Given** 20 completed spec directories have been identified, **When** they are moved to an archive subdirectory, **Then** the specification link-checking validation passes with zero broken links.
2. **Given** a developer opens the specifications directory, **When** they list its contents, **Then** they see only active and in-progress specifications (80% reduction in visible directories).
3. **Given** an archived spec was previously referenced by other documents, **When** those documents are accessed, **Then** all cross-references point to the correct archive location.

---

### User Story 6 - CI Enforces Prompt Convention Sync (Priority: P3)

A developer modifies shared agent prompt conventions. The CI pipeline automatically validates that all agent prompts remain in sync with the shared conventions file. If drift is detected, the CI check fails with a clear message indicating which prompt file is out of sync and how to fix it.

**Why this priority**: Prompt conventions currently have zero drift (verified), but there is no automated enforcement. Without CI validation, drift will silently accumulate over time as developers modify individual prompts without updating shared conventions.

**Independent Test**: Can be fully tested by intentionally introducing prompt drift and verifying CI catches it.

**Acceptance Scenarios**:

1. **Given** all agent prompts are currently in sync, **When** the CI pipeline runs, **Then** the prompt sync validation step passes.
2. **Given** a developer modifies an agent prompt without updating shared conventions, **When** CI runs on their PR, **Then** the prompt sync check fails with a message identifying the out-of-sync file.

---

### User Story 7 - Badge Status Reflects Actual Project Health (Priority: P3)

A potential user or contributor views the project README and sees accurate, up-to-date status badges for tests, coverage, build, and release status. The badge update process validates that test artifacts exist before updating external badge data, preventing stale or misleading badges when the update pipeline has issues.

**Why this priority**: Stale badges mislead users about project health. The current badge update process can silently fail if required artifacts are missing or authentication tokens expire.

**Independent Test**: Can be fully tested by verifying badge update workflow includes artifact validation and that badges reflect current state after a main branch push.

**Acceptance Scenarios**:

1. **Given** a push to the main branch triggers the badge update workflow, **When** test result artifacts exist, **Then** badges are updated to reflect current test count and coverage percentage.
2. **Given** test result artifacts are missing, **When** the badge update workflow runs, **Then** the workflow reports a clear error instead of silently producing stale badges.
3. **Given** the project specifies a minimum runtime version, **When** a developer checks the version pin file, **Then** it specifies a major version (not an exact patch version) to avoid blocking developers on newer compatible versions.

---

### Edge Cases

- What happens if a developer has uncommitted changes when migrating test files? Migration must be performed on a clean working tree to avoid data loss.
- What happens if a spec archival breaks a cross-reference in a document outside the repository (e.g., a wiki)? Only in-repo references are validated; external references are out of scope.
- What happens if a developer removes the exclusion patterns file? The AI reviewer falls back to reviewing all files — no files are silently skipped without explicit configuration.
- What happens if the pre-commit secret guard matches a legitimate file name starting with `.env` that isn't a secrets file? The guard specifically allows `.env.example`; any other `.env*` file is rejected, requiring the developer to rename the file.
- What happens if test migration changes a test's module resolution behavior? All import paths must be updated during migration; the test runner must pass with zero failures before the migration is considered complete.
- What happens if the governance constitution document is modified? It remains tracked in version control, so changes appear in normal PR review flow.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The pre-commit hook MUST execute only formatting and linting on staged files, completing in under 30 seconds on average.
- **FR-002**: The pre-commit hook MUST reject commits that include environment configuration files (except the example template) to prevent accidental secret exposure.
- **FR-003**: The pre-push hook MUST execute type checking, project build, and test suite — without re-running formatting or linting checks already handled by pre-commit.
- **FR-004**: The pre-push hook MUST complete in under 4 minutes on a standard developer machine.
- **FR-005**: All test files MUST reside in a single canonical test directory, organized by domain to mirror the source code structure.
- **FR-006**: The test runner configuration MUST include only the canonical test directory — no other directories contribute test files.
- **FR-007**: Coverage reports MUST measure only production source code; test files, fixtures, and build output MUST be excluded from coverage metrics without ambiguity.
- **FR-008**: Per-test snapshot files MUST be preserved during migration (one snapshot per test scenario, not consolidated).
- **FR-009**: An exclusion patterns file MUST exist that tells the AI reviewer which file categories to skip, organized by category with explanatory comments.
- **FR-010**: The exclusion patterns file MUST cover: machine-generated files, agent/tooling configuration, build artifacts, test fixture data, specification documents, and IDE/OS artifacts.
- **FR-011**: The version control ignore rules MUST exclude generated specification tooling data (features, templates, scripts) while continuing to track the governance constitution.
- **FR-012**: Previously tracked generated files MUST be removed from the version control index (untracked) without deleting them from developers' local working directories.
- **FR-013**: The main development guidelines file header MUST accurately describe its maintenance model (either manual or auto-generated — matching reality).
- **FR-014**: Completed specification directories (20 identified) MUST be moved to an archive subdirectory within the specifications directory.
- **FR-015**: All internal cross-references to archived specifications MUST be updated to point to the archive location before or during the move.
- **FR-016**: The specification link-checking validation MUST continue to work after archival (checking both active and archived specs if needed).
- **FR-017**: The CI pipeline MUST include a prompt convention sync validation step that fails when agent prompts drift from shared conventions.
- **FR-018**: The badge update workflow MUST validate that required test artifacts exist before attempting to update external badge data.
- **FR-019**: The runtime version pin file MUST specify a major version only (not an exact patch version) to avoid unnecessarily blocking developers on compatible newer versions.
- **FR-020**: CI MUST remain the authoritative quality gate — pre-push hooks provide fast feedback but CI runs the complete, strict validation suite.

### Key Entities

- **Hook Configuration**: The set of local git hooks (pre-commit, pre-push) that define which quality checks run at each development stage.
- **Exclusion Patterns**: The file (`.reviewignore`) that defines which paths the AI reviewer should skip, organized by category.
- **Test Directory**: The single canonical location for all test files, organized by domain.
- **Specification Archive**: The subdirectory within specifications that holds completed feature specs for historical reference.
- **Governance Constitution**: The team governance document that defines shared project principles, tracked in version control.
- **Badge Artifacts**: The test result and coverage data files that badge automation uses to generate status indicators.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Pre-push hook execution time is reduced from 6-8 minutes to under 4 minutes, measured on the primary developer machine.
- **SC-002**: 100% of the existing test suite (4,291+ tests) passes after test file migration with zero regressions.
- **SC-003**: Test files exist in exactly 1 directory hierarchy (down from 3), verified by searching for test file patterns across the project.
- **SC-004**: The exclusion patterns file covers 100% of identified non-reviewable file categories (machine-generated, build artifacts, fixtures, specs, IDE files).
- **SC-005**: Specification directory cognitive load is reduced by 80% (from 30+ visible directories to ~10 active ones).
- **SC-006**: Zero broken internal cross-references exist after spec archival, verified by the link-checking validation tool.
- **SC-007**: Pre-commit hook rejects 100% of environment file commit attempts (except the example template), verified by test.
- **SC-008**: CI prompt sync validation catches 100% of intentionally introduced prompt drift, verified by test.
- **SC-009**: Badge update workflow reports a clear error (rather than silent failure) when required artifacts are missing.
- **SC-010**: Coverage reports unambiguously measure production source code only — no test files, fixtures, or build output appear in coverage metrics.

## Assumptions

- The current test suite of 4,291+ tests and all existing CI workflows are stable and passing on the main branch before this work begins.
- Test migration involves updating import paths but does not require modifying test logic or assertions.
- The 20 completed spec directories identified for archival are genuinely complete (no active development references them as in-progress work).
- Developers are using a Unix-compatible shell (Git Bash, WSL, or native Unix) for git hooks, even on Windows.
- The governance constitution document is considered a shared team artifact that must be visible to all contributors.
- Pre-push hook timing targets (under 4 minutes) are based on a typical development machine; CI has no time constraints beyond its existing timeout configuration.
- The badge automation uses external gist-backed services; token rotation and authentication are managed separately from this feature.

## Scope Boundaries

**In scope**:

- Test file migration and test runner configuration updates
- Pre-commit and pre-push hook restructuring (speed tiering)
- Secret guard in pre-commit hook
- `.reviewignore` creation with documented categories
- `.gitignore` updates for .specify/ compromise
- Spec archival with cross-reference updates
- CI prompt sync enforcement step
- Badge workflow artifact validation
- `.nvmrc` creation (major version only)
- CLAUDE.md header accuracy fix
- Vitest coverage configuration clarification

**Out of scope**:

- Adding new documentation files (project is in active development; docs would go stale)
- Moving root-level analysis files (link breakage risk requires separate audit)
- Deduplicating platform setup guides (intentional overlap for self-contained guides)
- Adding unit tests for indirectly-tested pattern modules (already covered by integration tests)
- Consolidating snapshot files (per-scenario isolation is valuable)
- Adding executable mode checks to local hooks (Windows NTFS incompatible)
- Adding toolchain version checks to local hooks (overly restrictive)
- Removing `/specs` from version control (breaks CI link validation)
- Creating a troubleshooting guide (invest in error messages instead)
