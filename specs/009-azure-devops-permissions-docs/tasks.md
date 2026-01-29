# Tasks: Azure DevOps Build Agent Permissions Documentation

**Input**: Design documents from `/specs/009-azure-devops-permissions-docs/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Type**: Documentation-only feature (no code changes)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Review existing documentation and prepare for updates

- [x] T001 Review current docs/platforms/azure-devops/setup.md structure and identify Section 4 location (~lines 60-78)
- [x] T002 Review research.md for content to incorporate (identity types, error codes, verification checklist)
- [x] T003 [P] Verify docs/troubleshooting.md does not exist (will create new)

---

## Phase 2: User Story 1 - DevOps Engineer Configuring Build Agent (Priority: P1) 🎯 MVP

**Goal**: A DevOps engineer can find and follow clear permission requirements to configure the build agent correctly on first attempt.

**Independent Test**: New user following documentation can configure permissions and successfully run a PR review that posts comments.

### Implementation for User Story 1

- [x] T004 [US1] In docs/platforms/azure-devops/setup.md Section 4, add both required permissions (FR-001, FR-002):
  - Add "Contribute - Allow" requirement
  - Add "Contribute to pull requests - Allow" requirement
  - Create permissions table with Permission Name and Purpose columns

- [x] T005 [US1] In docs/platforms/azure-devops/setup.md Section 4, add identity decision tree (FR-004, FR-004a):
  - Document all four identity types with name formats and examples
  - Add decision tree flowchart from research.md Section 7
  - Include "how to identify which applies to you" guidance

- [x] T006 [US1] In docs/platforms/azure-devops/setup.md Section 4, add step-by-step granting instructions (FR-003, FR-005):
  - Document navigation path: Project Settings → Repositories → Security
  - Add numbered steps for granting each permission
  - Include tips for finding Build Service identity

- [x] T007 [US1] In docs/platforms/azure-devops/setup.md Section 4, add verification checklist (FR-009):
  - 5-step checklist from research.md Section 6
  - Include status meanings (Allow, Not set, Inherited Deny)
  - Add effective permissions checking guidance

- [x] T008 [US1] In docs/platforms/azure-devops/setup.md Section 4, add scope decision guide (FR-007):
  - Decision rule: "multi-repo pipeline → project-level; single-repo → repo-level for least-privilege"
  - Add inheritance warning about project-level deny policies
  - Add note: "Organization-level security policies may override project/repo settings; contact your Azure DevOps admin if permissions appear correct but errors persist"
  - Add guidance for checking effective permissions

- [x] T009 [US1] In docs/platforms/azure-devops/setup.md Section 4, add branch policy clarification (FR-008):
  - Add NOTE callout: "These permissions enable PR thread/comment posting; they do NOT bypass branch policies..."
  - List what permissions do NOT enable (merge restrictions, required reviewers, etc.)

- [x] T010 [US1] In docs/platforms/azure-devops/setup.md, add Search Terms section (FR-011):
  - Add searchable keywords: "Contribute to pull requests", "Build Service", "Project Collection Build Service", "TF401027", "TF401444"

**Checkpoint**: User Story 1 complete - DevOps engineers can now configure permissions using the documentation

---

## Phase 3: User Story 2 - Developer Troubleshooting Permission Errors (Priority: P2)

**Goal**: A developer encountering permission errors can self-diagnose and resolve within 10 minutes.

**Independent Test**: Simulating a TF401027 error, user can find the troubleshooting section and identify the fix.

### Implementation for User Story 2

- [x] T011 [US2] In docs/platforms/azure-devops/setup.md Troubleshooting section, add error code reference table (FR-006):
  - TF401027 with message pattern and resolution
  - TF401444 with message pattern and resolution
  - 403 PullRequestThread errors with resolution
  - 401 general authorization errors with resolution
  - Git Repositories authorization errors with resolution

- [x] T012 [US2] In docs/platforms/azure-devops/setup.md Troubleshooting section, add detailed resolution steps for TF401027:
  - Expand existing content with step-by-step fix
  - Reference verification checklist from Section 4
  - Add common cause explanation

- [x] T013 [US2] In docs/platforms/azure-devops/setup.md Troubleshooting section, add TF401444 resolution:
  - Add new subsection for first-login-required error
  - Include PAT scope requirements
  - Add directory synchronization wait time guidance

- [x] T014 [US2] In docs/platforms/azure-devops/setup.md Troubleshooting section, add REST API error resolutions:
  - 403 Unauthorized for PullRequestThread
  - 401 general authorization
  - Include token format guidance (Bearer vs Basic)

**Checkpoint**: User Story 2 complete - Developers can troubleshoot permission errors independently

---

## Phase 4: User Story 3 - Repository Administrator Granting Permissions (Priority: P2)

**Goal**: A repository administrator can grant correct permissions without prior knowledge of the tool.

**Independent Test**: Admin following the guide can navigate to settings and grant both permissions correctly.

### Implementation for User Story 3

- [x] T015 [US3] Verify docs/platforms/azure-devops/setup.md Section 4 has admin-friendly navigation instructions:
  - Clear UI navigation path
  - Identity search guidance
  - Tips for multiple identity options

- [x] T016 [US3] Ensure scope guidance in setup.md addresses multi-repo scenarios (FR-007):
  - When to use project-level vs repository-level
  - Inheritance considerations
  - Cross-verify with Step 8 in verification checklist

**Checkpoint**: User Story 3 complete - Admins can grant permissions correctly

---

## Phase 5: Cross-Platform Troubleshooting Hub (FR-010)

**Purpose**: Create central troubleshooting location for discoverability

- [x] T017 Create docs/troubleshooting.md as central troubleshooting hub:
  - Add Azure DevOps section with links to setup.md troubleshooting
  - Add quick fix checklist (3 items)
  - Add placeholder for GitHub troubleshooting section
  - Add search terms for cross-platform discoverability

- [x] T018 [P] Verify internal anchor links work in docs/troubleshooting.md:
  - Test links to setup.md#troubleshooting sections
  - Verify cross-file references render correctly

---

## Phase 6: Validation & Polish

**Purpose**: Final verification against all functional requirements

- [ ] T019 Validate FR-001 through FR-011 compliance in docs/platforms/azure-devops/setup.md:
  - [ ] FR-001: "Contribute - Allow" clearly stated
  - [ ] FR-002: "Contribute to pull requests - Allow" clearly stated
  - [ ] FR-003: Navigation path documented
  - [ ] FR-004: All four identity types documented
  - [ ] FR-004a: Decision tree present
  - [ ] FR-005: Step-by-step instructions present
  - [ ] FR-006: Error mapping table complete
  - [ ] FR-007: Scope decision rule with inheritance warning
  - [ ] FR-008: Branch policy clarification statement
  - [ ] FR-009: Verification checklist with 5 steps
  - [ ] FR-010: Content in discoverable locations
  - [ ] FR-011: Search terms section present

- [ ] T020 [P] Proofread all documentation changes for clarity and consistency
- [ ] T021 [P] Verify markdown renders correctly in docs viewer

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - review existing state
- **Phase 2 (US1)**: Depends on Phase 1 - core permission documentation
- **Phase 3 (US2)**: Can run in parallel with Phase 2 - troubleshooting section
- **Phase 4 (US3)**: Depends on Phase 2 - verifies admin-focused content
- **Phase 5 (Hub)**: Depends on Phase 3 - creates links to troubleshooting
- **Phase 6 (Validation)**: Depends on all previous phases

### User Story Independence

- **User Story 1 (P1)**: Can be completed and validated independently (MVP)
- **User Story 2 (P2)**: Adds troubleshooting, builds on but doesn't require US1 changes
- **User Story 3 (P2)**: Verifies admin experience, minimal new content

### Parallel Opportunities

Within Phase 1:

- T001, T002, T003 can run in parallel

Within User Story 2:

- T011 creates table structure, then T012-T014 can run in parallel filling details

Within Phase 6:

- T020 and T021 can run in parallel

---

## Parallel Example: Phase 2 (User Story 1)

```text
# Sequential within US1 (building Section 4 content):
T004 → T005 → T006 → T007 → T008 → T009 → T010

