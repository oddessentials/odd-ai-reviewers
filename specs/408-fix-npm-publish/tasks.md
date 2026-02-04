# Tasks: Fix npm Release Authentication

**Input**: Design documents from `/specs/408-fix-npm-publish/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, quickstart.md

**Tests**: Not applicable - this is a CI configuration change. Testing is via workflow_dispatch dry_run.

**Organization**: Tasks are grouped by user story (P1 = token-only publish, P2 = provenance). P3 (HUSKY) is already implemented in current workflow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

## Path Conventions

Files to modify:

- `.github/workflows/release.yml`
- `.releaserc.json`

---

## Phase 1: Manual Prerequisites (User Action Required)

**Purpose**: Secret configuration that cannot be automated

**⚠️ CRITICAL**: These MUST be completed via GitHub UI before any code changes

- [ ] T001 Verify NPM_TOKEN exists in "release" environment (Settings → Environments → release → Environment secrets)
- [ ] T002 Delete NPM_TOKEN from repository secrets if present (Settings → Secrets and variables → Actions)

**Checkpoint**: NPM_TOKEN exists ONLY in "release" environment

---

## Phase 2: User Story 1 - Token-Only Publish (Priority: P1) 🎯 MVP

**Goal**: Fix npm publish authentication by properly wiring NODE_AUTH_TOKEN and removing provenance

**Independent Test**: Trigger workflow with `dry_run: true`, verify `npm whoami` and `npm config get registry` succeed

### Implementation for User Story 1

#### Part A: Workflow Changes (.github/workflows/release.yml)

- [ ] T003 [US1] Remove `id-token: write` from permissions block (line 29) in .github/workflows/release.yml
- [ ] T004 [US1] Add "Verify NPM_TOKEN is set" guard step after Build step in .github/workflows/release.yml
- [ ] T005 [US1] Add "Verify npm authentication" step with npm whoami and registry check in .github/workflows/release.yml
- [ ] T006 [US1] Add NODE_AUTH_TOKEN and NPM_CONFIG_REGISTRY to semantic-release step env in .github/workflows/release.yml

#### Part B: Semantic Release Config (.releaserc.json)

- [ ] T007 [P] [US1] Remove --provenance flag from publishCmd in .releaserc.json

**Checkpoint**: P1 code changes complete - ready for PR

---

## Phase 3: User Story 1 Verification (P1 Validation)

**Goal**: Prove P1 fix works before enabling provenance

**Independent Test**: Successful npm publish without E404

- [ ] T008 [US1] Create PR with P1 changes and merge to main
- [ ] T009 [US1] Trigger release workflow with dry_run=true and verify all checks pass
- [ ] T010 [US1] Trigger release workflow (real publish) and verify package publishes to npm

**Checkpoint**: P1 validated - package successfully published to npm without E404

---

## Phase 4: User Story 2 - Re-enable Provenance (Priority: P2)

**Goal**: Re-add provenance signing after P1 is confirmed working

**Depends on**: P1 must succeed (T010 complete) before starting P2

**Independent Test**: npm package shows provenance attestation after publish

### Implementation for User Story 2

- [ ] T011 [US2] Re-add `id-token: write` permission in .github/workflows/release.yml
- [ ] T012 [P] [US2] Re-add --provenance flag to publishCmd in .releaserc.json
- [ ] T013 [US2] Create PR with P2 changes and merge to main
- [ ] T014 [US2] Trigger release and verify provenance attestation appears on npmjs.com

**Checkpoint**: P2 validated - package publishes with provenance attestation

---

## Phase 5: Polish & Documentation

**Purpose**: Ensure permanent auth verification and documentation

- [ ] T015 Verify auth verification steps (npm whoami, npm config get registry) remain in workflow permanently
- [ ] T016 Update quickstart.md verification checklist with actual test results

---

## Dependencies & Execution Order

### Phase Dependencies

```
Phase 1 (Manual)
    ↓
Phase 2 (P1 Code Changes)
    ↓
Phase 3 (P1 Verification) ← STOP HERE if P1 fails
    ↓
Phase 4 (P2 Code Changes) ← Only if P1 succeeds
    ↓
Phase 5 (Polish)
```

### User Story Dependencies

- **User Story 1 (P1)**: No dependencies on other stories - can start after Phase 1 manual steps
- **User Story 2 (P2)**: **DEPENDS ON P1 SUCCESS** - Must not start until P1 is verified working (T010 complete)

### Task Dependencies Within P1

```
T003 → T004 → T005 → T006 (sequential within release.yml)
T007 can run in parallel with T003-T006 (different file)
T008 depends on T003-T007 (all code changes complete)
T009 depends on T008 (PR merged)
T010 depends on T009 (dry run verified)
```

### Parallel Opportunities

Within P1 implementation (Phase 2):

- T007 (.releaserc.json) can run in parallel with T003-T006 (.github/workflows/release.yml)

Within P2 implementation (Phase 4):

- T011 (release.yml) and T012 (.releaserc.json) can run in parallel

---

## Parallel Example: User Story 1 (P1)

```bash
# These can run in parallel (different files):
Task T003-T006: "Modify .github/workflows/release.yml"
Task T007: "Modify .releaserc.json"

# Then sequentially:
Task T008: "Create PR and merge"
Task T009: "Dry run verification"
Task T010: "Real publish verification"
```

---

## Implementation Strategy

### MVP First (P1 Only)

1. ✅ Complete Phase 1: Manual Prerequisites
2. ✅ Complete Phase 2: P1 Code Changes
3. ✅ Complete Phase 3: P1 Verification
4. **STOP**: If P1 succeeds, you have a working release pipeline
5. **OPTIONAL**: Continue to P2 for provenance

### Staged Rollout (Recommended)

1. P1 PR → merge → verify publish works
2. Wait for 1-2 successful releases with P1
3. P2 PR → merge → verify provenance works
4. Keep auth verification permanent

### Rollback Plan

If P1 still fails:

- Check `npm whoami` output in workflow logs
- Check `npm config get registry` output
- Verify NPM_TOKEN has correct permissions
- Error should be deterministic and point to single variable

---

## Notes

- **No code tests**: This is CI configuration; testing is via workflow execution
- **P2 is separate PR**: Do not bundle provenance with P1
- **Auth verification is permanent**: Keep npm whoami and npm config get registry until multiple green releases
- **Manual steps first**: T001-T002 must be done via GitHub UI before any code changes
- **Stop on failure**: If P1 verification fails, debug before attempting P2
