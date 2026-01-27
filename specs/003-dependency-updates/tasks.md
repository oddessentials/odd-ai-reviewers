# Tasks: Update Third-Party Dependencies

**Input**: Design documents from `/specs/003-dependency-updates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: No new tests required - this feature relies on existing test suite to validate compatibility.

**Organization**: Tasks are grouped by user story. Note that for dependency updates, stories are naturally sequential (updates must happen before compliance checks, which must happen before verification).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Root**: `package.json`, configuration files at repository root
- **Router workspace**: `router/package.json`, `router/src/`
- This is a monorepo with npm workspaces

---

## Phase 1: Setup (Pre-Update Baseline)

**Purpose**: Establish baseline state before updates and prepare for potential rollback

- [ ] T001 Verify current state passes all checks by running `npm run verify && npm run test`
- [ ] T002 Run `npm audit` to document current vulnerability status
- [ ] T003 Run `npm outdated` to document all packages needing updates
- [ ] T004 Create backup reference by noting current versions in package.json and router/package.json

---

## Phase 2: User Story 1 - Dependency Version Update (Priority: P1) 🎯 MVP

**Goal**: Update all project dependencies to their latest compatible versions

**Independent Test**: Run `npm outdated` after updates - should show no outdated packages

### Low-Risk Updates (Patches & Minors)

- [ ] T005 [P] [US1] Update ESLint patches: `@eslint/js@9.39.2`, `eslint@9.39.2` in package.json
- [ ] T006 [P] [US1] Update commitlint packages: `@commitlint/cli@20.3.1`, `@commitlint/config-conventional@20.3.1` in package.json
- [ ] T007 [P] [US1] Update typescript-eslint packages: `@typescript-eslint/eslint-plugin@8.54.0`, `@typescript-eslint/parser@8.54.0`, `typescript-eslint@8.54.0` in package.json
- [ ] T008 [P] [US1] Update Prettier: `prettier@3.8.1` in package.json
- [ ] T009 [P] [US1] Update TypeScript: `typescript@5.9.3` in both package.json and router/package.json
- [ ] T010 [P] [US1] Update @types/node: `@types/node@25.0.10` in router/package.json

### Major Version Updates

- [ ] T011 [US1] Update globals: `globals@17.2.0` in package.json and verify eslint.config.mjs compatibility
- [ ] T012 [US1] Update @octokit/rest: `@octokit/rest@22.0.1` in router/package.json and verify API usage in router/src/report/\*.ts
- [ ] T013 [US1] Update commander: `commander@14.0.2` in router/package.json and verify CLI usage in router/src/main.ts

### Lock File Update

- [ ] T014 [US1] Run `npm install` to regenerate package-lock.json with all updates

**Checkpoint**: All dependencies updated to latest versions. Run `npm outdated` to confirm.

---

## Phase 3: User Story 2 - Repo-Standards Compliance Update (Priority: P1)

**Goal**: Upgrade @oddessentials/repo-standards to v7 and ensure compliance

**Independent Test**: Package installs without errors and any compliance checks pass

### Repo-Standards Upgrade

- [ ] T015 [US2] Update @oddessentials/repo-standards: `@oddessentials/repo-standards@7.1.1` in package.json
- [ ] T016 [US2] Run `npm install` to install repo-standards v7 with its new dependencies (@iarna/toml, fast-json-stable-stringify, uuid)
- [ ] T017 [US2] Verify repo-standards v7 exports work: check that `getStandards()`, `getSchema()`, `STANDARDS_VERSION` are available if used anywhere

### Configuration Compliance

- [ ] T018 [US2] Review eslint.config.mjs for any v7 compliance requirements
- [ ] T019 [US2] Review .prettierrc for any v7 compliance requirements
- [ ] T020 [US2] Review tsconfig.json for any v7 compliance requirements
- [ ] T021 [US2] Review commitlint.config.mjs for any v7 compliance requirements

**Checkpoint**: @oddessentials/repo-standards is at v7.x.x. Configuration files are compliant.

---

## Phase 4: User Story 3 - Build and Test Integrity (Priority: P1)

**Goal**: Verify the project builds successfully and all tests pass after updates

**Independent Test**: Run `npm run verify && npm run test` - all checks pass

### Quality Gate Verification

- [ ] T022 [US3] Run `npm run lint -- --max-warnings 0` to verify zero-tolerance lint policy
- [ ] T023 [US3] Run `npm run format:check` to verify Prettier compatibility
- [ ] T024 [US3] Run `npm run typecheck` to verify TypeScript compilation
- [ ] T025 [US3] Run `npm run depcruise` to verify dependency-cruiser compatibility
- [ ] T026 [US3] Run `npm run build` to verify production build succeeds

### Test Suite Verification

- [ ] T027 [US3] Run `npm run test` to verify all existing tests pass

### Security Verification

- [ ] T028 [US3] Run `npm audit` to verify no new high/critical vulnerabilities
- [ ] T029 [US3] Run `npm ls undici` to check if npm override for undici is still needed in package.json

**Checkpoint**: All quality gates pass. Test suite passes. No new vulnerabilities.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Final cleanup and documentation

- [ ] T030 [P] If undici override is no longer needed, remove it from package.json overrides section
- [ ] T031 [P] Run `npm run format` to apply any new Prettier formatting rules across codebase
- [ ] T032 Run full verification suite: `npm run verify && npm run test`
- [ ] T033 Update CLAUDE.md if any developer workflow changes are needed (via agent context script)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - establishes baseline
- **User Story 1 (Phase 2)**: Depends on Setup - updates all dependencies
- **User Story 2 (Phase 3)**: Depends on US1 - repo-standards must be updated with other packages
- **User Story 3 (Phase 4)**: Depends on US1 and US2 - verification happens after all updates
- **Polish (Phase 5)**: Depends on US3 passing - cleanup after verification

### User Story Dependencies

- **User Story 1 (P1)**: Foundational - must complete first
- **User Story 2 (P1)**: Depends on US1 - repo-standards update is part of dependency updates
- **User Story 3 (P1)**: Depends on US1 + US2 - verification requires all updates complete

### Within Each User Story

- Low-risk updates (patches/minors) can run in parallel
- Major version updates should be sequential to isolate breaking changes
- Lock file regeneration happens after all version updates
- Verification tasks are sequential (lint → format → typecheck → depcruise → build → test)

### Parallel Opportunities

- T005-T010: All low-risk updates can run in parallel (different packages)
- T018-T021: Configuration compliance reviews can run in parallel (different files)
- T030-T031: Polish tasks can run in parallel

---

## Parallel Example: Low-Risk Updates (Phase 2)

```bash
# All these can be done in a single npm install command:
npm install @eslint/js@9.39.2 eslint@9.39.2 \
  @commitlint/cli@20.3.1 @commitlint/config-conventional@20.3.1 \
  @typescript-eslint/eslint-plugin@8.54.0 @typescript-eslint/parser@8.54.0 typescript-eslint@8.54.0 \
  prettier@3.8.1 typescript@5.9.3 --save-dev

# Router workspace updates:
npm install @types/node@25.0.10 --save-dev --workspace=router
```

---

## Implementation Strategy

### Sequential Execution (Recommended)

Since this is a dependency update, sequential execution is safest:

1. Complete Phase 1: Setup (baseline verification)
2. Complete Phase 2: User Story 1 (all dependency updates)
3. Complete Phase 3: User Story 2 (repo-standards compliance)
4. Complete Phase 4: User Story 3 (verification)
5. Complete Phase 5: Polish (cleanup)

### Rollback Plan

If any phase fails:

```bash
git checkout -- package.json package-lock.json router/package.json
rm -rf node_modules router/node_modules
npm install
```

### MVP Scope

**MVP = Phases 1-4 complete**:

- All dependencies updated
- Repo-standards at v7.x.x
- All tests passing
- All quality gates passing

---

## Notes

- [P] tasks = different files/packages, no dependencies between them
- [Story] label maps task to specific user story for traceability
- This feature has naturally sequential user stories (update → compliance → verify)
- Commit after each phase completion
- If breaking changes are found in major version updates, address before continuing
- Avoid: updating all packages blindly without testing between major version changes
