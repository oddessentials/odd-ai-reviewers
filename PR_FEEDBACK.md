# PR Feedback: 001-local-review-improvements

**Branch:** `001-local-review-improvements`
**Base:** `main`
**Files Changed:** 83
**Lines Changed:** +13,448 / -514
**Review Date:** 2026-02-03

This document organizes code review feedback for remediation. Issues are grouped by category and severity.

---

## Summary

| Severity | Count |
| -------- | ----- |
| Critical | 2     |
| High     | 8     |
| Medium   | 29    |
| Low      | 25    |

**AI Review:** gpt-4.1 via OpenCode agent ($0.03 estimated cost)

---

## Critical Issues

### C-001: Misconfigured CHANGELOG.md Path in .releaserc.json

**File:** `.releaserc.json:43, 57`
**Type:** Configuration Error

The `@semantic-release/changelog` plugin is incorrectly configured to write to `router/CHANGELOG.md`:

```json
"changelogFile": "router/CHANGELOG.md"
```

CHANGELOG.md belongs in the repository root, not inside a subdirectory. The root `CHANGELOG.md` already exists.

**Fix:** Update `.releaserc.json`:

1. Line 43: Change `"changelogFile": "router/CHANGELOG.md"` to `"changelogFile": "CHANGELOG.md"`
2. Line 57: Change git assets from `"router/CHANGELOG.md"` to `"CHANGELOG.md"`
3. Line 133 in `release.yml`: Update verification path accordingly

---

### C-002: Deprecated Workflow File Still Exists

**File:** `.github/workflows/npm-publish.yml:1-3`
**Type:** Dead Code

The entire workflow is marked DEPRECATED with a TODO to remove after validating semantic-release. This file:

- Consumes CI minutes if triggered via `workflow_dispatch`
- Creates confusion about which release process is active
- Has an unreachable primary trigger (release event is commented out)

**Fix:** Delete `.github/workflows/npm-publish.yml` entirely.

---

## High Severity Issues

### H-001: Unsafe Error Type Casting in Dependency Checker

**File:** `router/src/cli/dependencies/checker.ts:70`
**Type:** Type Safety

```typescript
const error = err as NodeJS.ErrnoException;
```

This assumes the caught error has a `code` property without runtime validation. If the error is not a `NodeJS.ErrnoException`, accessing `error.code` could fail or return undefined.

**Fix:** Add type guard:

```typescript
if ('code' in error && typeof error.code === 'string') {
  // Safe to access error.code
}
```

---

### H-002: Uncaught Error Types in loadConfigWithFallback

**File:** `router/src/cli/commands/local-review.ts:792-823`
**Type:** Error Handling

The function catches `NoCredentialsError` specifically but uses generic type assertion for other errors:

```typescript
const errorMsg = error instanceof Error ? error.message : String(error);
```

Non-Error throws aren't explicitly handled, and subsequent code paths assume type safety.

**Fix:** Immediately rethrow if error is not an Error instance, or wrap in a standard Error.

---

### H-003: Shell Injection Risk via sed Command

**File:** `.github/workflows/release.yml:115`
**Type:** Security

```bash
TAG_VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')
```

If a git tag contains special regex characters, `sed` will fail or behave unexpectedly.

**Fix:** Use parameter expansion instead:

```bash
TAG_FULL=$(git describe --tags --abbrev=0)
TAG_VERSION="${TAG_FULL#v}"
```

---

### H-004: Third-Party Action Secrets Exposure Risk

**File:** `.github/workflows/badge-update.yml:113, 121`
**Type:** Security

Using `secrets.GIST_TOKEN` with third-party action `exuanbo/actions-deploy-gist@v1`:

- Third-party actions can log or expose secrets
- Not pinned to commit SHA (vulnerable to supply chain attacks)

**Fix:**

1. Pin to specific commit SHA: `exuanbo/actions-deploy-gist@<commit-sha>`
2. Consider using GitHub's official gist API via `github-script` action

---

### H-005: Skipped Integration Tests Blocking Coverage

**File:** `router/tests/integration/local-review-cli.test.ts:110-117`
**Type:** Test Coverage

Two critical integration tests are skipped:

```typescript
it.skip('ai-review local . executes with exit code 0', async () => {
  // Requires valid git repo with changes
});
```

No implementation exists for real repo integration testing.

**Fix:** Implement these tests or document why they're not implementable.

---

### H-006: Breaking Change Footer Not Detected

