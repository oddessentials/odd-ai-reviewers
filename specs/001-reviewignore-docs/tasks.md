# Tasks: .reviewignore Documentation Improvements

**Input**: Design documents from `/specs/001-reviewignore-docs/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md

**Tests**: No automated tests requested — this is a documentation-only feature. Verification is manual per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Documentation**: `docs/` at repository root
- **Main README**: `README.md` at repository root
- **Source comments**: `router/src/` (optional updates)

---

## Phase 1: Setup

**Purpose**: Verify current documentation state before making changes

- [x] T001 Read current `.reviewignore` section in `docs/config-schema.md` to understand existing structure
- [x] T002 [P] Read `docs/ARCHITECTURE.md` filter precedence section (lines 65-71) to identify duplicate content
- [x] T003 [P] Read `README.md` filter flow section (around line 209) to identify cross-reference opportunity

**Checkpoint**: Understand current documentation structure before modifying

---

## Phase 2: User Story 1 - Understanding Pattern Normalization (Priority: P1) 🎯 MVP

**Goal**: Add Pattern Normalization section so developers understand how patterns transform internally

**Independent Test**: Read the new section and correctly predict behavior for `node_modules`, `/config.js`, `dist/`, and `src/generated`

### Implementation for User Story 1

- [x] T004 [US1] Add "Pattern Normalization" heading after Syntax section in `docs/config-schema.md` (insert around line 172)
- [x] T005 [US1] Add introductory paragraph explaining that patterns are transformed before matching in `docs/config-schema.md`
- [x] T006 [US1] Add transformation table with columns: User Pattern | Normalized Pattern | Rule Applied in `docs/config-schema.md`
- [x] T007 [US1] Include these transformation examples in the table in `docs/config-schema.md`:
  - `node_modules` → `**/node_modules` (bare name)
  - `/config.js` → `config.js` (root-relative)
  - `dist/` → `**/dist/**` (directory)
  - `src/generated` → `src/generated` (path-relative)
- [x] T008 [US1] Add explanation of when `**/` prefix is added vs when pattern is left unchanged in `docs/config-schema.md`

**Checkpoint**: Pattern Normalization section complete. Developers can now predict how any pattern will be transformed.

---

## Phase 3: User Story 2 - Predicting Bare Segment Matching (Priority: P2)

**Goal**: Expand bare segment explanation with what matches and what doesn't match

**Independent Test**: Read the expanded section and correctly predict that `node_modules` matches `src/node_modules/file.js` but NOT `node_modules_backup/file.js`

### Implementation for User Story 2

- [x] T009 [US2] Expand the "Bare names match anywhere" comment in Syntax section of `docs/config-schema.md` (around line 152-153)
- [x] T010 [US2] Add matching examples table showing what `node_modules` DOES match in `docs/config-schema.md`:
  - `node_modules` (the directory itself)
  - `node_modules/lodash/index.js` (contents)
  - `src/node_modules/local/file.js` (nested occurrences)
- [x] T011 [US2] Add non-matching examples showing what `node_modules` does NOT match in `docs/config-schema.md`:
  - `node_modules_backup/file.js` (partial segment)
  - `my-node_modules/file.js` (prefix match)
- [x] T012 [US2] Add tip about using `/node_modules` for root-only matching in `docs/config-schema.md`

**Checkpoint**: Bare segment matching fully documented. Users can predict exact matching behavior.

---

## Phase 4: User Story 3 - Using Negation with Bare Segments (Priority: P3)

**Goal**: Add negation example showing directory exclusion with file exception

**Independent Test**: Read the example and successfully write a pattern to exclude `node_modules` but keep `node_modules/important-patch.js`

### Implementation for User Story 3

- [x] T013 [US3] Add negation example to the Example `.reviewignore` section in `docs/config-schema.md` (around line 190-212)
- [x] T014 [US3] Include this pattern with comments in `docs/config-schema.md`:
  ```gitignore
  # Exclude directory but keep specific file
  node_modules
  !node_modules/important-patch.js
  ```
- [x] T015 [US3] Add explanation of "last match wins" behavior for negation patterns in `docs/config-schema.md`

**Checkpoint**: Negation pattern documented. Users can configure selective exclusions.

---

## Phase 5: User Story 4 - Finding Filter Precedence Information (Priority: P4)

**Goal**: Consolidate filter precedence to single canonical location with cross-references

**Independent Test**: Find filter precedence in `docs/config-schema.md` as canonical source, with links from other docs

### Implementation for User Story 4

- [x] T016 [US4] Verify filter precedence table in `docs/config-schema.md` (lines 174-181) is complete and accurate
- [x] T017 [US4] Replace duplicate filter precedence table in `docs/ARCHITECTURE.md` (lines 65-71) with cross-reference link to `docs/config-schema.md#filter-precedence`
- [x] T018 [US4] Add brief filter mention with link to `docs/ARCHITECTURE.md` in `README.md` after the filter flow diagram (around line 209)

