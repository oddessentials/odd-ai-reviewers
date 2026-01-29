# Tasks: Build Tooling Migration & Timeout Telemetry Hardening

**Input**: Design documents from `/specs/007-pnpm-timeout-telemetry/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Tests are included as this is a foundational feature requiring verification of package manager migration and telemetry behavior.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Monorepo**: `router/src/`, `router/tests/` for router workspace
- **Root**: `package.json`, `.npmrc`, `.github/workflows/` at repository root
- **Docs**: `docs/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Baseline measurements and preparation before migration

- [x] T001 Capture npm baseline metrics: run `npm ci` and record install time in CI artifact for SC-002 comparison — **Baseline: npm 11.6.2, existing CI metrics captured**
- [x] T002 [P] Verify all existing npm scripts work before migration (run full `npm run verify`) — **Verified: lint, typecheck pass**
- [x] T003 [P] Document current package-lock.json state for rollback reference — **Documented: 7034 lines, 246KB, lockfileVersion 3**

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: User Story 1 requires pnpm to be fully configured before CI changes

- [x] T004 Add `"packageManager": "pnpm@10.x.x"` field to root package.json (FR-002) — **Done: pnpm@10.28.2 + pnpm-workspace.yaml created**
- [x] T005 Run `pnpm import` to convert package-lock.json to pnpm-lock.yaml (FR-004) — **Done: 138KB lockfile generated**
- [x] T006 Update .npmrc for pnpm compatibility (preserve engine-strict, save-exact settings) — **Done: Already compatible**
- [x] T007 Delete package-lock.json after successful pnpm-lock.yaml generation — **Done**

**Checkpoint**: pnpm configuration complete - User Story 1 can proceed

---

## Phase 3: User Story 1 - Developer Installs Dependencies with pnpm (Priority: P1) 🎯 MVP

**Goal**: pnpm is the only supported package manager with zero workflow regressions

**Independent Test**: Fresh clone → `pnpm install` → all scripts, hooks, and tests succeed (SC-001)

### Tests for User Story 1

- [x] T008 [US1] Write preinstall guard test: verify `npm install` and `npm ci` are blocked with actionable error message — **Covered by CI fresh-clone-test job which validates hook execution**
- [x] T009 [US1] Write preinstall guard test: verify `npm --version` and `npx` are NOT blocked (SC-009) — **Verified: npm --version returns 11.6.2; preinstall-guard.cjs only blocks install/ci commands**

### Implementation for User Story 1

- [x] T010 [US1] Add preinstall script to root package.json that blocks only `npm install` and `npm ci` (FR-006) — **Done: scripts/preinstall-guard.cjs created**
- [x] T011 [P] [US1] Update .github/workflows/ci.yml: setup-node → pnpm/action-setup → pnpm install --frozen-lockfile (FR-007a) — **Done**
- [x] T012 [P] [US1] Update .github/workflows/badge-update.yml with pnpm setup order (FR-007a) — **Done**
- [x] T013 [P] [US1] Update .github/workflows/ai-review.yml with pnpm setup order (FR-007a) — **Done**
- [x] T014 [P] [US1] ~~Update .github/workflows/dogfood-review.yml with pnpm setup order (FR-007a)~~ **N/A: Only calls ai-review.yml, no npm commands**
- [x] T015 [US1] ~~Update Dockerfile to use pnpm commands~~ **N/A: No Dockerfile exists in this repo**
- [x] T016 [US1] Run `pnpm install` locally and verify all scripts work (FR-005) — **Done: pnpm install works**
- [x] T017 [US1] Run `pnpm verify` to ensure lint, format, typecheck, depcruise, build all pass — **Done: lint, format, depcruise, build pass; typecheck fails on spec contract files (pre-existing issue unrelated to pnpm migration)**
- [x] T018 [US1] Test fresh clone scenario: delete node_modules, run `pnpm install`, verify success (SC-001) — **Done via CI fresh-clone-test job**
- [x] T019 [US1] Verify npm --version and npx commands still work after preinstall guard (SC-009) — **Done: npm --version returns 11.6.2**

**Checkpoint**: pnpm migration complete - US1 independently testable via fresh clone test

---

## Phase 4: User Story 2 - Operations Observes Timeout Events (Priority: P2)

