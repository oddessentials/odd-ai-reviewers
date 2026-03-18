# Implementation Plan: 417 Dogfood Quality Release

**Branch**: `417-dogfood-quality-release`
**Spec**: [spec.md](./spec.md)
**Research**: [research.md](./research.md)
**Data Model**: [data-model.md](./data-model.md)
**Contracts**: [contracts/](./contracts/)

---

## Technical Context

| Aspect          | Value                                              |
| --------------- | -------------------------------------------------- |
| Language        | TypeScript 5.9.3 (ES2022 target, NodeNext modules) |
| Runtime         | Node.js >= 22.0.0                                  |
| Validation      | Zod 4.x                                            |
| Testing         | Vitest 4.x                                         |
| CLI             | Commander 14.x                                     |
| Package Manager | pnpm 10.x                                          |
| CI              | GitHub Actions                                     |
| Release         | semantic-release                                   |

### Key Files (modification targets)

| File                                             | Phase | Purpose                                          |
| ------------------------------------------------ | ----- | ------------------------------------------------ |
| `router/src/cli/commands/local-review.ts`        | 1     | ExecutionPlan construction, pass/agent filtering |
| `router/src/cli/options/local-review-options.ts` | 1     | Agent ID validation                              |
| `router/src/config/schemas.ts`                   | 1,4   | Agent registry, SuppressionSchema                |
| `router/src/phases/execute.ts`                   | 4     | FatalExecutionError extension, plan consumption  |
| `router/src/phases/report.ts`                    | 3,4   | Stage 1.25 insertion, pipeline consolidation     |
| `router/src/report/finding-validator.ts`         | 3     | Blocklist fix, dedup removal                     |
| `router/src/report/framework-pattern-filter.ts`  | 3     | XSS matcher fix, helper extraction               |
| `router/src/report/terminal.ts`                  | 1,4   | JSON/SARIF status field                          |
| `router/src/cache/store.ts`                      | 4     | Orphan cleanup                                   |
| `docs/reference/cli.md`                          | 2     | Benchmark command, agent IDs, env vars           |
| `docs/configuration/config-schema.md`            | 2     | Missing sections                                 |
| `router/README.md`                               | 2     | Config examples                                  |
| `.husky/pre-push`                                | 5     | --bail=1                                         |
| `.releaserc.json`                                | 5     | Root version sync                                |

---

## Constitution Check

| Principle                        | Gate                                                                                                                    | Status                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| I. Router Owns All Posting       | No changes to posting                                                                                                   | PASS                    |
| II. Structured Findings Contract | Finding schema unchanged; RunStatus is additive                                                                         | PASS                    |
| III. Provider-Neutral Core       | No provider-specific changes in core                                                                                    | PASS                    |
| IV. Security-First Design        | Blocklist fix strengthens; suppressions mitigated by base-branch loading + breadth limits + security_override_allowlist | PASS (with mitigations) |
| V. Deterministic Outputs         | Plan serializer is canonical + alphabetical; no fingerprint changes                                                     | PASS                    |
| VI. Bounded Resources            | No limit changes; suppression rule cap (50) added                                                                       | PASS                    |
| VII. Environment Discipline      | No CI env changes; plan redaction prevents secret leakage                                                               | PASS                    |
| VIII. Explicit Non-Goals         | No scope expansion                                                                                                      | PASS                    |

---

## Implementation Phases

### Phase 1: CLI Pass/Agent Filtering (FR-001–007)

**Dependencies**: None (independent of all other phases)
**Estimated scope**: ~300 LOC across 5 files + ~200 LOC tests

#### Step 1.1: Agent Registry

**File**: `router/src/config/schemas.ts`

Create `AGENT_REGISTRY` array with metadata for each agent. Derive `AgentSchema` Zod enum from registry. Add `getAgentById()` and `getCompatibleAgents(provider)` helpers. Add config-time pass validation: unknown agents → error, duplicates → error, incompatible → error (required) or exclude (optional).

#### Step 1.2: ExecutionPlan Type

**New file**: `router/src/cli/execution-plan.ts`

