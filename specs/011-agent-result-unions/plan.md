# Implementation Plan: AgentResult Discriminated Unions

**Branch**: `011-agent-result-unions` | **Date**: 2026-01-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-agent-result-unions/spec.md`

## Summary

Refactor the `AgentResult` interface from a boolean-flagged struct (`success: boolean`) to a discriminated union with explicit status variants (`'success' | 'failure' | 'skipped'`). This enables compile-time exhaustiveness checking via `assertNever` and type-safe field access per variant.

**Key Changes:**

- Replace `AgentResult` interface with `AgentResult` union type
- Add `AgentSuccess`, `AgentFailure`, `AgentSkipped` constructor helpers (locked as only factory path)
- `AgentFailure` uses `partialFindings` (not `findings`) + `failureStage` field
- Migrate 13 production files that consume or produce `AgentResult` (7 agents + 6 consumers)
- Add typed metadata helpers in isolated module (`agents/metadata.ts`)
- Add serialization contract (Zod schema) + round-trip tests
- Add lint/CI check to ban `result.success` **unconditionally after Phase 1**
- Add tsd-style canary test for exhaustiveness (no compile-fail approach)

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.x (schema validation), Vitest 4.x (testing)
**Storage**: N/A (in-memory agent results only, but serialization contract required for cache/store.ts)
**Testing**: Vitest with hermetic test utilities
**Target Platform**: Node.js >=22.0.0, Linux CI (OSCR-compatible)
**Project Type**: Single project (router package)
**Performance Goals**: Zero runtime overhead from type changes (compile-time only)
**Constraints**: Each phase must pass all CI checks before commit (FR-022/023/024)
**Scale/Scope**: 13 production files to migrate (7 agent implementations + 6 consumers), plus types.ts refactor

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                                                        |
| -------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | No change to posting behavior                                                                |
| II. Structured Findings Contract | ✅ Pass | Finding interface unchanged (metadata helpers additive, isolated module)                     |
| III. Provider-Neutral Core       | ✅ Pass | AgentResult is provider-agnostic                                                             |
| IV. Security-First Design        | ✅ Pass | No new input handling                                                                        |
| V. Deterministic Outputs         | ✅ Pass | Type changes don't affect output determinism; serialization contract ensures shape stability |
| VI. Bounded Resources            | ✅ Pass | No resource changes                                                                          |
| VII. Environment Discipline      | ✅ Pass | No environment changes                                                                       |
| VIII. Explicit Non-Goals         | ✅ Pass | Internal refactoring only                                                                    |

**Quality Gates:**

- Zero-Tolerance Lint: Must pass after migration (FR-022)
- Dependency Architecture: No new dependencies, no circular imports; metadata.ts has zero back-edges (FR-028)
- Local = CI Parity: Pre-commit hooks must pass; no exceptions for pre-existing failures (FR-023/024)

## Project Structure

### Documentation (this feature)

```text
specs/011-agent-result-unions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (type contracts)
│   └── agent-result.ts  # Type contract specification
├── checklists/
│   └── requirements.md  # Specification quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/src/
├── agents/
│   ├── types.ts              # PRIMARY: AgentResult refactor + Zod schema
│   ├── index.ts              # Re-exports AgentResult
│   ├── metadata.ts           # NEW: Typed metadata helpers (ISOLATED - zero back-edges)
│   ├── opencode.ts           # Returns AgentResult (4 locations)
│   ├── pr_agent.ts           # Returns AgentResult (4 locations)
│   ├── ai_semantic_review.ts # Returns AgentResult (4 locations)
│   ├── semgrep.ts            # Returns AgentResult (3 locations)
│   ├── reviewdog.ts          # Returns AgentResult (4 locations)
│   ├── local_llm.ts          # Returns AgentResult (7 locations)
│   └── control_flow/
│       └── index.ts          # Returns AgentResult (3 locations)
├── phases/
│   ├── execute.ts            # Consumes AgentResult (2 boolean checks)
│   └── report.ts             # Consumes AgentResult (2 boolean checks)
├── cache/
│   └── store.ts              # Stores/retrieves AgentResult (uses Zod schema for validation)
├── report/
│   └── formats.ts            # Formats AgentResult (1 boolean check)
├── telemetry/
│   └── index.ts              # Emits telemetry (1 boolean check)
├── security-logger.ts        # Logs errors (1 boolean check)
└── types/
    ├── assert-never.ts       # Already exists - exhaustive switch helper
    └── index.ts              # Will export new AgentResult types

