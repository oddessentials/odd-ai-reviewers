# Implementation Plan: Automated npm Publishing with semantic-release

**Branch**: `016-semantic-release` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-semantic-release/spec.md`

## Summary

Implement fully automated, deterministic npm publishing using semantic-release. The system will analyze conventional commit messages (via squash-merged PR titles), automatically determine version bumps, generate changelogs, create git tags, and publish to npm. Recovery from partial failures will be idempotent. A GitHub App with environment-protected credentials will push version commits to the protected main branch.

## Technical Context

**Language/Version**: TypeScript 5.9.x (ES2022 target, NodeNext modules)
**Primary Dependencies**: semantic-release (core), @semantic-release/changelog, @semantic-release/git, @semantic-release/npm, @semantic-release/github, commitlint (existing)
**Storage**: N/A (file-based: CHANGELOG.md, package.json)
**Testing**: Vitest 4.x (existing), manual integration testing via dry-run
**Target Platform**: GitHub Actions (ubuntu-latest)
**Project Type**: Monorepo with pnpm workspaces (router/ is the published package)
**Performance Goals**: Release completes in under 5 minutes (SC-006)
**Constraints**: Squash-merge only, machine-owned CHANGELOG, environment-protected token
**Scale/Scope**: Single package (@oddessentials/ai-review), existing ~1.0.0 version

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                         |
| -------------------------------- | ------- | ------------------------------------------------------------- |
| I. Router Owns All Posting       | N/A     | This feature doesn't involve PR posting (router concern)      |
| II. Structured Findings Contract | N/A     | Not agent-related                                             |
| III. Provider-Neutral Core       | ✅ Pass | GitHub-specific release config is isolated in workflow files  |
| IV. Security-First Design        | ✅ Pass | Token scoped to protected environment, bot identity auditable |
| V. Deterministic Outputs         | ✅ Pass | Pinned Node version, lockfile, squash-merge standardization   |
| VI. Bounded Resources            | ✅ Pass | Release workflow has single concurrency group                 |
| VII. Environment Discipline      | ✅ Pass | Pinned Node 22, frozen lockfile, no runtime installers        |
| VIII. Explicit Non-Goals         | ✅ Pass | Not replacing CI, not storing secrets outside provider        |

**Quality Gates**:

- Zero-Tolerance Lint: Release workflow will run lint before publish (existing quality-gate job)
- Security Linting: Existing ESLint security rules apply
- Local = CI Parity: commitlint hook is advisory; CI enforces PR title validation

**All gates pass. Proceeding to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/016-semantic-release/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
# Existing structure (no new src/ directories needed)
.github/
├── workflows/
│   ├── ci.yml              # MODIFY: Add PR title validation job
│   └── release.yml         # NEW: semantic-release workflow (replaces npm-publish.yml trigger)
├── CODEOWNERS              # Existing

# Configuration files (root)
.releaserc.json             # NEW: semantic-release configuration
commitlint.config.mjs       # EXISTING: conventional commit config

# Package files
router/
├── package.json            # MODIFY: version field updated by semantic-release
├── CHANGELOG.md            # NEW: auto-generated changelog
└── dist/                   # Existing build output

# Root config
package.json                # EXISTING: workspace root (version field not published)
pnpm-lock.yaml              # EXISTING: lockfile ensures reproducibility
```

**Structure Decision**: No new source directories. Changes are limited to:

1. GitHub workflow files (.github/workflows/)
2. semantic-release config file (.releaserc.json)
3. CHANGELOG.md in router/ (auto-generated)

## Complexity Tracking

> No violations. Feature aligns with existing architecture.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| (none)    | -          | -                                    |
