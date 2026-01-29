# Data Model: AgentResult Discriminated Unions

**Feature**: 011-agent-result-unions | **Date**: 2026-01-29

## Overview

This document defines the type contracts for the AgentResult discriminated union refactoring, including the Zod serialization schema required for cache round-trip safety (FR-025).

## Type Definitions

### Discriminant Type

```typescript
/**
 * Possible states for an agent run result.
 * Used as the discriminant for the AgentResult union.
 */
type AgentResultStatus = 'success' | 'failure' | 'skipped';
```

### Failure Stage Type

```typescript
/**
 * Indicates when during execution the failure occurred.
 * Used by consumers to determine if partialFindings are usable.
 */
type FailureStage = 'preflight' | 'exec' | 'postprocess';
```

- `preflight`: Failure before execution started (e.g., missing API key, config error)
- `exec`: Failure during execution (e.g., API timeout, rate limit)
- `postprocess`: Failure after execution during result processing (e.g., parse error)

### Base Interface

```typescript
/**
 * Common fields shared by all AgentResult variants.
 */
interface AgentResultBase {
  /** Unique identifier for the agent that produced this result */
  agentId: string;

  /** Performance and usage metrics from the run */
  metrics: AgentMetrics;
}
```

### Success Variant

```typescript
/**
 * Result when an agent completes successfully.
 *
 * Invariants:
 * - status is always 'success'
 * - findings array may be empty (agent found nothing)
 * - NO error field
 * - NO reason field
 */
interface AgentResultSuccess extends AgentResultBase {
  status: 'success';

  /** Findings discovered during the review */
  findings: Finding[];
}
```

### Failure Variant

```typescript
/**
 * Result when an agent fails to complete.
 *
 * Invariants:
 * - status is always 'failure'
 * - error message is required and non-empty
 * - failureStage indicates when failure occurred
 * - partialFindings may contain results gathered before failure
 * - NO reason field
 *
 * IMPORTANT: partialFindings MUST be labeled as partial in reports/telemetry
 * and MUST NOT count toward success metrics.
 */
interface AgentResultFailure extends AgentResultBase {
  status: 'failure';

  /** Error message describing what went wrong */
  error: string;

  /** When during execution the failure occurred */
  failureStage: FailureStage;

  /** Partial findings gathered before failure (may be empty) */
  partialFindings: Finding[];
}
```

### Skipped Variant

```typescript
/**
 * Result when an agent is skipped (not applicable to this PR).
 *
 * Invariants:
 * - status is always 'skipped'
 * - reason explains why the agent was skipped
 * - NO error field
 * - NO findings field
 *
 * Use cases:
 * - No supported files in the diff
 * - Agent disabled in config
 * - Prerequisite not met (e.g., no API key)
 */
interface AgentResultSkipped extends AgentResultBase {
  status: 'skipped';

  /** Human-readable explanation of why the agent was skipped */
  reason: string;
}
```

### Union Type

````typescript
/**
 * Discriminated union representing all possible agent run outcomes.
 *
 * Usage:
 * ```typescript
 * switch (result.status) {
 *   case 'success':
 *     // result is AgentResultSuccess, has findings
 *     break;
 *   case 'failure':
 *     // result is AgentResultFailure, has error + partialFindings
 *     break;
 *   case 'skipped':
 *     // result is AgentResultSkipped, has reason
 *     break;
 *   default:
 *     assertNever(result);
 * }
 * ```
 */
type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;
````

## Constructor Functions

### AgentSuccess

```typescript
/**
 * Create a successful agent result.
 *
 * @param params.agentId - The agent's unique identifier
 * @param params.findings - Findings discovered (may be empty)
 * @param params.metrics - Performance metrics
 * @returns AgentResultSuccess
 *
 * @example
 * return AgentSuccess({
 *   agentId: this.id,
 *   findings: detectedIssues,
 *   metrics: { durationMs: 150, filesProcessed: 5 },
 * });
 */
function AgentSuccess(params: {
  agentId: string;
  findings: Finding[];
  metrics: AgentMetrics;
}): AgentResultSuccess;
```

### AgentFailure