router/src/__tests__/
├── agents/
│   ├── types.test.ts         # NEW: AgentResult discriminated union tests
│   └── metadata.test.ts      # NEW: Metadata helpers tests (verify isolation)
├── integration/
│   ├── cache-behavior.test.ts        # Add round-trip test (FR-014/FR-025)
│   ├── exhaustiveness-canary.test.ts # NEW: tsd-style canary (FR-018)
│   └── partial-findings.test.ts      # NEW: Verify partialFindings not counted as success (FR-027)
└── quickstart-validation.test.ts     # Uses AgentResult (type import)

scripts/ or CI config
└── check-success-ban.sh      # Grep check for .success usage (allowlist: main.ts + migration file)
└── check-literal-ban.sh      # Grep check for status: 'success' literals (allowlist: types.ts only)
```

**Structure Decision**: Single project (router package). All changes are within `router/src/`. Type definitions live in `router/src/agents/types.ts` with re-exports through `router/src/types/index.ts`. Metadata helpers isolated in `router/src/agents/metadata.ts` with depcruise-enforced zero back-edges.

## Migration Strategy

### Phase 1: Core Type Definition + Enforcement Setup

1. Define new discriminated union types alongside existing interface
2. Add Zod schema for AgentResult serialization contract (FR-025)
3. Add constructor helpers (`AgentSuccess`, `AgentFailure`, `AgentSkipped`)
4. Add type guards (`isSuccess`, `isFailure`, `isSkipped`)
5. Add temporary deprecated `success` getter for migration (will be deleted before merge)
6. Add typed metadata helpers in `agents/metadata.ts` (isolated, zero back-edges) (FR-028)
7. **Add grep check for `.success` with allowlist: `router/src/main.ts` + `migration-allowlist.txt`** (FR-019)
8. **Add grep check for `status: 'success'` literals with allowlist: `agents/types.ts` only** (FR-026)
9. Add tsd-style canary test using `satisfies` + exhaustive switch (FR-018)
10. Add round-trip serialization test for all variants (FR-014/FR-025)
11. Add integration test proving `partialFindings` doesn't increment success metrics (FR-027)
12. All existing code continues to work unchanged
13. **Commit after CI passes**

### Phase 2: Agent Migration

For each agent (can be parallelized):

1. Import constructor helpers
2. Replace object literals with constructor calls
3. Use `partialFindings` for failure cases
4. Add `failureStage` to failure returns
5. Remove agent from `migration-allowlist.txt` as migrated
6. Verify agent tests pass
7. **Commit after CI passes** (one commit per agent or batch)

### Phase 3: Consumer Migration

For each consumer file:

1. Replace `if (result.success)` with `switch (result.status)`
2. Add `assertNever` to switch statements
3. Update telemetry to key off `status` explicitly
4. Label `partialFindings` as partial in reports (day 1 - already enforced by FR-027 test)
5. Remove file from `migration-allowlist.txt` as migrated
6. Verify tests pass
7. **Commit after CI passes**

### Phase 4: Cleanup

1. Remove `migration-allowlist.txt` entirely (grep check now unconditional everywhere except main.ts)
2. Remove deprecated `success` getter (FR-021)
3. Verify no boolean-based success logic remains (FR-020, SC-008)
4. Verify all grep checks pass with no allowlist exceptions
5. Final test pass
6. **Commit after CI passes**

## File Impact Analysis

### High Impact (core type changes)

- `router/src/agents/types.ts` - Type definition refactor + Zod schema

### Medium Impact (create AgentResult)

- `router/src/agents/opencode.ts` - 4 return sites
- `router/src/agents/pr_agent.ts` - 4 return sites
- `router/src/agents/ai_semantic_review.ts` - 4 return sites
- `router/src/agents/semgrep.ts` - 3 return sites
- `router/src/agents/reviewdog.ts` - 4 return sites
- `router/src/agents/local_llm.ts` - 7 return sites
- `router/src/agents/control_flow/index.ts` - 3 return sites

### Low Impact (consume AgentResult)

- `router/src/phases/execute.ts` - 2 boolean checks
- `router/src/phases/report.ts` - 2 boolean checks
- `router/src/report/formats.ts` - 1 boolean check
- `router/src/telemetry/index.ts` - 1 boolean check
- `router/src/security-logger.ts` - 1 boolean check
- `router/src/cache/store.ts` - Uses Zod schema for validation

### New Files

- `router/src/agents/metadata.ts` - Typed metadata helpers (isolated)
- `router/src/__tests__/agents/types.test.ts` - Unit tests for AgentResult + serialization
- `router/src/__tests__/agents/metadata.test.ts` - Metadata helpers tests
- `router/src/__tests__/integration/exhaustiveness-canary.test.ts` - tsd-style canary test
- `router/src/__tests__/integration/partial-findings.test.ts` - partialFindings exclusion test
- `scripts/check-success-ban.sh` (or CI step) - Grep check for `.success`
- `scripts/check-literal-ban.sh` (or CI step) - Grep check for object literals
- `migration-allowlist.txt` - Temporary allowlist (deleted in Phase 4)

### No Code Changes (type imports only)

- `router/src/agents/index.ts` - Re-export
- `router/src/__tests__/quickstart-validation.test.ts` - Type import

## Enforcement Mechanisms

### Compile-Time (FR-011, FR-013)

- Discriminated union prevents invalid field access
- `assertNever` in switch default catches missing cases
- Constructor functions enforce valid field combinations

### Lint/CI-Time (FR-019, FR-026, FR-022-024)

**`.success` ban (FR-019)** - Unconditional after Phase 1:

```bash
# check-success-ban.sh
grep -rn '\.success\b' router/src --include='*.ts' | \
  grep -v 'router/src/main.ts' | \
  grep -v -f migration-allowlist.txt
