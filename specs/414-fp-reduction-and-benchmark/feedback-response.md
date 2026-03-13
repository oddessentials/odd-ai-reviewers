# Feedback Response: Plan Review for 414-fp-reduction-and-benchmark

**Date**: 2026-03-12
**Reviewers**: Team collaborative review
**Status**: All 10 items addressed with plan amendments

---

## 1. Benchmark workflow is not a merge gate

**Verdict: PARTIALLY VALID — clarification + amendment needed**

The feedback is correct that the _external_ withmartian benchmark (weekly/manual) does not gate PRs. However, the plan omits an important existing fact: **the internal FP benchmark already gates every PR to `main`**.

The CI workflow (`ci.yml:277-304`) includes a `benchmark-regression` job that runs `false-positive-benchmark.test.ts` on every push and PR to `main`. This test enforces:

- SC-001: FP suppression rate ≥ 85%
- SC-002: TP recall = 100%
- SC-003: TP precision ≥ 70%
- SC-007: Self-contradiction filter ≥ 80%

**Amendment**: The plan will explicitly state that:

1. The **internal benchmark** (deterministic + snapshot, no LLM calls, ~15s) remains a required PR merge gate via the existing `benchmark-regression` CI job
2. New Gap 1-7 scenarios added in Phase 4 will be enforced by this gate — any regression blocks merge
3. The **external withmartian benchmark** (50 PRs, LLM calls, ~$10-20/run) is monitoring-only (weekly/manual) due to cost and latency — this is intentional, not an oversight
4. SC-001 threshold will be raised from ≥85% to ≥90% after Phase 4 scenarios are added, operationalizing the "under 15%" target

No new CI workflow needed for gating — the existing infrastructure already covers this.

---

## 2. PR-intent suppression is too permissive

**Verdict: VALID — tightening required**

The current plan allows suppression based on a broad verb pattern match (`/\b(add|fix|remove|rename|update|refactor)\s+(.+)/i`) against any info-severity finding. This is too loose.

**Amendment**: Phase 3 will be tightened as follows:

1. **Closed category restriction**: PR intent suppression ONLY applies to findings with `category` in the set: `['documentation', 'style', 'cosmetic', 'refactoring']`. Security, logic, error-handling, performance, and api-misuse categories are never eligible.

2. **Exact contradiction pairs** (replace the open-ended contradiction map):
   | PR Verb | Contradiction Verbs | Required Evidence |
   |---------|--------------------|--------------------|
   | `add` | `remove`, `delete` | Finding message references the SAME subject as PR intent |
   | `remove` | `add`, `missing` | Finding message references the SAME subject as PR intent |
   | `rename` | `revert`, `original name` | Finding references the same identifier |
   | `refactor` | `revert`, `undo` | Finding references the same code unit |

3. **Subject match requirement**: The finding must reference the same file OR the same code construct (function name, variable, component) as the PR intent — not just a substring match against the first 30 characters.

4. **Evidence logging**: Every suppression MUST log: finding ID, severity, category, PR verb, subject match, contradiction verb — enabling post-hoc audit.

5. **Kill switch**: Add a config flag `prIntentSuppression: boolean` (default: `true`) in `.ai-review.yml` so operators can disable the feature entirely.

---

## 3. T022 matcher is too broad

**Verdict: VALID — evidence requirement must be strengthened**

The current T022 only checks for a query library import plus a loose message pattern like "duplicate" or "redundant.\*query". This could suppress a legitimate finding about actual duplicate API calls in code that happens to import React Query.

**Amendment**: T022 evidence validator will require ALL of:

1. **Message pattern match** (existing): `/duplicate|double.?fetch|redundant.*query|multiple.*useQuery/i`
2. **Library import present** (existing): `@tanstack/react-query`, `swr`, or `@apollo/client` in file section
3. **NEW — Query hook call near finding line**: The `extractLinesNearFinding()` window (±10 lines of the finding) must contain an actual query hook call (`useQuery`, `useSWR`, `useSubscription`, `useInfiniteQuery`, `useMutation`) — proving the finding is about the query library, not about an unrelated API call
4. **NEW — Exclude if finding mentions "API call" or "HTTP request" without query hook context**: If the finding message contains `api.*call|http.*request|fetch\(\)` (indicating raw fetch, not library dedup), do NOT suppress

Updated evidence validator:

