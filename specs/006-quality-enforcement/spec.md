# Feature Specification: Quality Enforcement

**Feature Branch**: `006-quality-enforcement`
**Created**: 2026-01-28
**Status**: Draft
**Input**: NEXT_STEPS.md - Quality enforcement backlog including test coverage, auto-formatting, broken links, and security hardening documentation

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Test Coverage Enforcement (Priority: P1)

As a maintainer, I need test coverage thresholds enforced in CI so that code quality never regresses, with automatic badge updates on the README showing current coverage state.

**Why this priority**: Test coverage is the primary quality gate. Without enforcement, coverage can silently degrade over time, hiding bugs and reducing confidence in changes.

**Independent Test**: Introduce a PR that drops coverage below threshold and verify CI fails. Verify README badge reflects current coverage after merge.

**Acceptance Scenarios**:

1. **Given** a PR that reduces test coverage below the configured threshold, **When** CI runs, **Then** the build fails with a clear message indicating the coverage shortfall
2. **Given** coverage thresholds are configured, **When** tests run locally via hooks, **Then** developers see coverage results but are not blocked (CI is the enforcement point)
3. **Given** a successful CI run with coverage data, **When** the workflow completes, **Then** the README coverage badge updates automatically without manual intervention
4. **Given** local and CI environments may have different test counts (platform-specific tests), **When** thresholds are configured, **Then** separate thresholds exist for CI vs local with CI being canonical
5. **Given** the badge Gist update fails, **When** CI completes, **Then** a warning is logged but the build passes (badge is informational, not a gate)

---

### User Story 2 - Automatic Code Formatting (Priority: P1)

As a contributor, I need code to be automatically formatted before commit so I don't have to remember to run formatters manually, and formatting never causes CI failures.

**Why this priority**: Manual formatting is error-prone and causes unnecessary CI failures. Automatic formatting removes friction and ensures consistent code style across all contributions.

**Independent Test**: Make a commit with unformatted code and verify it's automatically formatted before the commit completes.

**Acceptance Scenarios**:

1. **Given** a developer stages changes with inconsistent formatting, **When** they commit, **Then** the pre-commit hook automatically runs the formatter and includes formatted code in the commit
2. **Given** auto-formatting is configured, **When** a new contributor clones the repo, **Then** hooks are automatically installed without additional setup steps
3. **Given** formatting runs on commit, **When** only staged files need formatting, **Then** only those files are formatted (not the entire codebase)
4. **Given** the CI format check, **When** code passes local hooks, **Then** CI format check also passes (local-CI parity)

---

### User Story 3 - Documentation Link Integrity (Priority: P1)

As a documentation reader, I need all links and images in documentation to work correctly so I can navigate and understand the project without encountering broken references.

**Why this priority**: Broken links erode trust and make documentation unusable. The review-team.md has known broken image links that must be fixed, and a systematic check prevents future breakage.

**Independent Test**: Run a link checker against all markdown files and verify zero broken internal links or images.

**Acceptance Scenarios**:

1. **Given** the review-team.md file references images, **When** viewed in GitHub or the docs viewer, **Then** all images render correctly
2. **Given** documentation files exist in nested directories, **When** they reference relative paths, **Then** those paths resolve correctly from the file's location
3. **Given** a PR modifies documentation, **When** CI runs, **Then** broken internal links are detected and the build fails
4. **Given** external links exist in documentation, **When** link checking runs, **Then** external links are validated or explicitly excluded with documentation

---

### User Story 4 - ReDoS Threat Model Documentation (Priority: P2)

As a security reviewer or future contributor, I need clear documentation of regex trust boundaries so I can identify whether patterns are safe (repo-controlled) or dangerous (PR-controlled), preventing accidental security vulnerabilities.

**Why this priority**: Without documented trust boundaries, Semgrep findings are ambiguous and contributors may inadvertently widen the attack surface. This is foundational for security review.

**Independent Test**: Provide documentation showing data flow from input sources to regex compilation with clear trust boundary markers.

**Acceptance Scenarios**:

1. **Given** the security documentation exists, **When** a contributor reviews regex-related code, **Then** they can identify within 5 minutes whether a pattern source is trusted or untrusted
2. **Given** a PR introduces new regex construction, **When** Semgrep flags it, **Then** the finding can be triaged using documented trust boundaries
3. **Given** config-sourced patterns exist, **When** reviewing that code, **Then** comments explicitly state the trust level of the config source

---

### User Story 5 - Pattern Validator Test Coverage (Priority: P2)

As a developer working on regex validation, I need comprehensive table-driven tests covering all edge cases so I can confidently modify the validator knowing behavior is deterministic and well-tested.

**Why this priority**: The pattern validator is a critical security control. Incomplete test coverage means vulnerabilities could slip through undetected.

**Independent Test**: Run the test suite against a corpus of known-bad ReDoS patterns and verify 100% detection with correct error codes.

**Acceptance Scenarios**:

1. **Given** a corpus of known ReDoS patterns (nested quantifiers, catastrophic backtracking), **When** tests run, **Then** all dangerous patterns are rejected with specific error codes
2. **Given** edge case patterns (empty, very long, invalid syntax), **When** validated, **Then** each returns a deterministic error type and message
3. **Given** patterns with advanced features (lookaheads, lookbehinds, backreferences), **When** validated, **Then** complexity is assessed and appropriate warnings generated
4. **Given** the golden test suite, **When** any validator behavior changes, **Then** tests fail explicitly showing the deviation

---

### User Story 6 - Structured Security Logging (Priority: P3)

As an operator, I need security events logged in a consistent, structured format so I can audit regex validation outcomes and integrate with monitoring systems without changing log semantics later.

**Why this priority**: Consistent logging enables future alerting and compliance auditing without requiring code changes. This is foundational for operational maturity.

**Independent Test**: Trigger various regex validation outcomes and verify logs contain standardized fields with no raw patterns exposed.

**Acceptance Scenarios**:

1. **Given** a regex validation event occurs, **When** logged, **Then** the log contains standardized fields: category, ruleId, file, patternHash (not raw pattern), durationMs, outcome
2. **Given** raw patterns should not be logged for security, **When** a pattern is processed, **Then** only a hash of the pattern appears in logs
3. **Given** multiple security events occur, **When** querying logs, **Then** a single aggregation point exists for all security-related events
4. **Given** the logging subsystem fails, **When** an event occurs, **Then** minimal stderr output is emitted and analysis continues (non-blocking fail-safe)

---

### Edge Cases

- What happens when coverage badge Gist API is rate-limited or unavailable? (Warn and pass)
- What happens when lint-staged encounters a file it cannot format? (Tiered: block on formatter errors/config errors/formattable file failures; warn and continue for intentionally non-formattable files like binaries, vendor blobs, generated artifacts)
- What happens when an image path is valid on Windows but invalid on Linux? (CI catches with cross-platform path validation)
- What happens when a test file is platform-specific and skipped locally? (Separate local/CI thresholds)

## Requirements _(mandatory)_

### Functional Requirements

**Test Coverage Enforcement:**

- **FR-001**: CI MUST fail builds when test coverage drops below configured thresholds
- **FR-002**: System MUST select CI thresholds when `process.env.CI === 'true'`, otherwise local thresholds; active mode and values MUST be logged at test start
- **FR-003**: README coverage badge MUST update automatically after successful CI runs
- **FR-004**: Badge update failures MUST NOT fail the build (warn only)
- **FR-005**: Coverage thresholds MUST be configured in `vitest.config.ts` under `coverage.thresholds`; CI workflows MUST NOT embed threshold values
- **FR-005a**: CI MAY print active thresholds at test start for reviewer confirmation of canonical config

**Automatic Formatting:**