Define `ExecutionPlan` interface with `DeepReadonly<T>` branding. Create `buildExecutionPlan(config, resolvedOptions, agentRegistry)` factory. Create `serializeExecutionPlan(plan)` for canonical JSON (alphabetical keys, safe-field allowlist, no secrets). Add golden snapshot test infrastructure.

**Implementation invariant — Empty-pass rule**: `buildExecutionPlan()` MUST enforce the empty-pass rule as a structural invariant at construction time. After all filtering (--pass, --agent, provider incompatibility exclusion) is applied:

- If a `required: true` pass has zero agents remaining, `buildExecutionPlan()` MUST throw a `ConfigError` with code `CONFIG_INVALID` and message: "Required pass '{name}' has no runnable agents after filtering". The caller translates this to exit code `2`.
- If a `required: false` pass has zero agents remaining, `buildExecutionPlan()` MUST remove it from `plan.passes` and add it to a `plan.skippedPasses` array (type `ReadonlyArray<{ name: string; reason: string }>`). The `skippedPasses` field MUST appear in both the canonical serialized plan and the `JsonOutput` as `"skipped_passes": [{"name": "...", "reason": "..."}]`.
- The plan MUST NOT contain any pass with an empty agents array. This is asserted at the end of `buildExecutionPlan()` and covered by a dedicated test: `plan.passes.every(p => p.agents.length > 0)`.

#### Step 1.3: Plan Integration

**File**: `router/src/cli/commands/local-review.ts`

Insert plan construction between config loading (~line 835) and dry-run branch (~line 876). Validate `--pass` name against config.passes. Validate `--agent` ID against agent registry. Apply combined filtering per FR-007. Feed plan to all downstream: `executeDryRun(plan)`, `executeCostOnly(plan)`, `checkDependenciesForPasses(plan.passes)`, `executeAllPasses(plan)`.

#### Step 1.4: RunStatus Enum and Exit Codes

**File**: `router/src/report/terminal.ts`

Add `RunStatus` enum: `complete`, `incomplete`, `gating_failed`, `config_error`. Add `status` field to `JsonOutput` interface. Compute status in `generateJsonOutput()`. Update SARIF output. Update `determineExitCode()` to use RunStatus.

**Implementation invariant — Status↔exit code binding in code**: The mapping MUST be enforced by a single `exitCodeFromStatus()` function that is the ONLY path to produce an exit code. No call site may hardcode an exit code number directly.

```
function exitCodeFromStatus(status: RunStatus): ExitCode {
  switch (status) {
    case 'complete':      return 0;
    case 'gating_failed': return 1;
    case 'config_error':  return 2;
    case 'incomplete':    return 3;
    default: assertNever(status);
  }
}
```

A compile-time guard (`assertNever`) ensures exhaustiveness — adding a new status without a mapping is a type error. A runtime assertion MUST enforce that exit code `1` is only reachable when `status === 'complete'` is false and `status === 'gating_failed'` is true: any code path that sets gating failure MUST first assert all agents completed. This is tested explicitly: every test asserting exit `1` co-asserts `status === 'gating_failed'`, and every test asserting `gating_failed` co-asserts no agent failures.

#### Step 1.5: Tests

- Golden snapshot tests for plan serialization (3 modes same input)
- Pass filtering: valid, invalid, disabled, empty-after-filter
- Agent filtering: valid, invalid, not-in-pass, multi-pass
- Combined --pass + --agent: compatible, incompatible
- Exit code mapping: status↔exit code invariants
- Provider incompatibility: required→error, optional→exclude

---

### Phase 2: Documentation Sync (FR-008–014, FR-024–025, FR-028)

**Dependencies**: Phase 1 (agent registry provides canonical ID list), Phase 4 (suppressions schema)
**Estimated scope**: ~500 lines of documentation

#### Step 2.1: CLI Reference Updates

**File**: `docs/reference/cli.md`

- Insert `### ai-review benchmark` section after line 296 (after config init, before Dependency Detection)
- Add agent ID reference table after `--agent` option (line 93) with link to config-schema.md
- Add pass name discovery note after `--pass` option (line 92)
- Expand environment variables table (lines 325-336): add OLLAMA*MODEL, LOCAL_LLM*_ (4), GITHUB*TOKEN, AZURE_DEVOPS_PAT, TELEMETRY*_ (6), FORCE_PRETTY, NO_COLOR

