# Research: AgentResult Discriminated Unions

**Feature**: 011-agent-result-unions | **Date**: 2026-01-29

## Executive Summary

This research documents the TypeScript discriminated union pattern and its application to the `AgentResult` type refactoring. The pattern enables compile-time exhaustiveness checking and type-safe field access per variant.

## Current State Analysis

### Existing AgentResult Interface

```typescript
// router/src/agents/types.ts (lines 67-78)
export interface AgentResult {
  agentId: string;
  success: boolean; // Boolean flag - problem area
  findings: Finding[];
  metrics: AgentMetrics;
  error?: string; // Optional on both success and failure
}
```

**Problems with Current Design:**

1. **No Exhaustiveness Checking**: New states (e.g., "skipped") require manual audit of all consumers
2. **Invalid State Combinations**: Nothing prevents `{ success: true, error: "something" }`
3. **Implicit Skip Logic**: Skipped agents return `{ success: true, findings: [] }` - indistinguishable from "ran but found nothing"
4. **No Type Narrowing**: After checking `success`, TypeScript doesn't narrow field availability
5. **No Serialization Contract**: Shape drift risk when cache/store.ts round-trips results

### Usage Analysis

| Location                   | Pattern                               | Count |
| -------------------------- | ------------------------------------- | ----- |
| Agents (return sites)      | `return { success: true/false, ... }` | 29    |
| Consumers (boolean checks) | `if (result.success)`                 | 7     |
| Cache (storage)            | Type-only, no shape validation        | 1     |

## TypeScript Discriminated Union Pattern

### Core Concept

A discriminated union uses a common literal property (discriminant) to distinguish between variants:

```typescript
type Shape =
  | { kind: 'circle'; radius: number }
  | { kind: 'square'; side: number }
  | { kind: 'triangle'; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case 'circle':
      return Math.PI * shape.radius ** 2; // TypeScript knows radius exists
    case 'square':
      return shape.side ** 2; // TypeScript knows side exists
    case 'triangle':
      return 0.5 * shape.base * shape.height; // TypeScript knows both exist
    default:
      return assertNever(shape); // Compile error if case missing
  }
}
```

### Key Benefits

1. **Exhaustiveness Checking**: `assertNever` in default case causes compile error if a variant is unhandled
2. **Type Narrowing**: After checking discriminant, TypeScript knows exact variant type
3. **Invalid State Prevention**: Each variant has exactly the fields it needs
4. **Self-Documenting**: Union definition explicitly lists all possible states

### assertNever Utility

Already exists at `router/src/types/assert-never.ts`:

```typescript
export function assertNever(x: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(x)}`);
}
```

At compile time, if all cases are handled, `x` has type `never` and the function type-checks. If a case is missing, `x` has a non-never type and compilation fails.

## Clarified Design Decisions

### Decision 1: AgentFailure Partial Findings

**Decision**: Keep partial results but make them explicit
**Rationale**: Agents that fail mid-execution may have gathered useful partial findings
**Implementation**:

- Rename field to `partialFindings` (not `findings`) to prevent confusion
- Add `failureStage: 'preflight' | 'exec' | 'postprocess'` to indicate when failure occurred
- Consumers must label these as partial and exclude from success metrics

### Decision 2: API Boundary Scope

**Decision**: Only router CLI/binary entry point is the API boundary
**Rationale**: Internal modules should use the new pattern exclusively
**Implementation**:

- Ban `result.success` everywhere except CLI entry (`router/src/main.ts`)
- Add lint rule or grep-based CI check
- Deprecated getter exists only during incremental migration, then deleted

### Decision 3: Test Backward Compatibility

**Decision**: Tests are internal code and must migrate to use `status`
**Rationale**: "Without modification" refers to assertions/outcomes, not syntax
**Implementation**: Update test code alongside production code

### Decision 4: P2 Typed Metadata

**Decision**: Required scope - ships with discriminated unions
**Rationale**: Consistent type safety across the agent result system
**Implementation**: Add `getSecurityMetadata()` and `getKnownEnv()` helpers in isolated module

### Decision 5: Commit Workflow

**Decision**: Each phase committed only after CI passes
**Rationale**: Enterprise-grade quality; no exceptions for pre-existing failures
**Implementation**: Fix any CI failures before proceeding

### Decision 6: `.success` Ban Timing (FR-019)

**Decision**: Unconditional after Phase 1, not Phase 4
**Rationale**: Early enforcement prevents drift; allowlist file manages migration window
**Implementation**:

- Add grep check immediately after Phase 1
- Allowlist: `router/src/main.ts` (CLI entry) + `migration-allowlist.txt` (temporary)
- Remove allowlist entries as files migrate
- Delete allowlist file in Phase 4

### Decision 7: Canary Test Approach (FR-018)

**Decision**: Use tsd-style canary, not compile-fail approach
**Rationale**: Intentional compile errors break CI; tsd-style tests fail deterministically
**Implementation**:

- Use `satisfies` keyword for type-level exhaustiveness check
- Use `switch` + `assertNever` for runtime exhaustiveness
- No test that requires "add variant, watch CI fail" workflow

### Decision 8: Serialization Contract (FR-025)

**Decision**: Required Zod schema even though "not persisted"
**Rationale**: cache/store.ts touches AgentResult; shape drift risk without validation
**Implementation**:

- Add `AgentResultSchema` (Zod discriminated union)
- Add round-trip tests for all three variants
- Use schema in cache/store.ts for validation

### Decision 9: Constructor Locking (FR-026)

**Decision**: Forbid ad-hoc object literals via grep/ESLint check
**Rationale**: Constructor helpers enforce invariants; literals bypass safety
**Implementation**:

- Grep check for `status: 'success'` (and `'failure'`, `'skipped'`) literals
- Allowlist only `agents/types.ts` (where constructors are defined)
- Fail CI if literals found elsewhere

### Decision 10: partialFindings Exclusion (FR-027)

**Decision**: Enforce "never counts as success" from day 1
**Rationale**: Deferred enforcement leads to silent bugs in metrics
**Implementation**:

- Add integration test in Phase 1
- Test proves: failure emits `status=failure`, has `partialFindings`, doesn't increment success counters
- All consumers must pass this test before Phase 1 commits

### Decision 11: Metadata Helpers Isolation (FR-028)

**Decision**: Dedicated module with zero dependency back-edges
**Rationale**: Circular dependencies risk; additive helpers shouldn't couple to agents
**Implementation**:

- Create `agents/metadata.ts` for helpers
- May import from `agents/types.ts` and `agents/index.ts` only
- Add depcruise rule to enforce no imports from agent implementations
- No changes to existing `Finding` interface structure

## Proposed AgentResult Union Design

### Type Definitions

```typescript
// Discriminant type
type AgentResultStatus = 'success' | 'failure' | 'skipped';

