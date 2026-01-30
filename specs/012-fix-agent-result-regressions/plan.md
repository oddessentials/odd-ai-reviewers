# Implementation Plan: Fix Agent Result Union Regressions

**Branch**: `012-fix-agent-result-regressions` | **Date**: 2026-01-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-fix-agent-result-regressions/spec.md`

## Summary

Fix three regressions introduced by the AgentResult discriminated union migration (011):

1. **Partial findings dropped**: Failed agents' `partialFindings` are silently dropped from reports
2. **Legacy cache crashes**: Old cache entries (with `success: boolean`, no `status`) trigger `assertNever` runtime failure
3. **BrandHelpers.is validation gap**: `.is()` ignores `additionalValidation`, allowing unsafe inputs to pass

Technical approach: Maintain separate `completeFindings` and `partialFindings` collections end-to-end; add schema validation to cache retrieval with `CACHE_SCHEMA_VERSION` constant; implement `.is()` as `isOk(parse(x))` for definitional consistency.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.x (schema validation), Vitest 4.x (testing)
**Storage**: File-based cache in `.ai-review-cache` directory; JSONL format with TTL
**Testing**: Vitest with coverage thresholds (statements=60%, branches=55%, functions=63%, lines=61%)
**Target Platform**: Node.js ≥22.0.0, Linux CI runners (GitHub Actions, Azure Pipelines)
**Project Type**: Single monorepo with `router/` package
**Performance Goals**: N/A (bug fix, no performance regression expected)
**Constraints**: Must be backwards compatible with existing tests (equivalent outcomes); no changes to agent interfaces
**Scale/Scope**: 7 source files affected (types.ts, execute.ts, store.ts, key.ts, report.ts, formats.ts, branded.ts); ~12 new tests

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                                                        |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | No changes to posting; router still sole poster                                              |
| II. Structured Findings Contract | ✅ Pass | Adding optional `provenance` field (backward-compatible; defaults to 'complete' when absent) |
| III. Provider-Neutral Core       | ✅ Pass | No provider-specific changes                                                                 |
| IV. Security-First Design        | ✅ Pass | BrandHelpers.is fix improves security                                                        |
| V. Deterministic Outputs         | ✅ Pass | Deduplication rules are deterministic                                                        |
| VI. Bounded Resources            | ✅ Pass | No resource limit changes                                                                    |
| VII. Environment Discipline      | ✅ Pass | No environment changes                                                                       |
| VIII. Explicit Non-Goals         | ✅ Pass | Changes stay within project scope                                                            |

**Quality Gates**:

- Zero-tolerance lint: Will run `--max-warnings 0`
- Dependency architecture: No new circular dependencies
- Local = CI parity: Pre-commit hooks will validate changes

## Project Structure

### Documentation (this feature)

```text
specs/012-fix-agent-result-regressions/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no new APIs)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/src/
├── agents/
│   └── types.ts          # AgentResult types, Finding type (add provenance)
├── cache/
│   ├── store.ts          # Cache storage (add schema validation)
│   └── key.ts            # Cache key generation (add CACHE_SCHEMA_VERSION)
├── phases/
│   ├── execute.ts        # Agent execution (separate partialFindings collection)
│   └── report.ts         # Reporting (render partialFindings section)
├── report/
│   └── formats.ts        # Summary generation (add partial findings section)
└── types/
    └── branded.ts        # BrandHelpers (fix .is() implementation)

router/src/__tests__/
├── agents/
│   └── types.test.ts     # AgentResult tests (add provenance tests)
├── cache/
│   └── store.test.ts     # Cache tests (add legacy entry handling)
├── phases/
│   └── execute.test.ts   # Execute tests (partialFindings collection)
└── types/
    └── branded.test.ts   # BrandHelpers tests (property-based .is() test)
```

**Structure Decision**: Single project structure (router package). Changes are localized to existing files; no new modules required.

## Complexity Tracking

> No constitution violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| N/A       | N/A        | N/A                                  |
