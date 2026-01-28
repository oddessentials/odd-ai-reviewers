# AI Review Router - Execution Flow

This document describes how odd-ai-reviewers executes agents and consolidates findings.

## Key Insight

**All agents share their findings.** The router collects findings from every agent into a single array, deduplicates them, sorts by severity, and posts **one unified report** to GitHub.

---

## High-Level Flow

```mermaid
flowchart TD
    A[PR Opened] --> B[Load .ai-review.yml]
    B --> C[Trust Check]
    C -->|Untrusted| X[Skip Review]
    C -->|Trusted| D[Extract Diff]
    D --> E1[Load .reviewignore]
    E1 --> E[Filter Files]
    E --> F[Budget Check]
    F --> G[Preflight Validation]
    G -->|Missing Secrets| Y1[Fail Fast]
    G --> H[Model Config Validation]
    H -->|No Model| Y2[Fail: MODEL env or config.models.default required]
    H --> I[Model-Provider Match]
    I -->|claude-* without ANTHROPIC_KEY| Y3[Fail: Key Missing]
    I -->|gpt-* without OPENAI_KEY| Y3
    I -->|Valid| J[Ollama Config Check]
    J -->|local_llm required, no OLLAMA_BASE_URL| Y4[Fail: OLLAMA_BASE_URL required]
    J -->|Valid| K[Start GitHub Check 'in_progress']
    K --> L[Execute Passes]
    L --> M[Collect All Findings]
    M --> N[Deduplicate by fingerprint + file + line]
    N --> O[Sort by Severity]
    O --> P[Generate Summary Markdown]
    P --> Q[Report to GitHub]
    Q --> R[Update Check to 'completed']
```

---

## File Filtering

After extracting the diff, the router filters files based on two mechanisms:

1. **`.reviewignore`** — A file at repo root using `.gitignore`-compatible syntax
2. **`path_filters`** — YAML configuration in `.ai-review.yml`

```mermaid
flowchart TD
    D[Diff Files] --> R{.reviewignore exists?}
    R -->|Yes| L[Load patterns]
    R -->|No| P[path_filters only]
    L --> A[Apply .reviewignore exclusions]
    A --> P
    P --> E[Apply path_filters.exclude]
    E --> I{path_filters.include set?}
    I -->|Yes| W[Whitelist: keep only matching]
    I -->|No| F[Keep remaining files]
    W --> F
    F --> Out[Filtered files for review]
```

### Filter Precedence

