# Research: OpenAI Token Parameter Compatibility

**Feature**: 001-openai-token-compat
**Date**: 2026-02-04
**Status**: Complete

## Research Questions Resolved

### Q1: What is the exact error format when using `max_tokens` with o-series models?

**Decision**: Use HTTP 400 status + error type + message pattern matching for classification.

**Findings**:

- **HTTP Status**: `400 Bad Request`
- **Error Type**: `invalid_request_error`
- **Error Code**: `unsupported_parameter`
- **Parameter**: `max_tokens`
- **Error Message**: `"Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead."`

**Source**: [GitHub Issue simonw/llm#724](https://github.com/simonw/llm/issues/724)

**Rationale**: The error classification must check both HTTP status (400) AND message content to distinguish token parameter compatibility errors from other invalid request errors.

**Alternatives Considered**:

1. Message pattern matching alone - Rejected because other 400 errors could match patterns
2. Error code alone (`unsupported_parameter`) - Rejected because this code applies to many parameters, not just token limits

---

### Q2: Which models require `max_completion_tokens` vs `max_tokens`?

**Decision**: Use capability fallback rather than model name mapping.

**Findings**:

- **o-series models** (o1, o1-preview, o1-mini, o3, o3-mini): Require `max_completion_tokens` exclusively
- **Legacy models** (GPT-4, GPT-4-turbo, GPT-3.5-turbo): Support `max_tokens`, may also accept `max_completion_tokens`
- **Future models**: Unknown - OpenAI may change requirements

**Source**: [OpenAI Developer Community](https://community.openai.com/t/why-was-max-tokens-changed-to-max-completion-tokens/938077)

**Rationale**: Model name prefix checking (e.g., `model.startsWith('o1')`) is fragile because:

1. New models may be added without codebase updates
2. Model naming conventions may change
3. Custom fine-tuned models have unpredictable names

The capability fallback approach handles all cases without maintenance burden.

**Alternatives Considered**:

1. Model prefix allowlist - Rejected as brittle and requires constant updates
2. Always use `max_tokens` - Rejected because o-series models reject it outright
3. Always use `max_completion_tokens` - Rejected because some legacy models may not support it

---

### Q3: How should the retry logic interact with existing `withRetry` in `retry.ts`?

**Decision**: Implement token parameter compatibility retry separately from network retry.

**Findings**:

- Existing `retry.ts` handles network-level retries (429, 5xx, connection errors)
- Token parameter compatibility is a **request configuration error**, not a network error
- The existing `withRetry` returns `null` for `BadRequestError` (400), meaning no retry
- Token parameter errors are 400 errors that SHOULD be retried with different parameters

**Current retry.ts behavior**:

```typescript
if (error instanceof OpenAI.BadRequestError) return null; // No retry
```

**Rationale**: Token parameter compatibility retry is semantically different from network retry:

- Network retry: Same request, hope for different result
- Token compat retry: Modified request (different parameter), expect success

These should be separate concerns to maintain single responsibility.

**Implementation Approach**:

1. New `token-compat.ts` module handles parameter compatibility
2. Wraps the API call with compatibility fallback logic
3. Uses existing `withRetry` for network-level retries within each attempt
4. Result: `withTokenCompat(withRetry(apiCall))` - compatibility wraps retry

**Alternatives Considered**:

1. Modify `retry.ts` to handle token compat - Rejected because it violates single responsibility
2. Add special case in `withRetry` - Rejected because it complicates existing retry logic
3. No retry for 400 errors - Rejected because it breaks o-series support

---

### Q4: How should the OpenAI SDK error types be detected?

**Decision**: Use SDK-provided error classes plus message inspection.

**Findings**:
The OpenAI SDK 6.x provides typed error classes:

- `OpenAI.BadRequestError` - 400 errors
- `OpenAI.APIError` - Base class with `status`, `code`, `message` properties

Token parameter errors are `BadRequestError` instances with specific message patterns.

**Detection Logic**:

```typescript
function isTokenParamCompatibilityError(error: unknown): boolean {
  if (!(error instanceof OpenAI.BadRequestError)) return false;

  const msg = error.message.toLowerCase();
  return (
    msg.includes('max_tokens') &&
    msg.includes('max_completion_tokens') &&
    msg.includes('not supported')
  );
}
```

**Rationale**: This approach:

1. Uses SDK types for status code verification (400)
2. Uses message patterns for semantic verification (token parameter issue)
3. Is defensive against message format changes (uses `includes` not exact match)

---

### Q5: What is the appropriate default token limit?

**Decision**: Keep existing default of 4000 tokens.

**Findings**:

- Current hardcoded value across all agents: `max_tokens: 4000`
- This is the **completion limit** (output tokens), not input limit
- o-series models have higher output limits (up to 100K for reasoning + output)
- 4000 is conservative but sufficient for code review responses

**Rationale**: Changing the default would alter existing behavior. The feature should maintain backward compatibility while fixing the parameter name issue.

**Configuration**: Add optional `max_completion_tokens` config field:

- Default: 4000 (matches current behavior)
- Minimum: 16 (smallest useful response)
- Maximum: Not enforced (varies by model)

---

### Q6: What logging should occur when fallback engages?

**Decision**: Log at WARN level with model name and parameter used, no sensitive data.

**Format**:

```
[opencode] Token parameter fallback: model=o1-preview, retrying with max_tokens (was max_completion_tokens)
```

**Content**:

- Model name (not sensitive)
- Which parameter triggered fallback
- Which parameter being used for retry

**Excluded** (per FR-011):

- API keys
- Request/response payloads
- Token limit values (could reveal cost optimization strategies)

---

## Technical Architecture Decisions

### Token Parameter Type

```typescript
type TokenLimitParam = { max_completion_tokens: number } | { max_tokens: number };
```

This discriminated union ensures exactly one parameter is set at a time.

### Error Classification Function

```typescript
function isTokenParamCompatibilityError(error: unknown): boolean {
  // Must be OpenAI BadRequestError (HTTP 400)
  if (!(error instanceof OpenAI.BadRequestError)) return false;

  const msg = error.message.toLowerCase();

  // Must mention both parameters and "not supported"
  return (
    msg.includes('max_tokens') &&
    msg.includes('max_completion_tokens') &&
    msg.includes('not supported')
  );
}
```

### Compatibility Wrapper Function

```typescript
async function withTokenCompatibility<T>(
  apiCall: (params: TokenLimitParam) => Promise<T>,
  tokenLimit: number,
  modelName: string
): Promise<T> {
  // Attempt 1: Preferred parameter (max_completion_tokens)
  try {
    return await apiCall({ max_completion_tokens: tokenLimit });
  } catch (error) {
    if (!isTokenParamCompatibilityError(error)) {
      throw error; // Non-compatibility error - don't retry
    }

    // Log fallback engagement
    console.warn(
      `[token-compat] Fallback engaged: model=${modelName}, ` +
        `retrying with max_tokens (was max_completion_tokens)`
    );

    // Attempt 2: Fallback parameter (max_tokens)
    return await apiCall({ max_tokens: tokenLimit });
  }
}
```

---

## References

- [OpenAI Chat Completions API Reference](https://platform.openai.com/docs/api-reference/chat)
- [OpenAI Developer Community: max_tokens vs max_completion_tokens](https://community.openai.com/t/why-was-max-tokens-changed-to-max-completion-tokens/938077)
- [GitHub Issue: OpenAI o1 models require max_completion_tokens](https://github.com/simonw/llm/issues/724)
- [OpenAI Help: Controlling response length](https://help.openai.com/en/articles/5072518-controlling-the-length-of-openai-model-responses)
