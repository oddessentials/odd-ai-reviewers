# Implementation Plan: False-Positive Reduction & Benchmark Integration

**Branch**: `414-fp-reduction-and-benchmark` | **Date**: 2026-03-12 | **Spec**: [spec.md](../../.specify/features/414-fp-reduction-and-benchmark/spec.md)
**Input**: Feature specification from `.specify/features/414-fp-reduction-and-benchmark/spec.md`
**Feedback**: [feedback-response.md](feedback-response.md) — 10 review items addressed

## Summary

Reduce false positives from 78.6% unaddressed to under 15% by centralizing prompt conventions 7-12 in a shared fragment consumed by all 4 review prompts, expanding the framework pattern filter from 3 to 5 matchers (T022, T023) with tightened evidence requirements, upgrading PR intent contradiction from diagnostic-only to category-restricted info-severity suppression, and strengthening Active Context Directives from advisory to mandatory. Integrate the withmartian code-review-benchmark for objective quality measurement via adapter script with hard resource controls, Docker configuration with minimum-privilege secret handling, and CI workflow. Internal benchmark gates every PR; external benchmark monitors weekly.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.x (validation), Commander 14.x (CLI), Vitest 4.x (testing), Octokit 22.x (GitHub API), Anthropic SDK 0.71.x, OpenAI SDK 6.x
**Storage**: File-based (benchmark fixtures as JSON, snapshots as JSON with SHA-256 hash validation)
**Testing**: Vitest 4.0.18 — 145 test files, 4,068 tests, 14.35s baseline
**Target Platform**: Node.js >=22.0.0, Linux CI (GitHub Actions), Docker (benchmark)
**Project Type**: CLI tool + GitHub Actions integration
**Performance Goals**: Benchmark suite completes within CI timeout (120min); internal tests remain <30s
**Constraints**: Framework filter is closed table (this spec IS the amendment for T022/T023); PR intent suppression info-severity only in closed category set; no cross-function taint analysis
**Scale/Scope**: 1 shared prompt fragment, 4 prompt consumers, 2 filter matchers, 1 validator upgrade, 1 adapter script, 1 Docker config, 1 CI workflow, ~15-20 new test scenarios

## Quality Gate: Merge Enforcement

The internal FP benchmark already gates every PR to `main` via the `benchmark-regression` CI job (`ci.yml:277-304`). This is a **required status check** — PRs cannot merge if it fails.

**Current thresholds** (enforced per PR):

- SC-001: FP suppression rate ≥ 85%
- SC-002: TP recall = 100%
- SC-003: TP precision ≥ 70%
- SC-007: Self-contradiction filter ≥ 80%

**Post-implementation threshold update**: After Phase 4 scenarios are added, raise SC-001 from ≥85% to ≥90% to operationalize the "under 15% unaddressed" target.

The **external withmartian benchmark** (50 PRs, LLM calls, ~$10-20/run) is monitoring-only (weekly/manual) due to cost and latency. It measures absolute quality against the industry but does not gate merges.

## Incremental Progress Tracking

Each phase has measurable fixture deltas tied to the 78.6% → <15% target:

| Phase                       | Plan Phase(s) | Task Phase    | Gaps Addressed                                    | FPs Fixed (Expected) | Cumulative Addressed | Benchmark Gate               |
| --------------------------- | ------------- | ------------- | ------------------------------------------------- | -------------------- | -------------------- | ---------------------------- |
| Baseline                    | —             | —             | —                                                 | 9/42 already fixed   | 21.4% (9/42)         | SC-001 ≥ 85% (current: 100%) |
| Prompt + Filter + PR Intent | 1, 2, 3       | Phase 3 (US1) | 1 (9), 2 (5-7), 3 (7), 4 (3), 5 (2), 6 (2), 7 (1) | 29-31 new            | ~90-95% (38-40/42)   | SC-001 ≥ 85% maintained      |
| Test Verification           | 4             | Phase 4 (US2) | Verification only                                 | 0 (validation)       | Final audit          | SC-001 raised to ≥ 90%       |

