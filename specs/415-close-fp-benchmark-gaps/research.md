# Research: Close All 12 Unsuppressed FP Benchmark Scenarios

**Feature Branch**: `415-close-fp-benchmark-gaps`
**Date**: 2026-03-13
**Status**: Complete — all unknowns resolved

## R-001: Prompt Convention Sync Mechanism

**Decision**: Use existing `pnpm prompts:sync` script (`scripts/sync-prompt-conventions.ts`) which reads `_shared_conventions.md` and generates `router/src/prompts/shared-conventions.generated.ts`. CI enforces sync via `pnpm prompts:check`.

**Rationale**: The mechanism already exists and is proven. New rules added to `_shared_conventions.md` (after line 43, before Active Context Directives at line 45) will be automatically propagated to all 4 prompt files (`semantic_review.md`, `opencode_system.md`, `pr_agent_review.md`, `architecture_review.md`) via marker replacement.

**Alternatives considered**: (1) Inline rules per prompt file — rejected due to drift risk. (2) TypeScript constant injection — rejected; the Markdown sync mechanism is the established pattern.

## R-002: Framework Pattern Filter Extension Pattern

**Decision**: Add T025 and T026 as new entries in the `FRAMEWORK_MATCHERS` const array in `framework-pattern-filter.ts` (after line 260, before `] as const`). Widen T019's `messagePattern` regex to include new phrases. Update the closed-set comment at lines 8-9 from "5 matchers" to "7 matchers".

**Rationale**: The matcher table uses a simple const array of objects conforming to the `FrameworkPatternMatcher` type. Each matcher has `id`, `name`, `messagePattern`, `evidenceValidator()`, `suppressionReason`. The existing T019 evidence validator (lines 126-159) validates 4-param function + Express indicator — the same validator is reused for widened phrases (FR-014 evidence coupling invariant).

**Alternatives considered**: (1) Separate filter chain — rejected; the closed-table design is deliberate and provides audit-trail per the constitution. (2) Dynamic matcher loading from config — rejected; matchers must be code-reviewed, not user-configurable.

## R-003: CLI Post-Processing Pipeline Gap

**Decision**: Extract the 4 shared post-processing stages from `report.ts` (lines 91-115) into a shared function, then call it from `local-review.ts` before `reportToTerminal()`.

**Rationale**: The current pipeline in `report.ts` runs: (1) sanitize → (2) `validateFindingsSemantics()` → (3) `filterFrameworkConventionFindings()` → (4) sort. Platform reporters (github.ts, ado.ts) additionally run `normalizeAndValidateFindings()` (Stage 2). Local-review skips all 4 stages. The shared function should accept findings + diff content and return filtered findings.

**Implementation approach**:

- Create `processFindings(findings, diffContent, prDescription?)` in a new shared module or extend `report.ts`
- Call from `local-review.ts` at line ~1077, before `reportFn()`
- The 4 stages: sanitize → Stage 1 semantic → framework filter → Stage 2 diff-bound
- PR intent filtering is gated on `prDescription` being present — automatically skipped in CLI mode

**Alternatives considered**: (1) Duplicate pipeline in local-review.ts — rejected; violates DRY. (2) Route local-review through report.ts — rejected; report.ts is tightly coupled to platform context.

## R-004: Snapshot Drift Handling — Two-Part Gate

**Decision**: Modify `runWithSnapshot()` in `adapter.ts` (lines 379-435) to differentiate fixture hash drift (hard failure) from prompt hash drift (hard failure with re-record instruction). Both are hard failures but with distinct error messages.

**Rationale**: The current implementation already throws on any drift (line 399-403). The spec v3 strengthens this to ensure prompt changes always require snapshot re-recording before merge. The differentiation helps developer UX — a fixture drift error says "scenario changed" while a prompt drift error says "re-record with pnpm benchmark:record".

**Implementation**:

```typescript
const fixtureDrift = driftCheck.drifted.find((d) => d.field === 'fixtureHash');
if (fixtureDrift) {
  throw new Error(`Fixture drift: ${scenarioId} — diff content changed. Re-record.`);
}
const promptDrift = driftCheck.drifted.find((d) => d.field === 'promptTemplateHash');
if (promptDrift) {
  throw new Error(`Prompt drift: ${scenarioId} — re-record with 'pnpm benchmark:record'.`);
}
```

**Alternatives considered**: (1) Warn-only for prompt drift — rejected per Critique B; weakens trust. (2) Skip replay on drift — rejected; defeats the purpose of CI benchmark gate.

## R-005: Per-Scenario Gate Implementation

**Decision**: Add a dedicated `SC-001` test in `false-positive-benchmark.test.ts` that iterates over the 11 targeted scenario IDs and asserts each individually produces 0 findings. Keep the aggregate SC-004 test as a secondary sanity check.

**Rationale**: The existing `it.each` tests already fail per-scenario, but the release gate metric (line 634) only checks aggregate rate. Adding the per-scenario gate test makes the CI failure message explicit: "fp-b-001 failed: 2 surviving findings" rather than "aggregate rate 88% < 90%".

**Implementation**: Add a new `it()` block after line 673 with a `Set<string>` of 11 targeted IDs. Loop over scenarios, run each, collect failures, assert `failures.length === 0` with descriptive message.

**Alternatives considered**: (1) Rely on existing `it.each` only — rejected; the release gate section needs to reflect the per-scenario contract. (2) Replace aggregate gate entirely — rejected; it still catches regressions in the 25 existing scenarios.

