# Tasks: Repository Health & Maintainability Overhaul

**Input**: Design documents from `/specs/416-repo-health-overhaul/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/hook-tiers.md, quickstart.md

**Tests**: No test tasks generated — this feature modifies configuration and file organization, not runtime behavior. Existing test suite (4,291 tests) serves as the regression gate.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup

**Purpose**: Verify baseline state before making changes

- [ ] T001 Verify clean working tree and all tests pass: run `pnpm verify && pnpm --filter ./router test` and record baseline test count (expect 4,291+ passing)
- [ ] T002 Record current pre-push timing: run `time git push --dry-run` (or manual timing of `.husky/pre-push` steps) to establish 6-8 minute baseline

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No blocking prerequisites — all user stories are independent of each other and can proceed after baseline verification

**Checkpoint**: Baseline recorded — user story implementation can begin in parallel

---

## Phase 3: User Story 1 - Developer Pushes Code Without Redundant Checks (Priority: P1) MVP

**Goal**: Restructure git hooks so pre-commit is fast (<30s) and pre-push is focused (<4min), eliminating redundant checks and adding a secret file guard.

**Independent Test**: Time a commit + push cycle. Pre-commit completes <30s with lint-staged + tsc + secret guard. Pre-push completes <4min with depcruise + build + test only. Attempting to commit a `.env.local` file is rejected.

### Implementation for User Story 1

- [ ] T003 [US1] Update pre-commit hook to add secret file guard before lint-staged in `.husky/pre-commit` — insert the following as the first check, before `pnpm exec lint-staged`:

```bash
# Secret file guard: reject .env files (except .env.example)
if git diff --cached --name-only | grep -E '^\\.env' | grep -v '\\.env\\.example$'; then
  echo 'ERROR: .env files must not be committed. Only .env.example is allowed.'
  echo 'If you need to force-add, document the reason in the PR description.'
  exit 1
