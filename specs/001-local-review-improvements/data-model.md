# Data Model: Local Review Improvements

**Feature**: 001-local-review-improvements
**Date**: 2026-02-03

## Type Definitions

### 1. ResolvedDiffMode (new)

Discriminated union representing the three possible diff modes after CLI option resolution.

```typescript
/**
 * Represents a resolved diff mode after CLI option parsing.
 * Exactly one mode must be selected; undefined is a programmer error.
 */
export type ResolvedDiffMode =
  | { readonly mode: 'staged' }
  | { readonly mode: 'uncommitted' }
  | { readonly mode: 'range'; readonly rangeSpec: string; readonly operator: RangeOperator };

export type RangeOperator = '..' | '...';

/**
 * Type guard for ResolvedDiffMode.
 */
export function isResolvedDiffMode(value: unknown): value is ResolvedDiffMode {
  if (!value || typeof value !== 'object') return false;
  const mode = (value as { mode?: unknown }).mode;
  return mode === 'staged' || mode === 'uncommitted' || mode === 'range';
}

/**
 * Assertion function for diff mode invariant.
 * Throws programmer error if mode is undefined.
 */
export function assertDiffModeResolved(
  mode: ResolvedDiffMode | undefined,
  context?: string
): asserts mode is ResolvedDiffMode {
  if (!mode) {
    throw new Error(
      `INVARIANT VIOLATION: No diff mode resolved${context ? ` (${context})` : ''}. ` +
        'This is a programmer error—options parsing must guarantee a mode is set.'
    );
  }
}
```

**Location**: `router/src/cli/options/local-review-options.ts` (or new `types/diff-mode.ts`)

---

### 2. RangeParseResult (new)

Result type for range string parsing, separating validation from git operations.

```typescript
/**
 * Successful parse result from range string.
 */
export interface ParsedRange {
  readonly baseRef: string;
  readonly headRef: string | undefined; // undefined = defaults to HEAD
  readonly operator: RangeOperator;
}

/**
 * Range validation error details.
 */
export interface RangeValidationError {
  readonly code: RangeErrorCode;
  readonly message: string;
  readonly input: string;
}

export enum RangeErrorCode {
  MULTIPLE_OPERATORS = 'MULTIPLE_OPERATORS',
  EMPTY_BASE_REF = 'EMPTY_BASE_REF',
  EMPTY_HEAD_REF = 'EMPTY_HEAD_REF',
  MISSING_REFS = 'MISSING_REFS',
}

/**
 * Result type for range parsing.
 */
export type RangeParseResult =
  | { readonly ok: true; readonly value: ParsedRange }
  | { readonly ok: false; readonly error: RangeValidationError };
```

**Location**: `router/src/cli/options/local-review-options.ts`

---

### 3. ValidationErrorCode Extensions (modify existing)

New error codes for range validation failures.

```typescript
// Add to existing ValidationErrorCode enum in router/src/types/errors.ts

export enum ValidationErrorCode {
  // ... existing codes ...

  // Range validation errors (validation phase - before git)
  MALFORMED_RANGE_MULTIPLE_OPERATORS = 'VALIDATION_MALFORMED_RANGE_MULTIPLE_OPERATORS',
  MALFORMED_RANGE_EMPTY_REF = 'VALIDATION_MALFORMED_RANGE_EMPTY_REF',
  MALFORMED_RANGE_MISSING_REFS = 'VALIDATION_MALFORMED_RANGE_MISSING_REFS',

  // Git ref validation errors (git phase - after validation)
  INVALID_GIT_REF = 'VALIDATION_INVALID_GIT_REF',
}
```

**Location**: `router/src/types/errors.ts`

---

### 4. ResolvedDiffRange (modify existing)

Updated interface for resolved diff range with explicit operator.

```typescript
/**
 * Resolved diff range ready for git operations.
 * All validation has passed; refs are syntactically valid.
 */
export interface ResolvedDiffRange {
  readonly baseRef: string;
  readonly headRef: string; // Never undefined after resolution
  readonly operator: RangeOperator;
}

/**
 * Result type for diff range resolution.
 */
export type ResolveDiffRangeResult = Result<ResolvedDiffRange, ValidationError>;
```

**Location**: `router/src/cli/options/local-review-options.ts`

---

### 5. TempRepo (new)

Interface for test helper managing temporary git repositories.