# Exit 1 if any matches (after Phase 4, remove allowlist entirely)
```

**Object literal ban (FR-026)**:

```bash
# check-literal-ban.sh
grep -rn "status: ['\"]success['\"]" router/src --include='*.ts' | \
  grep -v 'router/src/agents/types.ts'
# Also check 'failure' and 'skipped' literals
# Exit 1 if any matches
```

### Test-Time (FR-014, FR-018, FR-025, FR-027)

**Canary test (FR-018)** - tsd-style, no compile-fail:

```typescript
import { expectType } from 'tsd';

// Type-level exhaustiveness check using satisfies
type ExhaustiveCheck = {
  [K in AgentResultStatus]: (r: Extract<AgentResult, { status: K }>) => string;
};

const handlers = {
  success: (r) => r.findings.length.toString(),
  failure: (r) => r.error,
  skipped: (r) => r.reason,
} satisfies ExhaustiveCheck;

// Runtime exhaustiveness via assertNever
function exhaustiveLabel(result: AgentResult): string {
  switch (result.status) {
    case 'success':
      return 'ok';
    case 'failure':
      return 'fail';
    case 'skipped':
      return 'skip';
    default:
      return assertNever(result);
  }
}
```

**Serialization round-trip (FR-014/FR-025)**:

```typescript
describe('AgentResult serialization', () => {
  it.each([
    AgentSuccess({ agentId: 'a', findings: [], metrics }),
    AgentFailure({ agentId: 'b', error: 'x', failureStage: 'exec', metrics }),
    AgentSkipped({ agentId: 'c', reason: 'y', metrics }),
  ])('round-trips %s without widening', (original) => {
    const json = JSON.stringify(original);
    const parsed = AgentResultSchema.parse(JSON.parse(json));
    expect(parsed.status).toBe(original.status);
    // Zod schema validates shape exactly
  });
});
```

**partialFindings exclusion (FR-027)**:

```typescript
describe('partialFindings metrics', () => {
  it('failure with partialFindings does not increment success counters', () => {
    const result = AgentFailure({
      agentId: 'test',
      error: 'timeout',
      failureStage: 'exec',
      partialFindings: [mockFinding],
      metrics,
    });

    const stats = summarizeResults([result]);
    expect(stats.successful).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.totalFindings).toBe(0); // partialFindings don't count
    expect(stats.partialFindingsCount).toBe(1);
  });
});
```

### Dependency Check (FR-028)

```javascript
// .dependency-cruiser.cjs addition
{
  name: 'no-metadata-back-edges',
  from: { path: '^router/src/agents/metadata\\.ts$' },
  to: {
    path: '^router/src/agents/(?!types\\.ts|index\\.ts).*\\.ts$',
  },
  severity: 'error',
}
```

## Complexity Tracking

No constitution violations. This is a straightforward type refactoring with clear migration path.

## Risk Mitigation

| Risk                              | Mitigation                                                         |
| --------------------------------- | ------------------------------------------------------------------ |
| Breaking existing tests           | Temporary deprecated getter during migration; allowlist file       |
| Missing switch cases              | assertNever + tsd-style canary test (no compile-fail)              |
| Cache deserialization failure     | Zod schema + round-trip test for all variants (FR-025)             |
| Partial findings miscounted       | Explicit `partialFindings` field + day 1 integration test (FR-027) |
| Pre-existing CI failures          | Must fix before proceeding (FR-023)                                |
| Ad-hoc object literals sneak in   | Grep check for `status: 'success'` literals (FR-026)               |
| `.success` usage creeps back      | Unconditional grep check after Phase 1 (FR-019)                    |
| Metadata helpers create circulars | Isolated module + depcruise rule (FR-028)                          |
