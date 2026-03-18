# Research: 417 Dogfood Quality Release

## R1: ExecutionPlan Immutability Pattern

**Decision**: Use `DeepReadonly<T>` utility type + branded factory function. No `Object.freeze()`.
**Rationale**: The codebase already uses branded types (`ValidatedConfig<T>`), `readonly` fields on Result/Error types, and `Readonly<>` in signals.ts. A `DeepReadonly<T>` utility is the natural extension. `Object.freeze()` is not used anywhere and adds runtime overhead without composing well with TypeScript's structural types.
**Alternatives considered**: (1) `Object.freeze()` at runtime — rejected, not used in codebase, runtime cost; (2) `as const` satisfaction — too limited for complex objects; (3) Immer.js — adds dependency, overkill for a single type.

## R2: ExecutionPlan Insertion Point

**Decision**: Construct the ExecutionPlan between config loading (line ~835) and the dry-run branch (line ~876) in `local-review.ts`. This is before ALL downstream consumers (dry-run, cost-only, dependency check, execution).
**Rationale**: The current flow has 14 stages threading ad-hoc local variables. The plan captures: filtered passes (each with agents), execution mode, resolved config, provider, model, limits. All 5 parameters to `executeAllPasses()` collapse into the plan.
**Alternatives considered**: (1) Insert after dependency check — rejected, dependency check itself needs the filtered passes; (2) New orchestrator module — rejected, over-engineering for this change.

## R3: FatalExecutionError Extension

**Decision**: Add `readonly partialResults?: ExecuteResult` to `FatalExecutionError`. Extend constructor options bag.
**Rationale**: The class (execute.ts:26-34) already uses an options bag with `cause?`. Adding `partialResults?` is additive and backward-compatible. The class is internal (never serialized to cache/wire).
**Alternatives considered**: (1) Separate `PartialExecutionResult` return type instead of throwing — rejected, too disruptive to callers; (2) Global mutable accumulator — rejected, violates immutability principle.

## R4: User-Suppression Pipeline Insertion

**Decision**: Insert as Stage 1.25 at `report.ts:110` (processFindings) and `report.ts:324` (applyFindingsPipeline), between `validateFindingsSemantics()` output and `filterFrameworkConventionFindings()` input.
**Rationale**: Both CI and CLI paths converge on these two locations. The finding pipeline is: Stage 1 (semantic) -> Stage 1.25 (user suppression) -> Stage 1.5 (framework) -> Stage 2 (diff-bound) -> Stage 3 (sanitize).
**Alternatives considered**: (1) Inside framework-pattern-filter — rejected, that file explicitly declares a closed matcher table; (2) After Stage 2 — rejected, suppressions should apply before diff normalization for accurate match counts.

## R5: Base-Branch Config Loading for CI Suppressions

**Decision**: Use `git show <base-ref>:.ai-review.yml` to load base-branch config. Extract only the `suppressions` section. Fall back to empty suppressions if base branch has no config or no suppressions field.
**Rationale**: Neither GitHub nor ADO reporters load config independently — config flows as a parameter from main.ts. A new `loadConfigFromRef(repoPath, gitRef)` utility is needed. Only the suppressions section is loaded from the base branch; all other config uses the PR checkout version.
**Alternatives considered**: (1) Use PR checkout config — rejected, allows attackers to smuggle suppressions; (2) Require suppressions in a separate file — rejected, splits config unnecessarily.

## R6: Finding Validation Deduplication

**Decision**: Remove Pass 3 (self-contradiction, lines 506-531) and Pass 3.5 (cautionary advice, lines 533-556) from `validateNormalizedFindings()`. Keep them only in `validateFindingsSemantics()`.
**Rationale**: Both passes are byte-for-byte identical between the two functions. Stage 1 always runs before Stage 2 in all pipelines (hosted, CLI, benchmark). The deprecated `validateFindings()` wrapper (line 659) should be updated to call `validateFindingsSemantics()` first.
**Alternatives considered**: (1) Leave duplicates as defense-in-depth — rejected, creates maintenance burden and masks bugs; (2) Extract to shared helper — rejected, the dedup IS the fix.

## R7: JSON Output Status Field

**Decision**: Add `"status"` field to root of `JsonOutput` interface in `terminal.ts:197`. Canonical enum: `complete`, `incomplete`, `gating_failed`, `config_error`. Compute in `generateJsonOutput()` at line 945.
**Rationale**: No `status` field exists currently. Consumers must infer state from `summary.errorCount`. The SARIF output (lines 230-275) also needs a custom property for status. Dry-run JSON (local-review.ts:556-586) already has `mode: 'dry-run'` — status follows the same pattern.
**Alternatives considered**: (1) Separate status endpoint — rejected, CLI tool doesn't serve endpoints; (2) Exit code only — rejected, spec explicitly requires machine-readable status.

## R8: Agent Registry Pattern

**Decision**: Extract `AGENT_REGISTRY` constant from existing `AgentSchema` enum in `schemas.ts:12-20`. The registry is an array of objects with `{ id, name, description, requiresExternalTool, requiresApiKey, builtIn }`. The `AgentSchema` Zod enum derives from `AGENT_REGISTRY.map(a => a.id)`. CLI help, docs tables, and error messages all read from the registry.
**Rationale**: The current `AgentSchema` is a bare string enum with no metadata. The registry adds metadata without changing the schema's runtime behavior. Config-time pass validation uses the registry to check agent existence and provider compatibility.
**Alternatives considered**: (1) Metadata in agent implementation files — rejected, requires importing all agents to validate config; (2) Separate JSON file — rejected, loses type safety.

## R9: Cache Orphan Cleanup

**Decision**: In `cleanupExpired()` (store.ts:242-278), add a scan for `ai-review-v*-*.json` files where the version differs from `CACHE_SCHEMA_VERSION`. Delete these orphans. Use `parseCacheKey()` (key.ts:66-89) which already handles both legacy and versioned formats.
**Rationale**: Current cleanup only scans files matching the current prefix (`ai-review-v2`). Old files (`ai-review-v1-*`) are invisible and accumulate forever. The `parseCacheKey()` function already extracts version info.
**Alternatives considered**: (1) Version migration — rejected as out of scope (spec explicitly excludes cache migration hooks); (2) Manual cleanup script — rejected, should be automatic.

## R10: Plan Serializer Redaction

**Decision**: Create a `serializeExecutionPlan(plan)` function that produces a deterministic JSON with alphabetical key ordering. Safe-field allowlist: `mode`, `passes` (name + agent IDs only), `provider`, `model`, `limits` (configured values only). Exclude: API keys, tokens, endpoints, paths, env vars, diff content, PR descriptions. Nondeterministic counters (file count, tokens, cost) excluded from canonical form.
**Rationale**: The plan must be snapshot-testable across dry-run, cost-only, and execute modes. Alphabetical key ordering and resolved (not merged-at-runtime) values ensure determinism. The allowlist approach is more secure than a denylist — only explicitly approved fields appear.
**Alternatives considered**: (1) Denylist approach — rejected, too easy to leak new fields; (2) Separate debug/canonical serializers — rejected, one canonical form is simpler.