> 📖 For detailed filter precedence and pattern syntax, see [Configuration Schema](./config-schema.md#filter-precedence).

Filters are applied in order: `.reviewignore` → `path_filters.exclude` → `path_filters.include`.

### Logging

The router logs filtering results separately:

```
[router] 15 files after filtering
[router]   - 3 excluded by .reviewignore
[router]   - 2 excluded by path_filters
```

---

## Preflight Validation Detail

Preflight validation runs **before any agent execution**, catching misconfigurations early.

```mermaid
flowchart TD
    subgraph Preflight Checks
        A[Agent Secrets] -->|"opencode needs OPENAI or ANTHROPIC"| Check1{Keys Present?}
        Check1 -->|No| Fail1[❌ Missing required secrets]
        Check1 -->|Yes| B[Model Config]

        B -->|"MODEL env or config.models.default"| Check2{Model Set?}
        Check2 -->|No| Fail2[❌ No model configured]
        Check2 -->|Yes| C[Model-Provider Match]

        C -->|"Only if cloud AI agents enabled"| Check3{Key Matches Model?}
        Check3 -->|"claude-* without ANTHROPIC_KEY"| Fail3[❌ Model-provider mismatch]
        Check3 -->|"gpt-* without OPENAI_KEY"| Fail3
        Check3 -->|local_llm only| Skip[⏭️ Skip - uses OLLAMA_MODEL]
        Check3 -->|Valid| Pass[✅ Preflight passed]
    end
```

### Model-Provider Heuristic

The router infers provider from model name **as a heuristic** (not a contract).

**Scoping**: This validation only runs when cloud AI agents (`opencode`, `pr_agent`, `ai_semantic_review`) are enabled. If only `local_llm` is enabled, it's skipped entirely because `local_llm` uses `OLLAMA_MODEL`, not `MODEL`.

| Model Prefix    | Inferred Provider | Required Key                               |
| --------------- | ----------------- | ------------------------------------------ |
| `claude-*`      | Anthropic         | `ANTHROPIC_API_KEY`                        |
| `gpt-*`, `o1-*` | OpenAI            | `OPENAI_API_KEY` or `AZURE_OPENAI_API_KEY` |
| Unknown         | No validation     | Any available key                          |

### Ollama Configuration

`OLLAMA_BASE_URL` is **not required** at preflight. The `local_llm` agent defaults to `http://ollama-sidecar:11434` when unset. Connectivity failures are handled at runtime (fail-closed by default, or graceful if `LOCAL_LLM_OPTIONAL=true`).

---

## Pass Execution Detail

Passes execute **sequentially** (not in parallel). Within each pass, agents also execute **sequentially**.

```mermaid
sequenceDiagram
    participant Router
    participant Pass1 as static pass
    participant Semgrep
    participant Reviewdog
    participant Pass2 as cloud-ai pass
    participant OpenCode
    participant PRAgent
    participant Pass3 as local-ai pass
    participant LocalLLM
    participant GitHub

    Router->>Pass1: Execute static pass
    Pass1->>Semgrep: run()
    Semgrep-->>Pass1: findings[]
    Pass1->>Reviewdog: run()
    Reviewdog-->>Pass1: findings[]
    Pass1-->>Router: append to allFindings[]

    Router->>Pass2: Execute cloud-ai pass
    Pass2->>OpenCode: run()
    OpenCode-->>Pass2: findings[]
    Pass2->>PRAgent: run()
    PRAgent-->>Pass2: findings[]
    Pass2-->>Router: append to allFindings[]

    Router->>Pass3: Execute local-ai pass
    Pass3->>LocalLLM: run()
    LocalLLM-->>Pass3: findings[]
    Pass3-->>Router: append to allFindings[]

    Router->>Router: deduplicateFindings()
    Router->>Router: sortFindings()
    Router->>GitHub: Single unified report
```

---

## Finding Consolidation

All agents contribute to a **single findings array**. Deduplication prevents the same issue from being reported twice.

```mermaid
flowchart LR
    subgraph Agents
        S[Semgrep] -->|5 findings| A[allFindings]
        R[Reviewdog] -->|3 findings| A
        O[OpenCode] -->|8 findings| A
        P[PR-Agent] -->|4 findings| A
        L[Local LLM] -->|2 findings| A
    end

    A -->|22 raw| D[Deduplicate]
    D -->|15 unique| Sort[Sort by Severity]
    Sort --> Report[Single GitHub Report]
```

---

## Deduplication Algorithm

Findings are deduplicated using a composite key:

```
key = fingerprint || (ruleId + file + line + message)
```

```mermaid
flowchart TD
    F[Finding] --> HasFP{Has fingerprint?}
    HasFP -->|Yes| UseFingerprint["key = fingerprint + file + line"]
    HasFP -->|No| ComputeFingerprint["key = hash(ruleId + file + line + message)"]
    UseFingerprint --> Check{Key in seen set?}
    ComputeFingerprint --> Check
    Check -->|Yes| Skip[Discard duplicate]
    Check -->|No| Add[Add to unique findings]
```

---

## GitHub Reporting

The router posts findings in **one atomic operation**:

| Reporting Mode        | Check Run | PR Comment | Inline Comments |
| --------------------- | --------- | ---------- | --------------- |
| `checks_only`         | ✅        | ❌         | ❌              |
| `comments_only`       | ❌        | ✅         | ✅              |
| `checks_and_comments` | ✅        | ✅         | ✅              |

```mermaid
flowchart TD
    R[Report to GitHub] --> Mode{Reporting Mode}
    Mode -->|checks_only| C[Create/Update Check Run]
    Mode -->|comments_only| P[Post PR Comment + Inline]
    Mode -->|checks_and_comments| Both[Check Run + PR Comment + Inline]

    C --> Annotations[Up to 50 annotations per check]
    P --> Summary[Summary comment]
    P --> Inline[Inline comments, rate-limited]
    Both --> Annotations
    Both --> Summary
    Both --> Inline
```

---

## Agent Execution Context

Each agent receives a **scoped context** with only its allowed environment variables (security allowlist):

```mermaid
flowchart TD
    E[process.env] --> Router[buildRouterEnv]
    Router --> A1[buildAgentEnv 'semgrep']
    Router --> A2[buildAgentEnv 'opencode']
    Router --> A3[buildAgentEnv 'pr_agent']
    Router --> A4[buildAgentEnv 'local_llm']

    A1 -->|Minimal env| Semgrep
    A2 -->|OPENAI_API_KEY, ANTHROPIC_API_KEY| OpenCode
    A3 -->|OPENAI_API_KEY| PRAgent
    A4 -->|OLLAMA_BASE_URL, OLLAMA_MODEL| LocalLLM
```

---

## Summary

1. **File filtering**: `.reviewignore` and `path_filters` control which files are reviewed
2. **Sequential execution**: Passes run in order, agents within passes run in order
3. **Shared findings**: All agents contribute to a single `allFindings[]` array
4. **Deduplication**: Router removes duplicates before reporting
5. **Single report**: One unified GitHub check run and/or PR comment
6. **Scoped security**: Each agent sees only its allowed environment variables

---

## Related Documentation

- [Configuration Schema](./config-schema.md) — All YAML options
- [Security Model](./security.md) — Trust boundaries and threat model
- [Invariants](./INVARIANTS.md) — Non-negotiable design constraints
- [Scope](./SCOPE.md) — What this project does and doesn't do
