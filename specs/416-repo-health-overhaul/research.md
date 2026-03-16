# Research: Repository Health & Maintainability Overhaul

**Feature**: 416-repo-health-overhaul
**Date**: 2026-03-15
**Status**: Complete — all unknowns resolved

## Research Tasks

### R-001: Test Migration — Import Path Impact

**Decision**: Relative import paths must be rewritten from `../module.js` to `../../src/module.js` pattern when moving from `src/__tests__/` to `tests/unit/`.

**Rationale**: Tests in `src/__tests__/foo.test.ts` that import `../agents/opencode.js` currently resolve to `src/agents/opencode.js` (one directory up). After moving to `tests/unit/foo.test.ts`, the same import must reach `../../src/agents/opencode.js` (two directories up, then into src/). This is a mechanical transformation that can be scripted.

**Alternatives considered**:

- Path aliases in tsconfig — Would require test-specific tsconfig paths, adding configuration complexity. Rejected.
- Package.json exports — Already partially used but would require adding all internal modules. Rejected as too broad.
- Batch sed/find-replace — Simple, predictable, verifiable. **Selected.**

**Verification**: After path rewrite, run `pnpm exec tsc --noEmit` and `pnpm --filter ./router test` to confirm zero failures.

---

### R-002: Test Domain Organization — Directory Mapping

**Decision**: Map co-located test files to domain subdirectories in `tests/unit/` matching the source structure.

**Rationale**: Source code is organized by domain (`src/agents/`, `src/config/`, `src/report/`, `src/phases/`, `src/types/`, `src/cli/`). Tests should mirror this structure for discoverability.

**Mapping** (79 files → domain directories):

| Source Pattern    | Test Files (approx.)                         | Target Directory     |
| ----------------- | -------------------------------------------- | -------------------- |
| `src/agents/*`    | opencode, pr-agent, semgrep, reviewdog, etc. | `tests/unit/agents/` |
| `src/config/*`    | config, schema, validation                   | `tests/unit/config/` |
| `src/report/*`    | ado, github, base-report, finding-validator  | `tests/unit/report/` |
| `src/phases/*`    | report, discovery, analysis                  | `tests/unit/phases/` |
| `src/types/*`     | errors, result, branded, assert-never        | `tests/unit/types/`  |
| `src/cli/*`       | commands, options                            | `tests/unit/cli/`    |
| `src/*.ts` (root) | budget, diff, main, etc.                     | `tests/unit/core/`   |

**Alternatives considered**:

- Flat directory (all 79 files in `tests/unit/`) — Poor discoverability with 120+ files. Rejected.
- Keep co-located structure — Violates convention already established in `tests/unit/`. Rejected.

---

### R-003: Pre-push Hook Timing — Baseline Measurement

**Decision**: Remove 3 redundant checks (eslint, prettier, tsc) and 2 slow checks (linkcheck x2) from pre-push, keeping only depcruise + build + test.

**Rationale**: Current pre-push runs 7 checks taking 6-8 minutes:

1. ESLint (~45s) — **REDUNDANT** with pre-commit lint-staged
2. Prettier (~15s) — **REDUNDANT** with pre-commit lint-staged
3. tsc --noEmit (~30s) — **REDUNDANT** with pre-commit
4. depcruise (~5s) — **KEEP** (constitution-required)
5. docs:linkcheck (~30-60s) — **MOVE TO CI** (network-dependent)
6. spec:linkcheck (~15-30s) — **MOVE TO CI** (external validation)
7. Build (~20s) — **KEEP**
8. Tests (~90-180s) — **KEEP**

Estimated new timing: depcruise (5s) + build (20s) + tests (90-180s) = **~2-3.5 minutes** (within 4-minute target).

**Constitution compliance**: Pre-commit retains lint-staged + tsc (required). Pre-push retains depcruise (required). CI runs all checks (authoritative).

**Alternatives considered**:

- Keep all checks, parallelize — Husky hooks run sequentially (no parallelism). Rejected.
- Add `--changed-since` to limit scope — Vitest supports `--changed` but it's unreliable with monorepo. Rejected.
- Keep tsc in pre-push as backup — Already runs in pre-commit 30-60s earlier. Redundant. Rejected.

---

### R-004: .specify/ Selective Tracking — Git Sparse Patterns

**Decision**: Add `.specify/features/`, `.specify/templates/`, `.specify/scripts/` to `.gitignore`, then `git rm --cached -r` those paths. Keep `.specify/memory/constitution.md` tracked.

**Rationale**: Constitution (`.specify/memory/constitution.md`) is a governance document that all contributors must see. Features, templates, and scripts are tooling artifacts that generate noise in diffs and PRs.

