# Quickstart: OpenAI Token Parameter Compatibility

**Feature**: 001-openai-token-compat
**Date**: 2026-02-04

## Overview

This feature adds automatic compatibility handling for OpenAI's token limit parameters. Modern o-series models (o1, o3) require `max_completion_tokens` while legacy models use `max_tokens`. The system automatically handles this difference without user intervention.

## For Users

### No Action Required

This feature is transparent to users. Code reviews will work with both modern and legacy OpenAI models automatically.

### Optional Configuration

You can optionally override the default token limit in `.ai-review.yml`:

```yaml
limits:
  # Default: 4000 tokens (unchanged from previous behavior)
  max_completion_tokens: 8000
```

**When to change this**:

- Increase for longer code review responses
- Decrease to reduce API costs

**Note**: This is the completion (output) limit, not the input limit. The input is determined by your PR diff size and `max_tokens_per_pr` budget.

---

## For Developers

### Key Files

| File                                            | Purpose                                    |
| ----------------------------------------------- | ------------------------------------------ |
| `router/src/agents/token-compat.ts`             | Token parameter compatibility utilities    |
| `router/src/agents/opencode.ts`                 | Primary OpenCode agent (uses token-compat) |
| `router/src/agents/pr_agent.ts`                 | PR agent (uses token-compat)               |
| `router/src/agents/ai_semantic_review.ts`       | Semantic review agent (uses token-compat)  |
| `router/src/config/schemas.ts`                  | Configuration schema (new field)           |
| `router/tests/unit/agents/token-compat.test.ts` | Unit tests                                 |

### Using the Token Compatibility Wrapper

```typescript
import { withTokenCompatibility } from './token-compat.js';

// Before (hardcoded max_tokens):
const response = await withRetry(() =>
  openai.chat.completions.create({
    model,
    messages,
    max_tokens: 4000, // Fails on o-series models
  })
);

// After (with compatibility handling):
const response = await withTokenCompatibility(
  (tokenParam) =>
    withRetry(() =>
      openai.chat.completions.create({
        model,
        messages,
        ...tokenParam, // Either { max_completion_tokens } or { max_tokens }
      })
    ),
  tokenLimit, // From config or default
  model // For logging
);
```

### Error Classification

```typescript
import { isTokenParamCompatibilityError } from './token-compat.js';

// Check if an error is a token parameter compatibility issue
if (isTokenParamCompatibilityError(error)) {
  // This is a 400 error specifically about max_tokens vs max_completion_tokens
  // The withTokenCompatibility wrapper handles this automatically
}
```

### Testing

```bash
# Run all tests
pnpm test

# Run only token-compat tests
pnpm test router/tests/unit/agents/token-compat.test.ts

# Run with coverage
pnpm test:coverage
```

### Test Scenarios

The test suite covers:

1. **Modern model success** - `max_completion_tokens` accepted on first attempt
2. **Legacy model fallback** - `max_completion_tokens` rejected, `max_tokens` succeeds
3. **Non-compat error passthrough** - Auth/network errors not retried
4. **Double failure** - Both parameters fail, surfaces retry error
5. **Request identity** - Retry request identical except for token param

---

## Troubleshooting

### "max_tokens is not supported" Error

If you see this error in logs, the compatibility fallback is working as expected. The system will automatically retry with the correct parameter.

### Fallback Logging

When fallback engages, you'll see a warning log:

```
[token-compat] Fallback engaged: model=o1-preview, retrying with max_tokens (was max_completion_tokens)
```

This is informational - the request will succeed if the model supports `max_tokens`.

### Both Parameters Fail

If you see errors even after fallback, the issue is likely:

- Invalid API key
- Rate limiting
- Model not available
- Network connectivity

Check the error message for details - it will be from the fallback attempt.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Request Flow                          │
└─────────────────────────────────────────────────────────────────┘

Agent (opencode.ts, pr_agent.ts, etc.)
         │
         │ calls
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              withTokenCompatibility() [NEW]                      │
│  - Attempt 1: max_completion_tokens                              │
│  - If compat error: Attempt 2 with max_tokens                    │
│  - Otherwise: throw error unchanged                              │
└─────────────────────────────────────────────────────────────────┘
         │
         │ wraps
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              withRetry() [EXISTING]                              │
│  - Handles network retries (429, 5xx, connection)                │
│  - Exponential backoff                                           │
└─────────────────────────────────────────────────────────────────┘
         │
         │ calls
         ▼
┌─────────────────────────────────────────────────────────────────┐
│              OpenAI SDK                                          │
│  - chat.completions.create()                                     │
└─────────────────────────────────────────────────────────────────┘
```

The token compatibility layer wraps the retry layer, so:

- Each compatibility attempt gets full network retry protection
- Token compatibility errors (400) trigger the fallback
- Network errors (429, 5xx) trigger within-attempt retries
