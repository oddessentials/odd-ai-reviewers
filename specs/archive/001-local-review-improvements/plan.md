# Implementation Plan: Local Review Improvements

**Branch**: `001-local-review-improvements` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-local-review-improvements/spec.md`

## Summary

This feature improves the local review CLI command through seven interconnected changes:

1. **CLI Alias**: Add `local-review` as a true Commander.js alias for `local` command
2. **Range Parsing**: Implement explicit operator scan (`...` first, then `..`) with deterministic multiple-operator rejection
3. **Error Classification**: Separate "malformed range" (validation) from "ref not found" (git) errors
4. **Diff-Mode Invariant**: Enforce `ResolvedDiffMode` computation with programmer error for missing `rangeSpec`
5. **API Consolidation**: Remove/deprecate `resolveBaseRef` in favor of `resolveDiffRange`
6. **Test Reliability**: Centralized `makeTempRepo()` helper with guaranteed cleanup
7. **Documentation**: Document `..` vs `...` operators in CLI help and README

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Commander.js 14.x (CLI), Zod 4.x (validation), Node.js ≥22.0.0
**Storage**: N/A (stateless CLI)
**Testing**: Vitest 4.x with dependency injection pattern
**Target Platform**: Node.js CLI (Linux primary, Windows/macOS secondary)
**Project Type**: Single CLI application (router package)
**Performance Goals**: N/A (not performance-sensitive)
**Constraints**: Must maintain backward compatibility with existing `local` command
**Scale/Scope**: ~500 LOC changes across 8-10 files, 15+ new tests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                          |
| -------------------------------- | ------- | ---------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | No posting changes—local review output only    |
| II. Structured Findings Contract | ✅ Pass | No changes to finding schema                   |
| III. Provider-Neutral Core       | ✅ Pass | CLI improvements are provider-agnostic         |
| IV. Security-First Design        | ✅ Pass | Input validation strengthened (range parsing)  |
| V. Deterministic Outputs         | ✅ Pass | Error messages made consistent and predictable |
| VI. Bounded Resources            | ✅ Pass | No new resource consumption                    |
| VII. Environment Discipline      | ✅ Pass | No new runtime dependencies                    |
| VIII. Explicit Non-Goals         | ✅ Pass | Stays within CLI scope                         |

**Quality Gates:**

- Zero-Tolerance Lint: Tests will use `--max-warnings 0`
- Security Linting: No new child_process or eval usage
- Dependency Architecture: No new circular dependencies introduced
- Local = CI Parity: Pre-commit hooks enforced

## Project Structure

### Documentation (this feature)

```text
specs/001-local-review-improvements/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (types/interfaces)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API contracts)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
router/
├── src/
│   ├── main.ts                          # CLI entry (add alias)
│   ├── diff.ts                          # getLocalDiff (add invariant check)
│   ├── cli/
│   │   ├── commands/
│   │   │   └── local-review.ts          # Local review command
│   │   ├── options/
│   │   │   ├── local-review-options.ts  # Range parsing improvements
│   │   │   └── index.ts                 # Export surface (remove resolveBaseRef)
│   │   └── git-context.ts               # Git context inference
│   └── types/
│       ├── errors.ts                    # Error types (add range validation errors)
│       └── result.ts                    # Result type utilities
├── tests/
│   ├── unit/
│   │   ├── cli/
│   │   │   ├── commands/
│   │   │   │   └── local-review.test.ts # CLI integration tests
│   │   │   └── options/
│   │   │       └── local-review-options.test.ts # Range parsing tests
│   │   ├── local-diff.test.ts           # Diff invariant tests
│   │   └── config.test.ts               # Config error tests
│   ├── integration/
│   │   └── local-review-cli.test.ts     # CLI end-to-end tests (new)
│   └── helpers/
│       └── temp-repo.ts                 # makeTempRepo() helper (new)
└── docs/
    └── local-review.md                  # Range operator documentation (update)
```

**Structure Decision**: Single project structure—this is a CLI application within the `router/` package. All changes are contained within existing directories.

## Complexity Tracking

No constitution violations to justify.

---

## Post-Design Constitution Re-Check

_Completed after Phase 1 design artifacts generated._

| Principle                        | Status  | Post-Design Notes                                              |
| -------------------------------- | ------- | -------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | Confirmed: No posting code modified                            |
| II. Structured Findings Contract | ✅ Pass | Confirmed: Finding schema unchanged                            |
| III. Provider-Neutral Core       | ✅ Pass | Confirmed: All changes are provider-agnostic                   |
| IV. Security-First Design        | ✅ Pass | Strengthened: Better input validation, clear error classes     |
| V. Deterministic Outputs         | ✅ Pass | Improved: Consistent error messages, invariant enforcement     |
| VI. Bounded Resources            | ✅ Pass | Confirmed: No new resource consumption                         |
| VII. Environment Discipline      | ✅ Pass | Confirmed: No new deps, test helper uses standard Node.js APIs |
| VIII. Explicit Non-Goals         | ✅ Pass | Confirmed: Stays within CLI scope                              |

**All constitution gates pass. Ready for task generation.**

---

## Generated Artifacts

| Artifact            | Path                  | Status                    |
| ------------------- | --------------------- | ------------------------- |
| Specification       | `spec.md`             | ✅ Complete               |
| Implementation Plan | `plan.md`             | ✅ Complete               |
| Research            | `research.md`         | ✅ Complete               |
| Data Model          | `data-model.md`       | ✅ Complete               |
| Quickstart          | `quickstart.md`       | ✅ Complete               |
| Contracts           | `contracts/README.md` | ✅ Complete (N/A for CLI) |
| Tasks               | `tasks.md`            | ✅ Complete               |

---

## Next Steps

Run `/speckit.implement` to begin task execution.
