# Research: .reviewignore Documentation Improvements

**Date**: 2026-01-27
**Feature**: 001-reviewignore-docs

## Pattern Normalization Implementation Analysis

### Source: `router/src/reviewignore.ts:169-210`

The `normalizePattern()` function transforms user-written patterns into internal matching patterns. This analysis documents the exact transformations for accurate documentation.

### Normalization Rules

| User Pattern      | Internal Pattern   | Rule Applied                                         |
| ----------------- | ------------------ | ---------------------------------------------------- |
| `node_modules`    | `**/node_modules`  | Bare name → match anywhere                           |
| `/config.js`      | `config.js`        | Leading `/` stripped → root-relative only            |
| `dist/`           | `**/dist/**`       | Trailing `/` + bare name → recursive directory match |
| `src/generated`   | `src/generated`    | Path separator present → path-relative (no prefix)   |
| `./src/file.ts`   | `src/file.ts`      | Leading `./` stripped                                |
| `**/vendor`       | `**/vendor`        | Already starts with `**/` → no change                |
| `/src/generated/` | `src/generated/**` | Leading `/` stripped + trailing `/` → `/**`          |

### Decision Logic (from code)

1. **Remove leading `./`** if present
2. **Check for leading `/`** (root-relative marker) — store flag, then strip
3. **Check for "real" path separator** — slash that isn't trailing (e.g., `src/` has no real separator, `src/foo` does)
4. **Check for leading `**`\*\* — already recursive
5. **Convert trailing `/`** to `/**` for directory recursive matching
6. **Add `**/` prefix\*\* if:
   - No real path separator, AND
   - Not originally root-relative, AND
   - Doesn't already start with `**`

### Bare Segment Matching

**Source**: `router/src/reviewignore.ts:320-333` (`isBareSegmentPattern`) and `router/src/reviewignore.ts:371-379`

Bare segment patterns receive special handling:

1. Pattern must match `**/name` where `name` has no `/`, `*`, `?`, or `[`
2. For bare segments, BOTH matchers are checked:
   - `**/name` — matches the directory/file itself
   - `**/name/**` — matches contents (compiled as `_contentsMatcher`)
3. This is OR logic — either match counts as the pattern matching

**Example**: Pattern `node_modules` normalizes to `**/node_modules`

| File Path                        | Matches? | Reason                                                      |
| -------------------------------- | -------- | ----------------------------------------------------------- |
| `node_modules`                   | ✅ Yes   | Exact match via `**/node_modules`                           |
| `node_modules/lodash/index.js`   | ✅ Yes   | Contents match via `**/node_modules/**`                     |
| `src/node_modules/local/file.js` | ✅ Yes   | Nested match via `**/node_modules` and `**/node_modules/**` |
| `node_modules_backup/file.js`    | ❌ No    | `**/node_modules` doesn't match partial segments            |

### Negation Behavior

**Source**: `router/src/reviewignore.ts:121-133`

1. Negation patterns start with `!`
2. The `!` is stripped and remaining pattern is normalized normally
3. Negated patterns can ONLY re-include files that would otherwise be excluded
4. **Last match wins** — if a later negated pattern matches, the file is re-included

**Example**:

```gitignore
node_modules           # Exclude all node_modules contents
!node_modules/keep.js  # Re-include this specific file
```

### Filter Precedence

**Source**: Multiple documentation files (redundant)

Current documentation locations:

1. `docs/config-schema.md:174-181` — Detailed table (CANONICAL)
2. `docs/ARCHITECTURE.md:65-71` — Duplicate table
3. `README.md:209` — Brief mention in flow
4. `router/src/main.ts` — Code comment
5. `router/src/diff.ts` — Code comment

**Consolidation Decision**: Keep `docs/config-schema.md` as canonical, add cross-references elsewhere.

## Alternatives Considered

### For Pattern Documentation

| Option                          | Decision | Rationale                                                          |
| ------------------------------- | -------- | ------------------------------------------------------------------ |
| Document all minimatch options  | Rejected | Too technical, users don't need to know minimatch internals        |
| Link to gitignore man page      | Adopted  | Reference for advanced patterns not covered                        |
| Inline all transformation rules | Adopted  | Users need to understand normalization to write effective patterns |

### For Redundancy Reduction

| Option                       | Decision | Rationale                                   |
| ---------------------------- | -------- | ------------------------------------------- |
| Remove all duplicates        | Rejected | Some context is useful at point of use      |
| Keep duplicates in sync      | Rejected | Maintenance burden too high (5 locations)   |
| Canonical + cross-references | Adopted  | Single source of truth with navigation aids |

## Implementation Notes

### Pattern Normalization Section Location

Insert after the existing `.reviewignore` syntax section in `docs/config-schema.md`, before "Filter Precedence".

### Bare Segment Expansion Location

Expand the existing "Bare names match anywhere" comment in the syntax section with a detailed example table.

### Negation Example Location

Add to the existing "Example `.reviewignore`" section with a practical use case.

### Cross-Reference Format

```markdown
> 📖 For detailed filter precedence, see [Configuration Schema](./config-schema.md#filter-precedence).
```
