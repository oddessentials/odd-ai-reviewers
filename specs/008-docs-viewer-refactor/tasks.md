# Tasks: Documentation Viewer Refactor

**Input**: Design documents from `/specs/008-docs-viewer-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests ARE requested in this feature (FR-009, FR-011a, FR-018 specify automated tests).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Scripts**: `scripts/` at repository root
- **Viewer**: `docs/viewer/` (app.js, index.html, styles.css)
- **Tests**: `tests/docs-viewer/` (new test directory)

---

## Phase 1: Setup

**Purpose**: Add chokidar dependency and create test directory structure

- [x] T001 Add chokidar as devDependency in package.json
- [x] T002 [P] Create tests/docs-viewer/ directory for new test files
- [x] T003 [P] Add `docs:dev` script to package.json pointing to scripts/docs-dev-server.mjs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core refactoring that ALL user stories depend on - must complete before any story work

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Refactor docs/viewer/app.js init() to single-pass render architecture (parse hash first, load manifest, render once - no showIntro() on initial load)
- [x] T005 [P] Add showNotFound(docPath) method to docs/viewer/app.js for consistent "document not found" display across all entry points
- [x] T006 Refactor loadFile() in docs/viewer/app.js to call showNotFound() for invalid paths instead of silent failure
- [x] T007 [P] Add isValidPath(path) helper method to docs/viewer/app.js for manifest validation
- [x] T008 Update hashchange handler in docs/viewer/app.js to use showNotFound() for invalid hashes

**Checkpoint**: Foundation ready - single-pass render architecture in place, error handling consistent

---

## Phase 3: User Story 1 - Landing Page (Priority: P1)

**Goal**: Render docs/index.md as the default landing page instead of statistics splash

**Independent Test**: Open viewer in browser with no hash - should immediately show index.md content

### Tests for User Story 1

- [x] T009 [P] [US1] Create sanitization test with 5 adversarial fixtures in tests/docs-viewer/sanitization.test.ts
- [x] T010 [P] [US1] Create base-path test for GitHub Pages subpath compatibility in tests/docs-viewer/base-path.test.ts

### Implementation for User Story 1

- [x] T011 [US1] Modify init() in docs/viewer/app.js to default to 'index.md' when no hash present (instead of calling showIntro())
- [x] T012 [US1] Remove showIntro() method entirely from docs/viewer/app.js (no longer needed)
- [x] T013 [US1] Update attachContentListeners() in docs/viewer/app.js to handle internal link rewriting with anchor stripping per FR-014
- [x] T014 [P] [US1] Add attachHeadingAnchors() method to docs/viewer/app.js for scroll-to-id without URL hash change per FR-002a
- [x] T015 [US1] Call attachHeadingAnchors() from loadFile() after content render in docs/viewer/app.js
- [x] T016 [US1] Add graceful fallback in loadFile() for missing index.md per FR-013 in docs/viewer/app.js
- [x] T017 [US1] Verify all fetch paths in docs/viewer/app.js are relative (no absolute `/docs/...` paths) per FR-011

**Checkpoint**: User Story 1 complete - viewer loads index.md by default, links work, anchors scroll without URL change

---

## Phase 4: User Story 2 - Live Reload Dev Server (Priority: P2)

**Goal**: Developers can run `npm run dev` to get live reload on file changes

**Independent Test**: Run `npm run dev`, edit a .md file, verify browser reloads automatically

### Tests for User Story 2

- [x] T018 [P] [US2] Create smoke test for dev server boot and content serving in tests/docs-viewer/smoke.test.ts

### Implementation for User Story 2

- [x] T019 [US2] Create scripts/docs-dev-server.mjs with HTTP server serving docs/viewer/ and docs/
- [x] T020 [US2] Add SSE endpoint (/\_\_reload) to scripts/docs-dev-server.mjs for live reload signaling
- [x] T021 [US2] Add response-time SSE client script injection in scripts/docs-dev-server.mjs (inject before </body> only for index.html requests)
- [x] T022 [US2] Add chokidar file watcher to scripts/docs-dev-server.mjs watching docs/\*_/_.md and docs/viewer/\*
- [x] T023 [US2] Configure watcher exclusions in scripts/docs-dev-server.mjs: **/node_modules/**, **/manifest.json, **/.git/\*\*
- [x] T024 [US2] Add manifest regeneration on file add/remove in scripts/docs-dev-server.mjs (call generate-docs-manifest.cjs)
- [x] T025 [US2] Add startup manifest regeneration in scripts/docs-dev-server.mjs
- [x] T026 [US2] Add port conflict handling in scripts/docs-dev-server.mjs with clear error message including port number per FR-017
- [x] T027 [US2] Add URL printing on successful server start in scripts/docs-dev-server.mjs
- [x] T028 [P] [US2] Add --port and --base-path CLI argument parsing to scripts/docs-dev-server.mjs
- [x] T029 [US2] Add browser auto-open on server start in scripts/docs-dev-server.mjs (optional, can be disabled with --no-open)

**Checkpoint**: User Story 2 complete - `npm run dev` starts server with live reload, files watched, manifest regenerated

---

## Phase 5: User Story 3 - Accurate Statistics (Priority: P3)

**Goal**: Viewer displays correct document count from manifest.json

**Independent Test**: Count .md files in docs/, compare to displayed count in viewer

### Tests for User Story 3

- [x] T030 [P] [US3] Add link rewriting test for internal/external link handling in tests/docs-viewer/link-rewriting.test.ts

### Implementation for User Story 3

- [x] T031 [US3] Fix document count in docs/viewer/app.js to use manifest.files.length (currently incorrectly counts tree top-level items)
- [x] T032 [US3] Verify manifest.json has correct file count after running npm run docs:manifest
- [x] T033 [US3] Update any remaining statistics display in docs/viewer/app.js to use manifest data correctly

**Checkpoint**: User Story 3 complete - viewer shows correct document count matching actual files

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation and cleanup

- [x] T034 Run all tests in tests/docs-viewer/ and verify they pass
- [x] T035 Run eslint on new scripts/docs-dev-server.mjs file
- [x] T036 [P] Test dev server on Windows (path normalization, file watching)
- [ ] T037 [P] Test dev server on Unix/macOS
- [x] T038 Verify production viewer (docs/viewer/index.html) has NO SSE reload code
- [ ] T039 Test viewer under GitHub Pages subpath simulation (--base-path flag)
- [ ] T040 Update specs/008-docs-viewer-refactor/quickstart.md if any setup steps changed
- [x] T041 Run npm run docs:linkcheck to verify all documentation links still work

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - US1 (Landing Page): Can proceed first (P1 priority)
  - US2 (Dev Server): Can proceed after Foundational, independent of US1
  - US3 (Statistics): Can proceed after Foundational, independent of US1/US2
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Independent of US1, creates new file
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Independent of US1/US2

### Within Each User Story

- Tests can be written in parallel with each other
- Implementation tasks follow logical order (setup → core → integration)
- Each story independently testable at its checkpoint

### Parallel Opportunities

**Phase 1 (Setup)**:

- T002 and T003 can run in parallel

**Phase 2 (Foundational)**:

- T005 and T007 can run in parallel (different methods, no dependencies)

**Phase 3 (US1)**:

- T009 and T010 can run in parallel (different test files)
- T014 can run in parallel with T013 (different methods)

**Phase 4 (US2)**:

- T018 can be written early while implementation proceeds
- T028 can run in parallel with other dev server tasks (CLI args separate from core logic)

**Phase 5 (US3)**:

- T030 can run in parallel (test file independent)

**Phase 6 (Polish)**:

- T036 and T037 can run in parallel (different platforms)

**Cross-Story Parallelism**:

- Once Phase 2 completes, US1, US2, and US3 can all be worked on simultaneously by different developers
- US2 (new file: scripts/docs-dev-server.mjs) has no conflicts with US1/US3 (docs/viewer/app.js)

---

## Parallel Example: After Foundational Phase

```bash
# Three developers can work simultaneously:

