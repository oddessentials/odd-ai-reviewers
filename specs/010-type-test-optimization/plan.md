# Implementation Plan: Type and Test Optimization

**Branch**: `010-type-test-optimization` | **Date**: 2026-01-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-type-test-optimization/spec.md`

## Summary

Refactor the odd-ai-reviewers codebase to improve type safety, test coverage, and enterprise-grade code quality. Primary deliverables: (1) custom error types with canonical wire format, (2) branded types for validated data with explicit serialization helpers, (3) Result<T,E> pattern for internal operations, (4) entry point and integration tests, (5) assertNever utility for exhaustive switch statements, (6) CI enforcement for toolchain versions.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.3.6 (schema validation), Commander 14.x (CLI), Anthropic SDK 0.71.2, OpenAI 6.17.0, Octokit 22.0.1
**Storage**: File-based cache (cache/store.ts), ephemeral per-run
**Testing**: Vitest 4.0.18 with v8 coverage provider
**Target Platform**: Node.js >=22.0.0, Linux CI (pnpm@10.28.2)
**Project Type**: Single monorepo with router/ package
**Performance Goals**: Current tests pass, CI gates enforced (65% statements, 60% branches, 68% functions, 66% lines)
**Constraints**: Backward compatibility required for all public APIs; module-by-module migration; hermetic tests only
**Scale/Scope**: 58 existing test files, 16+ error handling locations to consolidate, 33.74% current coverage → 45% target

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                       |
| -------------------------------- | ------- | ----------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | No changes to posting logic; type-only refactoring          |
| II. Structured Findings Contract | ✅ Pass | Finding interface enhanced with stricter types, not changed |
| III. Provider-Neutral Core       | ✅ Pass | No provider-specific changes                                |
| IV. Security-First Design        | ✅ Pass | SafeGitRef branded type strengthens security validation     |
| V. Deterministic Outputs         | ✅ Pass | No changes to output generation; type constraints only      |
| VI. Bounded Resources            | ✅ Pass | Budget types enhanced, limits unchanged                     |
| VII. Environment Discipline      | ✅ Pass | CI toolchain version check added (strengthens discipline)   |
| VIII. Explicit Non-Goals         | ✅ Pass | Pure internal refactoring, no scope expansion               |

**Quality Gates Check**:

- Zero-Tolerance Lint: ✅ Maintained (no new warnings introduced)
- Security Linting: ✅ Maintained (no disabled rules)
- Dependency Architecture: ✅ Maintained (no new circular deps)
- Local = CI Parity: ✅ Strengthened (toolchain version enforcement)

## Project Structure

### Documentation (this feature)

```text
specs/010-type-test-optimization/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (type definitions)
├── quickstart.md        # Phase 1 output (developer guide)
├── contracts/           # Phase 1 output (type contracts)
│   ├── errors.ts        # Custom error type contracts
│   ├── result.ts        # Result<T,E> type contract
│   └── branded.ts       # Branded type helpers contract
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Phase 2 output (task breakdown)
```

### Source Code (repository root)

```text
router/src/
├── types/                     # NEW: Shared type utilities
│   ├── errors.ts              # Custom error classes (FR-001, FR-002)
│   ├── result.ts              # Result<T,E> discriminated union (FR-006)
│   ├── branded.ts             # Brand utilities (FR-003, FR-004, FR-005)
│   ├── assert-never.ts        # Exhaustive switch utility (FR-007, FR-021)
│   └── index.ts               # Type re-exports
├── agents/
│   ├── types.ts               # MODIFY: AgentResult discriminated union (FR-007)
│   └── ...                    # Other agents unchanged
├── config/
│   ├── schemas.ts             # MODIFY: Ensure z.infer<> patterns (FR-010)
│   └── ...
├── main.ts                    # MODIFY: Extract run(argv, env) (FR-011)
├── config.ts                  # MODIFY: Add tests (FR-012)
├── budget.ts                  # MODIFY: Add tests (FR-013)
├── diff.ts                    # Reference: existing CanonicalDiffFile pattern
├── git-validators.ts          # MODIFY: Return SafeGitRef branded type (FR-004)
└── __tests__/
    ├── types/                 # NEW: Type utility tests
    │   ├── errors.test.ts     # Error round-trip tests
    │   ├── result.test.ts     # Result pattern tests
    │   └── branded.test.ts    # Branded type tests
    ├── main.test.ts           # NEW: Entry point tests (FR-011)
    ├── config-coverage.test.ts # NEW: Config validation tests (FR-012)
    ├── budget-coverage.test.ts # NEW: Budget enforcement tests (FR-013)
    └── integration/
        ├── router.test.ts     # EXISTING: 1 integration test
        ├── pipeline.test.ts   # NEW: Full pipeline tests (FR-014)
        ├── agent-failure.test.ts # NEW: Agent failure tests (FR-015)
        ├── cache.test.ts      # NEW: Cache behavior tests (FR-016)
        └── multi-reporter.test.ts # NEW: Multi-reporter tests (FR-017)
```

**Structure Decision**: Single router/ package structure maintained. New `types/` directory added for shared type utilities. Integration tests expanded in existing `__tests__/integration/` directory.

## Complexity Tracking

> No violations requiring justification. All changes align with constitution principles.

| Aspect                     | Decision | Rationale                                             |
| -------------------------- | -------- | ----------------------------------------------------- |
| New `types/` directory     | Accepted | Consolidates shared utilities, prevents circular deps |
| Module-by-module migration | Required | Per clarification, avoids big-bang refactoring risk   |
| Throwing wrappers          | Required | Per clarification, maintains backward compatibility   |

## Constitution Check (Post-Design)

_Re-evaluation after Phase 1 design completion._

| Principle                        | Status  | Notes                                                        |
| -------------------------------- | ------- | ------------------------------------------------------------ |
| I. Router Owns All Posting       | ✅ Pass | Error types internal; no changes to posting flow             |
| II. Structured Findings Contract | ✅ Pass | Finding schema unchanged; AgentResult enhanced               |
| III. Provider-Neutral Core       | ✅ Pass | Type contracts are provider-agnostic                         |
| IV. Security-First Design        | ✅ Pass | SafeGitRef/CanonicalPath branded types strengthen validation |
| V. Deterministic Outputs         | ✅ Pass | ErrorWireFormat ensures consistent serialization             |
| VI. Bounded Resources            | ✅ Pass | No changes to limits; type-only enhancements                 |
| VII. Environment Discipline      | ✅ Pass | CI toolchain check enforces pinned versions                  |
| VIII. Explicit Non-Goals         | ✅ Pass | All changes are internal refactoring                         |

**Post-Design Quality Gates**:

- Zero-Tolerance Lint: ✅ Contracts pass lint
- Security Linting: ✅ No security rule disables
- Dependency Architecture: ✅ `types/` has no circular deps (leaf module)
- Local = CI Parity: ✅ Toolchain version check added

## Generated Artifacts

| Artifact         | Path                   | Status      |
| ---------------- | ---------------------- | ----------- |
| Research         | `research.md`          | ✅ Complete |
| Data Model       | `data-model.md`        | ✅ Complete |
| Quickstart       | `quickstart.md`        | ✅ Complete |
| Error Contract   | `contracts/errors.ts`  | ✅ Complete |
| Result Contract  | `contracts/result.ts`  | ✅ Complete |
| Branded Contract | `contracts/branded.ts` | ✅ Complete |

## Next Steps

Run `/speckit.tasks` to generate the implementation task breakdown.
