# External Benchmark

Operational guide for running the withmartian external benchmark against `odd-ai-reviewers`.

This document is the source of truth for benchmark execution. Historical design notes remain in [analysis/benchmark-integration-plan.md](../analysis/benchmark-integration-plan.md), but day-to-day run instructions should live here.

---

## Canonical Entry Point

Use the repo-owned orchestrator:

```bash
node --experimental-strip-types scripts/run-external-benchmark.ts
```

This script owns the full flow:

1. clones or updates the upstream benchmark repo
2. pins it to a known revision
3. syncs the Python environment with `uv`
4. runs `scripts/benchmark-adapter.ts`
5. runs the upstream judge via direct Python module execution
6. writes `summary.json`, `candidates.json`, `evaluations.json`, and `benchmark_data.json`
7. applies regression thresholds with `scripts/benchmark-check.ts`

---

## Why We Do Not Use `judge-comments`

Do **not** depend on the upstream `judge-comments` shim.

During validation on Windows, `uv sync` reported:

> Skipping installation of entry points (`project.scripts`) because this project is not packaged

That means the benchmark repo's `project.scripts` shims are not a dependable contract across environments. The deterministic contract is the Python module:

```bash
python -m code_review_benchmark.step3_judge_comments
```

The orchestrator always uses direct module execution and also forces `PYTHONUTF8=1` to avoid Windows encoding drift.

---

## Required Environment Variables

| Variable            | Required For          | Notes                                                           |
| ------------------- | --------------------- | --------------------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Review generation     | Required unless you explicitly skip the adapter phase           |
| `MARTIAN_API_KEY`   | Judge scoring         | Required unless you explicitly skip the judge phase             |
| `MARTIAN_MODEL`     | Judge model selection | Optional; defaults to `openai/gpt-4.1-mini` in our orchestrator |

---

## Pinned Upstream Revision

The orchestrator pins the upstream benchmark repo to:

```text
3d2a315ca54bf68b5ad2c830f7c1097a43c8b458
```

This reduces layout drift and keeps local, Docker, and CI runs aligned.

---

## Common Commands

### Full run

```bash
node --experimental-strip-types scripts/run-external-benchmark.ts \
  --benchmark-root .external-benchmark \
  --results-dir benchmark-results
```

### Filter to one project

```bash
node --experimental-strip-types scripts/run-external-benchmark.ts \
  --benchmark-root .external-benchmark \
  --results-dir benchmark-results \
  --projects grafana \
  --concurrency 1 \
  --timeout-per-pr 600 \
  --max-runtime 7200
```

### Rerun judge and scoring only

Use this after topping up the Martian account or when adapter output is already present:

```bash
node --experimental-strip-types scripts/run-external-benchmark.ts \
  --benchmark-root .external-benchmark \
  --results-dir benchmark-results \
  --projects grafana \
  --skip-adapter
```

### Sync-only smoke test

Useful when validating the environment without spending API money:

```bash
node --experimental-strip-types scripts/run-external-benchmark.ts \
  --benchmark-root .external-benchmark \
  --results-dir benchmark-results \
  --skip-adapter \
  --skip-judge \
  --skip-summary \
  --skip-check
```

---

## Docker

The Docker path uses the same orchestrator:

- [Dockerfile.benchmark](../../Dockerfile.benchmark)
- [docker-compose.benchmark.yml](../../docker-compose.benchmark.yml)

Example:

```bash
docker compose -f docker-compose.benchmark.yml up --build
```

Docker is recommended for recurring local runs because it eliminates Windows-specific Python and encoding drift.

---

## CI

GitHub Actions uses the same orchestrator in:

- [benchmark.yml](../../.github/workflows/benchmark.yml)

This keeps local and CI logic aligned and avoids duplicated shell flows.

---

## Artifacts

The orchestrator writes:

- `summary.json`
- `candidates.json`
- `evaluations.json`
- `benchmark_data.json`

These live under the configured `--results-dir`.

---

## Notes

- A failed benchmark run can still be operationally successful if the final regression gate fails. In that case, review generation and judging completed, but `precision`, `recall`, or `f1` fell below the configured thresholds.
- For iterative debugging, prefer project-filtered runs before full 50-PR runs.
