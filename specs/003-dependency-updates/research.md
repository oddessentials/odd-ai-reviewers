# Research: Update Third-Party Dependencies

## Decision 1: Dependency update strategy

- **Decision**: Update root and router dependencies using npm semver-compatible latest versions, then reconcile any breaking changes via config/code adjustments.
- **Rationale**: Aligns with spec requirements to update all dependencies while preserving build/test integrity and CI gates.
- **Alternatives considered**: Incremental updates per package group (slower, higher coordination cost) or pinning to current versions (fails security/maintenance goals).

## Decision 2: Repo-standards v7 compliance approach

- **Decision**: Use the official `@oddessentials/repo-standards` v7 migration guidance and validation scripts to update configuration files (ESLint, Prettier, TypeScript, commitlint) as required.
- **Rationale**: Ensures compliance with organizational standards and avoids CI gate failures.
- **Alternatives considered**: Manual trial-and-error without migration guidance (higher risk of missed requirements).

## Decision 3: Overrides and vulnerability handling

- **Decision**: Preserve existing npm overrides unless upstream fixes remove the need; document any overrides retained and rationale.
- **Rationale**: Maintains security posture while avoiding regressions from dependency graph changes.
- **Alternatives considered**: Removing overrides unconditionally (risk of reintroducing vulnerabilities).

## Decision 4: Verification and validation commands

- **Decision**: Use `npm run verify`, `npm test`, and `npm audit` as primary validation gates after updates.
- **Rationale**: Matches existing CI expectations and success criteria in the spec.
- **Alternatives considered**: Partial test runs (insufficient coverage for dependency updates).

## Decision 5: npm outdated results

- **Decision**: `npm outdated` now reports no outdated packages after upgrading `@oddessentials/repo-standards` to v7.
- **Rationale**: All direct dependencies are aligned to latest compatible versions per policy.

## Decision 6: Repo-standards checklist review

- **Decision**: Generated checklist via `npx repo-standards typescript-js github-actions` and reviewed core items for applicable gaps.
- **Rationale**: Ensures repo-standards v7 compliance is grounded in the official checklist.
- **Notes**: Added `.dockerignore` and `.prettierignore`, and expanded ESLint ignores. Remaining checklist items are validated through `npm run verify`, `npm test`, and CI parity checks.

## Decision 7: Override retention

- **Decision**: Retain the `undici` override in `/mnt/e/projects/odd-ai-reviewers/package.json`.
- **Rationale**: No evidence of upstream removal requirement in this change; `npm audit` reports 0 vulnerabilities post-install.

## Decision 8: NFR coverage mapping

- **Decision**: NFR-001 is covered by `npm audit`, NFR-002 by `npm run verify` (lint/format/typecheck/depcruise/build), and NFR-003 by maintaining deterministic tool outputs under the same inputs.
- **Rationale**: Aligns explicit NFRs with existing verification gates without adding new tooling.
