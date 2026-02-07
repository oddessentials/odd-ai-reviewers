# Tasks: Reduce AI Review False Positives

**Input**: Design documents from `/specs/409-reduce-review-false-positives/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, quickstart.md

**Tests**: One test task included — the fallback-sync test is integral to FR-012 and is part of the core deliverable, not optional QA.

**Organization**: Tasks are grouped by user story. All four stories share the same prompt files, so the work is organized around which content goes into which file, with each user story adding its specific false-positive prevention guidance.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the missing prompt file and wire up the orphaned opencode prompt loading — foundational work all user stories depend on.

- [x] T001 Create `config/prompts/semantic_review.md` with the common prompt skeleton: Core Rules section (4 numbered rules per plan.md Phase 1 Design), Review Focus section (logic errors, security, performance, API misuse, error handling), empty False Positive Prevention section (placeholder for US content), and Output Format section matching the JSON schema in `router/src/agents/ai_semantic_review.ts:252-264` with line numbering rules from the existing hardcoded fallback
- [x] T002 [P] Update `config/prompts/pr_agent_review.md` — add Core Rules section (same 4 rules) at the top before the existing "## Tasks" section, add empty False Positive Prevention section between review guidance and the existing "## Format" / "## Line Numbering Requirements" sections. Preserve existing Format and Line Numbering sections unchanged (FR-008)
- [x] T003 [P] Rewrite `config/prompts/opencode_system.md` as the opencode agent's file-based prompt — Core Rules section (same 4 rules), Review Focus section (OWASP Top 10, CWE, logic errors, performance, code quality), empty False Positive Prevention section, and Output Format section matching the JSON schema in `router/src/agents/opencode.ts:109-124`
- [x] T004 Add prompt file loading to `router/src/agents/opencode.ts` — import `readFile` from `fs/promises`, `join` from `path`, `existsSync` from `fs`. Add `PROMPT_PATH` constant pointing to `../../config/prompts/opencode_system.md` (same pattern as `ai_semantic_review.ts:48`). Modify `buildReviewPrompt()` to load from file with fallback to hardcoded prompt. Keep the existing `getCurrentDateUTC()` prepend behavior

**Checkpoint**: All three agents now load file-based prompts with the Core Rules section. False Positive Prevention sections are empty placeholders ready for user story content.

---

## Phase 2: Foundational (Hardcoded Fallback Updates)

**Purpose**: Update all three hardcoded fallback prompts to include the Core Rules, ensuring degraded mode also benefits from false-positive prevention (FR-007, FR-010).

**CRITICAL**: Must complete before user story content is added, so fallbacks are established before the file-based prompts diverge further.

- [x] T005 [P] Update hardcoded fallback in `router/src/agents/ai_semantic_review.ts:217-229` — replace the existing 7-line prompt with the condensed fallback containing: (1) the 4 Core Rules (identical text to `config/prompts/semantic_review.md`), (2) minimal review focus list, (3) line numbering rules, (4) JSON output format instruction. Omit False Positive Prevention examples to keep fallback concise
- [x] T006 [P] Update hardcoded fallback in `router/src/agents/pr_agent.ts:205` — replace the existing 1-line prompt with the condensed fallback containing: (1) the 4 Core Rules (identical text to `config/prompts/pr_agent_review.md`), (2) minimal review instruction, (3) JSON output format instruction
- [x] T007 [P] Update hardcoded fallback in `router/src/agents/opencode.ts` `buildReviewPrompt()` function — update the `systemPrompt` string used as fallback when file loading fails, containing: (1) the 4 Core Rules (identical text to `config/prompts/opencode_system.md`), (2) minimal review focus list, (3) the existing `getCurrentDateUTC()` date prepend, (4) JSON output format instruction

**Checkpoint**: All three agents have Core Rules in both file-based and hardcoded prompts. FR-007 and FR-010 are satisfied.

---

## Phase 3: User Story 1 — Security-Context False Positives (Priority: P1) MVP

**Goal**: Eliminate false positives for innerHTML with hardcoded strings, console.log format specifier injection, and similar security-sink pattern matching without data-flow verification.

**Independent Test**: Submit a PR with `innerHTML = '<p>Loading...</p>'` and `console.log('Error:', err)` and verify zero security false positives.

### Implementation for User Story 1

- [x] T008 [P] [US1] Add security data-flow verification guidance to the False Positive Prevention section of `config/prompts/semantic_review.md` — innerHTML/eval/dangerouslySetInnerHTML are only vulnerabilities when user-controlled data flows into them; hardcoded strings, template literals with internal variables, and caught Error objects are NOT vulnerabilities; browser console.log does not process printf-style format specifiers; include concrete examples of safe vs. unsafe patterns (FR-002, FR-009)
- [x] T009 [P] [US1] Add security data-flow verification guidance to the False Positive Prevention section of `config/prompts/pr_agent_review.md` — same content as T008 adapted to PR-agent's review style (FR-002, FR-009)
- [x] T010 [P] [US1] Add security data-flow verification guidance to the False Positive Prevention section of `config/prompts/opencode_system.md` — same content as T008 adapted to opencode's review style (FR-002, FR-009)
- [x] T011 [US1] Add uncertainty/borderline guidance to all three prompts — when data flow is ambiguous (e.g., function return value not in diff), report at "info" severity with uncertainty qualifier "Potential issue — verify that..." rather than suppressing or alarming (FR-011). Add to all three files: `config/prompts/semantic_review.md`, `config/prompts/pr_agent_review.md`, `config/prompts/opencode_system.md`

**Checkpoint**: Security-context false positives (SC-001) and ambiguous-severity handling (SC-007) addressed. True positive preservation (SC-005) ensured by examples of what IS a real vulnerability.

---

## Phase 4: User Story 2 — CSS and UI Pattern False Positives (Priority: P2)

**Goal**: Eliminate false positives for standard CSS cascade behavior, scoped selectors, and overflow patterns.

**Independent Test**: Submit a PR with a CSS media query changing `display: grid` to `display: flex` and verify zero CSS false positives.

### Implementation for User Story 2

- [x] T012 [P] [US2] Add CSS cascade behavior guidance to the False Positive Prevention section of `config/prompts/semantic_review.md` — changing `display` fully overrides prior display-mode properties; `overflow-y: auto` is safe without nested scroll containers; selectors scoped to a specific class are not "overly broad"; include examples of actual CSS problems vs. standard patterns (FR-005)
- [x] T013 [P] [US2] Add CSS cascade behavior guidance to the False Positive Prevention section of `config/prompts/pr_agent_review.md` — same content as T012 (FR-005)
- [x] T014 [P] [US2] Add CSS cascade behavior guidance to the False Positive Prevention section of `config/prompts/opencode_system.md` — same content as T012 (FR-005)

**Checkpoint**: CSS false positives (SC-002) addressed across all three agents.

---

## Phase 5: User Story 3 — State Machine and Deliberate Design Choices (Priority: P2)

**Goal**: Eliminate false positives for type-constrained state machines with intentional no-ops and documented test trade-offs.

**Independent Test**: Submit a PR with a typed enum switch statement with an intentional no-op case and verify zero "missing fallback" findings.

### Implementation for User Story 3

- [x] T015 [P] [US3] Add type-system awareness guidance to the False Positive Prevention section of `config/prompts/semantic_review.md` — typed enums and discriminated unions guarantee which cases exist; intentional no-ops are deliberate design choices, not missing fallbacks (FR-004)
- [x] T016 [P] [US3] Add type-system awareness guidance to the False Positive Prevention section of `config/prompts/pr_agent_review.md` — same content as T015 (FR-004)
- [x] T017 [P] [US3] Add type-system awareness guidance to the False Positive Prevention section of `config/prompts/opencode_system.md` — same content as T015 (FR-004)
- [x] T018 [US3] Add code-comment and documented-tradeoff guidance to all three prompts — if a comment explains why a pattern was chosen (test isolation, performance, compatibility), do not flag the pattern; if a comment acknowledges a limitation, do not repeat it as a finding; config files (.prettierignore, .eslintrc, tsconfig.json) reflect deliberate project decisions (FR-006). Add to all three files: `config/prompts/semantic_review.md`, `config/prompts/pr_agent_review.md`, `config/prompts/opencode_system.md`

**Checkpoint**: State machine false positives (SC-003) and documented trade-off false positives addressed.

---

## Phase 6: User Story 4 — Agents Cite Exact Code in Findings (Priority: P3)

**Goal**: Ensure all findings accurately reference the actual code construct being flagged — no misattributed selectors, elements, or line references.

**Independent Test**: Submit a PR and verify that every finding's code reference matches the actual diff content.

### Implementation for User Story 4

- [x] T019 [US4] Add code-citation accuracy guidance to the Core Rules reinforcement area of all three prompts — strengthen rule 2 ("ALWAYS quote the exact code") with explicit instruction to name the specific selector, variable, function, or element; if the exact construct cannot be identified in the diff, the finding must be omitted; add to the False Positive Prevention section examples of misattribution (e.g., claiming `body` when the code says `.map-container`) (FR-003). Update all three files: `config/prompts/semantic_review.md`, `config/prompts/pr_agent_review.md`, `config/prompts/opencode_system.md`

**Checkpoint**: Code-citation accuracy (SC-004) addressed across all agents.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Fallback drift prevention test, final validation, cleanup.

- [x] T020 Create `router/tests/unit/prompts/fallback-sync.test.ts` — Vitest test that reads each file-based prompt (`config/prompts/semantic_review.md`, `config/prompts/pr_agent_review.md`, `config/prompts/opencode_system.md`), extracts the Core Rules section, reads each agent source file (`router/src/agents/ai_semantic_review.ts`, `router/src/agents/pr_agent.ts`, `router/src/agents/opencode.ts`), extracts the hardcoded fallback string, and asserts the 4 Core Rules appear in both (FR-012, SC-008)
- [x] T021 Run fallback-sync test — 10/10 tests pass
- [x] T022 Run full test suite — 137 files, 3598 tests pass, 0 failures
- [x] T023 Review all three prompt files for token budget — all under 1,100 tokens total (~0.15% of 700K max_tokens_per_pr budget) — verify each is under ~900 tokens total using rough 4-chars-per-token estimate, ensuring overhead stays within the < 800 token addition constraint from plan.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion (T004 specifically for opencode). T005-T007 can run in parallel
- **User Stories (Phases 3-6)**: All depend on Phase 1 completion (prompt file skeletons exist). Independent of Phase 2 (fallbacks)
- **Polish (Phase 7)**: Depends on Phase 2 + all user story phases complete (T020 tests both file-based and fallback prompts)

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 1 — No dependencies on other stories
- **User Story 2 (P2)**: Can start after Phase 1 — Independent of US1 (different prompt sections)
- **User Story 3 (P2)**: Can start after Phase 1 — Independent of US1/US2
- **User Story 4 (P3)**: Can start after Phase 1 — Independent but best done last as it reinforces rules established in US1-US3

### Within Each User Story

- Tasks marked [P] within a story can run in parallel (they touch different files)
- Multi-file tasks (T011, T018, T019) touch all three prompt files sequentially

### Parallel Opportunities

- T002 + T003 can run in parallel (different prompt files)
- T005 + T006 + T007 can run in parallel (different agent source files)
- T008 + T009 + T010 can run in parallel (different prompt files, same content)
- T012 + T013 + T014 can run in parallel (different prompt files, same content)
- T015 + T016 + T017 can run in parallel (different prompt files, same content)
- All user story phases (3-6) can run in parallel with Phase 2 (they edit different files)

---

## Parallel Example: User Story 1

```bash
# Launch all three prompt file updates in parallel:
Task: "T008 [P] [US1] Security data-flow guidance in config/prompts/semantic_review.md"
Task: "T009 [P] [US1] Security data-flow guidance in config/prompts/pr_agent_review.md"
Task: "T010 [P] [US1] Security data-flow guidance in config/prompts/opencode_system.md"

# Then sequential (multi-file):
Task: "T011 [US1] Uncertainty/borderline guidance across all three prompt files"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004) — create prompt skeletons, wire opencode loading
2. Complete Phase 2: Foundational (T005-T007) — Core Rules in all fallbacks
3. Complete Phase 3: User Story 1 (T008-T011) — security false-positive prevention
4. **STOP and VALIDATE**: Run fallback sync test (T020-T021), verify prompts load correctly
5. This alone addresses the highest-noise false positive category (SC-001)

### Incremental Delivery

1. Setup + Foundational + US1 → Security false positives eliminated (MVP)
2. Add US2 → CSS/UI false positives eliminated
3. Add US3 → State machine and trade-off false positives eliminated
4. Add US4 → Code-citation accuracy reinforced
5. Polish → Sync test, regression check, token budget verification

### Single Developer Strategy

With one developer, execute phases sequentially in priority order. Each user story phase takes ~15-30 minutes (prompt content authoring). Total estimated: ~2-3 hours including setup, all stories, and polish.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story adds content to the same three prompt files but in distinct sections
- The 4 Core Rules text must be identical across all file-based prompts and all fallback strings
- Commit after each phase for clean git history
- Stop at any checkpoint to validate independently