// Failure stage for partial findings context
type FailureStage = 'preflight' | 'exec' | 'postprocess';

// Base fields shared by all variants
interface AgentResultBase {
  agentId: string;
  metrics: AgentMetrics;
}

// Success variant - has findings, no error
interface AgentResultSuccess extends AgentResultBase {
  status: 'success';
  findings: Finding[];
  // NO error field
  // NO reason field
}

// Failure variant - has error, optional partial findings
interface AgentResultFailure extends AgentResultBase {
  status: 'failure';
  error: string;
  failureStage: FailureStage;
  partialFindings: Finding[]; // Explicit name - never count as success
  // NO reason field
}

// Skipped variant - has reason, no findings
interface AgentResultSkipped extends AgentResultBase {
  status: 'skipped';
  reason: string;
  // NO error field
  // NO findings field
}

// The discriminated union
type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;
```

### Zod Schema (Serialization Contract)

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

// Discriminated union schema
const AgentResultSchema = z.discriminatedUnion('status', [
  AgentResultSuccessSchema,
  AgentResultFailureSchema,
  AgentResultSkippedSchema,
]);
```

### Constructor Helpers

Factory functions that enforce valid field combinations:

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
    partialFindings: [],
    ...params,
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

### Type Guards

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

## Migration Patterns

### Pattern 1: Boolean Check to Status Check

**Before:**

```typescript
if (result.success) {
  processFindings(result.findings);
} else {
  logError(result.error);
}
```

**After:**

```typescript
switch (result.status) {
  case 'success':
    processFindings(result.findings);
    break;
  case 'failure':
    logError(result.error);
    // Optionally handle partialFindings (labeled as partial)
    break;
  case 'skipped':
    logSkip(result.reason);
    break;
  default:
    assertNever(result);
}
```

### Pattern 2: Object Literal to Constructor

**Before:**

```typescript
return {
  agentId: this.id,
  success: true,
  findings,
  metrics: { durationMs, filesProcessed: files.length },
};
```

**After:**

```typescript
return AgentSuccess({
  agentId: this.id,
  findings,
  metrics: { durationMs, filesProcessed: files.length },
});
```

### Pattern 3: Failure with Partial Results

**Before:**

```typescript
return {
  agentId: this.id,
  success: false,
  findings: partialResults,
  metrics,
  error: 'API timeout',
};
```

**After:**

```typescript
return AgentFailure({
  agentId: this.id,
  error: 'API timeout',
  failureStage: 'exec',
  partialFindings: partialResults,
  metrics,
});
```

## Typed Metadata Helpers

### Module Isolation (FR-028)

Helpers live in `router/src/agents/metadata.ts`:

- May import from `types.ts` (for `Finding` type)
- May NOT import from agent implementations (`opencode.ts`, `pr_agent.ts`, etc.)
- Enforced via depcruise rule

### Finding Metadata

```typescript
// agents/metadata.ts
import type { Finding } from './types.js';

interface SecurityMetadata {
  cwe?: string;
  owasp?: string;
  confidence?: 'high' | 'medium' | 'low';
  cveId?: string;
}

function isConfidence(value: unknown): value is 'high' | 'medium' | 'low' {
  return value === 'high' || value === 'medium' || value === 'low';
}

function getSecurityMetadata(finding: Finding): SecurityMetadata {
  const meta = finding.metadata ?? {};
  return {
    cwe: typeof meta.cwe === 'string' ? meta.cwe : undefined,
    owasp: typeof meta.owasp === 'string' ? meta.owasp : undefined,
    confidence: isConfidence(meta.confidence) ? meta.confidence : undefined,
    cveId: typeof meta.cveId === 'string' ? meta.cveId : undefined,
  };
}
```

### AgentContext Environment

```typescript
// agents/metadata.ts
interface KnownEnvVars {
  GITHUB_TOKEN?: string;
  AZURE_DEVOPS_PAT?: string;
  SYSTEM_ACCESSTOKEN?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
}

function getKnownEnv(env: Record<string, string | undefined>): KnownEnvVars {
  return {
    GITHUB_TOKEN: env.GITHUB_TOKEN,
    AZURE_DEVOPS_PAT: env.AZURE_DEVOPS_PAT,
    SYSTEM_ACCESSTOKEN: env.SYSTEM_ACCESSTOKEN,
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
    OPENAI_API_KEY: env.OPENAI_API_KEY,
  };
}
```

## Testing Strategy

### Unit Tests for Type Contracts

```typescript
describe('AgentResult discriminated union', () => {
  it('AgentSuccess creates success variant', () => {
    const result = AgentSuccess({ agentId: 'test', findings: [], metrics });
    expect(result.status).toBe('success');
    expect(result).not.toHaveProperty('error');
    expect(result).not.toHaveProperty('reason');
  });

  it('AgentFailure creates failure variant with partialFindings', () => {
    const result = AgentFailure({
      agentId: 'test',
      error: 'fail',
      failureStage: 'exec',
      metrics,
    });
    expect(result.status).toBe('failure');
    expect(result.error).toBe('fail');
    expect(result.failureStage).toBe('exec');
    expect(result.partialFindings).toEqual([]);
  });

  it('AgentSkipped creates skipped variant', () => {
    const result = AgentSkipped({ agentId: 'test', reason: 'no files', metrics });
    expect(result.status).toBe('skipped');
    expect(result.reason).toBe('no files');
    expect(result).not.toHaveProperty('findings');
  });
});
```

### Canary Test for Exhaustiveness (FR-018) - tsd-style

