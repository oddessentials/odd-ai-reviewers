# Plan 5 (Final): Extensible AI Code Review on OSCR

## Objective

Add thorough, multi-pass AI code review to PRs and main branch **without modifying OSCR**, while keeping costs near zero and enabling **plug-in reviewers** over time (OpenCode.ai first, then PR-Agent, etc.).

## Non-Negotiables (OSCR Alignment)

* **OSCR remains unchanged**: no AI logic inside OSCR. OSCR stays a thin runner launcher.
* **Trusted PRs only**: do **not** run on fork PRs by default.
* **Provider-native secrets only**: no new secret manager; use GitHub/ADO secret mechanisms.
* **Non-root, ephemeral**: everything runs in containerized jobs on OSCR runners; workspace is clean per job.

## Strategy Summary

Implement a companion project: **`odd-ai-reviewers`** (new repo) that provides:

1. **Reusable workflows/templates** (GitHub first, future ADO/GitLab/Gitea).
2. A **Review Router** that reads per-repo config (`.ai-review.yml`) and runs configured reviewers in **passes**.
3. Pluggable **agents** (static tools + AI reviewers like OpenCode.ai, PR-Agent, local LLM).
4. A **comment engine** that posts:

   * PR review comments / check summaries on PRs,
   * optional “required” gate on main (configurable).

This gives consistency and fast rollout while keeping each repo’s behavior configurable.

---

## Architecture

### Control Plane vs Execution Plane

* **Control Plane (odd-ai-reviewers repo)**

  * reusable GitHub workflow(s)
  * router container/image
  * schema + docs for `.ai-review.yml`
  * shared prompts, allow/deny rules, reporting formatters

* **Execution Plane (each target repo)**

  * a tiny workflow include that calls the reusable workflow
  * a `.ai-review.yml` file in the repo root
  * secrets stored per repo/org (GitHub) used by the workflow

### High-Level Flow

1. PR opened/updated → triggers **AI Review** workflow.
2. Workflow runs on **OSCR self-hosted runner** (`runs-on: [self-hosted, linux]`).
3. Router checks:

   * trusted PR condition
   * `.ai-review.yml` presence (fallback defaults if missing)
   * budget limits (monthly + per PR)
4. Passes run in order:

   * Static pass (free tools)
   * LLM/semantic pass (OpenCode.ai / PR-Agent)
   * Optional architecture pass (only on large/high-risk changes)
5. Comment engine posts:

   * check summary + inline comments (deduped/throttled)

---

## Repo: `odd-ai-reviewers` (NEW)

### Directory Layout (authoritative)

```
odd-ai-reviewers/
├─ README.md
├─ docs/
│  ├─ config-schema.md
│  ├─ github-setup.md
│  ├─ security.md
│  └─ cost-controls.md
├─ config/
│  ├─ ai-review.schema.json          # JSON Schema for .ai-review.yml
│  ├─ defaults.ai-review.yml         # default config if repo has none
│  └─ prompts/
│     ├─ opencode_system.md
│     ├─ pr_agent_review.md
│     └─ architecture_review.md
├─ router/
│  ├─ Dockerfile
│  ├─ src/
│  │  ├─ main.ts                     # entrypoint
│  │  ├─ config.ts                   # load/validate .ai-review.yml
│  │  ├─ trust.ts                    # fork/trust logic
│  │  ├─ budget.ts                   # token + cost limits
│  │  ├─ diff.ts                     # diff extraction + file filtering
│  │  ├─ agents/
│  │  │  ├─ index.ts
│  │  │  ├─ semgrep.ts
│  │  │  ├─ reviewdog.ts
│  │  │  ├─ opencode.ts
│  │  │  ├─ pr_agent.ts
│  │  │  └─ local_llm.ts
│  │  ├─ report/
│  │  │  ├─ github.ts                # Checks + PR comments
│  │  │  └─ formats.ts               # normalized finding format
│  │  └─ cache/
│  │     ├─ key.ts                   # hash-based cache keys
│  │     └─ store.ts                 # filesystem cache (phase 1)
│  └─ package.json
├─ .github/
│  └─ workflows/
│     ├─ ai-review.yml               # reusable workflow_call
│     └─ ai-review-dispatch.yml      # optional repository_dispatch/webhook bridge (phase 2)
└─ templates/
   ├─ github/
   │  └─ use-ai-review.yml           # snippet to copy into target repos
   └─ ado/
      └─ ai-review-template.yml      # future phase
```

### Router Responsibilities (MUST)

* Load `.ai-review.yml` from target repo; validate against schema; merge defaults.
* Determine PR trust (reject forks by default).
* Extract diff + changed files, apply allow/deny filters.
* Execute configured passes in order; each pass runs one or more agents.
* Normalize all findings to one format:

  ```
  { severity, file, line?, message, suggestion?, ruleId?, sourceAgent }
  ```
* Deduplicate and throttle comments.
* Emit final result:

  * summary markdown
  * optional “fail the job” if configured as gate

### Agent Interface (MUST)

Each agent implements:

* `id`
* `supports(language/files)`
* `run(context) -> findings[] + metrics`

Agents can be:

* CLI tool (Semgrep)
* containerized tool
* API call (OpenAI/Anthropic/etc.)
* local inference call (Ollama endpoint)

---

## Per-Repo Config: `.ai-review.yml` (Authoritative v1)

### Minimal Example

