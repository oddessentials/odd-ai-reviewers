# Specification Quality Checklist: Fix npm Release Authentication

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-02-04
**Updated**: 2026-02-04 (FINAL - all safeguards integrated)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified (E404 masking, auth verification, registry locking, empty token, wrong directory, plugin override)
- [x] Scope is clearly bounded (P1 vs P2 staged rollout)
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification
- [x] Staged rollout strategy defined (P1 token-only, P2 provenance)

## Final Directives (verbatim implementation required)

- [x] NPM_TOKEN ONLY in "release" environment; DELETE from repository secrets
- [x] Job must declare `environment: release`
- [x] NODE_AUTH_TOKEN set in SAME step as semantic-release
- [x] Lock registry with NPM_CONFIG_REGISTRY=https://registry.npmjs.org/
- [x] Verify auth with `npm whoami` + `npm config get registry`; fail if either fails
- [x] P1 forbids --provenance, id-token: write, and all provenance config

## Final Safeguards (last critical checks)

- [x] Ensure semantic-release performs publish (not pnpm directly elsewhere)
- [x] Verify plugin config does NOT override env/registry
- [x] Working directory correctness: set `working-directory: router` or `pkgRoot`
- [x] Auth verification permanent until multiple green releases
- [x] Empty token guard: error if `${{ secrets.NPM_TOKEN }}` is empty at runtime
- [x] Test strategy: dry-run first, then real publish

## Outcome Guarantee

Implemented verbatim, this spec produces either:

- **(a)** Successful publish to npm
- **(b)** Deterministic failure pointing to single remaining variable

**Status**: READY FOR `/speckit.plan`
