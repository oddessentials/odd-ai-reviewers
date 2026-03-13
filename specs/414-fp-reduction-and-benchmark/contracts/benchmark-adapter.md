# Contract: Benchmark Adapter Script

**Script**: `scripts/benchmark-adapter.ts`
**Purpose**: Transform odd-ai-reviewers CLI JSON output into withmartian benchmark candidate format

## CLI Interface

```bash
# Run adapter against benchmark golden comments
npx tsx scripts/benchmark-adapter.ts \
  --golden-dir <path-to-golden-comments> \
  --output <path-to-candidates.json> \
  [--projects sentry,calcom]           # Optional: filter to specific projects
  [--concurrency 3]                    # Optional: parallel review runs (default: 1, max: 5)
  [--timeout-per-pr 300]              # Optional: per-PR timeout in seconds (default: 300, max: 600)
  [--max-retries 1]                   # Optional: max retries per failed PR (default: 1, max: 3)
  [--cache-dir /tmp/benchmark-cache]  # Optional: cache directory for cloned repos
  [--no-cleanup]                      # Optional: keep cloned repos after processing
  [--max-runtime 7200]               # Optional: max total runtime in seconds (default: 7200)
  [--dry-run]                        # Optional: validate clone + format without LLM calls
```

## Input: Golden Comment Files

```json
// golden_comments/<project>/<pr-number>.json
{
  "pr_title": "Fix null pointer in auth middleware",
  "url": "https://github.com/odd-ai-benchmark/sentry/pull/42",
  "comments": [{ "comment": "Null check missing on user object", "severity": "High" }]
}
```

## Output: Candidate JSON

```json
// candidates.json
{
  "https://github.com/odd-ai-benchmark/sentry/pull/42": {
    "odd-ai-reviewers": [
      {
        "text": "Potential null pointer: user object not checked before access. Suggestion: Add null check before accessing user.email",
        "path": "src/auth/middleware.ts",
        "line": 42,
        "source": "extracted"
      }
    ]
  }
}
```

## Field Mapping

| CLI JSON Field    | Candidate Field | Transform                                                            |
| ----------------- | --------------- | -------------------------------------------------------------------- |
| `finding.message` | `text`          | Direct; append `. Suggestion: ${suggestion}` when suggestion present |
| `finding.file`    | `path`          | Direct                                                               |
| `finding.line`    | `line`          | Direct; `null` if undefined                                          |
| (constant)        | `source`        | Always `"extracted"`                                                 |

## Error Handling

- Unavailable PR repository: skip, log warning, include in summary
- CLI failure on a PR: skip, log error with exit code
- Empty findings: include PR in output with empty candidate array
- Invalid JSON from CLI: skip, log parse error

## Resource Controls

| Control            | Default             | Max  | Flag                   |
| ------------------ | ------------------- | ---- | ---------------------- |
| Concurrency        | 1                   | 5    | `--concurrency`        |
| Per-PR timeout     | 300s                | 600s | `--timeout-per-pr`     |
| Max retries per PR | 1                   | 3    | `--max-retries`        |
| Clone cache        | Reuse existing      | —    | `--cache-dir`          |
| Disk space guard   | Abort if <2GB free  | —    | (automatic)            |
| Cleanup            | Delete clones after | —    | `--no-cleanup` to keep |
| Max total runtime  | 7200s (2h)          | —    | `--max-runtime`        |
| Dry run            | No LLM calls        | —    | `--dry-run`            |

## Exit Codes

| Code | Meaning                                             |
| ---- | --------------------------------------------------- |
| 0    | All PRs processed (some may have been skipped)      |
| 1    | Fatal error (invalid arguments, missing golden-dir) |
| 2    | Timeout or resource limit exceeded                  |
