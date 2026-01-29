# Data Model: Type and Test Optimization

**Feature**: 010-type-test-optimization
**Date**: 2026-01-29
**Status**: Complete

## Overview

This document defines the type entities introduced by this feature. All types are compile-time constructs with minimal or zero runtime overhead.

## Core Type Entities

### 1. Custom Error Types

#### ErrorWireFormat (Serialization Schema)

```typescript
// Zod schema (single source of truth)
export const ErrorWireFormatSchema: z.ZodType<ErrorWireFormat> = z.lazy(() =>
  z.object({
    name: z.string(),
    code: z.string(),
    message: z.string(),
    cause: ErrorWireFormatSchema.optional(),
    context: z.record(z.unknown()),
    stack: z.string().optional(),
  })
);

// Derived type
export type ErrorWireFormat = z.infer<typeof ErrorWireFormatSchema>;
```

**Attributes**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | Yes | Error class name (e.g., "ConfigError") |
| code | string | Yes | Machine-readable code (e.g., "CONFIG_INVALID_SCHEMA") |
| message | string | Yes | Human-readable error message |
| cause | ErrorWireFormat | No | Nested cause error (recursive) |
| context | Record<string, unknown> | Yes | Domain-specific metadata |
| stack | string | No | Stack trace (preserved through serialization) |

#### BaseError (Abstract Base Class)

```typescript
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly context: Record<string, unknown>;

  constructor(message: string, options?: { cause?: Error }) {
    super(message, options);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toWireFormat(): ErrorWireFormat {
    /* ... */
  }
  static fromWireFormat(wire: ErrorWireFormat): BaseError {
    /* ... */
  }
}
```

#### Error Subclasses

| Class           | Code Prefix  | Context Type                                                             | Use Cases                                         |
| --------------- | ------------ | ------------------------------------------------------------------------ | ------------------------------------------------- |
| ConfigError     | CONFIG\_     | `{ path?: string; field?: string; expected?: string; actual?: unknown }` | Schema validation, missing config, invalid values |
| AgentError      | AGENT\_      | `{ agentId: string; phase?: string; input?: unknown }`                   | Agent execution, timeout, parsing                 |
| NetworkError    | NETWORK\_    | `{ url?: string; status?: number; provider?: string }`                   | API calls, auth failures, rate limits             |
| ValidationError | VALIDATION\_ | `{ field: string; value?: unknown; constraint?: string }`                | Input validation, git refs, paths                 |

### 2. Result<T, E> Type

```typescript
// Zod schema for Result (generic)
export const ResultSchema = <T extends z.ZodTypeAny, E extends z.ZodTypeAny>(
  successSchema: T,
  errorSchema: E
) =>
  z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), value: successSchema }),
    z.object({ ok: z.literal(false), error: errorSchema }),
  ]);

// Type definition
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

// Constructor functions
export const Ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
export const Err = <E>(error: E): Result<never, E> => ({ ok: false, error });

// Type guards
export const isOk = <T, E>(result: Result<T, E>): result is { ok: true; value: T } => result.ok;
export const isErr = <T, E>(result: Result<T, E>): result is { ok: false; error: E } => !result.ok;
```

**State Transitions**: None (immutable)

**Relationships**: Used with custom error types for typed error handling

### 3. Branded Type Utilities

#### Brand<T, B> Generic Pattern

```typescript
// Brand symbol type
declare const __brand: unique symbol;

// Generic branded type
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

// Helper types for common brands
export type ValidatedConfig = Brand<Config, 'ValidatedConfig'>;
export type SafeGitRef = Brand<string, 'SafeGitRef'>;
export type CanonicalPath = Brand<string, 'CanonicalPath'>;
```

#### Branded Type Helpers

```typescript
// Generic brand/unbrand helpers
export interface BrandHelpers<T, B extends string> {
  parse(value: unknown): Result<Brand<T, B>, ValidationError>;
  brand(value: T): Brand<T, B>; // Unsafe, internal only
  unbrand(branded: Brand<T, B>): T;
  is(value: unknown): value is Brand<T, B>;
}

// Factory function
export function createBrandHelpers<T, B extends string>(
  schema: z.ZodType<T>,
  brandName: B,
  validate?: (value: T) => Result<T, ValidationError>
): BrandHelpers<T, B>;
```

**Serialization Rules**:

- `unbrand()` strips brand for JSON/cache serialization
- `parse()` validates and re-brands on deserialization
- Direct casting (`as SafeGitRef`) forbidden outside helpers

