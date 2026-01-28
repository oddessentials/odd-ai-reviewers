# Data Model: Control Flow Analysis Hardening

**Feature**: 004-control-flow-hardening
**Date**: 2026-01-28
**Status**: Complete

## Entity Overview

This feature extends existing data models rather than introducing new top-level entities.

## Schema Extensions

### 1. MitigationInstance (Extended)

**Location**: `router/src/agents/control_flow/types.ts`

**Current Schema**:

```typescript
MitigationInstanceSchema = z.object({
  patternId: z.string(),
  location: SourceLocationSchema,
  protectedVariables: z.array(z.string()),
  protectedPaths: z.array(z.string()),
  scope: MitigationScopeSchema,
  confidence: ConfidenceSchema,
});
```

**Extended Schema**:

```typescript
// New: Call chain entry for cross-file tracking
CallChainEntrySchema = z.object({
  file: z.string(),
  functionName: z.string(),
  line: z.number().int().positive(),
});

MitigationInstanceSchema = z.object({
  patternId: z.string(),
  location: SourceLocationSchema,
  protectedVariables: z.array(z.string()),
  protectedPaths: z.array(z.string()),
  scope: MitigationScopeSchema,
  confidence: ConfidenceSchema,
  // New fields (optional for backward compatibility)
  callChain: z.array(CallChainEntrySchema).optional(),
  discoveryDepth: z.number().int().nonnegative().optional(),
});
```

**Field Descriptions**:

| Field            | Type                | Description                                                                                                                            |
| ---------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `callChain`      | `CallChainEntry[]?` | Stack trace from vulnerability to mitigation. First entry is the call site in vulnerability file, last entry is the mitigation itself. |
| `discoveryDepth` | `number?`           | How many call levels deep the mitigation was found. 0 = same file, 1 = one call away, etc.                                             |

### 2. ControlFlowConfig (Extended)

**Location**: `router/src/agents/control_flow/types.ts`

**Extended Schema**:

```typescript
ControlFlowConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxCallDepth: z.number().int().positive().default(5),
  timeBudgetMs: z.number().int().positive().default(300_000),
  sizeBudgetLines: z.number().int().positive().default(10_000),
  mitigationPatterns: z.array(MitigationPatternSchema).default([]),
  patternOverrides: z.array(PatternOverrideSchema).default([]),
  disabledPatterns: z.array(z.string()).default([]),
  // New field
  patternTimeoutMs: z.number().int().min(10).max(1000).default(100),
});
```

**Field Descriptions**:

| Field              | Type     | Default | Description                                                                           |
| ------------------ | -------- | ------- | ------------------------------------------------------------------------------------- |
| `patternTimeoutMs` | `number` | 100     | Maximum time in milliseconds for a single regex pattern evaluation. Range: 10-1000ms. |

### 3. PatternEvaluationResult (New)

**Location**: `router/src/agents/control_flow/mitigation-detector.ts`

**Schema**:

```typescript
PatternEvaluationResultSchema = z.object({
  patternId: z.string(),
  matched: z.boolean(),
  timedOut: z.boolean(),
  elapsedMs: z.number().nonnegative(),
  inputLength: z.number().int().nonnegative(),
});
```

**Field Descriptions**:

| Field         | Type      | Description                                      |
| ------------- | --------- | ------------------------------------------------ |
| `patternId`   | `string`  | ID of the pattern that was evaluated             |
| `matched`     | `boolean` | Whether the pattern matched (false if timed out) |
| `timedOut`    | `boolean` | Whether evaluation was terminated due to timeout |
| `elapsedMs`   | `number`  | Actual time taken for evaluation                 |
| `inputLength` | `number`  | Length of input string that was matched against  |

### 4. FindingMetadata (Extended)

**Location**: `router/src/agents/control_flow/types.ts`

**Extended Schema**:

```typescript
FindingMetadataSchema = z.object({
  mitigationStatus: MitigationStatusSchema,
  originalSeverity: SeveritySchema.optional(),
  pathsCovered: z.number().int().nonnegative(),
  pathsTotal: z.number().int().positive(),
  unprotectedPaths: z.array(z.string()),
  mitigationsDetected: z.array(z.string()),
  analysisDepth: z.number().int().nonnegative(),
  degraded: z.boolean(),
  degradedReason: z.string().optional(),
  // New fields
  crossFileMitigations: z.array(CrossFileMitigationInfoSchema).optional(),
  patternTimeouts: z.array(PatternTimeoutInfoSchema).optional(),
});

// New supporting schemas
CrossFileMitigationInfoSchema = z.object({
  patternId: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  depth: z.number().int().nonnegative(),
  functionName: z.string().optional(),
});

PatternTimeoutInfoSchema = z.object({
  patternId: z.string(),
  elapsedMs: z.number().nonnegative(),
});
```

**Field Descriptions**:

| Field                  | Type                         | Description                                                            |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| `crossFileMitigations` | `CrossFileMitigationInfo[]?` | Details of mitigations found in different files than the vulnerability |
| `patternTimeouts`      | `PatternTimeoutInfo[]?`      | Patterns that timed out during evaluation                              |

## Entity Relationships

```
ControlFlowConfig
    └── patternTimeoutMs (new)
    └── mitigationPatterns[] ──→ MitigationPattern

MitigationInstance
    └── location ──→ SourceLocation
    └── callChain[] ──→ CallChainEntry (new)
    └── discoveryDepth (new)

FindingMetadata
    └── crossFileMitigations[] ──→ CrossFileMitigationInfo (new)
    └── patternTimeouts[] ──→ PatternTimeoutInfo (new)
```

## Validation Rules

### PatternTimeoutMs

- **Range**: 10 ≤ patternTimeoutMs ≤ 1000
- **Default**: 100
- **Rationale**: Too low (<10ms) causes false timeouts; too high (>1000ms) defeats protection purpose

### CallChain

- **Ordering**: First entry is closest to vulnerability, last entry is the mitigation
- **Max Length**: Bounded by `maxCallDepth` config (default: 5)
- **Invariant**: `callChain.length === discoveryDepth + 1` when both are present

### DiscoveryDepth

- **Range**: 0 ≤ discoveryDepth ≤ maxCallDepth
- **Semantics**:
  - 0 = Mitigation in same file as vulnerability
  - 1 = Mitigation one call level away
  - N = Mitigation N call levels away

## State Transitions

### Pattern Evaluation States

```
┌─────────────┐
│   PENDING   │
└──────┬──────┘
       │ start evaluation
       ▼
┌─────────────┐
│  EVALUATING │──────┐
└──────┬──────┘      │ timeout
       │ complete    │
       ▼             ▼
┌─────────────┐ ┌─────────────┐
│   MATCHED   │ │  TIMED_OUT  │
│  or NO_MATCH│ │(no match)   │
└─────────────┘ └─────────────┘
```

## Migration Notes

All schema extensions are **additive** and use optional fields. No migration required for existing data:

- `MitigationInstance.callChain`: Optional, undefined for pre-existing instances
- `MitigationInstance.discoveryDepth`: Optional, undefined for pre-existing instances
- `ControlFlowConfig.patternTimeoutMs`: Has default value (100)
- `FindingMetadata.crossFileMitigations`: Optional, undefined for pre-existing findings
- `FindingMetadata.patternTimeouts`: Optional, undefined for pre-existing findings

Existing tests and configurations will continue to work without modification.