#### Step 2.2: Config Schema Documentation

**File**: `docs/configuration/config-schema.md`

- Add ADO reporting sub-section (modes, thread_status)
- Add `drift_gate` to gating section
- Add `provider` top-level property
- Add `models` top-level property
- Add `control_flow` top-level property
- Add `max_completion_tokens` to limits table
- Add `suppressions` section (after Phase 4 completes)
- Update Full Schema YAML example

#### Step 2.3: Router README Fix

**File**: `router/README.md`

Replace outdated config examples (lines 102-127) with current schema-accurate YAML including `version: 1`, correct pass names, `required` field.

#### Step 2.4: Version Sync and Release Config

**File**: `.releaserc.json`

Add root `package.json` to `@semantic-release/exec` prepareCmd and `@semantic-release/git` assets list.

#### Step 2.5: Example Files

- `.ai-review.yml.example`: Copy current `.ai-review.yml` with header comment. Update after Phase 4 to include `suppressions` example.
- `.env.example`: Expand with all provider/platform vars (Azure OpenAI, Ollama, LOCAL*LLM*\*, ADO tokens).

#### Step 2.6: CLAUDE.md Regeneration

1. `git rm --cached CLAUDE.md` (untrack from git)
2. Create `scripts/generate-claude-md.ts` (deterministic, manual-run only)
3. Regenerate with: consolidated tech stack, actual project structure, actual commands, preserved Manual Additions block

---

### Phase 3: Suppressor Fixes (FR-015–017)

**Dependencies**: None (independent of all other phases)
**Estimated scope**: ~150 LOC changes + ~100 LOC new tests

#### Step 3.1: SECURITY_BLOCKLIST Fix (FR-016)

**File**: `router/src/report/finding-validator.ts`, line 127

Change 6 prefix terms from bare prefixes to `prefix\w*`:

- `sanitiz` → `sanitiz\w*`
- `escap` → `escap\w*`
- `authenti` → `authenti\w*`
- `authoriz` → `authoriz\w*`
- `deseria` → `deseria\w*`
- `vulnerab` → `vulnerab\w*`

Add 8 test cases for inflected forms in `finding-validator.test.ts`.

#### Step 3.2: Error-Object-XSS Variable-Backed HTML (FR-015)

**File**: `router/src/report/framework-pattern-filter.ts`, lines 609-616

Add 4th sub-pattern after line 615: extract variable name from `res.send(varName)`, check if `varName = \`...<...\``or`varName = '...<...'`exists in nearbyText. Add 4 test cases in`framework-pattern-filter.test.ts`.

#### Step 3.3: Matcher Composability Helpers (FR-017)

**File**: `router/src/report/framework-pattern-filter.ts`

1. Extract `extractNearbyContext()` helper — replaces 4-line boilerplate in 8 matchers (~24 lines saved)
2. Extract `boundedVarPattern()` helper — replaces 13 inline `new RegExp` constructions (~26 lines saved)
3. Extract `RES_RESPONSE_SINK` constant — replaces 4 duplicate regexes

Pure refactor. Run full existing test suite to verify zero behavioral change.

---

### Phase 4: Architecture Improvements (FR-018–022)

**Dependencies**: FR-015/016/017 (Phase 3) MUST complete before FR-022. FR-018 SHOULD complete before FR-022.
**Estimated scope**: ~400 LOC across 8 files + ~250 LOC tests

#### Step 4.1: Cache Orphan Cleanup (FR-020)

**File**: `router/src/cache/store.ts`

In `cleanupExpired()`, add scan for `ai-review-v*-*.json` where version differs from `CACHE_SCHEMA_VERSION`. Delete orphans. Use existing `parseCacheKey()` for version extraction. Independent of all other steps.

#### Step 4.2: Finding Validation Deduplication (FR-018, FR-019)

**File**: `router/src/report/finding-validator.ts`

