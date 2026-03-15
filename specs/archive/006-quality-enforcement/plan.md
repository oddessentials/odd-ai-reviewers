# Implementation Plan: Quality Enforcement

**Branch**: `006-quality-enforcement` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-quality-enforcement/spec.md`

## Summary

Implement comprehensive quality enforcement infrastructure including: CI-enforced test coverage thresholds with automatic badge updates, auto-formatting on commit via enhanced pre-commit hooks, documentation link integrity validation, ReDoS threat model documentation, pattern validator test corpus, and structured security logging. The implementation builds on existing Husky/lint-staged/Vitest infrastructure.

## Technical Context

**Language/Version**: TypeScript 5.9.x (ESM), Node.js >=22.0.0
**Primary Dependencies**: Vitest 4.x (testing), Husky 9.x (hooks), lint-staged (staged file processing), Prettier 3.x (formatting), ESLint 9.x (linting)
**Storage**: N/A (ephemeral, file-based configuration only)
**Testing**: Vitest with V8 coverage provider
**Target Platform**: Linux (CI), Windows/macOS/Linux (local development)
**Project Type**: Monorepo (npm workspaces) with `router` as primary workspace
**Performance Goals**: Pre-commit hooks complete in <5s for typical changesets
**Constraints**: CI parity with local hooks; no network access during tests
**Scale/Scope**: Single repository, ~40 test files, ~70% baseline coverage

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                            |
| -------------------------------- | ------ | ------------------------------------------------ |
| I. Router Owns All Posting       | N/A    | Feature does not involve PR posting              |
| II. Structured Findings Contract | PASS   | SecurityEvent schema follows structured pattern  |
| III. Provider-Neutral Core       | PASS   | Quality gates are provider-agnostic              |
| IV. Security-First Design        | PASS   | Pattern hashing, no raw patterns in logs         |
| V. Deterministic Outputs         | PASS   | Vendored corpus, no network at test time         |
| VI. Bounded Resources            | PASS   | Coverage thresholds are hard limits              |
| VII. Environment Discipline      | PASS   | Uses existing pinned toolchain                   |
| VIII. Explicit Non-Goals         | PASS   | Does not expand scope beyond quality enforcement |

**Quality Gates Alignment:**

| Gate                       | Status  | Implementation                           |
| -------------------------- | ------- | ---------------------------------------- |
| Zero-Tolerance Lint Policy | ALIGNED | FR-006 enforces via pre-commit           |
| Security Linting           | ALIGNED | Existing ESLint security rules preserved |
| Dependency Architecture    | ALIGNED | No new circular dependencies             |
| Local = CI Parity          | ALIGNED | FR-009 explicitly requires parity        |

**Verdict**: All gates pass. No complexity justification required.

## Project Structure

### Documentation (this feature)

```text
specs/006-quality-enforcement/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── security-event.ts
│   ├── coverage-config.ts
│   └── linkcheck-allowlist.ts
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
router/
├── src/
│   ├── security-logger.ts       # NEW: Security event aggregation (FR-024)
│   └── __tests__/
│       └── security-logger.test.ts
├── vitest.config.ts             # MODIFY: Add CI/local threshold split (FR-002, FR-005)
└── tests/
    └── fixtures/
        └── redos-corpus/
            └── v1.json          # NEW: Vendored ReDoS patterns (FR-018)

# Root-level configuration
.husky/
├── pre-commit                   # MODIFY: Add formatting (FR-006)
└── pre-push                     # EXISTS: depcruise

.linkcheckignore.yml             # NEW: External link allowlist (FR-013)

.github/workflows/
├── ci.yml                       # MODIFY: Add link-check, coverage enforcement
└── badge-update.yml             # NEW: Post-merge badge workflow (FR-030)

docs/
├── security/
│   └── regex-threat-model.md    # NEW: Trust boundary documentation (FR-014-016)
└── reference/
    └── review-team.md           # MODIFY: Fix broken image links (FR-010)
```

**Structure Decision**: Single monorepo structure preserved. New files integrate into existing layout. Security logger module follows existing module pattern in `router/src/`.

## Complexity Tracking

> No constitution violations. Table omitted.
