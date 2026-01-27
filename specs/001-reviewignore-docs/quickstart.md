# Quickstart: Verifying .reviewignore Documentation

**Feature**: 001-reviewignore-docs

## Verification Checklist

### 1. Pattern Normalization Section

After implementation, verify that `docs/config-schema.md` contains:

- [ ] A "Pattern Normalization" section between Syntax and Filter Precedence
- [ ] A transformation table with at least these patterns:
  - `node_modules` → `**/node_modules`
  - `/config.js` → `config.js` (root-relative)
  - `dist/` → `**/dist/**` (directory recursive)
  - `src/generated` → `src/generated` (path-relative unchanged)
- [ ] Explanation of when each transformation applies

### 2. Bare Segment Matching

Verify the bare segment section includes:

- [ ] What DOES match: `node_modules`, `node_modules/lodash/index.js`, `src/node_modules/local/file.js`
- [ ] What does NOT match: `node_modules_backup/file.js`
- [ ] Explanation that bare names match the segment AND its contents

### 3. Negation Example

Verify there is an example showing:

- [ ] Excluding a directory: `node_modules`
- [ ] Re-including a specific file: `!node_modules/important-patch.js`
- [ ] Explanation of "last match wins" behavior

### 4. Filter Precedence Consolidation

Verify:

- [ ] `docs/config-schema.md` has the canonical filter precedence table
- [ ] `docs/ARCHITECTURE.md` links to config-schema.md instead of duplicating
- [ ] `README.md` mentions filter precedence briefly and links to ARCHITECTURE.md

### 5. Cross-Reference Consistency

Count filter precedence mentions:

| Location                | Expected               |
| ----------------------- | ---------------------- |
| `docs/config-schema.md` | Full table (canonical) |
| `docs/ARCHITECTURE.md`  | Cross-reference link   |
| `README.md`             | Brief mention + link   |
| `router/src/main.ts`    | Optional: link to docs |
| `router/src/diff.ts`    | Optional: link to docs |

**Target**: 3 or fewer locations with full precedence details (down from 5)

## Manual Testing

### Test 1: Pattern Normalization Understanding

After reading the new documentation, you should be able to answer:

1. What does `build` match? (Answer: `**/build` — matches `build/`, `src/build/`, `build/output.js`)
2. What does `/build` match? (Answer: `build` at repo root only)
3. What does `build/` match? (Answer: `**/build/**` — directory and all contents anywhere)

### Test 2: Bare Segment Prediction

Given pattern `vendor`, predict which paths are excluded:

| Path                  | Excluded?                 |
| --------------------- | ------------------------- |
| `vendor/lib.js`       | ✅ Yes                    |
| `src/vendor/local.js` | ✅ Yes                    |
| `vendors/list.txt`    | ❌ No (different segment) |

### Test 3: Negation Configuration

Write a `.reviewignore` that:

- Excludes all generated files in `src/generated/`
- Keeps `src/generated/important.ts` for review

Expected answer:

```gitignore
src/generated/
!src/generated/important.ts
```

## Success Criteria Validation

| Criterion                              | Verification Method    |
| -------------------------------------- | ---------------------- |
| SC-001: Users predict pattern behavior | Test 1 above           |
| SC-002: ≤3 precedence locations        | Cross-reference count  |
| SC-003: All 3 gaps addressed           | Checklist sections 1-3 |
| SC-004: Negation patterns work         | Test 3 above           |
| SC-005: Transformation table complete  | Checklist section 1    |
