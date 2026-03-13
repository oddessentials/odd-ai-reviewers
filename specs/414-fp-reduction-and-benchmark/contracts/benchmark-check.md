# Contract: Benchmark Regression Check Script

**Script**: `scripts/benchmark-check.ts`
**Purpose**: Validate benchmark scores against minimum thresholds; exit non-zero on regression

## CLI Interface

```bash
npx tsx scripts/benchmark-check.ts \
  --results <path-to-results-dir> \
  --min-precision 0.40 \
  --min-recall 0.30 \
  --min-f1 0.35
```

## Input: Results Directory

Reads the benchmark judge output files produced by `step3_judge_comments.py`:

- `results/odd-ai-reviewers/judgments.json` — per-PR match results
- `results/odd-ai-reviewers/summary.json` — aggregate precision, recall, F1

## Output

### Pass (exit 0)

```
Benchmark check PASSED
  Precision: 0.45 (threshold: >=0.40) ✓
  Recall:    0.35 (threshold: >=0.30) ✓
  F1:        0.39 (threshold: >=0.35) ✓
```

### Fail (exit 1)

```
Benchmark check FAILED
  Precision: 0.30 (threshold: >=0.40) ✗ REGRESSION
  Recall:    0.35 (threshold: >=0.30) ✓
  F1:        0.32 (threshold: >=0.35) ✗ REGRESSION
```

## Exit Codes

| Code | Meaning                                    |
| ---- | ------------------------------------------ |
| 0    | All scores meet or exceed thresholds       |
| 1    | One or more scores below threshold         |
| 2    | Invalid arguments or missing results files |
