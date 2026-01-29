# Implementation Plan: Azure DevOps Build Agent Permissions Documentation

**Branch**: `009-azure-devops-permissions-docs` | **Date**: 2026-01-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-azure-devops-permissions-docs/spec.md`

## Summary

Enhance the existing Azure DevOps documentation to comprehensively cover build agent permission requirements. The current `docs/platforms/azure-devops/setup.md` has basic permission guidance (Section 4) but lacks:

- Coverage of all four identity types (only Build Service documented)
- Concrete scope decision rules (project vs. repo level)
- Complete error code mapping
- Step-by-step verification checklist
- Branch policy clarification

This is a **documentation-only feature** requiring updates to existing markdown files with no code changes.

## Technical Context

**Language/Version**: Markdown (GitHub Flavored Markdown)
**Primary Dependencies**: N/A (documentation only)
**Storage**: N/A
**Testing**: Manual review; link validation
**Target Platform**: Documentation (rendered via docs viewer or GitHub)
**Project Type**: Documentation update
**Performance Goals**: N/A
**Constraints**: Must integrate with existing documentation structure
**Scale/Scope**: 2 files updated, potentially 1 new file

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Applicability                                                    | Status                                               |
| -------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| I. Router Owns All Posting       | N/A - docs only                                                  | ✅ Pass                                              |
| II. Structured Findings Contract | N/A - docs only                                                  | ✅ Pass                                              |
| III. Provider-Neutral Core       | N/A - docs only                                                  | ✅ Pass                                              |
| IV. Security-First Design        | **Applicable** - ensure docs don't expose bad security practices | ✅ Pass - docs guide secure permission configuration |
| V. Deterministic Outputs         | N/A - docs only                                                  | ✅ Pass                                              |
| VI. Bounded Resources            | N/A - docs only                                                  | ✅ Pass                                              |
| VII. Environment Discipline      | N/A - docs only                                                  | ✅ Pass                                              |
| VIII. Explicit Non-Goals         | N/A - docs only                                                  | ✅ Pass                                              |

**Gate Result**: ✅ PASSED - Documentation feature does not violate constitution principles.

## Project Structure

### Documentation (this feature)

```text
specs/009-azure-devops-permissions-docs/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output - ADO error codes & identity research
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Files (to be modified)

```text
docs/platforms/azure-devops/
├── setup.md             # PRIMARY: Expand Section 4 (permissions) and troubleshooting
└── [no new files needed - expand existing setup.md]

docs/
└── troubleshooting.md   # NEW: Cross-platform troubleshooting (mirror ADO permissions)
```

**Structure Decision**: Expand existing `docs/platforms/azure-devops/setup.md` rather than creating separate permission documentation. This keeps related content together and matches FR-010 (guaranteed discoverable location). Create `docs/troubleshooting.md` as a central troubleshooting hub that links to platform-specific sections.

## Documentation Changes Summary

### File: `docs/platforms/azure-devops/setup.md`

| Section                                     | Current State                                        | Required Changes                                                  |
| ------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------- |
| Section 4: Configure Repository Permissions | Basic - only "Contribute to pull requests" mentioned | Add "Contribute" permission, expand to cover all 4 identity types |
| NEW: Identity Decision Tree                 | Missing                                              | Add flowchart/decision tree for identifying correct identity      |
| NEW: Scope Decision Rule                    | Missing                                              | Add project vs. repo decision guidance with inheritance warning   |
| NEW: Verification Checklist                 | Missing                                              | Add step-by-step verification steps                               |
| Troubleshooting section                     | Partial - TF401027 only                              | Add TF401444, REST API errors, symptom-to-fix table               |
| NEW: What These Permissions Do NOT Enable   | Missing                                              | Add branch policy clarification                                   |
| NEW: Search Terms                           | Missing                                              | Add Ctrl+F keywords section                                       |

### File: `docs/troubleshooting.md` (NEW)

Central troubleshooting hub with links to platform-specific sections. Mirrors ADO permissions content for discoverability per FR-010.

## Complexity Tracking

No constitution violations to justify. Documentation feature is inherently low-complexity.

---

## Phase Status

| Phase             | Status      | Output                         |
| ----------------- | ----------- | ------------------------------ |
| Phase 0: Research | ✅ Complete | [research.md](research.md)     |
| Phase 1: Design   | ✅ Complete | [quickstart.md](quickstart.md) |
| Phase 2: Tasks    | ✅ Complete | [tasks.md](tasks.md)           |

## Generated Artifacts

- `research.md` - Comprehensive research on ADO identity types, error codes, permissions, and inheritance
- `quickstart.md` - Documentation structure and implementation guide
- `CLAUDE.md` - Agent context updated with feature technologies

## Next Steps

Run `/speckit.implement` to execute the task list.
