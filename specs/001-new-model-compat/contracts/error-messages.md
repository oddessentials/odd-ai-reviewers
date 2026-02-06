# Error Message Contracts: New Model Compatibility

**Feature**: 001-new-model-compat
**Date**: 2026-02-06

## Overview

This feature has no REST/GraphQL API contracts. The "contracts" are the user-facing error messages produced by preflight validation. These messages are the primary interface between the system and users attempting to configure new models.

## Contract 1: Codex Model Rejection (NEW)

**Trigger**: User sets `MODEL` to any Codex-family model (e.g., `gpt-5.3-codex`, `gpt-5.2-codex`) while cloud AI agents are enabled.

**Current behavior**:

```
MODEL 'gpt-5.3-codex' is a completions-only model (Codex/legacy) but cloud AI agents are enabled.
Cloud agents require chat models that support the /v1/chat/completions endpoint.

Fix: Use a chat-compatible model:
  MODEL=gpt-4o-mini              # OpenAI - fast, cost-effective
  MODEL=gpt-4o                   # OpenAI - flagship
  MODEL=claude-sonnet-4-20250514 # Anthropic

Or in .ai-review.yml:
  models:
    default: gpt-4o-mini
```

**New behavior**:

```
MODEL 'gpt-5.3-codex' is a Codex-family model. Codex models use a specialized API
that is not compatible with the chat completions endpoint used by cloud AI agents.

Fix: Use a chat-compatible model:
  MODEL=gpt-4o-mini    # OpenAI - fast, cost-effective
  MODEL=gpt-4o         # OpenAI - flagship
  MODEL=claude-opus-4-6 # Anthropic

Or in .ai-review.yml:
  models:
    default: gpt-4o-mini
```

**Key differences**:

- Removes "legacy" label — accurate for modern Codex models
- Explains _why_ Codex is incompatible (different API) rather than just labeling it
- Updates Anthropic suggestion to `claude-opus-4-6`

## Contract 2: Legacy Model Rejection (UPDATED)

**Trigger**: User sets `MODEL` to a legacy completions-only model (e.g., `text-davinci-003`, `curie`, `babbage`) while cloud AI agents are enabled.

**Behavior** (unchanged messaging, updated suggestions):

```
MODEL 'text-davinci-003' is a legacy completions-only model that does not support
the chat completions endpoint used by cloud AI agents.

Fix: Use a chat-compatible model:
  MODEL=gpt-4o-mini    # OpenAI - fast, cost-effective
  MODEL=gpt-4o         # OpenAI - flagship
  MODEL=claude-opus-4-6 # Anthropic

Or in .ai-review.yml:
  models:
    default: gpt-4o-mini
```

## Contract 3: Provider-Model Mismatch (UPDATED suggestions)

**Trigger**: User has `ANTHROPIC_API_KEY` but model is `gpt-*` style (or vice versa).

**Change**: Anthropic model suggestions updated from `claude-sonnet-4-20250514` to `claude-opus-4-6`.

**Example (Anthropic key + GPT model)**:

```
Provider-model mismatch for agent 'opencode':
  - Resolved provider: Anthropic (ANTHROPIC_API_KEY present, takes precedence)
  - Model: 'gpt-4o' (looks like OpenAI: gpt-*/o1-*)
  - This will cause a 404 error - Anthropic API doesn't recognize 'gpt-4o'

Fix options:
  1. Use a Claude model: MODEL=claude-opus-4-6
  2. Remove ANTHROPIC_API_KEY to use OpenAI instead
  3. Set both keys but ensure MODEL matches ANTHROPIC_API_KEY (Anthropic wins)
```

## Contract 4: Ollama Model with Cloud Agents (UPDATED suggestions)

**Trigger**: User sets `MODEL` to an Ollama-style model (containing `:`) while cloud AI agents are enabled.

**Change**: Anthropic model suggestion updated to `claude-opus-4-6`.

```
MODEL 'codellama:7b' is an Ollama model but cloud AI agents are enabled.
Fix: Either set a cloud model or disable cloud agents:
  MODEL=claude-opus-4-6  # Anthropic
  MODEL=gpt-4o-mini      # OpenAI
Or in .ai-review.yml, disable cloud agents and keep only local_llm.
```

## Contract 5: Config Wizard Provider Descriptions (UPDATED)

**Anthropic provider description**:

- Current: `'Claude Sonnet, Claude Opus (default: claude-sonnet-4)'`
- New: `'Claude Opus 4.6, Claude Sonnet 4 (default: claude-sonnet-4)'`

**Generated YAML comment for Anthropic**:

- Current: `# Default model: claude-sonnet-4-20250514 (auto-applied if MODEL not set)`
- New: `# Default model: claude-sonnet-4-20250514 (auto-applied if MODEL not set). Also available: claude-opus-4-6`

## Validation

All contracts are verified by unit tests in `router/src/__tests__/preflight.test.ts`:

- Codex model test: asserts error contains "Codex-family" and does NOT contain "legacy"
- Legacy model test: asserts error contains "legacy completions-only"
- Model suggestion test: asserts Anthropic suggestions contain `claude-opus-4-6`
- Regression test: existing models (`gpt-4o`, `gpt-4o-mini`, `claude-sonnet-4-20250514`) continue to pass validation
