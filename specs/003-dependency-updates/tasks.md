---
description: 'Task list for Update Third-Party Dependencies'
---

# Tasks: Update Third-Party Dependencies

**Input**: Design documents from `/specs/003-dependency-updates/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are OPTIONAL. The feature spec does not request new tests, so no new test tasks are included.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Includes exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and baseline review

- [x] T001 Review dependency inventory and engines in `/mnt/e/projects/odd-ai-reviewers/package.json` and `/mnt/e/projects/odd-ai-reviewers/router/package.json` to confirm baseline constraints
- [x] T002 [P] Review repo-standards v7 touchpoints in `/mnt/e/projects/odd-ai-reviewers/eslint.config.mjs`, `/mnt/e/projects/odd-ai-reviewers/.prettierrc`, `/mnt/e/projects/odd-ai-reviewers/commitlint.config.mjs`, `/mnt/e/projects/odd-ai-reviewers/.editorconfig`, `/mnt/e/projects/odd-ai-reviewers/tsconfig.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared prerequisites for all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Ensure Node engine alignment is preserved in `/mnt/e/projects/odd-ai-reviewers/package.json` and `/mnt/e/projects/odd-ai-reviewers/router/package.json` (>=22.0.0)
- [x] T004 [P] Confirm TypeScript version synchronization between `/mnt/e/projects/odd-ai-reviewers/package.json` and `/mnt/e/projects/odd-ai-reviewers/router/package.json`

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - Dependency Version Update (Priority: P1) 🎯 MVP

**Goal**: Update all project dependencies to latest compatible versions while maintaining stability.

**Independent Test**: Run `npm outdated` and confirm no outdated packages (except intentional locks), then run full test suite.

### Implementation for User Story 1

- [x] T005 [P] [US1] Update root devDependencies in `/mnt/e/projects/odd-ai-reviewers/package.json` to latest compatible versions
- [x] T006 [P] [US1] Update router dependencies/devDependencies in `/mnt/e/projects/odd-ai-reviewers/router/package.json` to latest compatible versions
- [x] T007 [US1] Regenerate `/mnt/e/projects/odd-ai-reviewers/package-lock.json` via npm install to reflect dependency changes
- [x] T008 [US1] Run `npm outdated` and record any intentional locks or unresolved peer conflicts in `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/research.md`
- [x] T009 [US1] Review and update npm overrides in `/mnt/e/projects/odd-ai-reviewers/package.json` to preserve required security patches or remove if upstream fixes exist

**Checkpoint**: User Story 1 dependencies updated and lockfile aligned

---

## Phase 4: User Story 2 - Repo-Standards Compliance Update (Priority: P1)

**Goal**: Upgrade to repo-standards v7 and align config files to pass compliance checks.

**Independent Test**: Run `npx repo-standards typescript-js github-actions` and confirm applicable checklist items are satisfied.

### Implementation for User Story 2

- [x] T010 [US2] Upgrade `@oddessentials/repo-standards` to v7.x.x in `/mnt/e/projects/odd-ai-reviewers/package.json`
- [x] T011 [P] [US2] Update `/mnt/e/projects/odd-ai-reviewers/eslint.config.mjs` to satisfy repo-standards v7 rules
- [x] T012 [P] [US2] Update `/mnt/e/projects/odd-ai-reviewers/.prettierrc` to satisfy repo-standards v7 formatting requirements
- [x] T013 [P] [US2] Update `/mnt/e/projects/odd-ai-reviewers/commitlint.config.mjs` to satisfy repo-standards v7 commit linting rules
- [x] T014 [P] [US2] Update `/mnt/e/projects/odd-ai-reviewers/.editorconfig` to satisfy repo-standards v7 editor settings
- [x] T015 [P] [US2] Update `/mnt/e/projects/odd-ai-reviewers/tsconfig.json` to satisfy repo-standards v7 TypeScript settings
- [x] T016 [P] [US2] Update `/mnt/e/projects/odd-ai-reviewers/router/tsconfig.json` if TypeScript or repo-standards updates require adjustments
- [x] T017 [US2] Run `npx repo-standards typescript-js github-actions`, record applicable checklist items and any required fixes in `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/research.md`

**Checkpoint**: Repo-standards v7 compliance configuration complete

---

## Phase 5: User Story 3 - Build and Test Integrity (Priority: P1)

**Goal**: Ensure build, lint, and tests pass after updates with no regressions.

**Independent Test**: Run `npm run verify` and `npm test` successfully.

### Implementation for User Story 3

- [x] T018 [US3] Update `/mnt/e/projects/odd-ai-reviewers/router/vitest.config.ts` if Vitest upgrades require configuration changes
- [x] T019 [US3] Update `/mnt/e/projects/odd-ai-reviewers/.dependency-cruiser.cjs` if dependency-cruiser upgrades require config changes
- [x] T020 [US3] Run `npm run verify` and fix any resulting issues in `/mnt/e/projects/odd-ai-reviewers/router/src/` or root config files
- [x] T021 [US3] Run `npm test` and fix any failures in `/mnt/e/projects/odd-ai-reviewers/router/src/` or `/mnt/e/projects/odd-ai-reviewers/router/`
- [x] T022 [US3] Run `npm audit` and resolve high/critical vulnerabilities via `/mnt/e/projects/odd-ai-reviewers/package.json` overrides or dependency bumps

**Checkpoint**: Build, lint, typecheck, depcruise, tests, and audit clean

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and cross-cutting updates

- [x] T023 Map NFR coverage: note `npm audit` (NFR-001), `npm run verify` (NFR-002), and stable tool outputs (NFR-003) in `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/research.md`
- [x] T024 [P] Update `/mnt/e/projects/odd-ai-reviewers/README.md` if dependency updates change developer workflows
- [x] T025 [P] Update `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/quickstart.md` if verification steps or commands change
- [x] T026 [P] Confirm quickstart steps against `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/quickstart.md` and refine notes as needed

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: Depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational - no dependencies on other stories
- **User Story 2 (P1)**: Can start after User Story 1 (repo-standards upgrade depends on dependency updates)
- **User Story 3 (P1)**: Can start after User Stories 1 and 2 (verification after all updates)

### Within Each User Story

- Configuration updates before verification
- Lockfile regeneration after package.json updates
- Verification after all dependency and config changes

---

## Parallel Execution Examples

### User Story 1

```bash
Task: "Update root devDependencies in /mnt/e/projects/odd-ai-reviewers/package.json"
Task: "Update router dependencies/devDependencies in /mnt/e/projects/odd-ai-reviewers/router/package.json"
```

### User Story 2

```bash
Task: "Update /mnt/e/projects/odd-ai-reviewers/eslint.config.mjs"
Task: "Update /mnt/e/projects/odd-ai-reviewers/.prettierrc"
Task: "Update /mnt/e/projects/odd-ai-reviewers/commitlint.config.mjs"
Task: "Update /mnt/e/projects/odd-ai-reviewers/.editorconfig"
Task: "Update /mnt/e/projects/odd-ai-reviewers/tsconfig.json"
Task: "Update /mnt/e/projects/odd-ai-reviewers/router/tsconfig.json"
```

### User Story 3

```bash
Task: "Update /mnt/e/projects/odd-ai-reviewers/router/vitest.config.ts"
Task: "Update /mnt/e/projects/odd-ai-reviewers/.dependency-cruiser.cjs"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. Stop and validate with `npm outdated` and existing test suite

### Incremental Delivery

1. Foundation ready → User Story 1 → validate
2. Add User Story 2 → validate repo-standards checks
3. Add User Story 3 → validate verify/test/audit
4. Polish & documentation updates
