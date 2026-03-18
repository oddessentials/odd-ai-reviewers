# Finding Lifecycle Analysis - 410-false-positive-deep-fixes

## Executive Summary

The review team correctly identified a **critical validation ordering bug**: `processFindings()` in `report.ts` validates findings **BEFORE** platform reporters can normalize/remap them. This causes:

1. **Renamed-file findings** dropped before GitHub/ADO can remap old paths to new paths
2. **Stale-line findings** dropped before they can be downgraded to file-level
3. False positives that could be salvaged through post-processing are permanently lost

The proposed **two-stage validation** is architecturally sound and feasible.

---

## Current Lifecycle Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FINDING LIFECYCLE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

[1] CREATION
    vulnerability-detector.ts:234
    - Safe-source suppression happens HERE (line 214-216)
    - findingCreated with: severity, file, line, message, sourceAgent
    - Safe sources are filtered OUT before vulnerability objects created

[2] DEDUPLICATE & SANITIZE (processFindings)
    report.ts:70-84
    - deduplicateFindings(completeFindings) [line 70]
    - sanitizeFindings(deduplicated) [line 72]

[3] ⚠️ PREMATURE VALIDATION (processFindings, line 74-84)
    ┌──────────────────────────────────────────────────────────────────┐
    │ validateFindings(sanitized, lineResolver, diffFilePaths) [line 80]
    │ finding-validator.ts:90-192                                      │
    │                                                                   │
    │ Pass 1: Classify (inline/file-level/global/cross-file) [111-132]│
    │ Pass 2: Line validation - FILTER INVALID LINES [135-150]         │
    │   → Inline findings with stale lines are DROPPED HERE            │
    │   → No path normalization happens yet                            │
    │ Pass 3: Self-contradiction (info + dismissive) [153-176]         │
    │                                                                   │
    │ RETURNS: validFindings (others discarded) [179-189]              │
    └──────────────────────────────────────────────────────────────────┘

    [X] PROBLEM: Renamed/stale findings NEVER reach platform reporters

[4] SORT & SUMMARIZE
    report.ts:86, 119-124
    - sortFindings(validated) [line 86]
    - generateFullSummaryMarkdown() [line 119]

[5] DISPATCH TO PLATFORM (dispatchReport)
    report.ts:155-239

    ├─→ GITHUB REPORTER (github.ts:153-294)
    │   ├─ canonicalizeDiffFiles() [line 169]
    │   ├─ buildLineResolver() [line 172]
    │   ├─ normalizeFindingsForDiff() [line 173] ← NORMALIZATION TOO LATE!
    │   │  line-resolver.ts:510-677
    │   │   - Remap old paths to new paths [536-571]
    │   │   - Downgrade stale lines to file-level [597-605, 640-658]
    │   │   - BUT input findings already filtered by validateFindings()
    │   ├─ deduplicateFindings() [line 196]
    │   └─ sortFindings() [line 197]
    │
    └─→ ADO REPORTER (ado.ts:129-229)
        ├─ canonicalizeDiffFiles() [line 145]
        ├─ buildLineResolver() [line 148]
        ├─ normalizeFindingsForDiff() [line 149] ← SAME PROBLEM
        └─ [rest of flow identical]

[6] POST (createCheckRun / postPRThreads)
    - Check run annotations [github.ts:333-336]
    - Inline comments [github.ts:479-576, ado.ts:438-533]
    - Comment resolution [github.ts:577-673, ado.ts:535-633]
```

---

## Premature Drop Boundary - EXACT LOCATIONS

### Where Findings Die

**report.ts:74-84 - validateFindings() call**

```typescript
// Line 74-84
let validated: Finding[];
if (diffFiles.length > 0) {
  const canonicalFiles = canonicalizeDiffFiles(diffFiles);
  const diffFilePaths = canonicalFiles.map((f) => f.path);
  const lineResolver = buildLineResolver(canonicalFiles);
  const validationResult = validateFindings(sanitized, lineResolver, diffFilePaths);
  validated = validationResult.validFindings; // ← FILTERED findings discarded
} else {
  validated = sanitized;
}
```

**finding-validator.ts:135-150 - Line validation that drops stale lines**

```typescript
// Pass 2: Line validation (inline findings only)
for (const result of results) {
  if (result.classification === 'inline' && result.finding.line !== undefined) {
    const validation = lineResolver.validateLine(result.finding.file, result.finding.line);
    if (!validation.valid) {
      result.valid = false; // ← MARK AS INVALID
      result.filterReason = `Line ${result.finding.line} not in diff range for ${result.finding.file}`;
      result.filterType = 'invalid_line';
      stats.filteredByLine++;
    }
  }
}
```

**finding-validator.ts:179-189 - Final filtering**

```typescript
// Build final arrays
const validFindings: Finding[] = [];
const filtered: FindingValidationResult[] = [];

