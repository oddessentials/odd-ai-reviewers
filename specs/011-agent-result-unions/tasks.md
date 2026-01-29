# Tasks: AgentResult Discriminated Unions

**Feature**: 011-agent-result-unions | **Generated**: 2026-01-29
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Task Summary

| Phase   | Tasks          | Description                              |
| ------- | -------------- | ---------------------------------------- |
| Phase 1 | T-001 to T-012 | Core Type Definition + Enforcement Setup |
| Phase 2 | T-013 to T-020 | Agent Migration                          |
| Phase 3 | T-021 to T-027 | Consumer Migration                       |
| Phase 4 | T-028 to T-031 | Cleanup                                  |

---

## Phase 1: Core Type Definition + Enforcement Setup

### T-001: Define AgentResult discriminated union types

**File**: `router/src/agents/types.ts`
**FR**: FR-001, FR-011, FR-013
**Depends on**: None

Add new type definitions alongside existing interface:

```typescript
type AgentResultStatus = 'success' | 'failure' | 'skipped';
type FailureStage = 'preflight' | 'exec' | 'postprocess';

interface AgentResultBase {
  agentId: string;
  metrics: AgentMetrics;
}

interface AgentResultSuccess extends AgentResultBase {
  status: 'success';
  findings: Finding[];
}

interface AgentResultFailure extends AgentResultBase {
  status: 'failure';
  error: string;
  failureStage: FailureStage;
  partialFindings: Finding[];
}

interface AgentResultSkipped extends AgentResultBase {
  status: 'skipped';
  reason: string;
}

type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;
```

**Acceptance**: Types compile without error; existing code continues to work via deprecated getter (T-005).

---

### T-002: Add Zod serialization schema

**File**: `router/src/agents/types.ts`
**FR**: FR-025, FR-014
**Depends on**: T-001

Add Zod schema for cache round-trip safety:

```typescript
import { z } from 'zod';

const AgentMetricsSchema = z.object({
  durationMs: z.number(),
  filesProcessed: z.number(),
  tokensUsed: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
});

const FindingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  file: z.string(),
  line: z.number().optional(),
  endLine: z.number().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string().optional(),
  sourceAgent: z.string(),
  fingerprint: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const AgentResultSuccessSchema = z.object({
  status: z.literal('success'),
  agentId: z.string(),
  findings: z.array(FindingSchema),
  metrics: AgentMetricsSchema,
});

const AgentResultFailureSchema = z.object({
  status: z.literal('failure'),
  agentId: z.string(),
  error: z.string(),
  failureStage: z.enum(['preflight', 'exec', 'postprocess']),
  partialFindings: z.array(FindingSchema),
  metrics: AgentMetricsSchema,
});

const AgentResultSkippedSchema = z.object({
  status: z.literal('skipped'),
  agentId: z.string(),
  reason: z.string(),
  metrics: AgentMetricsSchema,
});

const AgentResultSchema = z.discriminatedUnion('status', [
  AgentResultSuccessSchema,
  AgentResultFailureSchema,
  AgentResultSkippedSchema,
]);
```

**Acceptance**: Zod schema exports compile; type inference matches TypeScript types.

---

### T-003: Add constructor helpers

**File**: `router/src/agents/types.ts`
**FR**: FR-002, FR-012
**Depends on**: T-001

```typescript
function AgentSuccess(params: {
  agentId: string;
  findings: Finding[];
  metrics: AgentMetrics;
}): AgentResultSuccess {
  return { status: 'success', ...params };
}

function AgentFailure(params: {
  agentId: string;
  error: string;
  failureStage: FailureStage;
  partialFindings?: Finding[];
  metrics: AgentMetrics;
}): AgentResultFailure {
  return {
    status: 'failure',
    agentId: params.agentId,
    error: params.error,
    failureStage: params.failureStage,
    partialFindings: params.partialFindings ?? [],
    metrics: params.metrics,
  };
}

function AgentSkipped(params: {
  agentId: string;
  reason: string;
  metrics: AgentMetrics;
}): AgentResultSkipped {
  return { status: 'skipped', ...params };
}
```

**Acceptance**: Constructor helpers export correctly; TypeScript prevents invalid field combinations.

---

### T-004: Add type guards

**File**: `router/src/agents/types.ts`
**FR**: FR-001
**Depends on**: T-001