fi
```

- [ ] T004 [US1] Restructure pre-push hook in `.husky/pre-push` — remove eslint (step 1, line 14), prettier (step 2, line 18), tsc (step 3, line 22), docs:linkcheck (step 5a, line 30), and spec:linkcheck (step 5b, line 33). Keep only: depcruise (step 4), build (step 6), test (step 7). Update step numbering and comments per `contracts/hook-tiers.md`
- [ ] T005 [US1] Verify pre-commit timing: stage a file, commit, confirm hook completes in <30 seconds and runs lint-staged + tsc + secret guard
- [ ] T006 [US1] Verify pre-push timing: push to branch, confirm hook completes in <4 minutes running only depcruise + build + test
- [ ] T007 [US1] Verify secret guard: create `.env.local` with dummy content, `git add -f .env.local`, attempt commit — confirm rejection. Then `git reset HEAD .env.local && rm .env.local`
- [ ] T008 [US1] Verify `.env.example` is NOT blocked by secret guard: `git add .env.example`, attempt commit — confirm it succeeds

**Checkpoint**: Pre-commit <30s, pre-push <4min, secret guard works. Full test suite still passes.

---

## Phase 4: User Story 2 - Developer Finds Tests in Predictable Location (Priority: P2)

**Goal**: Migrate all 79 co-located test files from `router/src/__tests__/` to `router/tests/unit/` organized by domain, and simplify vitest configuration.

**Independent Test**: Run `pnpm --filter ./router test` — all 4,291+ tests pass. No test files exist in `router/src/__tests__/`. Coverage reports measure only `src/` code.

### Implementation for User Story 2

- [ ] T009 [US2] Create domain subdirectories in `router/tests/unit/`: `mkdir -p router/tests/unit/{agents,config,report,phases,types,cli,core}` — matching `router/src/` structure
- [ ] T010 [US2] Inventory all 79 test files in `router/src/__tests__/` and create a migration mapping: for each `.test.ts` file, determine the target domain directory based on its primary import (e.g., `ado.test.ts` imports from `../report/` → `tests/unit/report/ado.test.ts`)
- [ ] T011 [US2] Move test files to domain directories per the mapping from T010 — use `git mv` to preserve history. Move snapshot directories alongside their test files. Example: `git mv router/src/__tests__/opencode.test.ts router/tests/unit/agents/opencode.test.ts`
- [ ] T012 [US2] Update relative import paths in all 79 migrated test files using these rules:
  - **Rule A (source imports)**: `from '../{module}.js'` → `from '../../src/{module}.js'` — applies to most files (imports reaching into `src/`)
  - **Rule B (test utility imports)**: Imports referencing `tests/test-utils.js`, `tests/setup.ts`, or `tests/helpers/` must be rewritten relative to the new file location (e.g., a file in `tests/unit/agents/` importing `test-utils.js` needs `from '../../test-utils.js'`, while a file in `tests/unit/cli/commands/` needs `from '../../../test-utils.js'`)
  - **Rule C (fixture imports)**: Imports referencing `tests/fixtures/` must be depth-adjusted similarly to Rule B
  - **Verification**: After all rewrites, run `pnpm exec tsc --noEmit` to catch any broken paths before running the full test suite. Expect 6-8 files to need Rule B/C treatment based on QA audit findings
- [ ] T013 [US2] Update `router/vitest.config.ts` test include pattern: change `include: ['src/**/*.test.ts', 'tests/**/*.test.ts']` to `include: ['tests/**/*.test.ts']`
- [ ] T014 [US2] Update `router/vitest.config.ts` coverage exclude: change `exclude: ['src/**/*.test.ts', 'src/__tests__/**/*', 'node_modules', 'dist']` to `exclude: ['node_modules', 'dist']`
- [ ] T015 [US2] Verify migration: run `pnpm --filter ./router test` — all 4,291+ tests must pass with zero failures
- [ ] T016 [US2] Verify no test files remain: run `find router/src/__tests__ -name '*.test.ts'` — must return empty. Then `rm -rf router/src/__tests__/`
- [ ] T017 [US2] Verify coverage reports: run `pnpm --filter ./router test:coverage` — confirm coverage measures only `src/**/*.ts` files (no test files in coverage output)

**Checkpoint**: All tests pass from single canonical location. `router/src/__tests__/` deleted. Coverage config unambiguous.

---

## Phase 5: User Story 3 - AI Reviewer Skips Non-Reviewable Files (Priority: P2)

**Goal**: Create `.reviewignore` with documented categories so the AI reviewer focuses on source code.

**Independent Test**: Verify `.reviewignore` exists with all required categories and each pattern matches at least one file in the repo.

### Implementation for User Story 3

- [ ] T018 [P] [US3] Create `.reviewignore` at repository root with the following categories and patterns (per spec FR-009, FR-010):

```
# Machine-generated files
CHANGELOG.md
pnpm-lock.yaml

# Agent/tooling configuration
.claude/
.specify/features/
.specify/templates/
.specify/scripts/
CLAUDE.md

# Build artifacts
dist/
node_modules/
coverage/

