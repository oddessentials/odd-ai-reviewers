# Tasks: Close All 12 Unsuppressed FP Benchmark Scenarios

**Input**: Design documents from `/specs/415-close-fp-benchmark-gaps/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — the spec defines explicit testing requirements (FR-024 through FR-029).

**Organization**: Tasks are grouped by user story. Dependency order: US2 (prompts) → US3 (matchers) → US1 (snapshots). US4 (CLI parity) can run in parallel with US3. US5 (thresholds) is independent.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US5)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Establish baseline and verify existing infrastructure

- [x] T001 Run full test suite to establish baseline — `pnpm test` must pass all 4,095+ tests
- [x] T002 Run benchmark suite in replay mode to capture current state — `pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fixture modifications and finding-validator enhancements shared by multiple user stories

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Update fp-c-005 fixture in `router/tests/fixtures/benchmark/regression-suite.json` — add `"prDescription": "feat: Add environment-dependent feature flag"` field per FR-017. Verify FIR-1: env-dependent branching logic in diff is unchanged.
- [x] T004 [P] Reclassify fp-d-006 fixture in `router/tests/fixtures/benchmark/regression-suite.json` — set `"truePositive": true`, set `"expectedFindings": [{ "file": "src/auth.ts", "severityAtLeast": "warning", "messageContains": "token" }]` per FR-017a. Verify FIR-1: raw token POST body diff unchanged. **Also update fixture count assertions** in `router/tests/integration/false-positive-benchmark.test.ts`: change `fpScenarios.length` from 56→55, `patternD.length` from 7→6 (B3 remediation).
- [x] T005 [P] Update fp-f-005 fixture diff in `router/tests/fixtures/benchmark/regression-suite.json` — wrap existing `renderError(error.message)` pattern in `catch (error) { ... }` block per FR-017b. Verify FIR-1: `error.message` in template literal is preserved. Verify FIR-2: catch block is realistic production code.
- [x] T006 [P] Verify fp-f-015 fixture compliance in `router/tests/fixtures/benchmark/regression-suite.json` — confirm existing diff has single exported function with sole body `return JSON.parse(input)`, no I/O modules, no async, no multiple statements per FR-017c. Document verification result — no modification expected.
- [x] T007 Add 4 new DISMISSIVE_PATTERNS to `router/src/report/finding-validator.ts` at line 80 — add `"working as intended"`, `"no issues found"`, `"non-critical"`, `"low priority"` per FR-016. Add JSDoc comment above the array explaining the three-gate dependency (info severity + pattern match + no actionable suggestion).
- [x] T008 Add unit tests for new DISMISSIVE_PATTERNS in `router/tests/unit/report/finding-validator.test.ts` — test each new pattern with: (1) info severity + pattern + no suggestion = suppressed, (2) warning severity + pattern = pass-through, (3) info severity + pattern + actionable suggestion = pass-through per FR-026.

**Checkpoint**: Fixtures fixed, finding-validator enhanced — user story implementation can now begin

---

## Phase 3: User Story 2 — Prompt Conventions Prevent LLM False Positives at Source (Priority: P1) 🎯 MVP

**Goal**: Add 8 prompt conventions to `_shared_conventions.md` that instruct LLMs to avoid generating false-positive findings for well-known safe patterns

**Independent Test**: Record fresh snapshots after updating conventions. Verify that LLM returns zero findings for each convention-addressed scenario.

### Implementation for User Story 2

