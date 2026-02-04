# US3: OpenAI Model Compatibility — Enterprise-Grade Deterministic Plan (P1)

**Priority:** P1 (Critical)
**Status:** NOT STARTED
**Target:** `router/src/agents/opencode.ts`

---

## Problem

OpenCode’s OpenAI integration passes `max_tokens`, which is **deprecated** and **not compatible with o-series models**. Some modern models reject it outright and require `max_completion_tokens` instead. ([OpenAI Platform][1])

---

## Goals

1. **Support all OpenAI models** (legacy + modern) without maintaining a brittle model prefix map.
2. **Deterministic behavior**: same input/config ⇒ same request shape (except a single, explicit compatibility retry).
3. **Enterprise-grade failure handling**:
   - No infinite retries
   - Clear error classification
   - Actionable logs/telemetry

4. Preserve backward compatibility for legacy models that still accept `max_tokens`.

---

## Non-Goals

- Migrating the agent to the Responses API in this story (that’s a larger change; Responses uses `max_output_tokens` per OpenAI guidance). ([OpenAI Platform][2])
- Attempting to “auto-detect” full model capabilities beyond token-limit parameter compatibility.

---

## Design: Capability Fallback (Not Model Name Switching)

### Key Principle

**Prefer** `max_completion_tokens`. If the OpenAI API rejects it for a given model/API combination, do a **single retry** using `max_tokens`. This avoids an ever-growing model prefix allowlist while remaining deterministic (max 1 retry). ([OpenAI Platform][1])

### Request Strategy (Deterministic)

1. **Attempt 1:** send `max_completion_tokens`
2. **If and only if** response is a token-param compatibility error:
   - **Attempt 2:** resend with `max_tokens`

3. Otherwise: fail fast and surface the original error.

### Compatibility Error Detection

Detect errors like:

- “`max_tokens` is not supported… use `max_completion_tokens` instead”
- “`max_completion_tokens` is not supported…” (or similar)

(Exact text varies; rely on robust substring matching + 400/invalid_request style checks.)

---

## Implementation Plan

### T009: Introduce token-limit parameter builder

**File:** `router/src/agents/opencode.ts`

Add helpers:

```ts
type TokenLimitParam = { max_completion_tokens: number } | { max_tokens: number };

function buildPreferredTokenLimit(limit: number): TokenLimitParam {
  return { max_completion_tokens: limit };
}

function buildFallbackTokenLimit(limit: number): TokenLimitParam {
  return { max_tokens: limit };
}
```

**Determinism rule:** The preferred parameter is always `max_completion_tokens` for attempt #1.

---

### T010: Add a compatibility error classifier (single responsibility)

```ts
function isTokenParamCompatibilityError(err: unknown): boolean {
  const msg = extractErrorMessage(err).toLowerCase();

  // Examples seen in the wild / docs:
  // "max_tokens is not supported for this model. Use max_completion_tokens instead."
  // "not compatible with o-series models" (docs)
  return (
    (msg.includes('max_tokens') &&
      msg.includes('max_completion_tokens') &&
      msg.includes('not supported')) ||
    (msg.includes('max_completion_tokens') &&
      msg.includes('max_tokens') &&
      msg.includes('not supported'))
  );
}
```

Also add:

- `extractErrorMessage(err)` (safe, non-throwing)
- Optional: `extractHttpStatus(err)` if your OpenAI client exposes it (treat 400 as a strong signal)

---

### T011: Wrap OpenAI call with **single** compatibility retry

**File:** `router/src/agents/opencode.ts`
**Function:** `runWithOpenAI` (and any second call site you noted)

Replace direct call with:

```ts
const limit = resolvedLimit(/* default 4000 or config */);

const attempt1Params = {
  ...baseParams,
  ...buildPreferredTokenLimit(limit),
};

try {
  return await clientCall(attempt1Params);
} catch (err) {
  if (!isTokenParamCompatibilityError(err)) throw err;

  const attempt2Params = {
    ...baseParams,
    ...buildFallbackTokenLimit(limit),
  };

  // IMPORTANT: no additional retries
  return await clientCall(attempt2Params);
}
```