**Phase exit criteria**: Each phase MUST NOT merge unless:

1. All existing tests pass (4,068+)
2. All new scenarios for that phase pass
3. SC-001 ≥ threshold for that phase
4. SC-002 = 100% (TP recall unchanged)

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                                                                                                                         |
| -------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | No changes to posting — all changes are in pre-posting filters and prompts                                                                    |
| II. Structured Findings Contract | PASS   | Finding schema unchanged; new matchers consume existing fields (message, file, line, severity)                                                |
| III. Provider-Neutral Core       | PASS   | Framework filter and finding validator are provider-agnostic; benchmark adapter is a separate script                                          |
| IV. Security-First Design        | PASS   | PR intent suppression restricted to info severity + closed category set; secrets scoped per CI step; fork PRs blocked from benchmark          |
| V. Deterministic Outputs         | PASS   | Framework matchers are deterministic (regex + multi-point evidence); prompt conventions are probabilistic but backed by deterministic filters |
| VI. Bounded Resources            | PASS   | Adapter has hard concurrency/timeout/retry limits; CI benchmark bounded by 120min timeout                                                     |
| VII. Environment Discipline      | PASS   | Docker config uses pinned base images; CI uses standard actions; no curl-pipe-bash in production; secrets not baked into images               |
| VIII. Explicit Non-Goals         | PASS   | Not adding CI orchestration; benchmark is a measurement tool, not a replacement for CI                                                        |

No violations. No complexity justification needed.

## Project Structure

### Documentation (this feature)

```text
specs/414-fp-reduction-and-benchmark/
├── plan.md              # This file
├── feedback-response.md # Review feedback analysis
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
config/prompts/
├── _shared_conventions.md    # NEW — single source of truth for conventions 7-12, ACDs, data-flow
├── semantic_review.md        # Consumes shared fragment between markers
├── pr_agent_review.md        # Consumes shared fragment between markers
├── opencode_system.md        # Consumes shared fragment between markers
└── architecture_review.md    # Consumes shared fragment + NEW sections (Data-flow, ACDs)

router/src/
├── report/
│   ├── framework-pattern-filter.ts   # +2 matchers (T022, T023) with tightened evidence
│   └── finding-validator.ts          # PR intent upgrade (diagnostic → category-restricted suppression)
├── agents/
│   ├── ai_semantic_review.ts         # Inline fallback generated from shared fragment
│   ├── pr_agent.ts                   # Inline fallback generated from shared fragment
│   └── opencode.ts                   # Inline fallback generated from shared fragment
└── benchmark/
    ├── scoring.ts                    # Existing — BenchmarkScenario type
    └── adapter.ts                    # Existing — runScenario, parseDiffFiles

router/tests/
├── unit/
│   ├── report/
│   │   └── framework-pattern-filter.test.ts   # +T022, T023 tests
│   └── prompts/
│       └── prompt-sync.test.ts                # Updated: hash-based sync check
├── integration/
│   └── false-positive-benchmark.test.ts       # +Gap 1-7 scenarios + runnable count guard
└── fixtures/benchmark/
    ├── regression-suite.json                  # +new FP scenarios + snapshotVersion
    └── snapshots/                             # +new snapshot files

scripts/
├── benchmark-adapter.ts        # NEW — transforms CLI JSON → benchmark candidate format
├── benchmark-check.ts          # NEW — validates scores against thresholds
├── sync-prompt-conventions.ts  # NEW — syncs shared fragment to all prompts + fallbacks
└── __tests__/
    ├── benchmark-adapter.test.ts  # NEW — automated smoke tests
    └── benchmark-check.test.ts    # NEW — threshold logic tests

Dockerfile.benchmark            # NEW — Node 22 + Python 3 + uv + gh + pnpm (no secrets in image)
docker-compose.benchmark.yml    # NEW — env vars via --env-file, volumes
.github/workflows/benchmark.yml # NEW — weekly + manual trigger, step-scoped secrets, fork-blocked
```

