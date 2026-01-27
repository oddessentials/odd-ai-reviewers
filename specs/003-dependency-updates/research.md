# Research: Update Third-Party Dependencies

**Feature**: 003-dependency-updates
**Date**: 2026-01-27

## Current State Analysis

### Root package.json Dependencies

| Package                          | Current | Purpose                                |
| -------------------------------- | ------- | -------------------------------------- |
| @commitlint/cli                  | 20.2.0  | Commit message linting                 |
| @commitlint/config-conventional  | 20.2.0  | Conventional commits config            |
| @eslint/js                       | 9.39.1  | ESLint core config                     |
| @oddessentials/repo-standards    | 6.0.0   | Org repository standards               |
| @typescript-eslint/eslint-plugin | 8.48.1  | TypeScript ESLint rules                |
| @typescript-eslint/parser        | 8.48.1  | TypeScript ESLint parser               |
| dependency-cruiser               | 17.3.7  | Circular dependency detection          |
| eslint                           | 9.39.1  | JavaScript/TypeScript linting          |
| eslint-plugin-security           | 3.0.1   | Security-focused ESLint rules          |
| globals                          | 16.5.0  | Global variable definitions for ESLint |
| husky                            | 9.1.7   | Git hooks                              |
| lint-staged                      | 16.2.7  | Run linters on staged files            |
| prettier                         | 3.4.2   | Code formatting                        |
| typescript                       | 5.7.3   | TypeScript compiler                    |
| typescript-eslint                | 8.48.1  | Unified typescript-eslint package      |

### Router package.json Dependencies

| Package           | Current | Purpose                        |
| ----------------- | ------- | ------------------------------ |
| @actions/cache    | 5.0.3   | GitHub Actions cache utilities |
| @anthropic-ai/sdk | 0.71.2  | Anthropic Claude API client    |
| @octokit/rest     | ^21.0.0 | GitHub REST API client         |
| commander         | ^13.0.0 | CLI argument parsing           |
| minimatch         | ^10.0.1 | Glob pattern matching          |
| openai            | ^6.0.0  | OpenAI API client              |
| yaml              | ^2.7.0  | YAML parsing                   |
| zod               | ^4.0.0  | Schema validation              |

### Router package.json DevDependencies

| Package             | Current | Purpose                  |
| ------------------- | ------- | ------------------------ |
| @types/node         | 22.10.7 | Node.js type definitions |
| @vitest/coverage-v8 | 4.0.18  | Vitest coverage          |
| typescript          | 5.7.3   | TypeScript compiler      |
| vitest              | ^4.0.0  | Test runner              |

---

## Research Findings

### 1. @oddessentials/repo-standards v6 → v7

**Decision**: Upgrade to v7.1.1
**Rationale**: Latest stable version with new features; maintains backward compatibility for core functionality
**Alternatives Considered**: Stay on v6 (rejected - user explicitly requested v7)

**Changes in v7**:

- Schema version incremented from 5 to 6/7
- New runtime dependencies: @iarna/toml, fast-json-stable-stringify, uuid
- Package size increased from ~100KB to ~1.9MB (includes more config files)
- API remains stable: `getStandards()`, `getSchema()`, `STANDARDS_VERSION`

**Compliance Impact**:

- This package is primarily a read-only policy catalog
- No code changes required for compliance
- Configuration files may reference schema version which updates automatically

### 2. globals v16 → v17

**Decision**: Upgrade to v17.2.0
**Rationale**: Minor breaking changes are isolated to edge cases not used in this project
**Alternatives Considered**: Pin at v16 (rejected - no compatibility issues expected)

**Breaking Changes in v17**:

- Some deprecated globals removed
- `globals.node` remains stable and is the primary usage in this project

**Migration**: None required - `eslint.config.mjs` uses `globals.node` which is unchanged

### 3. @octokit/rest v21 → v22

**Decision**: Update to v22.0.1
**Rationale**: Maintains API compatibility; mostly internal improvements
**Alternatives Considered**: Stay on v21 (rejected - v22 is stable)

**Breaking Changes in v22**:

- Minimum Node version requirement may have changed
- Some deprecated endpoints removed

**Migration**: Verify all Octokit API calls still work after update

### 4. commander v13 → v14

**Decision**: Update to v14.0.2
**Rationale**: CLI interface improvements; breaking changes unlikely to affect usage
**Alternatives Considered**: Stay on v13 (rejected - v14 is stable)

**Breaking Changes in v14**:

- Some deprecated option styles removed
- Stricter validation of command definitions

**Migration**: Verify CLI parsing in `router/src/main.ts` works correctly

### 5. TypeScript 5.7 → 5.9

**Decision**: Upgrade to v5.9.3
**Rationale**: New features, better type inference, no breaking changes
**Alternatives Considered**: None - TypeScript minor versions are safe

**New Features in 5.9**:

- Improved type narrowing
- Better error messages
- Performance improvements

**Migration**: None required - full backward compatibility

### 6. Prettier 3.4 → 3.8

**Decision**: Upgrade to v3.8.1
**Rationale**: Bug fixes and improvements; no breaking changes
**Alternatives Considered**: None - minor version update

**Migration**: Run `npm run format` after update to apply any new formatting rules

### 7. @types/node v22 → v25

**Decision**: Update to v25.0.10
**Rationale**: Aligns type definitions with latest Node.js features
**Alternatives Considered**: Keep at v22.x (rejected - should match Node version target)

**Note**: This project requires Node >=22, so v22.x types are technically sufficient. However, v25 types are backward compatible and provide better type safety for Node 22 features.

---

## Verification Plan

### Pre-Update Checklist

1. ✅ Current `npm audit` shows 0 vulnerabilities
2. ✅ All tests pass (`npm run test`)
3. ✅ All quality gates pass (`npm run verify`)

### Post-Update Verification

1. Run `npm install` (regenerates package-lock.json)
2. Run `npm audit` - verify no new vulnerabilities
3. Run `npm run lint` - verify ESLint compatibility
4. Run `npm run format:check` - verify Prettier compatibility
5. Run `npm run typecheck` - verify TypeScript compatibility
6. Run `npm run depcruise` - verify dependency-cruiser compatibility
7. Run `npm run build` - verify build succeeds
8. Run `npm run test` - verify all tests pass
9. Run `npm run verify` - verify all gates pass

### Rollback Plan

If critical issues arise:

1. Revert package.json changes
2. Delete node_modules and package-lock.json
3. Run `npm install` to restore previous state

---

## npm Override Assessment

**Current Override**:

```json
"overrides": {
  "@actions/glob": {
    "@actions/core": {
      "@actions/http-client": {
        "undici": "^6.23.0"
      }
    }
  }
}
```

**Decision**: Keep override for now
**Rationale**: This patches a transitive dependency vulnerability in undici. After updating all packages, verify if the override is still needed by checking if @actions/cache has updated its dependency chain.

**Post-Update Action**: Run `npm ls undici` to check if the vulnerable version is still present. If not, the override can be removed.