**Hard requirements**

- Exactly **one** retry max.
- Attempt 2 must be identical except for the token-limit parameter key.
- If attempt 2 fails, surface that error (but include “attempted compatibility fallback” context in logs).

---

### T012: Make limit configurable (enterprise best practice)

Avoid hardcoding `4000` in two places.

- Define `OPENCODE_MAX_COMPLETION_TOKENS` (or reuse an existing config field if present)
- Default: 4000 (current behavior)
- Validate: integer, min >= 16, max reasonable (don’t attempt to map per model here)

_(This keeps policy decisions in config, not code.)_

---

### T013: Update both occurrences consistently

You already identified a second occurrence near line ~306. Ensure both are routed through the same helper, so drift can’t happen again.

---

## Acceptance Criteria (Updated)

1. **Modern-model compatibility**
   - Given a model that rejects `max_tokens`, when OpenCode executes, then attempt #1 uses `max_completion_tokens` and succeeds (no hard failure). ([OpenAI Platform][1])

2. **Legacy-model compatibility**
   - Given a model/API combo that rejects `max_completion_tokens`, when OpenCode executes, then it retries once with `max_tokens` and succeeds.

3. **Deterministic retry policy**
   - The implementation performs **at most one** retry and only for the classified token-parameter compatibility error.

4. **No silent behavioral change**
   - If a request fails for any other reason, the error surfaces unchanged (except for safe context/logging).

---

## Testing Plan

### Unit Tests

1. `isTokenParamCompatibilityError()`
   - True for:
     - “max_tokens is not supported… use max_completion_tokens instead”
     - “max_completion_tokens is not supported… use max_tokens instead”

   - False for:
     - network errors
     - auth errors
     - rate limit errors
     - generic validation errors

2. “single retry” behavior
   - Mock `clientCall`:
     - fail attempt 1 with compatibility error → verify attempt 2 called once → success
     - fail attempt 1 with non-compat error → verify no retry
     - fail attempt 1 compat + fail attempt 2 → verify throws attempt 2 error (and no third call)

3. “param diff only”
   - Snapshot/compare attempt 1 vs attempt 2 request objects: only token-limit key differs.

### Integration Test (Optional)

If keys are available in CI:

- Run with a configured modern model that rejects `max_tokens` (expect success on attempt #1)
- Run with a legacy model that still supports `max_tokens` (should either succeed on attempt #1 or succeed after fallback)

---

## Observability & Enterprise Diagnostics

- Log once per fallback (at WARN), include:
  - model name
  - “token-param fallback engaged”
  - attempt1 param key / attempt2 param key

- Emit a structured metric/event (if you have the plumbing):
  - `opencode.openai.token_param_fallback = 1`

No secrets or request payloads should be logged.

---

## Verification Commands

```bash
pnpm lint --max-warnings 0
pnpm typecheck
pnpm test
```

---

## References

- Chat Completions API: `max_tokens` is deprecated in favor of `max_completion_tokens` and is not compatible with o-series models. ([OpenAI Platform][1])
- Example error string in the wild for o-series (“use max_completion_tokens instead”). ([GitHub][3])
- Responses API and modern output token control (`max_output_tokens`) — out of scope for this US but relevant future direction. ([OpenAI Platform][2])

[1]: https://platform.openai.com/docs/api-reference/chat?utm_source=chatgpt.com 'Chat Completions | OpenAI API Reference'
[2]: https://platform.openai.com/docs/api-reference/responses?utm_source=chatgpt.com 'Responses | OpenAI API Reference'

[3]: https://github.com/home-assistant/core/issues/137039?utm_source=chatgpt.com "OpenAI Conversation o1/o3 models fail w/ \"'max_tokens' is ..."
