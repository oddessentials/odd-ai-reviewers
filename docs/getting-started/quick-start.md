# Quick Start

Get AI-powered code reviews on your pull requests in under 5 minutes.

## Prerequisites

- A GitHub repository (or Azure DevOps project)
- An API key from Anthropic or OpenAI (or local Ollama setup)
- Repository admin access

## Step 1: Add the Workflow

Create `.github/workflows/ai-review.yml` in your repository:

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  ai-review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    uses: oddessentials/odd-ai-reviewers/.github/workflows/ai-review.yml@main
    with:
      target_repo: ${{ github.repository }}
      target_ref: ${{ github.sha }}
      pr_number: ${{ github.event.pull_request.number }}
    secrets: inherit
```

## Step 2: Add Configuration

Create `.ai-review.yml` at your repository root:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: semantic
    agents: [opencode]

models:
  default: claude-sonnet-4-20250514

limits:
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
```

## Step 3: Add Secrets

Go to your repository Settings → Secrets and variables → Actions, then add:

| Secret              | Value                  |
| ------------------- | ---------------------- |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

## Step 4: Open a Pull Request

Create a new branch, make some changes, and open a pull request. The AI review will run automatically.

## What Happens Next

1. **Static Analysis** — Semgrep runs first (free, fast)
2. **AI Review** — Claude analyzes your code changes
3. **Results** — Findings appear as PR comments and check annotations

## Next Steps

- [Run Your First Review](./first-review.md) — Detailed walkthrough
- [Configuration Options](../configuration/config-schema.md) — Customize the review
- [Cost Controls](../configuration/cost-controls.md) — Manage your budget
