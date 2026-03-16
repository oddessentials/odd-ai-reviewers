# Tasks: Quality Enforcement

**Input**: Design documents from `/specs/006-quality-enforcement/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks included where explicitly required by functional requirements (FR-017, FR-019, FR-028).

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story this task belongs to (US1-US6)
- Exact file paths included in descriptions

---

## Phase 1: Setup

**Purpose**: Install dependencies required for new functionality

- [ ] T001 Install markdown-link-check as dev dependency via `npm install -D markdown-link-check`
- [ ] T002 Verify existing dependencies present via `npm ls husky lint-staged prettier vitest`

---

## Phase 2: Foundational

**Purpose**: No blocking prerequisites - existing Husky/lint-staged/Vitest infrastructure is sufficient

**Checkpoint**: Foundation ready - all user stories can proceed in parallel

---

## Phase 3: User Story 1 - Test Coverage Enforcement (Priority: P1) 🎯 MVP

**Goal**: CI-enforced test coverage thresholds with automatic badge updates

**Independent Test**: `CI=true npm test` fails on coverage drop; merge to main updates README badge

### Implementation for User Story 1

- [ ] T003 [US1] Update router/vitest.config.ts to add CI/local threshold split using `process.env.CI === 'true'` detection per FR-002, FR-005
- [ ] T004 [US1] Add threshold logging at test start in router/vitest.config.ts per FR-005a (log mode and threshold values)
- [ ] T005 [US1] Verify CI workflow runs `vitest --coverage` without embedded thresholds in .github/workflows/ci.yml per FR-005
- [ ] T006 [P] [US1] Create .github/workflows/badge-update.yml as separate post-merge workflow per FR-030 (extract badge generation from ci.yml)
- [ ] T007 [US1] Add `workflow_run` trigger to badge-update.yml as fallback per FR-030
- [ ] T008 [US1] Verify PR workflow does not depend on Gist availability per FR-031

**Checkpoint**: Coverage enforcement active - PRs failing threshold will be blocked

---

## Phase 4: User Story 2 - Automatic Code Formatting (Priority: P1)

**Goal**: Auto-format staged files on commit with CI parity

**Independent Test**: Stage unformatted file, commit, verify formatted; CI format check passes

### Implementation for User Story 2

- [ ] T009 [US2] Update package.json lint-staged config to run `prettier --write` before linting per FR-006
- [ ] T010 [US2] Update .husky/pre-commit to ensure lint-staged runs formatting per FR-006
- [ ] T011 [US2] Configure tiered behavior: block on formatter errors, warn on non-formattable files per FR-006, FR-009a
- [ ] T012 [US2] Verify hooks auto-install on `npm install` via husky prepare script per FR-007
- [ ] T013 [US2] Ensure shared skip rules between local hooks and CI per FR-009 (same file globs/ignore lists)
- [ ] T014 [P] [US2] Add fresh clone test job to .github/workflows/ci.yml per SC-004 (clone, install, verify hooks, test commit)

**Checkpoint**: Auto-formatting active - contributors never need to run formatters manually

---

## Phase 5: User Story 3 - Documentation Link Integrity (Priority: P1)

**Goal**: Zero broken links in documentation with CI enforcement

**Independent Test**: `markdown-link-check docs/` returns zero errors

### Implementation for User Story 3

- [ ] T015 [P] [US3] Fix broken image links in docs/reference/review-team.md (change `img/` to `../img/`) per FR-010
- [ ] T016 [P] [US3] Create .linkcheckignore.yml with initial external link allowlist per FR-013 (include `reason` field for each entry)
- [ ] T017 [US3] Create .markdown-link-check.json config to reference .linkcheckignore.yml patterns
- [ ] T018 [US3] Add link-check step to .github/workflows/ci.yml per FR-012 (run on all docs/\*.md files)
- [ ] T019 [US3] Verify internal links fail CI on breakage, external links require allowlist per FR-013

**Checkpoint**: Link integrity active - PRs with broken docs links will be blocked

---

## Phase 6: User Story 4 - ReDoS Threat Model Documentation (Priority: P2)

**Goal**: Clear documentation of regex trust boundaries for security review

**Independent Test**: Security reviewer can identify trust level of any regex source within 5 minutes

### Implementation for User Story 4

- [ ] T020 [P] [US4] Create docs/security/ directory structure
- [ ] T021 [US4] Create docs/security/regex-threat-model.md with trust boundary documentation per FR-014
- [ ] T022 [US4] Add data flow diagram showing input sources → regex compilation per FR-016
- [ ] T023 [US4] Document all `new RegExp()` call sites with trust classification (repo-controlled vs PR-controlled)
- [ ] T024 [P] [US4] Add trust level code comments at pattern construction sites in router/src/ per FR-015
- [ ] T025 [US4] Add code comment examples to threat model document

**Checkpoint**: Threat model complete - Semgrep findings can be triaged using documented boundaries

---

## Phase 7: User Story 5 - Pattern Validator Test Coverage (Priority: P2)

**Goal**: Comprehensive table-driven tests for pattern validator with vendored corpus

**Independent Test**: `npm test` passes for 100% of vendored corpus patterns

### Implementation for User Story 5

- [ ] T026 [P] [US5] Create router/tests/fixtures/redos-corpus/ directory structure
- [ ] T027 [US5] Create router/tests/fixtures/redos-corpus/v1.json with 50+ curated ReDoS patterns per FR-018
- [ ] T028 [US5] Include required metadata in corpus: version, source_urls, retrieved_at, curation_rules, patterns[] per FR-020
- [ ] T029 [US5] Add corpus validation test in router/src/**tests**/redos-corpus.test.ts (validates JSON against schema)
- [ ] T030 [US5] Create table-driven pattern validator tests in router/src/**tests**/pattern-validator.test.ts per FR-017
- [ ] T031 [US5] Add golden tests for specific error codes and messages per FR-019
- [ ] T032 [US5] Add golden tests for validation failure behavior per FR-028 (valid mitigation, invalid mitigation, mixed sets)
- [ ] T033 [US5] Add CI assertion for corpus version in .github/workflows/ci.yml per FR-020a

**Checkpoint**: Pattern validator fully tested - behavior changes detected by golden tests

---

## Phase 8: User Story 6 - Structured Security Logging (Priority: P3)

**Goal**: Single aggregation point for security events with consistent structured format

**Independent Test**: Trigger regex validation events, verify logs contain standardized fields without raw patterns

### Implementation for User Story 6

- [ ] T034 [P] [US6] Create router/src/security-logger.ts module per FR-024
- [ ] T035 [US6] Implement SecurityEvent schema with Zod in router/src/security-logger.ts per FR-021 (category, ruleId, file, patternHash, durationMs, outcome)
- [ ] T036 [US6] Implement hashPattern() using SHA-256 (first 16 chars) per FR-022
- [ ] T037 [US6] Implement fail-safe logging with stderr fallback per FR-023
- [ ] T038 [US6] Implement logSecurityEvent() as sole export for security logging
- [ ] T039 [P] [US6] Create router/src/**tests**/security-logger.test.ts with comprehensive unit tests
- [ ] T040 [US6] Add test: verify no raw patterns appear in log output per FR-022
- [ ] T041 [US6] Add test: verify logging failures don't block execution per FR-023
- [ ] T042 [US6] Add test: verify structured fields present in all events per FR-021

**Checkpoint**: Security logger complete - all security-relevant code can use single module

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [ ] T043 Run full CI validation: lint, format, typecheck, test+coverage, link-check
- [ ] T044 Verify all success criteria: SC-001 through SC-008
- [ ] T045 [P] Update CLAUDE.md if additional technologies added
- [ ] T046 Run quickstart.md validation checklist (pre-merge, post-merge, manual)
- [ ] T047 Verify no circular dependencies introduced via `npm run depcruise`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - already satisfied by existing infrastructure
- **User Stories (Phases 3-8)**: Can proceed in parallel after Setup
- **Polish (Phase 9)**: Depends on all user stories complete

### User Story Dependencies

| Story                  | Dependencies | Can Start After |
| ---------------------- | ------------ | --------------- |
| US1 (Coverage)         | None         | Phase 1         |
| US2 (Formatting)       | None         | Phase 1         |
| US3 (Link Integrity)   | None         | Phase 1         |
| US4 (Threat Model)     | None         | Phase 1         |
| US5 (Pattern Tests)    | None         | Phase 1         |
| US6 (Security Logging) | None         | Phase 1         |

**Note**: All P1 stories (US1, US2, US3) can run in parallel. P2 and P3 stories can start immediately or wait for P1 completion based on team capacity.

### Within Each User Story

1. Directory/file creation tasks marked [P] first
2. Configuration/schema tasks next
3. Integration tasks (CI workflow updates) last
4. Tests included where FR explicitly requires them

---

## Parallel Opportunities

### Phase 3 (US1) Parallel Tasks

```
T006 [P] Create badge-update.yml
```

### Phase 4 (US2) Parallel Tasks

```
T014 [P] Add fresh clone test job
```

### Phase 5 (US3) Parallel Tasks

```
T015 [P] Fix broken image links
T016 [P] Create .linkcheckignore.yml
```

### Phase 6 (US4) Parallel Tasks

```
T020 [P] Create docs/security/ directory
T024 [P] Add trust level code comments
```

### Phase 7 (US5) Parallel Tasks

```
T026 [P] Create redos-corpus directory
```

### Phase 8 (US6) Parallel Tasks

```
T034 [P] Create security-logger.ts module
T039 [P] Create security-logger.test.ts
```

### Cross-Story Parallelism

All user stories are independent - can be worked on simultaneously:

```
Developer A: US1 (Coverage) + US2 (Formatting)
Developer B: US3 (Link Integrity) + US4 (Threat Model)
Developer C: US5 (Pattern Tests) + US6 (Security Logging)
```

---

## Implementation Strategy

### MVP First (P1 Stories Only)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 3: US1 - Coverage (T003-T008)
3. Complete Phase 4: US2 - Formatting (T009-T014)
4. Complete Phase 5: US3 - Link Integrity (T015-T019)
5. **STOP and VALIDATE**: All P1 stories independently testable
6. Deploy/demo if ready

### Incremental Delivery

1. Setup → P1 stories → Deploy (MVP!)
2. Add P2 stories (US4, US5) → Test → Deploy
3. Add P3 story (US6) → Test → Deploy
4. Polish phase → Final validation

### Task Count Summary

| Phase     | Story                  | Task Count |
| --------- | ---------------------- | ---------- |
| Phase 1   | Setup                  | 2          |
| Phase 2   | Foundational           | 0          |
| Phase 3   | US1 - Coverage         | 6          |
| Phase 4   | US2 - Formatting       | 6          |
| Phase 5   | US3 - Link Integrity   | 5          |
| Phase 6   | US4 - Threat Model     | 6          |
| Phase 7   | US5 - Pattern Tests    | 8          |
| Phase 8   | US6 - Security Logging | 9          |
| Phase 9   | Polish                 | 5          |
| **Total** |                        | **47**     |

---

## Notes

- [P] tasks can run in parallel (different files, no dependencies)
- [Story] label maps task to specific user story for traceability
- All user stories are independently testable per spec
- FR references included for traceability
- Tests included where functional requirements explicitly demand them (FR-017, FR-019, FR-028)
