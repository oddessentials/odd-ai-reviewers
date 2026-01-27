# Implementation Plan: Update Third-Party Dependencies

**Branch**: `003-dependency-updates` | **Date**: 2026-01-27 | **Spec**: `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/spec.md`
**Input**: Feature specification from `/specs/003-dependency-updates/spec.md`

## Summary

Update root and router workspace dependencies to latest compatible versions, upgrade `@oddessentials/repo-standards` to v7, align configuration files to new requirements, preserve/adjust npm overrides, and validate via existing CI-equivalent commands.

## Technical Context

**Language/Version**: TypeScript 5.7.x, Node.js >=22.0.0  
**Primary Dependencies**: npm workspaces, ESLint 9, Prettier 3, TypeScript 5, Vitest 4, `@oddessentials/repo-standards`  
**Storage**: N/A (local files only)  
**Testing**: Vitest (router), ESLint, Prettier, TypeScript  
**Compliance Checks**: `npx repo-standards typescript-js github-actions`, `npm run verify`  
**Target Platform**: Linux CI runners (GitHub Actions / Azure DevOps), Node.js 22  
**Project Type**: Monorepo (root + `router` workspace)  
**Performance Goals**: No explicit performance targets; preserve current CI/runtime behavior  
**Constraints**: Must satisfy constitution gates, Node >=22 compatibility, zero-tolerance lint, depcruise checks  
**Scale/Scope**: Root `package.json` and `router/package.json`, related config files, plus documentation updates in `/mnt/e/projects/odd-ai-reviewers/README.md` and `/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/quickstart.md`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- I. Router Owns All Posting — PASS (no changes to posting flow)
- II. Structured Findings Contract — PASS (no changes to finding schema)
- III. Provider-Neutral Core — PASS (dependency updates only)
- IV. Security-First Design — PASS (no token flow changes; ensure pinned deps/overrides handled)
- V. Deterministic Outputs — PASS (no output logic changes)
- VI. Bounded Resources — PASS (no budget/limit changes)
- VII. Environment Discipline — PASS (pinned toolchain preserved; no installers)
- VIII. Explicit Non-Goals — PASS (scope unchanged)

Quality Gates (Zero-tolerance lint, Security linting, Depcruise, Local=CI parity) remain enforced and must pass after updates.

## Project Structure

### Documentation (this feature)

```text
/mnt/e/projects/odd-ai-reviewers/specs/003-dependency-updates/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
└── tasks.md
```

### Source Code (repository root)

```text
/mnt/e/projects/odd-ai-reviewers/
├── package.json
├── package-lock.json
├── eslint.config.mjs
├── .prettierrc
├── tsconfig.json
├── commitlint.config.mjs
├── .dependency-cruiser.cjs
└── router/
    ├── package.json
    ├── tsconfig.json
    ├── vitest.config.ts
    └── src/
```

**Structure Decision**: Monorepo with root tooling/configuration and a single `router` workspace containing source and tests.

## Complexity Tracking

No constitution violations detected; no complexity exceptions required.

## Constitution Re-Check (Post-Design)

PASS — No design changes introduce new violations; gates remain satisfied.