**Approach**: `.gitignore` supports directory-level patterns. Adding `.specify/features/` to `.gitignore` while NOT adding `.specify/memory/` preserves selective tracking.

**Verification**:

```
git ls-files .specify/memory/constitution.md  # Should show file (tracked)
git ls-files .specify/features/               # Should show nothing (untracked)
```

**Alternatives considered**:

- Remove all of .specify/ — Loses governance document visibility. Rejected (per Devil's Advocate).
- Keep all of .specify/ — 268 files of generated data cluttering diffs. Rejected (per Security audit).

---

### R-005: Spec Archival — Cross-Reference Audit

**Decision**: Archive 20 completed spec directories to `specs/archive/` after verifying no active references exist.

**Rationale**: 249 files across 30+ directories creates cognitive load. Completed specs are historical reference, not active work.

**Directories to archive** (verified complete — no active development):

- `001-fix-feedback-bugs`, `001-fix-config-wizard-bugs`, `001-security-cve-cleanup`, `001-local-deps-setup`, `001-local-review-improvements`, `001-pr-blocking-fixes`, `001-openai-token-compat`, `001-control-flow-analysis`, `001-review-team-docs`, `001-reviewignore-docs`
- `004-control-flow-hardening`, `005-redos-prevention`, `006-quality-enforcement`, `007-pnpm-timeout-telemetry`, `008-docs-viewer-refactor`, `009-azure-devops-permissions-docs`
- `010-type-test-optimization`, `011-agent-result-unions`, `012-fix-agent-result-regressions`
- `405-fix-grouped-comment-resolution`, `406-fix-remaining-bugs`

**Required pre-check**: Run cross-reference scan (`grep -r "specs/001-" . --include="*.md"` etc.) and update any found references to point to `specs/archive/` path.

**spec:linkcheck impact**: Script at `scripts/check-spec-test-links.cjs` scans `specs/*/spec.md`. After archival, it must also scan `specs/archive/*/spec.md` or the archived specs will fail link checking.

**Alternatives considered**:

- Delete completed specs — Loses historical reference. Rejected.
- Tag completed specs with frontmatter status — Doesn't reduce directory listing noise. Rejected.

---

### R-006: Badge Workflow Artifact Validation

**Decision**: Add artifact file existence check before badge update in `.github/workflows/badge-update.yml`.

**Rationale**: If test artifacts (`test-results.json`, `coverage-summary.json`) are missing, the badge update silently produces stale data. Adding a validation step ensures clear failure when artifacts are unavailable.

**Approach**: Add a step before the badge generation that checks for required files and fails explicitly if missing.

**Alternatives considered**:

- Self-healing (re-run tests if artifacts missing) — Already implemented as fallback. But the fallback runs silently. Adding explicit validation makes failures visible.
- Remove gist-backed badges entirely — Breaks existing README. Rejected.

---

### R-007: Pre-Commit Secret Guard — Pattern Design

**Decision**: Add a shell check in `.husky/pre-commit` that scans staged files for `.env*` patterns (excluding `.env.example`).

**Rationale**: `.gitignore` already excludes `.env*` files, but developers can force-add them. A pre-commit guard provides defense-in-depth.

**Pattern**: Check `git diff --cached --name-only` output for files matching `^\.env` that are NOT `.env.example`. If found, reject the commit with a clear error message.

**Edge case**: Legitimate `.env.ci` or `.env.test` files — these should also be blocked. Only `.env.example` (the template) is allowed.

**Alternatives considered**:

- Use a `.gitallowed` pattern file — Over-engineered for this use case. Rejected.
- Rely on `.gitignore` only — Doesn't catch `git add -f .env.local`. Rejected.

---

### R-008: Vitest Coverage Config Simplification

**Decision**: After test migration, simplify `vitest.config.ts` coverage exclude to `['node_modules', 'dist']` and test include to `['tests/**/*.test.ts']`.

**Rationale**: Currently, coverage exclude has `['src/**/*.test.ts', 'src/__tests__/**/*', 'node_modules', 'dist']`. After migration, no test files exist in `src/`, so the first two patterns become dead rules. Removing them eliminates confusion about what's measured.

**New config**:

- `test.include`: `['tests/**/*.test.ts']` (single canonical location)
- `coverage.include`: `['src/**/*.ts']` (source only — no test files exist here after migration)
- `coverage.exclude`: `['node_modules', 'dist']` (standard exclusions)

**Alternatives considered**:

- Keep old patterns as safety net — Dead patterns create false sense of protection and confusion. Rejected.
