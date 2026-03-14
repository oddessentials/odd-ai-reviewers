# Data Model: Close All 12 Unsuppressed FP Benchmark Scenarios

**Feature Branch**: `415-close-fp-benchmark-gaps`
**Date**: 2026-03-13

## Entities

### FrameworkPatternMatcher (existing, extended)

**Source**: `router/src/report/framework-pattern-filter.ts:18-33`

| Field               | Type                                                                                                 | Description                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `id`                | `string`                                                                                             | Unique matcher ID (T019–T026)                            |
| `name`              | `string`                                                                                             | Human-readable name                                      |
| `messagePattern`    | `RegExp`                                                                                             | Finding message regex to trigger evaluation              |
| `evidenceValidator` | `(diffContent: string, finding: Finding, nearbyLines: string[], fileDiffSection: string) => boolean` | Returns true if structural evidence supports suppression |
| `suppressionReason` | `string`                                                                                             | Reason logged when finding is suppressed                 |

**Changes**: Add T025 (Safe Local File Read) and T026 (Exhaustive Type-Narrowed Switch). Widen T019 `messagePattern` to include 3 new phrases. Update closed-set comment from 5 → 7.

**Validation rules**:

- `messagePattern` must be case-insensitive (`/i` flag)
- `evidenceValidator` must check structural evidence in diff text only — no PR descriptions, no function names
- Each matcher must have corresponding unit tests (positive + negative + safety constraint)

### BenchmarkScenario (existing, modified)

**Source**: `router/src/benchmark/scoring.ts:29-40`

| Field              | Type                | Description                                        |
| ------------------ | ------------------- | -------------------------------------------------- |
| `id`               | `string`            | Unique scenario ID (e.g., `fp-b-001`)              |
| `category`         | `string`            | Scenario category (e.g., `framework`, `pr-intent`) |
| `pattern`          | `string`            | Pattern letter A–F                                 |
| `subcategory?`     | `string`            | Sub-classification (F-pattern only)                |
| `description`      | `string`            | Human-readable description                         |
| `sourceIssue?`     | `string`            | Issue reference (e.g., `#163.5`)                   |
| `diff`             | `string`            | Unified diff content                               |
| `expectedFindings` | `ExpectedFinding[]` | Expected findings for TP scenarios                 |
| `truePositive`     | `boolean`           | Whether this is a true-positive test               |
| `prDescription?`   | `string`            | Optional PR description for context                |
| `projectRules?`    | `string[]`          | Optional project rules for context                 |

**Changes**:

- fp-c-005: Add `prDescription: "feat: Add environment-dependent feature flag"`
- fp-d-006: Set `truePositive: true`, add `expectedFindings: [{ file: "src/auth.ts", severityAtLeast: "warning", messageContains: "token" }]`
- fp-f-005: Update `diff` to include `catch (error)` block

### ExpectedFinding (existing, no changes)

**Source**: `router/src/benchmark/scoring.ts:47-53`

| Field              | Type     | Description                                                                      |
| ------------------ | -------- | -------------------------------------------------------------------------------- |
| `file`             | `string` | Required: exact file path match                                                  |
| `line?`            | `number` | Optional: exact line match                                                       |
| `severityAtLeast?` | `string` | Optional: minimum severity (info < low < medium/warning < high < error/critical) |
| `messageContains?` | `string` | Optional: case-insensitive substring match                                       |
| `ruleId?`          | `string` | Optional: exact ruleId match                                                     |

### SnapshotMetadata (existing, no schema changes)

**Source**: `router/src/benchmark/adapter.ts:288-305`

| Field                | Type     | Description                                      |
| -------------------- | -------- | ------------------------------------------------ |
| `recordedAt`         | `string` | ISO-8601 timestamp of recording                  |
| `promptTemplateHash` | `string` | SHA-256 of concatenated prompt sources (7 files) |
| `modelId`            | `string` | Model ID (auto-detected from provider SDK)       |
| `provider`           | `string` | Provider name (auto-detected)                    |
| `fixtureHash`        | `string` | SHA-256 of scenario.diff                         |
| `adapterVersion`     | `string` | Version '1.0.0'                                  |