```typescript
function isSuccess(result: AgentResult): result is AgentResultSuccess {
  return result.status === 'success';
}

function isFailure(result: AgentResult): result is AgentResultFailure {
  return result.status === 'failure';
}

function isSkipped(result: AgentResult): result is AgentResultSkipped {
  return result.status === 'skipped';
}
```

**Acceptance**: Type guards narrow correctly in filter/map chains.

---

### T-005: Add temporary deprecated success getter

**File**: `router/src/agents/types.ts`
**FR**: FR-006, FR-021
**Depends on**: T-001

Add a temporary compatibility layer for incremental migration:

```typescript
// MIGRATION: Remove before PR series merges (FR-021)
// This getter allows existing code to compile during migration
function addDeprecatedSuccessGetter<T extends AgentResult>(result: T): T & { success: boolean } {
  return {
    ...result,
    get success(): boolean {
      return result.status === 'success';
    },
  };
}
```

**Note**: This is deleted in T-029 (Phase 4).

**Acceptance**: Existing `result.success` checks compile; deprecation noted.

---

### T-006: Create metadata helpers module

**File**: `router/src/agents/metadata.ts` (NEW)
**FR**: FR-007, FR-008, FR-028
**Depends on**: None

Create isolated module with zero back-edges:

```typescript
/**
 * Typed metadata helpers for Finding and AgentContext
 *
 * CONSTRAINT: This module MUST NOT import from agent implementations.
 * Only allowed imports: ./types.ts, ./index.ts
 */

interface SecurityMetadata {
  cwe?: string;
  owasp?: string;
  confidence?: 'high' | 'medium' | 'low';
  cveId?: string;
}

interface KnownEnvVars {
  GITHUB_TOKEN?: string;
  AZURE_DEVOPS_PAT?: string;
  SYSTEM_ACCESSTOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  AZURE_OPENAI_API_KEY?: string;
}

function getSecurityMetadata(finding: { metadata?: Record<string, unknown> }): SecurityMetadata {
  const m = finding.metadata ?? {};
  return {
    cwe: typeof m.cwe === 'string' ? m.cwe : undefined,
    owasp: typeof m.owasp === 'string' ? m.owasp : undefined,
    confidence: ['high', 'medium', 'low'].includes(m.confidence as string)
      ? (m.confidence as 'high' | 'medium' | 'low')
      : undefined,
    cveId: typeof m.cveId === 'string' ? m.cveId : undefined,
  };
}

function getKnownEnv(env: Record<string, string | undefined>): KnownEnvVars {
  return {
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    AZURE_DEVOPS_PAT: env.AZURE_DEVOPS_PAT,
    SYSTEM_ACCESSTOKEN: env.SYSTEM_ACCESSTOKEN,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    AZURE_OPENAI_API_KEY: env.AZURE_OPENAI_API_KEY,
  };
}

export type { SecurityMetadata, KnownEnvVars };
export { getSecurityMetadata, getKnownEnv };
```

**Acceptance**: Module compiles; depcruise reports zero back-edges.

---

### T-007: Add depcruise rule for metadata isolation

**File**: `.dependency-cruiser.cjs`
**FR**: FR-028
**Depends on**: T-006

Add rule to enforce zero back-edges:

```javascript
{
  name: 'no-metadata-back-edges',
  comment: 'agents/metadata.ts must not import agent implementations',
  from: { path: '^router/src/agents/metadata\\.ts$' },
  to: {
    path: '^router/src/agents/(?!types\\.ts|index\\.ts).*\\.ts$',
  },
  severity: 'error',
}
```

**Acceptance**: `pnpm depcruise` passes; importing agent file in metadata.ts fails depcruise.

---

### T-008: Create migration allowlist file

**File**: `migration-allowlist.txt` (NEW, at repo root)
**FR**: FR-019
**Depends on**: None

```text
# Files temporarily allowed to use .success during migration
# Remove entries as files are migrated; delete file entirely in Phase 4
router/src/agents/opencode.ts
router/src/agents/pr_agent.ts
router/src/agents/ai_semantic_review.ts
router/src/agents/semgrep.ts
router/src/agents/reviewdog.ts
router/src/agents/local_llm.ts
router/src/agents/control_flow/index.ts
router/src/phases/execute.ts
router/src/phases/report.ts
router/src/report/formats.ts
router/src/telemetry/index.ts
router/src/security-logger.ts
router/src/cache/store.ts
router/src/__tests__/
```

