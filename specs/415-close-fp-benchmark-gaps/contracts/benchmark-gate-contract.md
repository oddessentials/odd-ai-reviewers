# Contract: Benchmark Release Gates

**Type**: CI gate contract
**Source**: `router/tests/integration/false-positive-benchmark.test.ts`
**Consumers**: CI `benchmark-regression` job in `.github/workflows/ci.yml`

## Gate Hierarchy

### Primary Gate: SC-001 (Per-Scenario)

Each of the 11 targeted FP scenarios MUST individually produce 0 surviving findings:

```
fp-b-001, fp-b-003, fp-b-006, fp-b-007,
fp-c-005, fp-c-006,
fp-f-005, fp-f-007, fp-f-010, fp-f-014, fp-f-015
```

**Failure mode**: A single scenario with surviving findings fails the gate.
**Error message**: Lists each failed scenario ID with surviving finding count.

### Secondary Gate: SC-004 (Aggregate Floor)

Aggregate FP suppression rate across all 36 FP scenarios >= 90%.

**Failure mode**: Too many existing scenarios regressed.
**Relationship to SC-001**: If SC-001 passes, SC-004 is mathematically guaranteed (assuming existing 25 scenarios don't regress, protected by SC-010).

### TP Gates: SC-002 (Recall), SC-003 (Precision)

- SC-002: TP recall = 100% (all expected findings matched)
- SC-003: TP precision >= 70% (not too many extraneous findings)
- SC-005: TP recall specifically for all 19 TP scenarios

### Drift Gates: FR-022

- Fixture hash mismatch → hard failure
- Prompt hash mismatch → hard failure (with re-record instruction)
- Both must match for replay to proceed

### Runnable Ratio Gate

- > = 80% of scenarios must have snapshots (for snapshot-dependent patterns)
- Prevents vacuous pass when most scenarios are skipped

## Smoke Test Thresholds (CI benchmark-check)

| Metric    | Threshold |
| --------- | --------- |
| Precision | >= 0.40   |
| Recall    | >= 0.30   |
| F1        | >= 0.35   |

## Invariants

1. **Replay-only**: No live API calls in CI benchmark gate
2. **Deterministic**: Same inputs always produce same gate result
3. **Non-weakening**: Thresholds can be raised, never lowered
4. **Per-scenario primacy**: SC-001 per-scenario gate takes precedence over SC-004 aggregate
