# The Odd AI Reviewers League

### A Layered Superhero Team Model

Every review team in **odd-ai-reviewers** is built from the same three heroic layers.
Teams differ only in **how many layers you activate**.

---

## 🧱 Layer I — **The Guardrails** (Deterministic Protection)

> _“Nothing unsafe gets through.”_

These heroes are **non-negotiable defenders**. They do not reason, speculate, or improvise.
They enforce rules and surface facts.

**Heroes**

- 🛡 **Semgrep — Security Sentinel**
  Static security and code-smell detection. Fast, repeatable, high trust.
- 🦊 **Reviewdog — Linter Liaison**
  Translates deterministic findings into clean, actionable PR feedback.

**Why this layer matters**

- Determinism
- Trust
- Scalability
- Zero hallucination risk

This layer defines the **minimum safety bar** of the league.

---

## 🧠 Layer II — **The Brains** (Semantic Reasoning)

> _“Is this correct, maintainable, and well-designed?”_

These heroes **think**. They reason about intent, structure, tests, and tradeoffs.
They are powerful — and therefore optional, scoped, and budgeted.

**Heroes**

- 🧑‍💻 **OpenCode — The Architect**
  Deep semantic review: logic, refactors, tests, design insights.
- 🧠 **Local LLM — The Forge**
  Private, local semantic reasoning with zero cloud cost.

**Why this layer is optional**

- Higher variance
- Cost (or compute) considerations
- Best used _after_ Guardrails, not instead of them

This layer adds **insight**, not enforcement.

---

## 🐺 Layer III — **The Commander** (PR-Level Leadership)

> *“What does this PR *mean* and what should we do next?”*

This layer doesn’t analyze files — it **orchestrates understanding**.

**Hero**

- 🐺 **PR Agent — The Commander**
  Produces PR summaries, risk assessments, reviewer guidance, and next steps.

**Why this layer exists**

- Reduces reviewer fatigue
- Creates a cohesive narrative
- Makes large PRs approachable

This layer is about **direction**, not detection.

---

# Teams

## Team 1 — **The Sentinel**

**Layers:** Guardrails
**Heroes:** 🛡 Semgrep

**Why it exists**

- The smallest viable defense
- Deterministic, fast, and safe

**Use when**

- You want a strict baseline with zero AI complexity

---

## Team 2 — **The Enforcers**

**Layers:** Guardrails (polished)
**Heroes:** 🛡 Semgrep + 🦊 Reviewdog

**Why it exists**

- Guardrails should be readable, not just correct
- This is the **default recommendation** for most repos

**Mental shortcut**

> “If we only run one team everywhere, it’s this one.”

---

## Team 3 — **The Local Legends**

**Layers:** Guardrails + Brains (local)
**Heroes:** 🛡 Semgrep + 🦊 Reviewdog + 🧠 Local LLM

**Why it exists**

- Adds semantic insight without cloud spend
- Keeps privacy and determinism as first-class concerns

**Mental shortcut**

> “Smart reviews, neighborhood heroes.”

---

## Team 4 — **The Strategists**

**Layers:** Brains only
**Heroes:** 🧑‍💻 OpenCode

**Why it exists**

- For repos that already have Guardrails elsewhere
- For teams optimizing for design quality over rule enforcement

**Important framing**
This team is **not safer** than Enforcers — it is **more insightful**.

---

## Team 5 — **The Full Avengers**

**Layers:** Guardrails + Brains + Commander
**Heroes:** 🛡 Semgrep + 🦊 Reviewdog + 🧑‍💻 OpenCode + 🐺 PR Agent

**Why it exists**

- The full league experience
- Maximum coverage, clarity, and guidance

**Mental shortcut**

> “If we’re doing AI code review seriously, this is the endgame.”

---

# Tier Lists

## Hero Tier List

| Tier | Hero         | Layer      | Why                                                          |
| ---- | ------------ | ---------- | ------------------------------------------------------------ |
| S    | 🛡 Semgrep   | Guardrails | Deterministic, trusted, foundational.                        |
| S    | 🦊 Reviewdog | Guardrails | Multiplies the value of every static tool.                   |
| A    | 🧑‍💻 OpenCode  | Brains     | High-value insight, less deterministic by nature.            |
| A    | 🐺 PR Agent  | Commander  | Massive clarity boost; requires discipline and wiring.       |
| A    | 🧠 Local LLM | Brains     | Best privacy/cost story; quality depends on model + compute. |

## Team Tier List

| Tier | Team          | Layers                          | Why                                               |
| ---- | ------------- | ------------------------------- | ------------------------------------------------- |
| S    | Full Avengers | Guardrails + Brains + Commander | Complete league: safety, insight, and leadership. |
| S    | Local Legends | Guardrails + Brains             | Best value/performance without cloud cost.        |
| A    | Enforcers     | Guardrails                      | The universal baseline.                           |
| A    | Strategists   | Brains                          | Powerful when Guardrails exist elsewhere.         |
| B    | Sentinel      | Guardrails                      | Minimal but incomplete experience.                |