```typescript
evidenceValidator(finding: Finding, diffContent: string): boolean {
  const fileSection = extractFileDiffSection(finding, diffContent);
  if (!fileSection) return false;

  // Must have query library import
  const hasQueryImport = /from\s+['"]@tanstack\/react-query['"]/.test(fileSection) ||
    /from\s+['"]swr['"]/.test(fileSection) ||
    /from\s+['"]@apollo\/client['"]/.test(fileSection);
  if (!hasQueryImport) return false;

  // Must have query hook call near the finding
  const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
  const nearbyText = nearbyLines.join('\n');
  const hasQueryHook = /\b(useQuery|useSWR|useSubscription|useInfiniteQuery|useMutation)\s*\(/.test(nearbyText);
  if (!hasQueryHook) return false;

  // Exclude if finding is about raw HTTP calls, not library dedup
  if (/api\s*call|http\s*request|fetch\s*\(/.test(finding.message.toLowerCase())) return false;

  return true;
}
```

---

## 4. T023 matcher is too broad

**Verdict: VALID — must require result-order-specific evidence**

The current T023 suppresses any finding matching `/allSettled.*order|order.*allSettled|results.*not.*match/i` when `Promise.allSettled(` appears in the file section. The message pattern is too loose — "results not match" could refer to anything.

**Amendment**: T023 evidence validator will require ALL of:

1. **Tightened message pattern**: `/allSettled.*(?:order|sequence)|(?:order|sequence).*allSettled|allSettled.*results.*not.*(?:match|correspond|align)/i` — must specifically tie "order/sequence" to "allSettled" or tie "results not matching" to "allSettled"
2. **`Promise.allSettled(` near finding line** (strengthened): Check within `extractLinesNearFinding()` ±10 lines, not just anywhere in the file section
3. **NEW — Result variable access**: The nearby lines must show indexed or sequential access to the allSettled result (`.forEach`, `[i]`, `.map`, `for...of`) — confirming the finding is about iterating the result array

Updated evidence validator:

```typescript
evidenceValidator(finding: Finding, diffContent: string): boolean {
  const fileSection = extractFileDiffSection(finding, diffContent);
  if (!fileSection) return false;

  // Must have Promise.allSettled call near the finding
  const nearbyLines = extractLinesNearFinding(fileSection, finding.line, 10);
  const nearbyText = nearbyLines.join('\n');
  if (!/Promise\.allSettled\s*\(/.test(nearbyText)) return false;

  // Must show result iteration (indexed or sequential access)
  const hasResultAccess = /\.\s*forEach|\.map\s*\(|\[(\w+|0|1|2)\]|for\s*\(.*\s+of\s/.test(nearbyText);
  if (!hasResultAccess) return false;

  return true;
}
```

Updated message pattern:

```typescript
messagePattern: /allSettled.*(?:order|sequence)|(?:order|sequence).*allSettled|allSettled.*results.*not.*(?:match|correspond|align)/i,
```

---

## 5. Prompt duplication creates drift risk

**Verdict: VALID — centralize via shared fragment + generated sync**

The current approach duplicates conventions across 4 prompt files + 3 inline fallbacks = 7 locations. The existing `prompt-sync.test.ts` catches keyword drift but not content drift. This is a real maintenance burden.

**Amendment**: Replace manual duplication with a centralized source of truth:

1. **Create `config/prompts/_shared_conventions.md`**: Contains conventions 1-12, Active Context Directives, and data-flow rules as a single markdown fragment

2. **Prompt files reference the shared fragment**: Each prompt file includes a clear marker:

   ```markdown
   <!-- BEGIN SHARED CONVENTIONS (source: _shared_conventions.md) -->

   [content from _shared_conventions.md]

   <!-- END SHARED CONVENTIONS -->
   ```

3. **Add `scripts/sync-prompt-conventions.ts`**: A build-time script that reads `_shared_conventions.md` and replaces the content between the markers in all 4 prompt files. Run via `pnpm prompts:sync`.

4. **Add `pnpm prompts:check`**: A CI check (added to `ci.yml` quality job) that verifies all prompt files are in sync with the shared fragment. Fails if any file has drifted.

5. **Update `prompt-sync.test.ts`**: Change from keyword counting (6 → 12) to hash comparison — compute SHA-256 of the shared conventions section in each file and assert all match.

6. **Inline fallbacks**: Generate a compressed summary from `_shared_conventions.md` for the 3 agent fallback strings. The sync script outputs this as a TypeScript constant that the agents import.

