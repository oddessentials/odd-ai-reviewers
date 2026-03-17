# Finding Pipeline Contract: 417 Dogfood Quality Release

## Pipeline Stages (Canonical Order)

```
Stage 1:    validateFindingsSemantics()     → classify, self-contradiction, cautionary advice, PR intent
Stage 1.25: filterUserSuppressions()        → user-defined rules from config  [NEW]
Stage 1.5:  filterFrameworkConventionFindings() → 9 closed matchers
Stage 2:    normalizeAndValidateFindings()  → line validation, path normalization (NO self-contradiction, NO cautionary)
Stage 3:    sanitizeFindings()              → HTML entity escaping
```

## Stage 2 Deduplication (FR-018)

### Removed from `validateNormalizedFindings()`

| Pass                        | Lines (before) | Action                        |
| --------------------------- | -------------- | ----------------------------- |
| Pass 3: Self-contradiction  | 506-531        | REMOVE (duplicate of Stage 1) |
| Pass 3.5: Cautionary advice | 533-556        | REMOVE (duplicate of Stage 1) |

### Retained in `validateNormalizedFindings()`

| Pass                                 | Lines   | Purpose                                           |
| ------------------------------------ | ------- | ------------------------------------------------- |
| Pass 1: Classification with diff set | 464-486 | Adds cross-file detection (needs diff files)      |
| Pass 2: Line validation              | 488-504 | Validates lines against lineResolver (needs diff) |

### Deprecated `validateFindings()` (line 659)

Update to call `validateFindingsSemantics()` before `validateNormalizedFindings()` to maintain backward compatibility for the benchmark adapter.

## User Suppression Stage (Stage 1.25) Contract

### Input

- `findings: Finding[]` (output of Stage 1)
- `suppressionRules: SuppressionRule[]` (from config, base-branch in CI)
- `disableMatchers: string[]` (matcher IDs to disable in Stage 1.5)

### Output

- `filtered: Finding[]` (findings not matched by any rule)
- `suppressed: SuppressionMatchResult[]` (matched findings with rule details)
- `matchCounts: Map<string, number>` (per-rule match count for breadth enforcement)

### Matching Logic

1. For each finding, iterate rules in order
2. First matching rule wins (no multi-rule accumulation)
3. Rule match requires ALL specified criteria to match (AND logic):
   - `rule`: glob match against `finding.ruleId`
   - `message`: anchored regex against `finding.message`
   - `file`: glob match against `finding.file`
   - `severity`: exact match against `finding.severity`
4. Unmatched findings pass through

### Breadth Check (post-matching)

1. Compute match count per rule
2. In CI mode: fail if any rule exceeds threshold (20 default, 200 with override)
3. In local mode: warn only

## Framework Matcher Helpers (FR-017)

### `extractNearbyContext(finding, diffContent, windowSize)` → `NearbyContext | null`

Replaces 4-line boilerplate in 8 of 9 matchers:

```
const fileSection = extractFileDiffSection(finding, diffContent);
if (!fileSection) return false;
const nearbyLines = extractLinesNearFinding(fileSection, finding.line, windowSize);
const nearbyText = nearbyLines.join('\n');
```

### `boundedVarPattern(varName, suffix)` → `RegExp`

Replaces 13 inline `new RegExp('\\b' + varName + ...)` constructions. Validates varName is `\w+` only.

### `RES_RESPONSE_SINK` constant

Replaces 4 duplications of `/\bres\s*\.\s*(?:send|write|end)\s*\(/`.