**Structure Decision**: Existing single-project structure. Prompt centralization via shared fragment eliminates 7-way duplication. New files limited to benchmark tooling (scripts/, Docker, CI) and test fixtures.

## Constitution Re-Check (Post-Design)

| Principle                        | Status | Design Decision                                                                                                     |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | Benchmark adapter is a standalone script, not part of the posting pipeline                                          |
| II. Structured Findings Contract | PASS   | New `filterType: 'pr_intent_contradiction'` extends existing enum; no breaking changes                              |
| III. Provider-Neutral Core       | PASS   | Framework filter matchers use only Finding fields — no provider-specific logic                                      |
| IV. Security-First Design        | PASS   | PR intent suppression gated by severity + category + evidence; benchmark secrets step-scoped; fork PRs blocked      |
| V. Deterministic Outputs         | PASS   | T022/T023 require multi-point evidence (import + hook call + line proximity); PR intent filter is deterministic     |
| VI. Bounded Resources            | PASS   | Adapter: concurrency=1 (max 5), timeout=300s/PR, max-retries=1, max-runtime=7200s, disk guard <2GB                  |
| VII. Environment Discipline      | PASS   | Dockerfile uses pinned `node:22-bookworm-slim`; secrets via `--env-file` at runtime only; `.env` in `.dockerignore` |
| VIII. Explicit Non-Goals         | PASS   | Benchmark measures quality — does not orchestrate CI or manage secrets                                              |

All gates pass. No violations introduced by design decisions.

## Implementation Phases

### Phase 1: Prompt Centralization & Conventions (FR-101 through FR-108, FR-114)

**Goal**: Create a single source of truth for conventions 7-12, strengthened ACDs, and data-flow rules. Consume from all 4 prompt files and 3 inline fallbacks.

**New files**:

- `config/prompts/_shared_conventions.md` — Single source of truth containing conventions 7-12, Active Context Directives, and data-flow additions
- `scripts/sync-prompt-conventions.ts` — Build-time script that reads the shared fragment and replaces content between `<!-- BEGIN/END SHARED CONVENTIONS -->` markers in all 4 prompt files, and generates a compressed TypeScript constant for inline fallbacks

**Files modified**:

- `config/prompts/semantic_review.md` — Add markers, replace conventions 7-12 / ACDs / data-flow via sync script
- `config/prompts/pr_agent_review.md` — Add markers, sync from shared fragment
- `config/prompts/opencode_system.md` — Add markers, sync from shared fragment
- `config/prompts/architecture_review.md` — Add markers + ADD new Data-flow Verification and Active Context Directives sections (currently missing entirely — only 58 lines vs 135 in other prompts)
- `router/src/agents/ai_semantic_review.ts` — Import generated fallback constant
- `router/src/agents/pr_agent.ts` — Import generated fallback constant
- `router/src/agents/opencode.ts` — Import generated fallback constant
- `router/tests/unit/prompts/prompt-sync.test.ts` — Update from keyword counting (6 conventions) to hash-based comparison (12 conventions); verify all 4 prompts and 3 fallbacks match shared fragment hash
- `package.json` — Add `prompts:sync` and `prompts:check` scripts

**CI integration**: Add `pnpm prompts:check` step to ci.yml quality job — fails if any prompt has drifted from the shared fragment.

**Convention content** (in `_shared_conventions.md`):