```typescript
/**
 * Create a failed agent result.
 *
 * @param params.agentId - The agent's unique identifier
 * @param params.error - Error message (required, non-empty)
 * @param params.failureStage - When the failure occurred
 * @param params.partialFindings - Partial findings before failure (default: [])
 * @param params.metrics - Performance metrics
 * @returns AgentResultFailure
 *
 * @example
 * return AgentFailure({
 *   agentId: this.id,
 *   error: `API request failed: ${response.status}`,
 *   failureStage: 'exec',
 *   partialFindings: resultsBeforeTimeout,
 *   metrics: { durationMs: 2000, filesProcessed: 3 },
 * });
 */
function AgentFailure(params: {
  agentId: string;
  error: string;
  failureStage: FailureStage;
  partialFindings?: Finding[];
  metrics: AgentMetrics;
}): AgentResultFailure;
```

### AgentSkipped

```typescript
/**
 * Create a skipped agent result.
 *
 * @param params.agentId - The agent's unique identifier
 * @param params.reason - Why the agent was skipped
 * @param params.metrics - Performance metrics (typically minimal)
 * @returns AgentResultSkipped
 *
 * @example
 * return AgentSkipped({
 *   agentId: this.id,
 *   reason: 'No TypeScript files in diff',
 *   metrics: { durationMs: 1, filesProcessed: 0 },
 * });
 */
function AgentSkipped(params: {
  agentId: string;
  reason: string;
  metrics: AgentMetrics;
}): AgentResultSkipped;
```

## Type Guards

```typescript
/**
 * Type guard for success results.
 *
 * @example
 * if (isSuccess(result)) {
 *   // result.findings is typed as Finding[]
 *   processFindings(result.findings);
 * }
 */
function isSuccess(result: AgentResult): result is AgentResultSuccess;

/**
 * Type guard for failure results.
 *
 * @example
 * if (isFailure(result)) {
 *   // result.error is typed as string
 *   // result.partialFindings is typed as Finding[]
 *   logger.error(result.error);
 * }
 */
function isFailure(result: AgentResult): result is AgentResultFailure;

/**
 * Type guard for skipped results.
 *
 * @example
 * if (isSkipped(result)) {
 *   // result.reason is typed as string
 *   logger.info(`Skipped: ${result.reason}`);
 * }
 */
function isSkipped(result: AgentResult): result is AgentResultSkipped;
```

## Typed Metadata Helpers

### Finding Metadata

```typescript
/**
 * Known metadata fields for security-related findings.
 */
interface SecurityMetadata {
  /** CWE identifier (e.g., "CWE-79") */
  cwe?: string;

  /** OWASP category (e.g., "A03:2021-Injection") */
  owasp?: string;

  /** Confidence level of the finding */
  confidence?: 'high' | 'medium' | 'low';

  /** CVE identifier if applicable */
  cveId?: string;
}

/**
 * Extract typed security metadata from a finding.
 * Unknown fields are filtered out, known fields are type-validated.
 *
 * @param finding - The finding to extract metadata from
 * @returns Typed security metadata (fields may be undefined)
 */
function getSecurityMetadata(finding: Finding): SecurityMetadata;
```

### AgentContext Environment

```typescript
/**
 * Well-known environment variables used by agents.
 */
interface KnownEnvVars {
  /** GitHub personal access token */
  GITHUB_TOKEN?: string;

  /** Azure DevOps personal access token */
  AZURE_DEVOPS_PAT?: string;

  /** Azure DevOps system access token (pipelines) */
  SYSTEM_ACCESSTOKEN?: string;

  /** Anthropic API key */
  ANTHROPIC_API_KEY?: string;

  /** OpenAI API key */
  OPENAI_API_KEY?: string;

  /** Azure OpenAI API key */
  AZURE_OPENAI_API_KEY?: string;
}

/**
 * Extract typed known environment variables from the context.
 *
 * @param env - The raw environment record
 * @returns Typed environment variables (fields may be undefined)
 */
function getKnownEnv(env: Record<string, string | undefined>): KnownEnvVars;
```

## Export Structure

```typescript
// From router/src/agents/types.ts
export type {
  AgentResult,
  AgentResultSuccess,
  AgentResultFailure,
  AgentResultSkipped,
  AgentResultStatus,
  FailureStage,
  // Existing exports unchanged
  Finding,
  Severity,
  AgentMetrics,
  AgentContext,
  ReviewAgent,
};

export { AgentSuccess, AgentFailure, AgentSkipped, isSuccess, isFailure, isSkipped };

// From router/src/agents/metadata.ts (new file - ISOLATED, zero back-edges)
export type { SecurityMetadata, KnownEnvVars };
export { getSecurityMetadata, getKnownEnv };

// Zod schemas for serialization (FR-025)
export {
  AgentResultSchema,
  AgentResultSuccessSchema,
  AgentResultFailureSchema,
  AgentResultSkippedSchema,
};
```