# Rationale: Each task adds to Section 4, better to build sequentially
# for coherent section structure
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (review current state)
2. Complete Phase 2: User Story 1 (permission requirements)
3. **STOP and VALIDATE**: Test that a user can find and follow the documentation
4. Commit and consider deploying documentation update

### Incremental Delivery

1. Phase 1 + Phase 2 → MVP documentation (permission requirements)
2. Add Phase 3 (US2) → Enhanced troubleshooting
3. Add Phase 4 (US3) → Admin verification
4. Add Phase 5 → Cross-platform hub
5. Add Phase 6 → Full validation

### Single Contributor Strategy

Recommended order for one person:

1. T001-T003 (Setup)
2. T004-T010 (US1 - Section 4 expansion)
3. T011-T014 (US2 - Troubleshooting expansion)
4. T015-T016 (US3 - Admin verification)
5. T017-T018 (Hub creation)
6. T019-T021 (Validation)

---

## Summary

| Metric                     | Count              |
| -------------------------- | ------------------ |
| **Total Tasks**            | 21                 |
| **User Story 1 Tasks**     | 7                  |
| **User Story 2 Tasks**     | 4                  |
| **User Story 3 Tasks**     | 2                  |
| **Cross-cutting Tasks**    | 8                  |
| **Parallel Opportunities** | 5 tasks marked [P] |

### Files Modified

| File                                   | Action                               |
| -------------------------------------- | ------------------------------------ |
| `docs/platforms/azure-devops/setup.md` | Expand Section 4 and Troubleshooting |
| `docs/troubleshooting.md`              | Create new (cross-platform hub)      |

### MVP Scope

User Story 1 only (T001-T010): Complete permission requirements documentation that allows a DevOps engineer to configure build agent permissions correctly on first attempt.

---

## Notes

- This is a documentation-only feature - no code changes
- All content derived from research.md findings
- FR-001 through FR-011 must all be satisfied
- Test by having someone unfamiliar with ADO follow the documentation
- Commit after completing each user story phase
