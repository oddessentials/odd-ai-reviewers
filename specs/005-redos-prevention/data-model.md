# Data Model: ReDoS Prevention and Testing Improvements

**Feature**: 005-redos-prevention
**Date**: 2026-01-28

## Overview

This document defines the data entities for pattern validation and enhanced error handling in the control flow analysis agent.

---

## Entities

### 1. PatternValidationResult

Represents the outcome of validating a regex pattern for ReDoS vulnerabilities.

**Purpose**: Captures validation status and details for audit logging and error reporting.

| Field            | Type                                  | Required | Description                                           |
| ---------------- | ------------------------------------- | -------- | ----------------------------------------------------- |
| pattern          | string                                | Yes      | The regex pattern that was validated                  |
| patternId        | string                                | Yes      | Identifier for the pattern (from config or generated) |
| isValid          | boolean                               | Yes      | Whether the pattern passed validation                 |
| rejectionReasons | string[]                              | No       | Reasons why pattern was rejected (empty if valid)     |
| redosRisk        | 'none' \| 'low' \| 'medium' \| 'high' | Yes      | Assessed ReDoS risk level                             |
| validationTimeMs | number                                | Yes      | Time taken for validation in milliseconds             |
| whitelisted      | boolean                               | No       | Whether pattern was whitelisted (skipped validation)  |

**Validation Rules**:

- `pattern` must be non-empty
- `patternId` must be non-empty
- `validationTimeMs` must be non-negative
- `rejectionReasons` must be non-empty if `isValid` is false

**State Transitions**: N/A (immutable result object)

---

### 2. ValidationError

Represents an error encountered during pattern validation or execution.

**Purpose**: Structured error information for logging and recovery decisions.

| Field       | Type                                                     | Required | Description                                           |
| ----------- | -------------------------------------------------------- | -------- | ----------------------------------------------------- |
| errorType   | 'compilation' \| 'validation' \| 'timeout' \| 'resource' | Yes      | Category of error                                     |
| patternId   | string                                                   | Yes      | Pattern that caused the error                         |
| message     | string                                                   | Yes      | Human-readable error description                      |
| details     | Record<string, unknown>                                  | No       | Additional context (input length, elapsed time, etc.) |
| recoverable | boolean                                                  | Yes      | Whether analysis can continue                         |
| timestamp   | number                                                   | Yes      | Unix timestamp of error occurrence                    |

**Validation Rules**:

- `message` must be non-empty
- `timestamp` must be positive integer

---

### 3. ReDoSDetectionResult

Represents the outcome of checking a pattern for ReDoS vulnerability patterns.

**Purpose**: Internal result from static pattern analysis.

| Field                     | Type     | Required | Description                                  |
| ------------------------- | -------- | -------- | -------------------------------------------- | --------------------- |
| hasNestedQuantifiers      | boolean  | Yes      | Pattern contains `(a+)+` style constructs    |
| hasOverlappingAlternation | boolean  | Yes      | Pattern contains `(a                         | a)+` style constructs |
| hasQuantifiedOverlap      | boolean  | Yes      | Pattern contains `(.*a){n}` style constructs |
| starHeight                | number   | Yes      | Maximum nesting depth of Kleene operators    |
| vulnerabilityScore        | number   | Yes      | Composite risk score (0-100)                 |
| detectedPatterns          | string[] | Yes      | Names of ReDoS patterns detected             |

**Validation Rules**:

- `starHeight` must be non-negative integer
- `vulnerabilityScore` must be 0-100

---

### 4. TimeoutEvent (Extended)

Extends existing PatternTimeoutInfo with additional context for enhanced logging.

**Purpose**: Complete audit record of timeout events.

