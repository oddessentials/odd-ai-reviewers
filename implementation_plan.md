**Anthropic Support + Single Model Source of Truth (odd-ai-reviewers)**

## Hard Rules (Lock These In)

- **MODEL is a single, opaque string.**
  The system does **not** interpret, validate, or guess what it means.
- **Router resolves everything once.**
  Agents receive `effectiveModel` and never look at env vars or defaults.
- **Anthropic wins when there is ambiguity.**
  If a reviewer can only support one provider and both keys exist → Anthropic.
- **No per-agent defaults. No silent fallback. No skipping.**
  If an enabled agent cannot run, the run fails.

---

## Phase 1 — Router-Owned Model & Provider Resolution (Single Implementation)

### 1. Config schema

- Add **required** config field:

  ```yaml
  models:
    default: <pick a model> (list suggested options that are compatible with all)
  ```

- This value is opaque. Router does not parse or inspect it.

### 2. Model resolution (router only)

- Compute `context.effectiveModel` using:

  1. `MODEL` env var (if set)
  2. `config.models.default`

- If neither exists → **preflight failure**
- **No hardcoded model strings anywhere in code**

### 3. Provider resolution (router only)

- Router determines provider using **capability + key presence**, not guesswork:

  - If agent supports Anthropic **and** `ANTHROPIC_API_KEY` exists → use Anthropic
  - Else if agent supports OpenAI/Azure and matching keys exist → use that
  - Else → **preflight failure**

- Router passes `{ provider, effectiveModel }` into agent context

---

## Phase 2 — Canonical Environment Hardening

### 4. Canonical provider keys (only these exist)

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- Azure OpenAI bundle (already implemented)
- `MODEL` (model selector only)

**Remove everywhere:**

- `OPENAI_MODEL`
- `OPENCODE_MODEL`
- `PR_AGENT_API_KEY`
- `AI_SEMANTIC_REVIEW_API_KEY`
- Any agent-specific model or key aliases

### 5. Router allowlist

- Allow only:

  - CI context vars
  - Canonical provider keys
  - `MODEL`
  - Ollama vars for `local_llm`

- Nothing else passes through.

### 6. Per-agent allowlists (tight)

- `opencode`, `pr_agent`, `ai_semantic_review`
  → provider keys + `MODEL`
- `local_llm`
  → Ollama vars only
- `semgrep`, `reviewdog`
  → none

---

## Phase 3 — Anthropic Implementation (All Reviewers)

### 7. OpenCode (`opencode.ts`)

- Add pinned Anthropic SDK
- Implement `runWithAnthropic()`:

  - Uses `effectiveModel`
  - Requires `ANTHROPIC_API_KEY`
  - Strict JSON output only
  - Zod validate → map to `Finding[]`
  - Any deviation → agent failure

- Switch on `context.provider`

### 8. PR-Agent (`pr_agent.ts`)

- Add Anthropic execution path
- No OpenAI assumptions
- Uses router-provided `{ provider, effectiveModel }`
- Same JSON + schema enforcement

### 9. AI Semantic Review (`ai_semantic_review.ts`)

- Remove **all** `OPENAI_MODEL` usage
- Add Anthropic path identical in structure to PR-Agent
- No defaults, no env reads

---

## Phase 4 — Preflight Validation (Fail Early, No Guessing)

### 10. Preflight rules

For each enabled reviewer:

- If router resolved provider = Anthropic → require `ANTHROPIC_API_KEY`
- If provider = OpenAI/Azure → require corresponding keys
- Missing requirement → **fail preflight**
- Do **not** attempt runtime fallback

---

## Phase 5 — Tests (Must Ship)

### 11. Anthropic tests (per agent)

- Success path → returns `Finding[]`
- Missing key → preflight fails
- Invalid JSON → agent fails
- Schema mismatch → agent fails

### 12. Model centralization tests

- `MODEL` overrides config
- Config default used when env unset
- Agents never read model from env

### 13. Regression guards

- Grep tests ensure:

  - No legacy keys
  - No per-agent model defaults
  - No `OPENAI_MODEL` anywhere

---

## Definition of Done

- All LLM reviewers run with **Anthropic** when the key is present.
- **Exactly one model decision point** (router).
- No invented defaults.
- No silent fallback.
- Misconfiguration fails before execution.
- E2E works without repo-specific hacks.
