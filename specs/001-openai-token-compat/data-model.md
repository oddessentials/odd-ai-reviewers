# Data Model: OpenAI Token Parameter Compatibility

**Feature**: 001-openai-token-compat
**Date**: 2026-02-04
**Status**: Complete

## Overview

This feature introduces no new persistent data entities. All changes are to transient request/response handling within agent execution. This document describes the internal types used for token parameter compatibility.

## Type Definitions

### TokenLimitParam (Discriminated Union)

Represents the mutually exclusive token limit parameters for OpenAI API calls.

```typescript
/**
 * Token limit parameter for OpenAI Chat Completions API.
 * Exactly one of these parameters should be present in a request.
 */
type TokenLimitParam =
  | { max_completion_tokens: number } // Modern (o-series, preferred)
  | { max_tokens: number }; // Legacy (fallback)
```

**Validation Rules**:

- Value must be a positive integer
- Minimum: 16 (smallest useful response)
- Maximum: Model-dependent (not enforced at this layer)

**State Transitions**: N/A (stateless)

---

### TokenCompatConfig (Configuration Extension)

Extension to existing `LimitsSchema` in `router/src/config/schemas.ts`.

```typescript
/**
 * Extended limits configuration with optional max_completion_tokens override.
 */
interface TokenCompatConfig {
  /** Maximum tokens for completion responses. Default: 4000 */
  max_completion_tokens?: number;
}
```

**Validation Rules**:

- Optional field (uses default if not specified)
- Must be positive integer if specified
- Minimum: 16
- Maximum: No hard limit (model-dependent)

**Default Value**: 4000 (matches current hardcoded behavior)

---

### CompatibilityRetryState (Internal)

Tracks the state of a single API call with compatibility fallback.

```typescript
/**
 * Internal state for token parameter compatibility retry.
 * Not persisted - exists only during a single API call attempt.
 */
interface CompatibilityRetryState {
  /** Which attempt this is (1 = preferred, 2 = fallback) */
  attempt: 1 | 2;

  /** Which parameter was used */
  parameterUsed: 'max_completion_tokens' | 'max_tokens';

  /** Model name for logging */
  modelName: string;

  /** Token limit value */
  tokenLimit: number;
}
```

**State Transitions**:

```
Initial State
    │
    ▼
┌───────────────────────────────────┐
│ Attempt 1: max_completion_tokens  │
└───────────────────────────────────┘
    │
    ├── Success ──────────────────────► Return result
    │
    ├── Non-compat error ─────────────► Throw error (no retry)
    │
    └── Token compat error ───────────┐
                                      │
                                      ▼
                           ┌──────────────────────┐
                           │ Attempt 2: max_tokens │
                           └──────────────────────┘
                                      │
                                      ├── Success ──► Return result
                                      │
                                      └── Any error ──► Throw error (no more retries)
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentContext                              │
│  (existing - no changes)                                         │
│  - effectiveModel: string                                        │
│  - provider: 'openai' | 'anthropic' | ...                        │
│  - config: Config                                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ contains
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Config                                 │
│  (existing - extended)                                           │
│  - limits: Limits                                                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ contains
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Limits                                 │
│  (existing - extended with new field)                            │
│  - max_files: number                                             │
│  - max_diff_lines: number                                        │
│  - max_tokens_per_pr: number                                     │
│  - max_usd_per_pr: number                                        │
│  - monthly_budget_usd: number                                    │
│  + max_completion_tokens?: number   ← NEW (optional)             │
└─────────────────────────────────────────────────────────────────┘
```

---

## No External Data Changes

This feature:

- Does NOT modify any persisted data
- Does NOT change the finding schema
- Does NOT add new cache entries
- Does NOT modify API response formats

All changes are internal to the agent execution layer.

---

## Configuration File Impact

Users can optionally configure the token limit in `.ai-review.yml`:

```yaml
# .ai-review.yml
limits:
  # Existing fields
  max_files: 50
  max_diff_lines: 2000
  max_tokens_per_pr: 700000

  # NEW: Optional override for completion token limit
  # Default: 4000 if not specified
  max_completion_tokens: 8000
```

**Backward Compatibility**: If `max_completion_tokens` is not specified, the default (4000) matches current behavior exactly.