**File:** `.releaserc.json:15`
**Type:** Configuration

Breaking change rule only checks `"breaking": true` flag. Commits with `BREAKING CHANGE:` footer won't trigger major version bumps.

**Fix:** Add footer-based detection:

```json
{ "footer": "BREAKING CHANGE", "release": "major" }
```

---

### H-007: OpenAI SDK Incompatible with Newer Models (gpt-5.x)

**File:** `router/src/agents/opencode.ts` (OpenAI API call)
**Type:** API Compatibility

The OpenCode agent uses `max_tokens` parameter which is not supported by newer OpenAI models (gpt-5.x). These models require `max_completion_tokens` instead.

Error observed:

```
400 Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.
```

**Fix:** Update the OpenAI SDK call to use `max_completion_tokens` for newer models, or detect model version and use the appropriate parameter.

---

### H-008: Semgrep Fails on Windows Due to Python Encoding Issue

**File:** `router/src/agents/semgrep.ts` (Semgrep agent)
**Type:** Platform Compatibility

Semgrep fails on Windows with Python's cp1252 codec when fetching rules containing Unicode characters (U+202A left-to-right embedding).

Error observed:

```
UnicodeEncodeError: 'charmap' codec can't encode character '\u202a' in position 1384938: character maps to <undefined>
File "...\semgrep\config_resolver.py", line 978, in parse_config_string
    fp.write(contents)
```

This blocks the entire `static` pass when `required: true`, preventing any review from completing on Windows.

**Impact:** Windows users cannot run local reviews with the default `.ai-review.yml` configuration.

**Avoidance Options (not fixes):**

1. Use `.ai-review-local.yml` which skips static analysis entirely
2. Mark static pass as `required: false` to allow review to continue without Semgrep

**Potential Fix (untested):**

Set `PYTHONUTF8=1` environment variable before running Semgrep to force UTF-8 encoding.

**Recommended Fix:**

1. Set `PYTHONUTF8=1` in the Semgrep agent spawn environment
2. Document Windows limitation in local-review docs if fix doesn't work
3. Improve graceful degradation when static tools fail on specific platforms

---

## Medium Severity Issues

### M-001: Repeated Diff Loading Logic (DRY Violation)

**File:** `router/src/cli/commands/local-review.ts:428-439, 629-640, 895-906`
**Type:** Code Duplication

The diff loading pattern is repeated three times in `executeDryRun()`, `executeCostOnly()`, and `runLocalReview()`.

**Fix:** Extract to helper function:

```typescript
function loadDiffWithReviewIgnore(
  repoRoot: string,
  diffRange: ResolvedDiffRange,
  options: LocalReviewOptions,
  reviewIgnoreResult: ReviewIgnoreResult,
  deps: LocalReviewDependencies
): DiffSummary;
```

---

### M-002: Missing Error Code Coverage in Dependency Checker

**File:** `router/src/cli/dependencies/checker.ts:69-99`
**Type:** Error Handling

Only handles `ENOENT` and `ETIMEDOUT` error codes. Missing critical platform-specific codes:

- `EACCES` (Permission denied)
- `EISDIR` (Is a directory)
- `ENOEXEC` (Exec format error)
- Windows-specific errors

**Fix:** Add explicit handling for additional error codes or document fallback behavior.

---

### M-003: Inconsistent Range Fallback vs Validation

**File:** `router/src/cli/options/local-review-options.ts:394-396 vs 513-522`
**Type:** Logic Inconsistency

`parseRangeString()` rejects empty base refs (line 513-522), but `resolveDiffRange()` silently falls back to `'HEAD'` for empty refs (line 394-396). This creates unreachable fallback code.

**Fix:** Remove the unreachable fallback code in `resolveDiffRange()` since validation guarantees non-empty refs.

---

### M-004: Silent Error Handling in hasLocalChanges()

**File:** `router/src/diff.ts:1099-1100`
**Type:** Error Handling

```typescript
catch {
  return false;  // Silently returns false on ANY error
}
```

If git fails due to invalid refs, the caller has no idea why.

**Fix:** At minimum, log the error before returning false:

```typescript
catch (error) {
  console.warn('[diff] hasLocalChanges failed:', error);
  return false;
}
```

---

### M-005: Missing repoPath Validation Inconsistency

**File:** `router/src/diff.ts:892, 1075`
**Type:** Security

`getLocalDiff()` and `hasLocalChanges()` do NOT call `assertSafeRepoPath(repoPath)`, but `getDiff()` does (line 284). This creates inconsistency with the security model.

