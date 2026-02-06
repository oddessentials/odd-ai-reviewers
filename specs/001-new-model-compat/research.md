# Research: New Model Compatibility (Opus 4.6 & GPT-5.3-Codex)

**Feature**: 001-new-model-compat
**Date**: 2026-02-06

## Research Task 1: Claude Opus 4.6 Compatibility

### Decision

Claude Opus 4.6 (`claude-opus-4-6`) is compatible with the existing architecture out of the box. No code changes are required for basic functionality. Only error message and documentation updates are needed to reference it as an available option.

### Rationale

- **Model ID format**: `claude-opus-4-6` follows the `claude-*` prefix convention. The `inferProviderFromModel()` function in `providers.ts:168-172` correctly identifies it as Anthropic via `model.startsWith('claude-')`.
- **No allowlist**: The system accepts any model string — there is no enum or allowlist restricting model names. The only validation is prefix-based heuristics and completions-only pattern matching.
- **SDK compatibility**: Anthropic SDK `0.71.2` uses the standard Messages API. Opus 4.6 uses the same API. No new parameters are required for basic chat usage.
- **Routing**: `resolveProvider()` in `providers.ts:220-274` resolves the provider based on API keys, not model names. Provider-model match validation uses the `claude-*` prefix which matches `claude-opus-4-6`.

### Alternatives Considered

1. **Update auto-applied default to Opus 4.6**: Rejected. Opus 4.6 is $5/$25 per million tokens vs Sonnet's lower pricing. Changing the default would increase costs for users in zero-config mode without their consent.
2. **Upgrade Anthropic SDK**: Rejected for this feature. SDK `0.71.2` supports the Messages API. Advanced features (1M context beta, adaptive thinking) would need SDK updates but are out of scope.

## Research Task 2: GPT-5.3-Codex Compatibility

### Decision

GPT-5.3-Codex (`gpt-5.3-codex`) is correctly blocked by the existing `/codex/i` pattern in `isCompletionsOnlyModel()`. The block is appropriate because OpenAI has deprecated Chat Completions API support for Codex models. Only the error message needs improvement.

### Rationale

- **API incompatibility**: OpenAI has confirmed that Chat Completions API (`/v1/chat/completions`) is deprecated and being removed for Codex models. GPT-5.3-Codex uses a Codex-specific/Agents SDK API endpoint instead.
- **Full API not yet available**: As of 2026-02-05, GPT-5.3-Codex is only available via ChatGPT app, CLI, IDE extension, and Codex Cloud — not via the standard API that odd-ai-reviewers uses.
- **Existing pattern works**: The `/codex/i` pattern in `COMPLETIONS_ONLY_PATTERNS` (providers.ts:19) correctly matches `gpt-5.3-codex` and triggers rejection at preflight.
- **Misleading error message**: The current error at `preflight.ts:765` says `"completions-only model (Codex/legacy)"` which is inaccurate for a brand-new model. Users trying GPT-5.3-Codex would be confused by the "legacy" label.

### Alternatives Considered

1. **Add Codex Agents SDK integration**: Rejected. The Codex API is not yet publicly available, and adding a new API integration is a major architectural change out of scope for this feature.
2. **Remove the `/codex/i` pattern to allow GPT-5.3-Codex through**: Rejected. The model would fail at runtime with a 404 from the Chat Completions API. Failing at preflight with a clear error is the correct behavior.
3. **Add a separate Codex agent type**: Rejected. Premature — the Codex API is not publicly available yet. Can be revisited when/if OpenAI opens the API.

## Research Task 3: Error Message Classification Strategy

### Decision

Add a new `isCodexFamilyModel()` function to `providers.ts` that identifies Codex-family models specifically. Use this in `validateChatModelCompatibility()` to provide differentiated error messages: one for Codex models (accurate description of API incompatibility) and one for legacy models (existing message).

### Rationale

- **Separation of concerns**: `isCompletionsOnlyModel()` answers "is this model blocked?" while `isCodexFamilyModel()` answers "why is it blocked?" — the first controls behavior, the second controls messaging.
- **No behavior change**: Both Codex and legacy models remain blocked. Only the explanation differs.
- **Future-proof**: If OpenAI eventually adds Chat Completions support for Codex models, we can update the Codex-specific path without touching the legacy model handling.

### Alternatives Considered

1. **Split COMPLETIONS_ONLY_PATTERNS into two arrays**: Rejected. Over-engineering. The blocking behavior doesn't change — only the error message needs to vary.
2. **Use model name parsing in the error handler instead of a separate function**: Rejected. Duplicating regex logic is fragile. A dedicated exported function can be tested independently.

## Research Task 4: Model Reference Update Scope

### Decision

Update error messages and documentation to list `claude-opus-4-6` as an available model option alongside existing models. Do NOT change any defaults.

### Rationale

- **Error messages**: 5 locations in `preflight.ts` suggest `claude-sonnet-4-20250514` as the Anthropic model. These should add `claude-opus-4-6` as an alternative.
- **Config wizard**: `config-wizard.ts` shows `claude-sonnet-4` in Anthropic provider description. This should mention Opus 4.6.
- **Zero-config**: The auto-applied default stays at `claude-sonnet-4-20250514` (cost-conscious choice).
- **Documentation**: ~15 files reference model names. These should add Opus 4.6 as an option.

### Alternatives Considered

1. **Replace Sonnet references with Opus**: Rejected. Sonnet is still a valid, cost-effective model. Both should be listed.
2. **Skip documentation updates**: Rejected. Users reading docs should see current model options.
