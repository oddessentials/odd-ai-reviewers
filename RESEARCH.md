# RESEARCH: Report Pipeline Lifecycle & Identity-Based Taint Tracking

**Branch**: `410-false-positive-deep-fixes`
**Date**: 2026-03-11
**Status**: DA-approved, ready for implementation
**Inputs**: Review team findings, taint identity analysis, finding lifecycle analysis, DA review

---

## Problem Statement

Two architectural regressions stem from boundary mistakes, not isolated bugs:

1. **Report pipeline validates findings before normalization can salvage them.** `processFindings()` filters findings with invalid lines/paths BEFORE platform reporters run `normalizeFindingsForDiff()`. Renamed-file and stale-line findings are dropped when they could have been remapped or downgraded to file-level comments.

2. **Control-flow detector tracks variables by string name, not declaration identity.** `collectMutatedNames()`, `safeConstArrayNames`, `trackTaint()`, and `findAffectedVariable()` all key on raw identifier text. A shadowed inner variable with the same name as an outer module-scope constant poisons the outer declaration's safe status.

---

## Regression 1: Finding Lifecycle Boundary

### Root Cause

`processFindings()` (`report.ts:74-84`) calls `validateFindings()` which filters findings based on diff state. Platform reporters (`github.ts:172`, `ado.ts:148`) independently build a `lineResolver` and call `normalizeFindingsForDiff()` — but only on survivors from `processFindings()`. Findings that could have been remapped or downgraded are already gone.

```
CURRENT (broken):
  processFindings()
    deduplicate → sanitize → validateFindings(lineResolver) → sort
                                    ↓
                              drops renamed-path findings    ← BUG: premature
                              drops stale-line findings      ← BUG: premature
    ↓
  dispatchReport(sorted)
    ↓
  reportToGitHub(sorted)
    buildLineResolver → normalizeFindingsForDiff  ← never sees dropped findings
    postComments
```

### What Normalization Can Salvage

| Finding State            | Normalization Action                | Current Outcome            | Correct Outcome                       |
| ------------------------ | ----------------------------------- | -------------------------- | ------------------------------------- |
| Renamed file path        | `resolver.remapPath()` maps old→new | Dropped in processFindings | Remapped, posted on new path          |
| Stale line number        | Nearest-line snapping               | Dropped in processFindings | Snapped to valid line, posted         |
| Invalid line, valid file | Downgrade to file-level comment     | Dropped in processFindings | Downgraded, posted as file comment    |
| Truly unplaceable        | No salvage possible                 | Dropped (correct)          | Dropped after normalization (correct) |

### Fix: Split Validation Into Two Stages

**Stage 1 — Semantic validation (in `processFindings`, normalization-independent):**

- Self-contradiction filtering (info severity + dismissive language + no suggestion)
- Classification (inline / file-level / global / cross-file)
- No diff/line checking — does not require `lineResolver`

**Stage 2 — Diff-bound validation (in platform reporters, AFTER normalization):**

- Line validity against normalized diff positions
- Path existence against normalized file list
- Runs only after `normalizeFindingsForDiff()` has remapped/snapped/downgraded

### Concrete Implementation

#### Step 1a: Extract semantic-only validation

In `finding-validator.ts`:

```typescript
// NEW: Semantic validation only (no lineResolver needed)
export function validateFindingsSemantics(findings: Finding[]): FindingValidationSummary {
  // Pass 1: classify (inline/file-level/global/cross-file)
  // Pass 3: self-contradiction detection
  // Skip Pass 2 (line validation) entirely
}

// EXISTING: Full validation (for use in reporters after normalization)
export function validateNormalizedFindings(
  findings: Finding[],
  lineResolver: LineResolver,
  diffFilePaths: string[]
): FindingValidationSummary {
  // Pass 1: classify
  // Pass 2: line validation against normalized positions
  // Pass 3: self-contradiction detection
}
```

#### Step 1b: Simplify processFindings

In `report.ts`:

```typescript
export function processFindings(/* existing params */) {
  // deduplicate → sanitize → validateFindingsSemantics() → sort
  // NO lineResolver construction
  // NO line-based filtering
  // Self-contradictions still filtered here
}
```

