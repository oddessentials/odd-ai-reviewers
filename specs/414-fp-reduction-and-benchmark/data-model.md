# Data Model: False-Positive Reduction & Benchmark Integration

**Date**: 2026-03-12
**Feature**: 414-fp-reduction-and-benchmark

## Entities

### Finding (existing — no schema changes)

The core unit of analysis. No field additions or type changes required.

```typescript
interface Finding {
  severity: 'critical' | 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
  suggestion?: string;
  category?: string;
  sourceAgent: string;
  // ... existing fields unchanged
}
```

### FrameworkPatternMatcher (existing — 2 new instances)

```typescript
interface FrameworkPatternMatcher {
  readonly id: string; // 'react-query-dedup' | 'promise-allsettled-order'
  readonly name: string;
  readonly messagePattern: RegExp;
  evidenceValidator: (finding: Finding, diffContent: string) => boolean;
  readonly suppressionReason: string;
}
```

**New instances**:

| ID                         | Message Pattern                                                                                                               | Evidence Check                                                                                                                                                                                                                            | Suppression Reason                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `react-query-dedup`        | `/duplicate\|double.?fetch\|redundant.*query\|multiple.*useQuery/i`                                                           | 3-point: (1) Import from `@tanstack/react-query`, `swr`, or `@apollo/client` in file section, (2) Query hook call (`useQuery`, `useSWR`, etc.) within ±10 lines of finding, (3) Finding message does NOT mention raw `fetch()`/HTTP calls | Query library deduplicates by cache key                      |
| `promise-allsettled-order` | `/allSettled.*(?:order\|sequence)\|(?:order\|sequence).*allSettled\|allSettled.*results.*not.*(?:match\|correspond\|align)/i` | 2-point: (1) `Promise.allSettled(` within ±10 lines of finding (not just file-wide), (2) Result iteration pattern (`.forEach`, `.map(`, `[i]`, `for...of`) near finding                                                                   | Promise.allSettled preserves input order per ECMAScript spec |

### FindingValidationResult (existing — new filterType value)

```typescript
interface FindingValidationResult {
  finding: Finding;
  classification: FindingClassification;
  valid: boolean;
  filterReason?: string;
  filterType?: 'invalid_line' | 'self_contradicting' | 'pr_intent_contradiction'; // NEW value added
}
```

### BenchmarkCandidate (new — benchmark adapter output)

```typescript
interface BenchmarkCandidate {
  text: string; // finding.message + optional suggestion
  path: string; // finding.file
  line: number | null; // finding.line
  source: 'extracted'; // constant
}
```

### BenchmarkResults (new — regression check input)

```typescript
interface BenchmarkResults {
  precision: number; // TP / total_tool_comments
  recall: number; // TP / total_golden_comments
  f1: number; // 2 * precision * recall / (precision + recall)
  tool: string; // 'odd-ai-reviewers'
  judge_model: string; // e.g., 'openai/gpt-4o-mini'
  timestamp: string; // ISO 8601
}
```

### BenchmarkScenario (existing — updated)

```typescript
interface BenchmarkScenario {
  id: string;
  name: string;
  pattern: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; // Patterns A-F per FP taxonomy; self-contradiction handled separately
  category?: string;
  truePositive: boolean;
  code: string;
  diff?: string;
  snapshot?: string;
  expectedFindings?: Finding[];
  // ... existing fields
}
```

## Relationships

```
Finding ──suppressed-by──▶ FrameworkPatternMatcher (T019-T023)
Finding ──filtered-by──▶ FindingValidator (self-contradiction, PR intent)
Finding ──classified-as──▶ FindingClassification (inline/file-level/global/cross-file)
Finding ──mapped-to──▶ BenchmarkCandidate (adapter transform)
BenchmarkCandidate ──judged-against──▶ GoldenComment (external benchmark)
BenchmarkScenario ──scored-by──▶ computeReport() (internal benchmark)
```

## State Transitions

### Finding Lifecycle (updated)

```
Raw Agent Output
  │
  ├─▶ Deduplication (deduplicateFindings)
  ├─▶ Sanitization (sanitizeFindings)
  ├─▶ Stage 1: Semantic Validation (validateFindingsSemantics)
  │     ├─ Pass 1: Classification
  │     ├─ Pass 3: Self-contradiction filter (info + dismissive + no suggestion)
  │     └─ Pass 4: PR intent contradiction filter (NEW — info severity only)  ◀── FR-112
  ├─▶ Stage 1.5: Framework Pattern Filter (filterFrameworkConventionFindings)
  │     ├─ T019: Express error middleware
  │     ├─ T020: TypeScript _prefix
  │     ├─ T021: Exhaustive switch
  │     ├─ T022: React Query dedup (NEW)      ◀── FR-109, FR-110
  │     └─ T023: Promise.allSettled order (NEW) ◀── FR-109, FR-111
  ├─▶ Sort (sortFindings)
  ├─▶ Platform Reporter (github.ts / ado.ts)
  │     ├─ Normalization (normalizeFindingsForDiff)
  │     └─ Stage 2: Diff-bound validation (validateNormalizedFindings)
  └─▶ Posted to platform
```