## Zod Serialization Schema (FR-025)

Required for cache round-trip safety. Prevents shape drift when `cache/store.ts` serializes/deserializes.

```typescript
import { z } from 'zod';

const AgentMetricsSchema = z.object({
  durationMs: z.number(),
  filesProcessed: z.number(),
  tokensUsed: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
});

const FindingSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  file: z.string(),
  line: z.number().optional(),
  endLine: z.number().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
  ruleId: z.string().optional(),
  sourceAgent: z.string(),
  fingerprint: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const AgentResultSuccessSchema = z.object({
  status: z.literal('success'),
  agentId: z.string(),
  findings: z.array(FindingSchema),
  metrics: AgentMetricsSchema,
});

const AgentResultFailureSchema = z.object({
  status: z.literal('failure'),
  agentId: z.string(),
  error: z.string(),
  failureStage: z.enum(['preflight', 'exec', 'postprocess']),
  partialFindings: z.array(FindingSchema),
  metrics: AgentMetricsSchema,
});

const AgentResultSkippedSchema = z.object({
  status: z.literal('skipped'),
  agentId: z.string(),
  reason: z.string(),
  metrics: AgentMetricsSchema,
});

// Discriminated union schema - validates exact shape
const AgentResultSchema = z.discriminatedUnion('status', [
  AgentResultSuccessSchema,
  AgentResultFailureSchema,
  AgentResultSkippedSchema,
]);
```

## Type Relationships

```
AgentResultBase (interface)
    ├── AgentResultSuccess (interface extends AgentResultBase)
    │   └── status: 'success'
    │   └── findings: Finding[]
    │
    ├── AgentResultFailure (interface extends AgentResultBase)
    │   └── status: 'failure'
    │   └── error: string
    │   └── failureStage: FailureStage
    │   └── partialFindings: Finding[]
    │
    └── AgentResultSkipped (interface extends AgentResultBase)
        └── status: 'skipped'
        └── reason: string

AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped
```

## Validation Rules

| Field             | Success                 | Failure                 | Skipped                 |
| ----------------- | ----------------------- | ----------------------- | ----------------------- |
| `status`          | `'success'` (required)  | `'failure'` (required)  | `'skipped'` (required)  |
| `agentId`         | string (required)       | string (required)       | string (required)       |
| `metrics`         | AgentMetrics (required) | AgentMetrics (required) | AgentMetrics (required) |
| `findings`        | Finding[] (required)    | N/A                     | N/A                     |
| `partialFindings` | N/A                     | Finding[] (default [])  | N/A                     |
| `error`           | N/A                     | string (required)       | N/A                     |
| `failureStage`    | N/A                     | FailureStage (required) | N/A                     |
| `reason`          | N/A                     | N/A                     | string (required)       |

## Invariant Enforcement

### Compile-Time (TypeScript)

- Discriminated union prevents accessing `error` on success variant
- Discriminated union prevents accessing `findings` on skipped variant
- `partialFindings` is distinct from `findings` - different property name
- Constructor functions enforce valid field combinations
- `satisfies` keyword enables tsd-style exhaustiveness canary (FR-018)

### Runtime (assertNever + Zod)

- Switch statements with `assertNever` throw if unexpected status encountered
- Provides clear error message with the unexpected value
- Zod schema validates shape on deserialization (FR-025)
- Round-trip tests verify no shape drift in cache operations

### CI-Time (Lint/Grep) - Active from Phase 1 (FR-019, FR-026)

- Grep check for `\.success\b` - unconditional after Phase 1 (allowlist: main.ts + migration file)
- Grep check for `status: 'success'` literals - allowlist only `agents/types.ts` (FR-026)
- tsd-style canary test fails deterministically if variant added (FR-018)
- Integration test verifies partialFindings don't increment success metrics (FR-027)

### Dependency Check (FR-028)

- `agents/metadata.ts` has zero imports from agent implementations
- Enforced via depcruise rule
- Prevents circular dependencies from typed metadata helpers
