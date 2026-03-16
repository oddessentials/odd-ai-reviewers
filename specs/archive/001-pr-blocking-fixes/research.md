# Research: PR Blocking Fixes

**Feature**: 001-pr-blocking-fixes
**Date**: 2026-02-03

## Overview

This research document consolidates findings for the 10 PR-blocking issues. Most solutions are well-defined in the PR feedback; this document captures verification and best practices research.

---

## R1: Semantic-Release CHANGELOG Path

**Decision**: Update `.releaserc.json` to write CHANGELOG to repository root (`CHANGELOG.md`)

**Rationale**: The current configuration writes to `router/CHANGELOG.md` which:

- Conflicts with the existing root `CHANGELOG.md`
- Produces split or missing release notes
- Breaks version verification in `release.yml` (which checks `router/CHANGELOG.md`)

**Alternatives Considered**:

- Keep separate changelogs (rejected: confusing, maintenance burden)
- Symlink approach (rejected: complexity, portability issues)

**Implementation**:

```json
// .releaserc.json changes
"@semantic-release/changelog": {
  "changelogFile": "CHANGELOG.md"  // was: "router/CHANGELOG.md"
}
"@semantic-release/git": {
  "assets": ["router/package.json", "CHANGELOG.md"]  // was: "router/CHANGELOG.md"
}
```

---

## R2: Breaking Change Footer Detection

**Decision**: Add release rule for `BREAKING CHANGE:` footers in conventional commits

**Rationale**: Current configuration only honors `"breaking": true` in release rules, missing the standard conventional commit footer format. This causes silent major-version misses.

**Alternatives Considered**:

- Rely solely on `feat!:` notation (rejected: incomplete, ignores footer-based convention)
- Custom commit parser (rejected: overkill, conventional-changelog-conventionalcommits supports footers natively)

**Implementation**:

```json
// .releaserc.json - add to releaseRules
{ "type": "feat", "breaking": true, "release": "major" },
{ "type": "fix", "breaking": true, "release": "major" }
```

Note: The `conventional-changelog-conventionalcommits` preset automatically detects `BREAKING CHANGE:` footers when `breaking: true` is in the rules. No additional configuration needed beyond ensuring the preset is correctly configured.

---

## R3: Shell Parameter Expansion for Git Tags

**Decision**: Replace `sed 's/^v//'` with shell parameter expansion `${TAG#v}`

**Rationale**:

- `sed` can break with special characters in tags
- Shell parameter expansion is POSIX-compliant and deterministic
- No external command dependency

**Alternatives Considered**:

- Keep sed with escaping (rejected: still fragile, harder to maintain)
- Node.js script for parsing (rejected: overkill for simple prefix removal)

**Implementation**:

```bash
# Before (vulnerable)
TAG_VERSION=$(git describe --tags --abbrev=0 | sed 's/^v//')

# After (safe)
TAG=$(git describe --tags --abbrev=0)
TAG_VERSION=${TAG#v}
```

---

## R4: OpenAI max_completion_tokens vs max_tokens

**Decision**: Add model-aware parameter switching based on model name prefix

**Rationale**:

- GPT-5.x models reject `max_tokens` parameter, causing hard failures
- GPT-4.x and earlier models require `max_tokens`
- OpenAI SDK supports both parameters

**Research Findings**:

- OpenAI API documentation confirms `max_completion_tokens` is the modern parameter
- `gpt-5` prefix models use the new parameter exclusively
- `gpt-4`, `gpt-3.5` models use `max_tokens`

**Alternatives Considered**:

- Always use `max_completion_tokens` (rejected: breaks backward compatibility)
- Detect from API error (rejected: unnecessary latency, poor UX)

**Implementation**:

```typescript
function isGpt5Model(model: string): boolean {
  return model.startsWith('gpt-5') || model.startsWith('o1') || model.startsWith('o3');
}

// In OpenAI call
const tokenParam = isGpt5Model(model) ? { max_completion_tokens: 4000 } : { max_tokens: 4000 };
```

---

## R5: PYTHONUTF8=1 for Semgrep on Windows

