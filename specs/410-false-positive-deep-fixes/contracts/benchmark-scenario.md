# Contract: Benchmark Scenario & Scoring

**Module**: `router/tests/fixtures/benchmark/scoring.ts` and `adapter.ts`
**Depends on**: Finding type, JsonOutput from terminal.ts, LocalReviewDependencies DI

## Benchmark Fixture Format

Each fixture file is a JSON array of BenchmarkScenario objects stored in a single consolidated file: `router/tests/fixtures/benchmark/regression-suite.json`.

```json
{
  "version": "1.0.0",
  "scenarios": [
    {
      "id": "fp-a-001",
      "category": "safe-source",
      "pattern": "A",
      "description": "RegExp from hardcoded constant array — HEDGE_PHRASES",
      "sourceIssue": "#158.1",
      "diff": "diff --git a/src/validators.ts b/src/validators.ts\n...",
      "expectedFindings": [],
      "truePositive": false
    }
  ]
}
```

### Fixture Composition (Locked)

**False-Positive Regression Fixtures (43 total)**:

| Category | Pattern | Count | Content |
|----------|---------|-------|---------|
| safe-source | A | 12 | SAST without data-flow (const arrays, __dirname, innerHTML from safe source) |
| framework-conventions | B | 5 | Express MW, React Query, Promise.allSettled, TS _prefix |
| project-context | C | 4 | Constant externalization against project rules |
| pr-description | D | 5 | Flagging stated PR purpose, documented decisions |
| self-contradicting | E | 4 | Wrong line numbers, self-dismissing language |
| mixed | F | 13 | Remaining false positives (each MUST have `pattern` and `category` fields documenting their root cause) |

**True-Positive Preservation Fixtures (minimum 10)**:

Each vulnerability family MUST have at least 2 TP preservation cases:

| Family | Min Cases | Example Scenarios |
|--------|-----------|-------------------|
| injection | 2 | SQL injection via user input, command injection via req.query |
| xss | 2 | innerHTML from req.query, dangerouslySetInnerHTML from user data |
| path_traversal | 2 | readFile with user-controlled path, createReadStream with URL param |
| ssrf | 2 | fetch with user-controlled URL, axios.get with query parameter |
| auth_bypass | 2 | Delete operation without auth check, admin action without role check |

**Total**: 43 FP + 10+ TP = 53+ scenarios

### The 13 "Remaining" Fixtures

Each of the 13 fixtures not fitting patterns A-E MUST be individually categorized before implementation. Required fields:
- `category`: Most appropriate category name (may create new subcategories)
- `pattern`: "F" (for mixed/other) with a `subcategory` field explaining the specific root cause
- `description`: Clear explanation of why this is a false positive and why it doesn't fit A-E

### Fixture Refresh (Post-Release)

The 43+10 internal fixtures are locked for this release. To guard against overfitting, the CLI command accepts any fixture file conforming to the BenchmarkScenario schema. Periodically import 5-10 new scenarios from external code review benchmarks and run them as a separate validation pass. External fixtures do NOT affect the release gate thresholds (SC-001 through SC-005) but are reported in the BenchmarkReport under a separate `source` label.

## Scoring Contract (Locked)

### Metric Definitions

Metrics are computed **separately** for two test pools. They MUST NOT be conflated.

#### Pool 1: FP-Regression Scenarios (43 fixtures)

For each scenario where `truePositive: false`:
- **TN (True Negative)**: `actualFindings.length === 0` — correct suppression
- **FP (False Positive)**: `actualFindings.length > 0` — incorrect finding produced

Pool 1 Metrics:
- **Suppression Rate** = TN / (TN + FP) — target: >= 85% (SC-001)
- **FP Rate** = FP / (TN + FP) = 1 - Suppression Rate

#### Pool 2: TP-Preservation Scenarios (10+ fixtures)

For each scenario where `truePositive: true`:
- **TP (True Positive)**: All expectedFindings matched by actual findings (1:1 matching)
- **FN (False Negative)**: At least one expectedFinding NOT matched by any actual finding
- **Extraneous**: Actual findings that don't match any expectedFinding (logged but not counted as FP in this pool)

Pool 2 Metrics:
- **Recall** = TP / (TP + FN) — target: 100% (SC-002, zero regression)
- **Precision** = TP / (TP + Extraneous) — target: >= 70% (SC-003)

#### Combined Report

The BenchmarkReport includes both pools' metrics separately plus a combined summary.

### Finding Matching Algorithm (1:1, Strict)

For TP-preservation scenarios, matching is **1:1** (each actual finding matches at most one expected finding):

1. Sort expectedFindings by specificity (most fields defined → matched first)
2. For each expectedFinding, find the best matching actualFinding:
   - **File match** (required): `actualFinding.file === expectedFinding.file`
   - **Severity match** (if specified): `severityRank(actual.severity) >= severityRank(expected.severityAtLeast)`
   - **Message match** (if specified): `actual.message.includes(expected.messageContains)`
   - **Rule match** (if specified): `actual.ruleId === expected.ruleId`
3. Mark matched actualFinding as consumed (cannot match another expectedFinding)
4. Unmatched expectedFindings → FN count
5. Unconsumed actualFindings → Extraneous count

### Timeout Handling

- Default timeout per scenario: 30 seconds
- Timeout result: Scored as FN for TP tests, scored as TN for FP tests (conservative: timeout = no findings)
- Timeout scenarios logged with `[benchmark] scenario {id} timed out after {ms}ms`

## CLI Command

### `ai-review benchmark --fixtures <path> [--output <path>] [--verbose]`

- `--fixtures <path>`: Path to benchmark fixture JSON file (required)
- `--output <path>`: Write BenchmarkReport JSON to file (optional; defaults to stdout)
- `--verbose`: Print per-scenario pass/fail details

**Exit codes**:
- 0: All scenarios passed (suppression rate >= 85% AND recall = 100%)
- 1: Some scenarios failed
- 2: Configuration or fixture loading error

## Integration Test

### `router/tests/integration/false-positive-benchmark.test.ts`

Vitest test suite following control_flow-benchmark.test.ts pattern:

```text
describe('False Positive Regression Suite')
  describe('Pool 1: FP Suppression')
    describe('Pattern A: Safe Sources')
      it.each(patternAFixtures)('should not flag: $description')
    describe('Pattern B: Framework Conventions')
      it.each(patternBFixtures)('should not flag: $description')
    ...
  describe('Pool 2: TP Preservation')
    describe('Injection')
      it.each(injectionTPFixtures)('should detect: $description')
    describe('XSS')
      it.each(xssTPFixtures)('should detect: $description')
    ...
  describe('Release Gate Metrics')
    it('SC-001: FP suppression rate >= 85%')
    it('SC-002: TP recall = 100%')
    it('SC-003: TP precision >= 70%')
```

## CI Release Gate

The benchmark test suite MUST run in CI on every PR targeting main. The test uses exit code semantics:
- Suppression rate < 85% → test failure → PR blocked
- TP recall < 100% → test failure → PR blocked
- TP precision < 70% → test warning (non-blocking for initial release)

This enforces SC-005: regression suite passes as a release gate before merge.

**Note**: Scenarios using mock LLM responses in CI validate the filtering pipeline only, not prompt effectiveness. Periodic runs with live LLM calls are recommended to validate prompt-dependent fixtures (Patterns B/C/D).
