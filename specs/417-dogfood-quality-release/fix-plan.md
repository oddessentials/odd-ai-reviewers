# Fix Plan: Three Spec-Violation Bugs (v2)

Three implementation gaps where code contradicts spec. Each fix traced to the exact spec requirement, root cause, code locations, and mandatory regression tests.

---

## Fix 1 (P1): Canonical run-status contract for hosted reporters

### Problem

**Spec FR-021**: "CI mode: Check run conclusion MUST be `neutral` when partial results are reported."

In `main.ts:1144-1160`, the partial-results catch block calls `dispatchReport()` which calls `reportToGitHub()` → `createCheckRun()`. At `github.ts:292-308`, conclusion is computed from `config.gating` — an incomplete run with error-severity findings publishes as `failure` before `finalizeCheckRun('neutral')` at line 1168 can override it (the check run is already completed). ADO has the same issue.

**Root cause**: Hosted reporters derive conclusion from gating config independently. There is no shared run-status concept flowing from the same `RunStatus` enum that drives CLI exit codes and JSON `status` field.

### Fix

Introduce a single `RunStatus` parameter into the reporting contract so hosted, terminal, and exit-code paths all read from the same source. No ad hoc override flag.

1. **`router/src/phases/report.ts:60-68`** — Add `runStatus?: RunStatus` to `ReportOptions`. Import `RunStatus` from `execution-plan.ts`.

2. **`router/src/report/github.ts:281-308`** — `createCheckRun()` receives `runStatus`. Conclusion derivation becomes:

   ```
   if (runStatus === 'incomplete') → conclusion = 'neutral'
   else → derive from gating config (existing logic)
   ```

   The `runStatus` check comes FIRST, before gating evaluation. This enforces the spec's precedence rule: incomplete always wins over gating_failed.