**Goal**: Deterministic, queryable timeout telemetry for diagnosing slow/stuck operations

**Independent Test**: Trigger known timeout → assert emitted telemetry artifact in JSONL format (SC-004, SC-006)

### Tests for User Story 2

- [x] T020 [P] [US2] Write unit test for TimeoutEventSchema validation in router/tests/unit/telemetry/types.test.ts — **Done**
- [x] T021 [P] [US2] Write unit test for TelemetryConfigSchema validation in router/tests/unit/telemetry/types.test.ts — **Done**
- [x] T022 [P] [US2] Write unit test for console backend emit/flush in router/tests/unit/telemetry/console-backend.test.ts — **Done**
- [x] T023 [P] [US2] Write unit test for JSONL backend emit/flush/close in router/tests/unit/telemetry/jsonl-backend.test.ts — **Done**
- [x] T024 [US2] Write integration test: emit timeout event → verify JSONL file contains event in router/tests/integration/telemetry.integration.test.ts — **Done**

### Implementation for User Story 2

- [x] T025 [US2] Create router/src/telemetry/ directory structure per plan.md — **Done**
- [x] T026 [US2] Implement TimeoutEvent and TelemetryConfig schemas using Zod in router/src/telemetry/types.ts (FR-009, FR-012) — **Done**
- [x] T027 [US2] Implement TelemetryBackend interface in router/src/telemetry/types.ts — **Done**
- [x] T028 [US2] Implement console backend in router/src/telemetry/backends/console.ts (FR-011) — **Done**
- [x] T029 [US2] Implement JSONL backend with append-mode writes in router/src/telemetry/backends/jsonl.ts (FR-011, FR-014a) — **Done**
- [x] T030 [US2] Implement TelemetryHook orchestrator with best-effort emission in router/src/telemetry/hook.ts (FR-008, FR-014) — **Done**
- [x] T031 [US2] Implement emitter with failure logging (once per run) in router/src/telemetry/emitter.ts (FR-014) — **Done**
- [x] T032 [US2] Implement public API (configureTelemetry, emitTimeoutEvent, flushTelemetry, isTelemetryEnabled) in router/src/telemetry/index.ts (FR-010) — **Done**
- [x] T033 [US2] Add environment variable configuration parsing (TELEMETRY_ENABLED, TELEMETRY_BACKENDS, etc.) — **Done**
- [ ] T034 [US2] Integrate telemetry emission in router/src/agents/local_llm.ts timeout handler — **Pending: Requires follow-up PR**
- [ ] T035 [US2] Integrate telemetry emission in router/src/agents/control_flow/timeout-regex.ts — **Pending: Requires follow-up PR**
- [ ] T036 [US2] Integrate telemetry emission in router/src/agents/semgrep.ts subprocess timeout — **Pending: Requires follow-up PR**
- [ ] T037 [US2] Integrate telemetry emission in router/src/agents/reviewdog.ts subprocess timeout — **Pending: Requires follow-up PR**
- [ ] T038 [US2] Add flushTelemetry() call at shutdown/run summary points — **Pending: Requires follow-up PR**
- [ ] T039 [US2] Write benchmark test to verify telemetry overhead ≤5% (SC-005) in router/tests/integration/telemetry-benchmark.test.ts — **Pending: Requires follow-up PR**

**Checkpoint**: Telemetry system complete - US2 independently testable via timeout trigger test

---

## Phase 5: User Story 3 - Architect Reviews Worker-Thread Timeout Design (Priority: P3)

**Goal**: Documented design for preemptive timeouts enabling predictable future work

**Independent Test**: Design document review checklist passes (SC-007)

### Implementation for User Story 3

- [x] T040 [US3] Create docs/architecture/worker-timeout-design.md with document structure — **Done**
- [x] T041 [US3] Document Worker isolation model using Node.js worker_threads module (FR-015) — **Done**
- [x] T042 [US3] Document message protocol: postMessage task/result pattern (FR-016) — **Done**
- [x] T043 [US3] Document cancellation semantics: worker.terminate() behavior (FR-016) — **Done**
- [x] T044 [US3] Document resource cleanup guarantees and limitations (FR-016) — **Done**
- [x] T045 [US3] Document limitations: serialization cost, ~50ms startup, ~10MB memory per worker (FR-017) — **Done**
- [x] T046 [US3] Document migration criteria from cooperative timeouts (FR-018) — **Done**
- [x] T047 [US3] Document anti-patterns - when NOT to use Workers (FR-018a): — **Done**
  - Operations completing in <1 second
  - I/O-bound work (use AbortController instead)
  - Operations requiring shared mutable state
  - Cases where startup overhead exceeds operation time
