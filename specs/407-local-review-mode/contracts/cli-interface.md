# CLI Interface Contract: Local Review Mode

**Feature Branch**: `407-local-review-mode`
**Date**: 2026-02-01

---

## Command Signature

```
ai-review <path> [options]
```

## Arguments

| Argument | Type   | Default | Description                                           |
| -------- | ------ | ------- | ----------------------------------------------------- |
| path     | string | "."     | Directory to review (must be within a git repository) |

## Options

### Diff Selection

| Option            | Type    | Default     | Description                               |
| ----------------- | ------- | ----------- | ----------------------------------------- |
| `--base <ref>`    | string  | auto-detect | Base reference for comparison             |
| `--head <ref>`    | string  | HEAD        | Head reference                            |
| `--range <range>` | string  | -           | Git range (e.g., HEAD~3.., main..feature) |
| `--staged`        | boolean | false       | Review only staged changes                |
| `--uncommitted`   | boolean | true        | Include uncommitted changes               |

### Filtering

| Option          | Type   | Default | Description             |
| --------------- | ------ | ------- | ----------------------- |
| `--pass <name>` | string | -       | Run specific pass only  |
| `--agent <id>`  | string | -       | Run specific agent only |

### Output

| Option           | Type    | Default | Description                        |
| ---------------- | ------- | ------- | ---------------------------------- |
| `--format <fmt>` | enum    | pretty  | Output format: pretty, json, sarif |
| `--no-color`     | boolean | false   | Disable colored output             |
| `--quiet, -q`    | boolean | false   | Minimal output (errors only)       |
| `--verbose, -v`  | boolean | false   | Show debug information             |

### Execution

| Option                | Type    | Default        | Description                   |
| --------------------- | ------- | -------------- | ----------------------------- |
| `--dry-run`           | boolean | false          | Show what would be reviewed   |
| `--cost-only`         | boolean | false          | Estimate cost without running |
| `-c, --config <path>` | string  | .ai-review.yml | Config file path              |

### Standard

| Option          | Type | Description  |
| --------------- | ---- | ------------ |
| `-h, --help`    | -    | Show help    |
| `-V, --version` | -    | Show version |

---

## Exit Codes

| Code | Meaning                                                        |
| ---- | -------------------------------------------------------------- |
| 0    | Success (no findings, or findings below gating threshold)      |
| 1    | Failure (findings exceed gating threshold, or execution error) |
| 2    | Invalid arguments or configuration                             |

### Exit Code Truth Table

| Findings            | Gating Enabled | Threshold | Exit Code |
| ------------------- | -------------- | --------- | --------- |
| None                | any            | any       | 0         |
| Info only           | any            | any       | 0         |
| Warnings only       | disabled       | any       | 0         |
| Warnings only       | enabled        | error     | 0         |
| Warnings only       | enabled        | warning   | 1         |
| Errors present      | disabled       | any       | 0         |
| Errors present      | enabled        | error     | 1         |
| Errors present      | enabled        | warning   | 1         |
| Execution failure   | any            | any       | 1         |
| Invalid args/config | any            | any       | 2         |

**Note**: Gating threshold applies regardless of output mode (`--quiet` does not affect exit code).

---

## Option Precedence & Mutual Exclusivity

1. Command-line options override config file
2. `--range` is mutually exclusive with `--base`/`--head`:
   - If both specified: emit warning "Both --range and --base/--head specified; using --range" and use `--range`
3. `--staged` overrides `--uncommitted`:
   - `--staged` alone: review staged changes only
   - `--uncommitted` alone: review all uncommitted (staged + unstaged)
   - Both specified: review staged changes only (staged wins)
   - Neither + explicit `--uncommitted=false`: error "Nothing to review"
4. `--quiet` and `--verbose` are mutually exclusive:
   - If both specified: error "Cannot use --quiet and --verbose together"

---

## Examples

### Basic Usage

```bash
# Review uncommitted changes in current directory
ai-review .

# Review with explicit base branch
ai-review . --base main

# Review only staged changes (pre-commit hook)
ai-review . --staged --quiet

# Review specific commit range
ai-review . --range HEAD~3..
```

### Output Formats

```bash
# Human-readable (default)
ai-review .

# JSON for scripting
ai-review . --format json

# SARIF for IDE integration
ai-review . --format sarif > results.sarif
```

### Debugging

```bash
# Verbose output
ai-review . --verbose

# Dry run (show what would be reviewed)
ai-review . --dry-run

# Run specific agent only
ai-review . --agent semgrep
```

### Cost Management

```bash
# Estimate cost before running (upper bound based on input tokens + max output)
ai-review . --cost-only

# Review with custom config
ai-review . -c custom-config.yml
```

**Note**: `--cost-only` produces an **upper-bound estimate** based on input token count plus assumed maximum output tokens. Actual cost may be lower depending on model responses.

---

## Output Format Specifications

### Pretty Format (default)

