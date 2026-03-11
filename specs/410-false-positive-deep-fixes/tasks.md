# Tasks: False Positive Deep Fixes & Benchmark Integration

**Input**: Design documents from `/specs/410-false-positive-deep-fixes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: All changes within `router/` monolith
- Prompts in `config/prompts/`
- Tests in `router/tests/`

---

## Phase 1: Setup

**Purpose**: Verify existing build and test baseline before making changes

- [ ] T001 Verify feature branch builds clean (`pnpm build`) and all existing tests pass (`pnpm test`) on `410-false-positive-deep-fixes` branch in `router/`

---

## Phase 2: User Story 1 — Safe Source Recognition (Priority: P1) :dart: MVP

**Goal**: Teach the control-flow vulnerability detector to recognize hardcoded constants, `__dirname`, safe directory listings, and constant array element access as non-tainted, preventing 28% of documented false positives (Pattern A).

**Independent Test**: Run the review system against a file containing `new RegExp(HARDCODED_ARRAY[i])` and `path.join(__dirname, 'fixtures', f)`. Zero security findings should be produced. Then run against `el.innerHTML = req.query.content` and verify a finding IS produced.

### Implementation for User Story 1

- [ ] T002 [P] [US1] Create SafeSourcePattern, SafeSourceMatchCriteria, SafeSourceInstance types and 9-entry declarative pattern registry (constant-literal-string, constant-literal-number, constant-literal-array, builtin-dirname, builtin-filename, builtin-import-meta-dirname, builtin-import-meta-url, safe-readdir, constant-element-access) in `router/src/agents/control_flow/safe-source-patterns.ts`
- [ ] T003 [P] [US1] Create test fixtures with positive matches for all 4 safe-source patterns AND negative cases for all 8 intentional exclusions (env vars, type assertions, imports, comments, objects, template interpolation, function returns, aliases) in `router/tests/unit/agents/control_flow/fixtures/safe-source-inputs.ts`
- [ ] T004 [US1] Implement `detectSafeSources()` for Pattern 1 (module-scope `const` with string/number/boolean/array-of-literal initializers, with LHS assignment mutation check) and Pattern 2 (built-in directory references: `__dirname`, `__filename`, `import.meta.dirname`, `import.meta.url`) in `router/src/agents/control_flow/safe-source-detector.ts`
- [ ] T005 [US1] Implement Pattern 3 (safe directory listing returns — `fs.readdirSync`/`fs.promises.readdir` with strict argument validation: string literal, built-in ref, or `path.join`/`path.resolve` with all-safe args; reject `||`, `??`, ternary) and Pattern 4 (constant array element access — `CONST_ARRAY[i]` where array qualifies under Pattern 1, no alias) in `router/src/agents/control_flow/safe-source-detector.ts`
- [ ] T006 [US1] Integrate safe-source filter into `VulnerabilityDetector.analyze()` — after `findSources()` returns `DetectedSource[]`, call `detectSafeSources()` then `filterSafeSources()` to remove safe entries before `trackTaint()` consumes them; log each suppression with pattern ID at diagnostic level in `router/src/agents/control_flow/vulnerability-detector.ts`
- [ ] T007 [US1] Write unit tests covering all 4 patterns (positive matches), all 8 intentional exclusions (must remain tainted), mutation detection (alias assignment revokes safe status), and performance constraint (< 50ms per file) in `router/tests/unit/agents/control_flow/safe-source-detector.test.ts`

**Checkpoint**: Safe-source recognition working. `new RegExp(HARDCODED[i])` produces no finding; `el.innerHTML = req.query.x` still produces XSS finding.

---

## Phase 3: User Story 2 — Enriched Context Prevents Rule-Contradicting Findings (Priority: P2)

**Goal**: Extend AgentContext with PR description and project rules, load and sanitize them, inject into agent user prompts, and implement token budget truncation. Addresses Patterns C and D (21% of false positives).

**Independent Test**: Configure a review against a repo with CLAUDE.md mandating "Plain CSS in a single file." Submit a large CSS file. Verify no "split this CSS file" finding appears.

### Implementation for User Story 2

- [ ] T008 [P] [US2] Add `prDescription?: string`, `projectRules?: string`, and `reviewIgnorePatterns?: string[]` optional fields to the AgentContext interface in `router/src/agents/types.ts`
- [ ] T009 [P] [US2] Add `title?: string` and `body?: string` optional fields to PullRequestContext interface in `router/src/trust.ts`
- [ ] T010 [US2] Create `context-loader.ts` with `loadProjectRules(repoPath): Promise<string | undefined>` (reads CLAUDE.md, graceful if missing) and `loadPRDescription(prNumber, env): Promise<string | undefined>` (reads from GitHub payload or Octokit API), both with mandatory sanitization: strip null bytes, limit prDescription to 2000 chars, escape control characters in `router/src/context-loader.ts`
- [ ] T011 [US2] Implement FR-010 token budget truncation in context-loader.ts — `truncateContext(projectRules, prDescription, diffContent, maxTokens)` that truncates projectRules first, then prDescription, preserving diff intact; append `[truncated]` indicator to any truncated field; use 1 token ≈ 4 chars estimation in `router/src/context-loader.ts`
- [ ] T012 [US2] Integrate context loading into context assembly — call `loadProjectRules()` and `loadPRDescription()` after preflight validation passes (~line 873), populate AgentContext.prDescription, AgentContext.projectRules, and AgentContext.reviewIgnorePatterns (from existing reviewignore.ts patterns) in `router/src/main.ts`
- [ ] T013 [US2] Inject "PR Description" and "Project Rules" sections into user prompt templates before "Diff Content" section in `router/src/agents/opencode.ts` (buildReviewPrompt), `router/src/agents/ai_semantic_review.ts`, and `router/src/agents/pr_agent.ts`; verify injected context appears in assembled prompt (FR-009 observable output)
- [ ] T014 [US2] Write unit tests for context-loader covering: sanitization (null bytes stripped, control chars escaped, 2000 char limit), truncation order (projectRules first), graceful degradation (missing CLAUDE.md → undefined, missing PR → undefined), prompt injection resistance (malicious PR description), and performance overhead measurement (SC-006: context loading adds < 5% to baseline review time) in `router/tests/unit/context-loader.test.ts`

**Checkpoint**: Context enrichment working. PR description and project rules appear in agent prompts. Missing files handled gracefully.

---

## Phase 4: User Story 3 — Post-Processing Filters Self-Contradicting Findings (Priority: P2)

**Goal**: Create centralized finding validation that classifies findings (inline/file-level/global/cross-file), validates line numbers for inline findings, and filters structurally self-contradicting findings (info severity + dismissive language + no actionable suggestion). Addresses Pattern E (9% of false positives).

**Independent Test**: Submit findings with invalid line numbers and self-dismissing messages. Verify invalid ones are filtered; valid findings pass through.

### Implementation for User Story 3

- [ ] T015 [US3] Implement `validateFindings(findings, lineResolver): FindingValidationSummary` with: (1) FindingClassification enum (inline/file-level/global/cross-file), (2) Pass 1 classification per contract table, (3) Pass 2 line validation for inline findings only using existing `lineResolver.validateLine()`, (4) Pass 3 structural self-contradiction detection requiring ALL of: info severity + dismissive regex match + no actionable suggestion; warning/error findings NEVER filtered by language; log all filtered findings with `[router] [finding-validator]` prefix in `router/src/report/finding-validator.ts`
- [ ] T016 [US3] Integrate `validateFindings()` into report pipeline — add `diffFiles: DiffFile[]` parameter to `processFindings()`, call `canonicalizeDiffFiles(diffFiles)` then `buildLineResolver(canonicalFiles)` inside (reuse pattern from github.ts:169-172), insert `validateFindings(sanitized, lineResolver)` between `sanitizeFindings()` and `sortFindings()`; update all callers of `processFindings` in `router/src/main.ts` and test files to pass diff files; apply validation to `completeFindings` only (partial findings from failed agents bypass validation to preserve diagnostic output) in `router/src/phases/report.ts`
- [ ] T017 [US3] Write unit tests covering: all 4 finding classifications, line validation pass (valid line) and skip (file-level/global/cross-file), self-contradiction filter (info + dismissive + no suggestion → filtered), severity protection (warning/error with dismissive language → NOT filtered), and info + dismissive + concrete suggestion → NOT filtered in `router/tests/unit/report/finding-validator.test.ts`

**Checkpoint**: Post-processing validation working. Self-contradicting info findings filtered; warning/error findings always pass.

---

## Phase 5: User Story 4 — Framework Convention Awareness (Priority: P2)

**Goal**: Add explicit framework and language convention rules to all LLM agent prompts to prevent Pattern B false positives (12% of total). Cover Express error middleware, React Query deduplication, Promise.allSettled ordering, TypeScript `_prefix`, exhaustive switch patterns, and constant externalization rules.

**Independent Test**: Submit Express error middleware `(err, req, res, _next)` for review. Verify no "unused parameter" finding.

### Implementation for User Story 4

- [ ] T018 [P] [US4] Add "### Framework & Language Conventions" section after "False Positive Prevention" and before "Output Format" with 6 rules (Express 4-param error MW, React Query key dedup, Promise.allSettled order preservation, TS `_prefix` unused params, exhaustive switch/assertNever, constant externalization — with concrete DO/DON'T examples per FR-016) to `config/prompts/semantic_review.md`, `config/prompts/opencode_system.md`, and `config/prompts/pr_agent_review.md`
- [ ] T019 [US4] Update hardcoded fallback prompts to include framework convention summary (condensed version of the 6 rules) in `router/src/agents/opencode.ts`, `router/src/agents/ai_semantic_review.ts`, and `router/src/agents/pr_agent.ts`
- [ ] T020 [US4] Verify prompt-file loading succeeds and fallback prompts include framework conventions by running existing prompt-sync test in `router/tests/unit/agents/prompt-sync.test.ts`

**Checkpoint**: All 3 agent prompts contain Framework Conventions section. Fallbacks stay in sync.

---

## Phase 6: User Story 5 — Benchmark Harness (Priority: P3)

**Goal**: Build a regression test suite with 43 FP-regression and 10+ TP-preservation scenarios, dual-pool scoring module, benchmark adapter using LocalReviewDependencies DI, and CLI command. Serves as CI release gate (SC-005).

**Independent Test**: Run the benchmark command and verify it produces a JSON report with separate pool metrics (suppression rate, recall, precision).

### Implementation for User Story 5

- [ ] T021 [P] [US5] Create BenchmarkScenario, ExpectedFinding types and dual-pool scoring module with `computeScore()` returning BenchmarkReport with FPRegressionPool (suppressionRate, fpRate) and TPPreservationPool (recall, precision) computed separately; implement 1:1 strict finding matching algorithm in `router/tests/fixtures/benchmark/scoring.ts`
- [ ] T022 [P] [US5] Create benchmark adapter that mocks LocalReviewDependencies (inject synthetic diff via `getLocalDiff`, mock `executeAllPasses` to run control-flow agent only — no LLM API calls needed for deterministic FP-regression scenarios; capture findings via `reportToTerminal`), runs scenarios with 30s timeout per scenario, and converts JsonOutput to comparable findings; document that LLM-dependent scenarios (Patterns B/C/D) require either mock LLM responses or API keys in CI in `router/tests/fixtures/benchmark/adapter.ts`
- [ ] T023 [US5] Author 30 FP-regression fixtures: 12 Pattern A (safe-source: const arrays, `__dirname`, innerHTML from safe source), 5 Pattern B (Express MW, React Query, Promise.allSettled, TS `_prefix`), 4 Pattern C (constant externalization against project rules), 5 Pattern D (flagging stated PR purpose, documented decisions), 4 Pattern E (wrong line numbers, self-dismissing language) in `router/tests/fixtures/benchmark/regression-suite.json`
- [ ] T024 [US5] Author 13 Pattern F (mixed/remaining) FP-regression fixtures — each with individual `subcategory` field documenting specific root cause and explanation of why it doesn't fit patterns A-E in `router/tests/fixtures/benchmark/regression-suite.json`
- [ ] T025 [US5] Author 10+ TP-preservation fixtures with `expectedFindings` arrays: 2+ injection (SQL injection via user input, command injection via req.query), 2+ XSS (innerHTML from req.query, dangerouslySetInnerHTML from user data), 2+ path_traversal (readFile with user-controlled path, createReadStream with URL param), 2+ SSRF (fetch with user-controlled URL, axios.get with query param), 2+ auth_bypass (delete without auth, admin without role) in `router/tests/fixtures/benchmark/regression-suite.json`
- [ ] T026 [US5] Implement Vitest integration test with Pool 1 (FP Suppression — `describe` per pattern A-F with `it.each`), Pool 2 (TP Preservation — `describe` per vulnerability family with `it.each`), and Release Gate Metrics (`SC-001: suppressionRate >= 85%`, `SC-002: recall === 100%`, `SC-003: precision >= 70%`, `SC-004: overall FPR <= 25%`, `SC-007: self-contradiction filter >= 80% on Pattern E`) in `router/tests/integration/false-positive-benchmark.test.ts`
- [ ] T027 [US5] Add `benchmark` CLI command with `--fixtures <path>` (required), `--output <path>` (optional), `--verbose` flags; exit code 0 if gates pass, 1 if failed, 2 if config error; follows existing Commander.js pattern with dynamic import in `router/src/main.ts`

**Checkpoint**: Full benchmark suite running. `pnpm vitest run tests/integration/false-positive-benchmark.test.ts` produces dual-pool report.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify no regressions and validate overall integration

- [ ] T028 Run full test suite (`pnpm test`) to verify zero test regressions across all changes (SC-008)
- [ ] T029 [P] Run typecheck (`pnpm typecheck`) to confirm no type errors across all new and modified files
- [ ] T030 Validate quickstart.md — execute each layer's test command and verify expected pass/fail results

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **US1 (Phase 2)**: Depends on Setup only — can start after T001
- **US2 (Phase 3)**: Depends on Setup only — can start after T001
- **US3 (Phase 4)**: Depends on Setup only — can start after T001
- **US4 (Phase 5)**: Depends on Setup only — can start after T001
- **US5 (Phase 6)**: Depends on US1-US4 completion (fixtures must test implemented behavior)
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **User Story 1 (P1)**: Independent — no dependencies on other stories
- **User Story 2 (P2)**: Independent — no dependencies on other stories
- **User Story 3 (P2)**: Independent — no dependencies on other stories
- **User Story 4 (P2)**: Independent — no dependencies on other stories
- **User Story 5 (P3)**: Depends on US1-US4 for meaningful benchmark results (fixtures exercise all improvement layers)

### Within Each User Story

- Type definitions / pattern registries before implementation
- Core logic before integration
- Integration before tests (tests validate the integrated behavior)

### Parallel Opportunities

- **US1, US2, US3, US4** can all proceed in parallel (independent file sets)
- Within US1: T002 and T003 in parallel (patterns.ts and fixtures)
- Within US2: T008 and T009 in parallel (types.ts and trust.ts)
- Within US5: T021 and T022 in parallel (scoring.ts and adapter.ts)
- Within US5: T023, T024, T025 in parallel (independent fixture authoring)
- Within Polish: T028 and T029 in parallel

---

## Parallel Example: User Story 1

```text
# Launch type definitions and test fixtures in parallel:
Task: "Create SafeSourcePattern types and registry in safe-source-patterns.ts"
Task: "Create test fixtures with positive/negative cases in safe-source-inputs.ts"

