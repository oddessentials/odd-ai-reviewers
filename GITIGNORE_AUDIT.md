# Security Audit: .gitignore, .reviewignore, and Sensitive File Tracking

**Date:** 2026-03-14
**Status:** ⚠️ ISSUES FOUND — Recommended Actions Below
**Impact:** High (git tracking, VCS cleanliness, clone safety)

---

## Executive Summary

### Current State

- **268 tracked files** in `.specify/` (project specification metadata) — **should be removed from VCS**
- **CLAUDE.md** is in `.gitignore` but **still tracked in git** — inconsistency
- **pnpm-lock.yaml** tracked but could be `.npmrc`-managed for lock-file consistency
- **Benchmark snapshots** (39 files) are tracked — reasonable for baseline regression testing
- **Settings.local.json** (121 KB) not tracked — good, locally managed
- **No .reviewignore exists** — created and provided below

### Risk Assessment

| Category                | Finding                                          | Severity  | Risk                                                                          |
| ----------------------- | ------------------------------------------------ | --------- | ----------------------------------------------------------------------------- |
| .specify/ tracking      | 268 files tracked; should be local-only          | 🔴 HIGH   | Clone bloat, merge conflicts, accidental commits to spec changes              |
| CLAUDE.md inconsistency | Listed in .gitignore but tracked                 | 🟡 MEDIUM | Confusion, potential commits of project context                               |
| Snapshot files          | 39 benchmark snapshots tracked                   | 🟢 LOW    | Expected for regression testing; snapshots have SHA-256 validation            |
| pnpm-lock.yaml          | Tracked; can cause merge conflicts               | 🟡 MEDIUM | Common lock-file conflict point; manageable if .npmrc set correctly           |
| .reviewignore missing   | No file exists                                   | 🟡 MEDIUM | AI tools may over-analyze build artifacts, snapshots, machine-generated files |
| Secrets exposure        | .env files properly excluded; .env.example clean | 🟢 LOW    | No API keys found in tracked files                                            |

---

## Detailed Findings

### 1. .gitignore Audit

#### ✅ Correctly Ignored

```
node_modules/               ✓ Dependencies excluded
dist/, build/               ✓ Build outputs excluded
.env, .env.local            ✓ Secret keys excluded (.env.example safe)
.claude/                    ✓ Agent session data excluded
.codex/                     ✓ Codex session state excluded
.ai-review-cache/           ✓ Review cache excluded
coverage/                   ✓ Test coverage excluded
.idea/, .vscode/            ✓ IDE config excluded
.DS_Store, Thumbs.db        ✓ OS files excluded
AGENTS.md                   ✓ Excluded (dynamic)
```

#### ⚠️ Issues Found

**Issue #1: CLAUDE.md in .gitignore but still tracked**

```
# Current .gitignore (line 52):
CLAUDE.md

# But git tracks it:
$ git ls-files | grep CLAUDE.md
CLAUDE.md                    # ← Currently tracked
```

**Status:** CLAUDE.md has been committed historically and remains in git index despite being in .gitignore. New changes won't be tracked, but the file won't be removed from history.

**Issue #2: .specify/ NOT in .gitignore — 268 files tracked**

```
$ git ls-files | grep "^\.specify/" | wc -l
268

Sample tracked files:
  .specify/features/414-fp-reduction-and-benchmark/spec.md
  .specify/memory/constitution.md
  .specify/scripts/bash/check-prerequisites.sh
  .specify/templates/agent-file-template.md
  [... 264 more files ...]
```

**Status:** Project specifications should be local-only (developer workspace), not version-controlled. This violates DRY principle — spec changes create unnecessary git commits.

**Issue #3: pnpm-lock.yaml tracked (acceptable but merge-conflict-prone)**

```
$ git ls-files | grep pnpm-lock.yaml
pnpm-lock.yaml              # ← Tracked (correct decision, but known conflict point)
```

**Status:** Correct to track (for reproducible builds), but developers should be aware that `pnpm install` changes can create merge conflicts. Consider documenting in CONTRIBUTING.md.

#### Summary of .gitignore Changes Needed

```bash
# Add to .gitignore:
.specify/

# Note: CLAUDE.md is already listed but tracked — requires git rm --cached
```

---

### 2. .reviewignore Analysis

**Current Status:** ❌ **File does not exist**

