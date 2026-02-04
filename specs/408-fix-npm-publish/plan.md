# Implementation Plan: Fix npm Release Authentication

**Branch**: `408-fix-npm-publish` | **Date**: 2026-02-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/408-fix-npm-publish/spec.md`

## Summary

Fix the E404 npm publish failure by properly wiring npm authentication. The root cause is that `NODE_AUTH_TOKEN` is not set in the semantic-release step, causing pnpm to run unauthenticated. npm returns E404 (masking 403) for scoped packages when authentication fails.

**P1 Approach**: Token-only publish (no provenance) to isolate authentication as the single variable.
**P2 Approach**: Re-enable provenance after P1 succeeds.

## Technical Context

**Language/Version**: GitHub Actions YAML, Bash
**Primary Dependencies**: semantic-release, @semantic-release/exec, pnpm
**Storage**: N/A (CI workflow configuration only)
**Testing**: Manual trigger via workflow_dispatch with dry_run option
**Target Platform**: GitHub Actions (ubuntu-latest)
**Project Type**: CI/CD configuration change
**Performance Goals**: N/A
**Constraints**: Must not break existing release automation; changes must be backward-compatible
**Scale/Scope**: Single workflow file + single config file

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Research Check (Phase 0)

| Principle                        | Status   | Notes                                                           |
| -------------------------------- | -------- | --------------------------------------------------------------- |
| I. Router Owns All Posting       | N/A      | No PR posting involved                                          |
| II. Structured Findings Contract | N/A      | No agent findings                                               |
| III. Provider-Neutral Core       | N/A      | CI config only                                                  |
| IV. Security-First Design        | **PASS** | NPM_TOKEN only in protected environment; no new secret exposure |
| V. Deterministic Outputs         | **PASS** | Workflow produces deterministic publish                         |
| VI. Bounded Resources            | **PASS** | No unbounded operations                                         |
| VII. Environment Discipline      | **PASS** | Using pinned Node.js, frozen lockfile                           |
| VIII. Explicit Non-Goals         | **PASS** | Not becoming CI runner                                          |

**GATE STATUS**: ✅ PASS

### Post-Design Check (Phase 1)

| Principle                   | Status   | Notes                                                                                          |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| IV. Security-First Design   | **PASS** | Design enforces: token only in environment, explicit auth verification, no new secret exposure |
| V. Deterministic Outputs    | **PASS** | Auth verification provides deterministic failure on misconfig                                  |
| VII. Environment Discipline | **PASS** | No new runtime installers; using existing pinned toolchain                                     |

**GATE STATUS**: ✅ PASS - No violations introduced by design

**Quality Gates**:

- Zero-Tolerance Lint Policy: N/A (YAML config)
- Security Linting: N/A
- Dependency Architecture: N/A
- Local = CI Parity: N/A (CI-only change)

**Verification Requirements**:

- PR Merge Criteria: Manual verification of successful npm publish
- Release Criteria: npm registry shows new version with expected metadata

## Project Structure

### Documentation (this feature)

```text
specs/408-fix-npm-publish/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # N/A (no data model)
├── quickstart.md        # Phase 1 output
├── contracts/           # N/A (no API contracts)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (files to modify)

```text
.github/workflows/
└── release.yml          # P1: Add auth verification, NODE_AUTH_TOKEN, remove provenance
                         # P2: Re-add --provenance (separate PR after P1 succeeds)

.releaserc.json          # P1: Remove --provenance from publishCmd
                         # P2: Re-add --provenance (separate PR)
```

**Structure Decision**: Minimal CI configuration change. Only two files affected.

## Complexity Tracking

No constitution violations to justify.

## File Changes Summary

### P1 Changes (Token-Only Publish)

#### `.github/workflows/release.yml`

1. **Remove `id-token: write`** from permissions (line 29)
2. **Add empty token guard step** before semantic-release
3. **Add auth verification step** (`npm whoami`, `npm config get registry`)
4. **Add `NODE_AUTH_TOKEN`** to semantic-release step env
5. **Add `NPM_CONFIG_REGISTRY`** to semantic-release step env

#### `.releaserc.json`

1. **Remove `--provenance`** from publishCmd (line 53)

### P2 Changes (Re-enable Provenance) - Separate PR after P1 succeeds

#### `.github/workflows/release.yml`

1. Re-add `id-token: write` permission
2. Keep all P1 auth verification (permanent)

#### `.releaserc.json`

1. Re-add `--provenance` to publishCmd

## Manual Action Required

**CRITICAL**: Before merging P1, the user must:

1. **Delete NPM_TOKEN from repository secrets** (if present)
2. **Verify NPM_TOKEN exists in "release" environment** only

This cannot be automated and must be done via GitHub Settings UI.
