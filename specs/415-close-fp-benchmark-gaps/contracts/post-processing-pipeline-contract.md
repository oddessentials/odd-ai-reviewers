# Contract: Finding Post-Processing Pipeline

**Type**: Internal module contract
**Source**: `router/src/phases/report.ts`, `router/src/report/finding-validator.ts`, `router/src/report/framework-pattern-filter.ts`
**Consumers**: `report.ts` (hosted mode), `local-review.ts` (CLI mode), `adapter.ts` (benchmark)

## Pipeline Stages

All entry points (hosted, CLI, benchmark) MUST execute these 4 stages in order:

```
Stage 1: sanitizeFindings(findings)
Stage 2: validateFindingsSemantics(sanitized, prDescription?)
Stage 3: filterFrameworkConventionFindings(validated, diffContent)
Stage 4: validateNormalizedFindings(frameworkFiltered, diffFiles, lineResolver)
```

## Stage Contracts

### Stage 1 — Sanitization

- **Input**: Raw `Finding[]` from agents
- **Output**: Sanitized `Finding[]` (zero-width chars stripped, unicode normalized)
- **Side effects**: None
- **Idempotent**: Yes

### Stage 2 — Semantic Validation (Self-Contradiction + PR Intent)

- **Input**: Sanitized `Finding[]`, optional `prDescription: string`
- **Output**: Filtered `Finding[]`
- **Filters applied**:
  - Self-contradiction: info severity + DISMISSIVE_PATTERNS match + no actionable suggestion → suppressed
  - PR intent contradiction: info severity + eligible category + verb contradiction with prDescription → suppressed
- **When `prDescription` is absent**: PR intent filter is skipped (CLI mode)
- **Side effects**: Diagnostic logging (suppression counts)

### Stage 3 — Framework Convention Filtering

- **Input**: Semantically validated `Finding[]`, `diffContent: string`
- **Output**: `FrameworkFilterResult` (findings + suppression summary)
- **Filters applied**: Closed matcher table (T019–T026), first-match-wins
- **Side effects**: Diagnostic logging per suppressed finding

### Stage 4 — Diff-Bound Validation

- **Input**: Framework-filtered `Finding[]`, `DiffFile[]`, `FindingLineResolver`
- **Output**: Validated `Finding[]`
- **Filters applied**: Line-level validation (finding line must exist in diff hunk range)
- **Side effects**: Diagnostic logging for out-of-range findings

## Entry Point Parity

| Stage                 | Hosted (report.ts)              | CLI (local-review.ts)      | Benchmark (adapter.ts)                    |
| --------------------- | ------------------------------- | -------------------------- | ----------------------------------------- |
| Sanitization          | ✅                              | ✅ (FR-018a)               | ✅                                        |
| Semantic validation   | ✅ (with prDescription)         | ✅ (without prDescription) | ✅ (with prDescription if fixture has it) |
| Framework filtering   | ✅                              | ✅ (FR-018c)               | ✅                                        |
| Diff-bound validation | ✅ (in platform reporters)      | ✅ (FR-018d)               | ✅                                        |
| PR intent filtering   | ✅ (when prDescription present) | ❌ (documented divergence) | ✅ (when fixture has prDescription)       |

## Invariants

1. **Order matters**: Stages MUST execute in order 1→2→3→4. Semantic validation before framework filtering (to reduce matcher workload). Diff-bound after framework (to avoid rejecting findings that would be suppressed anyway).
2. **No new stages without spec amendment**: The 4-stage pipeline is exhaustive. Adding a 5th stage requires a spec amendment.
3. **Severity gate is sacrosanct**: The info-only gate in Stage 2 MUST NOT be relaxed.
