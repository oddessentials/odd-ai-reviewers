# Research: ReDoS Prevention and Testing Improvements

**Feature**: 005-redos-prevention
**Date**: 2026-01-28

## Overview

This document consolidates research findings for implementing ReDoS prevention pattern validation and expanding test coverage for the control flow analysis agent.

---

## 1. ReDoS Detection Approaches

### Decision: Static Pattern Analysis

Implement static analysis of regex pattern structure to detect known ReDoS vulnerability patterns before execution.

### Rationale

- **No external dependencies**: Static analysis can be implemented in pure TypeScript without adding npm packages
- **Predictable performance**: Analysis completes in constant time relative to pattern length, not input size
- **Deterministic results**: Same pattern always produces same validation result (aligns with Constitution V)
- **Defense in depth**: Combined with existing timeout protection provides two layers of defense

### Alternatives Considered

| Approach                   | Pros                      | Cons                                        | Rejected Because                                      |
| -------------------------- | ------------------------- | ------------------------------------------- | ----------------------------------------------------- |
| Runtime monitoring only    | Simple; no pre-analysis   | Detects attack after it starts              | Existing timeout already provides this                |
| External library (recheck) | Comprehensive analysis    | New dependency; potential supply chain risk | Adds complexity; OSCR constraints prefer minimal deps |
| Sandboxed worker threads   | True timeout interruption | Complex; platform-specific                  | Node.js worker overhead; unnecessary for validation   |
| WebAssembly regex engine   | Can interrupt execution   | Large dependency; complex integration       | Over-engineered for current scale                     |

### Implementation Approach

Static analysis checks for these known ReDoS patterns:

1. **Nested quantifiers**: `(a+)+`, `(a*)*`, `(a+)*` - exponential backtracking
2. **Overlapping alternation**: `(a|a)+`, `(aa|a)+` - ambiguous matching paths
3. **Quantified overlapping groups**: `(.*a){n}` where input lacks 'a' - quadratic behavior
4. **Star-height > 1**: Multiple levels of Kleene closure nesting

Pattern categories and detection regex:

```typescript
const REDOS_PATTERNS = {
  nestedQuantifiers: /\([^)]*[+*][^)]*\)[+*]/,
  overlappingAlternation: /\([^|)]+\|[^|)]+\)[+*]/,
  // ... additional patterns
};
```

---

## 2. Testing Strategy for Edge Cases

### Decision: Scenario-Based Test Organization

Organize tests by behavior scenario rather than by code unit, with explicit coverage tracking.

### Rationale

- **Aligns with acceptance criteria**: Spec defines testable scenarios that map directly to test cases
- **Easier to verify completeness**: Each FR requirement gets explicit test coverage
- **Better documentation**: Tests serve as executable specification

### Test Categories

| Category            | Files                       | Coverage Target      |
| ------------------- | --------------------------- | -------------------- |
| Pattern validation  | pattern-validator.test.ts   | 90% (new code)       |
| Timeout behavior    | regex-timeout.test.ts       | 80% (expansion)      |
| Cross-file tracking | cross-file-messages.test.ts | 80% (expansion)      |
| Error handling      | regex-timeout.test.ts       | 80% (new scenarios)  |
| Logging             | logger.test.ts              | 70% (new categories) |

### Edge Case Test Matrix

| Scenario                    | Input          | Expected             | Covers |
| --------------------------- | -------------- | -------------------- | ------ |
| Nested quantifier rejection | `(a+)+`        | Invalid + reason     | FR-002 |
| Valid pattern passes        | `validate\w+`  | Valid                | FR-006 |
| Timeout with valid pattern  | Long input     | Timeout event logged | FR-011 |
| Circular call chain         | A→B→A          | Handled gracefully   | FR-010 |
| Max depth exceeded          | Depth > config | Confidence reduced   | FR-010 |
| Compilation error           | `[invalid`     | Error caught, logged | FR-006 |