```markdown
7. **Existence verification before reporting**: Before reporting ANY finding:
   - Verify the specific code construct you reference EXISTS in the diff at the line you cite
   - Do NOT claim code "lacks documentation" without checking surrounding context
   - Do NOT claim values are incorrect without evidence of a mismatch
   - Do NOT flag ordering issues unless check and action are in the SAME subsystem
   - When analyzing caching/deduplication (singleflight, memoization), examine the FULL key
   - If you cannot find the exact construct in the diff, OMIT the finding

8. **TypeScript type-system trust**: Do NOT suggest runtime type validation for values
   constrained by TypeScript's type system (union types, enums, branded types, `as const`).
   - DO NOT flag: Missing runtime check for `'low' | 'medium' | 'high'` parameter
   - DO NOT flag: Missing assertion for Zod `.parse()` output
   - DO flag: Unvalidated `string` from user input used as an enum key

9. **No business-decision findings**: Do NOT flag budget amounts, pricing values,
   resource limits, timeout durations, or retry counts as code quality issues unless
   they cause a functional bug.

10. **No cosmetic refactoring suggestions**: Do NOT suggest:
    - Splitting orchestrator components unless specific extractable logic is identified
      AND the PR is about refactoring
    - Optimizing init-time code unless profiling shows a bottleneck
    - Adding comments to code where variable names make intent clear
    - Extracting expressions matching a consistent file-wide pattern
    - Expanding minified code (GLSL, inlined SQL) unless the PR is about readability

11. **Developer tooling files**: Do NOT flag shell commands in .husky/, Makefiles,
    scripts/, or CI configuration as injection risks unless arguments demonstrably
    come from user-controlled environment variables or external input.

12. **React useRef pattern**: `useRef<T>(null)` with type assertions or non-null
    assertions on `.current` is standard React 18+ TypeScript. Do NOT flag
    `ref.current!` or `as T` on ref values as unsafe.
```

**ACD content** (in `_shared_conventions.md`):

```markdown
### Active Context Directives

Before generating any findings:

1. **MANDATORY: Check Project Rules** (if present above):
   - Read ALL project rules FIRST, before any code analysis
   - HARD CONSTRAINT: Do NOT generate ANY finding that contradicts a documented project decision
   - If a project rule mandates a specific structure, do NOT suggest alternatives
   - Check project constitution and brand guidelines before flagging hardcoded values
   - Do NOT suggest "extract for testability" when no test framework exists

2. **MANDATORY: Check PR Description** (if present above):
   - Read the PR title and description to understand the author's stated intent
   - Do NOT flag the exact behavior described in the PR purpose
   - If a PR describes conditional/environment-dependent behavior, do NOT flag it
   - If the PR description explains WHY, do NOT question that reasoning

3. **Design intent awareness**:
   - Before flagging resource leaks, verify whether intentional consumption is part of the design
   - Before flagging undefined fields in cache keys, check if absence is a discriminator
   - Before flagging instanceof checks, consider singleton architecture guarantees
```

**Data-flow additions** (in `_shared_conventions.md`):

```markdown
- Binary response bodies (audio, images, ArrayBuffer, Buffer) sent with non-HTML
  content-type are NOT XSS vectors — do not flag
- Zod-validated inputs after `.parse()` are type-safe — do not flag unless the
  Zod schema itself is permissive (e.g., `z.string()` on user-facing HTML output)
```

**Phase 1 exit gate**: SC-001 ≥ 85%, SC-002 = 100%, `pnpm prompts:check` passes, prompt-sync.test.ts passes with 12-convention hash check
**Dependencies**: None
**Risk**: Low — prompt changes are probabilistic; shared fragment eliminates drift risk

---

### Phase 2: Framework Pattern Filter Expansion (FR-109 through FR-111)

**Goal**: Add matchers T022 and T023 with tightened evidence requirements.

**Files modified**:

- `router/src/report/framework-pattern-filter.ts`

**Changes**:

1. Update header comment (line 8): `3 matchers` → `5 matchers`
2. Update table comment (line 122): `Only these 3 matchers` → `Only these 5 matchers`
3. Insert before line 203 (`] as const`):

