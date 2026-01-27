# Tasks: Review Team Documentation

**Input**: Design documents from `/specs/001-review-team-docs/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Tests**: Not required - documentation only feature with manual visual verification.

**Organization**: Tasks create a single documentation file. User stories are fulfilled by different sections of the document.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

- **Output file**: `docs/REVIEW_TEAM.md`
- **Images**: `docs/img/` (already exist)

---

## Phase 1: Setup

**Purpose**: Create the documentation file with basic structure

- [x] T001 Create docs/REVIEW_TEAM.md with page title and banner image using HTML img tag with width="100%" and alt text "odd-ai-reviewers banner"

**Checkpoint**: File exists with banner displayed

---

## Phase 2: User Story 1 - View Review Team Overview (Priority: P1) 🎯 MVP

**Goal**: Display all 5 team members with images so visitors can quickly understand who makes up the AI review team

**Independent Test**: View `docs/REVIEW_TEAM.md` on GitHub and confirm all 5 team members are displayed with images and profiles that render correctly

### Implementation for User Story 1

- [x] T002 [US1] Add introductory paragraph after banner explaining this page introduces the AI review team in docs/REVIEW_TEAM.md
- [x] T003 [US1] Add Ollama profile card using HTML table pattern (image left width="200", text right with name, role, 2-3 sentence description, GitHub link to https://github.com/ollama/ollama) in docs/REVIEW_TEAM.md
- [x] T004 [US1] Add OpenCode profile card using HTML table pattern (image left width="200", text right with name, role, 2-3 sentence description, GitHub link to https://github.com/opencode-ai/opencode) in docs/REVIEW_TEAM.md
- [x] T005 [US1] Add PR Agent profile card using HTML table pattern (image left width="200", text right with name, role, 2-3 sentence description, GitHub link to https://github.com/Codium-ai/pr-agent) in docs/REVIEW_TEAM.md
- [x] T006 [US1] Add Review Dog profile card using HTML table pattern (image left width="200", text right with name, role, 2-3 sentence description, GitHub link to https://github.com/reviewdog/reviewdog) in docs/REVIEW_TEAM.md
- [x] T007 [US1] Add Semgrep profile card using HTML table pattern (image left width="200", text right with name, role, 2-3 sentence description, GitHub link to https://github.com/semgrep/semgrep) in docs/REVIEW_TEAM.md

**Checkpoint**: All 5 team members visible with consistent card layout, images render at 200px width

---

## Phase 3: User Story 2 - Learn About Individual Team Members (Priority: P2)

**Goal**: Each profile explains the tool's specific role so developers understand what feedback to expect from each reviewer

**Independent Test**: Read each profile section and verify it explains the tool's purpose and contribution to code review

### Implementation for User Story 2

- [x] T008 [US2] Review and enhance Ollama profile description to clearly explain its role (local LLM inference for AI-powered analysis) in docs/REVIEW_TEAM.md
- [x] T009 [US2] Review and enhance OpenCode profile description to clearly explain its role (AI coding assistant for code generation and review) in docs/REVIEW_TEAM.md
- [x] T010 [US2] Review and enhance PR Agent profile description to clearly explain its role (automated PR review, suggestions, and improvements) in docs/REVIEW_TEAM.md
- [x] T011 [US2] Review and enhance Review Dog profile description to clearly explain its role (automated code review tool that posts linter results as PR comments) in docs/REVIEW_TEAM.md
- [x] T012 [US2] Review and enhance Semgrep profile description to clearly explain its role (static analysis for security vulnerabilities and code patterns) in docs/REVIEW_TEAM.md

**Checkpoint**: Each profile clearly explains what the tool does and why it's valuable

---

## Phase 4: Closing Summary Section

**Goal**: Explain why odd-ai-reviewers is useful given the combined team strengths

### Implementation

- [x] T013 Add "Why odd-ai-reviewers?" section using HTML table pattern with oddessentials1.png image (width="200") and summary text explaining combined value of all 5 tools in docs/REVIEW_TEAM.md
- [x] T014 Include link to odd-ai-reviewers repository (https://github.com/oddessentials/odd-ai-reviewers) in the summary section of docs/REVIEW_TEAM.md

**Checkpoint**: Summary section renders correctly with image and explains unified value

---

## Phase 5: Polish & Verification

**Purpose**: Validate all requirements and ensure proper rendering

- [x] T015 Verify all 7 images have descriptive alt text (banner + 5 team members + summary) in docs/REVIEW_TEAM.md
- [x] T016 Verify all 6 GitHub links are correct and clickable in docs/REVIEW_TEAM.md
- [ ] T017 Test page rendering on GitHub by viewing the file in the repository
- [ ] T018 Verify images display at consistent sizes without horizontal scrolling

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - creates the file
- **User Story 1 (Phase 2)**: Depends on Setup - adds team member cards
- **User Story 2 (Phase 3)**: Depends on US1 - enhances profile descriptions
- **Closing Summary (Phase 4)**: Depends on US1 - adds summary section after team members
- **Polish (Phase 5)**: Depends on all phases - validates complete document

### Task Dependencies Within Phases

- T001 must complete before any other tasks
- T002-T007 can be done sequentially (same file, building content)
- T008-T012 can be done sequentially (refining existing content)
- T013-T014 sequential (same section)
- T015-T018 can run after all content is complete

### Parallel Opportunities

- Limited parallelization since all tasks edit the same file
- However, profile content (descriptions) can be drafted in parallel before integration

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: User Story 1 (T002-T007)
3. **STOP and VALIDATE**: View on GitHub - all 5 team members visible with images
4. This delivers a functional review team page

### Full Implementation

1. Complete Phases 1-2 → MVP ready
2. Add Phase 3: User Story 2 → Enhanced descriptions
3. Add Phase 4: Closing Summary → Complete narrative
4. Complete Phase 5: Polish → Verified quality

---

## Notes

- All images already exist in `docs/img/` - no image creation needed
- Use HTML `<table>` pattern from quickstart.md for card layout
- Image widths: 200px for team members, 100% for banner
- Alt text should describe the superhero character and tool (e.g., "PR Agent superhero - a badger in a purple cape holding a laptop")
- Alphabetical order: Ollama, OpenCode, PR Agent, Review Dog, Semgrep
- Commit after each phase to enable incremental review