| Field          | Type                            | Required | Description                             |
| -------------- | ------------------------------- | -------- | --------------------------------------- |
| patternId      | string                          | Yes      | Pattern that timed out                  |
| elapsedMs      | number                          | Yes      | Time elapsed before timeout             |
| inputLength    | number                          | Yes      | Length of input being matched           |
| inputPreview   | string                          | No       | First 50 chars of input (for debugging) |
| recoveryAction | 'skip' \| 'fallback' \| 'abort' | Yes      | How the timeout was handled             |
| correlationId  | string                          | Yes      | Links to analysis session               |
| timestamp      | number                          | Yes      | Unix timestamp of timeout               |

**Validation Rules**:

- `elapsedMs` must be non-negative
- `inputLength` must be non-negative
- `inputPreview` max length 50 characters

---

### 5. CrossFileMitigationInfo (Extended)

Extends existing type with additional context for audit logging.

**Purpose**: Complete record of cross-file mitigation detection for transparency.

| Field             | Type                        | Required | Description                                    |
| ----------------- | --------------------------- | -------- | ---------------------------------------------- |
| patternId         | string                      | Yes      | Mitigation pattern ID                          |
| file              | string                      | Yes      | File containing the mitigation                 |
| line              | number                      | Yes      | Line number of mitigation                      |
| depth             | number                      | Yes      | Call depth where mitigation was found          |
| functionName      | string                      | No       | Function containing the mitigation             |
| vulnerabilityFile | string                      | Yes      | File containing the vulnerability              |
| vulnerabilityLine | number                      | Yes      | Line of the vulnerability                      |
| callChainSummary  | string                      | No       | Abbreviated call chain (file1:fn1 → file2:fn2) |
| confidence        | 'high' \| 'medium' \| 'low' | Yes      | Detection confidence                           |

**Validation Rules**:

- `line` must be positive integer
- `depth` must be non-negative integer
- `vulnerabilityLine` must be positive integer

---

## Relationships

```
┌─────────────────────────┐
│ ControlFlowConfig       │
│ (existing)              │
├─────────────────────────┤
│ + whitelistedPatterns[] │──┐
└─────────────────────────┘  │
                             │ references
┌─────────────────────────┐  │
│ MitigationPattern       │◄─┘
│ (existing)              │
├─────────────────────────┤
│ + id                    │
│ + match.namePattern     │───┐
└─────────────────────────┘   │
                              │ validated by
┌─────────────────────────┐   │
│ PatternValidationResult │◄──┘
├─────────────────────────┤
│ + pattern               │
│ + isValid               │
│ + rejectionReasons      │
└─────────────────────────┘
         │
         │ on failure
         ▼
┌─────────────────────────┐
│ ValidationError         │
├─────────────────────────┤
│ + errorType             │
│ + message               │
│ + recoverable           │
└─────────────────────────┘
```

---

## Zod Schemas

```typescript
// PatternValidationResult
export const PatternValidationResultSchema = z.object({
  pattern: z.string().min(1),
  patternId: z.string().min(1),
  isValid: z.boolean(),
  rejectionReasons: z.array(z.string()).default([]),
  redosRisk: z.enum(['none', 'low', 'medium', 'high']),
  validationTimeMs: z.number().nonnegative(),
  whitelisted: z.boolean().optional(),
});

// ValidationError
export const ValidationErrorSchema = z.object({
  errorType: z.enum(['compilation', 'validation', 'timeout', 'resource']),
  patternId: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  recoverable: z.boolean(),
  timestamp: z.number().int().positive(),
});

// ReDoSDetectionResult
export const ReDoSDetectionResultSchema = z.object({
  hasNestedQuantifiers: z.boolean(),
  hasOverlappingAlternation: z.boolean(),
  hasQuantifiedOverlap: z.boolean(),
  starHeight: z.number().int().nonnegative(),
  vulnerabilityScore: z.number().min(0).max(100),
  detectedPatterns: z.array(z.string()),
});
```

---

## Migration Notes

These are new types; no migration from existing data structures required. Existing `PatternTimeoutInfo` and `CrossFileMitigationInfo` types will have optional new fields added for backward compatibility.