**Decision**: Set `PYTHONUTF8=1` environment variable when spawning Semgrep

**Rationale**:

- Semgrep is Python-based and crashes on Windows due to cp1252 encoding issues
- Python's `PYTHONUTF8=1` forces UTF-8 mode regardless of system locale
- Setting this universally (not just Windows) is safe and consistent

**Research Findings**:

- PEP 540 (Python UTF-8 Mode) documents this environment variable
- Setting it on non-Windows is harmless (Python already defaults to UTF-8)
- Semgrep GitHub issues confirm this as the recommended workaround

**Alternatives Considered**:

- Windows-only conditional (rejected: complexity for no benefit)
- Chcp command (rejected: not portable, requires shell)

**Implementation**:

```typescript
// In semgrep.ts, add to environment
const agentEnv = {
  ...buildAgentEnv('semgrep', context.env),
  PYTHONUTF8: '1', // PEP 540: Force UTF-8 mode for Python
};
```

---

## R6: ErrnoException Type Guard

**Decision**: Add proper type guard before accessing `.code` property

**Rationale**:

- Current code casts to `NodeJS.ErrnoException` without validation
- Non-Error throws or errors without `.code` cause undefined behavior

**Research Findings**:

- Node.js ErrnoException has optional `code`, `errno`, `syscall`, `path` properties
- Best practice is to check `error instanceof Error` AND `'code' in error`

**Implementation**:

```typescript
function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

// Usage
catch (err) {
  if (isNodeError(err)) {
    if (err.code === 'ENOENT') { /* handle */ }
  }
  // Handle non-Error throws
}
```

---

## R7: GitHub Action Supply Chain Security

**Decision**: Replace `exuanbo/actions-deploy-gist@v1` with `actions/github-script`

**Rationale**:

- Unpinned third-party actions receiving secrets are a known attack vector
- `github-script` is an official GitHub action, maintained by GitHub
- Direct API calls via Octokit are more transparent and auditable

**Alternatives Considered**:

- Pin to SHA (viable but action is low-maintenance, may become stale)
- Fork the action (rejected: maintenance burden)

**Research Findings**:

- `actions/github-script` provides direct Octokit access in workflows
- Gist API: `PATCH /gists/{gist_id}` with file content

**Implementation**:

```yaml
- name: Update Gist
  uses: actions/github-script@v7
  with:
    github-token: ${{ secrets.GIST_TOKEN }}
    script: |
      const fs = require('fs');
      const content = fs.readFileSync('.github/badges/tests.json', 'utf8');
      await github.rest.gists.update({
        gist_id: '${{ vars.TEST_BADGE_GIST_ID }}',
        files: { 'tests.json': { content } }
      });
```

---

## R8: Skipped Integration Tests

**Decision**: Implement the two skipped tests in `local-review-cli.test.ts`

**Rationale**:

- Skipped tests represent untested critical execution paths
- Tests should verify CLI invocation produces expected exit codes

**Research Findings**:

- Current skipped tests:
  1. `ai-review local . executes with exit code 0`
  2. `ai-review local-review . executes with exit code 0`
- Tests need real repo context (current repo is suitable)
- Should use `--dry-run` to avoid actual API calls

**Implementation**:

```typescript
it('ai-review local . executes with exit code 0', async () => {
  const result = await runCli(['local', '.', '--dry-run', '--base', 'HEAD']);
  expect(result.exitCode).toBe(0);
});
```

---

## Summary

All research items resolved. No NEEDS CLARIFICATION markers remain.

| Item | Status   | Approach                                            |
| ---- | -------- | --------------------------------------------------- |
| R1   | Resolved | Update paths in .releaserc.json and release.yml     |
| R2   | Resolved | Native preset support for BREAKING CHANGE footers   |
| R3   | Resolved | Shell parameter expansion ${TAG#v}                  |
| R4   | Resolved | Model name prefix detection for parameter selection |
| R5   | Resolved | PYTHONUTF8=1 in agent environment                   |
| R6   | Resolved | isNodeError type guard pattern                      |
| R7   | Resolved | Replace with actions/github-script                  |
| R8   | Resolved | Implement with --dry-run and real repo              |