for (const result of results) {
  if (result.valid) {
    validFindings.push(result.finding); // ← ONLY THESE SURVIVE
    stats.valid++;
  } else {
    filtered.push(result); // ← THESE ARE LOST FOREVER
  }
}

return { validFindings, filtered, stats }; // filtered is returned but NOT USED
```

### Why Normalization Comes Too Late

**github.ts:173 - normalizeFindingsForDiff() receives already-filtered findings**

```typescript
// Input to normalizeFindingsForDiff() is findings that already passed validateFindings()
// Line-resolver.ts:536-571 (Rename handling) never runs on dropped findings
// Line-resolver.ts:573-595 (Deleted file handling) never runs on dropped findings
// Line-resolver.ts:640-658 (Downgrade to file-level) never runs on dropped findings
```

---

## What Normalization Can Salvage (But Doesn't Get To)

### Renamed-File Findings

**Current behavior:**

1. Finding references old path: `oldPath: src/deprecated.ts, line: 42`
2. validateFindings() checks: `isValidLine("src/deprecated.ts", 42)` → lineResolver has no mapping for old path
3. Finding is **DROPPED** as invalid
4. GitHub normalizeFindingsForDiff() never sees it to remap

**What normalizeFindingsForDiff() COULD do (line-resolver.ts:536-571):**

```typescript
// Check if this is an old path that needs remapping to new path
const remappedPath = resolver.remapPath(normalizedFilePath);
const wasRemapped = remappedPath !== normalizedFilePath;
if (wasRemapped) {
  // Check for ambiguous renames before remapping
  if (resolver.isAmbiguousRename(normalizedFilePath)) {
    // Ambiguous rename: downgrade to file-level only
    normalized.push({
      ...finding,
      file: normalizedFilePath,
      line: undefined, // ← DOWNGRADE, don't drop
      endLine: undefined,
    });
  } else {
    // Non-ambiguous rename: remap to new path
    normalizedFilePath = remappedPath;
    remappedPathsCount++;
  }
}
```

### Stale-Line Findings

**Current behavior:**

1. Finding: `file: src/app.ts, line: 155` (old line number from base)
2. validateFindings() checks: `isValidLine("src/app.ts", 155)` → not in diff
3. Finding is **DROPPED** as invalid line
4. GitHub normalizeFindingsForDiff() never sees it to downgrade to file-level

**What normalizeFindingsForDiff() COULD do (line-resolver.ts:640-658):**

```typescript
if (!validation.valid) {
  // Downgrade to file-level comment (invalid line)
  normalized.push({
    ...finding,
    file: normalizedFilePath,
    line: undefined, // ← DOWNGRADE from inline to file-level
    endLine: undefined,
  });
  downgradedCount++;
  inlineTotalCount++;
  inlineDowngradedCount++;
}
```

---

## Two-Stage Validation Assessment

### Proposed Split

**Stage 1 (Semantic Validation) - In processFindings()**

- Self-contradiction filtering (info + dismissive + no suggestion)
- Finding classification (inline/file-level/global/cross-file) - informational only
- NO line validation
- NO path existence checking

**Stage 2 (Diff-Bound Validation) - In platform reporters**

- Line number validation (after normalization/remap)
- Path existence validation (after normalization/remap)
- Deleted file handling (downgrade to file-level)
- Ambiguous rename handling (downgrade to file-level)

### Feasibility Analysis

#### ✅ Can finding-validator.ts be split?

**Yes, cleanly.**

**Stage 1 function (normalization-independent):**

```typescript
function validateFindingsSemantics(findings: Finding[]): {
  findings: Finding[];
  stats: { total: number; filteredBySelfContradiction: number };
  filtered: FindingValidationResult[];
} {
  // Only Pass 3 logic (lines 152-176 in finding-validator.ts)
  // Self-contradiction detection - no line resolver needed
  // Returns findings that passed semantic validation
}
```

**Stage 2 function (post-normalization):**

```typescript
// This becomes inline in line-resolver.ts or github.ts
function validateFindingsForDiff(findings: Finding[], lineResolver: LineResolver) {
  // Only Pass 2 logic (lines 135-150 in finding-validator.ts)
  // Line validation after normalization has fixed path/line issues
}
```

#### ✅ What belongs in Stage 1?

- Self-dismissing phrase detection ✓
  - Does NOT require diff state
  - Pattern matching on severity + message + suggestion
  - Current implementation lines 152-176

- Classification ✓
  - Currently informational (stats only, doesn't affect filtering)
  - Can be kept for logging/debugging
  - Does NOT require line resolution

#### ✅ What belongs in Stage 2?

- Line validity checking ✓
  - Requires diff state via lineResolver
  - Requires path to be normalized first (renames resolved, deleted files identified)
  - Current implementation lines 135-150

- Renamed path detection ✓
  - Already in line-resolver.ts:536-571
  - Only runs on findings that reach github.ts/ado.ts

- Deleted file handling ✓
  - Already in line-resolver.ts:573-595
  - Only runs on findings that reach github.ts/ado.ts

#### ✅ Does processFindings() have enough info for Stage 1?

**Yes.** It receives:

- `completeFindings: Finding[]` - has severity, message, suggestion
- No diff needed for self-contradiction detection

#### ✅ Do platform reporters have access for Stage 2?

**Yes, already they have everything:**

```typescript
// github.ts:153-294
export async function reportToGitHub(
  findings: Finding[],
  partialFindings: Finding[],
  context: GitHubContext,
  config: Config,
  diffFiles: DiffFile[] // ← Available
) {
  const canonicalFiles = canonicalizeDiffFiles(diffFiles);
  const lineResolver = buildLineResolver(canonicalFiles);

  // Line resolver already validates lines (line-resolver.ts:323-383)
  // Can be enhanced to log "downgraded due to invalid line" separately from
  // "downgraded due to deleted file" or "downgraded due to ambiguous rename"
}
```

### Risks & Mitigations

**Risk: Dropped findings won't be logged as "premature validations"**

- **Mitigation:** Add logging in processFindings() to distinguish Stage 1 filters from Stage 2 (which will have better context)
- Log format: `[router] Filtered (semantic): info severity, self-contradicting, reason: ...`

**Risk: Logging will be split across two locations**

- **Mitigation:** Consistent log prefixes + documentation of which stage each log comes from
- Stage 1: `[router] [processFindings]`
- Stage 2: `[router] [github]` / `[router] [ado]`

**Risk: Return type change for processFindings() will break callers**

- **Mitigation:** Check all 3 callers (all in main.ts + tests)
  - main.ts:981 - assigns to `{ sorted, partialSorted }` - NOT affected if we keep return type
  - tests - 16 test cases, all mock processFindings or verify output shape - easy update
- **Recommendation:** Keep processFindings() return type unchanged, just remove validation internally

**Risk: Post-processing (self-dismissing detection) happens AFTER normalization, breaks existing tests**

- **Mitigation:**
  - Run self-contradiction detection BEFORE platform reporters (in processFindings, as Stage 1)
  - This is semantically independent - doesn't depend on diff state
  - No test breakage expected

---

## Current Caller Impact

### Caller 1: main.ts:981

```typescript
const { sorted, partialSorted } = processFindings(
  executeResult.completeFindings,
  executeResult.partialFindings,
  executeResult.allResults,
  executeResult.skippedAgents,
  diff.files
);
```

**Impact:** NONE

- If we keep the same return type `{ sorted, partialSorted }`, this call is unchanged
- The internal behavior changes (no validation at this stage), but output is the same
- `sorted` will be less filtered (more findings survive), which is desired behavior

### Caller 2: src/**tests**/report.test.ts

16 test cases in `describe('processFindings')`:

- Tests verify deduplication, sanitization, sorting behavior
- Currently assume validateFindings() is called (assert filtered findings exist)
- **After change:** Tests must verify that validation is NOT done at this stage
- Tests need updates to assert:
  - Findings with stale lines are NOT filtered
  - Findings with invalid lines are NOT filtered
  - Only self-contradicting findings are filtered

**Test updates needed:**

```typescript
// OLD: expects validateFindings() was called
it('should validate findings before sorting', () => {
  const findings = [makeFinding({ file: 'x.ts', line: 999 })];
  const processed = processFindings(findings, [], [], []);
  // Currently expects this finding filtered out
  expect(processed.sorted.length).toBe(0);
});

