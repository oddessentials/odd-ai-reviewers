# Tasks: Automated npm Publishing with semantic-release

**Input**: Design documents from `/specs/016-semantic-release/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Manual integration testing via dry-run.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

This feature modifies configuration files only - no source code changes:

- `.github/workflows/` - GitHub Actions workflows
- `.releaserc.json` - semantic-release configuration at repository root
- `router/CHANGELOG.md` - auto-generated (not manually created)
- `package.json` - root package.json for dependency installation

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install dependencies and create semantic-release configuration

- [ ] T001 Install semantic-release and plugins to root package.json: `pnpm add -D semantic-release @semantic-release/changelog @semantic-release/git @semantic-release/npm @semantic-release/github conventional-changelog-conventionalcommits`
- [ ] T002 Create semantic-release configuration file at `.releaserc.json` per contracts/releaserc.json contract
- [ ] T003 [P] Verify pnpm-lock.yaml is updated and committed after dependency installation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: GitHub infrastructure setup that MUST be complete before release workflow can function

**Note**: These are manual configuration tasks in GitHub UI, documented here for completeness.

- [ ] T004 Create GitHub App named `odd-ai-reviewers-release-bot` with Contents:write permission per quickstart.md section 1
- [ ] T005 Install GitHub App on repository and note App ID
- [ ] T006 Generate and securely store GitHub App private key (.pem file)
- [ ] T007 Create GitHub environment named `release` with deployment branch restriction to `main` only
- [ ] T008 Add environment secrets: `APP_ID`, `APP_PRIVATE_KEY` (from GitHub App), `NPM_TOKEN` (from npm)
- [ ] T009 Configure repository settings to allow only squash merges to main branch (Settings → General → Pull Requests)
- [ ] T010 Update branch protection rule for main to allow `odd-ai-reviewers-release-bot[bot]` to bypass required pull requests

**Checkpoint**: GitHub infrastructure ready - release workflow can now be implemented

---

## Phase 3: User Story 1 - Automatic Release on Merge (Priority: P1)

**Goal**: When a PR is merged to main, automatically determine version, update package.json, generate changelog, create git tag, and publish to npm.

**Independent Test**: Merge a PR with title `feat: test release` and verify npm shows new version, CHANGELOG.md is updated, and git tag exists.

### Implementation for User Story 1

- [ ] T011 [US1] Create release workflow file at `.github/workflows/release.yml` per contracts/release-workflow.yml contract
- [ ] T012 [US1] Implement release job with GitHub App token generation, semantic-release execution, and environment protection
- [ ] T013 [US1] Implement verify job that checks version sync across git tag, package.json, CHANGELOG.md, and npm registry (FR-017)
- [ ] T014 [US1] Add workflow outputs for version and release status to enable verify job dependency
- [ ] T014a [US1] Verify release skips gracefully when no releasable commits exist (merge PR with `chore:` or `docs:` title only) - validates FR-008

**Checkpoint**: Automatic release on merge is functional. Test by merging a PR with `feat:` title.

---

## Phase 4: User Story 2 - Commit Message Validation (Priority: P1)

**Goal**: Enforce conventional commit format on PR titles via CI checks before merge.

**Independent Test**: Create a PR with title "bad title" and verify CI fails. Create a PR with title "feat: good title" and verify CI passes.

### Implementation for User Story 2

- [ ] T015 [US2] Add `pr-title-validation` job to `.github/workflows/ci.yml` using `amannn/action-semantic-pull-request@v5` action per contracts/ci-pr-validation.yml
- [ ] T016 [US2] Add `changelog-protection` job to `.github/workflows/ci.yml` that fails if `router/CHANGELOG.md` is modified in PRs (FR-016)
- [ ] T017 [US2] Ensure both new jobs only run on `pull_request` events using `if: github.event_name == 'pull_request'`

**Checkpoint**: PR title validation and CHANGELOG protection are enforced. Test by opening PRs with valid/invalid titles.

---

## Phase 5: User Story 3 - Dry Run Preview (Priority: P2)

**Goal**: Allow maintainers to preview what version would be released without actually releasing.

**Independent Test**: Trigger release workflow with dry_run=true and verify output shows next version without making changes.

### Implementation for User Story 3

- [ ] T018 [US3] Verify release workflow has `workflow_dispatch` trigger with `dry_run` boolean input (already in T011 contract)
- [ ] T019 [US3] Verify semantic-release step conditionally runs with `--dry-run` flag when `inputs.dry_run == 'true'` (FR-009)
- [ ] T020 [US3] Test dry-run by triggering workflow manually via Actions tab with dry_run checkbox enabled

**Checkpoint**: Dry-run preview is functional. Test via workflow_dispatch in GitHub Actions UI.

---

## Phase 6: User Story 4 - Release Failure Recovery (Priority: P2)

**Goal**: Enable idempotent recovery from partial release failures without manual cleanup.

**Independent Test**: After a successful release, re-run the workflow and verify it reports "no new version" without errors.

### Implementation for User Story 4

- [ ] T021 [US4] Verify `.releaserc.json` plugins are ordered correctly for idempotent behavior (commit-analyzer → notes → changelog → npm → git → github)
- [ ] T022 [US4] Verify `@semantic-release/git` plugin commits both `router/package.json` and `router/CHANGELOG.md` with `[skip ci]` in message (FR-019)
- [ ] T023 [US4] Test idempotent behavior by re-running release workflow after a successful release and verifying no duplicate artifacts

**Checkpoint**: Recovery from partial failures works. Re-running workflow after release completes without errors.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, cleanup, and final validation

- [ ] T024 [P] Verify `router/CHANGELOG.md` is NOT in `.gitignore` - file should be tracked in git as machine-owned artifact per FR-016
- [ ] T025 [P] Update `router/README.md` to mention changelog location and auto-generation
- [ ] T026 Deprecate or remove `.github/workflows/npm-publish.yml` (old manual release workflow) - keep as backup initially, remove after validation
- [ ] T027 Run complete end-to-end test: create branch → make change → PR with conventional title → merge → verify release completes in <5 minutes (SC-006) and all artifacts sync correctly
- [ ] T028 Update quickstart.md with any lessons learned during implementation
- [ ] T029 [P] Add release badge to root README.md showing latest version

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories (GitHub App required for release workflow)
- **User Story 1 (Phase 3)**: Depends on Foundational phase - core release workflow
- **User Story 2 (Phase 4)**: Depends on Setup only - CI changes are independent of release workflow
- **User Story 3 (Phase 5)**: Depends on User Story 1 - dry-run is a mode of the release workflow
- **User Story 4 (Phase 6)**: Depends on User Story 1 - tests idempotent behavior of release workflow
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Foundational (GitHub App, environment secrets)
- **User Story 2 (P1)**: Can start after Setup - independent of release workflow, only modifies CI
- **User Story 3 (P2)**: Depends on User Story 1 (release workflow must exist)
- **User Story 4 (P2)**: Depends on User Story 1 (release workflow must exist)

### Within Each User Story

- Configuration files before workflows that use them
- Core functionality before verification/testing tasks
- Manual GitHub UI setup cannot be parallelized

### Parallel Opportunities

- T001-T003 (Setup): T003 runs after T001-T002 complete
- T004-T010 (Foundational): All are manual UI tasks, cannot be parallelized
- User Story 2 can run in parallel with User Story 1 (different files)
- T024, T025, T029 (Polish): Can run in parallel (different files)

---

## Parallel Example: User Stories 1 & 2

```bash
# These user stories can be implemented in parallel by different team members:

# Team Member A: User Story 1 (Release Workflow)
Task: "T011 [US1] Create release workflow file at .github/workflows/release.yml"
Task: "T012 [US1] Implement release job with GitHub App token generation"
Task: "T013 [US1] Implement verify job for version sync"

# Team Member B: User Story 2 (PR Validation)
Task: "T015 [US2] Add pr-title-validation job to .github/workflows/ci.yml"
Task: "T016 [US2] Add changelog-protection job to .github/workflows/ci.yml"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup (install dependencies, create config)
2. Complete Phase 2: Foundational (GitHub App, environment, settings)
3. Complete Phase 3: User Story 1 (release workflow)
4. Complete Phase 4: User Story 2 (PR validation)
5. **STOP and VALIDATE**: Test end-to-end release flow
6. Deploy/demo if ready - this is the MVP!

### Incremental Delivery

1. Setup + Foundational → Infrastructure ready
2. Add User Story 1 → Test release → MVP!
3. Add User Story 2 → Test PR validation → Enhanced MVP
4. Add User Story 3 → Test dry-run → Full feature
5. Add User Story 4 → Test recovery → Production-ready
6. Polish → Documentation and cleanup

### Single Developer Strategy

Recommended order for a single developer:

1. T001-T003 (Setup) - 15 minutes
2. T004-T010 (Foundational) - 30 minutes (mostly GitHub UI)
3. T011-T014 (US1) - 45 minutes
4. T015-T017 (US2) - 20 minutes
5. T018-T020 (US3) - 10 minutes (verification only)
6. T021-T023 (US4) - 10 minutes (verification only)
7. T024-T029 (Polish) - 30 minutes

**Estimated total**: ~2.5 hours for complete implementation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Most tasks are configuration-based (no source code changes)
- Foundational phase requires GitHub admin access
- Test each user story independently before moving to next
- Keep old npm-publish.yml as backup until validation complete
- Commit after each task or logical group