3. **`router/src/report/ado.ts`** — Same pattern: if `runStatus === 'incomplete'`, post status as `pending` (ADO's equivalent of neutral), not `succeeded`/`failed`.

4. **`router/src/main.ts:1144-1168`** — Pass `runStatus: 'incomplete'` in the partial-results `dispatchReport()` call. Remove the redundant `finalizeCheckRun('neutral')` at line 1168 — the reporter now handles it. The normal (complete) path passes `runStatus: 'complete'` explicitly.

5. **`router/src/main.ts` normal path** — The existing `dispatchReport()` call for complete runs should pass `runStatus: 'complete'` (or omit, defaulting to `'complete'`). This makes the contract explicit everywhere.

### Files

- `router/src/phases/report.ts` — `ReportOptions.runStatus`
- `router/src/report/github.ts` — Thread `runStatus` to `createCheckRun()`; conclusion override
- `router/src/report/ado.ts` — Thread `runStatus`; status override
- `router/src/main.ts` — Pass `runStatus` at both dispatch sites

### Mandatory Regression Test

**"Incomplete run with findings above gating threshold publishes neutral, never failure"**:

- Setup: config with `gating.enabled: true, fail_on_severity: 'error'`, 5 error-severity findings from a completed agent, required agent crashed
- Assert: `reportToGitHub()` is called with conclusion `'neutral'`, NOT `'failure'`
- Assert: exit code is `3` (incomplete), NOT `1` (gating_failed)
- This test goes in `router/tests/unit/phases/report.test.ts` or a new `hosted-incomplete.test.ts`

---

## Fix 2 (P2): Enforce full anchoring on suppression message patterns

### Problem

**Spec FR-022**: "Message patterns MUST be anchored — reject patterns that match every possible string at config validation time."

In `schemas.ts:245-251`, validation only rejects three literals (`.*`, `""`, `^.*$`). `"error handling"` passes validation and is used as `new RegExp("error handling")` in `user-suppressions.ts:68` — matching any finding containing that substring anywhere, which is broader than intended.

**Root cause**: Validation checks a denylist of bad patterns instead of enforcing anchoring structure.

### Fix

Require BOTH start and end anchoring to be explicit. The pattern must start with `^` AND end with `$`. This forces users to declare their full matching intent:

- `^missing error handling$` — exact match (most precise)
- `^missing error handling` — rejected (no `$` — ambiguous end boundary)
- `^.*missing error handling.*$` — explicit substring opt-in (user acknowledges breadth)
- `error handling` — rejected (no anchors — ambiguous on both ends)

**Why both anchors**: A start-only anchor like `^error handling` still matches `"error handling in auth module is a security concern"` — the regex engine doesn't stop at the end of the pattern string. Without `$`, the user hasn't specified where matching should stop. Requiring both anchors eliminates this ambiguity class entirely.

1. **`router/src/config/schemas.ts:245-251`** — Replace the denylist refine with:

   ```typescript
   (rule) => {
     if (rule.message === undefined) return true;
     if (rule.message.length === 0) return false;
     return rule.message.startsWith('^') && rule.message.endsWith('$');
   };
   ```

   Error message: `"Message pattern must be fully anchored (start with ^ and end with $). Got: '{pattern}'. Use '^{pattern}$' for exact match or '^.*{pattern}.*$' for substring matching."`

2. **`router/src/report/user-suppressions.ts:68`** — No change needed. `new RegExp("^...pattern...$")` is already correct — the anchors in the pattern string control matching.

3. **`router/tests/unit/config/suppressions-schema.test.ts`** — Update existing tests and add new ones.

### Files

- `router/src/config/schemas.ts` — Anchoring refine replacement
- `router/tests/unit/config/suppressions-schema.test.ts` — Test updates

### Mandatory Regression Test

**"Unanchored message pattern rejected at config load"**:

- `message: "error handling"` → Zod validation error containing "fully anchored"
- `message: "^error handling"` → Zod validation error (missing `$`)
- `message: "^error handling$"` → passes validation
- `message: "^.*error handling.*$"` → passes validation
- `message: ".*"` → rejected (no `^`)
- `message: "^.*$"` → passes (explicit breadth acknowledgement — breadth limits still apply at runtime)

---

## Fix 3 (P2): Unified suppression visibility across all output paths

### Problem

**Spec FR-022**: "Suppressed finding counts MUST be visible in the review summary output, not just in debug logs."

`suppressionSummary` is threaded into JSON output (`terminal.ts:992-993`) but never shown in pretty terminal output. The `generateSummary()` function (line 818) has no access to suppression data. The partial-results path in `local-review.ts` also threads `suppressionSummary` but only to JSON — a pretty-mode incomplete run hides suppression counts too.

**Root cause**: Suppression summary is treated as a JSON-only concern instead of a cross-format contract.

### Fix

Create a shared `SuppressionSummaryLine` formatter used by all output paths, then thread it through every path that generates user-visible output.

1. **`router/src/report/terminal.ts`** — Add a shared formatter function:

   ```typescript
   export function formatSuppressionLine(
     summary: { reason: string; matched: number }[],
     colored: boolean
   ): string | null {
     if (!summary || summary.length === 0) return null;
     const totalSuppressed = summary.reduce((sum, s) => sum + s.matched, 0);
     const ruleCount = summary.length;
     const c = createColorizer(colored);
     return c.yellow(
       `   Suppressed:  ${totalSuppressed} (by ${ruleCount} rule${ruleCount !== 1 ? 's' : ''})`
     );
   }
   ```

2. **`router/src/report/terminal.ts:818-827`** — Add `suppressionSummary?` parameter to `generateSummary()`. After the info label line (~line 848), call `formatSuppressionLine()` and push the result if non-null.

3. **`router/src/report/terminal.ts:1279`** — Pass `options.suppressionSummary` to `generateSummary()` in the pretty branch.

4. **Verify JSON path** — Already handled at lines 992-993. No change needed, but add a test that asserts JSON and pretty show the same counts.

5. **Verify partial-results path** — In `local-review.ts`, the partial-results catch block already passes `suppressionSummary` in `TerminalReportOptions`. Once `generateSummary()` accepts it, both complete and incomplete pretty output show suppression counts.

### Files

- `router/src/report/terminal.ts` — `formatSuppressionLine()` shared formatter; `generateSummary()` parameter addition; pretty branch threading

### Mandatory Regression Test

**"Pretty output shows suppression counts when rules match"**:

- Setup: 10 findings, 2 suppression rules matching 3 findings total
- Assert: pretty output contains `Suppressed:  3 (by 2 rules)` in the summary section
- Assert: JSON output contains `"suppressions": [{"reason": ..., "matched": ...}, ...]`
- Assert: pretty output WITHOUT suppressions does NOT contain "Suppressed" line

**"Partial-results pretty output also shows suppression counts"**:

- Setup: incomplete run with active suppressions
- Assert: pretty output contains both "Incomplete review" header AND "Suppressed: N" in summary

---

## Implementation Order

1. **Fix 2** (schema validation) — simplest, no dependencies, prevents bad configs immediately
2. **Fix 3** (suppression visibility) — additive, prepares the shared formatter
3. **Fix 1** (hosted reporters) — most complex, builds on the `RunStatus` type already in codebase

## Merge Gate: 3 Mandatory Regression Tests

These three tests are the minimum bar. The PR cannot merge without all three passing:

| Test                                   | Asserts                                                                                 | File                          |
| -------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------- |
| Incomplete + above-threshold → neutral | `conclusion === 'neutral'` AND `exitCode === 3` despite error findings exceeding gating | `hosted-incomplete.test.ts`   |
| Unanchored message pattern rejected    | `"error handling"` fails Zod parse; `"^error handling$"` passes                         | `suppressions-schema.test.ts` |
| Pretty output shows suppression counts | Output contains `Suppressed: N (by M rules)` when active; absent when inactive          | `terminal.test.ts`            |

## Post-Fix Verification

After all three fixes:

1. `pnpm --filter ./router test` — full suite green
2. `pnpm typecheck` — clean
3. `pnpm lint` — clean
4. `pnpm build` — clean
5. Verify the three mandatory regression tests exist and pass
6. Grep: `grep -rn 'conclusion' router/src/report/github.ts` — confirm `runStatus === 'incomplete'` check precedes gating logic
7. Grep: `grep -rn "startsWith.*\^.*endsWith.*\\\$" router/src/config/schemas.ts` — confirm anchoring enforcement
8. Grep: `grep -rn "formatSuppressionLine" router/src/report/terminal.ts` — confirm shared formatter used in pretty path
