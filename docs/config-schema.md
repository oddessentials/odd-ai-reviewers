# Configuration Schema Reference

The `.ai-review.yml` file controls how AI review runs in your repository.

## Full Schema

```yaml
version: 1 # Schema version (required: 1)
trusted_only: true # Only run on non-fork PRs

triggers:
  on: [pull_request, push] # When to trigger
  branches: [main, develop] # Which branches to review

passes:
  - name: static # Pass name
    agents: [semgrep] # Agents to run
    enabled: true # Enable/disable pass
    required: true # Fail fast when prerequisites are missing
  - name: semantic
    agents: [opencode, pr_agent]
    enabled: true
    required: false

limits:
  max_files: 50 # Max files per PR
  max_diff_lines: 2000 # Max diff lines
  max_tokens_per_pr: 12000 # Max LLM tokens
  max_usd_per_pr: 1.00 # Max cost per PR
  monthly_budget_usd: 100 # Monthly budget

reporting:
  github:
    mode: checks_and_comments # checks_only | comments_only | checks_and_comments
    max_inline_comments: 20 # Max inline comments
    summary: true # Post summary comment

gating:
  enabled: false # Block merge on findings
  fail_on_severity: error # error | warning | info

path_filters:
  include: # Only review these paths
    - 'src/**'
    - 'lib/**'
  exclude: # Skip these paths
    - '**/*.test.ts'
    - '**/node_modules/**'
```

## Properties

### `version` (required)

Schema version. Currently only `1` is supported.

### `trusted_only`

When `true` (default), AI review only runs on PRs from the same repository. Fork PRs are skipped.

### `triggers`

Controls when reviews run:

- `on`: Event types (`pull_request`, `push`)
- `branches`: Target branches to review

### `passes`

Array of review passes executed in order. Each pass has:

- `name`: Identifier for the pass
- `agents`: Array of agent IDs to run
- `enabled`: Whether the pass runs
- `required`: When `true`, missing prerequisites (like API keys) fail fast

Available agents:

- `semgrep` — Static security analysis (free)
- `reviewdog` — Annotation formatter
- `opencode` — OpenCode.ai semantic review
- `pr_agent` — PR-Agent AI review
- `local_llm` — Local Ollama-based review
- `ai_semantic_review` — Direct OpenAI/Anthropic SDK integration

### Agent Capability Matrix

| Agent                | Deterministic | LLM-backed | Network Access | Cost Impact  |
| -------------------- | ------------- | ---------- | -------------- | ------------ |
| `semgrep`            | ✅            | ❌         | ❌             | Free         |
| `reviewdog`          | ✅            | ❌         | ❌             | Free         |
| `opencode`           | ❌            | ✅         | ✅             | Medium       |
| `pr_agent`           | ❌            | ✅         | ✅             | Low          |
| `local_llm`          | ❌            | ✅         | ❌             | Compute-only |
| `ai_semantic_review` | ❌            | ✅         | ✅             | Medium       |

### `limits`

Budget controls to prevent runaway costs:

| Property             | Default | Description                       |
| -------------------- | ------- | --------------------------------- |
| `max_files`          | 50      | Skip review if more files changed |
| `max_diff_lines`     | 2000    | Truncate diff at this limit       |
| `max_tokens_per_pr`  | 12000   | Max LLM input tokens              |
| `max_usd_per_pr`     | 1.00    | Max estimated cost per PR         |
| `monthly_budget_usd` | 100     | Monthly spending cap              |

### `reporting`

GitHub-specific reporting options:

- `mode`: How to report findings
  - `checks_only`: Only create check runs
  - `comments_only`: Only post PR comments
  - `checks_and_comments`: Both (default)
- `max_inline_comments`: Limit inline comment spam
- `summary`: Post a summary comment

### `gating`

Optional merge blocking:

- `enabled`: If `true`, set check status based on findings
- `fail_on_severity`: Minimum severity to fail
  - `error`: Only fail on errors
  - `warning`: Fail on warnings or errors
  - `info`: Fail on any finding

### `path_filters`

Glob patterns to include/exclude files:

- `include`: Only review matching files
- `exclude`: Skip matching files

## Examples

### Minimal Configuration

```yaml
version: 1
```

Uses defaults: Semgrep-only static analysis, trusted PRs only. AI agents run only when configured.

### Static Analysis Only (Free)

```yaml
version: 1
passes:
  - name: static
    agents: [semgrep]
```

### Strict Gating

```yaml
version: 1
gating:
  enabled: true
  fail_on_severity: warning
```

### Large Repository

```yaml
version: 1
limits:
  max_files: 100
  max_diff_lines: 5000
  max_tokens_per_pr: 30000
  max_usd_per_pr: 5.00
path_filters:
  exclude:
    - '**/generated/**'
    - '**/vendor/**'
```
