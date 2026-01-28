# Quickstart: ReDoS Prevention Testing

**Feature**: 005-redos-prevention
**Date**: 2026-01-28

## Overview

This guide explains how to run tests for the ReDoS prevention feature and verify coverage requirements.

---

## Prerequisites

- Node.js >=22.0.0
- npm (comes with Node.js)
- Repository cloned and dependencies installed

```bash
# Install dependencies
npm install

# Verify setup
npm run typecheck
```

---

## Running Tests

### Full Test Suite

```bash
# Run all tests
npm test

# Run with coverage
npm run test -- --coverage
```

### Feature-Specific Tests

```bash
# Run only control flow tests
npm test -- router/tests/unit/agents/control_flow/

# Run pattern validator tests
npm test -- router/tests/unit/agents/control_flow/pattern-validator.test.ts

# Run regex timeout tests
npm test -- router/tests/unit/agents/control_flow/regex-timeout.test.ts

# Run cross-file mitigation tests
npm test -- router/tests/unit/agents/control_flow/cross-file-messages.test.ts
```

### Watch Mode (Development)

```bash
# Watch pattern validator tests
npm test -- --watch router/tests/unit/agents/control_flow/pattern-validator.test.ts
```

---

## Test Coverage Requirements

Per FR-013, the following coverage targets MUST be met:

| File                   | Target | Command to Check                                                               |
| ---------------------- | ------ | ------------------------------------------------------------------------------ |
| pattern-validator.ts   | 80%    | `npm test -- --coverage router/src/agents/control_flow/pattern-validator.ts`   |
| timeout-regex.ts       | 80%    | `npm test -- --coverage router/src/agents/control_flow/timeout-regex.ts`       |
| mitigation-detector.ts | 80%    | `npm test -- --coverage router/src/agents/control_flow/mitigation-detector.ts` |

### Viewing Coverage Report

```bash
# Generate HTML coverage report
npm test -- --coverage --reporter=html

# Open report (location varies by OS)
open coverage/index.html    # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html   # Windows
```

---

## Test Categories

### Pattern Validation Tests

Located in `router/tests/unit/agents/control_flow/pattern-validator.test.ts`

**Scenarios covered:**

- [ ] Nested quantifier detection (`(a+)+`)
- [ ] Overlapping alternation detection (`(a|a)+`)
- [ ] Star-height calculation
- [ ] Risk score computation
- [ ] Whitelist behavior
- [ ] Validation timeout
- [ ] Compilation error handling

### Timeout Behavior Tests

Located in `router/tests/unit/agents/control_flow/regex-timeout.test.ts`

**Scenarios covered:**

- [ ] Normal execution timing
- [ ] Timeout triggering and detection
- [ ] Resource cleanup after timeout
- [ ] Multiple concurrent timeouts
- [ ] Error recovery

### Cross-File Mitigation Tests

Located in `router/tests/unit/agents/control_flow/cross-file-messages.test.ts`

**Scenarios covered:**

- [ ] Same-file mitigation (no cross-file tracking)
- [ ] Simple cross-file mitigation (depth 1)
- [ ] Deep call chain tracking (depth > 1)
- [ ] Maximum depth handling
- [ ] Circular reference detection
- [ ] Multiple mitigations aggregation

### Logging Tests

Located in `router/tests/unit/agents/control_flow/logger.test.ts`

**Scenarios covered:**

- [ ] Pattern validation logged
- [ ] ReDoS detection logged
- [ ] Timeout events logged
- [ ] Cross-file mitigations logged
- [ ] Log filtering by category
- [ ] Structured log format

---

## Writing New Tests

### Test File Template

```typescript
/**
 * Unit tests for [feature]
 *
 * Tests for:
 * - FR-XXX: [requirement description]
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestControlFlowConfig } from '../../../test-utils.js';

describe('[Feature Name]', () => {
  beforeEach(() => {
    // Setup test fixtures
  });

  describe('[Scenario]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      const input = /* ... */;

      // Act
      const result = /* ... */;

      // Assert
      expect(result).toBe(/* expected */);
    });
  });
});
```

### Test Naming Convention

- Describe blocks: Feature or component name
- It blocks: "should [action] when [condition]"

```typescript
describe('PatternValidator', () => {
  describe('validatePattern', () => {
    it('should reject patterns with nested quantifiers', () => {
      /* ... */
    });
    it('should accept valid patterns', () => {
      /* ... */
    });
    it('should skip validation for whitelisted patterns', () => {
      /* ... */
    });
  });
});
```

---

## Troubleshooting

### Tests Timing Out

If tests timeout, check:

1. Pattern complexity in test fixtures
2. Validation timeout settings in test config
3. Available system resources

```typescript
// Increase timeout for slow tests
it('should handle complex pattern', { timeout: 5000 }, () => {
  // Test code
});
```

### Coverage Not Meeting Target

1. Run coverage with verbose output: `npm test -- --coverage --reporter=verbose`
2. Check uncovered lines in HTML report
3. Add tests for edge cases identified in coverage gaps

### Type Errors in Tests

Ensure test utilities are up to date:

```bash
npm run typecheck
```

---

## CI Integration

Tests run automatically in CI via:

- Pre-commit hook: Runs affected tests
- Pull request: Runs full test suite with coverage
- Coverage gate: Fails if below 80% on modified files

```yaml
# Example CI step (GitHub Actions)
- name: Run Tests
  run: npm run test:ci
```
