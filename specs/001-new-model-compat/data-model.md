# Data Model: New Model Compatibility (Opus 4.6 & GPT-5.3-Codex)

**Feature**: 001-new-model-compat
**Date**: 2026-02-06

## Overview

This feature does not introduce new data entities or modify existing schemas. All changes are to error message strings and documentation. This document captures the key data structures that are _read_ (not modified) during the changes.

## Existing Entities (Read-Only)

### COMPLETIONS_ONLY_PATTERNS

**Location**: `router/src/config/providers.ts:18-24`
**Type**: `RegExp[]`
**Purpose**: Identifies models that cannot use the Chat Completions API
**Status**: Unchanged

```
[/codex/i, /davinci-00[0-3]$/i, /curie/i, /babbage/i, /^ada$/i]
```

### DEFAULT_MODELS

**Location**: `router/src/preflight.ts:47-52`
**Type**: `Record<LlmProvider, string | null>`
**Purpose**: Auto-applied model defaults for single-key setups
**Status**: Unchanged (keeping existing defaults)

```
{ anthropic: 'claude-sonnet-4-20250514', openai: 'gpt-4o', 'azure-openai': null, ollama: 'codellama:7b' }
```

### AVAILABLE_PROVIDERS

**Location**: `router/src/cli/config-wizard.ts:251-264`
**Type**: `{ id: Provider; name: string; description: string }[]`
**Purpose**: Provider options shown in config wizard
**Status**: Description string updated to mention Opus 4.6

## New Function

### isCodexFamilyModel

**Location**: `router/src/config/providers.ts` (new export)
**Signature**: `(model: string) => boolean`
**Purpose**: Identifies Codex-family models specifically (subset of completions-only) for differentiated error messaging

**Logic**: Tests model string against `/codex/i` pattern only.

**Relationship to isCompletionsOnlyModel**: `isCodexFamilyModel(m) === true` implies `isCompletionsOnlyModel(m) === true`, but not vice versa. Codex is a subset of completions-only.

## State Transitions

N/A — No state machines or lifecycle changes in this feature.

## Validation Rules

No new validation rules. Existing rules unchanged:

- `isCompletionsOnlyModel()` continues to block all Codex and legacy models
- `inferProviderFromModel()` continues to use `claude-*` prefix for Anthropic
- Model strings remain free-form (no allowlist)
