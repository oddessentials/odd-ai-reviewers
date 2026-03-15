# Quickstart: PR Blocking Fixes

**Feature**: 001-pr-blocking-fixes
**Date**: 2026-02-03

## Prerequisites

- Node.js >=22.0.0
- pnpm (version from packageManager field in root package.json)
- Git

## Setup

```bash
# Clone and checkout the feature branch
git clone <repo-url>
cd odd-ai-reviewers
git checkout 001-pr-blocking-fixes

# Install dependencies
pnpm install

# Build
pnpm build
```

## Verification Commands

### 1. Verify Release Configuration

```bash
# Check CHANGELOG path in semantic-release config
cat .releaserc.json | jq '."@semantic-release/changelog"'
# Expected: { "changelogFile": "CHANGELOG.md" }

# Dry-run semantic-release to verify config
pnpm exec semantic-release --dry-run
```

### 2. Verify Windows Semgrep Compatibility

```bash
# On Windows, run local review with Semgrep
# The PYTHONUTF8=1 environment should be set automatically
cd router
pnpm build
node dist/main.js local . --dry-run --verbose

# Check for Semgrep execution in verbose output
# Should not see cp1252 encoding errors
```

### 3. Verify OpenAI Model Compatibility

```bash
# Test with GPT-5 model (requires OPENAI_API_KEY)
export OPENAI_API_KEY=sk-...
cd router
node dist/main.js local . --dry-run --verbose

# In verbose output, verify model parameter selection
# GPT-5.x should show max_completion_tokens
# GPT-4.x should show max_tokens
```

### 4. Verify Error Handling

```bash
# Run tests that cover error handling paths
cd router
pnpm test --filter "checker" --filter "config"

# All tests should pass with proper type guards
```

### 5. Verify CI Workflow Changes

```bash
# Check that npm-publish.yml is deleted
ls -la .github/workflows/npm-publish.yml
# Expected: No such file or directory

# Check badge-update.yml uses github-script
cat .github/workflows/badge-update.yml | grep -A5 "github-script"
# Expected: uses: actions/github-script@v7

# Check release.yml uses shell parameter expansion
cat .github/workflows/release.yml | grep -A2 "TAG_VERSION"
# Expected: TAG_VERSION=${TAG#v} (not sed)
```

### 6. Verify Integration Tests

```bash
# Run integration tests - no skipped tests on critical paths
cd router
pnpm test tests/integration/local-review-cli.test.ts

# Check for no .skip on critical tests
grep -n "\.skip" tests/integration/local-review-cli.test.ts
# Expected: No matches for critical path tests
```

## Test Matrix

| Scenario          | Command                                  | Expected                          |
| ----------------- | ---------------------------------------- | --------------------------------- |
| Release dry-run   | `pnpm exec semantic-release --dry-run`   | No errors, correct CHANGELOG path |
| Windows Semgrep   | `ai-review local . --dry-run` (Windows)  | No encoding errors                |
| GPT-5 model       | `ai-review local . --dry-run` with GPT-5 | No max_tokens rejection           |
| Error handling    | `pnpm test --filter checker`             | All tests pass                    |
| CI workflow audit | Manual review of .github/workflows/      | No unpinned actions with secrets  |

## Success Criteria Checklist

- [ ] SC-001: Release workflow produces matching versions
- [ ] SC-002: Local review completes on Windows with Semgrep
- [ ] SC-003: Local review completes with GPT-5.x models
- [ ] SC-004: All catch blocks use type guards
- [ ] SC-005: Zero unpinned third-party actions with secrets
- [ ] SC-006: npm-publish.yml deleted
- [ ] SC-007: No unexplained skipped integration tests