## R-006: T025 Safe Local File Read — Regex Design

**Decision**: Use the canonical regex from the spec: `/path\.(join|resolve)\s*\(\s*(?:__dirname|__filename|import\.meta\.(?:dirname|filename|url))\s*(?:,\s*['"][^'"]*['"]\s*)*\)/`

**Rationale**: Single-line only (per Critique C). The regex matches `path.join` or `path.resolve` with an allowed base as the first argument and string literals as subsequent arguments. The rejection list is implicit: anything not matched by the regex passes through. The `evidenceValidator` searches `extractLinesNearFinding(diffContent, finding, 10)` for a line matching this regex.

**Test coverage**: 5 positive (one per allowed base), 8 negative (variable, function call, property access, computed expression, template interpolation, process.env, req.\*, alias), plus multi-line rejection.

**Alternatives considered**: (1) AST-based matching — rejected; matchers operate on diff text, not parsed AST. (2) Multi-line support — rejected per spec (conservative default, 85-90% coverage acceptable).

## R-007: T026 Exhaustive Switch — Evidence Detection

**Decision**: Use two-part evidence: (1) `switch` keyword within 10 lines of finding, (2) TypeScript string literal union type declaration in the same diff section. Safety constraint: reject if switch target is `string`, `number`, or untyped.

**Rationale**: The existing `extractLinesNearFinding()` (default window 10 lines) provides the context. The union type pattern `/\btype\s+\w+\s*=\s*(['"][^'"]+['"]\s*\|)/` catches declarations like `type Theme = 'light' | 'dark'`. The safety constraint regex `/switch\s*\(\s*\w+\s*:\s*(?:string|number)\s*\)/` catches untyped switches.

**Alternatives considered**: (1) Count case labels vs union members — rejected; too complex for diff-text analysis. (2) Require `assertNever()` pattern — rejected; T021 already handles that case.

## R-008: DISMISSIVE_PATTERNS Expansion

**Decision**: Add 4 new patterns to `DISMISSIVE_PATTERNS` array in `finding-validator.ts` (line 80): `"working as intended"`, `"no issues found"`, `"non-critical"`, `"low priority"`. Add a JSDoc comment above the array explaining the three-gate dependency.

**Rationale**: These patterns were identified in benchmark analysis as phrases LLMs occasionally produce that indicate non-actionable findings. The existing three-gate architecture (info severity + pattern match + no actionable suggestion) ensures these patterns alone never suppress a finding — all three conditions must be met.

**Alternatives considered**: (1) Regex patterns — rejected; simple substring matching (case-insensitive) is sufficient and more readable. (2) Separate pattern list per category — rejected; the array is small (9 total after addition) and a flat list is simpler.

## R-009: fp-d-006 Reclassification — Expected Finding Shape

**Decision**: Use `{ file: "src/auth.ts", severityAtLeast: "warning", messageContains: "token" }` matching the `ExpectedFinding` interface used by all 18 existing TP scenarios.

**Rationale**: The QA research confirmed that all existing TP scenarios use only `file` + `messageContains`, with optional `severityAtLeast`. The fp-d-006 diff shows a raw token passed as POST body — the LLM should flag this as a security concern. The `"token"` substring is present in all reasonable phrasings while being narrow enough to exclude unrelated findings.

**Alternatives considered**: (1) Full regex match on message — rejected; over-constrains to one LLM's phrasing, breaks cross-provider portability. (2) No severity floor — rejected; an info-level mention of "token" is not a genuine security detection.

## R-010: Fixture Modifications — Integrity Verification

**Decision**: Apply fixture integrity rule (FIR-1 through FIR-4) from the spec. Verify modifications by examining the fixture diff:

- **fp-c-005**: Add only `prDescription` field. Do not modify `diff` content. Existing PR intent filter handles suppression.
- **fp-f-005**: Add `catch (error) { ... }` wrapper around the existing `renderError(error.message)` pattern. The `error.message` in template literal MUST remain — this is the FP trigger. The current diff has `error: Error` type annotation but no `catch` clause.
- **fp-f-015**: Verify current fixture. The existing diff (`return JSON.parse(input)`) already meets all FR-017c requirements. No modification needed.
- **fp-d-006**: Change `truePositive: false` → `true`, change `expectedFindings: []` → `[{ file: "src/auth.ts", severityAtLeast: "warning", messageContains: "token" }]`.

**Alternatives considered**: (1) Rewrite fixtures from scratch — rejected; FIR-1 requires preserving the original pattern. (2) Leave fixtures as-is — rejected; fp-c-005 is missing `prDescription`, fp-f-005 lacks `catch` context, fp-d-006 is mis-classified.

## R-011: Benchmark Smoke Test Thresholds

**Decision**: Update `ci.yml` benchmark-check step and `scripts/benchmark-check.ts` mock results to use external benchmark targets: precision >= 0.40, recall >= 0.30, F1 >= 0.35. Current values are vacuous 0.01.

**Rationale**: The mock results in `router/tests/fixtures/benchmark/mock-results/summary.json` must be updated to reflect the improved benchmark scores. The thresholds should match the external benchmark targets from `benchmark.yml`.

**Implementation**: Update `summary.json` mock data with realistic post-improvement scores. Update `ci.yml` lines ~310-312 to use the new thresholds.

**Alternatives considered**: (1) Use actual benchmark scores dynamically — rejected; CI mock data must be static and deterministic. (2) Set thresholds even higher — rejected; the external benchmark targets are the documented standard.
