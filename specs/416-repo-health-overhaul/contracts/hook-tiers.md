# Contract: Hook Tier Specification

**Feature**: 416-repo-health-overhaul
**Date**: 2026-03-15
**Constitution Reference**: Quality Gates → Local = CI Parity

## Purpose

Defines the exact checks that run at each development stage (pre-commit, pre-push, CI), their ordering, time budgets, and constitution compliance status.

## Tier 1: Pre-Commit (Fast Gate)

**Time Budget**: < 30 seconds
**Trigger**: `git commit`
**Constitution Mandate**: lint-staged (format + strict lint) + typecheck

| Order | Check                | Command                                                                          | Constitution Required      |
| ----- | -------------------- | -------------------------------------------------------------------------------- | -------------------------- |
| 1     | Secret file guard    | `git diff --cached --name-only \| grep -E '^\.env' \| grep -v '\.env\.example$'` | No (new security addition) |
| 2     | Lint-staged          | `pnpm exec lint-staged`                                                          | Yes                        |
| 3     | TypeScript typecheck | `pnpm exec tsc --noEmit`                                                         | Yes                        |

**lint-staged configuration** (from package.json):

- `*.md` → `node scripts/regenerate-docs-manifest.cjs`
- `*.{js,cjs,ts,mjs,json,md,yml,yaml}` → `prettier --write`
- `*.{js,cjs,ts,mjs}` → `eslint --max-warnings 0 --no-warn-ignored`

## Tier 2: Pre-Push (Medium Gate)

**Time Budget**: < 4 minutes
**Trigger**: `git push`
**Constitution Mandate**: depcruise (circular dependency check)

| Order | Check               | Command                                                           | Constitution Required                      |
| ----- | ------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| 1     | Dependency analysis | `pnpm exec depcruise router/src --config .dependency-cruiser.cjs` | Yes                                        |
| 2     | Build               | `pnpm run build`                                                  | No (but prevents pushing unbuildable code) |
| 3     | Tests               | `pnpm --filter ./router test`                                     | No (but prevents pushing broken tests)     |

**Removed from pre-push** (redundant with pre-commit or moved to CI):

- ~~eslint~~ → Already in pre-commit via lint-staged
- ~~prettier~~ → Already in pre-commit via lint-staged
- ~~tsc --noEmit~~ → Already in pre-commit
- ~~docs:linkcheck~~ → Moved to CI (network-dependent, slow)
- ~~spec:linkcheck~~ → Moved to CI (slow)

## Tier 3: CI (Authoritative Gate)

**Time Budget**: No local constraint (CI timeout applies)
**Trigger**: Push to main, pull request to main
**Constitution Mandate**: All quality gates

| Order | Check                           | CI Step Name                |
| ----- | ------------------------------- | --------------------------- |
| 1     | Toolchain version verification  | Verify toolchain versions   |
| 2     | ESLint (full codebase)          | Lint (zero-tolerance)       |
| 3     | Prettier (full codebase)        | Format check                |
| 4     | Prompt sync validation          | Prompt sync check           |
| 5     | TypeScript typecheck            | Typecheck                   |
| 6     | Circular dependency check       | Check circular dependencies |
| 7     | Script permissions (Linux only) | Check script permissions    |
| 8     | AgentResult pattern enforcement | Check AgentResult patterns  |
| 9     | Docs manifest sync              | Verify docs manifest        |
| 10    | Documentation link check        | Check documentation links   |
| 11    | Spec-to-test link check         | Check spec-to-test links    |
| 12    | Build                           | Build                       |
| 13    | Tests (CI thresholds)           | Test + Coverage             |
| 14    | Container security scan         | Container scan (Trivy)      |
| 15    | Benchmark regression            | Benchmark regression        |

## Parity Matrix

| Check                    | Pre-Commit  | Pre-Push | CI  |
| ------------------------ | ----------- | -------- | --- |
| ESLint (staged)          | Yes         | —        | —   |
| ESLint (full)            | —           | —        | Yes |
| Prettier (staged)        | Yes         | —        | —   |
| Prettier (full)          | —           | —        | Yes |
| TypeScript typecheck     | Yes         | —        | Yes |
| Depcruise                | —           | Yes      | Yes |
| Build                    | —           | Yes      | Yes |
| Tests (local thresholds) | —           | Yes      | —   |
| Tests (CI thresholds)    | —           | —        | Yes |
| Prompt sync              | —           | —        | Yes |
| AgentResult patterns     | —           | —        | Yes |
| Script permissions       | —           | —        | Yes |
| Docs manifest            | Staged only | —        | Yes |
| Docs linkcheck           | —           | —        | Yes |
| Spec linkcheck           | —           | —        | Yes |
| Toolchain versions       | —           | —        | Yes |
| Container scan           | —           | —        | Yes |
| Benchmark regression     | —           | —        | Yes |
| Secret file guard        | Yes         | —        | —   |

## Invariants

1. Every check that runs in pre-commit MUST also run in CI (superset guarantee).
2. Every check that runs in pre-push MUST also run in CI (superset guarantee).
3. CI is the authoritative gate — local hooks provide fast feedback but do not replace CI.
4. Pre-commit MUST include lint-staged + tsc (constitution mandate).
5. Pre-push MUST include depcruise (constitution mandate).
6. No check may run in both pre-commit AND pre-push (no redundancy).