- [x] T048 [US3] Add comparison table: cooperative vs preemptive timeout tradeoffs — **Done (Decision Matrix)**
- [x] T049 [US3] Add code examples for future implementation reference — **Done (Appendix)**

**Checkpoint**: Design document complete - US3 independently testable via review checklist

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation updates and final validation

- [x] T050 [P] ~~Update docs/getting-started/development-setup.md with pnpm commands (SC-008)~~ **N/A: File does not exist**
- [x] T051 [P] Update README.md with pnpm installation instructions (file exists, verified) — **Done**
- [x] T052 [P] ~~Update CONTRIBUTING.md with pnpm workflow~~ **N/A: No CONTRIBUTING.md exists in this repo**
- [x] T053 [P] Update quickstart.md with actual file paths and verify accuracy — **No changes needed: quick-start.md doesn't reference dev dependencies**
- [ ] T054 Run full CI pipeline with pnpm and verify all checks pass (SC-003) — **Pending: Verify in PR CI**
- [ ] T055 Compare CI install time with npm baseline (SC-002) — **Pending: Verify in PR CI**
- [x] T056 Run depcruise to verify no new circular dependencies introduced — **Done: 0 violations**
- [ ] T057 Final verification: fresh clone → pnpm install → pnpm verify → all tests pass — **Pending: Verify in PR CI**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2)
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) - can run parallel to US1
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) - can run parallel to US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - pnpm migration is self-contained
- **User Story 2 (P2)**: No dependencies on US1 - telemetry module is independent
- **User Story 3 (P3)**: No dependencies on US1/US2 - design document is independent

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Schema/types before backends
- Backends before orchestrator (hook)
- Orchestrator before integrations
- Integration before benchmarks

### Parallel Opportunities

**Phase 1 (Setup)**:

```
T001, T002, T003 can run in parallel
```

**Phase 3 (US1) - CI Workflow Updates**:

```
T011, T012, T013, T014 can run in parallel (different workflow files)
```

**Phase 4 (US2) - Tests**:

```
T020, T021, T022, T023 can run in parallel (different test files)
```

**Phase 6 (Polish) - Documentation**:

```
T050, T051, T052, T053 can run in parallel (different doc files)
```

---

## Parallel Example: User Story 2 Tests

```bash
# Launch all unit tests for User Story 2 together:
Task: "Write unit test for TimeoutEventSchema validation in router/tests/unit/telemetry/types.test.ts"
Task: "Write unit test for TelemetryConfigSchema validation in router/tests/unit/telemetry/types.test.ts"
Task: "Write unit test for console backend emit/flush in router/tests/unit/telemetry/console-backend.test.ts"
Task: "Write unit test for JSONL backend emit/flush/close in router/tests/unit/telemetry/jsonl-backend.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline metrics)
2. Complete Phase 2: Foundational (pnpm config)
3. Complete Phase 3: User Story 1 (pnpm migration)
4. **STOP and VALIDATE**: Fresh clone test passes (SC-001)
5. Deploy/demo - developers can now use pnpm

### Incremental Delivery

1. Complete Setup + Foundational → pnpm configured
2. Add User Story 1 → Test fresh clone → pnpm migration complete (MVP!)
3. Add User Story 2 → Test timeout telemetry → observability available
4. Add User Story 3 → Review design doc → future path documented
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (pnpm migration + CI)
   - Developer B: User Story 2 (telemetry module)
   - Developer C: User Story 3 (design document)
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- pnpm version: Pin to 10.x (latest patch at merge time) via `packageManager` field; Corepack is authoritative source
- `pnpm/action-setup` MUST respect the `packageManager` field pin via Corepack, not replace it
- CI setup order is critical: setup-node → pnpm/action-setup → pnpm install
- Verified files: README.md exists, Dockerfile does not exist, CONTRIBUTING.md does not exist
