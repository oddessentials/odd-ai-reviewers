# US3: OpenAI Model Compatibility

**Priority**: P1 (Critical)
**Status**: NOT STARTED
**Branch**: `001-pr-blocking-fixes`

## Problem

The OpenCode agent uses `max_tokens` parameter which is rejected by GPT-5.x and other modern OpenAI models (o1, o3). This causes hard failures when users configure these models.

```
Error: max_tokens is not supported for this model. Use max_completion_tokens instead.
```

## Solution

Add model-aware parameter switching in `router/src/agents/opencode.ts`.

## Tasks

### T009: Create `isModernOpenAIModel()` helper

**File**: `router/src/agents/opencode.ts`

Create a helper function to detect modern OpenAI models that require `max_completion_tokens`:

```typescript
/**
 * Detect modern OpenAI models that use max_completion_tokens instead of max_tokens
 *
 * Modern models include:
 * - gpt-5.x series
 * - o1 series (o1-preview, o1-mini)
 * - o3 series
 */
function isModernOpenAIModel(model: string): boolean {
  const modernPrefixes = ['gpt-5', 'o1', 'o3'];
  const lowerModel = model.toLowerCase();
  return modernPrefixes.some((prefix) => lowerModel.startsWith(prefix));
}
```

### T010: Modify OpenAI API call for model-aware parameters

**File**: `router/src/agents/opencode.ts`
**Function**: `runWithOpenAI` (line ~146)

Currently at line 179:

```typescript
max_tokens: 4000,
```

Change to:

```typescript
...(isModernOpenAIModel(model)
  ? { max_completion_tokens: 4000 }
  : { max_tokens: 4000 }),
```

**Note**: There's a second occurrence at line ~306 that also needs updating.

## Acceptance Criteria

1. **Given** a GPT-5.x model is configured, **When** the OpenCode agent executes, **Then** the API call uses `max_completion_tokens` instead of `max_tokens`.

2. **Given** a GPT-4.x model is configured, **When** the OpenCode agent executes, **Then** the API call continues to use `max_tokens` for backward compatibility.

## Testing

1. Unit test for `isModernOpenAIModel()`:
   - `gpt-5` → true
   - `gpt-5-turbo` → true
   - `o1-preview` → true
   - `o1-mini` → true
   - `o3` → true
   - `gpt-4o` → false
   - `gpt-4-turbo` → false
   - `gpt-3.5-turbo` → false

2. Integration test (if API key available):
   - Configure GPT-5 model
   - Run `ai-review local . --dry-run`
   - Verify no `max_tokens` rejection error

## Verification

After implementation, run:

```bash
pnpm lint --max-warnings 0
pnpm typecheck
pnpm test
```

## References

- Spec: `specs/001-pr-blocking-fixes/spec.md` (User Story 3)
- Tasks: `specs/001-pr-blocking-fixes/tasks.md` (Phase 5)
- OpenAI API docs: https://platform.openai.com/docs/api-reference/chat/create
