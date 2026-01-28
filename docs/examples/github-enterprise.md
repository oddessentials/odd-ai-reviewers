# GitHub Enterprise Example

A comprehensive configuration for enterprise GitHub environments with full AI analysis, cost controls, and custom filtering.

## Use Case

- Enterprise/paid tier
- Multi-pass review (static + AI)
- Budget controls and monitoring
- Custom path filtering

## Workflow File

Create `.github/workflows/ai-review.yml`:

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  ai-review:
    # Block fork PRs for security
    if: github.event.pull_request.head.repo.full_name == github.repository
    uses: oddessentials/odd-ai-reviewers/.github/workflows/ai-review.yml@main
    with:
      target_repo: ${{ github.repository }}
      target_ref: ${{ github.sha }}
      pr_number: ${{ github.event.pull_request.number }}
    secrets: inherit
```

## Configuration File

Create `.ai-review.yml`:

```yaml
version: 1
trusted_only: true

passes:
  # Pass 1: Free static analysis
  - name: static
    agents: [semgrep, reviewdog]

  # Pass 2: AI semantic review
  - name: semantic
    agents: [opencode, pr_agent]

models:
  default: claude-sonnet-4-20250514
  # Optional: Different model for specific agents
  # pr_agent: gpt-4o-mini

limits:
  # Per-PR limits
  max_usd_per_pr: 5.00
  max_files: 50
  max_diff_lines: 2000

  # Monthly budget
  monthly_budget_usd: 500

  # Output limits
  max_inline_comments: 25
  max_annotations: 50

# Exclude paths from review
path_filters:
  exclude:
    - '**/*.lock'
    - '**/vendor/**'
    - '**/node_modules/**'
    - '**/*.min.js'
    - '**/dist/**'
    - '**/build/**'
```

## Required Secrets

| Secret              | Description                             |
| ------------------- | --------------------------------------- |
| `ANTHROPIC_API_KEY` | Anthropic API key                       |
| `OPENAI_API_KEY`    | OpenAI API key (optional, for pr_agent) |

## .reviewignore File

Create `.reviewignore` for additional exclusions:

```gitignore
# Generated files
*.generated.ts
*.d.ts

# Test fixtures
__fixtures__/
__snapshots__/

# Documentation
docs/
*.md

# Configuration
.github/
.vscode/
```

## What You Get

- **Multi-pass review** — Static tools run first, then AI
- **Multiple AI perspectives** — OpenCode + PR-Agent
- **Cost protection** — Per-PR and monthly limits
- **Smart filtering** — Skip generated/vendored files
- **Rich reporting** — Inline comments and annotations

## Cost Estimation

With default settings:

| PR Size                | Estimated Cost |
| ---------------------- | -------------- |
| Small (< 100 lines)    | $0.10 - $0.50  |
| Medium (100-500 lines) | $0.50 - $2.00  |
| Large (500+ lines)     | $2.00 - $5.00  |

## Customization Options

### Use Different Models

```yaml
models:
  default: claude-sonnet-4-20250514
  pr_agent: gpt-4o-mini # Cheaper for PR-Agent
```

### Add Local LLM Fallback

```yaml
passes:
  - name: semantic
    agents: [opencode, local_llm] # Fallback to Ollama
```

### Stricter Limits

```yaml
limits:
  max_usd_per_pr: 1.00
  max_files: 20
  monthly_budget_usd: 100
```

## See Also

- [GitHub Basic Example](./github-basic.md) — Free tier configuration
- [Cost Controls](../configuration/cost-controls.md) — Budget management
- [Configuration Schema](../configuration/config-schema.md) — All options
