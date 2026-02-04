# Research: Fix npm Release Authentication

**Feature**: 408-fix-npm-publish
**Date**: 2026-02-04

## Overview

All technical questions were resolved during specification clarification. This document consolidates the findings.

## Research Findings

### 1. npm Authentication for Scoped Packages

**Decision**: Use `NODE_AUTH_TOKEN` environment variable

**Rationale**:

- pnpm and npm CLI both read `NODE_AUTH_TOKEN` for authentication
- `NPM_TOKEN` alone is insufficient; must be explicitly mapped to `NODE_AUTH_TOKEN`
- The `actions/setup-node` action with `registry-url` creates `.npmrc` that uses `NODE_AUTH_TOKEN`

**Alternatives Considered**:

- `NPM_TOKEN` only: Rejected - pnpm does not automatically read this variable
- `.npmrc` file committed to repo: Rejected - security risk, not needed with env var approach

### 2. E404 Error Behavior

**Decision**: E404 indicates authentication failure (not missing package)

**Rationale**:

- npm registry returns 404 instead of 403 for scoped packages to avoid leaking package existence
- This is intentional security behavior by npm
- Package @oddessentials/odd-ai-reviewers v1.0.0 already exists on npm

**Alternatives Considered**:

- Treating as registry issue: Rejected - registry is functioning correctly
- Creating new package: Rejected - package exists, just auth is failing

### 3. Provenance and OIDC

**Decision**: Remove provenance for P1, re-enable as P2

**Rationale**:

- `--provenance` adds extra failure modes (OIDC token issues, `id-token: write` permission)
- Isolating authentication first eliminates confounding variables
- Provenance is valuable but secondary to basic publish functionality

**Alternatives Considered**:

- Keeping provenance in P1: Rejected - conflates multiple failure modes
- Removing provenance permanently: Rejected - supply chain security is valuable

### 4. Secret Storage Location

**Decision**: NPM_TOKEN only in "release" environment

**Rationale**:

- Environment-scoped secrets provide additional protection
- Job must explicitly declare `environment: release` to access
- Prevents accidental token exposure in other workflows

**Alternatives Considered**:

- Repository-level secret: Rejected - less secure, can be accessed by any workflow
- Both locations: Rejected - redundant and confusing

### 5. Working Directory

**Decision**: Publish from `router/` subdirectory via `cd router` in publishCmd

**Rationale**:

- Package lives in `router/` subdirectory
- Current `.releaserc.json` already uses `cd router && pnpm publish`
- No change needed; current approach is correct

**Alternatives Considered**:

- `pkgRoot` config: Not needed - `cd router` works
- `working-directory` in workflow: Not needed - semantic-release handles it

### 6. Auth Verification Strategy

**Decision**: Run `npm whoami` and `npm config get registry` before publish

**Rationale**:

- Fails fast with clear error message if auth is misconfigured
- `npm whoami` verifies token is valid and has correct scope
- `npm config get registry` verifies correct registry URL
- Permanent until multiple green releases confirm stability

**Alternatives Considered**:

- Relying on pnpm publish error: Rejected - error messages are cryptic (E404)
- Single check only: Rejected - both checks provide different validation

## No NEEDS CLARIFICATION Remaining

All technical questions resolved. Ready for Phase 1 design.
