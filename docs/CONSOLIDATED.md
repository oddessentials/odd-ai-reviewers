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

## First Version Critical Path

Before the first legitimate self-hosted deployment, these items must be completed:

| Item | Status | Priority | Notes |
| ---- | ------ | -------- | ----- |
| Add `runs_on` input to workflow | ❌ Not Done | **P0 BLOCKER** | Required for OSCR integration |
| E2E test on real repository | ❌ Not Done | **P0** | Validates full flow works |
| Choose reporting architecture | ⚠️ Decision Needed | **P1** | See "Reporting Architecture" below |
| Fix duplicate semgrep execution | ⚠️ Not Done | **P1** | Currently runs twice per PR |
| Azure OpenAI API version | ⚠️ Hardcoded | P2 | `2024-02-15-preview` in code |

### Immediate Action Required

The `runs_on` input is the **single blocker** preventing self-hosted runner usage. Implement Option A below before any pilot deployment.

---

## Current Integration Status

| Component                     | Status       | Notes                                  |
| ----------------------------- | ------------ | -------------------------------------- |
| OSCR GitHub runner            | ✅ Ready     | Docker-based, auto-register/unregister |
| OSCR ADO agent                | ✅ Ready     | Same model, different provider         |
| odd-ai-reviewers router       | ✅ Ready     | Core logic, agents, budget, trust      |
| odd-ai-reviewers workflow     | ❌ Blocked   | `runs-on: ubuntu-latest` hardcoded     |
| Semgrep agent                 | ✅ Ready     | Returns structured findings to router  |
| PR-Agent                      | ✅ Ready     | Returns structured findings to router  |
| OpenCode agent                | ⚠️ Fire-and-forget | Posts directly to GitHub, not captured |
| Reviewdog agent               | ⚠️ Fire-and-forget | Posts directly to GitHub, not captured |

**Primary Gap:** The reusable workflow needs a `runs_on` input to allow self-hosted runners.

---

## Reporting Architecture Decision

### Current State

The router has two reporting paths that operate independently:

```
┌─────────────────────────────────────────────────────────────────┐
│                     Router Unified Path                          │
│  Agents: semgrep, pr_agent, ai_semantic_review                   │
│  → Returns findings[] to router                                  │
│  → Deduplicated, sorted, summarized                              │
│  → Posted via router's GitHub reporter                           │
│  → Subject to gating rules                                       │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Direct-Post Path (Fire-and-Forget)             │
│  Agents: opencode, reviewdog                                     │
│  → Posts directly to GitHub API                                  │
│  → Returns findings: [] to router                                │
│  → NOT deduplicated with other agents                            │
│  → NOT included in summary or gating                             │
└─────────────────────────────────────────────────────────────────┘
```

### Impact

- **Duplicate comments**: If semgrep and reviewdog both run, you get findings posted twice (once by router, once by reviewdog)
- **Incomplete gating**: Gating logic only sees findings from unified-path agents
- **Fragmented summary**: OpenCode findings don't appear in the PR summary comment

### Recommended Configuration (First Version)

For a clean first deployment, use agents that return structured findings:

```yaml
# .ai-review.yml - Recommended for unified reporting
passes:
  - name: static
    agents: [semgrep]      # Returns findings to router
    enabled: true

  - name: semantic
    agents: [pr_agent]     # Returns findings to router
    enabled: true

# AVOID for first version:
# - reviewdog (duplicates semgrep, posts directly)
# - opencode (posts directly, findings not captured)
```

### Future Improvement

To unify all reporting, OpenCode and Reviewdog agents need refactoring to:
1. Capture their output as structured findings
2. Return findings to the router
3. Let the router handle all GitHub posting

This is tracked as a Phase 3 enhancement.

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

> **STATUS: NOT YET IMPLEMENTED** — This is the primary blocker for self-hosted deployment.

### Option A: Add `runs-on` Input (Recommended) ✅