```typescript
import { expectType } from 'tsd';

// Type-level exhaustiveness check using satisfies
type ExhaustiveCheck = {
  [K in AgentResultStatus]: (r: Extract<AgentResult, { status: K }>) => string;
};

// This object must have handlers for ALL status values
// Adding a new status will cause a type error here
const handlers = {
  success: (r) => r.findings.length.toString(),
  failure: (r) => r.error,
  skipped: (r) => r.reason,
} satisfies ExhaustiveCheck;

describe('Exhaustiveness canary (tsd-style)', () => {
  it('handlers object covers all status values', () => {
    // Type-level check passed at compile time via satisfies
    expect(Object.keys(handlers).sort()).toEqual(['failure', 'skipped', 'success']);
  });

  it('switch with assertNever covers all cases', () => {
    const results: AgentResult[] = [
      AgentSuccess({ agentId: 'a', findings: [], metrics }),
      AgentFailure({ agentId: 'b', error: 'x', failureStage: 'exec', metrics }),
      AgentSkipped({ agentId: 'c', reason: 'y', metrics }),
    ];

    for (const result of results) {
      const label = exhaustiveLabel(result);
      expect(typeof label).toBe('string');
    }
  });
});

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

### Serialization Round-Trip Test (FR-014/FR-025)

```typescript
describe('AgentResult serialization', () => {
  const variants = [
    AgentSuccess({ agentId: 'a', findings: [], metrics }),
    AgentFailure({ agentId: 'b', error: 'x', failureStage: 'exec', metrics }),
    AgentSkipped({ agentId: 'c', reason: 'y', metrics }),
  ];

  it.each(variants)('round-trips %s without widening', (original) => {
    const json = JSON.stringify(original);
    const parsed = AgentResultSchema.parse(JSON.parse(json));

    expect(parsed.status).toBe(original.status);
    expect(parsed.agentId).toBe(original.agentId);

    // Zod validates exact shape - rejects extra/missing fields
    if (parsed.status === 'failure') {
      expect(parsed.failureStage).toBeDefined();
      expect(parsed.partialFindings).toBeDefined();
    }
  });

  it('rejects malformed JSON', () => {
    const malformed = { status: 'success', agentId: 'x' }; // missing required fields
    expect(() => AgentResultSchema.parse(malformed)).toThrow();
  });

  it('rejects unknown status', () => {
    const unknown = { status: 'pending', agentId: 'x', metrics: {} };
    expect(() => AgentResultSchema.parse(unknown)).toThrow();
  });
});
```

### partialFindings Exclusion Test (FR-027)

```typescript
describe('partialFindings metrics (FR-027)', () => {
  it('failure with partialFindings does not increment success counters', () => {
    const mockFinding: Finding = {
      severity: 'warning',
      file: 'test.ts',
      message: 'test finding',
      sourceAgent: 'test-agent',
    };

    const result = AgentFailure({
      agentId: 'test',
      error: 'timeout',
      failureStage: 'exec',
      partialFindings: [mockFinding],
      metrics: { durationMs: 100, filesProcessed: 1 },
    });

    const stats = summarizeResults([result]);

    // Core assertion: partialFindings don't count as success
    expect(stats.successful).toBe(0);
    expect(stats.failed).toBe(1);
    expect(stats.totalFindings).toBe(0); // Only counts findings from success
    expect(stats.partialFindingsCount).toBe(1); // Tracked separately
  });

  it('telemetry emits failure event with partialFindings count', () => {
    const result = AgentFailure({
      agentId: 'test',
      error: 'error',
      failureStage: 'exec',
      partialFindings: [mockFinding, mockFinding],
      metrics: { durationMs: 100, filesProcessed: 1 },
    });

    const event = buildTelemetryEvent(result);

    expect(event.type).toBe('agent.failure');
    expect(event.partialFindingsCount).toBe(2);
    expect(event).not.toHaveProperty('findingsCount'); // Only on success
  });
});
```

### Metadata Helpers Isolation Test

```typescript
// Verify via depcruise, but also add explicit test
describe('metadata.ts isolation (FR-028)', () => {
  it('has no imports from agent implementations', async () => {
    const metadataSource = await readFile('router/src/agents/metadata.ts', 'utf-8');

    const forbiddenImports = [
      'opencode',
      'pr_agent',
      'ai_semantic_review',
      'semgrep',
      'reviewdog',
      'local_llm',
      'control_flow',
    ];

    for (const forbidden of forbiddenImports) {
      expect(metadataSource).not.toContain(`from './${forbidden}`);
      expect(metadataSource).not.toContain(`from "./${forbidden}`);
    }
  });
});
```

## Risk Assessment

| Risk                                         | Likelihood | Impact | Mitigation                                      |
| -------------------------------------------- | ---------- | ------ | ----------------------------------------------- |
| Migration breaks existing tests              | Low        | Medium | Temporary deprecated getter + allowlist file    |
| New variant added without updating consumers | N/A        | N/A    | This is what we're solving (tsd-style canary)   |
| Runtime error from unexpected status         | Very Low   | Low    | assertNever provides clear error message        |
| Performance overhead                         | None       | N/A    | Compile-time only, no runtime cost              |
| Pre-existing CI failures block progress      | Medium     | Medium | Must fix before proceeding (FR-023)             |
| partialFindings miscounted in metrics        | Low        | Medium | Day 1 integration test (FR-027)                 |
| Shape drift in serialization                 | Low        | High   | Zod schema + round-trip tests (FR-025)          |
| Ad-hoc object literals bypass safety         | Medium     | Medium | Grep check for literals (FR-026)                |
| `.success` usage creeps back                 | Medium     | Medium | Unconditional grep check after Phase 1 (FR-019) |
| Metadata helpers create circulars            | Low        | Medium | Isolated module + depcruise rule (FR-028)       |

## Conclusion

The discriminated union pattern is well-suited for AgentResult:

1. **Three Clear States**: success, failure, skipped - mutually exclusive
2. **Different Fields Per State**: error only on failure, reason only on skipped, partialFindings explicit
3. **Exhaustiveness Requirement**: Consumers must handle all states (enforced via tsd-style canary)
4. **Existing Infrastructure**: assertNever utility already available
5. **Serialization Safety**: Zod schema prevents shape drift in cache operations
6. **Early Enforcement**: `.success` ban and literal checks active from Phase 1

Recommended approach: Incremental migration with strict CI enforcement per phase, deprecated getter only during migration (deleted before merge), comprehensive tests (canary, round-trip, partialFindings exclusion), and isolated metadata helpers.
