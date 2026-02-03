# Data Model: Automated npm Publishing with semantic-release

**Feature**: 016-semantic-release
**Date**: 2026-02-03

## Overview

This feature is primarily configuration-driven with no custom data entities. The "data model" consists of configuration files and artifacts that semantic-release reads and writes.

## Configuration Entities

### 1. semantic-release Configuration (.releaserc.json)

**Location**: Repository root
**Format**: JSON

```json
{
  "branches": ["main"],
  "tagFormat": "v${version}",
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    [
      "@semantic-release/changelog",
      {
        "changelogFile": "router/CHANGELOG.md"
      }
    ],
    [
      "@semantic-release/npm",
      {
        "pkgRoot": "router"
      }
    ],
    [
      "@semantic-release/git",
      {
        "assets": ["router/package.json", "router/CHANGELOG.md"],
        "message": "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}"
      }
    ],
    "@semantic-release/github"
  ]
}
```

**Fields**:
| Field | Type | Description |
| ----- | ---- | ----------- |
| branches | string[] | Release branches (main only) |
| tagFormat | string | Git tag format (v1.2.3) |
| plugins | array | Ordered plugin configuration |

### 2. Package Version (router/package.json)

**Location**: router/package.json
**Field**: `version`

```json
{
  "name": "@oddessentials/ai-review",
  "version": "1.0.0"
}
```

**State transitions**:

- `1.0.0` → `1.0.1` (patch: fix commits)
- `1.0.0` → `1.1.0` (minor: feat commits)
- `1.0.0` → `2.0.0` (major: breaking changes)

**Constraints**:

- Follows semantic versioning (semver)
- Only modified by semantic-release bot
- Must match git tag after release

### 3. Changelog (router/CHANGELOG.md)

**Location**: router/CHANGELOG.md
**Format**: Markdown (Keep a Changelog style)

```markdown
# Changelog

## [1.1.0](https://github.com/org/repo/compare/v1.0.0...v1.1.0) (2026-02-03)

### Features

- **scope:** description ([abc1234](https://github.com/org/repo/commit/abc1234))

### Bug Fixes

- **scope:** description ([def5678](https://github.com/org/repo/commit/def5678))
```

**Constraints**:

- Machine-owned only (FR-016)
- Manual edits blocked by CI
- Only modified by release bot

### 4. GitHub Environment Secrets

**Location**: GitHub repository settings → Environments → release
**Format**: Encrypted secrets

| Secret          | Description                   | Used by                         |
| --------------- | ----------------------------- | ------------------------------- |
| APP_ID          | GitHub App ID for release bot | actions/create-github-app-token |
| APP_PRIVATE_KEY | GitHub App private key (PEM)  | actions/create-github-app-token |
| NPM_TOKEN       | npm automation token          | semantic-release/npm            |

**Constraints**:

- Only accessible on main branch (environment protection)
- Only used by release workflow

## Artifacts Produced

### Per Release

| Artifact        | Location            | Description                      |
| --------------- | ------------------- | -------------------------------- |
| Git tag         | refs/tags/v1.2.3    | Immutable version marker         |
| GitHub Release  | Releases page       | Contains release notes           |
| npm package     | registry.npmjs.org  | Published package tarball        |
| CHANGELOG entry | router/CHANGELOG.md | Human-readable history           |
| Version commit  | main branch         | Updates package.json + CHANGELOG |

## State Machine

```
┌─────────────────┐
│  PR Merged      │
│  to main        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Analyze Commits │──── No releasable ───► SKIP (no release)
│ (conventional)  │      commits
└────────┬────────┘
         │ Has feat/fix/breaking
         ▼
┌─────────────────┐
│ Determine       │
│ Next Version    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Generate        │
│ Release Notes   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Update Files    │
│ (pkg.json,      │
│  CHANGELOG)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Publish to npm  │──── Already exists ───► SKIP (idempotent)
└────────┬────────┘
         │ Success
         ▼
┌─────────────────┐
│ Create Git Tag  │──── Already exists ───► SKIP (idempotent)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Commit & Push   │
│ Version Files   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create GitHub   │
│ Release         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Verify All      │──── Mismatch ───► FAIL
│ Artifacts Sync  │
└────────┬────────┘
         │ Match
         ▼
┌─────────────────┐
│ SUCCESS         │
└─────────────────┘
```

## Validation Rules

### Commit Message Format (for PR titles)

```
type(scope): description

[optional body]

[optional footer(s)]
```

**Types**: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
**Breaking change**: `feat!:` or `BREAKING CHANGE:` in footer

### Version Sync Validation

Post-release verification must confirm:

1. `git describe --tags --abbrev=0` matches `v${version}`
2. `router/package.json` version matches `${version}`
3. `npm view @oddessentials/ai-review version` matches `${version}`
4. First `## [x.y.z]` in CHANGELOG.md matches `${version}`
