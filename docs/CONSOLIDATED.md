# Consolidated Integration Guide

**Running AI Code Reviews on Self-Hosted CI**

This guide explains how to integrate `odd-ai-reviewers` (AI code review swarm) with
`odd-self-hosted-ci-runtime` (OSCR) so your GitHub/ADO workflows run on your own
infrastructure with zero cloud cost.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                       Your Repository                          │
│                                                                 │
│  .github/workflows/caller.yml                                  │
│     └── uses: oddessentials/odd-ai-reviewers/.github/...      │
│            └── runs-on: [self-hosted, linux]                  │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    OSCR (Your Hardware)                        │
│                                                                 │
│  ┌──────────────────┐                                          │
│  │ oscr-github      │ ← Runs GitHub Actions jobs              │
│  │ (Docker)         │                                          │
│  └──────────────────┘                                          │
│            │                                                    │
│            ▼                                                    │
│  ┌──────────────────┐                                          │
│  │ AI Review Router │ ← odd-ai-reviewers executes here        │
│  │ + Semgrep        │                                          │
│  │ + OpenCode CLI   │                                          │
│  │ + Reviewdog      │                                          │
│  └──────────────────┘                                          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    GitHub API (comments, checks)
```

---

## Current Integration Status

| Component                     | Status       | Notes                                  |
| ----------------------------- | ------------ | -------------------------------------- |
| OSCR GitHub runner            | ✅ Ready     | Docker-based, auto-register/unregister |
| OSCR ADO agent                | ✅ Ready     | Same model, different provider         |
| odd-ai-reviewers workflow     | ⚠️ Hardcoded | Uses `runs-on: ubuntu-latest`          |
| odd-ai-reviewers Docker image | ✅ Ready     | Has semgrep, opencode, reviewdog       |

**Gap:** The reusable workflow needs a `runs-on` input to allow self-hosted runners.

---

## Step-by-Step Setup (GitHub)

### Prerequisites

- Docker installed on your machine
- GitHub PAT with `repo` scope (repo-level runner) or `admin:org` (org-level)
- OpenAI API key (for AI reviews)

### 1. Start OSCR Self-Hosted Runner

```bash
# Clone OSCR
git clone https://github.com/oddessentials/odd-self-hosted-ci-runtime.git
cd odd-self-hosted-ci-runtime/orchestrator

# Configure GitHub provider
cp env.example .env
# Edit .env:
#   CI_PROVIDER=github
#   GITHUB_PAT=ghp_xxxxxxxxxxxx
#   GITHUB_OWNER=your-org
#   GITHUB_REPO=your-repo  # Optional for org-level

# Start the runner
./select-provider.sh start

# Verify it's running
./select-provider.sh status
```

The runner will appear in GitHub Settings → Actions → Runners.

### 2. Configure Your Repository to Use Self-Hosted Runner

Create `.github/workflows/ai-review-caller.yml` in your target repository:

```yaml
name: AI Review (Self-Hosted)

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  call-ai-review:
    uses: oddessentials/odd-ai-reviewers/.github/workflows/ai-review-selfhosted.yml@main
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    with:
      target_repo: ${{ github.repository }}
      target_ref: ${{ github.event.pull_request.head.sha }}
      pr_number: ${{ github.event.pull_request.number }}
```

> **Note:** The self-hosted variant workflow (`ai-review-selfhosted.yml`) must be
> created with `runs-on: [self-hosted, linux]`. See "Required Changes" below.

### 3. Add Repository Secrets

In your target repository, add:

| Secret                  | Description                 |
| ----------------------- | --------------------------- |
| `OPENAI_API_KEY`        | Your OpenAI API key         |
| `AZURE_OPENAI_API_KEY`  | (Optional) Azure OpenAI key |
| `AZURE_OPENAI_ENDPOINT` | (Optional) Azure endpoint   |

### 4. Open a Pull Request

The workflow will:

1. Trigger on PR open/sync
2. Execute on your OSCR runner
3. Run Semgrep + AI semantic review
4. Post comments and check results to GitHub

---

## Required Changes to odd-ai-reviewers

### Option A: Add `runs-on` Input (Recommended)

Update `.github/workflows/ai-review.yml`:

```yaml
inputs:
  runs_on:
    description: 'Runner label(s)'
    required: false
    type: string
    default: 'ubuntu-latest'

jobs:
  ai-review:
    runs-on: ${{ inputs.runs_on }}
```

Callers can then specify:

```yaml
with:
  runs_on: '[\"self-hosted\", \"linux\"]'
```

### Option B: Create Separate Self-Hosted Workflow

Create `.github/workflows/ai-review-selfhosted.yml`:

```yaml
# Copy of ai-review.yml with:
runs-on: [self-hosted, linux]
```

---

## OSCR Compatibility Notes

| OSCR Rule           | Impact on AI Reviews                              |
| ------------------- | ------------------------------------------------- |
| Linux-only          | ✅ AI reviewers are Linux-native                  |
| Non-root            | ✅ Dockerfile creates `reviewer` user             |
| Ephemeral workspace | ✅ No persistent state needed                     |
| No fork PRs         | ⚠️ AI reviewers also block forks (`trusted_only`) |
| Docker-in-Docker    | ❌ Not needed (tools installed in container)      |

---

## Azure DevOps Setup

### 1. Start OSCR ADO Agent

```bash
cd odd-self-hosted-ci-runtime/orchestrator

# Edit .env:
#   CI_PROVIDER=azure-devops
#   ADO_PAT=xxxxxxxxxxxx
#   ADO_ORG_URL=https://dev.azure.com/your-org
#   ADO_POOL=Default

./select-provider.sh start
```

### 2. ADO Pipeline (Future)

> **Note:** ADO reporter not yet implemented. See `docs/TO-DO.md`.

The ADO pipeline template will use:

```yaml
pool:
  name: Default
  demands:
    - agent.name -equals oscr-runner
```

---

## Troubleshooting

### Runner not picking up jobs

```bash
# Check runner status
./select-provider.sh status

# View logs
./select-provider.sh logs

# Restart
./select-provider.sh stop
./select-provider.sh start
```

### AI review fails with "API key not configured"

Ensure secrets are passed in the caller workflow:

```yaml
secrets:
  OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### "Fork PRs are not trusted"

Expected behavior. Both OSCR and odd-ai-reviewers block fork PRs by default
for security reasons. To allow specific authors, use `trusted_authors` in
`.ai-review.yml`.

---

## Security Model

```
┌─────────────────────────────────────────────────┐
│            Security Boundary                    │
│                                                 │
│  • OSCR: Fork PRs blocked at runner level      │
│  • odd-ai-reviewers: Fork PRs blocked at       │
│    review level (trusted_only: true)           │
│  • Secrets: Injected via GitHub/ADO only       │
│  • Workspace: Ephemeral (wiped between jobs)   │
│  • User: Non-root in both systems              │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Summary

| Step | Action                                                          |
| ---- | --------------------------------------------------------------- |
| 1    | Clone and configure OSCR                                        |
| 2    | Start self-hosted runner                                        |
| 3    | Add `runs_on` input to ai-review.yml OR use self-hosted variant |
| 4    | Create caller workflow in target repo                           |
| 5    | Add secrets (OPENAI_API_KEY)                                    |
| 6    | Open PR and verify                                              |

**Result:** Zero-cost AI code reviews running on your own hardware.
