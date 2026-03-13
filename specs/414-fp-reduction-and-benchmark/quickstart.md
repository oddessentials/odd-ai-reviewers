# Quickstart: 414-fp-reduction-and-benchmark

## Prerequisites

- Node.js >=22.0.0
- pnpm 10.x
- Docker Desktop (optional, for benchmark runs)

## Setup

```bash
git checkout 414-fp-reduction-and-benchmark
pnpm install
pnpm build
```

## Run Tests

```bash
# Full test suite (baseline: 4,068 tests, ~14s)
pnpm test

# Framework pattern filter tests only
pnpm vitest router/tests/unit/report/framework-pattern-filter.test.ts

# False-positive benchmark tests only
pnpm vitest router/tests/integration/false-positive-benchmark.test.ts

# Finding validator tests only
pnpm vitest router/tests/unit/report/finding-validator.test.ts
```

## Run Internal Benchmark CLI

```bash
# Run FP regression benchmark
node router/dist/main.js benchmark \
  --fixtures router/tests/fixtures/benchmark/regression-suite.json \
  --verbose
```

## Run External Benchmark (Local)

```bash
# 1. Build the tool
pnpm build

# 2. Run adapter against golden comments
npx tsx scripts/benchmark-adapter.ts \
  --golden-dir /tmp/benchmark/offline/golden_comments \
  --output /tmp/benchmark/offline/results/odd-ai-reviewers/candidates.json

# 3. Check regression thresholds
npx tsx scripts/benchmark-check.ts \
  --results /tmp/benchmark/offline/results/odd-ai-reviewers/ \
  --min-precision 0.40 --min-recall 0.30 --min-f1 0.35
```

## Run External Benchmark (Docker)

```bash
# Requires: ANTHROPIC_API_KEY, GH_TOKEN, MARTIAN_API_KEY set in environment
docker compose -f docker-compose.benchmark.yml up --build
```

## Verify Changes

After implementation, verify:

1. `pnpm test` — all 4,068+ tests pass
2. `pnpm build` — no TypeScript errors
3. Framework filter test — T022 and T023 matchers work
4. Internal benchmark — ≥90% FP suppression, 100% TP recall
5. Prompt conventions 7-12 present in all 4 prompt files