```typescript
/**
 * Represents a temporary repository for testing.
 */
export interface TempRepo {
  /** Absolute path to the temporary directory */
  readonly path: string;

  /** Manually trigger cleanup (for early cleanup scenarios) */
  readonly cleanup: () => void;
}

/**
 * Options for creating a temporary repository.
 */
export interface TempRepoOptions {
  /** Initialize as a git repository (default: true) */
  readonly initGit?: boolean;

  /** Create an initial commit (default: false) */
  readonly initialCommit?: boolean;

  /** Files to create in the repo (path -> content) */
  readonly files?: Record<string, string>;
}

/**
 * Factory function signature for makeTempRepo.
 */
export type MakeTempRepo = (options?: TempRepoOptions) => TempRepo;
```

**Location**: `router/tests/helpers/temp-repo.ts`

---

### 6. LocalDiffOptions (modify existing)

Extended options interface with explicit mode resolution.

```typescript
/**
 * Options for local diff generation.
 */
export interface LocalDiffOptions {
  /** Diff staged changes only */
  readonly stagedOnly?: boolean;

  /** Diff uncommitted changes (working tree vs HEAD) */
  readonly uncommitted?: boolean;

  /** Base reference for range diff */
  readonly baseRef?: string;

  /** Head reference for range diff */
  readonly headRef?: string;

  /** Range operator (default: '...') */
  readonly rangeOperator?: RangeOperator;

  /** Resolved diff mode (computed from above options) */
  readonly resolvedMode?: ResolvedDiffMode;
}
```

**Location**: `router/src/diff.ts`

---

## Entity Relationships

```
┌─────────────────────────┐
│   CLI Options Parsing   │
└───────────┬─────────────┘
            │ parse
            ▼
┌─────────────────────────┐
│    RangeParseResult     │──── fail ──▶ RangeValidationError
└───────────┬─────────────┘              (before git calls)
            │ ok
            ▼
┌─────────────────────────┐
│    ResolvedDiffRange    │
└───────────┬─────────────┘
            │ compute mode
            ▼
┌─────────────────────────┐
│    ResolvedDiffMode     │──── invariant ──▶ Programmer Error
└───────────┬─────────────┘                   (assertDiffModeResolved)
            │
            ▼
┌─────────────────────────┐
│     LocalDiffOptions    │──── pass to ──▶ getLocalDiff()
└─────────────────────────┘
            │
            ▼
┌─────────────────────────┐
│  Git Ref Validation     │──── fail ──▶ ValidationError
└───────────┬─────────────┘              (INVALID_GIT_REF)
            │ ok
            ▼
┌─────────────────────────┐
│      DiffSummary        │
└─────────────────────────┘
```

---

## State Transitions

### Range Parsing State Machine

```
                    INPUT
                      │
                      ▼
              ┌───────────────┐
              │ Count '...'   │
              │ Count '..'    │
              └───────┬───────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
    operators > 1  operators = 1  operators = 0
         │            │            │
         ▼            │            ▼
    REJECT:           │       SINGLE REF
    MULTIPLE_         │       (base only)
    OPERATORS         │            │
                      ▼            │
              ┌───────────────┐    │
              │ Split on op   │    │
              └───────┬───────┘    │
                      │            │
              ┌───────┴───────┐    │
              ▼               ▼    │
          base part      head part │
              │               │    │
              ▼               ▼    │
          trim + check   trim + check
              │               │    │
         ┌────┴────┐    ┌────┴────┐│
         ▼         ▼    ▼         ▼▼
       empty    valid  empty    valid
         │         │     │         │
         ▼         │     ▼         │
    REJECT:        │  ACCEPT:      │
    EMPTY_REF      │  headRef=     │
                   │  undefined    │
                   │               │
                   └───────┬───────┘
                           ▼
                       ACCEPT:
                    ParsedRange
```

---

## Validation Rules

### Range String Validation

| Rule                            | Check                                     | Error Code         |
| ------------------------------- | ----------------------------------------- | ------------------ |
| No multiple operators           | `count('...') + count('..') <= 1`         | MULTIPLE_OPERATORS |
| Base ref non-empty              | `baseRef.trim().length > 0`               | EMPTY_BASE_REF     |
| Head ref non-empty (if present) | `headRef?.trim().length > 0`              | EMPTY_HEAD_REF     |
| At least one ref                | `'...' or '..' requires adjacent content` | MISSING_REFS       |

### Git Ref Validation (post-parse)

| Rule        | Check                                   | Error Code            |
| ----------- | --------------------------------------- | --------------------- |
| Ref exists  | `git rev-parse --verify <ref>` succeeds | INVALID_GIT_REF       |
| Ref is safe | Passes `assertSafeGitRef()`             | (existing validation) |

---

## Notes

- All new types use `readonly` properties for immutability
- Result types follow existing `Ok`/`Err` pattern from `router/src/types/result.ts`
- Error codes follow existing naming convention (`VALIDATION_*`)
- Test helper types are test-only, not exported from main package