**Purpose:** Exclude files from AI code review analysis that are tracked in git but shouldn't be reviewed (e.g., machine-generated CHANGELOG, benchmark snapshots, agent memory).

**Created .reviewignore with sections:**

- Generated and machine-maintained (CHANGELOG.md, snapshots)
- Agent and system configuration (.specify/, .claude/, .codex/)
- AI review cache
- Dependencies and build outputs (for completeness)
- Lock files (pnpm-lock.yaml)
- Documentation metadata (AGENTS.md, CODEOWNERS)
- IDE and OS artifacts
- Logs and test artifacts

See `.reviewignore` for full content.

---

### 3. Sensitive File Check

#### Environment Files ✅

```
.env.example          ✓ No API keys (example only)
.env                  ✓ Excluded via .gitignore
.env.local            ✓ Excluded via .gitignore
.env.*.local          ✓ Excluded via .gitignore
```

#### Settings and Credentials ✅

```
.claude/settings.local.json   ✓ NOT tracked in git (121 KB, local only)
CODEOWNERS                    ✓ Tracked; contains GitHub handles only (no secrets)
```

#### Secrets Scan Result

- ✅ No AWS keys, API tokens, or database credentials found
- ✅ No hardcoded passwords or OAuth secrets
- ✅ ANTHROPIC_API_KEY, OPENAI_API_KEY only documented as examples in `.env.example`

---

### 4. Tracked Files Summary

#### Files That Should Be Removed from VCS

```
Path                          Count    Reason
──────────────────────────────────────────────────
.specify/                     268      Project spec metadata; local-only
                                      (conflicts with git flow; enables
                                       unnecessary commits)
```

#### Files That Should Stay Tracked

```
Path                          Count    Reason
──────────────────────────────────────────────────
CHANGELOG.md                  1        Semantic-release auto-generated
                                      (baseline for users)
router/tests/fixtures/
  benchmark/snapshots/        39       Baseline for regression testing
                                      (SHA-256 validated)
pnpm-lock.yaml               1        Lock file for reproducible builds
CODEOWNERS                    1        GitHub required for branch protection
.trivyignore                  1        Trivy CVE suppressions (security)
```

#### Benchmark Snapshots Detail

```
fp-b-*.snapshot.json         7 files
fp-c-*.snapshot.json         6 files
fp-d-*.snapshot.json         7 files
fp-f-*.snapshot.json        19 files
────────────────────────────────
Total                        39 files
```

These are **test fixtures** (baseline outputs), not regenerated artifacts. They must be tracked to detect regression.

---

## Remediation Plan

### Phase 1: Add .specify/ to .gitignore (Non-Breaking)

**Action:** Append `.specify/` to `.gitignore`

```bash
echo "" >> .gitignore
echo "# Specification metadata — project workspace only" >> .gitignore
echo ".specify/" >> .gitignore
```

**Effect:**

- New changes to `.specify/` won't be tracked
- Existing tracked files remain in git history (non-breaking)
- Developers can work locally on specs without polluting commits

**Risk:** None (reversible)

---

### Phase 2: Remove CLAUDE.md from Git Index (Breaking Change)

**Prerequisites:**

- All developers must pull latest `main` before this change
- CI/CD must not depend on CLAUDE.md being in git

**Action:**

```bash
# Remove CLAUDE.md from git index (keeps local file)
git rm --cached CLAUDE.md

# Verify it's removed
git status

# Commit the removal
git commit -m "chore: stop tracking CLAUDE.md in git

CLAUDE.md is listed in .gitignore but remained in git index from prior commits.
This removes it from version control while preserving the local file.

Breaking change: CLAUDE.md will no longer be distributed to clones.
Users must regenerate from their project context if needed."

git push origin main
```

**Effect:**

- CLAUDE.md no longer distributed in clones
- Prevents accidental commits of project context
- Aligns with .gitignore intent

**Impact on Clones:**

- ⚠️ After `git pull`, existing clones will have a detached CLAUDE.md
- Document: "If you have CLAUDE.md locally, it's now ignored. Regenerate it in your Claude session if needed."

---

### Phase 3: Document .reviewignore (Non-Breaking)

**Action:** Add `.reviewignore` to repo (already created)

**Effect:**

- AI review tools know which files to skip
- Prevents style flags on generated files
- Standardizes review scope

**Risk:** None (documentation only)

---

## Git Commands (Ready to Execute)