- **FR-006**: Pre-commit hooks MUST automatically format staged files before commit; formatter execution errors, config errors, or formattable file failures MUST abort the commit
- **FR-007**: Hooks MUST be automatically installed when developers run npm install
- **FR-008**: Formatting MUST only affect staged files, not the entire codebase
- **FR-009**: Local formatting MUST produce identical results to CI format checks; the same skip rules (file globs/ignore lists) MUST be shared between local hooks and CI
- **FR-009a**: Intentionally non-formattable files (binaries, vendor blobs, generated artifacts, unsupported extensions) MUST emit a single warning and continue without blocking

**Documentation Integrity:**

- **FR-010**: All image references in documentation MUST resolve to existing files
- **FR-011**: All internal markdown links MUST resolve to existing files or anchors
- **FR-012**: CI MUST validate documentation link integrity on every PR
- **FR-013**: External links MUST be validated and fail CI unless explicitly allowlisted in `.linkcheckignore.yml` with required `reason` field
- **FR-013a**: Allowlist entries MAY include optional `expiry` date for periodic review; changes to allowlist MUST require PR review

**Security Documentation:**

- **FR-014**: System MUST document trust boundaries for all regex pattern sources
- **FR-015**: Code comments MUST indicate trust level where patterns are constructed from config
- **FR-016**: Security documentation MUST include data flow diagrams showing input sources to regex compilation

**Pattern Validator Testing:**

- **FR-017**: Pattern validator MUST have table-driven tests for all edge cases
- **FR-018**: Test corpus MUST be vendored as JSON at `tests/fixtures/redos-corpus/v<N>.json` with no network access at test time
- **FR-019**: Tests MUST verify specific error codes and messages (golden tests)
- **FR-020**: Corpus MUST include metadata fields: `version`, `source_urls`, `retrieved_at`, `curation_rules`, `patterns[]`
- **FR-020a**: CI MUST assert corpus version explicitly; corpus updates MUST be via explicit PRs with version bump and changelog

**ReDoS Validation Failure Behavior:**

- **FR-025**: On pattern validation failure, mitigations MUST NOT be applied (cannot suppress findings)
- **FR-026**: Findings affected by validation failure MUST be emitted with `untrusted_mitigation` tag
- **FR-027**: Validation failures MUST include deterministic `mitigation_error_reason` field with value `invalid_regex`, `timeout`, or `runtime_error`
- **FR-028**: Golden tests MUST cover: valid mitigation (suppresses finding), invalid mitigation (tag + no protection), mixed sets (only valid mitigations count)

**Security Logging:**

- **FR-021**: Security events MUST be logged with standardized fields (category, ruleId, file, patternHash, durationMs, outcome)
- **FR-022**: Raw regex patterns MUST NOT appear in logs (use hashes only)
- **FR-023**: Logging failures MUST NOT block analysis execution
- **FR-024**: System MUST provide a single exported module (`security-logger.ts`) as the sole aggregation point for security events; all security-relevant code MUST use this module (no ad-hoc logging)

**CI Workflow Organization:**

- **FR-029**: All quality gates (lint, format check, typecheck, test+coverage, link-check) MUST run in a single PR workflow
- **FR-030**: Badge update MUST run as a separate post-merge workflow triggered on `push` to `main` or via `workflow_run`
- **FR-031**: PR workflow MUST NOT depend on Gist/network availability for badge updates

### Key Entities

- **CoverageThreshold**: Configuration defining minimum coverage percentages for lines, branches, functions, and statements
- **SecurityEvent**: Structured log entry for regex validation and security-related operations; schema owned by `security-logger.ts` module
- **PatternCorpus**: Vendored JSON file containing `version` (semver), `source_urls` (OWASP/CWE references), `retrieved_at` (ISO date), `curation_rules` (selection criteria), and `patterns[]` (test cases with expected outcomes)
- **TrustBoundary**: Documentation entity marking whether a data source is trusted (repo-controlled) or untrusted (PR-controlled)
- **LinkcheckAllowlist**: YAML configuration file (`.linkcheckignore.yml`) containing excluded URLs/patterns with `reason` (required), `expiry` (optional review date), auditable via PR review

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Zero broken internal links or images across all documentation files
- **SC-002**: CI MUST fail any PR where coverage drops below thresholds defined in `vitest.config.ts`
- **SC-003**: Contributors can commit code without manually running formatters (auto-format on commit)
- **SC-004**: Post-clone `npm install` MUST complete hook setup with zero manual steps; verified by CI job that clones fresh and runs a test commit
- **SC-005**: Security reviewers can determine regex pattern trust level within 5 minutes using documentation
- **SC-006**: Pattern validator tests MUST pass for 100% of patterns in the vendored corpus (`tests/fixtures/redos-corpus/v<N>.json`)
- **SC-007**: All security events are queryable through a single log aggregation point
- **SC-008**: Zero raw regex patterns appear in any log output