- [x] T009 [P] [US2] Add Express error handler convention (Rule 13) to `config/prompts/_shared_conventions.md` per FR-001 — 4-param function + Express indicator suppresses unused param findings. Pass through: `err.stack` exposure in production.
- [x] T010 [P] [US2] Add Promise.allSettled convention (Rule 14) to `config/prompts/_shared_conventions.md` per FR-002 — `Promise.allSettled` visible suppresses order/try-catch findings. Pass through: code assuming all fulfilled without checking `.status`.
- [x] T011 [P] [US2] Add React Query/SWR/Apollo convention (Rule 15) to `config/prompts/_shared_conventions.md` per FR-003 — query library import + hook call within 10 lines + same hunk. Pass through: ignoring `error`/`isError` in user-facing render.
- [x] T012 [P] [US2] Add singleton pattern convention (Rule 16) to `config/prompts/_shared_conventions.md` per FR-004 — 3 observable regex conditions (module-scoped null init, guard check, single construction). Pass through: async without concurrency guard.
- [x] T013 [P] [US2] Add switch exhaustiveness convention (Rule 17) to `config/prompts/_shared_conventions.md` per FR-005 — union-typed switch covering all members. Pass through: untyped `string`/`number` without default.
- [x] T014 [P] [US2] Add error object XSS convention (Rule 18) to `config/prompts/_shared_conventions.md` per FR-006 — structural evidence only: `catch` clause or `: Error` type annotation within 10 lines. 4 non-structural signals listed as MUST NOT use. Pass through: `error.message` in `innerHTML` from user input.
- [x] T015 [P] [US2] Add thin wrapper convention (Rule 19) to `config/prompts/_shared_conventions.md` per FR-007 — single-statement return of allowlisted stdlib call (JSON.parse, parseInt, new URL, Buffer.from). Pass through: I/O wrappers, HTTP handler context.
- [x] T016 [P] [US2] Strengthen existence verification convention (Rule 7 update) in `config/prompts/_shared_conventions.md` per FR-008 — add CRITICAL prefix requiring cross-reference of every cited construct against actual diff content.
- [x] T017 [US2] Run `pnpm prompts:sync` to propagate conventions to all prompt files per FR-009. Verify with `pnpm prompts:check`. Verify `router/src/prompts/shared-conventions.generated.ts` is updated.

**Checkpoint**: All 8 conventions in place, synced to all prompt files. Ready for snapshot recording.

---

## Phase 4: User Story 3 — Deterministic Matchers Catch Residual FPs with Strict Evidence (Priority: P2)

**Goal**: Add T025 (Safe Local File Read) and T026 (Exhaustive Type-Narrowed Switch) matchers, widen T019

**Independent Test**: Unit tests with synthetic findings verify suppression with valid evidence and pass-through without evidence

### Tests for User Story 3

- [x] T018 [P] [US3] Add T025 unit tests in `router/tests/unit/report/framework-pattern-filter.test.ts` per FR-024 — 5 positive (one per allowed base: `__dirname`, `__filename`, `import.meta.dirname`, `import.meta.filename`, `import.meta.url`), 8 negative (variable, function call, property access, computed expression, template interpolation, `process.env`, `req.*`, alias), multi-line rejection, safety constraint test.
- [x] T019 [P] [US3] Add T026 unit tests in `router/tests/unit/report/framework-pattern-filter.test.ts` per FR-024 — positive (union type + switch + all cases), negative (no union type visible), negative (switch on `string`), negative (switch on `number`), safety constraint enforcement.
- [x] T020 [P] [US3] Add T019 widened pattern unit tests in `router/tests/unit/report/framework-pattern-filter.test.ts` per FR-025 and FR-014(c) — existing patterns still work + 3 new phrases ("declared but never referenced", "dead code: never called", "parameter not referenced") + 5 negative cases per phrase: (1) without 4 params, (2) without Express indicator, (3) non-handler context, (4) Koa framework, (5) alongside security finding.

### Implementation for User Story 3

- [x] T021 [P] [US3] Add matcher T025 (Safe Local File Read) to `FRAMEWORK_MATCHERS` array in `router/src/report/framework-pattern-filter.ts` per FR-011 — canonical regex, single-line only, closed allowlists for APIs/bases/segments, rejection list, safety constraint. **SECURITY (B1/B2)**: Evidence validator MUST reject string literal segments containing `..` (path traversal) or starting with `/` or drive letter (absolute path override). These are post-match rejection checks on the matched segments.
- [x] T022 [P] [US3] Add matcher T026 (Exhaustive Type-Narrowed Switch) to `FRAMEWORK_MATCHERS` array in `router/src/report/framework-pattern-filter.ts` per FR-012 — message pattern `/missing.*(?:case|default)|no.*default|add.*default|non-?exhaustive/i`, evidence: switch + union type annotation within 10 lines, safety constraint: reject `string`/`number` types.
- [x] T023 [US3] Widen T019 (Express Error Middleware) `messagePattern` in `router/src/report/framework-pattern-filter.ts` per FR-014 — add "declared but never referenced", "dead code: never called", "parameter not referenced". Verify evidence coupling invariant: same validator, 4-param + Express required, no bypass path.
- [x] T024 [US3] Update closed matcher table comment in `router/src/report/framework-pattern-filter.ts` lines 8-9 — change "Only these 5 matchers" to "Only these 7 matchers" per FR-013.
- [x] T025 [US3] Run all matcher unit tests — `pnpm --filter ./router exec vitest run tests/unit/report/framework-pattern-filter.test.ts` — verify all T018-T020 tests pass including existing tests.

