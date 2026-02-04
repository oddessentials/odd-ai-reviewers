# Research: Local Review Improvements

**Feature**: 001-local-review-improvements
**Date**: 2026-02-03

## 1. Commander.js Alias Mechanism

### Decision

Use Commander's `.alias()` method on the existing `local` command to add `local-review`.

### Rationale

- Commander.js supports aliases natively via `.alias('name')` method
- Aliases share the same action handler, options, and help text
- Help output automatically shows aliases (e.g., `local|local-review`)
- Exit codes, error handling, and behavior are guaranteed identical
- No additional command registration needed

### Alternatives Considered

1. **Duplicate command definition**: Rejected—violates DRY, risk of divergence
2. **Wrapper command**: Rejected—adds maintenance overhead, complex testing
3. **Programmatic redirection**: Rejected—complicates help text, completion

### Implementation Pattern

```typescript
// router/src/main.ts
program
  .command('local')
  .alias('local-review') // Single line addition
  .description('Run AI review on local changes');
// ... existing options
```

---

## 2. Range Operator Parsing Strategy

### Decision

Implement explicit operator scan: check for `...` first, then `..`. Reject inputs with multiple operators.

### Rationale

- Three-dot (`...`) must be checked before two-dot (`..`) to avoid false partial matches
- `indexOf('...')` returns -1 if not found; if found, split there
- If no `...`, then check for `..`
- Count total operator occurrences to detect `a..b..c` patterns
- Validation happens before any git calls (fail-fast)

### Algorithm

```
1. Count occurrences of '...' in input
2. Count occurrences of '..' in input (subtract 3-dot count to avoid double-counting)
3. If total operators > 1: REJECT "multiple operators"
4. If '...' found: split on first '...'
5. Else if '..' found: split on first '..'
6. Else: single ref (base only, head defaults to HEAD)
7. Trim both parts; reject if either is empty
```

### Alternatives Considered

1. **Regex-based parsing**: Rejected—harder to reason about, edge cases
2. **Split on '.'**: Rejected—fundamentally broken for refs containing dots
3. **State machine**: Rejected—overengineered for this use case

---

## 3. Error Classification Design

### Decision

Create distinct error codes for malformed ranges (validation) vs invalid refs (git).

### Rationale

- Malformed range: syntactic error, caught before git calls
- Invalid ref: semantic error, caught by git validation
- Distinct error classes enable targeted error messages and testing
- Prevents user confusion ("my branch exists, why format error?")

### Error Codes (extending existing ValidationError)

```typescript
// Validation phase (before git)
VALIDATION_MALFORMED_RANGE_MULTIPLE_OPERATORS = 'VALIDATION_MALFORMED_RANGE_MULTIPLE_OPERATORS';
VALIDATION_MALFORMED_RANGE_EMPTY_REF = 'VALIDATION_MALFORMED_RANGE_EMPTY_REF';
VALIDATION_MALFORMED_RANGE_MISSING_REFS = 'VALIDATION_MALFORMED_RANGE_MISSING_REFS';

// Git phase (after validation passes)
VALIDATION_INVALID_GIT_REF = 'VALIDATION_INVALID_GIT_REF';
```

### User-Facing Messages

- Multiple operators: `"Invalid range format: multiple operators found in 'main..feature..extra'. Use 'base..head' or 'base...head'."`
- Empty ref: `"Invalid range format: empty reference in '..'. Both base and head refs are required."`
- Missing refs: `"Invalid range format: '...' requires at least one reference."`
- Invalid git ref: `"Git reference not found: 'nonexistent-branch'. Verify the branch or commit exists."`

---

## 4. ResolvedDiffMode Type Design

### Decision

Introduce `ResolvedDiffMode` discriminated union to enforce diff-mode invariant.

### Rationale

- Current code has implicit mode selection scattered across conditionals
- Explicit union type makes all modes visible at compile time
- Impossible to reach `getLocalDiff()` with undefined mode
- Programmer error (not user error) if invariant violated

### Type Definition

```typescript
type ResolvedDiffMode =
  | { mode: 'staged' }
  | { mode: 'uncommitted' }
  | { mode: 'range'; rangeSpec: string; operator: '..' | '...' };

function assertDiffModeResolved(
  mode: ResolvedDiffMode | undefined
): asserts mode is ResolvedDiffMode {
  if (!mode) {
    throw new Error(
      'INVARIANT VIOLATION: No diff mode resolved. ' +
        'This is a programmer error—options parsing should guarantee a mode is set.'
    );
  }
}
```

### Alternatives Considered

1. **Optional with runtime check**: Current approach—works but not type-safe
2. **Default mode**: Rejected—could hide bugs, unexpected behavior
3. **Fail silently**: Rejected—violates constitution principle V (deterministic outputs)

---

## 5. resolveBaseRef API Status

### Decision

Remove `resolveBaseRef` from public exports; it has no external consumers.

### Research Findings

- **Internal usage audit**:
  - `resolveBaseRef` defined in `local-review-options.ts:269-283`
  - Exported via `router/src/cli/options/index.ts`
  - Called only by `resolveDiffRange` internally
  - No other internal callers found