# Developer A: User Story 1 (app.js refactoring)
Task: "T011 [US1] Modify init() in docs/viewer/app.js..."
Task: "T012 [US1] Remove showIntro() method..."

# Developer B: User Story 2 (new dev server)
Task: "T019 [US2] Create scripts/docs-dev-server.mjs..."
Task: "T020 [US2] Add SSE endpoint..."

# Developer C: Tests (no implementation conflict)
Task: "T009 [P] [US1] Create sanitization test..."
Task: "T018 [P] [US2] Create smoke test..."
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test that viewer loads index.md by default
5. Deploy/demo if ready - landing page is fixed!

### Incremental Delivery

1. **Setup + Foundational** → Foundation ready (single-pass render)
2. **Add User Story 1** → Landing page shows index.md (MVP!)
3. **Add User Story 2** → Dev server with live reload (major DX improvement)
4. **Add User Story 3** → Statistics correct (polish)
5. **Polish** → Tests pass, cross-platform verified

### File Conflict Avoidance

| User Story | Primary Files               | Conflict Risk            |
| ---------- | --------------------------- | ------------------------ |
| US1        | docs/viewer/app.js          | Medium (shared with US3) |
| US2        | scripts/docs-dev-server.mjs | None (new file)          |
| US3        | docs/viewer/app.js          | Medium (shared with US1) |

**Recommendation**: Complete US1 before US3 (both modify app.js), but US2 can proceed in parallel with either.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Test files in tests/docs-viewer/ are new and don't conflict with existing tests
- Dev server script is entirely new - no conflict risk
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
