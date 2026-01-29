# Quickstart: AgentResult Discriminated Unions

**Feature**: 011-agent-result-unions | **Date**: 2026-01-29

## Overview

This guide shows how to use the new `AgentResult` discriminated union in agent implementations and consumer code.

## For Agent Implementers

### Returning Success

```typescript
import { AgentSuccess } from '../agents/types.js';

async run(context: AgentContext): Promise<AgentResult> {
  const startTime = Date.now();
  const findings: Finding[] = [];

  // ... perform review ...
  findings.push({
    severity: 'warning',
    file: 'src/index.ts',
    line: 42,
    message: 'Potential issue found',
    sourceAgent: this.id,
  });

  return AgentSuccess({
    agentId: this.id,
    findings,
    metrics: {
      durationMs: Date.now() - startTime,
      filesProcessed: context.files.length,
    },
  });
}
```

### Returning Failure

```typescript
import { AgentFailure } from '../agents/types.js';

async run(context: AgentContext): Promise<AgentResult> {
  const startTime = Date.now();
  const partialFindings: Finding[] = [];

  try {
    // ... attempt to run, maybe collect some findings ...
    partialFindings.push(/* ... */);

    // ... then an error occurs ...
    throw new Error('API timeout');
  } catch (error) {
    return AgentFailure({
      agentId: this.id,
      error: error instanceof Error ? error.message : 'Unknown error',
      failureStage: 'exec',  // Failure during execution
      partialFindings,       // Include any findings gathered before failure
      metrics: {
        durationMs: Date.now() - startTime,
        filesProcessed: 0,
      },
    });
  }
}
```

### Returning Skipped

```typescript
import { AgentSkipped } from '../agents/types.js';

async run(context: AgentContext): Promise<AgentResult> {
  const supportedFiles = context.files.filter((f) => this.supports(f));

  if (supportedFiles.length === 0) {
    return AgentSkipped({
      agentId: this.id,
      reason: 'No supported files in diff',
      metrics: {
        durationMs: 1,
        filesProcessed: 0,
      },
    });
  }

  // ... continue with review ...
}
```

### Failure Stage Guide

Use the appropriate `failureStage` value:

| Stage           | When to Use                        | Examples                                                 |
| --------------- | ---------------------------------- | -------------------------------------------------------- |
| `'preflight'`   | Before execution starts            | Missing API key, invalid config, unsupported environment |
| `'exec'`        | During execution                   | API timeout, rate limit, network error                   |
| `'postprocess'` | After execution, during processing | Parse error, validation failure, result formatting       |

## For Result Consumers

### Switch Statement (Required Pattern)

The switch statement with `assertNever` ensures compile-time exhaustiveness:

```typescript
import { assertNever } from '../types/assert-never.js';

function processResult(result: AgentResult): void {
  switch (result.status) {
    case 'success':
      // TypeScript knows: result.findings exists, no error
      if (result.findings.length > 0) {
        logger.info(`Found ${result.findings.length} issues`);
      }
      break;

    case 'failure':
      // TypeScript knows: result.error, result.partialFindings exist
      logger.error(`Agent ${result.agentId} failed: ${result.error}`);
      // Handle partial findings if needed (labeled as partial!)
      if (result.partialFindings.length > 0) {
        logger.warn(`${result.partialFindings.length} partial findings (incomplete)`);
      }
      break;

    case 'skipped':
      // TypeScript knows: result.reason exists
      logger.debug(`Agent ${result.agentId} skipped: ${result.reason}`);
      break;

    default:
      // Compile error if a case is missing
      assertNever(result);
  }
}
```

### Type Guards

For conditional logic outside switch statements:

```typescript
import { isSuccess, isFailure, isSkipped } from '../agents/types.js';

function collectFindings(results: AgentResult[]): Finding[] {
  return results
    .filter(isSuccess) // Narrows to AgentResultSuccess[]
    .flatMap((r) => r.findings);
}

function collectErrors(results: AgentResult[]): string[] {
  return results
    .filter(isFailure) // Narrows to AgentResultFailure[]
    .map((r) => `${r.agentId}: ${r.error}`);
}
```

### Handling Partial Findings (Important!)

Partial findings from failures MUST be treated differently:

```typescript
function aggregateFindings(results: AgentResult[]): {
  findings: Finding[];
  partialFindings: Finding[];
} {
  const findings: Finding[] = [];
  const partialFindings: Finding[] = [];

  for (const result of results) {
    switch (result.status) {
      case 'success':
        findings.push(...result.findings);
        break;
      case 'failure':
        // DO NOT mix with success findings!
        partialFindings.push(...result.partialFindings);
        break;
      case 'skipped':
        // No findings
        break;
      default:
        assertNever(result);
    }
  }

  return { findings, partialFindings };
}
```

## Migration Guide

### Step 1: Update Return Statements

**Before:**

```typescript
return {
  agentId: this.id,
  success: true,
  findings,
  metrics,
};
```

**After:**

```typescript
return AgentSuccess({
  agentId: this.id,
  findings,
  metrics,
});
```

### Step 2: Update Failure Returns

**Before:**

```typescript
return {
  agentId: this.id,
  success: false,
  findings: partialResults,
  metrics,
  error: 'Something went wrong',
};
```

**After:**

```typescript
return AgentFailure({
  agentId: this.id,
  error: 'Something went wrong',
  failureStage: 'exec',
  partialFindings: partialResults,
  metrics,
});
```

### Step 3: Update Boolean Checks

**Before:**

```typescript
if (result.success) {
  processFindings(result.findings);
} else {
  logError(result.error);
}
```

**After:**