**T022 — React Query Dedup** (tightened per feedback item #3):

```typescript
  // T022: React Query Deduplication
  {
    id: 'react-query-dedup',
    name: 'React Query Dedup',
    messagePattern: /duplicate|double.?fetch|redundant.*query|multiple.*useQuery/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const fileSection = extractFileDiffSection(finding, diffContent);
      if (!fileSection) return false;

      // Evidence 1: Query library import in file section
      const hasQueryImport =
        /from\s+['"]@tanstack\/react-query['"]/.test(fileSection) ||
        /from\s+['"]swr['"]/.test(fileSection) ||
        /from\s+['"]@apollo\/client['"]/.test(fileSection);
      if (!hasQueryImport) return false;

      // Evidence 2: Query hook call near the finding line
      const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
      const nearbyText = nearbyLines.join('\n');
      const hasQueryHook =
        /\b(useQuery|useSWR|useSubscription|useInfiniteQuery|useMutation)\s*\(/.test(nearbyText);
      if (!hasQueryHook) return false;

      // Evidence 3: Exclude raw HTTP findings (not about library dedup)
      if (/api\s*call|http\s*request|\bfetch\s*\(/.test(finding.message.toLowerCase())) {
        return false;
      }

      return true;
    },
    suppressionReason: 'Query library deduplicates by cache key — not double-fetching',
  },
```

**T023 — Promise.allSettled Order** (tightened per feedback item #4):

```typescript
  // T023: Promise.allSettled Order Preservation
  {
    id: 'promise-allsettled-order',
    name: 'Promise.allSettled Order',
    messagePattern:
      /allSettled.*(?:order|sequence)|(?:order|sequence).*allSettled|allSettled.*results.*not.*(?:match|correspond|align)/i,
    evidenceValidator(finding: Finding, diffContent: string): boolean {
      const fileSection = extractFileDiffSection(finding, diffContent);
      if (!fileSection) return false;

      // Evidence 1: Promise.allSettled call near the finding line (not just file-wide)
      const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
      const nearbyText = nearbyLines.join('\n');
      if (!/Promise\.allSettled\s*\(/.test(nearbyText)) return false;

      // Evidence 2: Result iteration (indexed or sequential access)
      const hasResultAccess =
        /\.\s*forEach|\.map\s*\(|\[(\w+|\d+)\]|for\s*\(.*\s+of\s/.test(nearbyText);
      if (!hasResultAccess) return false;

      return true;
    },
    suppressionReason: 'Promise.allSettled preserves input order per ECMAScript spec',
  },
```

**Phase 2 exit gate**: SC-001 ≥ 85%, SC-002 = 100%, T022 and T023 tests pass (suppress + pass-through cases)
**Dependencies**: None
**Tests**: Add T022/T023 test cases to `framework-pattern-filter.test.ts` including tightened evidence scenarios
**Risk**: Low — multi-point evidence requirement makes false suppression extremely unlikely

---

### Phase 3: PR Intent Suppression Upgrade (FR-112, FR-113)

**Goal**: Convert `logPRIntentContradictions()` from diagnostic-only to active suppression, restricted to a closed category set with exact contradiction rules.

**Files modified**:

- `router/src/report/finding-validator.ts`

**Changes** (tightened per feedback item #2):

1. Rename `logPRIntentContradictions` → `filterPRIntentContradictions`
2. Change return type: `void` → `Finding[]` (returns filtered findings list)
3. **Closed category gate**: Only suppress findings with `category` in: `['documentation', 'style', 'cosmetic', 'refactoring']`. Security, logic, error-handling, performance, and api-misuse categories are NEVER eligible.
4. **Severity gate**: `if (finding.severity !== 'info') continue` — never suppress warning/error/critical
5. **Exact contradiction pairs** (replace open-ended map):

   | PR Verb    | Contradiction Verbs       | Required Evidence                            |
   | ---------- | ------------------------- | -------------------------------------------- |
   | `add`      | `remove`, `delete`        | Finding references same subject as PR intent |
   | `remove`   | `add`, `missing`          | Finding references same subject as PR intent |
   | `rename`   | `revert`, `original name` | Finding references same identifier           |
   | `refactor` | `revert`, `undo`          | Finding references same code unit            |

6. **Subject match requirement**: Finding must reference the same file OR the same code construct (function name, variable, component) as the PR intent — not substring match.
7. **Evidence logging**: Every suppression logs: finding file, severity, category, PR verb, matched subject, contradiction verb
8. Add `'pr_intent_contradiction'` to `filterType` union type (line 29)
9. Update call site in `validateFindingsSemantics()` (lines 260-262): integrate as Pass 4 after self-contradiction
10. **Kill switch**: Support `prIntentSuppression: boolean` config flag (default: `true`)

**Phase 3 exit gate**: SC-001 ≥ 85%, SC-002 = 100%, PR intent tests pass (info suppression + warning passthrough + category restriction)
**Dependencies**: None
**Tests**: Add cases for: info+eligible category → suppressed; info+ineligible category → passed; warning → passed; missing subject match → passed
**Risk**: Medium — behavioral change; mitigated by closed category set + severity gate + evidence logging

---

### Phase 4: Test Scenarios & Snapshot Management (FR-301 through FR-304)

**Goal**: Add regression test scenarios for Gaps 1-7, T022/T023 filter tests, PR intent suppression tests. Establish snapshot lifecycle rules.

**Files modified**:

- `router/tests/fixtures/benchmark/regression-suite.json` — Add ~13-18 new FP scenarios + `snapshotVersion` metadata
- `router/tests/fixtures/benchmark/snapshots/` — Add snapshot files for prompt-dependent scenarios
- `router/tests/unit/report/framework-pattern-filter.test.ts` — Add T022/T023 tests with tightened evidence
- `router/tests/integration/false-positive-benchmark.test.ts` — Register new scenarios + add runnable count guard

**New filter test cases (framework-pattern-filter.test.ts)**:

T022 — React Query Dedup (tightened evidence):

- Suppress: message="double-fetching data", diff has react-query import + `useQuery(` near line → suppressed
- Suppress: message="redundant query call", diff has swr import + `useSWR(` near line → suppressed
- Pass-through: message="duplicate API call", diff has NO query library import → not suppressed
- Pass-through: message="duplicate fetch() call", diff has react-query import but message mentions `fetch()` → not suppressed (raw HTTP exclusion)
- Pass-through: message="duplicate database connection", diff has react-query import but no hook call near line → not suppressed

T023 — Promise.allSettled Order (tightened evidence):

- Suppress: message="allSettled results order not guaranteed", diff has `Promise.allSettled(` + `.forEach` near line → suppressed
- Pass-through: message="allSettled results order", diff has `Promise.allSettled(` but NOT near finding line → not suppressed
- Pass-through: message="results not match", diff has `Promise.allSettled(` near line but no result iteration → not suppressed

**Snapshot lifecycle rules** (per feedback item #6):

1. **Drift detection**: When `promptTemplateHash` in snapshot doesn't match current prompt hash, scenario is skipped (existing behavior). Document explicitly.
2. **Snapshot refresh**: After Phase 1 prompt changes, record new snapshots via `pnpm benchmark:record`. Commit with prompt changes.
3. **Runnable count guard**: Add assertion to `false-positive-benchmark.test.ts`:
   ```typescript
   it('at least 80% of scenarios are runnable (not stale)', () => {
     const runnableCount = allRunnableFP.length + deterministicTP.length;
     const totalCount = scenarios.length;
     expect(runnableCount / totalCount).toBeGreaterThanOrEqual(0.8);
   });
   ```
4. **Snapshot version**: Add `"snapshotVersion": 2` to `regression-suite.json` metadata (increment on each prompt change cycle).

**Phase 4 exit gate**: SC-001 ≥ 90%, SC-002 = 100%, all new scenarios pass, ≥80% scenarios runnable, prompt-sync hash check passes
**Dependencies**: Phases 1-3 must complete first
**Risk**: Low — additive only

---

### Phase 5: Benchmark Adapter & Regression Check (FR-201 through FR-203)

**Goal**: Create scripts for local benchmark iteration and score validation, with hard resource controls and automated tests.

**New files**:

- `scripts/benchmark-adapter.ts` — See [contract](contracts/benchmark-adapter.md)
- `scripts/benchmark-check.ts` — See [contract](contracts/benchmark-check.md)
- `scripts/__tests__/benchmark-adapter.test.ts` — Automated smoke tests
- `scripts/__tests__/benchmark-check.test.ts` — Threshold logic tests

**Resource controls** (per feedback item #7):

| Control            | Default             | Max  | Flag                   |
| ------------------ | ------------------- | ---- | ---------------------- |
| Concurrency        | 1                   | 5    | `--concurrency`        |
| Per-PR timeout     | 300s                | 600s | `--timeout-per-pr`     |
| Max retries per PR | 1                   | 3    | `--max-retries`        |
| Clone cache        | Reuse existing      | —    | `--cache-dir`          |
| Disk space guard   | Abort if <2GB free  | —    | (automatic)            |
| Cleanup            | Delete clones after | —    | `--no-cleanup` to keep |
| Max total runtime  | 7200s (2h)          | —    | `--max-runtime`        |
| Dry run            | No LLM calls        | —    | `--dry-run`            |

**Automated tests** (per feedback item #8):

`scripts/__tests__/benchmark-adapter.test.ts`:

- Unit: transforms mock CLI JSON to candidate format (message mapping, suggestion append)
- Unit: handles empty findings → empty candidate list
- Unit: sets `line: null` when finding has no line
- Unit: skips PR on CLI failure (mocked execSync)
- Integration: `--dry-run` mode against 1-PR fixture

`scripts/__tests__/benchmark-check.test.ts`:

- Unit: all scores above thresholds → exit 0
- Unit: precision below threshold → exit 1
- Unit: recall below threshold → exit 1
- Unit: missing results file → exit 2
- Unit: invalid threshold args → exit 2

**CI smoke test**: Add to `benchmark-regression` CI job:

```yaml
- name: Smoke test benchmark scripts
  run: |
    npx tsx scripts/benchmark-check.ts \
      --results router/tests/fixtures/benchmark/mock-results/ \
      --min-precision 0.01 --min-recall 0.01 --min-f1 0.01
```

**Phase 5 exit gate**: All adapter/check tests pass, dry-run mode works, CI smoke test passes
**Dependencies**: Working `ai-review local --format json` (already exists)
**Risk**: Low — standalone scripts with bounded resource consumption

---

### Phase 6: Docker & CI Integration (FR-204 through FR-206)

**Goal**: Provide reproducible benchmark environment and automated weekly runs with minimum-privilege secret handling.

**New files**:

- `Dockerfile.benchmark` — Multi-stage: Node 22 + Python 3 + uv + gh CLI + pnpm. NO secrets in image.
- `docker-compose.benchmark.yml` — Secrets via `--env-file` at runtime, `.env` in `.dockerignore`
- `.github/workflows/benchmark.yml` — Weekly + manual trigger, step-scoped secrets, fork-blocked

**Secret handling** (per feedback item #9):

| Secret              | Used By           | Purpose                           | Scope              |
| ------------------- | ----------------- | --------------------------------- | ------------------ |
| `ANTHROPIC_API_KEY` | Adapter step only | LLM review calls                  | Step-level env     |
| `GH_TOKEN`          | Adapter step only | Clone benchmark repos (read-only) | Step-level env     |
| `MARTIAN_API_KEY`   | Judge step only   | LLM judge evaluation              | Step-level env     |
| `GITHUB_TOKEN`      | Upload artifacts  | Upload results                    | Automatic, minimal |

**Fork PR restriction**:

```yaml
if: >
  github.event_name != 'pull_request' ||
  github.event.pull_request.head.repo.full_name == github.repository
```

**Minimum permissions**:

```yaml
permissions:
  contents: read
  # No write permissions — benchmark is read-only analysis
```

**Docker security**:

- Secrets passed via `--env-file` at runtime, NOT `ENV` in Dockerfile
- `.env` added to `.dockerignore`
- Build stage has no access to API keys
- Shallow clones (`--depth 1`) for benchmark repos

**Phase 6 exit gate**: Manual CI trigger succeeds, artifacts uploaded, secrets scoped correctly, fork PR check blocks correctly
**Dependencies**: Phase 5 (adapter and check scripts)
**Risk**: Low — separate workflow, does not affect main CI pipeline

## Complexity Tracking

No constitution violations to justify. All changes are within existing architectural boundaries.