```
🔍 odd-ai-reviewers v1.2.0
   Analyzing 12 files (847 lines changed)
   Config: .ai-review.yml ✓
   Base: main (auto-detected)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 PASS 1: Static Analysis (semgrep)

┌─ src/auth.ts:42 ─────────────────────────── warning ─┐
│ Hardcoded secret detected (CWE-798)                  │
│                                                      │
│   40 │ // Configuration                              │
│   41 │ const config = {                              │
│ ▸ 42 │   apiKey: "sk-1234567890abcdef",              │
│   43 │ };                                            │
│                                                      │
│ 💡 Use environment variables for secrets             │
└──────────────────────────────────────────────────────┘

✓ Static pass complete: 0 errors, 1 warning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 SUMMARY

   Errors:      0
   Warnings:    1
   Suggestions: 0

   Files:    12 analyzed
   Cost:     $0.03 (estimated)
   Time:     4.2s
```

### JSON Format

```json
{
  "schema_version": "1.0.0",
  "version": "1.2.0",
  "timestamp": "2026-02-01T12:00:00Z",
  "summary": {
    "errorCount": 0,
    "warningCount": 1,
    "infoCount": 0,
    "filesAnalyzed": 12,
    "linesChanged": 847,
    "executionTimeMs": 4200,
    "estimatedCostUsd": 0.03
  },
  "findings": [
    {
      "severity": "warning",
      "file": "src/auth.ts",
      "line": 42,
      "message": "Hardcoded secret detected (CWE-798)",
      "suggestion": "Use environment variables for secrets",
      "ruleId": "secrets-hardcoded-api-key",
      "sourceAgent": "semgrep"
    }
  ],
  "passes": [
    {
      "name": "static",
      "durationMs": 1200,
      "findingsCount": 1,
      "agents": [
        {
          "id": "semgrep",
          "status": "success",
          "findingsCount": 1
        }
      ]
    }
  ]
}
```

**Field Definitions:**

- `schema_version`: Output format version for consumer compatibility validation (FR-SCH-001)
- `version`: Tool version from package.json
- `timestamp`: ISO 8601 format, always UTC (Z suffix)

```

### SARIF Format

Follows SARIF 2.1.0 specification. See: https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html

---

## Error Messages

### Not a Git Repository

```

Error: Not a git repository (or any parent up to root)

Hint: Run this command from within a git repository, or specify a path to one:
ai-review /path/to/repo

```

### No Changes Detected

```

✓ No changes to review

Base: main
Head: HEAD

No uncommitted or staged changes found.

```

### Missing API Credentials

```

Error: No API credentials found

To use AI review, set one of the following environment variables:
ANTHROPIC_API_KEY - For Claude models
OPENAI_API_KEY - For GPT models
AZURE_OPENAI_KEY - For Azure OpenAI
OLLAMA_HOST - For local Ollama

See: https://docs.oddessentials.com/ai-review/setup

```

### Invalid Configuration

```

Error: Invalid configuration in .ai-review.yml

Line 12: 'passes[0].agents' must be an array
Line 18: Unknown provider 'gemini'

Run 'ai-review validate' for detailed diagnostics.

```

### Config File Not Found

```

Error: Config file not found: custom-config.yml

Hint: Remove -c flag to use zero-config defaults, or check the file path.

```

### Mutually Exclusive Options

```

Error: Cannot use --quiet and --verbose together

Use --quiet for minimal output (errors only), or --verbose for debug information.

```

```

Warning: Both --range and --base/--head specified; using --range

```

### Nothing to Review

```

Error: Nothing to review

Both --staged=false and --uncommitted=false specified.
Use --staged to review staged changes, or --uncommitted for all uncommitted changes.

```

---

## Signal Handling

| Signal          | Behavior                                             |
| --------------- | ---------------------------------------------------- |
| SIGINT (Ctrl+C) | Clean shutdown, display partial results if available |
| SIGTERM         | Clean shutdown, no output                            |
| SIGHUP          | Ignored (continue execution)                         |

### Partial Results Definition

When interrupted (SIGINT), partial results include:
- Findings from agents that completed before interruption
- If interrupted mid-agent execution, that agent's findings are excluded
- Summary shows `[interrupted]` marker with completion percentage
- Exit code is 1 (treated as execution failure)

Example interrupted output:
```

📊 SUMMARY [interrupted at 67%]

Errors: 2 (partial)
Warnings: 3 (partial)

Agents: 2/3 completed (semgrep ✓, opencode ✓, pr-agent ✗ interrupted)

```

---

## Environment Variables

| Variable            | Purpose                              |
| ------------------- | ------------------------------------ |
| `NO_COLOR`          | Disable colors (standard convention) |
| `FORCE_COLOR`       | Force colors even if not TTY         |
| `AI_REVIEW_CONFIG`  | Default config file path             |
| `AI_REVIEW_VERBOSE` | Enable verbose mode                  |
```
