# Data Model: False Positive Gap Closure

**Branch**: `411-fp-gap-closure` | **Date**: 2026-03-12

## Entities

### DestructuringBinding (New)

A variable name extracted from a destructuring assignment target (BinaryExpression LHS).

| Field       | Type                | Description                                             |
| ----------- | ------------------- | ------------------------------------------------------- |
| name        | string              | The local binding name (after rename resolution)        |
| node        | ts.Node             | The AST node representing the binding                   |
| index       | number \| undefined | Position in array destructuring (for per-element taint) |
| propertyKey | string \| undefined | Original property key (for renamed destructuring)       |
| isRest      | boolean             | Whether this is a rest element (`...rest`)              |
| depth       | number              | Nesting depth (0 = top-level)                           |

**Relationships**:

- Extracted from: `ts.ArrayLiteralExpression` or `ts.ObjectLiteralExpression` (assignment targets)
- Registered in: `ScopeStack` as tainted or safe binding
- Referenced by: `findTaintInExpression()` for sink resolution

**Validation Rules**:

- `name` must be non-empty
- `depth` must be 0-10 (recursion limit)
- If `isRest` is true, `index` must be the last position

---

### FrameworkPatternMatcher (New)

A deterministic recognition rule from the closed matcher table (FR-013).

| Field             | Type                              | Description                                                     |
| ----------------- | --------------------------------- | --------------------------------------------------------------- |
| id                | string                            | Unique matcher identifier (e.g., `express-error-mw`)            |
| name              | string                            | Human-readable name                                             |
| messagePattern    | RegExp                            | Regex pattern matching finding messages that trigger evaluation |
| evidenceValidator | (finding, diffContent) => boolean | Structural evidence check against diff                          |
| suppressionReason | string                            | Diagnostic log message when finding is suppressed               |

**Validation Rules**:

- `id` must be unique across all matchers
- `messagePattern` must be case-insensitive
- `evidenceValidator` must return `false` (finding passes through) when evidence is ambiguous
- Table is closed: 3 matchers only (Express, \_prefix, assertNever)

**State Transitions**: N/A — stateless evaluation per finding.

---

### FrameworkFilterResult (New)

The output of framework pattern filter evaluation for a single finding.

| Field      | Type                | Description                          |
| ---------- | ------------------- | ------------------------------------ |
| finding    | Finding             | The evaluated finding                |
| suppressed | boolean             | Whether the finding was suppressed   |
| matcherId  | string \| undefined | Which matcher suppressed it (if any) |
| reason     | string \| undefined | Diagnostic suppression reason        |

**Relationships**:

- Input to: Diagnostic logging (FR-014 analog for framework patterns)
- Aggregated in: `FrameworkFilterSummary` for pipeline stats

---

### RecordedResponseSnapshot (New)

A captured LLM API response for deterministic benchmark replay.

| Field                       | Type              | Description                             |
| --------------------------- | ----------------- | --------------------------------------- |
| metadata.recordedAt         | string (ISO 8601) | Timestamp of recording                  |
| metadata.promptTemplateHash | string            | SHA-256 of the prompt template content  |
| metadata.modelId            | string            | Model identifier used for recording     |
| metadata.provider           | string            | Provider name (anthropic, openai, etc.) |
| metadata.fixtureHash        | string            | SHA-256 of the fixture diff content     |
| metadata.adapterVersion     | string            | Benchmark adapter version               |
| response.findings           | Finding[]         | The recorded findings output            |
| response.rawOutput          | string            | Raw LLM response for debugging          |

**Validation Rules**:

- All metadata fields required (no optional)
- `promptTemplateHash` must match current prompt template or drift is flagged
- `fixtureHash` must match current fixture content or drift is flagged

**State Transitions**:

- `fresh` → `valid` (metadata matches current state)
- `fresh` → `stale` (metadata mismatch detected → CI failure)
- `stale` → `fresh` (re-recorded via `--record` flag)

---

### UnicodeNormalizedText (Internal)

Finding message text with invisible characters stripped, used as input to self-contradiction regex matching.

| Field         | Type   | Description                                      |
| ------------- | ------ | ------------------------------------------------ |
| original      | string | The raw finding message                          |
| normalized    | string | Message with zero-width/invisible chars stripped |
| charsStripped | number | Count of characters removed (for diagnostics)    |

**Validation Rules**:

- Normalization strips only: U+200B-U+200F, U+2028-U+2029, U+FEFF
- Visible Unicode (non-Latin scripts) is preserved
- If `charsStripped > 0`, log at diagnostic level

---

## Existing Entities (Modified)

### Finding (Extended — no schema change)

No changes to the Finding interface. Framework filter and Unicode normalization operate on existing fields (`message`, `suggestion`, `severity`, `file`, `line`).

### AgentContext (No change)

`prDescription` and `projectRules` fields already exist from v1.8.0. No schema modifications needed.

### BenchmarkScenario (Extended)

New optional fields for expanded fixture coverage:

| Field                | Type                | Description                                                                      |
| -------------------- | ------------------- | -------------------------------------------------------------------------------- |
| snapshotFile         | string \| undefined | Path to recorded response snapshot (Patterns B/C/D/F)                            |
| destructuringPattern | string \| undefined | Specific destructuring type tested (array, object, renamed, rest, nested, scope) |

---

## Relationships

```
BenchmarkScenario ──uses──> RecordedResponseSnapshot (for LLM-dependent patterns)
BenchmarkScenario ──produces──> Finding[] (via adapter)
Finding ──evaluated-by──> FrameworkPatternMatcher (in Stage 1)
Finding ──produces──> FrameworkFilterResult
Finding.message ──normalized-to──> UnicodeNormalizedText (before self-contradiction check)
DestructuringBinding ──registered-in──> ScopeStack (as tainted/safe)
DestructuringBinding ──resolved-by──> findTaintInExpression() (at sink)
```