// NEW: should NOT validate at this stage
it('should NOT validate line numbers (left for platform reporters)', () => {
  const findings = [makeFinding({ file: 'x.ts', line: 999 })];
  const processed = processFindings(findings, [], [], []);
  // After change, stale line findings pass through
  expect(processed.sorted.length).toBe(1); // Finding survives processFindings
});
```

### Caller 3: src/**tests**/run-review-exit.test.ts

1 test mocks processFindings - **Impact: NONE**

- Mock returns static value, not sensitive to implementation change

---

## Test Coverage Gaps

### Current Test Coverage (BEFORE change)

✅ **finding-validator.test.ts** (tests/unit/report/finding-validator.test.ts)

- Line validation (both valid and invalid lines)
- Self-contradiction filtering
- Classification

✅ **report.test.ts** (src/**tests**/report.test.ts)

- processFindings deduplication
- processFindings sanitization

⚠️ **Missing: Interaction between processFindings and normalizeFindingsForDiff**

- No test verifies findings reach github.ts after processFindings
- No test verifies renamed-file findings survive to github.ts
- No test verifies stale-line findings survive to github.ts

### NEW Test Coverage Needed (AFTER change)

**Test 1: Renamed-file findings survive processFindings and reach github reporter**

```typescript
describe('Finding Lifecycle - Renamed Files', () => {
  it('should pass renamed-file findings to reporter for remapping', () => {
    // Create a finding with old path (before rename)
    const oldPathFinding = makeFinding({
      file: 'old-name.ts',
      line: 10,
      message: 'Found issue',
    });

    // processFindings should NOT validate against diff (old path not in diff)
    const processed = processFindings([oldPathFinding], [], [], []);
    expect(processed.sorted).toHaveLength(1); // Finding survives!
    expect(processed.sorted[0]?.file).toBe('old-name.ts');
  });
});
```

**Test 2: Stale-line findings survive processFindings and reach github reporter**

```typescript
describe('Finding Lifecycle - Stale Lines', () => {
  it('should pass stale-line findings to reporter for downgrade', () => {
    // Create a finding with line number from old diff
    const staleFinding = makeFinding({
      file: 'src/app.ts',
      line: 999, // Not in new diff
      message: 'Issue on removed line',
    });

    // processFindings should NOT validate line numbers
    const processed = processFindings([staleFinding], [], [], [], diffFiles);
    expect(processed.sorted).toHaveLength(1); // Finding survives!

    // Later: github reporter should downgrade to file-level
    // (tested separately in github.test.ts or integration tests)
  });
});
```

**Test 3: github.ts properly downgrades stale lines after normalization**

```typescript
describe('GitHub Reporter - Line Normalization', () => {
  it('should downgrade stale lines to file-level during normalization', async () => {
    const staleFinding = makeFinding({
      file: 'src/app.ts',
      line: 999, // Not in diff
    });

    const result = normalizeFindingsForDiff([staleFinding], lineResolver);

    // Should downgrade (remove line), not drop
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.line).toBeUndefined(); // File-level only
    expect(result.stats.inlineDowngraded).toBe(1);
  });
});
```

**Test 4: Self-contradiction still filtered in processFindings**

```typescript
describe('Finding Lifecycle - Self-Contradiction', () => {
  it('should filter self-contradicting findings in processFindings', () => {
    const selfContradicting = makeFinding({
      severity: 'info',
      message: 'This is acceptable as-is.',
      suggestion: undefined,
    });

    const processed = processFindings([selfContradicting], [], [], []);
    expect(processed.sorted).toHaveLength(0); // Still filtered here
  });
});
```

---

## Recommended Implementation Order

### Phase 1: Split finding-validator.ts (1-2 hours)

1. **Extract Stage 1 logic into new function:** `validateFindingsSemantics()`
   - Move lines 152-176 (self-contradiction detection)
   - Remove lineResolver parameter
   - Keep `DISMISSIVE_PATTERNS` and `hasActionableSuggestion()`
   - Returns: `{ findings, filtered, stats }`

2. **Keep Stage 2 logic:** `validateFindings()` stays for now (will be deprecated)
   - Used by finding-validator.test.ts
   - Will eventually move to github.ts / ado.ts

3. **Update finding-validator.ts exports**
   - Export both functions for backward compatibility during transition

### Phase 2: Update processFindings() (1 hour)

1. **Call validateFindingsSemantics() instead of validateFindings()**

   ```typescript
   const semanticallyValidated = validateFindingsSemantics(sanitized);
   const validated = semanticallyValidated; // No line validation
   ```

2. **Remove lineResolver and diffFilePaths logic**

   ```typescript
   // DELETE: lines 76-84 (lineResolver build)
   ```

3. **Update return value** (unchanged)
   - Still returns `{ deduplicated, sorted, partialSorted, summary }`
   - But `sorted` now has more findings (stale/renamed pass through)

### Phase 3: Update github.ts / ado.ts (2-3 hours)

1. **After normalizeFindingsForDiff(), add Stage 2 validation**

   ```typescript
   const lineResolver = buildLineResolver(canonicalFiles);
   const normalizedResult = normalizeFindingsForDiff(findings, lineResolver);

   // NEW: Stage 2 validation on normalized findings
   const validated = validateFindingsForDiff(normalizedResult.findings, lineResolver);
   const finalFindings = validated;
   ```

2. **Stage 2 validation function:**
   - Only validates lines that are still inline-eligible
   - Logs: "Downgraded due to invalid line", "Downgraded due to deleted file", etc.
   - Returns filtered findings + stats

3. **Log improvements:**
   ```typescript
   console.log(`[github] Line validation stats:
     - Valid inline: ${stats.validInline}
     - Downgraded: ${stats.downgraded} (${stats.deletedFiles} deleted, ${stats.invalidLines} invalid lines)
     - Remapped paths: ${stats.remappedPaths}
   `);
   ```

### Phase 4: Update Tests (2 hours)

1. **Update report.test.ts**
   - Change assertions: stale lines should NOT be filtered in processFindings
   - Add test for self-contradiction still being filtered

2. **Update finding-validator.test.ts**
   - Keep existing tests (still test the semantics function)
   - Add new tests for Stage 2 validation

3. **Add integration tests**
   - Renamed-file findings → processFindings → github → remapped
   - Stale-line findings → processFindings → github → downgraded
   - End-to-end: fixture with false positives → survives → normalized correctly

### Phase 5: Validation & Cleanup (1 hour)

1. **Run full test suite** - should all pass
2. **Check SC-008 regression** - manually review a few false-positive fixtures
3. **Deprecate old validateFindings() usage** - mark as "use platform reporters instead"

---

## Current Lifecycle Snapshot

```
Findings created in vulnerability-detector.ts with safe-source suppression ✓
    ↓
    Passed to processFindings() (report.ts:62-84)
    ├─ Deduplicated ✓
    ├─ Sanitized ✓
    └─ ⚠️ VALIDATED (finding-validator.ts:90-192)
         ├─ Inline findings with stale lines → DROPPED
         ├─ File findings → PASS
         └─ Self-contradicting → DROPPED ✓
    ↓
    Sorted ✓
    ↓
    Dispatched to github.ts / ado.ts (dispatchReport, report.ts:155)
    ├─ canonicalizeDiffFiles() ✓
    ├─ buildLineResolver() ✓
    ├─ normalizeFindingsForDiff() ← TOO LATE!
    │   ├─ Would remap old paths
    │   ├─ Would downgrade stale lines
    │   └─ But renamed/stale findings already dropped
    └─ Posted to platform
```

**KEY INSIGHT:** normalizeFindingsForDiff() is well-designed for its job (remapping/downgrading), but it never gets called on findings that could have been salvaged.

---

## Logs to Track Implementation

### Before Implementation

```
[router] Complete findings: 50 (deduplicated from 60)
[router] [finding-validator] Filtered: 5 findings (2 invalid line, 3 self-contradicting)
[router] [github] Line validation: 45 valid, 0 normalized, 0 dropped
```

### After Implementation

```
[router] Complete findings: 50 (deduplicated from 60)
[router] [processFindings] Filtered (semantic): 3 self-contradicting findings
[router] [github] Line validation: 40 valid, 2 normalized, 5 downgraded (3 deleted files, 2 invalid lines, 2 remapped paths)
```

This tells us:

- 2 invalid-line findings were **downgraded** (not dropped) ✓
- 2 renamed-file findings were **remapped** (not dropped) ✓
- Only true false positives (self-contradicting) were filtered ✓
