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

## Step 2: Add Secrets

Go to your repository Settings → Secrets and variables → Actions, and add your API key:

**Single-key setup (recommended):** Just set one API key and the model will be auto-applied:

| Provider  | Secret              | Auto-applied Model                            |
| --------- | ------------------- | --------------------------------------------- |
| Anthropic | `ANTHROPIC_API_KEY` | claude-sonnet-4-20250514 (or claude-opus-4-6) |
| OpenAI    | `OPENAI_API_KEY`    | gpt-4o                                        |

## Step 3: Add Configuration (Optional)

For single-key setups, you can start without any configuration file - sensible defaults are applied.

To customize, create `.ai-review.yml` at your repository root:

### Anthropic (Claude)

```yaml
version: 1
provider: anthropic
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: semantic
    agents: [opencode]

limits:
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
```

### OpenAI (GPT-4o)

```yaml
version: 1
provider: openai
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: semantic
    agents: [opencode]

limits:
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
```

### Azure OpenAI

Azure OpenAI requires explicit configuration (no auto-apply):

```yaml
version: 1
provider: azure-openai
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: semantic
    agents: [ai_semantic_review]

limits:
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
```

**Required secrets for Azure:**

- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_DEPLOYMENT`
- `MODEL` (set to your deployment name)

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
