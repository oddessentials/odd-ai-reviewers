# Research: Fix Feedback Bugs

**Feature**: 001-fix-feedback-bugs
**Date**: 2026-01-30

## Overview

Research findings for three bug fixes identified in FEEDBACK.md. All unknowns resolved.

---

## Bug 1: Off-by-One Node Visit Limit

### Current State

**Location**: `router/src/agents/control_flow/path-analyzer.ts:316-327`

```typescript
// Line 316 - THE BUG
if (state.nodesVisited > state.maxNodesVisited) {
  // ... early return logic
}
state.nodesVisited++; // Line 327
```

**Problem**: Uses `>` instead of `>=`. When `nodesVisited = 10000` and `maxNodesVisited = 10000`:

- Check: `10000 > 10000` = false → continues
- Increments to 10001
- Result: 10,001 nodes processed for 10,000 limit

### Decision

**Fix**: Change `>` to `>=` with pre-increment check semantics per FR-002.

```typescript
// Fixed: Pre-increment check semantics
if (state.nodesVisited >= state.maxNodesVisited) {
  // ... early return logic
}
state.nodesVisited++;
```

**Rationale**:

- Matches semantic intent of `maxNodesVisited` as inclusive upper bound
- Guarantees `limit = 0` → 0 nodes visited (Edge Case 1)
- Pre-increment check prevents off-by-one

**Alternatives Considered**:

- Post-increment with `>` and adjusting limit by 1: Rejected - confusing semantics, violates variable naming intent
- Changing variable name to `maxNodesAllowed`: Rejected - unnecessary API change

### Existing Tests

Tests exist in `router/tests/unit/agents/control_flow/path-analyzer.test.ts` (lines 569-834) but may have wrong expectations. Need to verify and update if tests encode the buggy behavior.

---

## Bug 2: Mitigation Mapping Placeholder

### Current State

**Location**: `router/src/agents/control_flow/path-analyzer.ts:414-422`

```typescript
pathMitigatesVulnerability(path: ExecutionPath, _vulnType: VulnerabilityType): boolean {
  return path.mitigations.some((_m) => {
    return true; // Placeholder - actual implementation would check pattern mappings
  });
}
```

**Problem**: Returns `true` for ANY mitigation on a path regardless of vulnerability type. SQL-injection mitigation incorrectly suppresses XSS findings.

### Decision

**Fix**: Implement proper vulnerability type checking using `MitigationPattern.mitigates` array.

**Implementation Approach**:

1. `MitigationInstance` has `patternId` linking to `MitigationPattern`
2. `MitigationPattern` has `mitigates: VulnerabilityType[]` (already exists in types.ts:112-123)
3. Need to resolve `patternId` → `MitigationPattern` → check if `vulnType` is in `mitigates`

**Challenge**: The current `pathMitigatesVulnerability()` method doesn't have access to the pattern registry. Options:

1. **Pass pattern registry as parameter** - cleanest, explicit dependency
2. **Store patterns in PathAnalyzer instance** - already has access via constructor
3. **Add `appliesTo` directly on MitigationInstance** - requires schema change

**Rationale**: Option 2 preferred - `PathAnalyzer` likely already has pattern registry access or can be extended to have it. Avoids changing method signatures used elsewhere.

**Alternatives Considered**:

- Inline pattern lookup in method: Rejected - pattern registry access unclear
- Add `appliesTo` to `MitigationInstance` schema: Rejected - denormalizes data, complicates schema

### Type Contract (from spec clarification)

```typescript
// Mitigation MUST include appliesTo
interface Mitigation {
  appliesTo: VulnerabilityType[];
  // ... other fields
}
```

This aligns with existing `MitigationPattern.mitigates` field. Implementation will resolve `patternId` → `MitigationPattern.mitigates`.

---

## Bug 3: Spec Link Checker Pattern Limitation

### Current State

**Location**: `scripts/check-spec-test-links.cjs:52`

```javascript
const testCoveragePattern = /\*\*Test Coverage\*\*:\s*`([^`]+)`(?:\s*,\s*`([^`]+)`)?/g;
```

**Problem**: Only 2 capture groups. Lines with 3+ paths silently skip validation.

### Decision

**Fix**: Use global matching of single-path pattern per FR-006.

```javascript
// Fixed: Global match of single backtick-quoted paths
const testCoverageLinePattern = /\*\*Test Coverage\*\*:\s*(.+)/;
const singlePathPattern = /`([^`]+)`/g;

// Extract all paths from the line
const lineMatch = line.match(testCoverageLinePattern);
if (lineMatch) {
  const pathsText = lineMatch[1];
  let pathMatch;
  while ((pathMatch = singlePathPattern.exec(pathsText)) !== null) {
    testRefs.push(pathMatch[1]);
  }
}
```

**Rationale**:

- Global regex with single capture group supports unlimited paths
- `matchAll` or `exec` loop both work; `exec` loop matches existing code style
- Silently skips lines with zero valid paths (per US3 Acceptance Behavior)

**Alternatives Considered**:

- Named capture groups: Rejected - doesn't solve unlimited count issue
- Split by comma then extract: Rejected - fragile, assumes comma format

---

## Dependencies & Best Practices

### TypeScript/Vitest Testing

- Use `describe`/`it` blocks for test organization
- Existing pattern tests are in `path-analyzer.test.ts`
- Edge case tests should be in dedicated `describe` block

### Regex Best Practices (JavaScript)

- Use `exec` loop with global flag for multiple matches
- Reset `lastIndex` if reusing regex or create new instance per line
- Consider `String.prototype.matchAll()` for cleaner syntax (Node 12+)

---

## Summary

| Bug | File                         | Fix Approach                | Risk                                    |
| --- | ---------------------------- | --------------------------- | --------------------------------------- |
| 1   | path-analyzer.ts:316         | `>` → `>=`                  | Low - may need to update existing tests |
| 2   | path-analyzer.ts:414-422     | Implement pattern lookup    | Medium - needs pattern registry access  |
| 3   | check-spec-test-links.cjs:52 | Global single-path matching | Low - straightforward regex change      |

All NEEDS CLARIFICATION items resolved. Ready for Phase 1.