# Test fixtures (data, not logic)
router/tests/fixtures/benchmark/*.snapshot.json
router/tests/fixtures/redos-corpus/

# Specs (contract docs, not source)
specs/

# IDE and OS artifacts
.idea/
.vscode/
.DS_Store
Thumbs.db

# Secrets and credentials (defense-in-depth — primary boundary is .gitignore)
.env
.env.*
!.env.example
secrets.json
credentials.json
*.key
*.pem
```

- [ ] T019 [US3] Validate every pattern in `.reviewignore` matches at least one tracked or existing file — run `git ls-files` against each pattern to confirm no dead patterns

**Checkpoint**: `.reviewignore` exists, all patterns are documented and valid.

---

## Phase 6: User Story 4 - Tracked Files Reflect Actual Project Needs (Priority: P3)

**Goal**: Update `.gitignore` to exclude generated .specify/ data while keeping the governance constitution tracked. Fix CLAUDE.md header accuracy.

**Independent Test**: `git ls-files .specify/memory/constitution.md` shows tracked. `git ls-files .specify/features/` shows nothing. CLAUDE.md header does not claim "Auto-generated."

### Implementation for User Story 4

- [ ] T020 [P] [US4] Update `.gitignore` — add the following lines in the appropriate section:

```
# Specification tooling (generated data, not governance)
.specify/features/
.specify/templates/
.specify/scripts/
```

- [ ] T021 [US4] Untrack generated .specify/ files: run `git rm --cached -r .specify/features/ .specify/templates/ .specify/scripts/` — preserves local files but removes from git index
- [ ] T022 [US4] Verify constitution remains tracked: run `git ls-files .specify/memory/constitution.md` — must show the file
- [ ] T023 [P] [US4] Fix CLAUDE.md header: change line 3 from `Auto-generated from all feature plans. Last updated: 2026-01-27` to `Development guidelines maintained by the project team. Last updated: 2026-03-15` in `CLAUDE.md`

**Checkpoint**: .specify/ compromise implemented. CLAUDE.md header accurate.

---

## Phase 7: User Story 5 - Completed Specifications Are Archived (Priority: P3)

**Goal**: Move 20 completed spec directories to `specs/archive/` with zero broken cross-references.

**Independent Test**: `pnpm spec:linkcheck` passes. Active specs directory shows ~10 directories instead of 30+.

### Implementation for User Story 5

- [ ] T024 [US5] Run cross-reference audit: execute `grep -rn "specs/001-\|specs/004-\|specs/005-\|specs/006-\|specs/007-\|specs/008-\|specs/009-\|specs/010-\|specs/011-\|specs/012-\|specs/405-\|specs/406-" . --include="*.md" --include="*.ts" --include="*.js" --include="*.cjs" --include="*.mjs" --include="*.yml" --include="*.yaml" --include="*.json"` (excluding node_modules) and record all references
- [ ] T025 [US5] Update all cross-references found in T024 to point to `specs/archive/` prefix (e.g., `specs/001-fix-feedback-bugs/` → `specs/archive/001-fix-feedback-bugs/`)
- [ ] T026 [US5] Create archive directory and move completed specs: `mkdir -p specs/archive && git mv specs/001-* specs/004-* specs/005-* specs/006-* specs/007-* specs/008-* specs/009-* specs/010-* specs/011-* specs/012-* specs/405-* specs/406-* specs/archive/`
- [ ] T027 [US5] Update `scripts/check-spec-test-links.cjs` to also scan `specs/archive/*/spec.md` in addition to `specs/*/spec.md` — find the glob pattern that reads spec files and add the archive path
- [ ] T028 [US5] Verify: run `pnpm spec:linkcheck` — must pass with zero broken links

**Checkpoint**: 20 directories archived. ~10 active specs visible. Link validation passes.

---

## Phase 8: User Story 6 - CI Enforces Prompt Convention Sync (Priority: P3)

**Goal**: Verify that CI already enforces prompt sync (confirmed at `.github/workflows/ci.yml` line 61).

**Independent Test**: CI workflow contains `pnpm prompts:check` step.

### Implementation for User Story 6

- [ ] T029 [US6] Verify prompt sync is enforced in CI: confirm `.github/workflows/ci.yml` line 61 contains `run: pnpm prompts:check` — no changes needed (already present)
- [ ] T030 [US6] Verify current sync status: run `pnpm prompts:check` locally — confirm zero drift

**Checkpoint**: Prompt sync enforcement confirmed. No changes needed.

---

## Phase 9: User Story 7 - Badge Status Reflects Actual Project Health (Priority: P3)

**Goal**: Harden badge-update workflow with artifact validation and create `.nvmrc` with major version pin.

**Independent Test**: Badge workflow has artifact validation step. `.nvmrc` contains "22".

### Implementation for User Story 7

- [ ] T031 [P] [US7] Create `.nvmrc` at repository root with content `22` (major version only, per research R-003 and Devil's Advocate review)
- [ ] T032 [US7] Update `.github/workflows/badge-update.yml` — add an artifact validation step before badge generation that checks for existence of `router/test-results.json` and `router/coverage/coverage-summary.json`, failing with a clear error if either is missing
- [ ] T033 [US7] Verify badge-update workflow syntax: run `actionlint .github/workflows/badge-update.yml` (if available) or manually review YAML structure for correctness

**Checkpoint**: `.nvmrc` exists. Badge workflow validates artifacts before update.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Final verification across all stories

- [ ] T034 Run full verification suite: `pnpm verify && pnpm --filter ./router test && pnpm spec:linkcheck && pnpm docs:linkcheck`
- [ ] T035 Verify pre-push with all changes applied: run `git push --dry-run` and confirm <4 minute execution
- [ ] T036 Run quickstart.md validation commands from `specs/416-repo-health-overhaul/quickstart.md` verification section
- [ ] T037 Review all modified files for consistency: `.husky/pre-commit`, `.husky/pre-push`, `.gitignore`, `.reviewignore`, `.nvmrc`, `CLAUDE.md`, `router/vitest.config.ts`, `.github/workflows/badge-update.yml`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (baseline verification)
- **US1 Hook Restructuring (Phase 3)**: Depends on Phase 2
- **US2 Test Migration (Phase 4)**: Depends on Phase 2
- **US3 .reviewignore (Phase 5)**: Depends on Phase 2
- **US4 .gitignore + CLAUDE.md (Phase 6)**: Depends on Phase 2
- **US5 Spec Archival (Phase 7)**: Depends on Phase 2
- **US6 Prompt Sync (Phase 8)**: Depends on Phase 2
- **US7 Badge Hardening (Phase 9)**: Depends on Phase 2
- **Polish (Phase 10)**: Depends on ALL user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — no dependencies on other stories
- **US2 (P2)**: Independent — no dependencies on other stories
- **US3 (P2)**: Independent — no dependencies on other stories
- **US4 (P3)**: Independent — no dependencies on other stories
- **US5 (P3)**: Independent — no dependencies on other stories
- **US6 (P3)**: Independent — verification only, no code changes
- **US7 (P3)**: Independent — no dependencies on other stories

**All 7 user stories can be implemented in parallel** after Phase 2 baseline verification.

### Within Each User Story

- Configuration changes before verification tasks
- File moves before config updates (US2: move tests → update vitest config)
- Audit before move (US5: cross-reference audit → update refs → move specs)

### Parallel Opportunities

- T018 (.reviewignore) + T020 (.gitignore) + T023 (CLAUDE.md) + T031 (.nvmrc) — all create/edit different files, can run simultaneously
- US1 through US7 can all proceed in parallel after baseline
- T003 (pre-commit) and T004 (pre-push) — different files, can run in parallel
- T009 (create dirs) through T012 (update imports) — sequential within US2, but US2 is parallel with other stories

---

## Parallel Example: Maximum Parallelism

```bash
# After Phase 2 baseline, launch all independent stories simultaneously:

# Stream 1 (US1): Hook restructuring
Task: "T003 Update pre-commit hook in .husky/pre-commit"
Task: "T004 Restructure pre-push hook in .husky/pre-push"

# Stream 2 (US2): Test migration
Task: "T009 Create domain subdirectories in router/tests/unit/"
Task: "T010 Inventory and map 79 test files"
Task: "T011 Move test files with git mv"
Task: "T012 Update import paths"

# Stream 3 (US3 + US4 + US7): Config files (all different files)
Task: "T018 Create .reviewignore"
Task: "T020 Update .gitignore"
Task: "T023 Fix CLAUDE.md header"
Task: "T031 Create .nvmrc"

# Stream 4 (US5): Spec archival
Task: "T024 Cross-reference audit"
Task: "T025 Update references"
Task: "T026 Move specs to archive"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline)
2. Complete Phase 2: Foundational (verify baseline)
3. Complete Phase 3: US1 — Hook Restructuring + Secret Guard
4. **STOP and VALIDATE**: Pre-push <4min, secret guard works, tests pass
5. Ship if ready — immediate developer experience improvement

### Incremental Delivery

1. Setup + Foundational → Baseline recorded
2. US1 (Hook restructuring) → Ship → Immediate DX win
3. US2 (Test migration) → Ship → Codebase clarity
4. US3 + US4 (Config hygiene) → Ship → AI review + git hygiene
5. US5 (Spec archival) → Ship → Cognitive load reduction
6. US6 + US7 (CI + badges) → Ship → Automation hardening
7. Polish → Final verification pass

### Parallel Team Strategy

With 3+ developers:

1. Team completes Setup + Foundational together
2. Once baseline verified:
   - Developer A: US1 (hooks) + US7 (badges)
   - Developer B: US2 (test migration)
   - Developer C: US3 (.reviewignore) + US4 (.gitignore) + US5 (spec archival) + US6 (verification)
3. Polish phase: team reviews all changes together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- No test tasks generated — existing 4,291+ test suite is the regression gate
- Commit after each phase or logical group for safe incremental progress
- Stop at any checkpoint to validate story independently
- US6 (Prompt Sync) requires no code changes — already enforced in CI
