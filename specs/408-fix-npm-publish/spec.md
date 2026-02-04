# Feature Specification: Fix npm Release Authentication

**Feature Branch**: `408-fix-npm-publish`
**Created**: 2026-02-04
**Status**: Ready for Planning
**Input**: User description: "Fix npm release - E404 error publishing @oddessentials/odd-ai-reviewers due to authentication failure"

## Clarifications

### Session 2026-02-04

- Q: What is the root cause of E404 on publish? → A: npm masks auth/permission failures as E404 for scoped packages; the workflow is missing NODE_AUTH_TOKEN (not just NPM_TOKEN)
- Q: Should provenance be bundled with P1? → A: No. P1 = token-only publish without --provenance. P2 = re-enable provenance after P1 succeeds
- Q: Is NPM_TOKEN configured? → A: Yes, configured in both release environment and as repo secret with full publish permissions for @oddessentials scope
- Q: What environment variable does pnpm/npm require? → A: NODE_AUTH_TOKEN must be explicitly set; NPM_TOKEN alone is insufficient
- Q: Where should NPM_TOKEN be stored? → A: ONLY in GitHub Actions "release" environment; DELETE from repository secrets
- Q: How to verify auth before publish? → A: Run `npm whoami` and `npm config get registry`; fail job immediately if either fails
- Q: How to lock registry? → A: Set NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ in release job
- Q: Who performs the actual publish? → A: semantic-release (via @semantic-release/exec or @semantic-release/npm); confirm plugin config does NOT override env/registry
- Q: How to handle package in subdirectory? → A: Explicitly set `working-directory` for release step OR configure `pkgRoot` in semantic-release config
- Q: Should auth verification be permanent? → A: Keep `npm whoami` and `npm config get registry` permanently; remove only after multiple green releases
- Q: How to guard against empty token? → A: Add explicit guard that errors if `${{ secrets.NPM_TOKEN }}` is empty at runtime
- Q: Recommended test strategy? → A: First run semantic-release with --dry-run (P1 config) to verify tags/versioning, then run without dry-run to publish

## Assumptions

- Package @oddessentials/odd-ai-reviewers v1.0.0 is already published to npm
- The E404 error occurs during the publish of subsequent versions (e.g., v1.0.1)
- E404 is npm masking an authentication/authorization failure, not a missing package
- NPM_TOKEN is a valid automation token with publish permissions for @oddessentials scope
- Package lives in `router/` subdirectory (requires explicit working-directory or pkgRoot)

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Basic Token-Only Publish (Priority: P1)

A maintainer merges code to the main branch that triggers a semantic-release version bump. The release workflow should successfully publish the new version to npm using token authentication only, without provenance signing.

**Why this priority**: Must prove basic publish works before adding provenance complexity. Provenance adds extra failure modes that can mask the underlying auth issue. Token-only publish isolates authentication as the sole variable.

**Independent Test**: Can be fully tested by triggering a release workflow with `--provenance` flag removed and verifying the new version appears on npmjs.com.

**Acceptance Scenarios**:

1. **Given** the package v1.0.0 already exists on npm registry, **When** a release is triggered with a version bump (provenance disabled), **Then** the new version is successfully published to npm
2. **Given** NODE_AUTH_TOKEN is set from NPM_TOKEN in the semantic-release step, **When** pnpm publish runs, **Then** npm authenticates successfully and returns 200 (not E404)
3. **Given** the workflow targets the "release" environment, **When** the publish step executes, **Then** the NPM_TOKEN secret is available at runtime
4. **Given** auth verification step runs before publish, **When** `npm whoami` or `npm config get registry` fails, **Then** the job fails immediately before attempting publish
5. **Given** NPM_TOKEN might be empty/unset, **When** the job starts, **Then** a guard check fails fast with clear error message before any publish attempt
6. **Given** semantic-release --dry-run is executed first, **When** tags/versioning are verified, **Then** the real publish run proceeds

---

### User Story 2 - Publish with Provenance (Priority: P2)

After P1 is proven working, re-enable provenance signing to provide supply chain security attestation.

**Why this priority**: Provenance is valuable but adds complexity. Must only be re-enabled after basic publish is confirmed working to avoid debugging multiple failure modes simultaneously.

**Independent Test**: Can be tested by re-adding `--provenance` flag after P1 succeeds and verifying provenance attestation appears on npm.

**Acceptance Scenarios**:

1. **Given** P1 (token-only publish) succeeds, **When** --provenance flag is re-enabled, **Then** the package publishes with provenance attestation
2. **Given** id-token: write permission is configured, **When** the publish runs with --provenance, **Then** the provenance statement is signed via OIDC and published to transparency log

---

### User Story 3 - Pre-commit Hooks Disabled During Release (Priority: P3)

The release workflow should not be blocked by husky pre-commit hooks when semantic-release creates the release commit.

**Why this priority**: This prevents release failures due to hook interference, but is a supporting concern rather than core functionality.

**Independent Test**: Can be tested by verifying the release workflow completes even when husky hooks are configured in the repository.

**Acceptance Scenarios**:

1. **Given** husky pre-commit hooks are configured, **When** semantic-release creates a release commit, **Then** the hooks are skipped and the commit succeeds
2. **Given** HUSKY environment variable is set to '0', **When** git operations run during release, **Then** no husky hooks execute

---

### Edge Cases

- What happens when NODE_AUTH_TOKEN is not set (only NPM_TOKEN)?
  - pnpm/npm publish runs unauthenticated; npm returns E404 (masking 403) for scoped package