This eliminates the 7-way copy-paste while preserving the ability to customize per-prompt sections (Review Focus, Output Format) that remain unique to each prompt.

---

## 6. Prompt churn invalidates benchmark snapshots

**Verdict: PARTIALLY VALID — existing drift detection is good but rules need documenting**

The benchmark infrastructure already pins snapshots to prompt content via SHA-256 hash (`currentSnapshotPromptHash` in `false-positive-benchmark.test.ts:80-82`). When prompts change, the hash changes, and snapshot-based tests detect the drift. However, the plan doesn't specify what happens when drift is detected.

**Amendment**: Add explicit snapshot lifecycle rules:

1. **Drift = test skip, not test failure**: When `promptTemplateHash` in a snapshot doesn't match the current prompt hash, the scenario is skipped (not failed). This is already the behavior — `runWithSnapshot()` validates the hash. Document this explicitly.

2. **Snapshot refresh procedure**: After prompt changes in Phase 1, all snapshot-based scenarios must be re-recorded:
   - Run `pnpm benchmark:record` (new script) which executes each snapshot scenario against a live LLM and writes updated snapshot files
   - New snapshots are committed alongside the prompt changes in the same PR
   - Phase 1 and Phase 4 tasks are sequenced so snapshot recording happens after prompt changes

3. **Snapshot version pinning**: Add a `snapshotVersion` field to `regression-suite.json` metadata. Increment on each prompt change cycle. CI can optionally warn if snapshot version is stale.

4. **CI guard**: The existing `benchmark-regression` CI job already handles this — if snapshots are stale, scenarios are skipped, which may cause the SC-001 threshold to be evaluated on fewer scenarios. Add an assertion: `runnableScenarios >= minimumRequired` (e.g., ≥80% of total scenarios must be runnable) to prevent a state where all snapshots are stale and the gate becomes vacuous.

---

## 7. Adapter lacks resource controls

**Verdict: VALID — hard limits must be defined**

The adapter plan clones repos, runs LLM reviews, and processes 50 PRs with no specified bounds.

**Amendment**: Add explicit resource controls to `scripts/benchmark-adapter.ts`:

| Control            | Default                        | Max  | Flag                   |
| ------------------ | ------------------------------ | ---- | ---------------------- |
| Concurrency        | 1                              | 5    | `--concurrency`        |
| Per-PR timeout     | 300s (5min)                    | 600s | `--timeout-per-pr`     |
| Max retries per PR | 1                              | 3    | `--max-retries`        |
| Clone cache        | Reuse existing clones          | —    | `--cache-dir`          |
| Disk space guard   | Abort if <2GB free             | —    | (automatic)            |
| Cleanup            | Delete clones after processing | —    | `--no-cleanup` to keep |
| Max total runtime  | 7200s (2h)                     | —    | `--max-runtime`        |

Additionally:

- Failed PRs are logged and skipped, not retried indefinitely
- Summary output includes: PRs attempted, succeeded, failed, skipped, total time, total findings
- Clone cache uses shallow clones (`--depth 1`) to minimize disk usage
- `--dry-run` flag runs the adapter without actual LLM calls (validates clone + format only)

---

## 8. Manual verification insufficient for benchmark scripts

**Verdict: VALID — automated tests required**

The plan currently says "Manual verification" for Phase 5 scripts. This is inadequate.

**Amendment**: Add automated tests for both scripts:

**`scripts/__tests__/benchmark-adapter.test.ts`**:

- Unit test: transforms a mock CLI JSON output to benchmark candidate format (no I/O)
- Unit test: handles empty findings array → empty candidate list
- Unit test: appends suggestion to text when present
- Unit test: sets `line: null` when finding has no line
- Unit test: skips PR on CLI failure (mocked `execSync` throwing)
- Integration test: runs adapter in `--dry-run` mode against a 1-PR fixture directory

**`scripts/__tests__/benchmark-check.test.ts`**:

- Unit test: all scores above thresholds → exit 0
- Unit test: precision below threshold → exit 1
- Unit test: recall below threshold → exit 1
- Unit test: missing results file → exit 2
- Unit test: invalid threshold arguments → exit 2

**CI dry-run test**: Add a step to the `benchmark-regression` CI job:

```yaml
- name: Smoke test benchmark scripts
  run: |
    npx tsx scripts/benchmark-check.ts \
      --results router/tests/fixtures/benchmark/mock-results/ \
      --min-precision 0.01 --min-recall 0.01 --min-f1 0.01
```

