# GitHub Basic Example

A minimal configuration for GitHub Actions using only free static analysis tools.

## Use Case

- Free tier (no API costs)
- Quick setup
- Static analysis only (Semgrep)

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
  - name: static
    agents: [semgrep]

# No AI agents = no API costs
# No models or limits needed
```

## Required Secrets

None! This configuration uses only free tools.

## What You Get

- **Semgrep analysis** — Security and code quality checks
- **PR annotations** — Issues appear inline in the PR
- **Check summary** — Overview of findings

## Limitations

- No AI-powered semantic analysis
- No natural language explanations
- Limited to Semgrep's rule set

## Upgrade Path

Ready for AI reviews? Add an AI pass:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
  - name: semantic
    agents: [opencode] # Add AI analysis

models:
  default: claude-sonnet-4-20250514

limits:
  max_usd_per_pr: 1.00
  monthly_budget_usd: 50
```

Then add `ANTHROPIC_API_KEY` to your repository secrets.

## See Also

- [GitHub Enterprise Example](./github-enterprise.md) — Full AI configuration
- [Configuration Schema](../configuration/config-schema.md) — All options