**Acceptance**: File exists; entries match files to be migrated.

---

### T-009: Add grep check for .success ban

**File**: `scripts/check-success-ban.sh` (NEW) or CI workflow
**FR**: FR-019, FR-020
**Depends on**: T-008

```bash
#!/bin/bash
# Check for .success usage outside allowed locations
# Fails CI if found

set -e

MATCHES=$(grep -rn '\.success\b' router/src --include='*.ts' \
  | grep -v 'router/src/main.ts' \
  | grep -v -f migration-allowlist.txt || true)

if [ -n "$MATCHES" ]; then
  echo "ERROR: .success usage found outside allowlist:"
  echo "$MATCHES"
  exit 1
fi

echo "OK: No unauthorized .success usage found"
```

**Acceptance**: Script exits 0 with current code; exits 1 if new .success added outside allowlist.

---

### T-010: Add grep check for object literal ban

**File**: `scripts/check-literal-ban.sh` (NEW) or CI workflow
**FR**: FR-026
**Depends on**: None

```bash
#!/bin/bash
# Check for status: 'success'/'failure'/'skipped' literals outside types.ts
# Fails CI if found (constructors are the only factory path)

set -e

for STATUS in success failure skipped; do
  MATCHES=$(grep -rn "status:[[:space:]]*['\"]$STATUS['\"]" router/src --include='*.ts' \
    | grep -v 'router/src/agents/types.ts' || true)

  if [ -n "$MATCHES" ]; then
    echo "ERROR: status: '$STATUS' literal found outside types.ts:"
    echo "$MATCHES"
    exit 1
  fi
done

echo "OK: No unauthorized status literals found"
```

**Acceptance**: Script exits 0; exits 1 if literal added outside types.ts.

---

### T-011: Add unit tests for AgentResult types

**File**: `router/src/__tests__/agents/types.test.ts` (NEW)
**FR**: FR-010, FR-014, FR-025
**Depends on**: T-001, T-002, T-003, T-004

```typescript
describe('AgentResult discriminated union', () => {
  describe('constructor helpers', () => {
    it('AgentSuccess creates valid success variant', () => {
      const result = AgentSuccess({ agentId: 'test', findings: [], metrics });
      expect(result.status).toBe('success');
      expect(result.findings).toEqual([]);
    });

    it('AgentFailure creates valid failure variant with defaults', () => {
      const result = AgentFailure({
        agentId: 'test',
        error: 'oops',
        failureStage: 'exec',
        metrics,
      });
      expect(result.status).toBe('failure');
      expect(result.partialFindings).toEqual([]);
    });

    it('AgentSkipped creates valid skipped variant', () => {
      const result = AgentSkipped({ agentId: 'test', reason: 'no files', metrics });
      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('no files');
    });
  });

  describe('type guards', () => {
    it('isSuccess narrows to AgentResultSuccess', () => {
      const result: AgentResult = AgentSuccess({ agentId: 'a', findings: [], metrics });
      if (isSuccess(result)) {
        expect(result.findings).toBeDefined(); // TypeScript knows this
      }
    });
  });

  describe('serialization round-trip (FR-025)', () => {
    it.each([
      ['success', AgentSuccess({ agentId: 'a', findings: [], metrics })],
      ['failure', AgentFailure({ agentId: 'b', error: 'x', failureStage: 'exec', metrics })],
      ['skipped', AgentSkipped({ agentId: 'c', reason: 'y', metrics })],
    ])('round-trips %s variant without widening', (_name, original) => {
      const json = JSON.stringify(original);
      const parsed = AgentResultSchema.parse(JSON.parse(json));
      expect(parsed.status).toBe(original.status);
      expect(parsed.agentId).toBe(original.agentId);
    });
  });
});
```

**Acceptance**: All tests pass; 100% branch coverage for constructor/guard logic.

---

### T-012: Add tsd-style canary test

**File**: `router/src/__tests__/integration/exhaustiveness-canary.test.ts` (NEW)
**FR**: FR-018, SC-007
**Depends on**: T-001