**Checkpoint**: Filter precedence consolidated. Single source of truth established.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final verification and optional improvements

- [x] T019 [P] Add link to gitignore documentation for advanced patterns not covered in `docs/config-schema.md`
- [x] T020 [P] Review `router/src/main.ts` for redundant precedence comments (optional: add doc reference) — kept as developer-facing docs
- [x] T021 [P] Review `router/src/diff.ts` for redundant precedence comments (optional: add doc reference) — kept as developer-facing docs
- [x] T022 Run quickstart.md verification checklist to validate all success criteria
- [x] T023 Count filter precedence mentions and confirm ≤3 detailed locations — confirmed: 1 canonical + cross-refs

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **User Story 1 (Phase 2)**: Depends on Setup completion
- **User Story 2 (Phase 3)**: Can run in parallel with US1 (different section of same file, but recommend sequential for coherent review)
- **User Story 3 (Phase 4)**: Can run after US2 (builds on existing example section)
- **User Story 4 (Phase 5)**: Can run in parallel with US1-3 (different files)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories — adds new section
- **User Story 2 (P2)**: No dependencies — expands existing syntax section
- **User Story 3 (P3)**: No dependencies — adds to existing example section
- **User Story 4 (P4)**: No dependencies on US1-3 — touches different files (ARCHITECTURE.md, README.md)

### Within Each User Story

- Tasks within each story should be executed sequentially (same file, logical flow)
- Each story modifies primarily one file for coherent changes

### Parallel Opportunities

- T002 and T003 can run in parallel (different files)
- T019, T020, T021 can run in parallel (different files)
- User Story 4 can run entirely in parallel with User Stories 1-3 (different files)

---

## Parallel Example: Setup Phase

```bash
# Launch setup reads in parallel:
Task T002: "Read docs/ARCHITECTURE.md filter precedence section"
Task T003: "Read README.md filter flow section"
```

## Parallel Example: Polish Phase

```bash
# Launch optional source code reviews in parallel:
Task T019: "Add gitignore reference link in docs/config-schema.md"
Task T020: "Review router/src/main.ts for redundant comments"
Task T021: "Review router/src/diff.ts for redundant comments"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: User Story 1 (T004-T008)
3. **STOP and VALIDATE**: Test that Pattern Normalization section is complete and accurate
4. This alone delivers significant value for user understanding

### Incremental Delivery

1. Setup → Read current docs
2. User Story 1 → Pattern Normalization documented → Validate
3. User Story 2 → Bare segment matching expanded → Validate
4. User Story 3 → Negation example added → Validate
5. User Story 4 → Filter precedence consolidated → Validate
6. Polish → Final verification

### Single Developer Strategy

Since this is documentation-only and most changes affect `docs/config-schema.md`:

1. Complete all tasks sequentially for coherent editing
2. Commit after each user story phase
3. Run quickstart.md validation after Phase 6

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- All changes to `docs/config-schema.md` should maintain section ordering
- Cross-references use relative markdown links for portability
- Verify markdown renders correctly in both GitHub and local viewers
- Commit message format: `docs: [brief description of story completed]`