This validates that the scripts parse arguments and produce output without needing actual benchmark data.

---

## 9. Docker/CI secret handling lacks minimum-privilege specification

**Verdict: VALID — security hardening needed**

The plan doesn't specify which steps get which secrets, and doesn't address fork PR behavior.

**Amendment**: Add explicit secret scoping to the benchmark CI workflow:

1. **Step-level secret scoping** (not job-level):

   ```yaml
   - name: Run adapter (generate candidates)
     env:
       ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }} # Only this step
       GH_TOKEN: ${{ secrets.GH_TOKEN }} # For cloning
     # MARTIAN_API_KEY intentionally NOT available here

   - name: Run LLM judge
     env:
       MARTIAN_API_KEY: ${{ secrets.MARTIAN_API_KEY }} # Only this step
       MARTIAN_BASE_URL: https://api.withmartian.com/v1
     # ANTHROPIC_API_KEY intentionally NOT available here
   ```

2. **Fork PR restriction**: Benchmark workflow MUST NOT run on fork PRs (secrets unavailable anyway, but make it explicit):

   ```yaml
   if: github.event.pull_request.head.repo.full_name == github.repository || github.event_name != 'pull_request'
   ```

3. **Minimum permissions**:

   ```yaml
   permissions:
     contents: read
     # No write permissions — benchmark is read-only analysis
   ```

4. **Docker secret handling**: Docker compose MUST NOT bake secrets into the image:
   - Secrets passed via `--env-file` at runtime, not `ENV` in Dockerfile
   - `.env` file added to `.dockerignore`
   - Dockerfile build stage has no access to API keys

5. **Token audit table** in the plan:
   | Secret | Used By | Purpose | Scope |
   |--------|---------|---------|-------|
   | `ANTHROPIC_API_KEY` | Adapter step only | LLM review calls | Step-level |
   | `GH_TOKEN` | Adapter step only | Clone benchmark repos | Step-level, read-only |
   | `MARTIAN_API_KEY` | Judge step only | LLM judge evaluation | Step-level |
   | `GITHUB_TOKEN` | Upload artifacts | Upload results | Automatic, minimal |

---

## 10. 78.6% → 15% target is not operationalized

**Verdict: VALID — must tie phases to measurable deltas**

The plan states the overall target but doesn't show how each phase contributes or how progress is measured.

**Amendment**: Add incremental measurement gates per phase:

| Phase    | Gaps Addressed                                          | FPs Fixed (Expected) | Cumulative Addressed | Internal Benchmark Gate               |
| -------- | ------------------------------------------------------- | -------------------- | -------------------- | ------------------------------------- |
| Baseline | —                                                       | 9/42 already fixed   | 21.4% (9/42)         | SC-001 ≥ 85% (current: 100%)          |
| Phase 1  | Gap 1 (9), Gap 2 (5-7), Gap 3 (7), Gap 6 (2), Gap 7 (1) | 24-26 new            | ~79-83% (33-35/42)   | SC-001 ≥ 85% maintained               |
| Phase 2  | Gap 4 (3)                                               | 3 new                | ~86-90% (36-38/42)   | SC-001 ≥ 85% maintained               |
| Phase 3  | Gap 5 (2)                                               | 2 new                | ~90-95% (38-40/42)   | SC-001 ≥ 90% (raised threshold)       |
| Phase 4  | Test verification                                       | 0 (validation only)  | —                    | SC-001 ≥ 90% + all new scenarios pass |

**Verification method**: After each phase, run `pnpm vitest router/tests/integration/false-positive-benchmark.test.ts` and record:

- Total FP scenarios (before and after)
- FP suppression rate (must not decrease)
- TP recall (must remain 100%)
- New scenarios added (count)
- New scenarios passing (count — must equal added)

**Phase exit criteria**: Each phase MUST NOT merge to `main` unless:

1. All existing tests pass (4,068+)
2. All new scenarios for that phase pass
3. SC-001 ≥ threshold for that phase
4. SC-002 = 100% (TP recall unchanged)

**Final validation**: After Phase 4, the 42-FP audit trail shows:

- 9 already fixed (pre-existing)
- 29-31 fixed by this feature (Gaps 1-7)
- 2 architectural (deferred: cross-function taint, multi-language)
- Unaddressed ≤ 2/42 = 4.8% — well under the 15% target
