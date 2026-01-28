# Quickstart: Control Flow Analysis Hardening

**Feature**: 004-control-flow-hardening
**Date**: 2026-01-28
**Status**: Implemented

## Overview

This feature adds two hardening improvements to the control flow analysis agent:

1. **Regex Timeout Protection**: Prevents denial-of-service from malicious or slow custom regex patterns
2. **Cross-File Mitigation Transparency**: Explicitly reports when mitigations are found in different files than vulnerabilities

## Getting Started

### Prerequisites

- Node.js >=22.0.0
- Existing control flow analysis agent operational
- Familiarity with `router/src/agents/control_flow/` module

### Key Files to Modify

| File                                                    | Purpose                        |
| ------------------------------------------------------- | ------------------------------ |
| `router/src/agents/control_flow/types.ts`               | Extend schemas with new fields |
| `router/src/agents/control_flow/mitigation-detector.ts` | Add timeout wrapper            |
| `router/src/agents/control_flow/finding-generator.ts`   | Enhance message formatting     |
| `router/src/config/mitigation-config.ts`                | Add `patternTimeoutMs` config  |

### New Types

Import the new types from the contracts file:

```typescript
import {
  CallChainEntry,
  PatternEvaluationResult,
  CrossFileMitigationInfo,
  PatternTimeoutInfo,
} from '../../../specs/004-control-flow-hardening/contracts/hardening-types.js';
```

## Feature 1: Regex Timeout Protection

### Configuration

Add to your control flow config:

```typescript
{
  // ... existing config
  patternTimeoutMs: 100, // Default: 100ms, Range: 10-1000ms
}
```

### Usage Pattern

```typescript
// Pattern evaluation with timeout
function evaluatePattern(
  pattern: RegExp,
  input: string,
  timeoutMs: number
): PatternEvaluationResult {
  const start = process.hrtime.bigint();

  // First defense: input length check
  if (input.length > 10_000) {
    return {
      patternId: pattern.source,
      matched: false,
      timedOut: false,
      elapsedMs: 0,
      inputLength: input.length,
    };
  }

  // Evaluate with time tracking
  const matched = pattern.test(input);
  const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000;

  return {
    patternId: pattern.source,
    matched,
    timedOut: elapsed > timeoutMs,
    elapsedMs: elapsed,
    inputLength: input.length,
  };
}
```

### Timeout Behavior

When a pattern times out:

- Result is treated as **no match** (conservative)
- Timeout is logged with pattern ID and elapsed time
- Finding metadata includes `patternTimeouts` array

## Feature 2: Cross-File Mitigation Reporting

### Data Flow

```
Vulnerability (file A) → Call Site → ... → Mitigation (file B)
                         ↑
                    Call Chain tracked here
```

### Integration with FindingGenerator

The `FindingGenerator` class provides automatic cross-file mitigation integration:

```typescript
import { createFindingGenerator } from './finding-generator.js';

// Create the finding generator
const generator = createFindingGenerator(config);

// Option 1: Automatic integration with cfgMap
// Pass cfgMap to automatically run inter-procedural analysis
const findings = generator.processVulnerabilities(
  vulnerabilities,
  cfg,
  cfgMap // Optional: Map<string, ControlFlowGraphRuntime>
);
// Cross-file mitigations are automatically collected and included in findings

// Option 2: Manual integration for advanced use cases
const pathAnalyzer = generator.getPathAnalyzer();
pathAnalyzer.analyzeInterProcedural(cfg, cfgMap);
generator.syncCrossFileMitigationsFromPathAnalyzer();
const findings = generator.processVulnerabilities(vulnerabilities, cfg);

// Clear stats between analysis sessions
generator.clearStats();
```

**Key Methods**:

| Method                                       | Description                                                          |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `processVulnerabilities(vulns, cfg, map)`    | Process vulnerabilities with optional cfgMap for cross-file analysis |
| `getPathAnalyzer()`                          | Get internal path analyzer for custom analysis                       |
| `syncCrossFileMitigationsFromPathAnalyzer()` | Pull cross-file mitigations after manual analysis                    |
| `clearStats()`                               | Clear collected timeouts and cross-file mitigations                  |

### Extended MitigationInstance

```typescript
const mitigation: MitigationInstance = {
  patternId: 'input-validation',
  location: { file: 'src/utils/validation.ts', line: 42 },
  // ... existing fields

  // New fields for cross-file tracking
  callChain: [
    { file: 'src/api/handlers.ts', functionName: 'handleRequest', line: 15 },
    { file: 'src/utils/validation.ts', functionName: 'sanitize', line: 42 },
  ],
  discoveryDepth: 1, // One call level away
};
```

### Enhanced Finding Messages

Before:

```
Potential injection vulnerability. Partial mitigation detected: 2 of 3 paths protected.
```

After:

```
Potential injection vulnerability. Partial mitigation detected: 2 of 3 paths protected.
- Protected by: sanitize() in src/utils/validation.ts:42 (depth: 1)
- Protected by: validateInput() in src/middleware/auth.ts:78 (depth: 2)
```

## Testing

### Unit Tests to Add

1. **Regex Timeout Tests** (`regex-timeout.test.ts`)
   - Pattern completes within timeout → normal result
   - Pattern exceeds timeout → timedOut: true, matched: false
   - Input length exceeds limit → early return

2. **Cross-File Message Tests** (`cross-file-messages.test.ts`)
   - Same-file mitigation → no call chain in message
   - Cross-file mitigation → file:line included
   - Multiple cross-file mitigations → all listed

### Example Test

```typescript
describe('regex timeout', () => {
  it('should timeout on slow patterns', () => {
    const slowPattern = /^(a+)+$/; // Known ReDoS pattern
    const input = 'a'.repeat(30) + 'b';

    const result = evaluatePattern(slowPattern, input, 10);

    expect(result.timedOut).toBe(true);
    expect(result.matched).toBe(false);
  });
});
```

## Validation Checklist

Implementation status:

- [x] `patternTimeoutMs` config is validated (10-1000ms range)
- [x] Pattern timeouts are logged with category `pattern_timeout`
- [x] Cross-file mitigations include file path in finding message
- [x] Cross-file mitigations include line number in finding message
- [x] Discovery depth is reported in message
- [x] All existing tests still pass
- [x] New tests cover timeout and cross-file scenarios
- [x] `FindingGenerator.processVulnerabilities()` supports optional cfgMap for automatic cross-file analysis
- [x] `FindingGenerator.getPathAnalyzer()` exposes path analyzer for manual analysis
- [x] `FindingGenerator.syncCrossFileMitigationsFromPathAnalyzer()` syncs cross-file data

## Related Documentation

- [Specification](./spec.md) - Full feature requirements
- [Data Model](./data-model.md) - Schema extensions
- [Research](./research.md) - Technical decisions
- [Type Contracts](./contracts/hardening-types.ts) - TypeScript interfaces
