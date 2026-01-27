# Implementation Plan: .reviewignore Documentation Improvements

**Branch**: `001-reviewignore-docs` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-reviewignore-docs/spec.md`

## Summary

Improve `.reviewignore` documentation by adding a Pattern Normalization section explaining how patterns are transformed internally, expanding bare segment matching explanations with what matches/doesn't match, adding negation examples, and consolidating filter precedence information to reduce redundancy across documentation files.

## Technical Context

**Language/Version**: Markdown documentation (no code changes)
**Primary Dependencies**: N/A (documentation only)
**Storage**: N/A
**Testing**: Manual verification that documentation accurately reflects implementation
**Target Platform**: GitHub Pages, GitHub markdown rendering, local markdown viewers
**Project Type**: Documentation enhancement
**Performance Goals**: N/A
**Constraints**: Documentation must accurately reflect implementation in `router/src/reviewignore.ts`
**Scale/Scope**: 4 documentation files to update, 2 source files with optional comment updates

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Applicable | Status | Notes                     |
| -------------------------------- | ---------- | ------ | ------------------------- |
| I. Router Owns All Posting       | No         | N/A    | Documentation-only change |
| II. Structured Findings Contract | No         | N/A    | Documentation-only change |
| III. Provider-Neutral Core       | No         | N/A    | Documentation-only change |
| IV. Security-First Design        | No         | N/A    | Documentation-only change |
| V. Deterministic Outputs         | No         | N/A    | Documentation-only change |
| VI. Bounded Resources            | No         | N/A    | Documentation-only change |
| VII. Environment Discipline      | No         | N/A    | Documentation-only change |
| VIII. Explicit Non-Goals         | No         | N/A    | Documentation-only change |

**Quality Gates**:

- Zero-Tolerance Lint: N/A (no code)
- Security Linting: N/A (no code)
- Dependency Architecture: N/A (no code)
- Local = CI Parity: Markdown formatting will be checked by lint-staged if configured

**Verification Requirements**:

- PR Merge Criteria #5: "Documentation current" — This IS the documentation update

**Gate Status**: ✅ PASSED — Documentation-only feature does not violate any constitution principles.

## Project Structure

### Documentation (this feature)

```text
specs/001-reviewignore-docs/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Implementation analysis (below)
├── quickstart.md        # Verification guide
└── checklists/
    └── requirements.md  # Specification quality checklist
```

### Files to Modify

```text
docs/
├── config-schema.md     # PRIMARY: Add Pattern Normalization section, expand bare segment docs
└── ARCHITECTURE.md      # Replace filter precedence table with cross-reference

README.md                # Add link to ARCHITECTURE.md for filter details

router/src/              # OPTIONAL: Update comments to reference docs
├── main.ts              # Consider removing redundant precedence comment
└── diff.ts              # Consider removing redundant precedence comment
```

**Structure Decision**: Documentation-only feature modifying existing files. No new directories or code files created.

## Complexity Tracking

> No constitution violations to justify — documentation-only feature.

| Item                  | Status                    |
| --------------------- | ------------------------- |
| New abstractions      | None                      |
| New dependencies      | None                      |
| New files             | None (only modifications) |
| Cross-cutting changes | 4 documentation files     |