```typescript
import { assertNever } from '../../types/assert-never.js';
import type { AgentResult, AgentResultStatus } from '../../agents/types.js';

/**
 * Canary test: Fails deterministically if a new variant is added without updating handlers.
 * Uses satisfies + assertNever for exhaustiveness without compile errors in CI.
 */
describe('AgentResult exhaustiveness canary', () => {
  type ExhaustiveCheck = {
    [K in AgentResultStatus]: (r: Extract<AgentResult, { status: K }>) => string;
  };

  const handlers = {
    success: (r) => `${r.findings.length} findings`,
    failure: (r) => `error: ${r.error}`,
    skipped: (r) => `reason: ${r.reason}`,
  } satisfies ExhaustiveCheck;

  function exhaustiveLabel(result: AgentResult): string {
    switch (result.status) {
      case 'success':
        return handlers.success(result);
      case 'failure':
        return handlers.failure(result);
      case 'skipped':
        return handlers.skipped(result);
      default:
        return assertNever(result);
    }
  }

  it('handles all variants', () => {
    expect(exhaustiveLabel(AgentSuccess({ agentId: 'a', findings: [], metrics }))).toContain(
      'findings'
    );
    expect(
      exhaustiveLabel(AgentFailure({ agentId: 'b', error: 'x', failureStage: 'exec', metrics }))
    ).toContain('error');
    expect(exhaustiveLabel(AgentSkipped({ agentId: 'c', reason: 'y', metrics }))).toContain(
      'reason'
    );
  });
});
```

**Acceptance**: Test passes; adding a 4th variant without updating handlers causes type error.

---

### T-012b: Add partialFindings exclusion integration test

**File**: `router/src/__tests__/integration/partial-findings.test.ts` (NEW)
**FR**: FR-016, FR-027, SC-015
**Depends on**: T-003

```typescript
describe('partialFindings metrics exclusion (FR-027)', () => {
  it('failure with partialFindings does not increment success counters', () => {
    const mockFinding: Finding = {
      severity: 'warning',
      file: 'test.ts',
      message: 'test',
      sourceAgent: 'test',
    };

    const results: AgentResult[] = [
      AgentSuccess({ agentId: 'agent1', findings: [mockFinding, mockFinding], metrics }),
      AgentFailure({
        agentId: 'agent2',
        error: 'timeout',
        failureStage: 'exec',
        partialFindings: [mockFinding],
        metrics,
      }),
      AgentSkipped({ agentId: 'agent3', reason: 'no files', metrics }),
    ];

    const stats = summarizeResults(results);

    expect(stats.successful).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.totalFindings).toBe(2); // Only from success
    expect(stats.partialFindingsCount).toBe(1); // From failure, separate count
  });
});
```

**Acceptance**: Test passes; partialFindings never counted as success findings.

---

### T-012c: Add metadata helpers tests

**File**: `router/src/__tests__/agents/metadata.test.ts` (NEW)
**FR**: FR-007, FR-008, FR-028
**Depends on**: T-006

```typescript
describe('metadata helpers', () => {
  describe('getSecurityMetadata', () => {
    it('extracts known fields with type validation', () => {
      const finding = { metadata: { cwe: 'CWE-79', confidence: 'high', unknown: 123 } };
      const meta = getSecurityMetadata(finding);
      expect(meta.cwe).toBe('CWE-79');
      expect(meta.confidence).toBe('high');
      expect((meta as any).unknown).toBeUndefined();
    });
  });

  describe('getKnownEnv', () => {
    it('extracts known environment variables', () => {
      const env = { GITHUB_TOKEN: 'gh_xxx', RANDOM_VAR: 'ignored' };
      const known = getKnownEnv(env);
      expect(known.GITHUB_TOKEN).toBe('gh_xxx');
      expect((known as any).RANDOM_VAR).toBeUndefined();
    });
  });
});
```

**Acceptance**: Tests pass; metadata module remains isolated.

---

### T-012d: Phase 1 commit checkpoint

**FR**: FR-022, FR-023, FR-024
**Depends on**: T-001 through T-012c

1. Run `pnpm lint && pnpm typecheck && pnpm test`
2. Run `pnpm depcruise`
3. Run `scripts/check-success-ban.sh`
4. Run `scripts/check-literal-ban.sh`
5. Fix any failures before committing
6. Commit with message: `feat(agents): add AgentResult discriminated union types (011 Phase 1)`

**Acceptance**: All CI checks pass; commit created on `011-agent-result-unions` branch.