This approach maintains a single workflow file with configurable runner.

Update `.github/workflows/ai-review.yml`:

```yaml
on:
  workflow_call:
    inputs:
      # ... existing inputs ...
      runs_on:
        description: 'Runner label (JSON string for arrays)'
        required: false
        type: string
        default: 'ubuntu-latest'

jobs:
  ai-review:
    name: AI Code Review
    runs-on: ${{ fromJSON(format('[{0}]', inputs.runs_on)) }}
    # Note: fromJSON handles both 'ubuntu-latest' and '["self-hosted", "linux"]'
```

Callers specify:

```yaml
# For GitHub-hosted
with:
  runs_on: '"ubuntu-latest"'

# For self-hosted
with:
  runs_on: '"self-hosted", "linux"'
```

**Pros:** Single workflow, backwards compatible, flexible
**Cons:** JSON escaping can be confusing

### Option B: Create Separate Self-Hosted Workflow

Create `.github/workflows/ai-review-selfhosted.yml` as a copy with hardcoded self-hosted runner.

```yaml
jobs:
  ai-review:
    runs-on: [self-hosted, linux]
```

**Pros:** No JSON escaping, clear intent
**Cons:** Code duplication, two files to maintain

### Recommendation

**Use Option A** for flexibility. The JSON escaping complexity is a one-time setup cost.

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

## E2E Validation Checklist

Before declaring "first version ready," validate each item on a real repository:

### Pre-Deployment

- [ ] `runs_on` input added to `ai-review.yml`
- [ ] OSCR runner registered and showing "Idle" in GitHub Settings
- [ ] Test repository has `.ai-review.yml` with recommended config
- [ ] `OPENAI_API_KEY` secret configured in test repository
- [ ] Caller workflow created with correct inputs

### Deployment Test

- [ ] Open PR with intentional issues (unused import, type error, etc.)
- [ ] Verify job picked up by OSCR runner (check runner logs)
- [ ] Verify semgrep findings appear as check annotations
- [ ] Verify PR-Agent summary comment posted
- [ ] Verify no duplicate comments (if using only unified-path agents)
- [ ] Close PR, verify no lingering processes on runner

### Edge Cases

- [ ] Fork PR blocked (if `trusted_only: true`)
- [ ] Draft PR skipped (expected behavior)
- [ ] Large PR (>50 files) triggers budget skip for LLM passes
- [ ] PR with no code changes (.md only) completes gracefully

### Performance Baseline

- [ ] Record typical review duration (semgrep + LLM)
- [ ] Record token usage and estimated cost per PR
- [ ] Verify cache hit on re-push to same PR

---

## Summary

| Step | Action                                                          |
| ---- | --------------------------------------------------------------- |
| 1    | **Implement `runs_on` input** in ai-review.yml (P0 blocker)     |
| 2    | Clone and configure OSCR on target machine                      |
| 3    | Start self-hosted runner, verify registration                   |
| 4    | Create caller workflow in target repo with self-hosted config   |
| 5    | Add secrets (`OPENAI_API_KEY`)                                  |
| 6    | Run E2E validation checklist above                              |
| 7    | Open real PR and verify full flow                               |

**Result:** Zero-cost AI code reviews running on your own hardware.

---

## Appendix: Default Config for First Version

Use this configuration for initial deployment to avoid the dual-reporting issues:

```yaml
# .ai-review.yml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
    enabled: true

  - name: semantic
    agents: [pr_agent]  # NOT opencode (fire-and-forget)
    enabled: true

limits:
  max_files: 50
  max_diff_lines: 2000
  max_tokens_per_pr: 12000
  max_usd_per_pr: 1.00

reporting:
  github:
    mode: checks_and_comments
    max_inline_comments: 20
    summary: true

gating:
  enabled: false
```

This ensures all findings flow through the unified router for consistent deduplication, summarization, and (optional) gating.
