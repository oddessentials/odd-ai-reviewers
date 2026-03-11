# Implementation Plan: False Positive Deep Fixes & Benchmark Integration

**Branch**: `410-false-positive-deep-fixes` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/410-false-positive-deep-fixes/spec.md`

## Summary

Systematically reduce false positives in AI code review findings by implementing five complementary improvement layers: (1) safe-source taint recognition in the control-flow vulnerability detector, (2) agent context enrichment with PR description and project rules, (3) post-processing validation to filter self-contradicting findings, (4) framework convention rules in LLM agent prompts, and (5) a benchmark harness with 43-fixture regression suite for objective quality measurement. Addresses 43 documented false positives from GitHub issues #158-161, building on the completed 409 prompt hardening foundation.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules), Node.js >=22.0.0
**Primary Dependencies**: TypeScript compiler API (AST parsing), Zod 4.x (schema validation), Commander 14.x (CLI), Octokit 22.x (GitHub API), OpenAI SDK 6.x, Anthropic SDK 0.71.x
**Storage**: N/A (stateless per run; file-based cache exists but not modified)
**Testing**: Vitest 4.x (unit + integration), existing control_flow-benchmark.test.ts pattern
**Target Platform**: Linux CI runners (GitHub Actions, Azure Pipelines), local development (Windows/macOS/Linux)
**Project Type**: CLI tool + library (AI code review router)
**Performance Goals**: Context enrichment adds <5% overhead to median review time (SC-006)
**Constraints**: Max 12K tokens default per PR (configurable), ephemeral workspace, no persistent state between runs
**Scale/Scope**: 43 false-positive regression fixtures, 7 registered agents, 4 prompt files, ~20 modified/new source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Router Owns All Posting | PASS | Post-processing validation runs in router before posting; agents remain read-only |
| II. Structured Findings Contract | PASS | No changes to Finding schema; new fields added to AgentContext only |
| III. Provider-Neutral Core | PASS | Context enrichment is provider-agnostic; PR description fetching isolated in provider modules |
| IV. Security-First Design | PASS | New context fields (prDescription, projectRules) treated as untrusted input; sanitized before use |
| V. Deterministic Outputs | PASS | Safe-source recognition is deterministic (AST-based); post-processing filters are deterministic (regex + line validation) |
| VI. Bounded Resources | PASS | FR-010 enforces truncation when context exceeds 90% capacity; projectRules truncated first |
| VII. Environment Discipline | PASS | No new runtime dependencies; no curl/bash installers; benchmark runs in existing Vitest framework |
| VIII. Explicit Non-Goals | PASS | No new servers, daemons, or CI orchestration; benchmark is a CLI command + test suite |

**Gate result: PASS** — All 8 principles satisfied. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/410-false-positive-deep-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── safe-source-patterns.md
│   ├── finding-validation.md
│   └── benchmark-scenario.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
router/src/
├── agents/
│   ├── types.ts                              # AgentContext enrichment (FR-006/007/008)
│   ├── opencode.ts                           # PR description + project rules in user prompt
│   ├── ai_semantic_review.ts                 # PR description + project rules in user prompt
│   ├── pr_agent.ts                           # PR description + project rules in user prompt
│   └── control_flow/
│       ├── vulnerability-detector.ts         # Safe-source recognition (FR-001/002/003/004)
│       ├── safe-source-patterns.ts           # NEW: Declarative safe-source pattern definitions
│       ├── safe-source-detector.ts           # NEW: Safe-source AST detection logic
│       └── finding-generator.ts              # Severity adjustment (existing, no FR-005 changes)
├── report/
│   ├── finding-validator.ts                  # NEW: Post-processing validation (FR-011/012/013/014)
│   └── line-resolver.ts                      # Existing — reused for line validation
├── cli/commands/
│   └── local-review.ts                       # Context assembly enrichment
├── main.ts                                   # Context assembly + post-processing integration
├── context-loader.ts                         # NEW: Load PR description + project rules
└── trust.ts                                  # PullRequestContext enrichment (title/body)

config/prompts/
├── semantic_review.md                        # Framework conventions section (FR-015/016)
├── opencode_system.md                        # Framework conventions section (FR-015/016)
├── pr_agent_review.md                        # Framework conventions section (FR-015/016)
└── architecture_review.md                    # Framework conventions section (if agent exists)

router/tests/
├── unit/
│   ├── agents/control_flow/
│   │   ├── safe-source-detector.test.ts      # NEW: Safe-source pattern tests
│   │   └── fixtures/
│   │       └── safe-source-inputs.ts         # NEW: Safe-source test fixtures
│   └── report/
│       └── finding-validator.test.ts         # NEW: Post-processing validation tests
├── integration/
│   └── false-positive-benchmark.test.ts      # NEW: 53+-fixture regression suite (FR-019/020)
└── fixtures/
    └── benchmark/                            # NEW: Shared benchmark utilities
        ├── regression-suite.json              # Consolidated fixture file (43 FP + 10+ TP = 53+ scenarios)
        ├── scoring.ts                         # Dual-pool precision/recall/F1/FPR calculation (FR-018)
        └── adapter.ts                         # Benchmark adapter (FR-017)
```

**Structure Decision**: Single project structure — all changes are within the existing `router/` monolith. New files follow existing patterns (e.g., `safe-source-patterns.ts` mirrors `mitigation-patterns.ts`, `finding-validator.ts` mirrors `sanitize.ts`). Benchmark fixtures consolidated in a single `regression-suite.json` with 43 FP-regression scenarios (patterns A-E + F) and 10+ TP-preservation scenarios (2+ per vulnerability family). Dual-pool scoring computes FP suppression rate and TP recall/precision separately.

## Complexity Tracking

> No constitution violations to justify. All changes stay within existing architecture.
