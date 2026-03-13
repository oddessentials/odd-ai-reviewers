# Baseline Report: CLI Tool & FP Benchmark Validation

**Date:** 2026-03-12
**Branch:** main (commit 98463b7)
**Version:** `@oddessentials/odd-ai-reviewers@1.8.0`

---

## 1. Build Status

**Result: SUCCESS**

- `pnpm install` completed in ~776ms (lockfile up to date)
- `pnpm build` (tsc) completed successfully with no errors
- Node.js v24.11.1, pnpm 10.28.2

---

## 2. Test Suite Results

**Result: ALL PASS**

| Metric      | Value                            |
| ----------- | -------------------------------- |
| Test Files  | 145 passed, 0 failed             |
| Total Tests | 4068 passed, 9 skipped, 0 failed |
| Duration    | 14.35s                           |

No test failures. The 9 skipped tests are in `depcruise-rules.test.ts` (5 skipped) and likely environment-conditional.

---

## 3. Benchmark Test Results

### 3a. False-Positive Benchmark Test (92 tests)

**File:** `router/tests/integration/false-positive-benchmark.test.ts`
**Result: ALL 92 PASS**

Covers:

- Scoring module unit tests (matchFinding, matchFindings, scoreScenario, computeReport)
- Adapter unit tests (parseDiffFiles, unsupported scenario rejection, snapshot drift detection)
- Fixture validation (counts, uniqueness, schema compliance)
- Pool 1: FP suppression (Patterns A, B, C, D, E, F)
- Pool 2: TP preservation (injection, xss, path_traversal, ssrf, auth_bypass)
- Release gate metric assertions (SC-001, SC-002, SC-003, SC-007)

### 3b. Control Flow Benchmark Test (22 tests)

**File:** `router/tests/integration/control_flow-benchmark.test.ts`
**Result: ALL 22 PASS**

Covers degraded mode for large workloads, budget completion within 99% of simulated PRs.

### 3c. Benchmark CLI Test (7 tests)

**File:** `router/tests/integration/benchmark-cli.test.ts`
**Result: ALL 7 PASS**

Covers CLI benchmark subcommand execution, mixed fixture handling, fail-closed on empty/unsupported fixtures.

---

## 4. Current FP Suppression Metrics (CLI Benchmark Output)

**Command:** `node router/dist/main.js benchmark --fixtures router/tests/fixtures/benchmark/regression-suite.json`

### Fixture Distribution

| Category            | Count |
| ------------------- | ----- |
| **Total scenarios** | 62    |
| FP scenarios        | 43    |
| TP scenarios        | 19    |

| Pattern                   | Count              | Type                      |
| ------------------------- | ------------------ | ------------------------- |
| A (safe sources)          | 12 FP + 19 TP = 31 | Deterministic (AST)       |
| B (framework conventions) | 5                  | Snapshot replay           |
| C (project context)       | 4                  | Snapshot replay           |
| D (PR description)        | 5                  | Snapshot replay           |
| E (self-contradicting)    | 4                  | Deterministic (validator) |
| F (mixed)                 | 13                 | Snapshot replay           |

### Benchmark Scores

| Metric                           | Score      | Threshold       |
| -------------------------------- | ---------- | --------------- |
| **Pool 1 FP Suppression**        | **100.0%** | >= 85% (SC-001) |
| **Pool 2 TP Recall**             | **100.0%** | = 100% (SC-002) |
| **Pool 2 TP Precision**          | **100.0%** | >= 70% (SC-003) |
| **Pattern E Self-Contradiction** | **100.0%** | >= 80% (SC-007) |

### Execution Coverage

- **35 scored** (16 FP deterministic/snapshot + 19 TP deterministic)
- **27 skipped** (Patterns B/C/D/F without live LLM — use snapshot replay in test suite)
- All 27 snapshot files present and used in the test suite

### Category Breakdown (from scored scenarios)

| Category           | Total | Passed | Failed |
| ------------------ | ----- | ------ | ------ |
| safe-source        | 12    | 12     | 0      |
| self-contradicting | 4     | 4      | 0      |
| injection          | 6     | 6      | 0      |
| xss                | 3     | 3      | 0      |
| path_traversal     | 4     | 4      | 0      |
| ssrf               | 4     | 4      | 0      |
| auth_bypass        | 2     | 2      | 0      |

---

## 5. Docker Availability

**Docker: AVAILABLE**

- Docker version 29.2.0 (build 0b9d198)
- Docker daemon running, no containers active
- Available for benchmark containerization if needed

---

## 6. CLI Tool Functionality Check

### Main CLI

- `ai-review --help` works correctly
- Version: 1.8.0
- Entry point: `router/dist/main.js`
- ESM module (`"type": "module"`)

### Subcommands Available

- `review` - Run AI review on PR/commit range
- `validate` - Validate configuration file
- `check` - Check external dependency availability
- `config` - Configuration management
- `benchmark` - Run false-positive regression benchmark
- `local` / `local-review` - Run AI review on local changes

### Local Review (dry-run)

- `ai-review local . --dry-run` succeeds
- Loads `.ai-review.yml` from repository
- Configures 4 agents: semgrep, reviewdog, opencode, pr_agent
- Correctly shows 0 files when no changes present

### Benchmark CLI

- `ai-review benchmark --fixtures <path>` works correctly
- `--verbose` flag shows per-scenario details
- `--output <path>` option available for JSON report export

---

## 7. Issues and Blockers

### No Blockers Found

1. **All tests pass** - clean baseline with zero failures
2. **All benchmark gates pass** - 100% across all metrics
3. **CLI fully functional** - both local review and benchmark modes work
4. **Docker available** - ready for containerized benchmarks if needed

### Observations

1. **Snapshot-dependent patterns (B/C/D/F) are only testable via recorded snapshots** - 27 of 62 scenarios cannot run in deterministic mode. The test suite handles this correctly by using snapshot replay.

2. **The 43 FP scenarios represent the known FP corpus** - any new FP reduction work should add scenarios to this suite to prevent regressions.

3. **TP pool is well-distributed** across 5 vulnerability categories (injection, xss, path_traversal, ssrf, auth_bypass) with 19 total scenarios including 6 destructuring-taint scenarios (tp-destr-001 through tp-destr-006) added in the latest commit.

4. **Finding validator actively filters** during benchmark runs:
   - Semantic filter catches self-contradicting findings (dismissive language with info severity)
   - Unplaceable filter catches out-of-diff-range line numbers
   - Both filters working as expected

---

## Summary

The project is in excellent health. All 145 test files (4068 tests) pass. The benchmark infrastructure is fully operational with 100% scores across all release gates. The CLI tool builds and runs correctly. Docker is available. No blockers for proceeding with FP reduction work.
