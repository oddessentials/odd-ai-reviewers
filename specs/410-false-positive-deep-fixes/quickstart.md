# Quickstart: False Positive Deep Fixes & Benchmark Integration

**Branch**: `410-false-positive-deep-fixes` | **Date**: 2026-03-11

## Prerequisites

- Node.js >= 22.0.0
- pnpm (installed via corepack)
- Repository cloned and on `410-false-positive-deep-fixes` branch

## Build & Test

```bash
cd router
pnpm install
pnpm build          # tsc compile
pnpm test           # vitest run (all tests)
pnpm typecheck      # tsc --noEmit
```

## Development Workflow

### Layer 1: Safe-Source Recognition (User Story 1)

Files to modify:
- `router/src/agents/control_flow/safe-source-patterns.ts` (NEW)
- `router/src/agents/control_flow/safe-source-detector.ts` (NEW)
- `router/src/agents/control_flow/vulnerability-detector.ts` (integrate safe-source filter between findSources and trackTaint)

Test:
```bash
cd router && pnpm vitest run tests/unit/agents/control_flow/safe-source-detector.test.ts
```

### Layer 2: Context Enrichment (User Story 2)

Files to modify:
- `router/src/agents/types.ts` (extend AgentContext)
- `router/src/context-loader.ts` (NEW)
- `router/src/main.ts` (context assembly)
- `router/src/trust.ts` (PullRequestContext title/body)
- `router/src/agents/opencode.ts` (inject context into user prompt)
- `router/src/agents/ai_semantic_review.ts` (inject context into user prompt)
- `router/src/agents/pr_agent.ts` (inject context into user prompt)

Test:
```bash
cd router && pnpm vitest run tests/unit/context-loader.test.ts
```

### Layer 3: Post-Processing Validation (User Story 3)

Files to modify:
- `router/src/report/finding-validator.ts` (NEW)
- `router/src/phases/report.ts` (integrate validation step)

Test:
```bash
cd router && pnpm vitest run tests/unit/report/finding-validator.test.ts
```

### Layer 4: Framework Convention Prompts (User Story 4)

Files to modify:
- `config/prompts/semantic_review.md`
- `config/prompts/opencode_system.md`
- `config/prompts/pr_agent_review.md`
- `router/src/agents/opencode.ts` (update hardcoded fallback)
- `router/src/agents/ai_semantic_review.ts` (update hardcoded fallback)
- `router/src/agents/pr_agent.ts` (update hardcoded fallback)

Test:
```bash
cd router && pnpm vitest run tests/unit/agents/prompt-sync.test.ts
```

### Layer 5: Benchmark Harness (User Story 5)

Files to create:
- `router/tests/integration/false-positive-benchmark.test.ts`
- `router/tests/fixtures/benchmark/regression-suite.json` (consolidated: 43 FP + 10+ TP scenarios)
- `router/tests/fixtures/benchmark/scoring.ts` (dual-pool scoring)
- `router/tests/fixtures/benchmark/adapter.ts`

Test:
```bash
cd router && pnpm vitest run tests/integration/false-positive-benchmark.test.ts
```

## Running the Benchmark

```bash
# Via Vitest (development)
cd router && pnpm vitest run tests/integration/false-positive-benchmark.test.ts --reporter=verbose

# Via CLI (once command is implemented)
cd router && node dist/main.js benchmark --fixtures tests/fixtures/benchmark/regression-suite.json --verbose
```

## Key Architecture Decisions

1. **Safe sources filter at taint origin** — Prevents false taint from propagating through the entire analysis chain
2. **Post-processing validates centrally** — Router Owns All Posting principle; agents don't self-filter
3. **Declarative pattern definitions** — Safe-source patterns mirror mitigation-patterns.ts architecture for consistency
4. **Benchmark uses existing DI** — LocalReviewDependencies allows injecting synthetic diffs without API calls
5. **Context truncation preserves diff** — When budget exceeded, projectRules truncated first (diff is always more important)