---

## Phase 2: Agent Migration

### T-013: Migrate opencode agent

**File**: `router/src/agents/opencode.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

1. Import `AgentSuccess`, `AgentFailure`, `AgentSkipped`
2. Replace all 4 return sites with constructor calls
3. Use `partialFindings` for failure cases with `failureStage`
4. Remove from `migration-allowlist.txt`

**Acceptance**: Agent tests pass; grep check passes.

---

### T-014: Migrate pr_agent

**File**: `router/src/agents/pr_agent.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

Same pattern as T-013 for 4 return sites.

**Acceptance**: Agent tests pass; grep check passes.

---

### T-015: Migrate ai_semantic_review agent

**File**: `router/src/agents/ai_semantic_review.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

Same pattern as T-013 for 4 return sites.

**Acceptance**: Agent tests pass; grep check passes.

---

### T-016: Migrate semgrep agent

**File**: `router/src/agents/semgrep.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

Same pattern as T-013 for 3 return sites.

**Acceptance**: Agent tests pass; grep check passes.

---

### T-017: Migrate reviewdog agent

**File**: `router/src/agents/reviewdog.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

Same pattern as T-013 for 4 return sites.

**Acceptance**: Agent tests pass; grep check passes.

---

### T-018: Migrate local_llm agent

**File**: `router/src/agents/local_llm.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

Same pattern as T-013 for 7 return sites.

**Acceptance**: Agent tests pass; grep check passes.

---

### T-019: Migrate control_flow agent

**File**: `router/src/agents/control_flow/index.ts`
**FR**: FR-005, FR-013
**Depends on**: T-012d

Same pattern as T-013 for 3 return sites.

**Acceptance**: Agent tests pass; grep check passes.

---

### T-020: Phase 2 commit checkpoint

**FR**: FR-022, FR-023, FR-024
**Depends on**: T-013 through T-019

1. Run full CI suite
2. Verify all agents removed from `migration-allowlist.txt`
3. Commit with message: `refactor(agents): migrate all agents to AgentResult constructors (011 Phase 2)`

**Acceptance**: All CI checks pass; all agent files use constructors.

---

## Phase 3: Consumer Migration

### T-021: Migrate phases/execute.ts

**File**: `router/src/phases/execute.ts`
**FR**: FR-004, FR-015
**Depends on**: T-020

1. Replace `if (result.success)` with `switch (result.status)`
2. Add `assertNever` to switch default
3. Handle all three variants
4. Remove from `migration-allowlist.txt`

**Acceptance**: Tests pass; no boolean success checks remain.

---

### T-022: Migrate phases/report.ts

**File**: `router/src/phases/report.ts`
**FR**: FR-004, FR-015, FR-016
**Depends on**: T-020

1. Replace boolean checks with switch statements
2. Label `partialFindings` as partial in report output
3. Add `assertNever` to switch default
4. Remove from `migration-allowlist.txt`

**Acceptance**: Tests pass; partialFindings labeled separately.

---

### T-023: Migrate report/formats.ts

**File**: `router/src/report/formats.ts`
**FR**: FR-004, FR-016
**Depends on**: T-020

Same pattern as T-021.

**Acceptance**: Tests pass; formatting handles all variants.

---

### T-024: Migrate telemetry/index.ts

**File**: `router/src/telemetry/index.ts`
**FR**: FR-004, FR-015, FR-016, SC-010
**Depends on**: T-020

1. Replace boolean checks with switch statements
2. Emit distinct event types per variant
3. Label `partialFindings` explicitly in telemetry
4. Remove from `migration-allowlist.txt`

**Acceptance**: Tests pass; telemetry keys off `status`, not inferred success.

---

### T-025: Migrate security-logger.ts

**File**: `router/src/security-logger.ts`
**FR**: FR-004, FR-015
**Depends on**: T-020

Same pattern as T-021.

**Acceptance**: Tests pass; logging handles all variants.

---

### T-026: Migrate cache/store.ts

**File**: `router/src/cache/store.ts`
**FR**: FR-004, FR-014, FR-025
**Depends on**: T-020

1. Replace boolean checks with switch or type guards
2. Use `AgentResultSchema.parse()` for deserialization validation
3. Remove from `migration-allowlist.txt`

**Acceptance**: Tests pass; cache round-trip preserves status discriminator.

---

