# Quickstart: Repository Health & Maintainability Overhaul

**Feature**: 416-repo-health-overhaul
**Date**: 2026-03-15

## Prerequisites

- Node.js >= 22.0.0
- pnpm 10.x (installed via corepack)
- Git with Husky hooks initialized (`pnpm prepare`)
- Clean working tree (no uncommitted changes)

## Implementation Order

This feature should be implemented in the following order. Each phase is independently deployable and testable.

### Phase 1: Hook Restructuring + Secret Guard (no file moves)

**Files changed**: `.husky/pre-commit`, `.husky/pre-push`

```bash
# 1. Verify current hooks work
git stash && git push --dry-run  # Should run all 7 checks
git stash pop

# 2. Apply hook changes (edit files per contract)

# 3. Verify new hooks
git commit --allow-empty -m "test: verify pre-commit hook timing"
# Expected: <30 seconds, runs lint-staged + tsc + secret guard

git push --dry-run
# Expected: <4 minutes, runs depcruise + build + test only

# 4. Verify secret guard
echo "SECRET=test" > .env.local
git add -f .env.local
git commit -m "test: should fail"
# Expected: Rejected with clear error message
git reset HEAD .env.local && rm .env.local
```

### Phase 2: Test Migration (bulk file move + config update)

**Files changed**: 79 test files moved, `router/vitest.config.ts`

```bash
# 1. Baseline — capture current test results
cd router && pnpm test 2>&1 | tail -5  # Note: X tests, Y passed

# 2. Create domain directories
mkdir -p tests/unit/{agents,config,report,phases,types,cli,core}

# 3. Move files (automated script recommended)
# For each file in src/__tests__/*.test.ts:
#   - Determine domain from import paths
#   - Move to tests/unit/{domain}/
#   - Update relative imports (../ → ../../src/)

# 4. Update vitest.config.ts
# - include: ['tests/**/*.test.ts']
# - coverage.exclude: ['node_modules', 'dist']

# 5. Verify zero regressions
pnpm test  # Must match baseline count exactly
pnpm exec tsc --noEmit  # Must pass

# 6. Delete empty directory
rm -rf src/__tests__/
```

### Phase 3: Configuration Files (.reviewignore, .gitignore, .nvmrc, CLAUDE.md)

**Files changed**: `.reviewignore` (new), `.gitignore`, `.nvmrc` (new), `CLAUDE.md`

```bash
# 1. Create .reviewignore (copy from spec)
# 2. Update .gitignore (add .specify/ subdirectories)
# 3. Untrack generated files
git rm --cached -r .specify/features/ .specify/templates/ .specify/scripts/
# 4. Create .nvmrc
echo "22" > .nvmrc
# 5. Fix CLAUDE.md header (remove "Auto-generated" claim)
# 6. Verify governance doc still tracked
git ls-files .specify/memory/constitution.md  # Must show file
```

### Phase 4: Spec Archival

**Files changed**: 20 spec directories moved, `scripts/check-spec-test-links.cjs`

```bash
# 1. Cross-reference audit
grep -r "specs/001-" . --include="*.md" | grep -v node_modules
grep -r "specs/004-" . --include="*.md" | grep -v node_modules
# ... (repeat for all 20 directories)

# 2. Update any found references

# 3. Create archive and move
mkdir -p specs/archive
mv specs/001-* specs/archive/
mv specs/004-* specs/005-* specs/006-* specs/007-* specs/008-* specs/009-* specs/archive/
mv specs/010-* specs/011-* specs/012-* specs/archive/
mv specs/405-* specs/406-* specs/archive/

# 4. Update spec:linkcheck to scan archive
# Edit scripts/check-spec-test-links.cjs to also scan specs/archive/*/spec.md

# 5. Verify
pnpm spec:linkcheck  # Must pass
```

### Phase 5: Badge Workflow Hardening

**Files changed**: `.github/workflows/badge-update.yml`

```bash
# 1. Add artifact validation step before badge generation
# 2. Test by triggering workflow manually (workflow_dispatch if available)
# 3. Verify badge URLs still resolve after next main push
```

## Verification Commands

```bash
# Full verification after all phases
pnpm verify                    # lint + format + typecheck + depcruise + build
pnpm --filter ./router test    # All tests pass (4,291+)
pnpm spec:linkcheck            # No broken spec links
pnpm docs:linkcheck            # No broken doc links
git ls-files src/__tests__/    # Empty (all tests migrated)
git ls-files .specify/features/ # Empty (untracked)
cat .nvmrc                     # "22"
cat .reviewignore              # Exclusion patterns present
```

## Estimated Effort

| Phase                       | Effort         | Risk                               |
| --------------------------- | -------------- | ---------------------------------- |
| Phase 1: Hook restructuring | 1-2 hours      | Low (config changes only)          |
| Phase 2: Test migration     | 4-6 hours      | Medium (79 files, import rewrites) |
| Phase 3: Config files       | 1 hour         | Low (new files + minor edits)      |
| Phase 4: Spec archival      | 2-3 hours      | Medium (cross-reference audit)     |
| Phase 5: Badge hardening    | 30 minutes     | Low (workflow edit)                |
| **Total**                   | **9-12 hours** |                                    |
