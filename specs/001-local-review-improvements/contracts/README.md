# Contracts: Local Review Improvements

**Feature**: 001-local-review-improvements

## Overview

This feature is a CLI enhancement with no external API contracts. All interfaces are internal TypeScript types documented in [data-model.md](../data-model.md).

## Internal Interfaces

The following internal contracts are defined in the data model:

| Interface          | Purpose                            | Location                                         |
| ------------------ | ---------------------------------- | ------------------------------------------------ |
| `ResolvedDiffMode` | Discriminated union for diff modes | `router/src/cli/options/local-review-options.ts` |
| `RangeParseResult` | Result type for range parsing      | `router/src/cli/options/local-review-options.ts` |
| `TempRepo`         | Test helper interface              | `router/tests/helpers/temp-repo.ts`              |

## CLI Contract

The CLI interface remains unchanged except for the addition of the `local-review` alias:

```
ai-review local [options] <path>
ai-review local-review [options] <path>  # NEW ALIAS
```

Both commands accept identical options and produce identical behavior.