Remove Pass 3 (lines 506-531) and Pass 3.5 (lines 533-556) from `validateNormalizedFindings()`. Update deprecated `validateFindings()` (line 659) to call `validateFindingsSemantics()` first. Rename `ProcessedFindings.deduplicated` to `filtered` in `router/src/phases/report.ts` (or remove if confirmed dead code).

#### Step 4.3: FatalExecutionError Partial Results (FR-021)

**File**: `router/src/phases/execute.ts`

Add `readonly partialResults?: ExecuteResult` to `FatalExecutionError`. Populate at all 4 throw sites (lines 114, 137, 203, 232). Update catch blocks in `local-review.ts` (line 1042) and `main.ts` (line 1091) to extract and report partial results. Set check run conclusion to `neutral`. Set CLI exit code to `3` with `status: 'incomplete'`.

#### Step 4.4: User-Configurable Suppressions (FR-022)

**New file**: `router/src/report/user-suppressions.ts`
**Modified**: `router/src/config/schemas.ts`, `router/src/phases/report.ts`

1. Define `SuppressionsSchema` in schemas.ts (rules array, disable_matchers, security_override_allowlist)
2. Add `suppressions` to `ConfigSchema` as optional field
3. Create `filterUserSuppressions(findings, rules, mode)` in user-suppressions.ts
4. Insert Stage 1.25 in `processFindings()` (line 110) and `applyFindingsPipeline()` (line 324)
5. Implement breadth enforcement (CI hard fail at 20, override raises to 200)
6. Implement base-branch loading via `git show <base-ref>:.ai-review.yml`
7. Pass `disable_matchers` to `filterFrameworkConventionFindings()` to skip specified IDs
8. Add suppression match counts to JSON output

---

### Phase 5: DX & Polish (FR-023, FR-026–028)

**Dependencies**: All other phases complete (FR-024/025 need final schema)
**Estimated scope**: ~50 LOC code + ~200 lines config/docs

#### Step 5.1: Pre-Push Early Exit (FR-023)

**File**: `.husky/pre-push`, line 20

Change `pnpm --filter ./router test` to `pnpm --filter ./router test -- --bail=1`.

#### Step 5.2: Coverage Threshold Visibility (FR-026)

**File**: `router/package.json`

Add script: `"test:ci-thresholds": "CI=true vitest run --coverage"`.

#### Step 5.3: Issue #172 Closure (FR-027)

Close GitHub issue #172 as documented/won't-fix with rationale comment.

#### Step 5.4: Example Files Finalization (FR-024, FR-025)

Update `.ai-review.yml.example` and `.env.example` with final schema including `suppressions` section.

---

## Implementation Order (Critical Path)

```
Phase 1 (CLI filtering) ──────────────────────┐
Phase 3 (Suppressor fixes) ─────────┐         │
                                     ├─→ Phase 4 (Architecture) ─→ Phase 5 (DX)
Phase 2 (Docs — partial) ───────────┘         │
                                               │
Phase 2 (Docs — finalize) ←───────────────────┘
```

**Parallelizable**: Phase 1, Phase 3, and Phase 2 (partial) can all start simultaneously.
**Sequential**: Phase 4 depends on Phase 3. Phase 5 depends on all others.
**Final pass**: Phase 2 docs finalization happens last to reflect all schema changes.

---

## Test Strategy

| Phase | Test Type               | Key Scenarios                                                                                           |
| ----- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| 1     | Unit + Golden snapshots | Plan serialization determinism; pass/agent filtering; exit code mapping                                 |
| 2     | Linkcheck               | Doc links valid; config examples parse                                                                  |
| 3     | Unit                    | Blocklist inflected forms (10 cases); XSS variable HTML (4 cases); helper purity (existing suite)       |
| 4     | Unit + Integration      | Orphan cleanup; dedup removal; partial results through error; suppression matching; breadth enforcement |
| 5     | Manual                  | Pre-push bail; coverage script; issue closure                                                           |

---

## Rollback Plan

Each phase is independently deployable. If any phase introduces regressions:

1. Revert the phase's commits
2. Other phases remain intact (no cross-phase runtime dependencies except Phase 4 → Phase 3)
3. Phase 2 (docs) is always safe to revert (no code impact)
