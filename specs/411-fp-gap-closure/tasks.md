# Tasks: False Positive Gap Closure

**Input**: Design documents from `/specs/411-fp-gap-closure/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `router/src/`, `router/tests/` within repository root
- Prompts: `config/prompts/`
- CI: `.github/workflows/`

---

## Phase 1: Setup

**Purpose**: Verify clean baseline and establish test scaffolding

- [ ] T001 Run full test suite to establish baseline (3887+ tests) and record pass count via `pnpm --filter ./router test`
- [ ] T002 [P] Run benchmark integration tests to record current fixture pass/skip counts via `pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts`
- [ ] T003 [P] Run typecheck to confirm clean compilation via `pnpm --filter ./router typecheck`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared binding extraction utility needed by US1 (taint tracking) and US1/FR-009 (mutation tracking)

**⚠️ CRITICAL**: US1 implementation depends on this utility being complete

- [ ] T004 Implement `extractBindingsFromAssignmentTarget()` in `router/src/agents/control_flow/scope-stack.ts` — extract binding names from Expression-based destructuring targets (ArrayLiteralExpression, ObjectLiteralExpression on BinaryExpression LHS). Handle: simple identifiers, renamed properties (`{a: b}` → `b`), rest elements (`...rest`), nested patterns (recursion depth limit 10), array holes. Return `DestructuringBinding[]` per contracts/destructuring-taint.ts. See existing `extractBindingNames()` at lines 89-108 for BindingPattern reference.
- [ ] T005 Add unit tests for `extractBindingsFromAssignmentTarget()` in `router/tests/unit/agents/control_flow/scope-stack.test.ts` — test cases: simple array `[a, b]`, simple object `{a, b}`, renamed `{x: y}`, rest `[a, ...rest]`, nested `{a: {b}}`, computed keys `{[expr]: val}` (conservative), array holes `[a, , b]`, depth limit enforcement, empty patterns.

**Checkpoint**: Foundation ready — user story implementation can now begin in parallel

---

## Phase 3: User Story 1 — Destructuring Assignment Vulnerabilities Are Detected (Priority: P1) 🎯 MVP

**Goal**: Fix the taint tracking bypass where destructuring assignments lose taint propagation. All 6 destructuring patterns (object, array, renamed, rest, nested, scope-isolated) must be detected.

**Independent Test**: Run `pnpm --filter ./router vitest run tests/unit/agents/control_flow/ -t "destructuring"` — all new destructuring taint tests pass. Run benchmark Pattern A destructuring fixtures — all pass.

### Implementation for User Story 1

- [ ] T006 [US1] Extend `trackTaint()` BinaryExpression handler in `router/src/agents/control_flow/vulnerability-detector.ts` (around line 685-709) — add branch for `ts.isArrayLiteralExpression(node.left)` and `ts.isObjectLiteralExpression(node.left)`. Call `extractBindingsFromAssignmentTarget()` to get bindings, then apply Binding-Level Taint Semantics: (1) if RHS is ArrayLiteralExpression/ObjectLiteralExpression, evaluate per-element taint by checking each RHS element against tainted set; (2) if RHS is any other expression, conservatively mark ALL extracted bindings as tainted; (3) if RHS resolves to safe constant, mark bindings as safe. Register each tainted binding in scope via `scope.addDeclaration()`.
- [ ] T007 [US1] Extend `trackTaint()` VariableDeclaration handler in `router/src/agents/control_flow/vulnerability-detector.ts` — ensure existing destructuring in `const { a } = tainted` paths use the same Binding-Level Taint Semantics as T006. The existing `registerNodeDeclarations()` handles scope registration, but taint propagation for individual bindings needs per-element evaluation when the initializer is a literal.
- [ ] T008 [US1] Extend `findTaintInExpression()` in `router/src/agents/control_flow/vulnerability-detector.ts` (lines 769-799) — ensure destructured binding names registered by T006/T007 are resolvable when checking sink expressions. Verify that `scope.resolveDeclaration()` correctly finds destructured bindings registered via `addDeclaration()`.
- [ ] T009 [US1] Extend `collectMutatedBindings()` in `router/src/agents/control_flow/safe-source-detector.ts` (lines 413-455) — add handling for BinaryExpression where LHS is ArrayLiteralExpression or ObjectLiteralExpression. Call `extractBindingsFromAssignmentTarget()` and add all extracted binding names to the mutated set. This ensures safe-source status is revoked when a previously-safe variable is reassigned via destructuring (FR-009).
- [ ] T010 [US1] Add unit tests for destructuring taint propagation in `router/tests/unit/agents/control_flow/vulnerability-detector.test.ts` (or appropriate test file) — test cases mapping to US1 acceptance scenarios: (1) `const {userId} = req.body; db.query(userId)` → injection finding, (2) `[a,b] = [req.body.x, "safe"]; db.query(a)` → finding for a only, (3) `const {data: renamed} = req.body; innerHTML = renamed` → XSS finding, (4) `const [first, ...rest] = req.body.items; exec(rest[0])` → injection finding, (5) `const {a: {b}} = req.body; fs.readFile(b)` → path traversal finding, (6) `const {data} = {data: "hardcoded"}; db.query(data)` → NO finding (per-binding literal semantics), (7) scope isolation: inner tainted vs outer safe → only inner produces finding.
- [ ] T011 [US1] Add unit tests for destructuring mutation tracking in `router/tests/unit/agents/control_flow/safe-source-detector.test.ts` — test cases: (1) `const SAFE = ["a"]; [SAFE] = userInput` → SAFE marked as mutated (safe status revoked), (2) `const SAFE = {x: 1}; ({x: SAFE.x} = tainted)` → mutation detected, (3) nested destructuring mutation detection.
- [ ] T012 [US1] Run full test suite via `pnpm --filter ./router test` — verify zero regressions (SC-008).

**Checkpoint**: Destructuring taint tracking works for all 6 patterns. MVP is functional and independently testable.

---

## Phase 4: User Story 4 — Self-Contradiction Filter Unicode Hardening (Priority: P2)

**Goal**: Close the Unicode zero-width space bypass in the self-contradiction filter. Zero-width characters no longer break word boundaries in DISMISSIVE_PATTERNS regex matching.

**Independent Test**: Run `pnpm --filter ./router vitest run tests/unit/report/finding-validator.test.ts -t "unicode"` — all Unicode bypass tests pass.

### Implementation for User Story 4

- [ ] T013 [P] [US4] Add `normalizeUnicode()` helper function in `router/src/report/finding-validator.ts` — strip characters matching `/[\u200B-\u200F\u2028\u2029\uFEFF]/g` from input text. Export for testing. Place near DISMISSIVE_PATTERNS (line ~62).
- [ ] T014 [US4] Apply `normalizeUnicode()` in `validateFindingsSemantics()` Stage 1 self-contradiction check (lines 148-170 in `router/src/report/finding-validator.ts`) — normalize `finding.message` and `finding.suggestion` before matching against DISMISSIVE_PATTERNS. Same for Stage 2 in `validateNormalizedFindings()` (lines 261-281).
- [ ] T015 [P] [US4] Add unit tests for Unicode normalization in `router/tests/unit/report/finding-validator.test.ts` — test cases: (1) "No\u200Baction\u200Brequired" at info severity with no suggestion → filtered, (2) U+2028 line separator between words → filtered, (3) U+FEFF BOM in message → filtered, (4) standard "no action required" → filtered (regression), (5) warning severity with Unicode-obfuscated text → NOT filtered (severity guard), (6) visible non-Latin Unicode characters preserved (not stripped).

**Checkpoint**: Unicode bypass closed. Self-contradiction filter hardened.

---

## Phase 5: User Story 5 — Template Literal Taint Mixing Is Detected (Priority: P2)

**Goal**: Detect taint flow through template literal expressions when safe constants are mixed with tainted user input in interpolations.

**Independent Test**: Run `pnpm --filter ./router vitest run tests/unit/agents/control_flow/ -t "template"` — template literal taint tests pass.

### Implementation for User Story 5

- [ ] T016 [P] [US5] Add explicit `ts.isTemplateExpression` handler in `findTaintInExpression()` in `router/src/agents/control_flow/vulnerability-detector.ts` (lines 769-799) — iterate over `node.templateSpans`, check each `span.expression` for taint via recursive call. If ANY span expression is tainted, return the tainted identifier. Also handle `ts.isNoSubstitutionTemplateLiteral` (no interpolations → safe, no action needed).
- [ ] T017 [P] [US5] Add unit tests for template literal taint mixing in `router/tests/unit/agents/control_flow/vulnerability-detector.test.ts` (or appropriate test file) — test cases: (1) ``new RegExp(`${SAFE}${req.body.input}`)`` → injection finding (mixed), (2) ``new RegExp(`${SAFE}`)`` with safe module-scope const → NO finding, (3) `` `${req.body.a}-${req.body.b}` `` in eval() → injection finding (all tainted), (4) `` `plain text` `` → NO finding (no interpolation).

**Checkpoint**: Template literal taint mixing detected. Safe-only templates remain safe.

---

## Phase 6: User Story 2 — Framework Convention False Positives Suppressed Deterministically (Priority: P2)

**Goal**: Implement the FR-013 closed matcher table (Express Error MW, TypeScript \_prefix, Exhaustive Switch) as a deterministic post-processing filter that catches Pattern B false positives.

**Independent Test**: Run `pnpm --filter ./router vitest run tests/unit/report/framework-pattern-filter.test.ts` — all 15 matcher scenarios (10 FP + 5 TP) pass with 0 incorrect suppressions.

### Implementation for User Story 2

- [ ] T018 [P] [US2] Create `router/src/report/framework-pattern-filter.ts` — implement `filterFrameworkConventionFindings(findings, diffContent)` with the 3 closed matchers per contracts/framework-pattern-filter.ts. Each matcher has: `id`, `name`, `messagePattern` (RegExp), `evidenceValidator(finding, diffContent)` (returns boolean), `suppressionReason`. Default-deny: only exact matches with validated evidence suppress. Log suppressed findings at diagnostic level with `[router] [framework-filter]` prefix.
- [ ] T019 [US2] Implement Express Error Middleware matcher in `router/src/report/framework-pattern-filter.ts` — messagePattern: `/unused.*param|remove.*(\_next|\_err|\_req|\_res)/i`; evidenceValidator: scan diffContent for `.use(` call in same file as finding + function with exactly 4 parameters at finding.line (heuristic: check diff lines near finding.line for 4-param function signature). suppressionReason: "Express 4-param error middleware — unused params required by framework".
- [ ] T020 [P] [US2] Implement TypeScript Unused Prefix matcher in `router/src/report/framework-pattern-filter.ts` — messagePattern: `/unused.*(variable|parameter|binding|import)/i`; evidenceValidator: extract identifier from finding.message, check if it matches `/^_\w+$/`. suppressionReason: "TypeScript \_prefix convention for intentionally unused bindings".
- [ ] T021 [P] [US2] Implement Exhaustive Switch matcher in `router/src/report/framework-pattern-filter.ts` — messagePattern: `/missing.*case|unhandled.*case|default.*unreachable/i`; evidenceValidator: scan diffContent near finding.line for `assertNever(` or `throw.*exhaustive` pattern in default case. suppressionReason: "Exhaustive switch with assertNever/throw — all cases handled at compile time".
- [ ] T022 [US2] Integrate framework pattern filter into report pipeline in `router/src/phases/report.ts` — insert call to `filterFrameworkConventionFindings()` after `validateFindingsSemantics()` (line ~82) and before `sortFindings()`. Pass `_diffFiles` parameter (rename to `diffFiles`) to extract diff content. Update `ProcessedFindings` type if needed to include framework filter stats.
- [ ] T023 [P] [US2] Create unit tests in `router/tests/unit/report/framework-pattern-filter.test.ts` — test the SC-004 benchmark set: 10 Pattern B FP scenarios (Express 4-param, \_prefix params, assertNever switches, union-type defaults) that should be suppressed + 5 TP scenarios (genuine unused params without \_prefix, 3-param non-middleware functions, switch without assertNever) that must NOT be suppressed. Assert: ≥8/10 FP suppressed, 5/5 TP preserved, 0 incorrect suppressions.
- [ ] T024 [US2] Update FR-010 framework convention guidance in `config/prompts/semantic_review.md` — expand existing "Framework & Language Conventions" section (lines 59-76) to add IDENTIFICATION criteria (not just suppression rules). For each convention: describe what to look for, how to recognize it, and why flagging it is wrong. Same changes to `config/prompts/opencode_system.md` and `config/prompts/pr_agent_review.md`.

**Checkpoint**: Deterministic framework filter active. 3 matchers operational with default-deny semantics.

---

## Phase 7: User Story 3 — Project Rules and PR Description Active Directives (Priority: P2)

**Goal**: Add explicit "Active Context Directives" to all 3 prompt files instructing LLMs to CHECK project rules and PR description BEFORE generating findings. Add diagnostic logging for PR description contradiction detection (FR-014).

**Independent Test**: Verify prompt files contain the directive sections. Run fallback-sync test to confirm hardcoded fallbacks include directive summary.

### Implementation for User Story 3

- [ ] T025 [P] [US3] Add "Active Context Directives" section to `config/prompts/semantic_review.md` — place after "Framework & Language Conventions" and before "Output Format". Include FR-011 project rules directive ("CHECK Project Rules before evaluating code organization, constant placement, architecture") and FR-012 PR description directive ("CHECK PR Description to understand author intent, re-evaluate findings that flag stated PR purpose"). Per research.md R-007.
- [ ] T026 [P] [US3] Add identical "Active Context Directives" section to `config/prompts/opencode_system.md` and `config/prompts/pr_agent_review.md` — same content as T025.
- [ ] T027 [US3] Update hardcoded fallback prompts in `router/src/agents/opencode.ts`, `router/src/agents/ai_semantic_review.ts`, and `router/src/agents/pr_agent.ts` — add summary of Active Context Directives to each fallback string. Ensure fallback-sync test can verify presence.
- [ ] T028 [P] [US3] Implement FR-014 diagnostic PR intent logging in `router/src/report/finding-validator.ts` — add `logPRIntentContradictions(findings, prDescription)` function that extracts action signals from PR title/description (regex: `/\b(add|fix|remove|rename|update|refactor)\s+(.+)/i`) and logs warnings when finding messages appear to contradict these signals. Called in `validateFindingsSemantics()` for observability only — no suppression. Log prefix: `[router] [finding-validator] [pr-intent]`.
- [ ] T029 [US3] Extend `validateFindingsSemantics()` in `router/src/report/finding-validator.ts` and `processFindings()` in `router/src/phases/report.ts` — pass `prDescription` (from AgentContext or as parameter) to enable T028 logging. Ensure graceful handling when prDescription is undefined.

**Checkpoint**: Prompt directives in place. PR intent contradiction logging active (diagnostic only).

---

## Phase 8: User Story 6 — Benchmark CI Release Gate with Expanded Coverage (Priority: P3)

**Goal**: Enforce benchmark as CI release gate (FR-017), expand fixture set with destructuring/SSRF/path-traversal scenarios (FR-018/FR-019), and implement recorded-response snapshot mode (FR-020/FR-021).

**Independent Test**: Run `pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts` — all deterministic fixtures pass, expanded fixtures included, release gate metrics (SC-001 through SC-007) evaluated.

### Implementation for User Story 6

- [ ] T030 [US6] Add 6 destructuring taint benchmark scenarios to `router/tests/fixtures/benchmark/regression-suite.json` — Pattern A extensions: (1) object destructuring `const {data} = req.body; db.query(data)`, (2) array destructuring `[a,b] = [req.body.x, "safe"]; db.query(a)`, (3) renamed property `const {data: renamed} = req.body; innerHTML = renamed`, (4) rest element `const [first, ...rest] = req.body.items; exec(rest[0])`, (5) nested `const {a: {b}} = req.body; fs.readFile(b)`, (6) scope isolation (inner tainted, outer safe). These validate detection of real vulnerabilities: set `truePositive: true`, `pattern: "A"`, and provide `expectedFindings` with file, severity, and ruleId for each scenario.
- [ ] T031 [P] [US6] Add 2 SSRF true-positive fixtures to `router/tests/fixtures/benchmark/regression-suite.json` — (1) `fetch(req.query.url)` with direct user input → expected SSRF finding, (2) `axios.get(req.body.endpoint)` → expected SSRF finding. Set `truePositive: true` with `expectedFindings` specifying file, severity, and ruleId.
- [ ] T032 [P] [US6] Add 1 path-traversal true-positive fixture to `router/tests/fixtures/benchmark/regression-suite.json` — `fs.readFile(req.params.filepath)` with direct user input → expected path_traversal finding.
- [ ] T033 [US6] Implement recorded-response snapshot adapter in `router/src/benchmark/adapter.ts` — add `SnapshotAdapter` class (or mode) per contracts/benchmark-snapshot.ts. Functions: `loadSnapshot(scenarioId, snapshotDir)`, `validateSnapshotMetadata(snapshot, currentPromptHash, currentFixtureHash)`, `runWithSnapshot(scenarioId, ...)`. On metadata mismatch, throw descriptive error. Add `--record` flag support to capture live responses.
- [ ] T034 [US6] Create `router/tests/fixtures/benchmark/snapshots/` directory structure and record initial snapshots for at least 10 Pattern B/C/D/F fixtures by running benchmark adapter in `--record` mode locally.
- [ ] T035 [US6] Update `router/tests/integration/false-positive-benchmark.test.ts` — unskip Pattern B/C/D/F fixtures that have recorded snapshots. Add snapshot replay mode: detect snapshot files, validate metadata, use recorded findings for scoring. Update `getUnsupportedScenarioReason()` in adapter.ts to return null for scenarios with valid snapshots.
- [ ] T036 [US6] Add `benchmark-regression` job to `.github/workflows/ci.yml` — new job that runs after `quality` job. Steps: checkout, pnpm install, `pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts`. Set `timeout-minutes: 15`. Add as required status check in documentation (branch protection must be configured manually by admin).
- [ ] T037 [US6] Verify SC-007 enforcement — confirm the benchmark-regression CI job fails when a code change would drop SC-001 suppression rate below 85% or SC-002 TP recall below 100%. Test by temporarily breaking safe-source detection and verifying benchmark fails.

**Checkpoint**: Benchmark runs as CI gate. 62+ scenarios with expanded coverage. Recorded snapshots enable deterministic CI for LLM-dependent fixtures.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, fallback sync, and cleanup

- [ ] T038 Run full test suite via `pnpm --filter ./router test` — verify SC-008 (zero regressions across all 3887+ tests)
- [ ] T039 [P] Run typecheck via `pnpm --filter ./router typecheck` — verify no type errors introduced
- [ ] T040 [P] Run lint via `pnpm --filter ./router lint` — verify zero lint warnings (zero-tolerance policy per constitution)
- [ ] T041 Extend fallback-sync test in `router/tests/unit/agents/` (existing `fallback-sync.test.ts`) — verify hardcoded fallback prompts in opencode.ts, ai_semantic_review.ts, pr_agent.ts include summaries of: Framework Conventions (existing), Active Context Directives (new from US3)
- [ ] T042 Run full benchmark suite and verify all success criteria: SC-001 (≥85% FP suppression on deterministic patterns), SC-002 (100% TP recall), SC-003 (≥18/27 previously skipped fixtures now pass), SC-004 (≥8/10 framework FP suppressed, 5/5 TP preserved), SC-005 (Unicode bypass closed), SC-006 (template literal taint detected), SC-007 (CI gate enforced), SC-009 (62+ total fixtures), SC-010 (≥10 snapshot-backed fixtures)
- [ ] T043 Run quickstart.md validation — execute all verification commands from `specs/411-fp-gap-closure/quickstart.md` and confirm they pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS US1
- **US1 (Phase 3)**: Depends on Foundational (Phase 2) — extractBindingsFromAssignmentTarget()
- **US4 (Phase 4)**: Can start after Setup (Phase 1) — independent of Foundational
- **US5 (Phase 5)**: Can start after Setup (Phase 1) — independent of Foundational
- **US2 (Phase 6)**: Can start after Setup (Phase 1) — independent of Foundational
- **US3 (Phase 7)**: Can start after Setup (Phase 1) — independent of Foundational
- **US6 (Phase 8)**: Depends on US1 (destructuring fixtures), US2 (framework filter), US4 (Unicode), US5 (template literals)
- **Polish (Phase 9)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Depends on Phase 2 foundational only — No dependencies on other user stories
- **US2 (P2)**: Independent — new file `framework-pattern-filter.ts`, separate from taint tracking
- **US3 (P2)**: Independent — prompt file modifications only, no code dependencies
- **US4 (P2)**: Independent — `finding-validator.ts` changes isolated to Unicode normalization
- **US5 (P2)**: Independent — `vulnerability-detector.ts` changes isolated to template literal handler
- **US6 (P3)**: Depends on US1 + US2 + US4 + US5 for fixture content and feature validation

### Within Each User Story

- Unit tests can be written alongside or after implementation
- Core logic before integration/pipeline wiring
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: T001, T002, T003 all run in parallel
- **Phase 2**: T004 → T005 sequential (impl → test)
- **After Phase 2**: US1, US2, US3, US4, US5 can ALL start in parallel (different files, no conflicts)
  - US4 (T013-T015): finding-validator.ts only
  - US5 (T016-T017): vulnerability-detector.ts findTaintInExpression() only
  - US2 (T018-T024): new framework-pattern-filter.ts + report.ts + prompt files
  - US3 (T025-T029): prompt files + finding-validator.ts (FR-014 logging)
  - **Conflict**: US3/T028 and US4/T014 both modify finding-validator.ts — stagger or coordinate
- **Phase 8**: T030, T031, T032 can run in parallel (different fixture entries)
- **Phase 9**: T038, T039, T040 can run in parallel (different tools)

---

## Parallel Example: After Phase 2

```bash
# Launch all independent user stories in parallel:
# Developer A: US1 — Destructuring Taint (vulnerability-detector.ts, scope-stack.ts, safe-source-detector.ts)
# Developer B: US2 — Framework Filter (new framework-pattern-filter.ts, report.ts)
# Developer C: US4 + US5 — Unicode + Template (finding-validator.ts, vulnerability-detector.ts findTaintInExpression)
# Developer D: US3 — Prompt Directives (prompt .md files, agent .ts fallbacks)

# Then merge all → Developer A: US6 — Benchmark CI (fixtures, adapter, ci.yml)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (verify baseline)
2. Complete Phase 2: Foundational (extractBindingsFromAssignmentTarget)
3. Complete Phase 3: US1 — Destructuring Taint Tracking
4. **STOP and VALIDATE**: Run destructuring unit tests + benchmark Pattern A fixtures
5. All 6 destructuring patterns detected → MVP complete (SC-001, SC-002)

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (destructuring taint) → Test independently → **Security gap closed** (MVP!)
3. Add US4 (Unicode hardening) → Test independently → Defense-in-depth improved
4. Add US5 (template literal taint) → Test independently → Second taint gap closed
5. Add US2 (framework filter) → Test independently → Pattern B FPs suppressed deterministically
6. Add US3 (prompt directives) → Test independently → Patterns C/D FPs reduced via prompts
7. Add US6 (benchmark CI) → Validate all SCs → CI release gate enforced
8. Polish → Full regression verification → Release ready

### Parallel Team Strategy

With 4 developers:

1. Team completes Setup + Foundational together (~1 hour)
2. Once Foundational is done:
   - Developer A: US1 (destructuring taint — MVP, highest priority)
   - Developer B: US2 (framework filter — new file, no conflicts)
   - Developer C: US4 + US5 (Unicode + template literals — small, related)
   - Developer D: US3 (prompt directives — independent files)
3. All merge → Developer A: US6 (benchmark CI — needs all features for fixtures)
4. Full team: Phase 9 (polish, SC verification)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- US4 and US3 both modify finding-validator.ts — coordinate if parallel
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- FR-008 is a non-goal — do not implement object literal safe-source detection
- FR-013 matcher table is closed — only 3 matchers (Express, \_prefix, assertNever)
- Conservative principle: when in doubt, treat as tainted