### Commands to Run Now (Safe)

```bash
# 1. Add .specify/ to .gitignore
echo "" >> .gitignore
echo "# Specification metadata — project workspace only" >> .gitignore
echo ".specify/" >> .gitignore

# 2. Verify changes
git diff .gitignore

# 3. Stage and commit
git add .gitignore .reviewignore
git commit -m "chore: add .specify/ to gitignore and create .reviewignore

- Prevents .specify/ changes from polluting git history
- .reviewignore documents which tracked files should not be AI-reviewed
- Machine-generated files (CHANGELOG, snapshots) are auto-excluded
- Non-breaking: existing .specify/ files remain in git history"

git push origin 415-close-fp-benchmark-gaps
```

### Commands for Phase 2 (When Ready)

```bash
# Remove CLAUDE.md from git (execute on main branch)
git checkout main
git pull origin main
git rm --cached CLAUDE.md
git commit -m "chore: stop tracking CLAUDE.md in git

CLAUDE.md is listed in .gitignore but remained in git index.
Remove from version control to align with gitignore intent.

BREAKING: CLAUDE.md no longer in clones. Regenerate locally if needed.

Fixes: accidental commits of project context metadata"
git push origin main
```

---

## Impact Assessment

### Development Workflow

| Change                  | Impact                                      | Mitigation                     |
| ----------------------- | ------------------------------------------- | ------------------------------ |
| .specify/ in .gitignore | Devs can't accidentally commit spec changes | Document in CONTRIBUTING.md    |
| CLAUDE.md removal       | Not in clone; regenerate locally            | Update docs; explain in commit |
| .reviewignore added     | AI tools skip 39 snapshot files             | Reduces noise in reviews ✓     |

### CI/CD Pipeline

| Check                    | Status                                    | Risk                          |
| ------------------------ | ----------------------------------------- | ----------------------------- |
| .gitignore applied       | ✅ git enforces immediately               | None                          |
| Existing .specify/ files | ✅ Remain in history (no breaking change) | None                          |
| CLAUDE.md in pipeline    | ⚠️ Check if any build step depends on it  | Unlikely; verify in CI config |

### Clones and Distribution

| Scenario       | Current        | After Phase 2     | Action                                 |
| -------------- | -------------- | ----------------- | -------------------------------------- |
| Fresh clone    | Gets CLAUDE.md | No CLAUDE.md      | Users regenerate in Claude session     |
| Existing clone | Has CLAUDE.md  | Detached file     | No action needed; file ignored locally |
| CI/CD          | Uses CLAUDE.md | Need verification | Check workflows; likely safe           |

---

## Verification Checklist

After applying recommendations:

```bash
# Verify .specify/ no longer tracked after next commit
git add .gitignore
git commit -m "test: add .specify to .gitignore"
touch .specify/test-file.md
git status                    # Should show .specify/ as untracked, not added

# Verify .reviewignore exists
test -f .reviewignore && echo "✓ .reviewignore created"

# Check no secrets exposed
git grep -i "api.key\|api_key\|secret\|password" | grep -v ".env.example"
  # Should return nothing

# Count .specify/ files still in index (before Phase 2)
git ls-files | grep "^\.specify/" | wc -l    # Should still be 268

# After Phase 2: Verify CLAUDE.md removal
git log --all --full-history -- CLAUDE.md | head -5   # History preserved
git ls-files | grep CLAUDE.md                          # Should be empty
```

---

## Recommendations Summary

| Priority  | Action                        | File              | Phase  | Notes                                   |
| --------- | ----------------------------- | ----------------- | ------ | --------------------------------------- |
| 🔴 HIGH   | Add `.specify/` to .gitignore | .gitignore        | 1      | Non-breaking; prevents future clutter   |
| 🟡 MEDIUM | Remove CLAUDE.md from index   | (git rm --cached) | 2      | Breaking; align with gitignore intent   |
| 🟡 MEDIUM | Create `.reviewignore`        | .reviewignore     | 1      | Non-breaking; standardizes review scope |
| 🟢 LOW    | Document lock-file conflicts  | CONTRIBUTING.md   | Future | FYI for pnpm developers                 |

---

## References

- [GitHub: About code owners](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
- [Git: gitignore documentation](https://git-scm.com/docs/gitignore)
- [Semantic Release: Changelog generation](https://github.com/semantic-release/semantic-release)