---

## 3. Error Handling Patterns

### Decision: Result Types with Discriminated Unions

Use TypeScript discriminated unions for error handling rather than try/catch propagation.

### Rationale

- **Type safety**: Compiler enforces handling of all error cases
- **Explicit error paths**: Callers must acknowledge error possibility
- **No exception overhead**: Errors are values, not control flow
- **Aligns with existing patterns**: types.ts already uses this approach (PatternValidationResult)

### Implementation Pattern

```typescript
type ValidationResult =
  | { success: true; data: ValidPattern }
  | { success: false; error: ValidationError };

function validatePattern(pattern: string): ValidationResult {
  // Returns typed result, never throws
}
```

### Error Categories

1. **Compilation errors**: Invalid regex syntax
2. **Validation failures**: Valid syntax but ReDoS-vulnerable structure
3. **Timeout violations**: Pattern valid but exceeded timeout during test execution
4. **Resource limits**: Input too long or pattern too complex

---

## 4. Logging Enhancements

### Decision: Extend Existing Logger Categories

Add new log categories to existing AnalysisLogger rather than creating separate logger.

### Rationale

- **Consistency**: Same log format and configuration as existing categories
- **Audit trail**: All security events in single, filterable log stream
- **Minimal changes**: Extends existing infrastructure rather than replacing

### New Log Categories

| Category             | Level     | Events                         |
| -------------------- | --------- | ------------------------------ |
| `pattern_validation` | info/warn | Pattern validated/rejected     |
| `redos_detection`    | warn      | ReDoS pattern detected         |
| `validation_timeout` | warn      | Validation exceeded time limit |

### Log Entry Structure

```typescript
interface PatternValidationLogEntry extends AnalysisLogEntry {
  category: 'pattern_validation';
  context: {
    patternId: string;
    pattern: string; // Truncated for safety
    result: 'valid' | 'invalid' | 'timeout';
    reason?: string;
    elapsedMs: number;
  };
}
```

---

## 5. Performance Considerations

### Decision: Validation Timeout Separate from Execution Timeout

Pattern validation has its own timeout (default: 10ms) separate from execution timeout (default: 100ms).

### Rationale

- **Fast feedback**: Validation should fail fast for obviously bad patterns
- **Resource protection**: Prevents validation itself from being a DoS vector
- **Configurable**: Operators can tune based on their pattern complexity

### Benchmarks (Estimated)

| Operation                  | Target | Acceptable |
| -------------------------- | ------ | ---------- |
| Simple pattern validation  | <0.5ms | <2ms       |
| Complex pattern validation | <2ms   | <10ms      |
| ReDoS detection (static)   | <1ms   | <5ms       |
| Full validation pipeline   | <5ms   | <15ms      |

---

## 6. Whitelist Mechanism

### Decision: Pattern ID-Based Whitelist in Configuration

Allow operators to whitelist specific pattern IDs that have been manually verified as safe.

### Rationale

- **Flexibility**: Operators can use patterns that trigger validation rules but are known-safe
- **Explicit opt-in**: Must specify exact pattern ID, not wildcard
- **Audit trail**: Whitelisted patterns logged for security review

### Configuration Extension

```typescript
interface ControlFlowConfig {
  // ... existing fields
  whitelistedPatterns?: string[]; // Pattern IDs to skip validation
}
```

---

## Summary

| Research Area     | Decision                    | Key Benefit                           |
| ----------------- | --------------------------- | ------------------------------------- |
| ReDoS detection   | Static pattern analysis     | No external deps; deterministic       |
| Test organization | Scenario-based              | Maps to acceptance criteria           |
| Error handling    | Discriminated unions        | Type-safe; explicit paths             |
| Logging           | Extend existing logger      | Consistent audit trail                |
| Performance       | Separate validation timeout | Fast feedback; resource protection    |
| Whitelist         | Pattern ID-based            | Operator flexibility with audit trail |
