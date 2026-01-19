# Plan 5 (Final): odd-ai-reviewers: An Extensible AI Code Review

## Objective

Add thorough, multi-pass AI code review to pull requests and main branch **without modifying the CI runtime**, while keeping costs near zero and enabling **plug-in reviewers** over time (OpenCode.ai first, then PR-Agent, local LLMs, etc.).

This system must work on **any self-hosted CI runner** and remain portable across GitHub, Azure DevOps, GitLab, and Gitea.

---

## Non-Negotiables

* **CI runtime remains unchanged**
  No AI logic is embedded into the runner or orchestrator.

* **Trusted PRs only by default**
  Do **not** run AI review on forked or untrusted PRs unless explicitly enabled.

* **Provider-native secrets only**
  Use GitHub / Azure DevOps / GitLab secret mechanisms. No custom secret store.

* **Ephemeral, isolated execution**
  All review logic runs in containerized jobs with clean workspaces per run.

---

## Strategy Summary

Implement a companion project: **`odd-ai-reviewers`** (new repository) that provides:

1. **Reusable CI workflows / templates**
   GitHub first; extensible to Azure DevOps, GitLab, and Gitea.

2. A **Review Router**
   Reads per-repo config (`.ai-review.yml`) and executes reviewers in ordered **passes**.

3. **Pluggable reviewer agents**

   * Static tools (Semgrep, linters)
   * AI reviewers (OpenCode.ai, PR-Agent)
   * Optional local LLMs (Ollama / llama.cpp)

4. A **comment & reporting engine**

   * Posts PR review comments and/or check summaries
   * Optional gating on main branch (configurable)

This approach provides consistency and low-friction adoption while keeping per-repo behavior fully configurable.

---

## Architecture

### Control Plane vs Execution Plane

### Control Plane (`odd-ai-reviewers` repo)

* Reusable CI workflows
* Review Router container/image
* `.ai-review.yml` schema + documentation
* Shared prompts and reporting formatters

### Execution Plane (each target repo)

* A minimal workflow include that calls the reusable workflow
* A `.ai-review.yml` file at the repo root
* Secrets stored per repo or org and injected by the CI provider

---

### High-Level Flow

1. PR opened or updated → triggers **AI Review** workflow
2. Workflow runs on a **self-hosted Linux runner**
3. Review Router:

   * validates PR trust
   * loads `.ai-review.yml` (or defaults)
   * enforces per-PR and monthly budget limits
4. Review passes execute in order:

   * Static pass (free tools)
   * Semantic / LLM pass (OpenCode.ai, PR-Agent)
   * Optional architecture pass (large or high-risk diffs only)
5. Results are deduplicated and posted as:

   * PR comments
   * CI check summary

---

## Repository: `odd-ai-reviewers` (NEW)

### Directory Layout (Authoritative)

```
odd-ai-reviewers/
├─ README.md
├─ docs/
│  ├─ config-schema.md
│  ├─ github-setup.md
│  ├─ security.md
│  └─ cost-controls.md
├─ config/
│  ├─ ai-review.schema.json
│  ├─ defaults.ai-review.yml
│  └─ prompts/
│     ├─ opencode_system.md
│     ├─ pr_agent_review.md
│     └─ architecture_review.md
├─ router/
│  ├─ Dockerfile
│  ├─ src/
│  │  ├─ main.ts
│  │  ├─ config.ts
│  │  ├─ trust.ts
│  │  ├─ budget.ts
│  │  ├─ diff.ts
│  │  ├─ agents/
│  │  │  ├─ index.ts
│  │  │  ├─ semgrep.ts
│  │  │  ├─ reviewdog.ts
│  │  │  ├─ opencode.ts
│  │  │  ├─ pr_agent.ts
│  │  │  └─ local_llm.ts
│  │  ├─ report/
│  │  │  ├─ github.ts
│  │  │  └─ formats.ts
│  │  └─ cache/
│  │     ├─ key.ts
│  │     └─ store.ts
│  └─ package.json
├─ .github/
│  └─ workflows/
│     ├─ ai-review.yml
│     └─ ai-review-dispatch.yml
└─ templates/
   ├─ github/
   │  └─ use-ai-review.yml
   └─ ado/
      └─ ai-review-template.yml
```

