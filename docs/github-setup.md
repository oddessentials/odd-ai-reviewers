# GitHub Setup Guide

Complete guide to setting up AI code review for your GitHub repository.

## Prerequisites

- GitHub repository (public or private)
- Repository admin access (to add secrets and workflows)
- Optional: API keys for AI agents

## Step 1: Add the Workflow

Create `.github/workflows/ai-review.yml` in your repository:

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

jobs:
  ai-review:
    # Only run on PRs from the same repo (not forks)
    if: |
      github.event_name == 'push' ||
      github.event.pull_request.head.repo.full_name == github.repository

    uses: oddessentials/odd-ai-reviewers/.github/workflows/ai-review.yml@main
    with:
      target_repo: ${{ github.repository }}
      target_ref: ${{ github.sha }}
      pr_number: ${{ github.event.pull_request.number }}
    secrets: inherit
```

## Step 2: Configure Secrets

Navigate to your repository's Settings → Secrets and variables → Actions.

### Required Secrets (for AI review)

| Secret              | Description                          | Get it from                                            |
| ------------------- | ------------------------------------ | ------------------------------------------------------ |
| `OPENAI_API_KEY`    | For OpenCode or PR-Agent with OpenAI | [platform.openai.com](https://platform.openai.com)     |
| `ANTHROPIC_API_KEY` | For OpenCode with Claude models      | [console.anthropic.com](https://console.anthropic.com) |

### Optional Secrets

| Secret            | Description        | Get it from        |
| ----------------- | ------------------ | ------------------ |
| `OLLAMA_BASE_URL` | Local LLM endpoint | Your Ollama server |

> **Note**: `GITHUB_TOKEN` is automatically provided by GitHub Actions.

## Step 3: Add Configuration (Optional)

Create `.ai-review.yml` at your repository root:

```yaml
version: 1
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

If you don't add this file, sensible defaults are used.

## Step 4: Test the Setup

1. Create a new branch
2. Make a small change
3. Open a Pull Request
4. Watch the "AI Review" check run

## Workflow Behavior

### On Pull Requests

- Runs on `opened`, `synchronize`, `reopened`, `ready_for_review`
- Skips draft PRs
- Skips fork PRs (by default)
- Posts findings as PR comments and check annotations

### On Push to Main

- Runs when code is pushed to main
- Creates a check run with findings
- Useful for catching issues that were merged

## Troubleshooting

### "AI Review" check doesn't appear

1. Check that the workflow file is in `.github/workflows/`
2. Verify the workflow syntax is valid
3. Check the Actions tab for errors

### "Fork PRs are not trusted" message

This is expected behavior. Fork PRs are blocked by default for security. To enable (not recommended for public repos):

```yaml
# .ai-review.yml
trusted_only: false
```

### "Budget exceeded" message

Your PR exceeds the configured limits. Options:

1. Increase limits in `.ai-review.yml`
2. Split the PR into smaller changes
3. The static pass (Semgrep) still runs regardless of budget

### No inline comments appearing

Check that:

- The lines are in the diff (not unchanged lines)
- `max_inline_comments` isn't set to 0
- The GitHub token has `pull-requests: write` permission

## Organization-Wide Setup

To enable AI review for all repositories in an organization:

1. Create the workflow in a `.github` repository
2. Use organization-level secrets
3. Each repository can override with its own `.ai-review.yml`

## Related Documentation

- [Configuration Reference](./config-schema.md)
- [Security Model](./SECURITY.md)
- [Cost Controls](./COST-CONTROLS.md)
- [Architecture](./ARCHITECTURE.md)