- **External usage audit**:
  - No npm package consumers (not published)
  - No documentation references
  - No test files use it directly
- **Conclusion**: Safe to remove from exports

### Implementation

1. Remove export from `router/src/cli/options/index.ts`
2. Keep function as private (unexported) in `local-review-options.ts`
3. Add test asserting `resolveBaseRef` is not in module exports

### Alternatives Considered

1. **Keep as deprecated wrapper**: Rejected—no consumers, unnecessary complexity
2. **Delete entirely**: Considered—kept as private for potential future use

---

## 6. Test Helper Design: makeTempRepo

### Decision

Create centralized `makeTempRepo()` helper with automatic cleanup via Vitest hooks.

### Rationale

- Current tests use manual `mkdtempSync`/`rmSync` in try-finally
- If test fails before finally, cleanup may not run
- Vitest's `afterEach`/`afterAll` hooks guarantee cleanup
- Single helper ensures consistency across test files
- Backstop cleanup catches escaped temp dirs

### API Design

```typescript
// router/tests/helpers/temp-repo.ts
interface TempRepo {
  path: string; // Absolute path to temp directory
  cleanup: () => void; // Manual cleanup (for early cleanup if needed)
}

interface TempRepoOptions {
  initGit?: boolean; // Default: true - initialize git repo
  initialCommit?: boolean; // Default: false - create initial commit
}

function makeTempRepo(options?: TempRepoOptions): TempRepo;

// Automatically registers:
// - afterEach: cleanup this test's temp dirs
// - afterAll: verify temp root is empty (backstop)
```

### Implementation Notes

- Use `os.tmpdir()` as base (cross-platform)
- Create unique subdirectory per test file
- Track all created dirs in WeakMap keyed by test context
- Backstop assertion: `expect(readdirSync(tempRoot)).toHaveLength(0)`

---

## 7. Config Error Path Coverage

### Decision

Add comprehensive tests for all config loading error conditions.

### Error Scenarios to Cover

| Scenario          | Error Type  | Code             | Test Approach                                |
| ----------------- | ----------- | ---------------- | -------------------------------------------- |
| File missing      | ConfigError | FILE_NOT_FOUND   | Create path, don't write file                |
| Deletion race     | ConfigError | FILE_NOT_FOUND   | Write file, delete in setTimeout before read |
| Permission denied | ConfigError | FILE_UNREADABLE  | chmod 000 (skip on Windows)                  |
| Malformed YAML    | ConfigError | YAML_PARSE_ERROR | Write invalid YAML syntax                    |
| Schema validation | ConfigError | INVALID_SCHEMA   | Write valid YAML, invalid schema             |

### Test Pattern

```typescript
describe('config error handling', () => {
  it('returns FILE_NOT_FOUND for missing config', async () => {
    const result = await loadConfigFromPath('/nonexistent/path.yml');
    expect(result).toMatchObject({
      error: {
        code: ConfigErrorCode.FILE_NOT_FOUND,
        message: expect.stringContaining('not found'),
      },
    });
  });
  // ... more tests
});
```

---

## 8. Documentation Updates

### Decision

Document range operators in both CLI help text and README.

### CLI Help Text Addition

```text
Options:
  --range <spec>    Diff range (e.g., 'main...HEAD', 'HEAD~3..HEAD')
                    Operators:
                      ... (default) - Compare against merge-base (feature branch changes only)
                      ..            - Compare against base directly (may include merge commits)
```

### README Section

```markdown
## Range Operators

The `--range` option supports two operators:

| Operator | Meaning                           | Use Case                                         |
| -------- | --------------------------------- | ------------------------------------------------ |
| `...`    | Symmetric difference (merge-base) | Review only changes introduced on feature branch |
| `..`     | Direct comparison                 | Review all changes including merged commits      |

The default operator is `...` (three-dot), which shows only the changes introduced on the current branch since it diverged from the base. This is typically what you want for code review.

Example:

- `--range main...HEAD` - Changes on current branch since diverging from main
- `--range main..HEAD` - All commits reachable from HEAD but not main
- `--range HEAD~3` - Last 3 commits (defaults to `HEAD~3...HEAD`)
```

---

## Summary: All Clarifications Resolved

| Item                 | Status      | Resolution                                  |
| -------------------- | ----------- | ------------------------------------------- |
| Commander.js alias   | ✅ Resolved | Use `.alias()` method                       |
| Range parsing        | ✅ Resolved | Explicit operator scan, reject multiple     |
| Error classification | ✅ Resolved | Distinct codes for validation vs git errors |
| Diff-mode invariant  | ✅ Resolved | `ResolvedDiffMode` union type               |
| resolveBaseRef API   | ✅ Resolved | Remove from exports                         |
| Test cleanup         | ✅ Resolved | `makeTempRepo()` helper                     |
| Config error tests   | ✅ Resolved | 5 scenarios identified                      |
| Documentation        | ✅ Resolved | CLI help + README updates                   |
