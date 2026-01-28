# Quickstart: Quality Enforcement

**Feature**: 006-quality-enforcement
**Date**: 2026-01-28

## Implementation Order

Execute tasks in this order to maintain dependencies and enable incremental validation.

### Phase 1: Foundation (P1 Stories - Parallel Safe)

These tasks can be implemented in parallel as they have no interdependencies.

#### 1.1 Fix Broken Documentation Links (US3)

**Files**: `docs/reference/review-team.md`
**Validation**: `npm run docs:manifest && markdown-link-check docs/reference/review-team.md`

1. Update image paths from `img/` to `../img/`
2. Verify all 6 images render correctly
3. Run link checker to confirm

#### 1.2 Configure Auto-Formatting (US2)

**Files**: `.husky/pre-commit`, `package.json` (lint-staged config)
**Validation**: Stage unformatted file, commit, verify formatted

1. Update lint-staged config to run `prettier --write`
2. Ensure formatting runs before linting
3. Test tiered behavior (block on errors, warn on non-formattable)

#### 1.3 Add CI/Local Coverage Thresholds (US1)

**Files**: `router/vitest.config.ts`
**Validation**: `CI=true npm test` vs `npm test` show different thresholds

1. Convert static thresholds to dynamic based on `process.env.CI`
2. Add threshold logging at test start
3. Set CI thresholds slightly higher than local

### Phase 2: CI Infrastructure (P1 Stories - Sequential)

These tasks depend on Phase 1 completion.

#### 2.1 Add Link Check to CI Workflow (US3)

**Files**: `.github/workflows/ci.yml`, `.linkcheckignore.yml`
**Validation**: PR with broken link fails CI

1. Install `markdown-link-check` as dev dependency
2. Add link-check step to CI workflow
3. Create initial `.linkcheckignore.yml` with known exclusions

#### 2.2 Create Badge Update Workflow (US1)

**Files**: `.github/workflows/badge-update.yml`
**Validation**: Merge to main triggers badge update

1. Extract badge generation from ci.yml
2. Create separate workflow triggered on `push` to `main`
3. Add `workflow_run` trigger as fallback

#### 2.3 Add Fresh Clone Test (SC-004)

**Files**: `.github/workflows/ci.yml`
**Validation**: CI job clones fresh and runs test commit

1. Add job that clones repo fresh
2. Run `npm install` and verify hooks installed
3. Create test file, commit, verify formatting applied

### Phase 3: Security Infrastructure (P2 Stories)

These tasks can begin after Phase 1.

#### 3.1 Create Security Logger Module (US6)

**Files**: `router/src/security-logger.ts`, `router/src/__tests__/security-logger.test.ts`
**Validation**: Unit tests pass, no raw patterns in output

1. Implement `SecurityEvent` schema with Zod
2. Add `hashPattern()` using SHA-256
3. Implement fail-safe logging with stderr fallback
4. Add comprehensive unit tests

#### 3.2 Create ReDoS Pattern Corpus (US5)

**Files**: `router/tests/fixtures/redos-corpus/v1.json`
**Validation**: Corpus validates against schema

1. Research and curate 50+ patterns from OWASP/CWE
2. Create JSON file with required metadata
3. Add validation test that loads and validates corpus

#### 3.3 Add Pattern Validator Tests (US5)

**Files**: `router/src/__tests__/pattern-validator.test.ts`
**Validation**: All corpus patterns produce expected results

1. Create table-driven tests from corpus
2. Test all categories (nested quantifiers, backtracking, etc.)
3. Add golden tests for error codes and messages

### Phase 4: Documentation (P2 Stories)

Can be done in parallel with Phase 3.

#### 4.1 Create ReDoS Threat Model Document (US4)

**Files**: `docs/security/regex-threat-model.md`
**Validation**: Security reviewer can identify trust levels

1. Document all regex pattern sources in codebase
2. Create data flow diagram showing input → regex compilation
3. Mark trust boundaries (repo-controlled vs PR-controlled)
4. Add code comment examples

#### 4.2 Add Trust Level Code Comments (US4)

**Files**: Various files in `router/src/`
**Validation**: Comments present at all pattern construction sites

1. Identify all `new RegExp()` call sites
2. Add trust level comments
3. Update Semgrep baseline if needed

---

## Validation Checklist

### Pre-Merge Validation

- [ ] All CI checks pass (lint, format, typecheck, test+coverage, link-check)
- [ ] Coverage thresholds enforced (CI threshold >= local)
- [ ] No broken internal links or images
- [ ] Pre-commit hook auto-formats staged files
- [ ] Security logger module has 100% test coverage
- [ ] Pattern corpus validates against schema

### Post-Merge Validation

- [ ] Badge update workflow triggers on merge
- [ ] README badges reflect current coverage
- [ ] Fresh clone test passes in CI

### Manual Verification

- [ ] Clone repo fresh, run `npm install`, verify hooks installed
- [ ] Stage unformatted file, commit, verify auto-formatted
- [ ] Read threat model document, identify trust level in <5 min

---

## Dependency Installation

```bash
# Add link checker (dev dependency)
npm install -D markdown-link-check

# Verify existing dependencies
npm ls husky lint-staged prettier vitest
```

---

## Key Configuration Files

| File                                 | Purpose                               |
| ------------------------------------ | ------------------------------------- |
| `router/vitest.config.ts`            | Coverage thresholds (source of truth) |
| `.husky/pre-commit`                  | Pre-commit hook script                |
| `package.json` → `lint-staged`       | Staged file processing rules          |
| `.linkcheckignore.yml`               | External link allowlist               |
| `.github/workflows/ci.yml`           | PR quality gates                      |
| `.github/workflows/badge-update.yml` | Post-merge badge updates              |
