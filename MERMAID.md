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
    D --> E[Filter Files]
    E --> F[Budget Check]
    F --> G[Preflight Validation]
    G -->|Missing Secrets| Y[Fail Fast]
    G -->|Valid| H[Start GitHub Check 'in_progress']
    H --> I[Execute Passes]
    I --> J[Collect All Findings]
    J --> K[Deduplicate by fingerprint + file + line]
    K --> L[Sort by Severity]
    L --> M[Generate Summary Markdown]
    M --> N[Report to GitHub]
    N --> O[Update Check to 'completed']
```

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

1. **Sequential execution**: Passes run in order, agents within passes run in order
2. **Shared findings**: All agents contribute to a single `allFindings[]` array
3. **Deduplication**: Router removes duplicates before reporting
4. **Single report**: One unified GitHub check run and/or PR comment
5. **Scoped security**: Each agent sees only its allowed environment variables
