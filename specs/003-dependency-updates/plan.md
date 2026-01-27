# Implementation Plan: Update Third-Party Dependencies

**Branch**: `003-dependency-updates` | **Date**: 2026-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-dependency-updates/spec.md`

## Summary

Update all third-party dependencies across the monorepo to their latest versions, with special focus on upgrading @oddessentials/repo-standards from v6.0.0 to v7.x.x and making any necessary compliance adjustments. The update spans root-level devDependencies and router workspace dependencies/devDependencies.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js >=22.0.0
**Primary Dependencies**: ESLint 9.x, typescript-eslint 8.x, Vitest 4.x, Prettier 3.x
**Storage**: N/A (no database)
**Testing**: Vitest (router workspace)
**Target Platform**: Linux server (GitHub Actions CI), Node.js runtime
**Project Type**: Monorepo with npm workspaces (root + router)
**Performance Goals**: N/A (infrastructure update)
**Constraints**: Must maintain Node 22 compatibility, zero-tolerance lint policy, CI parity with local hooks
**Scale/Scope**: ~15 dependencies to update across 2 package.json files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                      |
| -------------------------------- | ------- | ---------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ Pass | Not affected - infrastructure update only                  |
| II. Structured Findings Contract | ✅ Pass | Not affected - no schema changes                           |
| III. Provider-Neutral Core       | ✅ Pass | Not affected - tooling only                                |
| IV. Security-First Design        | ✅ Pass | npm audit shows 0 vulnerabilities; will verify post-update |
| V. Deterministic Outputs         | ✅ Pass | Not affected                                               |
| VI. Bounded Resources            | ✅ Pass | Not affected                                               |
| VII. Environment Discipline      | ✅ Pass | Pinned versions maintained; no curl\|bash installers       |
| VIII. Explicit Non-Goals         | ✅ Pass | Not affected                                               |

**Quality Gates**:

- Zero-tolerance lint: ESLint config compatibility must be verified
- Security linting: eslint-plugin-security compatibility required
- Dependency architecture: dependency-cruiser compatibility required
- Local=CI parity: husky hooks + lint-staged must work with updated versions

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/003-dependency-updates/
├── plan.md              # This file
├── research.md          # Phase 0 output - dependency analysis
├── checklists/
│   └── requirements.md  # Spec validation checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Affected files
package.json                    # Root devDependencies
package-lock.json               # Lock file (auto-generated)
router/package.json             # Workspace dependencies
eslint.config.mjs               # May need updates for ESLint/typescript-eslint
.prettierrc                     # Unlikely to need changes
tsconfig.json                   # Unlikely to need changes
commitlint.config.mjs           # Unlikely to need changes
.dependency-cruiser.cjs         # Unlikely to need changes
```

**Structure Decision**: Single monorepo project with npm workspaces. No structural changes needed - only dependency version updates and potential configuration compatibility adjustments.

## Complexity Tracking

> No violations - table not needed.

---

## Phase 0: Research Summary

See [research.md](./research.md) for detailed findings.

### Key Decisions

1. **Update Strategy**: Batch update all packages simultaneously, then fix any compatibility issues
2. **Version Pinning**: Continue using exact versions for critical packages, caret ranges for workspace dependencies
3. **Breaking Change Handling**: Address each breaking change iteratively during implementation

### Dependencies to Update

#### Root package.json (devDependencies)

| Package                          | Current | Latest | Breaking Changes                           |
| -------------------------------- | ------- | ------ | ------------------------------------------ |
| @commitlint/cli                  | 20.2.0  | 20.3.1 | Minor - no breaking                        |
| @commitlint/config-conventional  | 20.2.0  | 20.3.1 | Minor - no breaking                        |
| @eslint/js                       | 9.39.1  | 9.39.2 | Patch - no breaking                        |
| @oddessentials/repo-standards    | 6.0.0   | 7.1.1  | **Major** - schema v6→v7, new dependencies |
| @typescript-eslint/eslint-plugin | 8.48.1  | 8.54.0 | Minor - no breaking                        |
| @typescript-eslint/parser        | 8.48.1  | 8.54.0 | Minor - no breaking                        |
| eslint                           | 9.39.1  | 9.39.2 | Patch - no breaking                        |
| globals                          | 16.5.0  | 17.2.0 | **Major** - potential breaking             |
| prettier                         | 3.4.2   | 3.8.1  | Minor - no breaking                        |
| typescript                       | 5.7.3   | 5.9.3  | Minor - new features only                  |
| typescript-eslint                | 8.48.1  | 8.54.0 | Minor - no breaking                        |

#### router/package.json (dependencies)

| Package       | Current | Latest | Breaking Changes                 |
| ------------- | ------- | ------ | -------------------------------- |
| @octokit/rest | ^21.0.0 | 22.0.1 | **Major** - API changes possible |
| commander     | ^13.0.0 | 14.0.2 | **Major** - API changes possible |

#### router/package.json (devDependencies)

| Package     | Current | Latest  | Breaking Changes               |
| ----------- | ------- | ------- | ------------------------------ |
| @types/node | 22.10.7 | 25.0.10 | Major - new Node version types |

### Risk Assessment

1. **High Risk**: @oddessentials/repo-standards v7 - major version, schema changes
2. **Medium Risk**: globals v17 - major version bump, may affect ESLint config
3. **Medium Risk**: @octokit/rest v22 - major version, may need code changes
4. **Medium Risk**: commander v14 - major version, may need CLI code changes
5. **Low Risk**: All other updates are minor/patch versions

### Mitigation Strategy

1. Update low-risk packages first (patches and minors)
2. Update repo-standards v7 and verify compliance
3. Update major version packages one at a time, testing after each
4. Run full verification suite after all updates
