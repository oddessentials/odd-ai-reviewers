# Quickstart: Close All 12 Unsuppressed FP Benchmark Scenarios

**Feature Branch**: `415-close-fp-benchmark-gaps`

## Prerequisites

- Node.js >= 22.0.0
- pnpm 10.28.2
- API key for snapshot recording: `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`

## Setup

```bash
git checkout 415-close-fp-benchmark-gaps
pnpm install
pnpm build
```

## Development Workflow

### 1. Run existing tests (baseline)

```bash
# All tests (4,095+)
pnpm test

# Benchmark suite only (replay mode, no API key needed)
pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts

# Framework pattern filter tests
pnpm --filter ./router exec vitest run tests/unit/report/framework-pattern-filter.test.ts

# Finding validator tests
pnpm --filter ./router exec vitest run tests/unit/report/finding-validator.test.ts
```

### 2. Edit prompt conventions

```bash
# Edit shared conventions
# File: config/prompts/_shared_conventions.md
# Add new rules after line 43, before Active Context Directives

# Sync to all prompt files
pnpm prompts:sync

# Verify sync
pnpm prompts:check
```

### 3. Add new matchers

```bash
# Edit: router/src/report/framework-pattern-filter.ts
# Add T025, T026 to FRAMEWORK_MATCHERS array (after line 260)
# Widen T019 messagePattern

# Run matcher tests
pnpm --filter ./router exec vitest run tests/unit/report/framework-pattern-filter.test.ts
```

### 4. Update fixtures

```bash
# Edit: router/tests/fixtures/benchmark/regression-suite.json
# - fp-c-005: Add prDescription field
# - fp-d-006: Set truePositive: true, add expectedFindings
# - fp-f-005: Update diff to include catch block
```

### 5. Record snapshots

```bash
# Record all snapshots (requires API key)
cross-env RECORD=true pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts

# Or use the convenience script
pnpm benchmark:record
```

### 6. Verify

```bash
# Run full benchmark (replay mode, no API key)
pnpm --filter ./router exec vitest run tests/integration/false-positive-benchmark.test.ts

# Run all tests
pnpm test

# Run CI quality gates locally
pnpm lint
pnpm typecheck
pnpm --filter ./router exec vitest run --coverage
```

## Key Files

| File                                                        | Purpose                                  |
| ----------------------------------------------------------- | ---------------------------------------- |
| `config/prompts/_shared_conventions.md`                     | Prompt conventions (8 new rules)         |
| `router/src/report/framework-pattern-filter.ts`             | Matcher table (T025, T026, T019 widened) |
| `router/src/report/finding-validator.ts`                    | DISMISSIVE_PATTERNS (4 new)              |
| `router/src/cli/commands/local-review.ts`                   | CLI post-processing pipeline             |
| `router/src/benchmark/adapter.ts`                           | Two-part drift gate                      |
| `router/tests/fixtures/benchmark/regression-suite.json`     | Fixture fixes                            |
| `router/tests/fixtures/benchmark/snapshots/`                | Recorded snapshots                       |
| `router/tests/integration/false-positive-benchmark.test.ts` | Per-scenario gates                       |
| `.github/workflows/ci.yml`                                  | Benchmark-check thresholds               |

## Verification Checklist

- [ ] `pnpm prompts:check` passes (conventions synced)
- [ ] `pnpm lint` passes (zero warnings)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all 4,095+ tests)
- [ ] Benchmark FP suppression: each of 11 targeted scenarios = 0 findings
- [ ] Benchmark TP recall: 100%
- [ ] Benchmark TP precision: >= 70%
- [ ] Benchmark runnable ratio: 100%
- [ ] Coverage thresholds met (statements 65%, branches 60%, functions 68%, lines 66%)
- [ ] No snapshot drift (prompt hash + fixture hash match)