```yaml
version: 1

trusted_only: true

triggers:
  on: [pull_request]
  branches: [main]

passes:
  - name: static
    agents:
      - semgrep
      - reviewdog

  - name: semantic
    agents:
      - opencode

limits:
  max_files: 50
  max_diff_lines: 2000
  max_tokens_per_pr: 12000
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100

reporting:
  github:
    mode: checks_and_comments   # checks_only | comments_only | checks_and_comments
    max_inline_comments: 20
    summary: true

gating:
  enabled: false                # if true, fail job on severity>=error
  fail_on_severity: error
```

### Recommended “Full” Example (multi-pass)

```yaml
version: 1
trusted_only: true

triggers:
  on: [pull_request, push]
  branches: [main]

filters:
  include_paths: ["src/**", "lib/**", "apps/**"]
  exclude_paths: ["**/node_modules/**", "**/dist/**", "**/*.lock", "**/generated/**"]

passes:
  - name: static
    agents:
      - semgrep
      - reviewdog

  - name: quick_ai
    agents:
      - pr_agent

  - name: deep_ai
    when:
      min_changed_files: 10
      min_diff_lines: 400
    agents:
      - opencode
      - architecture_llm

models:
  default:
    provider: local_ollama
    model: llama3.1
  fallback:
    provider: api
    model: gpt-4o-mini

limits:
  max_files: 80
  max_diff_lines: 3000
  max_tokens_per_pr: 15000
  max_usd_per_pr: 1.00
  monthly_budget_usd: 100
  skip_if_over_limits: true

reporting:
  github:
    mode: checks_and_comments
    max_inline_comments: 30
    summary: true

gating:
  enabled: true
  fail_on_severity: error
```

---

## GitHub: Reusable Workflow (odd-ai-reviewers)

### `.github/workflows/ai-review.yml` (requirements)

* `on: workflow_call`
* inputs:

  * `target_repo`
  * `target_ref`
  * `pr_number`
* secrets:

  * `GITHUB_TOKEN` (or installation token if using GitHub App)
  * optional `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / etc.
  * optional `OLLAMA_BASE_URL` (if local model server)
* Steps:

  1. Checkout target repo at PR ref
  2. Run router container with env vars + inputs
  3. Upload summary artifact (markdown, json)
  4. Set check conclusion based on gating rules

### Target Repo Workflow Include (tiny snippet)

Create `.github/workflows/ai-review.yml` in each repo:

```yaml
name: AI Review

on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
  push:
    branches: [main]

jobs:
  ai-review:
    # Trusted PRs only (no forks)
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

**Notes for implementers**

* Keep this snippet minimal to preserve OSCR’s “minimal workflow diff” spirit.
* Fork PRs are blocked by default per OSCR invariants.

---

## Tooling: Default Agent Stack (Phase 1)

* **Semgrep**: security + bug patterns (free).
* **Reviewdog**: convert linter outputs into PR annotations (free).
* **OpenCode.ai**: semantic review agent (primary).
* **PR-Agent**: quick scan / summarizer / reviewer.

### Multi-Provider Openness

* GitHub first.
* Add ADO next via templates in `templates/ado/`.
* Later: GitLab/Gitea by adding provider adapters in router’s `report/` and webhook handling (no OSCR changes required; provider isolation matches OSCR’s extensibility approach).

---

## Cost Controls (MUST)

* Always run **static pass first** (no LLM cost).
* LLM only runs:

  * within `.ai-review.yml` max tokens / max USD per PR
  * within monthly budget
  * diff-only, filtered files only
* Cache key = hash of (PR number, head sha, config hash, agent id)
* Default behavior if over limits: `skip_if_over_limits: true` and post summary “skipped due to budget/size”.

---

## Security Controls (MUST)

* Trust gating: do not run on forks by default.
* Secrets only via provider-native secrets.
* Never echo secrets into logs.
* Run containers as non-root where feasible; match OSCR non-root invariant.
* Keep all review artifacts inside CI job; do not persist workspace state beyond job.

---

## Rollout Plan (Execution)

### Phase 1 (Week 1): Working Pilot (GitHub)

* Create `odd-ai-reviewers` repo with:

  * schema + defaults
  * router container (minimal: config load + diff + post single summary comment)
  * semgrep agent
  * opencode agent (even if stubbed initially)
  * reusable workflow
* Pilot on 1 private repo.
* Success criteria:

  * comments show up reliably
  * no forks executed
  * budgets respected

### Phase 2 (Week 2–3): Multi-Agent + Better Reporting

* Add PR-Agent integration.
* Add Reviewdog integration.
* Add inline comment posting with throttling/dedupe.
* Add cache.
* Add optional webhook bridge workflow (repository_dispatch) if desired.

### Phase 3 (Week 4+): Providers + Local LLM

* Add ADO template and reporter.
* Add local Ollama integration (optional).
* Add GitLab/Gitea reporter scaffolding.

---

## Acceptance Criteria (Definition of Done)

1. OSCR repo unchanged; invariants upheld.
2. Target repos can enable AI review with:

   * one workflow include
   * `.ai-review.yml`
3. Multi-pass review works (static + semantic at minimum).
4. Output appears as GitHub Checks + PR comments.
5. Fork PRs do not trigger runs by default.
6. Budget controls prevent runaway LLM spend ($100/month configurable).
7. New agent can be added by:

   * implementing agent module
   * adding config entry (no workflow changes)
