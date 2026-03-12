# Quickstart: False Positive Gap Closure

**Branch**: `411-fp-gap-closure` | **Date**: 2026-03-12

## Prerequisites

- Node.js ≥22.0.0
- pnpm 10.28.2+
- TypeScript 5.9.3 (installed via pnpm)

## Setup

```bash
git checkout 411-fp-gap-closure
pnpm install
pnpm --filter ./router build
```

## Run Tests

```bash
# Full test suite (3887+ tests)
pnpm --filter ./router test

# Control flow unit tests (most relevant for Workstream 1)
pnpm --filter ./router vitest run tests/unit/agents/control_flow/

# Safe source detector tests
pnpm --filter ./router vitest run tests/unit/agents/control_flow/safe-source-detector.test.ts

# Finding validator tests (Workstreams 2 & 3)
pnpm --filter ./router vitest run tests/unit/report/finding-validator.test.ts

# Benchmark integration tests
pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts

# Watch mode for development
pnpm --filter ./router vitest tests/unit/agents/control_flow/
```

## Key Files by Workstream

### Workstream 1: Destructuring Taint Tracking

| File                                                                 | Purpose                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `router/src/agents/control_flow/vulnerability-detector.ts`           | `trackTaint()` — extend BinaryExpression handling (line ~685) |
| `router/src/agents/control_flow/scope-stack.ts`                      | Add `extractBindingsFromAssignmentTarget()`                   |
| `router/src/agents/control_flow/safe-source-detector.ts`             | Extend `collectMutatedBindings()` (line ~413)                 |
| `router/tests/unit/agents/control_flow/scope-stack.test.ts`          | Existing destructuring tests (line ~418)                      |
| `router/tests/unit/agents/control_flow/safe-source-detector.test.ts` | Mutation tracking tests                                       |

### Workstream 2: Prompt & Deterministic Filter Hardening

| File                                            | Purpose                             |
| ----------------------------------------------- | ----------------------------------- |
| `router/src/report/framework-pattern-filter.ts` | NEW — FR-013 closed matcher table   |
| `router/src/phases/report.ts`                   | Insert framework filter at line ~82 |
| `config/prompts/semantic_review.md`             | Add Active Context Directives       |
| `config/prompts/opencode_system.md`             | Add Active Context Directives       |
| `config/prompts/pr_agent_review.md`             | Add Active Context Directives       |
| `router/src/agents/opencode.ts`                 | Update hardcoded fallback prompt    |
| `router/src/agents/ai_semantic_review.ts`       | Update hardcoded fallback prompt    |
| `router/src/agents/pr_agent.ts`                 | Update hardcoded fallback prompt    |

### Workstream 3: Security Hardening & Benchmark CI

| File                                                        | Purpose                                             |
| ----------------------------------------------------------- | --------------------------------------------------- |
| `router/src/report/finding-validator.ts`                    | Add `normalizeUnicode()` before DISMISSIVE_PATTERNS |
| `router/src/agents/control_flow/vulnerability-detector.ts`  | Template literal taint in `findTaintInExpression()` |
| `.github/workflows/ci.yml`                                  | Add `benchmark-regression` job                      |
| `router/tests/integration/false-positive-benchmark.test.ts` | Expand fixtures, add snapshot mode                  |
| `router/tests/fixtures/benchmark/regression-suite.json`     | Add destructuring + TP fixtures                     |
| `router/src/benchmark/adapter.ts`                           | Add SnapshotAdapter mode                            |

## Verification Commands

```bash
# SC-008: Zero test regressions
pnpm --filter ./router test

# SC-001: FP suppression rate
pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts -t "SC-001"

# SC-002: TP recall
pnpm --filter ./router vitest run tests/integration/false-positive-benchmark.test.ts -t "SC-002"

# Type checking
pnpm --filter ./router typecheck

# Linting
pnpm --filter ./router lint
```
