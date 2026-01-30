# Quickstart: Fix Feedback Bugs

**Feature**: 001-fix-feedback-bugs
**Date**: 2026-01-30

## Prerequisites

- Node.js >=22.0.0
- pnpm (package manager)
- Repository cloned and dependencies installed

```bash
pnpm install
```

## Development Workflow

### 1. Run Existing Tests (Baseline)

Verify all tests pass before making changes:

```bash
# Run all tests
pnpm test

# Run only path-analyzer tests
pnpm test router/tests/unit/agents/control_flow/path-analyzer.test.ts

# Run with coverage
pnpm test:coverage
```

### 2. Bug Fix Locations

| Bug | File                                              | Line(s)   | Fix                      |
| --- | ------------------------------------------------- | --------- | ------------------------ |
| 1   | `router/src/agents/control_flow/path-analyzer.ts` | 316       | `>` → `>=`               |
| 2   | `router/src/agents/control_flow/path-analyzer.ts` | 414-422   | Implement pattern lookup |
| 3   | `scripts/check-spec-test-links.cjs`               | 52, 74-79 | Global regex matching    |

### 3. Testing Each Fix

#### Bug 1: Node Visit Limit

```bash
# Run specific test suite
pnpm test router/tests/unit/agents/control_flow/path-analyzer.test.ts -t "maxNodesVisited"
```

New test cases needed:

- Limit of 10 → exactly 10 nodes visited
- Limit of 0 → 0 nodes visited (edge case)

#### Bug 2: Mitigation Mapping

```bash
# Run mitigation-related tests
pnpm test router/tests/unit/agents/control_flow/path-analyzer.test.ts -t "mitigation"
```

New test cases needed:

- SQL-injection mitigation + SQL-injection check → true
- SQL-injection mitigation + XSS check → false
- Empty mitigations array → false

#### Bug 3: Spec Link Checker

```bash
# Run the checker manually
node scripts/check-spec-test-links.cjs
```

New test cases needed:

- Line with 3+ paths → all validated
- Line with varied spacing → all captured

### 4. Lint & Type Check

```bash
# Type check
pnpm typecheck

# Lint (must pass with 0 warnings)
pnpm lint

# Format
pnpm format
```

### 5. Pre-Commit Verification

The pre-commit hook runs automatically:

- `lint-staged` (format + strict lint)
- `typecheck`

Pre-push hook runs:

- `depcruise` (circular dependency check)

### 6. Full Test Suite

```bash
# All tests with coverage
pnpm test:coverage

# Verify minimum 8 new tests added
pnpm test -- --reporter=verbose | grep -c "✓"
```

## Key Files Reference

### Source Files

```
router/src/agents/control_flow/
├── path-analyzer.ts      # Bug 1 (line 316), Bug 2 (lines 414-422)
├── types.ts              # TraversalState, MitigationPattern, VulnerabilityType
└── cfg-types.ts          # ControlFlowGraphRuntime, CFGNodeRuntime

scripts/
└── check-spec-test-links.cjs  # Bug 3 (line 52)
```

### Test Files

```
router/tests/unit/agents/control_flow/
└── path-analyzer.test.ts      # Add regression tests here
```

### Type Definitions

```typescript
// TraversalState (types.ts:480-491)
interface TraversalState {
  nodesVisited: number;
  maxNodesVisited: number;
  limitReached: boolean;
  // ...
}

// MitigationPattern (types.ts:112-123)
interface MitigationPattern {
  id: string;
  mitigates: VulnerabilityType[]; // Key field for Bug 2
  // ...
}

// VulnerabilityType (types.ts:14-23)
type VulnerabilityType =
  | 'injection'
  | 'null_deref'
  | 'auth_bypass'
  | 'xss'
  | 'path_traversal'
  | 'prototype_pollution'
  | 'ssrf';
```

## Success Criteria Checklist

- [ ] SC-001: Node limit N → exactly N nodes (test with limit=10)
- [ ] SC-002: Zero false negatives (SQL-injection mitigation doesn't suppress XSS)
- [ ] SC-003: 100% paths validated on multi-path lines (test with 3+ paths)
- [ ] SC-004: All existing tests pass (0 failures)
- [ ] SC-005: Minimum 8 new regression tests (≥1 per story + 1 per edge case)

## Common Issues

### Test Expectations Encoded Buggy Behavior

If existing tests fail after Bug 1 fix, they may have been testing the buggy N+1 behavior. Update test expectations to match correct N behavior.

### Pattern Registry Access (Bug 2)

`pathMitigatesVulnerability()` needs access to `MitigationPattern` registry to resolve `patternId` → `pattern.mitigates`. Check if `PathAnalyzer` class already has this access or if registry needs to be injected.

### Regex lastIndex Reset (Bug 3)

If using same regex instance across multiple lines, reset `lastIndex = 0` before each line or create new regex instance.
