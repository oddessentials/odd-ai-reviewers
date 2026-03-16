# Research: Control Flow Analysis Hardening

**Feature**: 004-control-flow-hardening
**Date**: 2026-01-28
**Status**: Complete

## Research Topics

### 1. Regex Timeout Implementation in Node.js

**Decision**: Use a combination of worker threads and setTimeout for timeout enforcement.

**Rationale**:

- Node.js RegExp runs synchronously on the main thread
- `AbortController` + `AbortSignal` cannot interrupt running regex
- Worker threads allow true timeout via `worker.terminate()`
- For simple patterns, synchronous execution with time-bounded input length is acceptable

**Alternatives Considered**:

| Approach                      | Pros                     | Cons                          | Decision                                  |
| ----------------------------- | ------------------------ | ----------------------------- | ----------------------------------------- |
| Worker threads per regex      | True timeout, isolated   | Overhead per call, complexity | Use for custom patterns only              |
| VM timeout                    | Built-in Node.js feature | Deprecated, security concerns | Rejected                                  |
| Input length limits           | Simple, fast             | Doesn't prevent all ReDoS     | Use as first defense                      |
| Pre-computed regex validation | Zero runtime cost        | Can't catch all patterns      | Already implemented (hasExponentialRegex) |

**Final Approach**:

1. **First defense**: Input length check (max 10KB per match input)
2. **Second defense**: Existing `hasExponentialRegex()` validation at config time
3. **Third defense**: Synchronous execution with `process.hrtime.bigint()` time tracking
4. **Fallback**: For patterns flagged as potentially slow, use worker thread with timeout

### 2. Worker Thread Timeout Pattern

**Decision**: Create a reusable `TimeoutRegex` utility class.

```typescript
// Conceptual API (not implementation)
interface TimeoutRegexResult {
  matched: boolean;
  timedOut: boolean;
  elapsedMs: number;
}

class TimeoutRegex {
  constructor(pattern: string, timeoutMs: number);
  test(input: string): TimeoutRegexResult;
}
```

**Rationale**:

- Worker thread pool overhead is acceptable for custom patterns (typically <100 patterns)
- Built-in patterns can use synchronous regex (they're validated as safe)
- `worker.terminate()` provides hard stop capability

### 3. Cross-File Mitigation Data Flow

**Decision**: Extend `MitigationInstance` to track source context.

**Current State**:

```typescript
// Current MitigationInstance schema
{
  patternId: string;
  location: SourceLocation;  // Has file, line already
  protectedVariables: string[];
  protectedPaths: string[];
  scope: MitigationScope;
  confidence: Confidence;
}
```

**Extended State**:

```typescript
// Extended MitigationInstance schema
{
  patternId: string;
  location: SourceLocation;  // Mitigation file location
  protectedVariables: string[];
  protectedPaths: string[];
  scope: MitigationScope;
  confidence: Confidence;
  // New fields for cross-file tracking
  callChain?: CallChainEntry[];  // How we reached this mitigation
  discoveryDepth?: number;       // Call depth where found (0 = same file)
}

interface CallChainEntry {
  file: string;
  functionName: string;
  line: number;
}
```

**Rationale**:

- `location.file` already tracks where the mitigation is
- Need to track _how_ we reached it (call chain) and _from where_ (vulnerability file)
- Call chain enables audit logging (FR-011)
- Discovery depth enables depth reporting (FR-008)

### 4. Finding Message Enhancement

**Decision**: Add structured mitigation location reporting to message generation.

**Current Message Format** (partial mitigation):

```
Potential injection vulnerability. Partial mitigation detected: 2 of 3 paths (67%) are protected. 1 path(s) remain unprotected.
```

**Enhanced Message Format**:

```
Potential injection vulnerability. Partial mitigation detected: 2 of 3 paths (67%) are protected.
- Protected by: sanitize() in src/utils/validation.ts:42 (depth: 1)
- Protected by: validateInput() in src/middleware/auth.ts:78 (depth: 2)
1 path(s) remain unprotected.
```

**Rationale**:

- Explicit file/line references enable verification without re-running analysis
- Depth information helps developers understand the call relationship
- Itemized list format scales to multiple mitigations

### 5. Configuration Schema Extension

**Decision**: Add `patternTimeoutMs` to `ControlFlowConfig`.

**Extended Config**:

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

**Rationale**:

- Configurable within safe bounds (10ms min, 1000ms max)
- Default 100ms balances safety and performance
- Follows existing config pattern structure

### 6. Logging Requirements

**Decision**: Extend existing `AnalysisLogger` with new categories.

**New Log Categories**:

- `pattern_timeout`: Pattern evaluation timeout events
- `cross_file`: Cross-file mitigation detection events
- `call_chain`: Call chain traversal details (verbose only)

**Log Format**:

```typescript
// Pattern timeout
logger.log(
  'warn',
  'Pattern evaluation timed out',
  {
    patternId: 'custom-sanitizer',
    inputLength: 5432,
    elapsedMs: 100,
    result: 'conservative_non_match',
  },
  'pattern_timeout'
);

// Cross-file mitigation
logger.log(
  'info',
  'Cross-file mitigation detected',
  {
    vulnerabilityFile: 'src/api/handlers.ts',
    mitigationFile: 'src/utils/validation.ts',
    mitigationLine: 42,
    depth: 1,
    patternId: 'input-validation',
  },
  'cross_file'
);
```

## Summary of Decisions

| Topic               | Decision                                                 | Justification                                   |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| Timeout mechanism   | Input length + hrtime tracking + worker fallback         | Layered defense, minimal overhead               |
| Worker usage        | Custom patterns only                                     | Built-in patterns are pre-validated             |
| Cross-file tracking | Extend MitigationInstance with callChain, discoveryDepth | Minimal schema change, enables all requirements |
| Message format      | Itemized mitigation list with file:line                  | Clear, verifiable, scalable                     |
| Config extension    | Add patternTimeoutMs (10-1000ms, default 100)            | Configurable within safe bounds                 |
| Logging             | New categories: pattern_timeout, cross_file, call_chain  | Structured for debugging                        |

## Dependencies

No new external dependencies required. All functionality uses:

- Node.js built-in: `worker_threads`, `process.hrtime.bigint()`
- Existing: `typescript` (AST), `zod` (schemas)

## Risks and Mitigations

| Risk                          | Mitigation                                     |
| ----------------------------- | ---------------------------------------------- |
| Worker thread overhead        | Only use for custom patterns; pool workers     |
| Breaking schema changes       | Extend schema additively; new fields optional  |
| Message formatting complexity | Use template function; unit test all formats   |
| Timeout race conditions       | Use monotonic clock (hrtime); log all timeouts |