**Checkpoint**: 7-matcher table in place with comprehensive unit tests. Post-processing pipeline correctly suppresses pattern-matched findings.

---

## Phase 5: User Story 4 — CLI Local Review Achieves FP Suppression Parity (Priority: P2)

**Goal**: CLI `local-review.ts` executes the same 4 post-processing stages as hosted mode

**Independent Test**: Synthetic findings processed through CLI path produce identical suppression to hosted path

### Tests for User Story 4

- [x] T026 [P] [US4] Add CLI pipeline integration tests in `router/tests/unit/report/local-review-pipeline.test.ts` per FR-027 — verify that sanitization, self-contradiction filtering (Stage 1), framework convention filtering, and Stage 2 diff-bound validation all execute before terminal output. Test with synthetic findings that would be suppressed by each stage.

### Implementation for User Story 4

- [x] T027 [US4] Extract shared post-processing pipeline function — create `processFindings(findings, diffContent, diffFiles, prDescription?)` that runs the 4 stages (sanitize → Stage 1 semantic → framework filter → Stage 2 diff-bound) in sequence. Place in `router/src/report/` or extend `router/src/phases/report.ts`. Ensure `report.ts` hosted mode AND benchmark `adapter.ts` BOTH use the same function (B7 remediation — fixes adapter's current wrong stage ordering and missing sanitization).
- [x] T028 [US4] Integrate 4-stage pipeline into `router/src/cli/commands/local-review.ts` per FR-018 — call `processFindings()` before `reportToTerminal()` at line ~1077. Pass diff content from local git diff. Skip PR intent filtering (no `prDescription` available — documented divergence FR-018e).
- [x] T029 [US4] Run CLI pipeline tests — `pnpm --filter ./router exec vitest run tests/unit/report/local-review-pipeline.test.ts` — verify all T026 tests pass.

**Checkpoint**: CLI local review applies same suppressions as hosted mode for the 4 shared stages. 5 documented divergences are accepted.

---

## Phase 6: User Story 1 — Benchmark Snapshot Coverage Reaches 100% (Priority: P1)

**Goal**: All 66 benchmark scenarios execute and pass — 36 FP with zero surviving findings, 19 TP with expected findings matched, runnable ratio = 100%

**Independent Test**: Run benchmark suite with no API keys — all scenarios replay from snapshots and pass

**Depends on**: US2 (prompts finalized) + US3 (matchers in place)

### Implementation for User Story 1

- [x] T030 [US1] Update `runWithSnapshot()` in `router/src/benchmark/adapter.ts` per FR-022 — implement two-part drift gate: fixture hash mismatch = hard failure with "diff content changed" message, prompt hash mismatch = hard failure with "re-record with pnpm benchmark:record" instruction. Replace the current generic drift throw (lines 396-403) with differentiated error handling. **Also update existing drift test assertions** in `router/tests/integration/false-positive-benchmark.test.ts` (lines 339-371) to match new differentiated error messages (B4 remediation). **Also fix pipeline stage ordering** in `runWithSnapshot()`: change to sanitize → semantic → framework → diff-bound to match post-processing contract (B7 remediation).
- [x] T031 [US1] Add per-scenario SC-001 gate test to `router/tests/integration/false-positive-benchmark.test.ts` — create `TARGETED_SCENARIO_IDS` set of 11 IDs, iterate and assert each individually produces 0 surviving findings. Failure message must list each failed scenario with surviving finding count.
- [x] T032 [US1] Update SC-004 aggregate test in `router/tests/integration/false-positive-benchmark.test.ts` — reword to "aggregate non-regression floor", add comment explaining relationship to SC-001 per-scenario gate. Keep threshold at >= 0.9.
- [x] T032a [US1] Fix modelId/provider auto-detection in `router/src/benchmark/adapter.ts` `buildSnapshotMetadata()` — ensure provider name and model ID are correctly auto-detected from the SDK response rather than defaulting to "unknown" per FR-021 (B5 remediation).
- [x] T032b [US1] Update TP test routing for fp-d-006 — the TP test section in `router/tests/integration/false-positive-benchmark.test.ts` must handle snapshot-based TP scenarios (Pattern D) via `runWithSnapshot()`, not just deterministic `runScenario()` (B6 remediation). fp-d-006 is Pattern D but now truePositive.
- [ ] T033 [US1] Record all snapshots — run `pnpm benchmark:record` with API key set. This records 11 new snapshots (fp-b-001, fp-b-003, fp-b-006, fp-b-007, fp-c-005, fp-c-006, fp-f-005, fp-f-007, fp-f-010, fp-f-014, fp-f-015) AND re-records all 25 existing snapshots (prompt hash changed due to new conventions).
- [ ] T034 [US1] Verify benchmark results — run `pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts` in replay mode (no API key). Verify: SC-001 per-scenario gate passes (all 11 targeted = 0 findings), SC-004 aggregate >= 90%, SC-002 TP recall = 100%, SC-003 TP precision >= 70%, runnable ratio = 100%.
- [ ] T035 [US1] Verify fp-d-006 TP match — confirm the benchmark produces a finding for fp-d-006 matching `{ file: "src/auth.ts", severityAtLeast: "warning", messageContains: "token" }` per SC-002/FR-017a.

**Checkpoint**: Benchmark reaches 100% runnable with all gates passing. Issue #168 scenarios are resolved.

---

## Phase 7: User Story 5 — Benchmark Smoke Test Uses Meaningful Thresholds (Priority: P3)

**Goal**: CI benchmark-check smoke test uses real thresholds instead of vacuous 0.01 values

**Independent Test**: Set mock scores below thresholds — CI benchmark-check step fails

### Implementation for User Story 5

- [x] T036 [P] [US5] Update mock results in `router/tests/fixtures/benchmark/mock-results/summary.json` — set mock precision, recall, and F1 to values reflecting improved scores (precision >= 0.50, recall >= 0.40, F1 >= 0.45) per FR-019.
- [x] T037 [P] [US5] Update benchmark-check thresholds in `.github/workflows/ci.yml` benchmark-regression job — change `--min-precision 0.01 --min-recall 0.01 --min-f1 0.01` to `--min-precision 0.40 --min-recall 0.30 --min-f1 0.35` per FR-019.
- [x] T038 [US5] Verify benchmark-check script passes — run `npx tsx scripts/benchmark-check.ts` with updated mock results and thresholds. Verify pass at new thresholds and fail below them.

**Checkpoint**: CI smoke test catches real quality regressions instead of vacuously passing.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Full verification across all user stories and CI quality gates

- [x] T039 Run full test suite — `pnpm test` — verify all 4,095+ existing tests pass plus new tests per FR-028
- [x] T040 Run coverage check — `pnpm --filter ./router exec vitest run --coverage` — verify CI thresholds maintained (statements 65%, branches 60%, functions 68%, lines 66%) per FR-029
- [x] T041 [P] Run lint check — `pnpm lint` — verify zero ESLint warnings per constitution Zero-Tolerance Lint Policy
- [x] T042 [P] Run typecheck — `pnpm typecheck` — verify no TypeScript errors
- [x] T043 [P] Run prompt sync check — `pnpm prompts:check` — verify conventions are synced
- [x] T044 [P] Run dependency cruiser — verify no new circular dependencies per constitution
- [x] T045 Verify SC-007 CLI parity — run framework-pattern-filter unit tests with synthetic findings routed through CLI vs hosted paths, confirm identical suppression sets
- [x] T046 Verify SC-008 security boundary — confirm all safety constraint and rejection-list unit tests pass, demonstrating genuine security findings are NOT suppressed
- [x] T047 Verify SC-010 non-regression — confirm no CI quality gate thresholds were weakened
- [x] T048 Run quickstart.md verification checklist — execute all items in `specs/415-close-fp-benchmark-gaps/quickstart.md` verification section

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US2 Prompts (Phase 3)**: Depends on Foundational — BLOCKS US1 (prompt hash changes affect snapshots)
- **US3 Matchers (Phase 4)**: Depends on Foundational — BLOCKS US1 (matchers affect post-processing)
- **US4 CLI Parity (Phase 5)**: Depends on Foundational — can run in PARALLEL with US3
- **US1 Benchmark (Phase 6)**: Depends on US2 + US3 completion (prompts + matchers must be finalized before recording)
- **US5 Thresholds (Phase 7)**: Depends on Foundational only — can run in PARALLEL with US2/US3/US4
- **Polish (Phase 8)**: Depends on ALL user stories being complete

### User Story Dependencies

```
Phase 1: Setup
    ↓
Phase 2: Foundational (fixture fixes, DISMISSIVE_PATTERNS)
    ↓
    ├── Phase 3: US2 Prompts ──────────────────┐
    │       ↓                                   │
    ├── Phase 4: US3 Matchers ─────────────────┤→ Phase 6: US1 Benchmark
    │                                           │
    ├── Phase 5: US4 CLI Parity (parallel) ─────┘
    │
    └── Phase 7: US5 Thresholds (parallel) ────→ Phase 8: Polish
```

### Within Each User Story

- Tests FIRST, verify they FAIL before implementation (for US3, US4)
- Core logic before integration
- Unit tests before integration tests
- Story complete and verified before moving to next priority

### Parallel Opportunities

**Within Phase 2**: T003, T004, T005, T006 can all run in parallel (different fixtures, no file conflicts)
**Within Phase 3**: T009–T016 can all run in parallel (each adds a separate rule to `_shared_conventions.md` — but since they all edit the same file, serialize T009–T016 then run T017 sync)
**Within Phase 4**: T018, T019, T020 test tasks can all run in parallel (different test describe blocks)
**Within Phase 4**: T021, T022 matcher implementations can run in parallel (different array entries, same file)
**Between Phases**: US3 (Phase 4) and US4 (Phase 5) can run in parallel. US5 (Phase 7) can run in parallel with US2/US3.
**Within Phase 8**: T041, T042, T043, T044 can all run in parallel

---

## Parallel Example: User Story 3 (Matchers)

```bash
# Launch all matcher tests in parallel (different describe blocks):
Task T018: "T025 unit tests in framework-pattern-filter.test.ts"
Task T019: "T026 unit tests in framework-pattern-filter.test.ts"
Task T020: "T019 widened pattern unit tests in framework-pattern-filter.test.ts"

# Launch matcher implementations in parallel (different array entries):
Task T021: "Add T025 matcher to framework-pattern-filter.ts"
Task T022: "Add T026 matcher to framework-pattern-filter.ts"

# Then sequentially:
Task T023: "Widen T019 messagePattern" (same matcher, after T021/T022)
Task T024: "Update closed matcher table comment"
Task T025: "Run all matcher tests"
```

---

## Implementation Strategy

### MVP First (US2 Prompts + US3 Matchers + US1 Benchmark)

1. Complete Phase 1: Setup (baseline verification)
2. Complete Phase 2: Foundational (fixture fixes + DISMISSIVE_PATTERNS)
3. Complete Phase 3: US2 Prompts (8 conventions + sync)
4. Complete Phase 4: US3 Matchers (T025 + T026 + T019 widened)
5. Complete Phase 6: US1 Benchmark (record snapshots + verify gates)
6. **STOP and VALIDATE**: All 12 scenarios from Issue #168 are resolved
7. Then add US4 (CLI parity) and US5 (thresholds)

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US2 → Conventions prevent LLM FPs → Verify with recording
3. Add US3 → Matchers suppress residual FPs → Verify with unit tests
4. Add US1 → Record + verify all scenarios → **Issue #168 closable**
5. Add US4 → CLI parity achieved → Verify equivalence
6. Add US5 → Smoke thresholds meaningful → Verify CI catches regressions
7. Polish → Full CI pass → PR ready

### Single Developer Strategy

Execute phases sequentially in dependency order: 1 → 2 → 3 → 4 → 6 → 5 → 7 → 8

---

## Notes

- [P] tasks = different files or independent test blocks, no dependencies
- [Story] label maps task to specific user story for traceability
- Phase 3 (US2) tasks edit the same file (`_shared_conventions.md`) — serialize within phase, then sync once
- Phase 4 (US3) matcher implementations can be parallelized (different array entries)
- Phase 6 (US1) snapshot recording requires API key — all preceding code changes must be committed first
- **CRITICAL (B8)**: Phases 3-6 MUST be pushed as a single atomic commit set. Intermediate pushes between prompt changes (Phase 3) and snapshot re-recording (Phase 6) will break CI because the prompt hash changes invalidate all existing snapshots.
- Commit after each phase completion for clean git history (but do NOT push until Phase 6 is complete)
- Total: 48 tasks across 8 phases
