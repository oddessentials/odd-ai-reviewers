# Implementation Plan: Repository Health & Maintainability Overhaul

**Branch**: `416-repo-health-overhaul` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/416-repo-health-overhaul/spec.md`

## Summary

This feature overhauls the repository's developer experience and maintainability posture through 11 coordinated changes: consolidating 79 fragmented test files into a single canonical directory, restructuring git hooks to eliminate redundancy and cut pre-push time from 6-8 minutes to under 4 minutes, creating `.reviewignore` for AI review exclusions, cleaning up `.gitignore` tracking hygiene, archiving 20 completed spec directories, hardening badge automation, and adding a pre-commit secret guard. All changes maintain full constitution compliance with one documented adjustment.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Vitest 4.0.18 (testing), Husky 9.x (hooks), lint-staged 16.x, Prettier 3.x, ESLint 9.x, dependency-cruiser
**Storage**: N/A (file-based configuration only)
**Testing**: Vitest 4.x with v8 coverage provider; CI thresholds (65/60/68/66), local thresholds (60/55/63/61)
**Target Platform**: Node.js >=22.0.0 (Linux CI, Windows/macOS local dev)
**Project Type**: CLI tool + GitHub Actions / Azure DevOps pipeline integration
**Performance Goals**: Pre-commit <30 seconds, pre-push <4 minutes
**Constraints**: Windows NTFS compatibility for all local hooks; constitution compliance for quality gates
**Scale/Scope**: 101 source files, 147 test files (4,291 tests), 7 CI workflows, 249 spec files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Principle Compliance

| Principle                        | Status | Notes                                                                                                              |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | N/A    | Feature does not modify posting behavior                                                                           |
| II. Structured Findings Contract | N/A    | Feature does not modify findings schema                                                                            |
| III. Provider-Neutral Core       | N/A    | Feature is infrastructure/tooling, not provider-specific                                                           |
| IV. Security-First Design        | PASS   | Pre-commit secret guard strengthens security posture; .gitignore cleanup reduces exposure                          |
| V. Deterministic Outputs         | N/A    | Feature does not modify review outputs                                                                             |
| VI. Bounded Resources            | N/A    | Feature does not modify resource bounds                                                                            |
| VII. Environment Discipline      | PASS   | .nvmrc (major version pin) supports reproducible environments; hook restructuring maintains CI-authoritative model |
| VIII. Explicit Non-Goals         | PASS   | Feature stays within scope — no CI orchestration, no secret management changes                                     |

### Quality Gate Compliance

| Gate                    | Status                 | Notes                                                                                          |
| ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| Zero-Tolerance Lint     | PASS                   | Pre-commit retains `lint-staged` with ESLint `--max-warnings 0`; CI retains full-codebase lint |
| Security Linting        | PASS                   | No changes to ESLint security rules                                                            |
| Dependency Architecture | PASS                   | `depcruise` retained in pre-push (constitution-required)                                       |
| Local = CI Parity       | PASS (with adjustment) | See Complexity Tracking below                                                                  |

### Verification Requirements

| Requirement               | Impact                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------- |
| PR Merge Criteria         | No impact — all CI checks remain; local hooks simplified but CI still runs full suite |
| Release Criteria          | No impact — vulnerability scanning, pinned deps, contract tests unchanged             |
| Invariant Change Criteria | Not triggered — no invariants are modified                                            |

**Pre-check result: PASS** — All gates satisfied. One documented adjustment below.

## Project Structure

### Documentation (this feature)

```text
specs/416-repo-health-overhaul/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── hook-tiers.md    # Hook tier contract
└── checklists/
    └── requirements.md  # Quality checklist
```

### Source Code (repository root)

```text
# Files created
.reviewignore                           # AI review exclusion patterns
.nvmrc                                  # Node.js major version pin

# Files modified
.gitignore                              # Add .specify/ subdirectory exclusions
.husky/pre-commit                       # Add secret guard check
.husky/pre-push                         # Remove redundant checks (eslint, prettier, tsc, linkcheck)
router/vitest.config.ts                 # Simplify include/exclude after test migration
CLAUDE.md                               # Fix header accuracy
.github/workflows/badge-update.yml      # Add artifact validation step

