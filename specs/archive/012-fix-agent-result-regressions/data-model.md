# Data Model: Fix Agent Result Union Regressions

**Feature**: 012-fix-agent-result-regressions
**Date**: 2026-01-29

## Entity Changes

### Finding (Modified)

**File**: `router/src/agents/types.ts`

```typescript
// BEFORE
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

// AFTER
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
  provenance?: 'complete' | 'partial'; // NEW (FR-002)
}
```

**Validation Rules**:

- `provenance` is optional for backwards compatibility
- When present, must be `'complete'` or `'partial'`
- Defaults to `'complete'` when not specified (implicit)

**Zod Schema Update**:

```typescript
const FindingSchema = z.object({
  // ... existing fields ...
  provenance: z.enum(['complete', 'partial']).optional(),
});
```

---

### ExecuteResult (Modified)

**File**: `router/src/phases/execute.ts`

```typescript
// BEFORE
interface ExecuteResult {
  allFindings: Finding[];
  allResults: AgentResult[];
  skippedAgents: SkippedAgent[];
}

// AFTER
interface ExecuteResult {
  completeFindings: Finding[]; // From successful agents (FR-001, FR-008)
  partialFindings: Finding[]; // From failed agents (FR-001, FR-007)
  allResults: AgentResult[];
  skippedAgents: SkippedAgent[];
}
```

**State Transitions**:

- Agent succeeds → findings go to `completeFindings` with `provenance: 'complete'`
- Agent fails with partialFindings → findings go to `partialFindings` with `provenance: 'partial'`
- Agent fails without partialFindings → no findings added
- Agent skipped → no findings added

---

### Cache Schema Version (New)

**File**: `router/src/agents/types.ts` (co-located with AgentResultSchema)

```typescript
/**
 * Cache schema version - bump when AgentResultSchema changes shape.
 * Included in cache keys to invalidate legacy entries.
 *
 * History:
 * - v1: Original format (success: boolean, no status field) - DEPRECATED
 * - v2: Discriminated union (status: 'success'|'failure'|'skipped')
 */
export const CACHE_SCHEMA_VERSION = 2;
```

**Cache Key Format**:

```typescript
// BEFORE
`ai-review-${prNumber}-${hash}`
// AFTER
`ai-review-v${CACHE_SCHEMA_VERSION}-${prNumber}-${hash}`;
```

---

### CacheEntry (Existing, Behavior Change)

**File**: `router/src/cache/store.ts`

No schema change, but retrieval behavior changes:

```typescript
// BEFORE: Direct return without validation
async function getCached(key: string): Promise<AgentResult | null> {
  const entry = await readFromDisk(key);
  return entry?.result ?? null;
}

// AFTER: Schema validation on retrieval (FR-003, FR-004)
async function getCached(key: string): Promise<AgentResult | null> {
  const entry = await readFromDisk(key);
  if (!entry) return null;

  const parsed = AgentResultSchema.safeParse(entry.result);
  if (!parsed.success) {
    // Legacy or corrupted entry - treat as cache miss
    return null;
  }
  return parsed.data;
}
```

---

### BrandHelpers Interface (Existing, Implementation Change)

**File**: `router/src/types/branded.ts`

No interface change, but `is()` implementation changes:

```typescript
// BEFORE
is(value: unknown): value is Brand<T, B> {
  return schema.safeParse(value).success;  // Ignores additionalValidation
}

// AFTER (FR-006)
is(value: unknown): value is Brand<T, B> {
  return isOk(this.parse(value));  // Uses full validation
}
```

---

## Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         ExecuteResult                           │
├─────────────────────────────────────────────────────────────────┤
│ completeFindings: Finding[]  ←── AgentResultSuccess.findings    │
│ partialFindings: Finding[]   ←── AgentResultFailure.partialFind │
│ allResults: AgentResult[]                                       │
│ skippedAgents: SkippedAgent[]                                   │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Reporting                              │
├─────────────────────────────────────────────────────────────────┤
│ dispatchReport(completeFindings, partialFindings, ...)          │
│   └── checkGating(completeFindings)  // FR-008: gating uses     │
│   └── renderPartialSection(partialFindings) // FR-007           │
└─────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Cache                                 │
├─────────────────────────────────────────────────────────────────┤
│ getCached(key) → AgentResultSchema.safeParse() → AgentResult    │
│ setCache(key, result) → Store with version in key               │
│                                                                 │
│ Key format: ai-review-v{CACHE_SCHEMA_VERSION}-{pr}-{hash}       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deduplication Rules (FR-010, FR-011)

**Dedup Key for partialFindings**:

```typescript
// Key includes sourceAgent to scope dedup within same agent
function getPartialDedupeKey(finding: Finding): string {
  return `${finding.sourceAgent}:${finding.file}:${finding.line ?? 0}:${finding.ruleId ?? ''}`;
}
```

**Within partialFindings**:

- Same `sourceAgent + file + line + ruleId` → dedupe to single entry
- Preserves per-agent provenance (sourceAgent in key ensures agent-scoped dedup)

**Between completeFindings and partialFindings**:

- NO cross-collection deduplication
- Same finding in both collections is preserved (shows which agents succeeded/failed)

**Required Test (FR-011)**:

```typescript
it('preserves same finding in both collections (no cross-collection dedup)', () => {
  const sharedFinding = { file: 'app.ts', line: 10, ruleId: 'no-unused', sourceAgent: 'eslint' };

  const complete = [{ ...sharedFinding, provenance: 'complete' }];
  const partial = [{ ...sharedFinding, provenance: 'partial', sourceAgent: 'eslint-partial' }];

  const result = processFindings(complete, partial);

  expect(result.completeFindings).toHaveLength(1);
  expect(result.partialFindings).toHaveLength(1); // Not deduped against complete
});
```

**Implementation**:

```typescript
function deduplicatePartialFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = getPartialDedupeKey(f);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
```