- What happens when NPM_TOKEN has insufficient scope permissions?
  - npm returns E404 (not 403) to avoid leaking package existence information
- What happens when workflow doesn't target the "release" environment?
  - Secrets are unavailable; publish fails silently with auth error
- What happens when --provenance is used but OIDC permissions are wrong?
  - Publish may fail with cryptic error that looks like auth failure; isolate by testing without provenance first
- What happens when `npm whoami` fails before publish?
  - Job fails immediately with clear auth failure message before attempting publish
- What happens when registry URL is wrong or not locked?
  - Auth may succeed against wrong registry; lock registry explicitly to prevent misdirection
- What happens when NPM_TOKEN secret is empty at runtime?
  - Guard check fails fast with explicit "NPM_TOKEN is empty" error before any npm commands run
- What happens when publish runs from wrong directory?
  - Auth/404 noise; ensure working-directory is set to `router/` or pkgRoot is configured
- What happens when semantic-release plugin overrides env/registry?
  - Auth may fail despite correct workflow config; verify plugin config does not override NODE_AUTH_TOKEN or registry

## Requirements _(mandatory)_

### Functional Requirements

**P1 - Token-Only Publish (must complete first)**

- **FR-001**: NPM_TOKEN MUST exist ONLY in the GitHub Actions "release" environment; DELETE from repository secrets
- **FR-002**: Release job MUST declare `environment: release` to bind to the environment
- **FR-003**: NODE_AUTH_TOKEN MUST be set to `${{ secrets.NPM_TOKEN }}` in the SAME step that runs semantic-release
- **FR-004**: Release job MUST set `NPM_CONFIG_REGISTRY=https://registry.npmjs.org/` to lock the registry
- **FR-005**: Release workflow MUST run `npm whoami` and `npm config get registry` before publish; if EITHER fails, fail the job immediately
- **FR-006**: P1 implementation MUST remove `--provenance` flag from publish command
- **FR-007**: P1 implementation MUST remove `id-token: write` permission from job
- **FR-008**: P1 implementation MUST remove any provenance-related configuration
- **FR-009**: Release workflow MUST maintain HUSKY='0' environment variable to disable git hooks
- **FR-010**: Publish command MUST include --access public for scoped package
- **FR-011**: Release workflow MUST add explicit guard that errors if `${{ secrets.NPM_TOKEN }}` is empty at runtime
- **FR-012**: Release step MUST set `working-directory: router` OR semantic-release config MUST set `pkgRoot: router`
- **FR-013**: Verify semantic-release plugin config does NOT override NODE_AUTH_TOKEN or NPM_CONFIG_REGISTRY
- **FR-014**: Auth verification (`npm whoami`, `npm config get registry`) MUST remain permanently until multiple green releases confirm stability
- **FR-015**: First P1 deployment SHOULD use semantic-release --dry-run to verify tags/versioning before real publish

**P2 - Re-enable Provenance (only after P1 succeeds)**

- **FR-016**: After P1 is verified working, re-add --provenance flag to publish command
- **FR-017**: After P1 is verified working, re-add id-token: write permission for OIDC provenance signing
- **FR-018**: Provenance must not be bundled with P1; it is a separate, subsequent change

### Key Entities

- **NODE_AUTH_TOKEN**: The environment variable that pnpm/npm CLI uses for authentication; must be set explicitly in the semantic-release step
- **NPM_TOKEN**: GitHub secret containing npm automation token with publish permissions for @oddessentials scope; stored ONLY in "release" environment (not repository secrets)
- **NPM_CONFIG_REGISTRY**: Environment variable locking the npm registry URL to https://registry.npmjs.org/
- **Release Environment**: GitHub Actions environment named "release" that contains NPM_TOKEN; job must declare `environment: release`
- **Auth Verification**: Pre-publish check using `npm whoami` and `npm config get registry` that fails the job if either command fails; permanent until multiple green releases
- **Empty Token Guard**: Explicit check that `${{ secrets.NPM_TOKEN }}` is non-empty before any npm commands execute
- **Working Directory**: The `router/` subdirectory where package.json lives; must be explicitly set via `working-directory` or `pkgRoot`
- **Provenance Attestation**: Cryptographic proof linking published package to source (P2 only, not P1)

## Success Criteria _(mandatory)_

### Measurable Outcomes

**P1 Success (must be achieved first)**

- **SC-001**: Empty token guard executes and passes (token is non-empty)
- **SC-002**: `npm whoami` succeeds and returns expected user/automation account
- **SC-003**: `npm config get registry` returns https://registry.npmjs.org/
- **SC-004**: semantic-release --dry-run completes without error (first deployment)
- **SC-005**: Release workflow publishes v1.0.1+ to npm without E404 or authentication errors (provenance disabled)
- **SC-006**: npm registry shows new version available within 5 minutes of workflow completion

**P2 Success (only after P1)**

- **SC-007**: After P1 succeeds, re-enabling --provenance results in successful publish with attestation
- **SC-008**: Published packages show provenance attestation verifiable on npmjs.com

**General**

- **SC-009**: Release commits created by semantic-release complete without husky hook interference
- **SC-010**: The verify job confirms version synchronization across package.json, git tag, npm registry, and CHANGELOG

## Implementation Outcome Guarantee

If this spec is implemented **verbatim**, the result will be one of:

- **(a)** Successful publish to npm
- **(b)** Deterministic failure pointing to a single remaining variable

Either way, guessing stops here.