# Files moved (79 test files)
router/src/__tests__/*.test.ts    →     router/tests/unit/{domain}/*.test.ts

# Directories moved (20 completed specs)
specs/001-*                       →     specs/archive/001-*
specs/004-* through 009-*         →     specs/archive/004-* through 009-*
specs/010-* through 012-*         →     specs/archive/010-* through 012-*
specs/405-*, 406-*                →     specs/archive/405-*, 406-*

# Files untracked (git rm --cached)
.specify/features/**
.specify/templates/**
.specify/scripts/**
```

**Structure Decision**: Single-project monorepo structure preserved. No new directories created except `specs/archive/` (subdirectory of existing `specs/`). Test migration consolidates into existing `router/tests/unit/` hierarchy.

## Complexity Tracking

| Adjustment                                                          | Why Needed                                                                                                                                                                                                                                            | Constitution Reference                                                                                                           |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Remove `tsc`, `eslint`, `prettier` from pre-push                    | These 3 checks already run in pre-commit (lint-staged + tsc). Running them twice adds 3+ minutes to pre-push with zero additional safety. Constitution requires lint-staged + typecheck in pre-commit, and depcruise in pre-push — both are retained. | Quality Gates: "Local = CI Parity" — Pre-commit still runs lint-staged + tsc; pre-push still runs depcruise. CI runs full suite. |
| Move `docs:linkcheck` and `spec:linkcheck` from pre-push to CI-only | Linkcheck validates external URLs (network-dependent, slow, flaky on poor connections). Not required by constitution in any hook. CI runs these reliably in controlled environment.                                                                   | Quality Gates: Not mentioned in hook requirements. Only depcruise is explicitly required in pre-push.                            |

## Post-Design Constitution Re-Check

_Re-evaluated after Phase 1 design completion._

### Design Artifacts vs Constitution

| Artifact                                       | Principle Check                  | Result                                                                                                                            |
| ---------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hook tier contract (`contracts/hook-tiers.md`) | Quality Gates: Local = CI Parity | PASS — Pre-commit retains lint-staged + tsc (mandated). Pre-push retains depcruise (mandated). CI remains authoritative superset. |
| Test migration (data-model.md)                 | V. Deterministic Outputs         | N/A — Test reorganization does not affect review output determinism.                                                              |
| .reviewignore contract                         | II. Structured Findings          | N/A — Exclusion patterns affect which files are reviewed, not finding structure.                                                  |
| Secret guard (pre-commit)                      | IV. Security-First Design        | PASS — Adds defense-in-depth for secret exposure prevention.                                                                      |
| .specify/ compromise                           | VIII. Scope Boundaries           | PASS — Governance document stays tracked; generated data excluded.                                                                |
| Spec archival                                  | N/A                              | No constitution principle applies to spec storage location.                                                                       |
| Badge hardening                                | VII. Environment Discipline      | PASS — Adds validation for CI artifact reliability.                                                                               |

**Post-design result: PASS** — No new constitution violations introduced by design artifacts. All adjustments documented in Complexity Tracking above.

## Generated Artifacts

| Artifact            | Path                                                        | Status                 |
| ------------------- | ----------------------------------------------------------- | ---------------------- |
| Implementation Plan | `specs/416-repo-health-overhaul/plan.md`                    | Complete               |
| Research            | `specs/416-repo-health-overhaul/research.md`                | Complete (8 decisions) |
| Data Model          | `specs/416-repo-health-overhaul/data-model.md`              | Complete (4 entities)  |
| Hook Tier Contract  | `specs/416-repo-health-overhaul/contracts/hook-tiers.md`    | Complete               |
| Quickstart          | `specs/416-repo-health-overhaul/quickstart.md`              | Complete (5 phases)    |
| Quality Checklist   | `specs/416-repo-health-overhaul/checklists/requirements.md` | Complete (16/16 pass)  |