#### Step 1c: Add Stage 2 to reporters

In `github.ts` (and `ado.ts`):

```typescript
// After existing normalizeFindingsForDiff():
const normalized = normalizeFindingsForDiff(findings, lineResolver);
const validated = validateNormalizedFindings(normalized, lineResolver, diffFilePaths);
// Post only validated.validFindings
```

#### Step 1d: Address gating interaction

**CRITICAL**: `checkGating()` (`report.ts:262-278`) receives `completeFindings` from `processFindings()`. If line-filtered findings are no longer removed in `processFindings()`, gating will see findings that were previously invisible. Options:

- **(Preferred)** Move gating to after reporting, using post-normalization findings from the reporter
- **(Alternative)** Keep gating in current position but have it ignore findings without valid line placement (file-level/global findings don't affect gating thresholds)

### Logging Taxonomy

Reporters must distinguish four outcomes:

- `[filtered:semantic]` — self-contradicting info finding, removed in Stage 1
- `[remapped]` — renamed-path or snapped-line finding, successfully placed after normalization
- `[downgraded:file-level]` — invalid inline position, downgraded to file comment
- `[filtered:unplaceable]` — no valid placement after normalization, removed in Stage 2

### Tests Required

**In `report.test.ts`:**

- Finding with old renamed path survives `processFindings()`
- Finding with stale line survives `processFindings()`
- Self-contradicting finding is still filtered in `processFindings()`

**In platform report tests (new or existing):**

- Renamed-file finding is remapped, not dropped
- Invalid inline finding is downgraded to file-level, not dropped
- Truly unplaceable finding is filtered after normalization

**In `line-resolver.test.ts`:**

- Preserve existing downgrade/remap behavior as canonical contract

### Acceptance Criteria

- No finding is dropped solely because its original path/line is stale if normalization could salvage it
- Report totals/logs match posted output
- GitHub and ADO reporting paths behave consistently after the fix
- `checkGating()` operates on post-normalization findings

---

## Regression 2: Name-Based Mutation Tracking

### Root Cause

The control-flow detector uses string names as variable identity at every level:

| Location                                                  | Structure                                 | Problem                                              |
| --------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `collectMutatedNames()` (safe-source-detector.ts:436)     | `Set<string>`                             | Inner `ITEMS` marks outer `ITEMS` as mutated         |
| `safeConstArrayNames` (safe-source-detector.ts:47)        | `Set<string>`                             | Inner const array with same name shadows outer       |
| `TaintedVariable.name` (vulnerability-detector.ts:168)    | `string`                                  | No scope disambiguation in taint propagation         |
| `findTaintInExpression()` (vulnerability-detector.ts:587) | `tainted.find(t => t.name === node.text)` | **Primary scope confusion vector** — pure name match |
| `findAffectedVariable()` (vulnerability-detector.ts:617)  | `RegExp(\`\\b${name}\\b\`)`               | Fragile regex, matches any identifier with same text |

### Existing Partial Mitigation

`filterSafeSources()` already uses `safeSourceKey(file, line, variableName)` composite keys, which prevents cross-scope collisions for the safe-source filter specifically. The scope-stack work primarily benefits `trackTaint()`, `findTaintInExpression()`, and `findAffectedVariable()` in the vulnerability detector.

### Fix: Lexical Scope Stack with Declaration-Node Identity

**Approach**: Build a lexical scope stack using AST traversal (no TypeChecker dependency). Track declarations by node reference instead of name strings.

**Why not TypeChecker?**

- No `ts.Program` exists in the codebase — only bare `ts.SourceFile` parsing
- Creating a Program costs ~50-200ms per file, exceeding the 50ms performance budget
- The scope stack handles 95% of cases (everything except cross-module aliasing, which is already an explicit non-goal per the spec)

**Why not `ts.Node` in data types?**

- `ts.Node` objects hold circular references (parent, sourceFile, scanner state)
- Not serializable to JSON — would crash logging, caching, benchmark scoring
- **Use node-identity strings** (`file:line:col`) or **WeakMap side channel** instead

### Concrete Implementation

#### Step 1: Build ScopeStack utility

```typescript
// NEW: router/src/agents/control_flow/scope-stack.ts (~150-200 LOC)

interface ScopeEntry {
  node: ts.Node; // scope-creating node
  declarations: Map<string, ts.Node>; // name → declaration node
  depth: number;
}

export class ScopeStack {
  private stack: ScopeEntry[] = [];

  enterScope(node: ts.Node): void;
  leaveScope(): void;
  addDeclaration(name: string, node: ts.Node): void;
  resolveDeclaration(name: string): ts.Node | undefined; // walks stack innermost-first
  isInScope(declarationNode: ts.Node): boolean;
}
```

Scope boundaries: `ts.isBlock()`, `ts.isFunctionDeclaration()`, `ts.isArrowFunction()`, `ts.isMethodDeclaration()`, `ts.isClassDeclaration()`, `ts.isForStatement()`, `ts.isForOfStatement()`, `ts.isForInStatement()`.

#### Step 2: Refactor collectMutatedNames → collectMutatedBindings

```typescript
// BEFORE
function collectMutatedNames(sourceFile: ts.SourceFile): Set<string>;

// AFTER
function collectMutatedBindings(sourceFile: ts.SourceFile, scopeStack: ScopeStack): Set<string>; // still returns name:line:col identity strings, NOT ts.Node
```

On assignment (`ITEMS[0] = 'x'`), resolve `ITEMS` via `scopeStack.resolveDeclaration('ITEMS')` to find which declaration is being mutated. Key the mutation set on the declaration's identity string, not the raw name.

#### Step 3: Refactor safeConstArrayNames

```typescript
// BEFORE
const safeConstArrayNames = new Set<string>(); // {'ITEMS', 'PATTERNS'}

// AFTER
const safeConstArrayDecls = new Map<string, ts.Node>(); // {'file:5:6' → declNode}
```

#### Step 4: Fix findTaintInExpression (PRIMARY TARGET)

This is the most important fix. At `vulnerability-detector.ts:587`:

```typescript
// BEFORE
tainted.find((t) => t.name === node.text);

// AFTER — resolve identifier to declaration, match by declaration identity
const decl = scopeStack.resolveDeclaration(node.text);
const declKey = decl ? nodeIdentityKey(decl) : null;
tainted.find((t) => t.declarationKey === declKey);
```

#### Step 5: Fix findAffectedVariable

Replace regex matching with declaration-identity matching:

```typescript
// BEFORE
const varPattern = new RegExp(`\\b${taintedVar.name}\\b`);
if (varPattern.test(sink.expression)) { ... }

// AFTER — parse sink expression, resolve identifiers to declarations
// Match when a tainted declaration's identity appears in the sink
```

### Mutation Vector Coverage

| Vector                                 | Current                      | After Scope Stack                |
| -------------------------------------- | ---------------------------- | -------------------------------- |
| Element assignment `ITEMS[0] = 'x'`    | Detects (name-based)         | Detects (declaration-based)      |
| Property assignment `ITEMS.prop = x`   | Detects (name-based)         | Detects (declaration-based)      |
| Array.prototype methods `ITEMS.push()` | Not detected                 | Not detected (Phase 2)           |
| Aliasing `const a = ITEMS; a[0] = 'x'` | Not detected                 | Not detected (requires dataflow) |
| Shadowed inner mutation                | False positive (marks outer) | Correct (scoped to inner)        |

### Tests Required

- Outer safe const array + inner shadowed mutable variable with same name → outer remains safe
- Direct mutation of outer const array via element assignment → outer is not safe
- Property mutation on same binding still invalidates safety
- Nested function references to outer binding still match correctly
- Shadowing inside callback/function/block does not poison outer declaration
- `findTaintInExpression()` with same-name variables in different scopes → correct taint isolation

### Acceptance Criteria

- Shadowed identifiers no longer suppress safe-source detection for unrelated outer bindings
- Real mutations of the tracked declaration still disable safety
- `findTaintInExpression()` resolves to correct declaration per scope
- `findAffectedVariable()` uses declaration identity, not regex on name text
- No regression in existing safe-source suppression coverage
- Performance stays within 50ms per file budget

---

## Delivery Sequence

### Phase 1: Report Pipeline (estimated 5-6 hours)

1. Extract `validateFindingsSemantics()` from `finding-validator.ts`
2. Create `validateNormalizedFindings()` for post-normalization use
3. Update `processFindings()` to call semantic-only validation
4. Add Stage 2 validation to `github.ts` and `ado.ts` after normalization
5. Resolve `checkGating()` interaction (move to post-normalization or exclude unplaced findings)
6. Lock with regression tests: renamed-file survives, stale-line survives, self-contradiction still filtered

### Phase 2: Scope-Aware Taint Tracking (estimated 6-8 hours)

1. Build `ScopeStack` utility class
2. Refactor `collectMutatedNames()` → `collectMutatedBindings()`
3. Refactor `safeConstArrayNames` to declaration-keyed structure
4. Fix `findTaintInExpression()` — primary scope confusion vector
5. Fix `findAffectedVariable()` — replace regex with declaration matching
6. Add shadowing regression tests

### Phase 3: Verification (estimated 2-3 hours)

1. Full test suite
2. Built dist/ benchmark command run
3. GITHUB_EVENT_PATH integration test
4. Compare report/logging output before and after

---

## Risk Controls

| Risk                                                               | Severity | Mitigation                                                          |
| ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------- |
| Changing validation order alters summary counts                    | Medium   | Logging taxonomy distinguishes semantic vs diff-bound filtering     |
| `checkGating()` sees previously-filtered findings                  | High     | Resolve in Phase 1 step 5 — gating must use post-normalization data |
| `ts.Node` serialization crashes                                    | High     | Use identity strings (`file:line:col`), never embed node references |
| Scope stack misses edge cases (hoisting, complex destructuring)    | Low      | Document as known limitations; lexical stack handles 95% of cases   |
| `findTaintInExpression` name-match is the primary confusion vector | High     | Explicitly targeted in Phase 2 step 4                               |
| Benchmark adapter bypasses `processFindings()`                     | Low      | Adapter tests detector directly; not affected by pipeline refactor  |
| Hardcoded fixture counts in benchmark tests                        | Low      | Don't modify fixtures during this work                              |

---

## Definition of Done

- Renamed-file and stale-line findings are preserved through reporting as remapped or downgraded comments
- Safe const arrays are evaluated by binding identity, not shared identifier text
- `findTaintInExpression()` and `findAffectedVariable()` use declaration-scoped identity
- Both regressions have focused regression tests in place
- GitHub and ADO reporting paths behave consistently after the fix
- `checkGating()` operates on post-normalization findings
- No finding is dropped solely because its original path/line is stale if normalization could salvage it
- Report totals/logs match posted output
- Performance stays within 50ms per file budget for safe-source detection

---

## Files to Change

### Phase 1 (Report Pipeline)

| File                                                 | Change                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| `router/src/report/finding-validator.ts`             | Split into `validateFindingsSemantics()` + `validateNormalizedFindings()` |
| `router/src/phases/report.ts`                        | Remove line validation; call semantic-only validator                      |
| `router/src/report/github.ts`                        | Add Stage 2 validation after `normalizeFindingsForDiff()`                 |
| `router/src/report/ado.ts`                           | Same as github.ts                                                         |
| `router/src/__tests__/report.test.ts`                | Update assertions for surviving stale/renamed findings                    |
| `router/tests/unit/report/finding-validator.test.ts` | Add Stage 2 tests                                                         |

### Phase 2 (Scope-Aware Tracking)

| File                                                                 | Change                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `router/src/agents/control_flow/scope-stack.ts`                      | **NEW**: ScopeStack utility class                       |
| `router/src/agents/control_flow/safe-source-detector.ts`             | Refactor mutation tracking to use scope stack           |
| `router/src/agents/control_flow/vulnerability-detector.ts`           | Fix `findTaintInExpression()`, `findAffectedVariable()` |
| `router/tests/unit/agents/control_flow/safe-source-detector.test.ts` | Add shadowing regression tests                          |
| `router/tests/unit/agents/control_flow/scope-stack.test.ts`          | **NEW**: ScopeStack unit tests                          |