## Clarifications

### Session 2026-01-28

- Q: Should formatting failures block commits or be advisory? → A: **Tiered approach**: Blocking for formatter/tool execution errors, config errors, or formattable files that fail (commit aborts). Advisory for intentionally non-formattable files (binaries, vendor blobs, generated artifacts, unsupported extensions) where lint-staged emits a single warning and continues. Same skip rules (file globs/ignore lists) must be used locally and in CI to ensure parity.
- Q: What happens when ReDoS pattern validation fails? → A: **Security-conservative**: Mitigation MUST NOT be applied (cannot suppress findings). Finding MUST be emitted with `untrusted_mitigation` tag and deterministic `mitigation_error_reason` (`invalid_regex | timeout | runtime_error`). Golden tests required for: valid mitigation (suppresses), invalid mitigation (tag + no protection), mixed sets (only valid mitigations count).
- Q: What format/versioning for ReDoS corpus? → A: **Vendored JSON** at `tests/fixtures/redos-corpus/v<N>.json` with metadata fields (`version`, `source_urls`, `retrieved_at`, `curation_rules`, `patterns[]`). No network at test time. CI asserts corpus version explicitly for reproducibility. Updates via explicit PRs with version bump and changelog.
- Q: How should CI workflows be organized? → A: **Hybrid**: All quality gates (lint → format → typecheck → test+coverage → link-check) in single PR workflow for clear enforcement. Badge update as separate post-merge workflow on `push` to `main` (or `workflow_run` after CI success), decoupling PR validation from Gist/network availability.
- Q: How should external link exclusions be declared? → A: **Central allowlist file** (`.linkcheckignore.yml`) listing excluded URLs/patterns with required `reason` and optional `expiry`/review date. Changes require PR review for auditability. Internal links always fail on breakage; external links fail unless explicitly allowlisted.
- Q: What is the single source of truth for coverage thresholds? → A: **`vitest.config.ts`** with `coverage.thresholds` object (including any CI/local split). CI runs `vitest --coverage` without embedding thresholds in workflow YAML. Optional CI assertion prints active thresholds at test start for reviewer confirmation.
- Q: How are local vs CI thresholds selected? → A: **`process.env.CI === 'true'`** → CI thresholds; otherwise local thresholds. Log active mode (`ci` or `local`) and threshold values at test start for transparency and debugging.
- Q: What is the single aggregation point for security events? → A: **Single exported module** (`security-logger.ts`) owning `SecurityEvent` schema, hashing, fail-safe behavior, and emission logic. All security-relevant code paths MUST import and call this module (no ad-hoc logging).
- Q: How to make SC-002/SC-004/SC-006 mechanically testable? → A: Reworded: SC-002 → CI fails PRs below `vitest.config.ts` thresholds; SC-004 → post-clone `npm install` completes hook setup with zero manual steps (CI-verifiable); SC-006 → tests pass for 100% of vendored corpus patterns.

## Assumptions

- Husky is the preferred hook management tool (already in use)
- lint-staged is the preferred tool for running commands on staged files (already in use)
- GitHub Actions is the CI platform
- Gist-based badges are acceptable for coverage display (already in use)
- The existing coverage infrastructure (Vitest + V8) is sufficient
- ReDoS corpus will be sourced from public OWASP/CWE resources
- Pattern hashing will use a standard cryptographic hash (SHA-256)