---

## Review Router Responsibilities (MUST)

* Load and validate `.ai-review.yml` (merge defaults if missing)
* Enforce trust rules (block forks by default)
* Extract PR diff and changed files
* Apply include/exclude path filters
* Execute review passes in order
* Normalize findings into a single format:

```
{ severity, file, line?, message, suggestion?, ruleId?, sourceAgent }
```

* Deduplicate and throttle comments
* Emit:

  * summary markdown
  * optional job failure if configured as a gate

---

## Agent Interface (MUST)

Each agent implements:

* `id`
* `supports(language | file patterns)`
* `run(context) -> { findings[], metrics }`

Agents may be implemented as:

* CLI tools (Semgrep)
* Containers
* API-backed reviewers
* Local inference calls (Ollama / llama.cpp)

---

## Per-Repo Configuration: `.ai-review.yml`

### Minimal Example

```yaml
version: 1
trusted_only: true

triggers:
  on: [pull_request]
  branches: [main]

passes:
  - name: static
    agents: [semgrep, reviewdog]

  - name: semantic
    agents: [opencode]

limits:
  max_files: 50
  max_diff_lines: 2000
  max_tokens_per_pr: 12000
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100

reporting:
  github:
    mode: checks_and_comments
    max_inline_comments: 20
    summary: true

gating:
  enabled: false
  fail_on_severity: error
```

---

## GitHub: Reusable Workflow Contract

### `ai-review.yml` (Reusable Workflow)

* Triggered via `workflow_call`
* Inputs:

  * `target_repo`
  * `target_ref`
  * `pr_number`
* Secrets:

  * `GITHUB_TOKEN`
  * Optional LLM API keys
  * Optional `OLLAMA_BASE_URL`
* Steps:

  1. Checkout target repo at PR ref
  2. Run Review Router container
  3. Upload summary artifacts
  4. Set check conclusion based on gating rules

---

### Target Repo Workflow Include (Minimal)

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

jobs:
  ai-review:
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

---

## Default Agent Stack (Phase 1)

* **Semgrep** – security and bug patterns (free)
* **Reviewdog** – converts tool output to PR annotations
* **OpenCode.ai** – primary semantic reviewer
* **PR-Agent** – fast AI summarizer / reviewer

---

## Cost Controls (MUST)

* Always run **static pass first**
* LLM passes run only:

  * within per-PR limits
  * within monthly budget
  * on filtered diffs only
* Cache key:

  ```
  hash(PR number + head SHA + config hash + agent id)
  ```
* If limits exceeded:

  * skip LLM pass
  * post summary explaining why

---

## Security Controls (MUST)

* Fork PRs blocked by default
* Secrets never logged
* Containers run non-root where possible
* No persistence beyond the CI job

---

## Rollout Plan

### Phase 1 (Week 1)

* Create `odd-ai-reviewers`
* Implement router MVP
* Integrate Semgrep + OpenCode.ai
* Pilot on one private repo

### Phase 2 (Weeks 2–3)

* Add PR-Agent
* Add inline comment throttling
* Add caching
* Optional webhook trigger

### Phase 3 (Week 4+)

* Add Azure DevOps templates
* Optional local LLM support
* GitLab / Gitea reporters

---

## Acceptance Criteria

1. CI runtime unchanged
2. AI review enabled via:

   * one workflow include
   * `.ai-review.yml`
3. Multi-pass review works
4. Results appear as PR comments and checks
5. Fork PRs do not run by default
6. Budget limits enforced
7. New reviewers added without workflow changes

---

If you want next:

* a **one-page task breakdown** for the autonomous team,
* or a **PR-by-PR execution plan**,
  say the word.