**Fix:** Add `assertSafeRepoPath(repoPath)` to both functions.

---

### M-006: Unhandled All-Passes-Disabled Scenario

**File:** `router/src/cli/commands/local-review.ts:351-359`
**Type:** Edge Case

`filterToRunnablePasses()` can filter out all passes, but doesn't warn. Later code calculates `totalAgents = 0`, which may confuse users.

**Fix:** Add explicit check after filtering and warn if no passes remain.

---

### M-007: Mixed Error Display Paths

**File:** `router/src/cli/commands/local-review.ts:864-889`
**Type:** UX

Two different display functions are used in sequence:

1. `displayDependencyErrors()` for blocking issues
2. `displaySkippedPassWarnings()` for non-blocking
3. `displayDependencyErrors()` again for remaining warnings

The logic is correct but confusing.

**Fix:** Add explicit condition comments or refactor to single display function.

---

### M-008: Unsafe Index Access in buildSkippedPassInfo

**File:** `router/src/cli/commands/local-review.ts:309-346`
**Type:** Type Safety

`getDependenciesForAgent()` return value isn't validated. If it returns an empty array, the inner loop silently completes without adding skip info.

**Fix:** Add explicit empty array check:

```typescript
const agentDeps = getDependenciesForAgent(agent);
if (agentDeps.length === 0) continue;
```

---

### M-009: Incomplete validateErrorWireFormat Recursion

**File:** `router/src/types/errors.ts:60-80`
**Type:** Error Handling

When cause chain exceeds MAX_CAUSE_DEPTH (10), it throws a generic Error that breaks consistency with the error system.

**Fix:** Throw a typed error instead:

```typescript
throw new ConfigError(
  `Error cause chain exceeds maximum depth (${MAX_CAUSE_DEPTH})`,
  ConfigErrorCode.PARSE_ERROR,
  { depth, maxDepth: MAX_CAUSE_DEPTH }
);
```

---

### M-010: Repeated Result Lookup Pattern in Messages

**File:** `router/src/cli/dependencies/messages.ts:128-166`
**Type:** Code Duplication

Same `.find()` pattern repeated 4 times:

```typescript
const result = summary.results.find((r) => r.name === depName);
```

**Fix:** Extract to helper function:

```typescript
function findResult(name: string): DependencyCheckResult | undefined;
```

---

### M-011: Hardcoded Semgrep Version Without Automation

**File:** `.github/workflows/ai-review.yml:98`
**Type:** Maintenance

```bash
run: pip3 install semgrep==1.149.0
```

Version pinned without automation. Comment says "Keep in sync with router/Dockerfile" but no automation exists.

**Fix:** Use Dependabot for Python dependencies or extract version to shared config.

---

### M-012: Dual Changelog Files Conflict

**File:** `.releaserc.json:43, 57`
**Type:** Configuration

Configuration incorrectly targets `router/CHANGELOG.md` while the root `CHANGELOG.md` already exists. This would create two separate changelog files.

**Fix:** Already addressed in C-001 - update `.releaserc.json` to use root `CHANGELOG.md`.

---

### M-013: Unsupported Platform Silent Fallback

**File:** `router/src/cli/dependencies/platform.ts:32-36`
**Type:** Edge Case

Defaults unsupported platforms to 'linux' without warning:

```typescript
default:
  return 'linux';
```

Could provide incorrect install instructions on rare platforms (FreeBSD, Solaris).

**Fix:** Log warning or throw for unsupported platforms.

---

### M-014: Missing Permissions Blocks in CI Jobs

**File:** `.github/workflows/ci.yml` (multiple jobs)
**Type:** Security Best Practice

Several jobs lack explicit permissions declarations:

- `quality` job (line 10)
- `fresh-clone-test` (line 116)
- `bin-resolution-test` (line 172)
- `container-security` (line 216)

**Fix:** Add explicit minimal permissions to ALL jobs.

---

### M-015: Functions Not Tested Directly

**File:** `router/tests/unit/cli/commands/local-review.test.ts`
**Type:** Test Coverage

Multiple helper functions have zero direct test coverage:

- `determineExitCode()` (line 215-236)
- `buildTerminalContext()` (line 254-277)
- `buildAgentContext()` (line 282-303)
- `buildSkippedPassInfo()` (line 309-346)
- `filterToRunnablePasses()` (line 351-359)

