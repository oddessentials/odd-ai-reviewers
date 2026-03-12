# Implementation Plan: False Positive Gap Closure

**Branch**: `411-fp-gap-closure` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/411-fp-gap-closure/spec.md`

## Summary

Close remaining false-positive gaps from v1.8.0 (issues #158-161, #164) across three workstreams: (1) fix destructuring assignment taint tracking bypass in the control-flow vulnerability detector, (2) add deterministic framework pattern filter and prompt active directives for Patterns B/C/D, (3) harden self-contradiction filter against Unicode bypass, detect template literal taint mixing, and enforce benchmark as CI release gate. The approach extends existing AST-based taint tracking with new destructuring binding extraction, adds a closed matcher table for framework conventions, and integrates recorded LLM response snapshots for deterministic benchmark execution.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: TypeScript compiler API (AST parsing), Zod 4.3.6 (schema validation), Commander 14.x (CLI), Vitest 4.0.18 (testing)
**Storage**: N/A (stateless per run; file-based benchmark fixtures and snapshots)
**Testing**: Vitest 4.x with coverage thresholds (CI: 65% statements, 60% branches, 68% functions, 66% lines)
**Target Platform**: Node.js ≥22.0.0 (Linux CI via GitHub Actions, Windows/macOS development)
**Project Type**: CLI tool / library (AI code review system)
**Performance Goals**: Benchmark suite completes in <10 minutes CI; individual scenario timeout 15s
**Constraints**: Zero test regressions (3887+ existing tests), conservative taint analysis (when in doubt = tainted), closed matcher table (3 matchers only)
**Scale/Scope**: 53→62+ benchmark scenarios, 3 workstreams, ~20 files modified

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Assessment                                                                                                                                             |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | ✅ PASS | Framework filter and validation changes are in router's report pipeline. No agent-level posting.                                                       |
| II. Structured Findings Contract | ✅ PASS | No changes to Finding interface. New filter operates on existing Finding fields.                                                                       |
| III. Provider-Neutral Core       | ✅ PASS | All changes in core modules (vulnerability-detector, finding-validator, report). No provider-specific logic.                                           |
| IV. Security-First               | ✅ PASS | Conservative taint analysis (destructuring defaults to tainted). Unicode normalization closes bypass. Template literals treated as tainted when mixed. |
| V. Deterministic Outputs         | ✅ PASS | Framework filter uses closed matcher table (no heuristics). Recorded snapshots enable deterministic CI. Unicode normalization is deterministic.        |
| VI. Bounded Resources            | ✅ PASS | Destructuring recursion depth limited to 10. Benchmark timeouts enforced (15s/scenario, 10min total).                                                  |
| VII. Environment Discipline      | ✅ PASS | Benchmark CI job uses pinned ubuntu-latest with pnpm lockfile. No dynamic toolchain installation.                                                      |
| VIII. Explicit Non-Goals         | ✅ PASS | Scope boundaries defined: no sanitizer taint-breaking, no object literal Pattern 1, no cross-module analysis.                                          |

**Post-Design Re-check**: All gates pass. No violations.

## Project Structure

### Documentation (this feature)

```text
specs/411-fp-gap-closure/
├── spec.md              # Feature specification (6 user stories, 21 FRs, 10 SCs)
├── plan.md              # This file
├── research.md          # Phase 0 output (7 research decisions)
├── data-model.md        # Phase 1 output (5 entities)
├── quickstart.md        # Phase 1 output (setup + verification commands)
├── contracts/           # Phase 1 output (3 interface contracts)
│   ├── destructuring-taint.ts
│   ├── framework-pattern-filter.ts
│   └── benchmark-snapshot.ts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
router/
├── src/
│   ├── agents/
│   │   └── control_flow/
│   │       ├── vulnerability-detector.ts   # [MODIFY] trackTaint(), findTaintInExpression()
│   │       ├── scope-stack.ts              # [MODIFY] add extractBindingsFromAssignmentTarget()
│   │       └── safe-source-detector.ts     # [MODIFY] extend collectMutatedBindings()
│   ├── report/
│   │   ├── finding-validator.ts            # [MODIFY] normalizeUnicode(), Stage 1 integration
│   │   └── framework-pattern-filter.ts     # [NEW] FR-013 closed matcher table
│   ├── phases/
│   │   └── report.ts                       # [MODIFY] insert framework filter call
│   └── benchmark/
│       └── adapter.ts                      # [MODIFY] add SnapshotAdapter mode
├── tests/
│   ├── unit/
│   │   ├── agents/control_flow/
│   │   │   ├── scope-stack.test.ts         # [MODIFY] add assignment target tests
│   │   │   └── safe-source-detector.test.ts # [MODIFY] add destructuring mutation tests
│   │   └── report/
│   │       ├── finding-validator.test.ts   # [MODIFY] add Unicode normalization tests
│   │       └── framework-pattern-filter.test.ts # [NEW] matcher table tests
│   ├── integration/
│   │   └── false-positive-benchmark.test.ts # [MODIFY] expand fixtures, snapshot mode
│   └── fixtures/
│       └── benchmark/
│           ├── regression-suite.json        # [MODIFY] add 9+ new scenarios
│           └── snapshots/                   # [NEW] recorded LLM response snapshots
├── config/
│   └── prompts/
│       ├── semantic_review.md               # [MODIFY] add Active Context Directives
│       ├── opencode_system.md               # [MODIFY] add Active Context Directives
│       └── pr_agent_review.md               # [MODIFY] add Active Context Directives
└── .github/
    └── workflows/
        └── ci.yml                           # [MODIFY] add benchmark-regression job

```

**Structure Decision**: Single project structure (existing). No new directories created except `router/tests/fixtures/benchmark/snapshots/` for recorded responses. One new source file (`framework-pattern-filter.ts`), one new test file (`framework-pattern-filter.test.ts`). All other changes are modifications to existing files.

## Complexity Tracking

No constitution violations to justify.
