# Tasks: False-Positive Reduction & Benchmark Integration

**Input**: Design documents from `/specs/414-fp-reduction-and-benchmark/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Required by FR-301 through FR-304 — test tasks are mandatory.

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1 but separated: US1 delivers FP reduction, US2 verifies TP preservation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the shared prompt conventions fragment and sync tooling that eliminates 7-way prompt duplication.

- [x] T001 Create shared conventions fragment with conventions 7-12 (existence verification, TypeScript type-system trust, no business-decision findings, no cosmetic refactoring, developer tooling, React useRef), strengthened Active Context Directives (MANDATORY with hard constraints + design intent awareness), and data-flow additions (binary response bodies, Zod-validated inputs) in `config/prompts/_shared_conventions.md`
- [x] T002 Create prompt sync script that reads `_shared_conventions.md`, replaces content between `<!-- BEGIN/END SHARED CONVENTIONS -->` markers in all 4 prompt files, and generates a compressed TypeScript fallback constant for agent inline fallbacks in `scripts/sync-prompt-conventions.ts`
- [x] T003 [P] Add `prompts:sync` and `prompts:check` scripts to `package.json`

**Checkpoint**: Shared fragment exists, sync script runs successfully, npm scripts registered

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: No additional foundational work required — existing infrastructure (CI, test framework, benchmark scorer, finding validator) is sufficient. Phase 1 setup creates the shared fragment which is the only prerequisite for user story work.

**⚠️ CRITICAL**: Phase 1 must complete before any user story work begins.

---

## Phase 3: User Story 1 — Reviewer Receives Fewer False Positives (Priority: P1) 🎯 MVP

**Goal**: Reduce false positives from 78.6% unaddressed to under 15% via prompt conventions, framework filter expansion, and PR intent suppression. Addresses Gaps 1-7 from the FP taxonomy.

**Independent Test**: Run `pnpm vitest router/tests/unit/report/framework-pattern-filter.test.ts` and `pnpm vitest router/tests/unit/prompts/prompt-sync.test.ts` — all tests pass including new T022/T023 matchers and 12-convention sync check. Run `pnpm prompts:check` — all 4 prompts match shared fragment hash.

**Phase 3 exit gate**: SC-001 ≥ 85%, SC-002 = 100%, `pnpm prompts:check` passes

### Prompt Centralization (FR-101 through FR-108, FR-114)

- [x] T004 [US1] Add `<!-- BEGIN/END SHARED CONVENTIONS -->` markers to all 4 prompt files, add missing Data-flow Verification and Active Context Directives sections to `config/prompts/architecture_review.md` (currently 58 lines — missing 2 entire sections present in other prompts), then run sync script to insert shared conventions into `config/prompts/semantic_review.md`, `config/prompts/pr_agent_review.md`, `config/prompts/opencode_system.md`, and `config/prompts/architecture_review.md`
- [x] T005 [US1] Generate inline fallback constant from shared fragment and update imports in `router/src/agents/ai_semantic_review.ts` (lines 216-242), `router/src/agents/pr_agent.ts` (lines 204-217), and `router/src/agents/opencode.ts` (lines 86-107)

### Framework Pattern Filter Expansion (FR-109 through FR-111)

- [x] T006 [US1] Add T022 (React Query dedup) and T023 (Promise.allSettled order) matchers with tightened evidence requirements to `router/src/report/framework-pattern-filter.ts` — T022 requires 3-point evidence (library import + query hook call near line + raw HTTP exclusion), T023 requires 2-point evidence (allSettled call near line + result iteration proof) — update header comment (line 8) and table comment (line 122) from "3 matchers" to "5 matchers", insert both matchers before `] as const` on line 203

### PR Intent Suppression Upgrade (FR-112, FR-113)

- [x] T007 [US1] Upgrade `logPRIntentContradictions` → `filterPRIntentContradictions` in `router/src/report/finding-validator.ts` — change return type from `void` to `Finding[]`, add closed category gate (only `documentation`, `style`, `cosmetic`, `refactoring` eligible), add severity gate (`info` only), replace open-ended contradiction map with exact contradiction pairs (add↔remove, remove↔add/missing, rename↔revert, refactor↔revert/undo), add subject match requirement (same file or code construct), add `'pr_intent_contradiction'` to `filterType` union (line 29), integrate as Pass 4 into `validateFindingsSemantics()` (lines 260-262), log all suppressions with `[filtered:pr-intent]` tag, support `prIntentSuppression: boolean` config flag in `.ai-review.yml` (default: `true`) as kill switch to disable feature entirely

### Tests (FR-301 through FR-304)

- [x] T008 [P] [US1] Update `router/tests/unit/prompts/prompt-sync.test.ts` — change `extractFrameworkConventions()` from 6-keyword counting to 12-convention hash comparison, verify all 4 prompt files and 3 inline fallbacks match shared fragment SHA-256 hash, add test for `architecture_review.md` Active Context Directives section (currently not tested for ACDs)
- [x] T009 [P] [US1] Add T022 tests to `router/tests/unit/report/framework-pattern-filter.test.ts` — suppress case (react-query import + useQuery hook near line), suppress case (swr import + useSWR near line), pass-through (no query import), pass-through (message mentions `fetch()` — raw HTTP exclusion), pass-through (react-query import but no hook call near finding line)
- [x] T010 [P] [US1] Add T023 tests to `router/tests/unit/report/framework-pattern-filter.test.ts` — suppress case (allSettled call + forEach near line), pass-through (allSettled NOT near finding line), pass-through (allSettled near line but no result iteration access)
- [x] T011 [P] [US1] Add PR intent suppression tests to finding-validator test file — info severity + eligible category → suppressed, info severity + ineligible category (e.g., `security`) → NOT suppressed, warning severity + eligible category → NOT suppressed, missing subject match → NOT suppressed, kill switch disabled → NOT suppressed

### CI Integration

- [x] T012 [US1] Add `pnpm prompts:check` step to ci.yml quality job after "Format check" step in `.github/workflows/ci.yml` — fails build if any prompt has drifted from shared fragment

**Checkpoint**: All prompt files contain conventions 7-12 + strengthened ACDs from single source of truth. Framework filter has 5 matchers with tightened evidence. PR intent suppression active for info-severity findings in closed category set. All new tests pass. CI enforces prompt sync.

---

## Phase 4: User Story 2 — Genuine Issues Are Still Detected (Priority: P1)

**Goal**: Verify that FP reduction in US1 has not introduced false negatives. All 19 TP benchmark scenarios continue to pass. New Gap 1-7 scenarios validate the FP fixes.

**Independent Test**: Run `pnpm vitest router/tests/integration/false-positive-benchmark.test.ts` — all scenarios pass, SC-001 ≥ 90%, SC-002 = 100%, ≥80% scenarios runnable.

**Phase 4 exit gate**: SC-001 ≥ 90%, SC-002 = 100%, all new scenarios pass, ≥80% scenarios runnable

### Benchmark Scenarios & Verification

- [x] T013 [US2] Add ~13-18 new FP scenarios for Gaps 1-7 to `router/tests/fixtures/benchmark/regression-suite.json` — Gap 1 (Pattern F, existence verification, 2-3 scenarios), Gap 2 (Pattern E, over-engineering, 2-3 scenarios), Gap 3 (Pattern C, project context, 2-3 scenarios), Gap 4 (Pattern B, T022/T023 filter, 2 deterministic scenarios), Gap 5 (Pattern D, PR intent, 1-2 deterministic scenarios), Gap 6 (Pattern A, developer tooling, 1 scenario), Gap 7 (Pattern A, binary response, 1 scenario) — add `"snapshotVersion": 2` to suite metadata
- [x] T014 [US2] Record snapshot files for prompt-dependent scenarios (Gaps 1-3, 6-7) by running each scenario against a live LLM, writing results to `router/tests/fixtures/benchmark/snapshots/{scenarioId}.snapshot.json` with correct `promptTemplateHash` and `fixtureHash`
- [x] T015 [US2] Add runnable count guard assertion to `router/tests/integration/false-positive-benchmark.test.ts` — assert that `runnableScenarios / totalScenarios >= 0.80` to prevent vacuous gate when snapshots are stale
- [x] T016 [US2] Raise SC-001 threshold from `0.85` to `0.90` in the release gate assertion at `router/tests/integration/false-positive-benchmark.test.ts` (line 592) to operationalize the "under 15% unaddressed" target

**Checkpoint**: Internal benchmark passes at ≥90% FP suppression and 100% TP recall. All 42 documented FPs accounted for (9 pre-existing + 29-31 new fixes + 2 architectural/deferred).

---

## Phase 5: User Story 3 — Measurable Quality via External Benchmark (Priority: P2)

**Goal**: Create adapter and regression check scripts to measure the tool's quality against the withmartian code-review-benchmark (50 PRs, 5 OSS projects).

**Independent Test**: Run `pnpm vitest scripts/__tests__/benchmark-adapter.test.ts` and `pnpm vitest scripts/__tests__/benchmark-check.test.ts` — all tests pass. Run adapter in `--dry-run` mode against a 1-PR mock fixture.

### Implementation

- [x] T017 [US3] Create benchmark adapter script with resource controls in `scripts/benchmark-adapter.ts` — CLI interface (`--golden-dir`, `--output`, `--concurrency` default 1 max 5, `--timeout-per-pr` default 300s, `--max-retries` default 1, `--cache-dir`, `--no-cleanup`, `--max-runtime` default 7200s, `--dry-run`), disk space guard (<2GB aborts), shallow clones (`--depth 1`), output mapping (message→text with suggestion append, file→path, line→line, source="extracted"), skip unavailable PRs with summary report
- [x] T018 [US3] Create benchmark regression check script in `scripts/benchmark-check.ts` — reads `summary.json` from `--results` directory, compares precision/recall/F1 against `--min-precision`, `--min-recall`, `--min-f1` threshold arguments, prints pass/fail table to stdout, exits 0 (all pass), 1 (regression), or 2 (invalid args/missing files)

### Tests

- [x] T019 [P] [US3] Create adapter tests in `scripts/__tests__/benchmark-adapter.test.ts` — unit: transforms mock CLI JSON to candidate format (message mapping, suggestion append), handles empty findings, sets `line: null` when undefined, skips PR on CLI failure (mocked execSync); integration: `--dry-run` mode against 1-PR fixture
- [x] T020 [P] [US3] Create check tests in `scripts/__tests__/benchmark-check.test.ts` — unit: all scores above thresholds → exit 0, precision below → exit 1, recall below → exit 1, missing results file → exit 2, invalid args → exit 2
- [x] T021 [P] [US3] Create mock results fixture at `router/tests/fixtures/benchmark/mock-results/summary.json` with sample precision/recall/F1 values for CI smoke test

**Checkpoint**: Adapter script transforms CLI output to benchmark candidate format. Check script validates scores against thresholds. All automated tests pass.

---

## Phase 6: User Story 4 — Developer Iteration via Local Benchmark (Priority: P3)

**Goal**: Provide Docker configuration for reproducible local benchmark runs.

**Independent Test**: Run `docker build -f Dockerfile.benchmark .` — image builds successfully. Verify `.env` is in `.dockerignore`.

### Implementation

- [x] T025 [US4] Create Docker benchmark image in `Dockerfile.benchmark` — multi-stage build with `node:22-bookworm-slim`, install git/curl/python3/uv/gh CLI/pnpm, copy and build odd-ai-reviewers, clone benchmark repo, NO secrets baked into image (runtime only via `--env-file`)
- [x] T026 [US4] Create Docker Compose configuration in `docker-compose.benchmark.yml` — environment variables via `--env-file .env` (not inline), volume mount `./benchmark-results:/results`, tmpfs `/tmp:size=2G`, service name `benchmark-runner`
- [x] T027 [P] [US4] Add `.env` to `.dockerignore` to prevent secret leakage into Docker images

**Checkpoint**: Docker image builds, compose config references env-file, .env excluded from image.

---

## Phase 7: User Story 5 — Automated Benchmark in CI (Priority: P3)

**Goal**: GitHub Actions workflow runs external benchmark weekly and on manual trigger, with step-scoped secrets, fork PR blocking, and minimum-privilege permissions.

**Independent Test**: Trigger benchmark workflow manually via `gh workflow run benchmark.yml` — workflow starts, validates arguments, and completes (adapter + judge + upload steps). Fork PR does NOT trigger workflow.

### Implementation

- [x] T028 [US5] Create benchmark CI workflow in `.github/workflows/benchmark.yml` — `workflow_dispatch` (with `judge_model` input) + `schedule` (cron `0 2 * * 0`), `permissions: contents: read`, fork PR restriction (`github.event.pull_request.head.repo.full_name == github.repository`), 120-minute timeout, step-scoped secrets (ANTHROPIC_API_KEY + GH_TOKEN to adapter step only, MARTIAN_API_KEY to judge step only), upload results as artifacts, regression guard via `benchmark-check.ts`
- [x] T029 [US5] Add CI smoke test step to existing `benchmark-regression` job in `.github/workflows/ci.yml` — runs `npx tsx scripts/benchmark-check.ts --results router/tests/fixtures/benchmark/mock-results/ --min-precision 0.01 --min-recall 0.01 --min-f1 0.01` to validate script parses args and produces output
- [x] T030 [P] [US5] Add `benchmark:record` script to `package.json` that records snapshot files for all snapshot-dependent scenarios by executing against live LLM and writing to `router/tests/fixtures/benchmark/snapshots/`

**Checkpoint**: Benchmark workflow configured with weekly schedule, step-scoped secrets, fork blocking. CI smoke test validates benchmark scripts on every PR.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, audit trail, and documentation.

- [x] T031 Run full test suite (`pnpm test`) — verify all 4,068+ existing tests pass with zero regressions after all changes
- [x] T032 Run quickstart.md validation — execute all build/test/benchmark commands listed in `specs/414-fp-reduction-and-benchmark/quickstart.md` and verify each succeeds, measure adapter execution time against SC-109 (<30 min for 10 PRs) and CI workflow timeout against SC-110 (<2 hours)
- [x] T033 Verify 42-FP audit trail — confirm 9 pre-existing fixes + 29-31 new fixes + 2 architectural/deferred = all 42 FPs from issues #158-#161 accounted for, document final status in a comment on the PR

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 3)**: Depends on Setup (Phase 1) — shared fragment must exist before prompt sync
- **US2 (Phase 4)**: Depends on US1 (Phase 3) — prompts and filters must be in place before recording snapshots and adding verification scenarios
- **US3 (Phase 5)**: Depends on Setup (Phase 1) only — adapter/check scripts are standalone
- **US4 (Phase 6)**: Depends on US3 (Phase 5) — Docker wraps the adapter script
- **US5 (Phase 7)**: Depends on US3 (Phase 5) — CI workflow runs the adapter and check scripts
- **Polish (Phase 8)**: Depends on all previous phases

### User Story Dependencies

- **US1 (P1)**: Starts after Setup → delivers FP reduction (the core value)
- **US2 (P1)**: Starts after US1 → verifies no TP regression (validation of US1)
- **US3 (P2)**: Can start after Setup in parallel with US1 → delivers external benchmark measurement
- **US4 (P3)**: Starts after US3 → delivers Docker for local benchmark runs
- **US5 (P3)**: Starts after US3 → delivers automated CI benchmark

### Within Each User Story

- Prompt centralization before filter/validator changes (US1)
- Filter matchers before filter tests (US1)
- PR intent upgrade before PR intent tests (US1)
- Scenarios before snapshots before threshold raise (US2)
- Adapter before adapter tests (US3)
- Check before check tests (US3)

### Parallel Opportunities

- T003 can run in parallel with T001/T002 (different files)
- T008, T009, T010, T011 can all run in parallel (different test files)
- T019, T020, T021 can all run in parallel (different test files)
- T027 can run in parallel with T025/T026 (different files)
- T030 can run in parallel with T028/T029 (different files)
- **US3 (Phase 5) can run in parallel with US1 (Phase 3)** — adapter/check scripts have no dependency on prompt or filter changes

---

## Parallel Example: User Story 1

```text
# After T004-T007 (prompt sync) completes, launch in parallel:
Task T008: "Update prompt-sync.test.ts for 12-convention hash check"
Task T009: "Add T022 tests to framework-pattern-filter.test.ts"
Task T010: "Add T023 tests to framework-pattern-filter.test.ts"
Task T011: "Add PR intent suppression tests"

