# Contract: Framework Pattern Matcher

**Type**: Internal module contract
**Source**: `router/src/report/framework-pattern-filter.ts`
**Consumers**: `report.ts`, `adapter.ts`, `local-review.ts` (after FR-018)

## Interface

```typescript
interface FrameworkPatternMatcher {
  readonly id: string; // T019–T026
  readonly name: string; // Human-readable name
  readonly messagePattern: RegExp; // Finding message regex (case-insensitive)
  readonly evidenceValidator: (
    diffContent: string,
    finding: Finding,
    nearbyLines: string[],
    fileDiffSection: string
  ) => boolean;
  readonly suppressionReason: string;
}
```

## Matcher Table (Post-415)

| ID       | Name                                | Message Pattern                                                                     | Evidence Required                                            |
| -------- | ----------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| T019     | Express Error Middleware            | `/unused.*param\|declared.*never.*ref\|dead code.*never.*called\|param.*not.*ref/i` | 4-param function + Express indicator                         |
| T020     | TypeScript Underscore Prefix        | `/unused.*_\|underscore.*prefix/i`                                                  | `_`-prefixed identifier in nearby lines                      |
| T021     | Exhaustive Switch (assertNever)     | `/missing.*default\|non-?exhaustive/i`                                              | `assertNever()` or exhaustive throw in switch                |
| T022     | React Query Deduplication           | `/duplicate.*fetch\|double.*fetch\|redundant.*request/i`                            | Query library import + hook call + no raw HTTP               |
| T023     | Promise.allSettled Order            | `/allSettled.*order\|result.*order.*allSettled/i`                                   | `Promise.allSettled(` + `result.status` access               |
| **T025** | **Safe Local File Read**            | `/path.*travers\|directory.*travers\|file.*inclusion/i`                             | Canonical regex match in nearby lines (single-line only)     |
| **T026** | **Exhaustive Type-Narrowed Switch** | `/missing.*(?:case\|default)\|no.*default\|add.*default\|non-?exhaustive/i`         | `switch` keyword + TypeScript union type declaration in diff |

## Invariants

1. **Closed table**: Only matchers listed in the `FRAMEWORK_MATCHERS` array are evaluated. No dynamic loading.
2. **First-match-wins**: Each finding is evaluated against matchers in array order. The first match suppresses it.
3. **Evidence-required**: `messagePattern` match alone NEVER suppresses. `evidenceValidator` must also return true.
4. **Diff-text only**: Evidence validators operate on diff text strings only. No API calls, no AST parsing, no PR metadata.
5. **Safety constraints**: Each matcher MUST have safety constraints that prevent suppressing genuine security findings.

## Test Requirements

Each matcher MUST have:

- 1+ positive test (evidence present → suppressed)
- 1+ negative test (evidence absent → pass-through)
- 1 test per rejection-list item (for T025: 8 items)
- 1 safety constraint test
- 1 alias/edge-case test