**Fix:** Add dedicated unit tests for each helper function.

---

### M-016: Missing Signal Handling Tests

**File:** `router/tests/unit/cli/commands/local-review.test.ts:947-970`
**Type:** Test Coverage

Signal handler setup (SIGINT, SIGTERM) lacks comprehensive testing:

- Actual signal handling not tested
- Cleanup function execution not verified
- Partial results message formatting not tested

**Fix:** Add tests for signal handling scenarios.

---

### M-017: Timeout Not Tested for Dependency Check

**File:** `router/src/cli/dependencies/checker.ts:15`
**Type:** Test Coverage

`VERSION_COMMAND_TIMEOUT = 5000` is hard-coded. No test for actual timeout behavior (only mocked in tests).

**Fix:** Add integration test for actual timeout behavior.

---

### M-018: Release Rules Incomplete

**File:** `.releaserc.json:10-16`
**Type:** Configuration

Commits with types `docs`, `style`, `chore`, `refactor`, `test`, `build`, `ci` will NOT trigger a release despite being listed in release notes configuration.

**Fix:** Consider adding `docs` and `chore` to trigger patch releases if desired.

---

### M-019: Implicit undefined in resolveDiffRange

**File:** `router/src/cli/options/local-review-options.ts:387-409`
**Type:** Type Safety

Function returns default object when range parsing fails but doesn't guarantee operator is set for all code paths.

**Fix:** Add explicit type assertions or refactor to make type guarantees clearer.

---

### M-020: Path Traversal Validation Could Be Stricter

**File:** `router/src/diff.ts:753-762`
**Type:** Security (Defense in Depth)

`assertLocalRef()` blocks literal `..` at line 753, but the `LOCAL_REF_PATTERN` regex could be clearer about what's allowed.

**Fix:** Document regex pattern thoroughly and add explicit tests for edge cases.

---

### M-021: Error Messaging Inconsistency in getLocalDiff

**File:** `router/src/diff.ts:1048-1064`
**Type:** UX

Error messages in `getLocalDiff()` don't include actionable hints like `getDiff()` does (lines 412-423).

**Fix:** Add helpful suggestions like "Possible causes: shallow clone, invalid refs".

---

### M-022: Incomplete Error Type Coverage in parseLocalReviewOptions

**File:** `router/src/cli/options/local-review-options.ts:191-312`
**Type:** Error Handling

Function returns early on validation errors without exhaustively covering all validation paths.

**Fix:** Add explicit assertion that exactly one diff mode is resolved by function end.

---

### M-023: Split Result Unchecked in Messages

**File:** `router/src/cli/dependencies/messages.ts:149-150`
**Type:** Type Safety

```typescript
const depName = warning.split(':')[0];
```

If `depName` doesn't match any result, `result` will be undefined, causing silent fallback.

**Fix:** Add explicit null check and appropriate fallback behavior.

---

### M-024: Windows Error Code Handling Missing

**File:** `router/src/cli/dependencies/checker.ts:69-99`
**Type:** Platform Compatibility

Windows `execFileSync` errors can return different codes. Error handling assumes Unix-style error codes.

**Fix:** Add platform-specific error handling or document Windows limitations.

---

### M-025: Brittle String Matching in Tests

**File:** `router/tests/unit/cli/commands/local-review.test.ts` (multiple lines)
**Type:** Test Quality

Tests use fragile string matching:

```typescript
expect(output).toContain('DRY RUN');
expect(output).toContain('$');
```

**Fix:** Use structured output verification or snapshot testing.

---

### M-026: Non-Zero Exit Code Handling Missing

**File:** `router/src/cli/dependencies/checker.ts:34-40`
**Type:** Edge Case

`execFileSync` can throw for non-zero exit codes, but there's no specific handling for when binary exists but `--version` returns an error.

**Fix:** Distinguish between "binary not found" vs "binary exists but broken".

---

### M-027: Missing Test for .reviewignore Integration

**File:** `router/tests/unit/cli/commands/local-review.test.ts`
**Type:** Test Coverage

Tests don't verify behavior when `.reviewignore` patterns filter files.

**Fix:** Add test case with non-empty `reviewIgnoreResult.patterns`.

---

### M-028: Artifact Retention Policy Inconsistency

**Files:** `.github/workflows/ci.yml:110`, `.github/workflows/ai-review.yml:137`
**Type:** Configuration

Different retention days used:

- ci.yml: 1 day (test results)
- ai-review.yml: 7 days (review results)