# Then implement patterns sequentially:
Task: "Implement Patterns 1+2 in safe-source-detector.ts"
Task: "Implement Patterns 3+4 in safe-source-detector.ts"

# Then integrate and test:
Task: "Integrate filter into vulnerability-detector.ts"
Task: "Write unit tests in safe-source-detector.test.ts"
```

## Parallel Example: All P2 Stories

```text
# After Setup, launch all P2 stories in parallel:
Story US1: "Safe source patterns → detector → integration → tests"
Story US2: "Types + trust → context-loader → main.ts → agent prompts → tests"
Story US3: "finding-validator → report.ts integration → tests"
Story US4: "Prompt files → fallback updates → sync test"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: User Story 1 (safe-source recognition)
3. **STOP and VALIDATE**: Run safe-source-detector tests + existing control-flow tests
4. This alone addresses 28% of documented false positives (12 of 43)

### Incremental Delivery

1. Complete Setup → baseline verified
2. Add US1 → Test independently → 28% FP reduction (MVP!)
3. Add US2 + US3 + US4 in parallel → Test independently → additional 42% FP coverage
4. Add US5 → Benchmark validates all improvements → CI release gate active
5. Each story adds measurable value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup together (T001)
2. After Setup:
   - Developer A: User Story 1 (safe-source recognition)
   - Developer B: User Story 2 (context enrichment)
   - Developer C: User Story 3 (post-processing) + User Story 4 (prompts)
3. Developer D (or any): User Story 5 (benchmark) once US1-US4 land
4. All: Polish phase together

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- FR-005 was intentionally removed (test-file severity downgrade is a policy footgun)
- Benchmark uses dual-pool scoring — FP and TP metrics computed separately, never conflated
- All context fields (prDescription, projectRules) are untrusted input — sanitize before use
- Safe-source detection is conservative: when in doubt, treat as tainted
- Pattern F (13 mixed fixtures) has no dedicated mitigation — SC-001 (85% suppression) requires at least 7 of 13 Pattern F fixtures to be suppressed by indirect effects of Patterns A-E improvements; if this proves unrealistic, fixture reclassification or target adjustment may be needed after initial benchmark run
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