### T-027: Phase 3 commit checkpoint

**FR**: FR-022, FR-023, FR-024
**Depends on**: T-021 through T-026

1. Run full CI suite
2. Verify all consumer files removed from `migration-allowlist.txt`
3. Only `router/src/__tests__/` should remain in allowlist
4. Commit with message: `refactor(router): migrate all consumers to AgentResult switch (011 Phase 3)`

**Acceptance**: All CI checks pass; all production code uses switch statements.

---

## Phase 4: Cleanup

### T-028: Migrate test files

**File**: `router/src/__tests__/**/*.ts`
**FR**: FR-009
**Depends on**: T-027

1. Update test files that create AgentResult to use constructors
2. Update test assertions to use `status` checks
3. Remove `router/src/__tests__/` from `migration-allowlist.txt`

**Acceptance**: All 1843+ tests pass with constructor usage.

---

### T-029: Delete deprecated success getter

**File**: `router/src/agents/types.ts`
**FR**: FR-021, SC-008
**Depends on**: T-028

Remove the temporary `addDeprecatedSuccessGetter` function added in T-005.

**Acceptance**: No `success` getter exists; all code uses `status`.

---

### T-030: Delete migration allowlist file

**File**: `migration-allowlist.txt`
**FR**: FR-019
**Depends on**: T-029

1. Delete `migration-allowlist.txt`
2. Update `check-success-ban.sh` to remove `-f migration-allowlist.txt` flag

**Acceptance**: Grep check runs unconditionally (except main.ts).

---

### T-031: Final validation and commit

**FR**: FR-017, FR-022, FR-023, FR-024, SC-001 through SC-016
**Depends on**: T-028, T-029, T-030

1. Run full CI suite
2. Verify all success criteria:
   - SC-001: All 17 files migrated
   - SC-002: Compiler catches missing cases (canary test)
   - SC-003: All tests pass
   - SC-007: Canary test exists and passes
   - SC-008: Zero boolean success checks in production
   - SC-009: Cache round-trip test passes
   - SC-010: Telemetry emits distinct events
   - SC-011: All CI checks pass
   - SC-012: Grep check passes (main.ts only exception)
   - SC-013: Literal grep check passes (types.ts only exception)
   - SC-014: Serialization test passes
   - SC-015: partialFindings exclusion test passes
   - SC-016: metadata.ts has zero back-edges
3. Commit with message: `chore(agents): complete AgentResult discriminated union migration (011 Phase 4)`

**Acceptance**: Feature complete; ready for PR.

---

## Dependency Graph

```
T-001 (types) ─┬─> T-002 (zod) ─────────┐
               ├─> T-003 (constructors) ─┼─> T-011 (unit tests) ─┐
               ├─> T-004 (guards) ───────┤                       │
               └─> T-005 (deprecated) ───┘                       │
                                                                 │
T-006 (metadata) ─> T-007 (depcruise) ─> T-012c (metadata tests)─┤
                                                                 │
T-008 (allowlist) ─> T-009 (success ban) ────────────────────────┤
                                                                 │
T-010 (literal ban) ─────────────────────────────────────────────┤
                                                                 │
T-012 (canary) ──────────────────────────────────────────────────┤
T-012b (partial findings test) ──────────────────────────────────┤
                                                                 │
                                    ┌────────────────────────────┘
                                    v
                              T-012d (Phase 1 commit)
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         v                          v                          v
    T-013 (opencode)           T-014 (pr_agent)     ... T-019 (control_flow)
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    v
                              T-020 (Phase 2 commit)
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         v                          v                          v
    T-021 (execute)            T-022 (report)      ... T-026 (cache)
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    v
                              T-027 (Phase 3 commit)
                                    │
                                    v
                              T-028 (test migration)
                                    │
                                    v
                              T-029 (delete getter)
                                    │
                                    v
                              T-030 (delete allowlist)
                                    │
                                    v
                              T-031 (final commit)
```

## Summary Statistics

- **Total Tasks**: 34
- **Phase 1**: 14 tasks (core types + enforcement)
- **Phase 2**: 8 tasks (7 agents + commit)
- **Phase 3**: 7 tasks (6 consumers + commit)
- **Phase 4**: 4 tasks (cleanup + final)
- **Files Modified**: 17 existing + 8 new
- **Tests Added**: 4 new test files