**Fix:** Document and standardize retention policies.

---

## Low Severity Issues

### L-001: Missing Optional Chaining Feedback in formatCLIError

**File:** `router/src/cli/output/errors.ts:209-232`
**Type:** Code Clarity

Function accepts both `CLIError | Error`, but lacks explicit type narrowing feedback for readers.

---

### L-002: Repeated Color Initialization

**File:** `router/src/cli/commands/local-review.ts:464-465, 677-678`
**Type:** Minor Inefficiency

Both `formatDryRunOutputPretty` and `formatCostOutput` independently create colorizer instances.

---

### L-003: Inconsistent Error Message Context

**File:** `router/src/cli/dependencies/messages.ts:109-174`
**Type:** Code Clarity

Early return check at line 116-117 is redundant since callers already check conditions.

---

### L-004: Uncaught estimateTokens Errors

**File:** `router/src/cli/commands/local-review.ts:643, 930`
**Type:** Error Handling

`estimateTokens()` calls have no error handling wrapper.

---

### L-005: Missing Null/Undefined Checks on minVersion

**File:** `router/src/cli/dependencies/catalog.ts:19, 32`
**Type:** Type Safety

`minVersion: string | null` in interface but always set in catalog. Fail-open behavior is correct but under-documented.

---

### L-006: Two-Capture-Group Regex Undefined Behavior

**File:** `router/src/cli/dependencies/version.ts:44-85`
**Type:** Edge Case

Two regex patterns exist with different fallback logic. Edge case of 2-capture-group regex not explicitly documented.

---

### L-007: Untagged Docker Image

**File:** `.github/workflows/ci.yml:241`
**Type:** Best Practice

Docker image built with generic `ci` tag. Should include git SHA for traceability.

---

### L-008: Loose Node.js Version String

**File:** `.github/workflows/ci.yml:27, 102, 128, 131, 198`
**Type:** Best Practice

Node.js version specified as `'22'` instead of explicit version `'22.11.0'`.

---

### L-009: GitHub Notifications Disabled

**File:** `.releaserc.json:64-66`
**Type:** Observability

All GitHub comments disabled (`successComment`, `failComment` = false). Should enable failure notifications for debugging.

---

### L-010: No Pre-Release Branch Support

**File:** `.releaserc.json:3`
**Type:** Feature Gap

Only `main` branch configured. No support for alpha/beta pre-release branches.

---

### L-011: Test Names Generated from User Data

**File:** `router/tests/integration/local-review-cli.test.ts:154-159`
**Type:** Test Quality

```typescript
for (const { range, description } of malformedRanges) {
  it(`rejects "${range}" (${description})...`, async () => {
```

Hard to identify which specific range fails in test output.

---

### L-012: Brittle Path Detection in Test Helper

**File:** `router/tests/integration/local-review-cli.test.ts:36-39`
**Type:** Test Quality

```typescript
const routerDir = process.cwd().endsWith('router') ? process.cwd() : join(process.cwd(), 'router');
```

Brittle path detection that could fail in unexpected contexts.

---

### L-013: Missing GitContext Variation in Tests

**File:** `router/tests/unit/cli/options/local-review-options.test.ts:26-32`
**Type:** Test Coverage

All tests reuse same mock GitContext. Missing tests with different `defaultBase` values or special characters in branch names.

---

### L-014: Range Operator Validation Clarity

**File:** `router/src/diff.ts:927-928`
**Type:** Code Clarity

Ternary condition could be clearer:

```typescript
const operator = rangeOperator === '..' || rangeOperator === '...' ? rangeOperator : '...';
```

---

### L-015: Whitespace Edge Cases Not Fully Tested

**File:** `router/tests/unit/cli/options/local-review-options.test.ts:765-773`
**Type:** Test Coverage

Tests validate trimming but don't test tabs, newlines, or unicode whitespace.

---

### L-016: Unsafe stdout.isTTY Access (Actually Safe)

**File:** `router/src/cli/commands/local-review.ts:733`
**Type:** False Positive

Marked as potential issue but actually safe due to `!== false` check.

---

### L-017: Magic Exit Code Numbers in Tests

**File:** `router/tests/integration/local-review-cli.test.ts:158`
**Type:** Test Quality

```typescript
expect(result.exitCode).toBe(2); // ExitCode.INVALID_ARGS
```

Comment documents but test uses magic number instead of constant.

---

### L-018: Path Normalization Edge Case