```typescript
switch (result.status) {
  case 'success':
    processFindings(result.findings);
    break;
  case 'failure':
    logError(result.error);
    break;
  case 'skipped':
    // Handle or acknowledge skipped
    break;
  default:
    assertNever(result);
}
```

### Step 4: Handle the Skipped Case

Previously, skipped agents returned `{ success: true, findings: [] }`. Now they have an explicit status. Decide how your code should handle skipped:

- **Include in success count**: Check `status !== 'failure'`
- **Exclude from success count**: Check `status === 'success'`
- **Log or track separately**: Check `status === 'skipped'`

## Common Patterns

### Aggregating Results

```typescript
function summarizeResults(results: AgentResult[]): {
  successful: number;
  failed: number;
  skipped: number;
  totalFindings: number;
  partialFindings: number;
} {
  let successful = 0;
  let failed = 0;
  let skipped = 0;
  let totalFindings = 0;
  let partialFindingsCount = 0;

  for (const result of results) {
    switch (result.status) {
      case 'success':
        successful++;
        totalFindings += result.findings.length;
        break;
      case 'failure':
        failed++;
        // Count but label separately
        partialFindingsCount += result.partialFindings.length;
        break;
      case 'skipped':
        skipped++;
        break;
      default:
        assertNever(result);
    }
  }

  return { successful, failed, skipped, totalFindings, partialFindings: partialFindingsCount };
}
```

### Telemetry Emission

```typescript
function emitTelemetry(result: AgentResult): void {
  const baseEvent = {
    agentId: result.agentId,
    durationMs: result.metrics.durationMs,
    filesProcessed: result.metrics.filesProcessed,
  };

  switch (result.status) {
    case 'success':
      telemetry.emit('agent.success', {
        ...baseEvent,
        findingsCount: result.findings.length,
      });
      break;
    case 'failure':
      telemetry.emit('agent.failure', {
        ...baseEvent,
        error: result.error,
        failureStage: result.failureStage,
        partialFindingsCount: result.partialFindings.length,
      });
      break;
    case 'skipped':
      telemetry.emit('agent.skipped', {
        ...baseEvent,
        reason: result.reason,
      });
      break;
    default:
      assertNever(result);
  }
}
```

## Type Reference

```typescript
// The union type
type AgentResult = AgentResultSuccess | AgentResultFailure | AgentResultSkipped;

// Status discriminant
type AgentResultStatus = 'success' | 'failure' | 'skipped';

// Failure stage
type FailureStage = 'preflight' | 'exec' | 'postprocess';

// Constructor functions
function AgentSuccess(params: {
  agentId: string;
  findings: Finding[];
  metrics: AgentMetrics;
}): AgentResultSuccess;

function AgentFailure(params: {
  agentId: string;
  error: string;
  failureStage: FailureStage;
  partialFindings?: Finding[];
  metrics: AgentMetrics;
}): AgentResultFailure;

function AgentSkipped(params: {
  agentId: string;
  reason: string;
  metrics: AgentMetrics;
}): AgentResultSkipped;

// Type guards
function isSuccess(result: AgentResult): result is AgentResultSuccess;
function isFailure(result: AgentResult): result is AgentResultFailure;
function isSkipped(result: AgentResult): result is AgentResultSkipped;

// Exhaustiveness helper
function assertNever(x: never, message?: string): never;

// Zod schema for serialization (FR-025)
const AgentResultSchema: z.ZodDiscriminatedUnion<'status', [...]>;
```

## Serialization Contract (FR-025)

When persisting or caching `AgentResult`, use the Zod schema for validation:

```typescript
import { AgentResultSchema } from '../agents/types.js';

// Serializing
const json = JSON.stringify(result);

// Deserializing with validation
const parsed = AgentResultSchema.parse(JSON.parse(json));
// Throws if shape is invalid or status is unknown

// Safe narrowing after parse
if (parsed.status === 'failure') {
  // TypeScript knows: parsed.error, parsed.partialFindings exist
  console.log(parsed.failureStage);
}
```

## Anti-Patterns (Forbidden)

**Note**: All bans are enforced via grep/lint CI checks **from Phase 1** (not Phase 4).

### DO NOT use boolean checks (FR-019)

```typescript
// ❌ FORBIDDEN - fails grep check unconditionally after Phase 1
// Only allowed in: router/src/main.ts + migration-allowlist.txt
if (result.success) { ... }

// ✅ REQUIRED - use status discriminant
if (result.status === 'success') { ... }
```

### DO NOT use object literals (FR-026)

```typescript
// ❌ FORBIDDEN - fails grep check (allowed only in agents/types.ts)
return { agentId: 'test', status: 'success', findings: [], metrics };

// ✅ REQUIRED - use constructor helpers
return AgentSuccess({ agentId: 'test', findings: [], metrics });
```

### DO NOT mix partialFindings with findings (FR-027)

```typescript
// ❌ FORBIDDEN - miscounts results (integration test will fail)
const allFindings = results.flatMap((r) => r.findings ?? r.partialFindings ?? []);

// ✅ REQUIRED - keep separate (partialFindings never count as success)
const findings = results.filter(isSuccess).flatMap((r) => r.findings);
const partial = results.filter(isFailure).flatMap((r) => r.partialFindings);
```

### DO NOT import agent implementations in metadata.ts (FR-028)

```typescript
// ❌ FORBIDDEN - creates circular dependency (depcruise will fail)
// In agents/metadata.ts:
import { SemgrepAgent } from './semgrep.js';

// ✅ REQUIRED - only import from types.ts or index.ts
import type { Finding } from './types.js';
```
