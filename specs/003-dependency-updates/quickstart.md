# Quickstart: Update Third-Party Dependencies

**Feature**: 003-dependency-updates

## Overview

This feature updates all third-party dependencies to their latest versions, with particular focus on upgrading @oddessentials/repo-standards from v6 to v7.

## Implementation Order

### Phase 1: Low-Risk Updates (Patches & Minors)

Update packages with minimal breaking change risk:

```bash
# Root devDependencies - patches
npm install @eslint/js@9.39.2 eslint@9.39.2 --save-dev

# Root devDependencies - minors
npm install @commitlint/cli@20.3.1 @commitlint/config-conventional@20.3.1 --save-dev
npm install @typescript-eslint/eslint-plugin@8.54.0 @typescript-eslint/parser@8.54.0 typescript-eslint@8.54.0 --save-dev
npm install prettier@3.8.1 typescript@5.9.3 --save-dev

# Router dependencies (already using caret ranges - will update automatically)
# Router devDependencies
npm install @types/node@25.0.10 --save-dev --workspace=router
```

### Phase 2: Major Version Updates

Update packages with potential breaking changes one at a time:

```bash
# 1. globals (ESLint global definitions)
npm install globals@17.2.0 --save-dev
npm run lint  # Verify ESLint still works

# 2. @oddessentials/repo-standards
npm install @oddessentials/repo-standards@7.1.1 --save-dev
# Verify compliance (package is read-only, no code changes expected)

# 3. @octokit/rest
npm install @octokit/rest@22.0.1 --workspace=router
npm run typecheck  # Verify API compatibility
npm run test       # Verify integration works

# 4. commander
npm install commander@14.0.2 --workspace=router
npm run build      # Verify CLI builds
npm run test       # Verify CLI works
```

### Phase 3: Verification

Run full verification suite:

```bash
npm run verify     # lint, format:check, typecheck, depcruise, build
npm run test       # All tests
npm audit          # Security check
```

## Key Files to Monitor

| File                     | Reason                            |
| ------------------------ | --------------------------------- |
| `eslint.config.mjs`      | May need updates for globals v17  |
| `router/src/main.ts`     | CLI entry point - commander usage |
| `router/src/report/*.ts` | Octokit REST API usage            |

## Verification Commands

```bash
# Full verification (CI equivalent)
npm run verify && npm run test

# Individual checks
npm run lint -- --max-warnings 0    # Zero-tolerance lint
npm run format:check                 # Prettier formatting
npm run typecheck                    # TypeScript compilation
npm run depcruise                    # Circular dependencies
npm run build                        # Production build
npm run test                         # Test suite
npm audit                            # Security vulnerabilities
```

## Rollback

If issues arise:

```bash
git checkout -- package.json package-lock.json router/package.json
rm -rf node_modules router/node_modules
npm install
```

## Success Criteria

- [ ] `npm outdated` shows no outdated packages
- [ ] `npm audit` shows no high/critical vulnerabilities
- [ ] `npm run verify` passes
- [ ] `npm run test` passes
- [ ] @oddessentials/repo-standards is at v7.x.x