**File:** `router/src/diff.ts:475-481`
**Type:** Edge Case

Path normalization removes `a/` prefix which could incorrectly modify actual paths starting with `a/`. Unlikely in practice with git diff output.

---

## AI Review Findings (OpenCode Agent - gpt-4.1)

The following suggestions were generated by the OpenCode AI agent reviewing the full diff.

### AI-001: Custom Config Path Behavior Undocumented

**File:** `router/src/cli/commands/local-review.ts:381`
**Type:** Documentation
**Severity:** Low

When loading config from a custom path (`--config`), relative paths in the config are resolved from the config file's directory, not the repo root. This behavior should be documented.

**Fix:** Document that when `--config` is used, relative paths are resolved from the config file's directory.

---

### AI-002: DryRunResult Missing headRef and rangeOperator

**File:** `router/src/cli/commands/local-review.ts:418`
**Type:** API Completeness
**Severity:** Low

In `executeDryRun`, only `baseRef` is included in the `DryRunResult`. The `headRef` and `rangeOperator` are available but not returned.

**Fix:** Add `headRef` and `rangeOperator` to the `DryRunResult` structure for more complete reporting.

---

### AI-003: Cache Key Based on Original Config, Not Filtered

**File:** `router/src/cli/commands/local-review.ts:837`
**Type:** Performance
**Severity:** Low

When filtering config to only include runnable passes, the original `configHash` is still used for caching. This may cause cache misses or incorrect hits if the filtered config differs significantly.

**Fix:** Evaluate whether `configHash` should be computed from `runnableConfig` instead of the original config.

---

### AI-004: Potential "undefined" in No-Changes Output

**File:** `router/src/cli/commands/local-review.ts:905`
**Type:** UI Robustness
**Severity:** Low

In the "No changes to review" output, if `headRef` is undefined, it will display "undefined" in the output.

**Fix:** Ensure `headLabel` always has a defined value, defaulting to `'HEAD'` if `headRef` is undefined.

---

### AI-005: Signal Handler Exit Behavior Undocumented

**File:** `router/src/cli/commands/local-review.ts:969`
**Type:** Documentation
**Severity:** Low

`setupSignalHandlers` is called with `exitOnSignal: true`. If the CLI is ever embedded or used programmatically, this could cause abrupt exits.

**Fix:** Document that the CLI will exit immediately on SIGINT/SIGTERM and that this is not configurable.

---

### AI-006: resolveBaseRef Function Potentially Dead Code

**File:** `router/src/cli/options/local-review-options.ts:269`
**Type:** Dead Code
**Severity:** Low

The function `resolveBaseRef` is still present and exported but not re-exported from the index barrel. If not used, it should be removed.

**Fix:** Remove `resolveBaseRef` function if unused, or mark it as internal/private.

---

### AI-007: resolveBaseRef Export Inconsistency

**File:** `router/src/cli/options/local-review-options.ts:376`
**Type:** API Cleanup
**Severity:** Low

The function `resolveBaseRef` is exported from the file but not re-exported from the barrel (`index.ts`). This creates inconsistency.

**Fix:** Remove the `export` keyword from `resolveBaseRef` if not meant for external use, or add a deprecation comment.

---

## Recommendations

### Immediate Actions (Before Merge)

1. Delete `npm-publish.yml` (C-002)
2. Fix shell injection in `release.yml` (H-003)
3. Fix `.releaserc.json` to use root `CHANGELOG.md` instead of `router/CHANGELOG.md` (C-001)

### Short-Term (Next Sprint)

1. Add missing helper function tests (M-015)
2. Implement integration tests (H-005)
3. Add explicit permissions to CI jobs (M-014)
4. Fix unsafe error type casting (H-001)

### Long-Term

1. Extract repeated diff loading logic (M-001)
2. Standardize error messaging across CLI (M-007, M-021)
3. Add comprehensive platform compatibility testing (M-024)

---

## Notes

- The local-review CLI implementation is generally solid with good test coverage
- Security model is defense-in-depth with multiple validation layers
- Main concerns are consistency and edge case handling
- Semantic-release configuration needs alignment with existing changelog strategy
- AI review (gpt-4.1) confirms code quality is high with only minor suggestions
- gpt-4o-mini context limit (128k tokens) exceeded by this PR's 174k token diff
- gpt-5.2 requires `max_completion_tokens` API parameter (compatibility issue found)
- Semgrep fails on Windows due to Python cp1252 encoding issues with Unicode in rules
