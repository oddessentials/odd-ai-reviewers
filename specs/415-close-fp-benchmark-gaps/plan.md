# Implementation Plan: Close All 12 Unsuppressed FP Benchmark Scenarios

**Branch**: `415-close-fp-benchmark-gaps` | **Date**: 2026-03-13 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/415-close-fp-benchmark-gaps/spec.md`

## Summary

Close 12 unsuppressed false-positive benchmark scenarios (Issue #168) by: adding 8 prompt conventions to `_shared_conventions.md`, adding 2 new deterministic matchers (T025, T026) and widening T019 in `framework-pattern-filter.ts`, strengthening the self-contradiction filter in `finding-validator.ts`, fixing 3 fixtures, reclassifying fp-d-006 as TP, closing the CLI post-processing gap in `local-review.ts`, and recording all missing snapshots. The benchmark suite reaches 100% runnable with per-scenario gates enforcing zero surviving FPs.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.3.6 (validation), Commander 14.x (CLI), Vitest 4.0.18 (testing), Anthropic SDK 0.71.2, OpenAI SDK 6.27.0, Octokit 22.x
**Storage**: File-based (benchmark fixtures as JSON in `router/tests/fixtures/benchmark/`, snapshots as JSON with SHA-256 hash validation)
**Testing**: Vitest 4.0.18 — unit tests in `router/tests/unit/`, integration in `router/tests/integration/`, CI thresholds: statements 65%, branches 60%, functions 68%, lines 66%
**Target Platform**: Node.js >=22.0.0; CI on Linux (GitHub Actions), local dev on Windows/macOS/Linux
**Project Type**: CLI tool + GitHub/ADO CI integration (monorepo with `router/` workspace)
**Performance Goals**: Benchmark-regression CI job completes within 15-minute timeout; snapshot replay adds <1s per scenario
**Constraints**: No live API calls in CI merge gate; prompt hash + fixture hash must match committed snapshots; all 4,095+ existing tests must pass
**Scale/Scope**: 66 benchmark scenarios (36 FP + 19 TP after reclassification + 11 deterministic), 7 source files in prompt hash, 324-line matcher table expanding to ~500 lines

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                            | Status | Evidence                                                                                                                                                                                                               |
| ------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **I. Router Owns All Posting**       | PASS   | This spec adds post-processing filters — no new posting paths. Matchers suppress findings before the router posts.                                                                                                     |
| **II. Structured Findings Contract** | PASS   | All findings follow the canonical Finding schema. New matchers consume findings and return filtered arrays. No schema changes.                                                                                         |
| **III. Provider-Neutral Core**       | PASS   | New matchers operate on diff text only (provider-agnostic). CLI parity extends the same pipeline to a third entry point. Prompt conventions are provider-neutral instructions.                                         |
| **IV. Security-First Design**        | PASS   | Severity gates preserved (info-only for self-contradiction). Defense-in-depth pattern (message + evidence + safety constraint). PR descriptions/function names explicitly excluded from security suppression evidence. |
| **V. Deterministic Outputs**         | PASS   | All new matchers are deterministic (regex + evidence validation on diff text). Snapshot replay is deterministic. Per-scenario gates enforce stable results.                                                            |
| **VI. Bounded Resources**            | PASS   | No new resource consumption — matchers filter findings, don't generate them. Snapshot replay adds negligible overhead.                                                                                                 |
| **VII. Environment Discipline**      | PASS   | CI is replay-only (no API keys, no network). Local recording uses existing toolchain (`pnpm benchmark:record`). No new dependencies.                                                                                   |
| **VIII. Explicit Non-Goals**         | PASS   | No CI runner, no secret management, no daemon, no fork PR changes. Purely post-processing pipeline enhancement.                                                                                                        |

**Result**: All 8 gates PASS. No violations to justify. Proceeding to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/415-close-fp-benchmark-gaps/
├── spec.md              # Feature specification (v3, 20 critiques addressed)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (internal contracts)
├── checklists/
│   └── requirements.md  # Specification quality checklist (v3)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
config/prompts/
├── _shared_conventions.md              # +8 new rules (FR-001 through FR-008)
├── semantic_review.md                  # Updated via sync
├── opencode_system.md                  # Updated via sync
├── pr_agent_review.md                  # Updated via sync
└── architecture_review.md              # Updated via sync

router/src/
├── report/
│   ├── framework-pattern-filter.ts     # +T025, +T026, widen T019 (FR-011, FR-012, FR-014)
│   ├── finding-validator.ts            # +4 DISMISSIVE_PATTERNS, +doc comment (FR-016)
│   └── sanitize.ts                     # (no changes expected)
├── benchmark/
│   ├── adapter.ts                      # Two-part drift gate, freshness (FR-022)
│   └── scoring.ts                      # (no changes expected)
├── cli/commands/
│   └── local-review.ts                 # +4 post-processing stages (FR-018)
└── prompts/
    └── shared-conventions.generated.ts # Regenerated via sync

router/tests/
├── fixtures/benchmark/
│   ├── regression-suite.json           # Fix fp-c-005, fp-f-005, fp-d-006 (FR-017, FR-017a, FR-017b)
│   └── snapshots/
│       ├── fp-b-001.snapshot.json      # New (recorded)
│       ├── fp-b-003.snapshot.json      # New (recorded)
│       ├── fp-b-006.snapshot.json      # New (recorded)
│       ├── fp-b-007.snapshot.json      # New (recorded)
│       ├── fp-c-005.snapshot.json      # New (recorded)
│       ├── fp-c-006.snapshot.json      # New (recorded)
│       ├── fp-f-005.snapshot.json      # New (recorded)
│       ├── fp-f-007.snapshot.json      # New (recorded)
│       ├── fp-f-010.snapshot.json      # New (recorded)
│       ├── fp-f-014.snapshot.json      # New (recorded)
│       ├── fp-f-015.snapshot.json      # New (recorded)
│       └── ... (25 existing, re-recorded due to prompt hash change)
├── integration/
│   └── false-positive-benchmark.test.ts # Per-scenario gates, two-part drift (SC-001, SC-004)
└── unit/report/
    ├── framework-pattern-filter.test.ts # +T025/T026 unit tests (FR-024), +T019 widened (FR-025)
    ├── finding-validator.test.ts         # +DISMISSIVE_PATTERNS tests (FR-026)
    └── local-review-pipeline.test.ts     # New: CLI pipeline integration (FR-027)

.github/workflows/
└── ci.yml                              # Update benchmark-check thresholds (FR-019)

scripts/
└── benchmark-check.ts                  # Update mock results + thresholds (FR-019)
```

**Structure Decision**: Single workspace (`router/`) with existing directory structure. No new directories created — all changes fit existing patterns. New test file `local-review-pipeline.test.ts` follows the `router/tests/unit/report/` convention.

## Complexity Tracking

No constitution violations to justify. All changes fit within existing architectural patterns.