# US3 can start in parallel with US1:
Task T017: "Create benchmark-adapter.ts" (parallel with T004-T012)
Task T018: "Create benchmark-check.ts" (parallel with T004-T012)
```

---

## Parallel Example: User Story 3

```text
# After T017-T018 (adapter + check) complete, launch test tasks in parallel:
Task T019: "Create benchmark-adapter.test.ts"
Task T020: "Create benchmark-check.test.ts"
Task T021: "Create mock-results fixture"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shared fragment + sync script)
2. Complete Phase 3: User Story 1 (prompts + filter + PR intent + tests)
3. **STOP and VALIDATE**: Run `pnpm test` + `pnpm prompts:check` — SC-001 ≥ 85%, SC-002 = 100%
4. This alone delivers the primary value: fewer false positives for developers

### Incremental Delivery

1. Setup → Foundation ready
2. Add US1 (FP reduction) → Test independently → **MVP delivered** (core value)
3. Add US2 (TP verification) → Raise SC-001 to ≥90% → Regression-proof
4. Add US3 (benchmark scripts) → External quality measurement available
5. Add US4 (Docker) → Reproducible local benchmark runs
6. Add US5 (CI workflow) → Automated weekly quality monitoring
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup together (Phase 1)
2. Once Setup is done:
   - Developer A: US1 (prompts + filter + PR intent) → then US2 (verification)
   - Developer B: US3 (adapter + check scripts) → then US4 (Docker) → then US5 (CI)
3. Stories complete and integrate independently
4. Final: both developers run Polish phase together

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Tests are REQUIRED (FR-301 through FR-304) — not optional for this feature
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- SC-001 threshold raise (T016) happens in Phase 4, AFTER all new scenarios are in place
- Snapshot recording (T014) requires Phase 3 prompt changes to be committed first
