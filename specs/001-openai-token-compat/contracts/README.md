# Contracts: OpenAI Token Parameter Compatibility

**Feature**: 001-openai-token-compat
**Date**: 2026-02-04

## No External API Contracts

This feature makes **internal changes only** to the agent execution layer. There are no:

- New external APIs exposed
- Changes to existing API contracts
- New webhook endpoints
- GraphQL/REST schema changes

## Internal Interface Changes

### Configuration Schema Extension

The `LimitsSchema` in `router/src/config/schemas.ts` gains one optional field:

```typescript
// Addition to existing LimitsSchema
{
  // ... existing fields unchanged ...
  max_completion_tokens: z.number().int().min(16).optional().default(4000);
}
```

### New Internal Module

`router/src/agents/token-compat.ts` exports:

```typescript
// Types
export type TokenLimitParam = { max_completion_tokens: number } | { max_tokens: number };

// Functions
export function isTokenParamCompatibilityError(error: unknown): boolean;
export function buildPreferredTokenLimit(limit: number): TokenLimitParam;
export function buildFallbackTokenLimit(limit: number): TokenLimitParam;
export async function withTokenCompatibility<T>(
  apiCall: (params: TokenLimitParam) => Promise<T>,
  tokenLimit: number,
  modelName: string
): Promise<T>;
```

## Backward Compatibility

- All existing configurations continue to work unchanged
- Default behavior (4000 token limit) is preserved
- No breaking changes to any interfaces
