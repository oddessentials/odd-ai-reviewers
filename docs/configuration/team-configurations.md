# Recommended Team Configurations

This page helps you choose a **review team “combo”** and get running fast.
All configurations follow the same mental model:

- `.ai-review.yml` defines **who is on the team** and **how many passes run**
- Your platform pipeline (GitHub Actions / Azure Pipelines) runs the reviewer and posts results back to the PR

---

## Team 1 — **The Sentinel** (Free Static Security)

**Roster**

- 🛡 Semgrep (Security Sentinel)

**What you get**

- Fast, deterministic static analysis (security + code smells)
- Inline PR annotations / check summary
- **No AI costs**, no model config

### GitHub (copy/paste)

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

Create `.ai-review.yml`:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep]
```

(From your GitHub Basic example.)

### Azure DevOps (copy/paste)

If you want this team on ADO, it’s the same `.ai-review.yml` above plus a simple pipeline step that runs the CLI (mirrors your ADO patterns):

```yaml
trigger: none

pr:
  branches:
    include:
      - main

pool:
  vmImage: 'ubuntu-latest'

steps:
  - checkout: self
    fetchDepth: 0

  - task: NodeTool@0
    inputs:
      versionSpec: '22.x'
    displayName: 'Install Node.js'

  - script: |
      npx odd-ai-reviewers review \
        --platform ado \
        --pr $(System.PullRequest.PullRequestId) \
        --repo $(Build.Repository.Name)
    displayName: 'Run AI Review'
    env:
      SYSTEM_ACCESSTOKEN: $(System.AccessToken)
```

(Adapted from your ADO examples’ structure; this “static only” team needs no AI secrets.)

---

## Team 2 — **The Enforcers** (Free: Security + Lint-to-PR Comments)

**Roster**

- 🛡 Semgrep (Security Sentinel)
- 🦊 Review Dog (Linter Liaison)

**What you get**

- Semgrep findings + rich PR annotation formatting
- Better “developer UX” for tool output
- Still **no AI costs**

### GitHub (copy/paste)

`.github/workflows/ai-review.yml` (same as Team 1).

`.ai-review.yml`:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep, reviewdog]
```

(Aligned with your enterprise example’s static pass, minus AI.)

### Azure DevOps (copy/paste)

This is exactly the same pipeline shape as Team 1 (no AI secrets required).
Use the same ADO snippet and the `.ai-review.yml` above.

---

## Team 3 — **The Local Legends** (Free AI via Ollama + Static)

**Roster**

- 🛡 Semgrep (Security Sentinel)
- 🦊 Review Dog (Linter Liaison)
- 🧠 Ollama via `local_llm` (Local AI Engine)

**What you get**

- Full static pass + **AI semantic review without cloud APIs**
- Best “$0 API cost” experience if you have local compute
- Graceful skip if Ollama is unavailable (optional)

### GitHub (copy/paste)

GitHub workflow (same as Team 1).

`.ai-review.yml`:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep, reviewdog]
    enabled: true
    required: true

  - name: local-ai
    agents: [local_llm]
    enabled: true
    required: false # Skip if Ollama unavailable

limits:
  max_usd_per_pr: 0.00
  monthly_budget_usd: 0

models:
  default: codellama:7b # or deepseek-coder:6.7b, llama3.2:3b
```

(Your ADO free-tier config is already very close to this—this is the GitHub-shaped equivalent.)

### Azure DevOps (copy/paste)

Use your ADO + OSCR Free Tier Example basically verbatim.

---

## Team 4 — **The Strategists** (AI Semantic Review Only)

**Roster**

- 🧑‍💻 OpenCode (AI Coding Assistant)

**What you get**

- Semantic review (logic, structure, refactors, tests)
- No static tooling noise
- Best for small repos or teams that already have linters elsewhere

### GitHub (copy/paste)

Workflow (same as Team 1).

`.ai-review.yml`:

```yaml
version: 1
trusted_only: true

passes:
  - name: semantic
    agents: [opencode]

models:
  default: claude-sonnet-4-20250514

limits:
  max_usd_per_pr: 2.00
  monthly_budget_usd: 100
```

(Modeled from your enterprise structure, simplified.)

### Azure DevOps (copy/paste)

Use your Azure DevOps Enterprise Example (OpenCode + Azure OpenAI).

---

## Team 5 — **The Full Avengers** (Static + Multi-Agent AI)

**Roster**

- 🛡 Semgrep (Security Sentinel)
- 🦊 Review Dog (Linter Liaison)
- 🧑‍💻 OpenCode (AI Coding Assistant)
- 🐺 PR Agent (Code Review Commander)

**What you get**

- Best overall coverage: security + lint surfacing + semantic reasoning + PR-level narrative
- The closest “multi-pass / multi-voice” experience
- More output → you’ll want caps (`max_inline_comments`, etc.)

### GitHub (copy/paste)

Use your GitHub Enterprise Example basically as-is.

### Azure DevOps (copy/paste)

ADO supports Semgrep + OpenCode cleanly; PR-Agent support depends on whether your ADO path wires it in.
If your project supports PR-Agent on ADO, this is the intended “Full” shape:

```yaml
version: 1
trusted_only: true

passes:
  - name: static
    agents: [semgrep, reviewdog]

  - name: semantic
    agents: [opencode, pr_agent]

models:
  default: gpt-4o # or your Azure OpenAI deployment name

limits:
  max_usd_per_pr: 5.00
  monthly_budget_usd: 500
  max_inline_comments: 25
```

Pipeline: use your Azure DevOps Enterprise Example.

---

# Tier Lists

## Individual Tier List (Agents)

| Tier | Agent              | Role                | Why it’s ranked here                                                                                              |
| ---- | ------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| S    | Semgrep            | Security Sentinel   | High signal, deterministic, catches real security issues at near-zero marginal cost. Works everywhere and scales. |
| S    | Review Dog         | Linter Liaison      | Makes any deterministic tool “speak PR.” Multiplies the value of existing linters across ecosystems.              |
| A    | OpenCode           | AI Coding Assistant | Strong semantic reasoning and refactor insights; cost + variability means you want budgets/limits.                |
| A    | PR Agent           | Review Commander    | Great PR-level narrative and automation, but platform support + configuration surface can be heavier than others. |
| A    | Ollama / local_llm | Local AI Engine     | Unlocks “free AI” with privacy benefits, but depends on local compute + model quality/pinning to stay consistent. |

## Team Tier List (Combos)

| Tier | Team          | Roster                                    | Why it’s ranked here                                                                                                    |
| ---- | ------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| S    | Full Avengers | Semgrep + Reviewdog + OpenCode + PR Agent | Max coverage: deterministic + semantic + PR narrative. Best “team” experience and closest to your brand promise.        |
| S    | Local Legends | Semgrep + Reviewdog + local_llm           | Best cost/performance when you have local compute. Delivers AI value without API spend.                                 |
| A    | Enforcers     | Semgrep + Reviewdog                       | Extremely practical baseline for most repos. High signal, low noise, almost zero operational burden.                    |
| A    | Strategists   | OpenCode                                  | High-value semantic insight, but missing deterministic security/lint baseline unless you already have it elsewhere.     |
| B    | Sentinel      | Semgrep only                              | Better than nothing, but missing the “PR UX” polish and multi-pass intelligence that makes the system feel like a team. |
