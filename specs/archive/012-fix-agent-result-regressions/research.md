# Research: Fix Agent Result Union Regressions

**Feature**: 012-fix-agent-result-regressions
**Date**: 2026-01-29

## Existing Codebase Analysis

### 1. AgentResult Types (router/src/agents/types.ts)

**Current State**:

- Discriminated union with `status: 'success' | 'failure' | 'skipped'`
- Constructor helpers: `AgentSuccess()`, `AgentFailure()`, `AgentSkipped()`
- Type guards: `isSuccess()`, `isFailure()`, `isSkipped()`
- `AgentResultFailure` already has optional `partialFindings?: Finding[]`
- `AgentResultSchema` exists for Zod serialization

**Finding Type**:

```typescript
interface Finding {
  severity: Severity;
  file: string;
  line?: number;
  endLine?: number;
  message: string;
  suggestion?: string;
  ruleId?: string;
  sourceAgent: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
}
```

**Change Needed**: Add `provenance: 'complete' | 'partial'` to Finding type and schema.

### 2. Execute Phase (router/src/phases/execute.ts)

**Current State**:

- Returns `ExecuteResult { allFindings, allResults, skippedAgents }`
- Only collects findings from successful agents into `allFindings`
- Uses exhaustive switch with `assertNever()` on AgentResult status
- Lines 139-144: Only success case adds to `allFindings`

**Regression Point**: Lines 139-144 - failure case with `partialFindings` is not collected

**Change Needed**:

- Maintain separate `completeFindings[]` and `partialFindings[]` arrays
- Collect from success → `completeFindings`
- Collect from failure.partialFindings → `partialFindings`
- Update return type and callers

### 3. Cache Handling (router/src/cache/)

**Current State**:

- `store.ts`: `getCached()` returns `AgentResult | null` directly
- `key.ts`: Generates keys as `ai-review-{prNumber}-{sha256Hash}`
- No schema validation on cache retrieval
- No version field in cache key

**Regression Point**: Lines 165-167 in execute.ts - cached result goes directly to switch without validation

**Change Needed**:

- Add `CACHE_SCHEMA_VERSION` constant to types.ts (co-located with AgentResultSchema)
- Modify `getCached()` to validate with `AgentResultSchema.safeParse()`
- Include version in cache key: `ai-review-v{VERSION}-{prNumber}-{sha256Hash}`
- On validation failure → return null (cache miss)

### 4. BrandHelpers (router/src/types/branded.ts)

**Current State**:

```typescript
function createBrandHelpers<T, B extends string>(
  schema: z.ZodType<T>,
  brandName: B,
  fieldName: string,
  additionalValidation?: (value: T) => Result<T, ValidationError>
): BrandHelpers<T, B>;
```

The `is()` method currently only checks Zod schema:

```typescript
is(value: unknown): value is Brand<T, B> {
  return schema.safeParse(value).success;
}
```

**Regression Point**: Line 148-150 - `additionalValidation` is ignored in `is()`

**Change Needed**: Implement `is()` as:

```typescript
is(value: unknown): value is Brand<T, B> {
  return isOk(this.parse(value));
}
```

### 5. Reporting (router/src/phases/report.ts, router/src/report/formats.ts)

**Current State**:

- `dispatchReport()` takes `findings: Finding[]`
- `processFindings()` deduplicates, sanitizes, sorts
- `generateFullSummaryMarkdown()` renders findings grouped by file
- No concept of partial vs complete findings

**Change Needed**:

- Update interfaces to accept `{ completeFindings, partialFindings }`
- Add dedicated partial findings section in markdown output
- Gating (`checkGating()`) uses only `completeFindings`

## Decisions

### D1: provenance Field Design

**Decision**: Add optional `provenance?: 'complete' | 'partial'` field to Finding
**Rationale**:

- Optional for backwards compatibility (existing findings without provenance are implicitly complete)
- String literal union for type safety
- Matches existing pattern for optional Finding fields

**Alternatives Considered**:

- `isPartial: boolean` - Less explicit, doesn't extend to future states
- Wrapper type `PartialFinding` - Breaking change, more complex

### D2: Cache Version Strategy

**Decision**: `CACHE_SCHEMA_VERSION` constant in agents/types.ts, included in cache key
**Rationale**:

- Co-located with `AgentResultSchema` - changes together
- In key (not payload) - invalidates without parsing legacy content
- Format: `ai-review-v2-{prNumber}-{hash}` (v2 for this migration)

**Alternatives Considered**:

- Version in cache entry payload - Requires parsing to check version
- Hash of schema - Too volatile, changes on any schema tweak

### D3: is() Implementation

**Decision**: Implement as `isOk(this.parse(value))`
**Rationale**:

- Definitionally consistent - `.is()` and `.parse()` always agree
- Reuses existing validation logic - no duplication
- Slight performance cost acceptable (security > micro-optimization)

**Alternatives Considered**:

- Duplicate additionalValidation in is() - Risk of drift
- Cache parse result - Premature optimization

### D4: ExecuteResult Type Change

**Decision**: Change return type to `{ completeFindings, partialFindings, allResults, skippedAgents }`
**Rationale**:

- Clear separation end-to-end
- Callers can choose how to handle each collection
- `allResults` already contains everything for debugging

**Alternatives Considered**:

- Add `isPartial` flag to each finding in single array - Harder to filter for gating
- Keep allFindings + separate partialFindings - Confusing overlap

### D5: Deduplication Scope

**Decision**: Dedupe within partialFindings only (per-agent); no cross-collection deduplication
**Rationale**:

- Preserves provenance - partial finding shows which agent partially succeeded
- Same finding from different agents in different states is meaningful
- Consistent with existing deduplication key (fingerprint + file + line)

**Alternatives Considered**:

- Cross-collection dedupe - Loses visibility into which agents contributed
- No dedupe at all - Noisy output when agent produces duplicates

## Open Questions (Resolved)

All questions from spec clarification have been resolved:

- ✅ Separate collections for complete/partial findings
- ✅ provenance field on Finding type
- ✅ Schema-driven cache validation
- ✅ CACHE_SCHEMA_VERSION constant
- ✅ Deduplication within partialFindings only
- ✅ is() implemented via parse()

## Dependencies

No new dependencies required. Uses existing:

- Zod 4.x for schema validation
- Vitest 4.x for testing (property-based tests via standard assertions)

## Migration Notes

- Cache version bump (v1 → v2) will invalidate all existing cache entries
- First run after upgrade will re-execute all agents (one-time cost)
- No data migration needed - cache entries are ephemeral (24h TTL)
