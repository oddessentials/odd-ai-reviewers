# Next Steps

Improvements identified during code review that require further consideration.

## CLI Command Naming

### 7. Consider adding `local-review` alias for discoverability

**File:** `router/src/main.ts`

The local review command is registered as `local`, not `local-review`. While shorter, this may confuse users who expect the hyphenated form based on documentation or intuition.

**Current behavior:**

- ✅ `ai-review local .` - works
- ✅ `ai-review .` - works (shorthand alias)
- ❌ `ai-review local-review .` - does not work

**Options:**

1. Add `local-review` as an alias to `local` using Commander's `.alias()` method
2. Document clearly that the command is `local`, not `local-review`
3. Keep as-is if the shorter name is preferred

## Local Review Range/Head Handling

### 1. Consolidate `resolveBaseRef` into `resolveDiffRange`

**File:** `router/src/cli/options/local-review-options.ts`

The `resolveBaseRef()` function is still exported but `resolveDiffRange()` is now the preferred API. Consider:

- Checking if `resolveBaseRef` is used externally
- If not, deprecate or remove the export from `index.ts`
- If used externally, add a deprecation notice pointing to `resolveDiffRange`

### 2. Add negative tests for malformed range strings

**File:** `router/tests/unit/cli/commands/local-review.test.ts`

Missing test coverage for edge cases:

- Range with multiple operators: `"main..feature..extra"`
- Empty range: `".."`
- Range with only operator: `"..."`
- Whitespace-only components: `" .. "`

### 3. Improve test cleanup reliability

**File:** `router/tests/unit/cli/commands/local-review.test.ts`

The config loading test uses `mkdtempSync`/`rmSync` for temp directories. If the test fails before the `finally` block, cleanup may not run properly. Consider:

- Using Vitest's `beforeEach`/`afterEach` hooks for setup/teardown
- Using a test utility that guarantees cleanup

### 4. Test `loadConfigFromPath` error handling

**File:** `router/tests/unit/cli/commands/local-review.test.ts`

Missing tests for:

- Race condition: file exists at check time but deleted before read
- Malformed YAML in config file
- Config file that fails schema validation

### 5. Defensive check for undefined `rangeSpec`

**File:** `router/src/diff.ts`

In `getLocalDiff()`, if neither `stagedOnly`, `uncommitted`, nor a base/head range is set, the `rangeSpec` variable will be undefined. While current callers prevent this, adding a defensive check or assertion would prevent silent bugs:

```typescript
// Around line 907-908
} else if (rangeSpec) {
  statusArgs.push(rangeSpec);
} else {
  // This should never happen with valid LocalDiffOptions
  throw new ValidationError('No diff range specified', ...);
}
```

### 6. Document three-dot vs two-dot behavior

**Location:** CLI help text or README

Users familiar with `git log A..B` (two-dot) may be surprised that the default operator is `...` (three-dot, symmetric difference). Consider adding documentation explaining:

- `..` shows commits reachable from HEAD but not from base
- `...` shows commits reachable from either but not both (merge-base comparison)
- Why `...` is the default for code review (shows only changes introduced on the feature branch)