### 4. AgentResult Discriminated Union

```typescript
// Zod schema (single source of truth)
export const AgentResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    agentId: z.string(),
    findings: z.array(FindingSchema),
    metrics: AgentMetricsSchema,
  }),
  z.object({
    status: z.literal('failure'),
    agentId: z.string(),
    error: z.instanceof(BaseError),
    metrics: AgentMetricsSchema,
  }),
  z.object({
    status: z.literal('skipped'),
    agentId: z.string(),
    reason: z.string(),
    metrics: AgentMetricsSchema,
  }),
]);

// Derived type
export type AgentResult = z.infer<typeof AgentResultSchema>;

// Type-safe constructors
export const AgentSuccess = (
  agentId: string,
  findings: Finding[],
  metrics: AgentMetrics
): AgentResult => ({ status: 'success', agentId, findings, metrics });

export const AgentFailure = (
  agentId: string,
  error: BaseError,
  metrics: AgentMetrics
): AgentResult => ({ status: 'failure', agentId, error, metrics });

export const AgentSkipped = (
  agentId: string,
  reason: string,
  metrics: AgentMetrics
): AgentResult => ({ status: 'skipped', agentId, reason, metrics });
```

**State Transitions**: Immutable (result of agent execution)

### 5. assertNever Utility

```typescript
/**
 * Exhaustive switch utility - call in default branch
 * Causes compile error if switch is not exhaustive
 */
export function assertNever(x: never, message?: string): never {
  throw new Error(message ?? `Unexpected value: ${JSON.stringify(x)}`);
}
```

**Usage Pattern**:

```typescript
function handleAgentResult(result: AgentResult): void {
  switch (result.status) {
    case 'success':
      processFindings(result.findings);
      break;
    case 'failure':
      logError(result.error);
      break;
    case 'skipped':
      logSkipped(result.reason);
      break;
    default:
      assertNever(result); // Compile error if case missing
  }
}
```

## Entity Relationships

```
┌─────────────────┐     ┌──────────────────┐
│   BaseError     │────▶│  ErrorWireFormat │
│  (abstract)     │     │   (serialize)    │
└────────┬────────┘     └──────────────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌─────────┐ ┌────────────┐
│Config  │ │Agent   │ │Network  │ │Validation  │
│Error   │ │Error   │ │Error    │ │Error       │
└────────┘ └────────┘ └─────────┘ └────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │   Result<T, E>    │
              │ (wraps errors)    │
              └───────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │   AgentResult     │
              │ (discriminated)   │
              └───────────────────┘
                          │
                          ▼
              ┌───────────────────┐
              │   assertNever     │
              │ (exhaustive check)│
              └───────────────────┘

┌─────────────────────────────────────────────┐
│            Branded Types                     │
├─────────────────┬───────────────────────────┤
│ ValidatedConfig │ Brand<Config, 'Validated'>│
│ SafeGitRef      │ Brand<string, 'SafeGit'>  │
│ CanonicalPath   │ Brand<string, 'Canonical'>│
└─────────────────┴───────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│         BrandHelpers<T, B>                  │
│  parse() → Result<Brand, ValidationError>  │
│  brand() → Brand<T, B> (internal)          │
│  unbrand() → T (serialization)             │
└─────────────────────────────────────────────┘
```

## Validation Rules

### Error Types

- `code` must match pattern: `^[A-Z]+_[A-Z_]+$` (e.g., CONFIG_INVALID_SCHEMA)
- `cause` chain must not exceed 10 levels (prevent infinite recursion)
- `context` values must be JSON-serializable

### Result Type

- `ok: true` requires `value` field
- `ok: false` requires `error` field
- Type guards `isOk`/`isErr` must be used for narrowing

### Branded Types

- Direct casting forbidden outside `brand()` helper
- `parse()` must validate underlying data before branding
- `unbrand()` must return unmodified underlying value

### AgentResult

- `status` discriminant is required
- `success` variant requires non-empty `findings` array or explicit empty
- `failure` variant requires `BaseError` subclass instance
- `skipped` variant requires non-empty `reason` string

## Migration Notes

Existing types affected:

- `AgentResult` in `agents/types.ts`: Convert from `{ success: boolean; error?: string }` to discriminated union
- `Finding.metadata`: Replace `Record<string, unknown>` with specific metadata schema per agent
- `AgentContext.env`: Consider typed environment access helpers

Backward compatibility wrappers needed for:

- Any exported function that currently throws and will use Result internally