**Changes**: No schema changes. Drift validation behavior changes — fixture hash mismatch and prompt hash mismatch both become hard failures with distinct error messages (FR-022).

### DriftCheckResult (existing, no changes)

**Source**: `router/src/benchmark/adapter.ts:349-373`

| Field     | Type           | Description                                           |
| --------- | -------------- | ----------------------------------------------------- |
| `valid`   | `boolean`      | True if no drift detected                             |
| `drifted` | `DriftField[]` | List of drifted fields with expected vs actual values |

### DISMISSIVE_PATTERNS (existing, extended)

**Source**: `router/src/report/finding-validator.ts:74-80`

**Current values** (5): `"no action required"`, `"acceptable as-is"`, `"not blocking"`, `"no change needed"`, `"can be ignored"`

**Added values** (4): `"working as intended"`, `"no issues found"`, `"non-critical"`, `"low priority"`

**Total**: 9 patterns, all case-insensitive substring matches.

**Three-gate dependency**: Pattern match alone is NEVER sufficient for suppression. All three gates must pass: (1) info severity, (2) DISMISSIVE_PATTERNS match, (3) no actionable suggestion in residual text.

## State Transitions

### Scenario Lifecycle (benchmark run)

```
LOADED → CLASSIFIED → EXECUTED → SCORED → GATED
```

1. **LOADED**: Scenario loaded from `regression-suite.json`
2. **CLASSIFIED**: Pattern determined (A/B/C/D/E/F), deterministic vs snapshot
3. **EXECUTED**: Either `runScenario()` (A/E) or `runWithSnapshot()` (B/C/D/F)
4. **SCORED**: `scoreScenario()` computes pass/fail + metrics
5. **GATED**: Release gate tests assert per-scenario (SC-001) and aggregate (SC-004)

### Snapshot Replay Lifecycle

```
LOAD → VALIDATE_FIXTURE → VALIDATE_PROMPT → REPLAY → POST_PROCESS → RETURN
```

1. **LOAD**: Read `.snapshot.json` from disk
2. **VALIDATE_FIXTURE**: Compare `fixtureHash` — hard failure if mismatch
3. **VALIDATE_PROMPT**: Compare `promptTemplateHash` — hard failure if mismatch
4. **REPLAY**: Use snapshot's `response.findings` as starting point
5. **POST_PROCESS**: Apply 3 stages (semantic → diff-bound → framework filter)
6. **RETURN**: Return filtered findings for scoring

### Finding Post-Processing Pipeline

```
RAW → SANITIZED → STAGE1 → FRAMEWORK → STAGE2 → FINAL
```

1. **RAW**: Agent returns raw findings
2. **SANITIZED**: `sanitizeFindings()` — strip zero-width chars, normalize unicode
3. **STAGE1**: `validateFindingsSemantics()` — self-contradiction filter (three-gate), PR intent filter (if prDescription present)
4. **FRAMEWORK**: `filterFrameworkConventionFindings()` — closed matcher table (T019–T026)
5. **STAGE2**: `validateNormalizedFindings()` — diff-bound line validation
6. **FINAL**: Findings ready for reporting or scoring

## Relationships

```
BenchmarkScenario 1:0..1 ResponseSnapshot    (snapshot optional, required for B/C/D/F)
BenchmarkScenario 1:0..* ExpectedFinding     (empty for FP, non-empty for TP)
Finding *:0..1 FrameworkPatternMatcher        (at most one matcher suppresses each finding)
FrameworkPatternMatcher 1:1 evidenceValidator (each matcher has exactly one validator)
SnapshotMetadata 1:1 BenchmarkScenario       (via fixtureHash link)
```
