# Code Review Checklist — Phase 407

**Purpose**: Mandatory checklist for all PRs in the 407-local-review-mode feature branch
**Authority**: PR_LESSONS_LEARNED.md (derived from 124 PRs, 704 review comments)
**Enforcement**: PRs failing this checklist WILL be rejected

---

## Reviewer Instructions

Before approving any PR in Phase 407, verify ALL items below. Check each box only after explicit verification. Any unchecked item blocks merge.

**If a requirement cannot be met**, the PR description MUST include:

1. Which requirement is being deviated from
2. Why the deviation is necessary
3. What mitigating controls are in place
4. Sign-off from a second reviewer on the deviation

---

## 🔒 Security Checklist (Non-Negotiable)

### Secret Redaction

- [ ] **All output paths apply redaction** — terminal, JSON, SARIF, logs, JSONL
- [ ] No output formatter bypasses `RedactingFormatter` or equivalent
- [ ] API keys, tokens, bearer tokens, PATs cannot appear in any output
- [ ] Error messages do not echo input values that could be secrets

### Child Process Safety

- [ ] **No `shell: true`** in any `spawn()`, `exec()`, `execFile()` call
- [ ] If `shell: true` is absolutely required: deviation documented and justified
- [ ] User-provided values never concatenated into command strings
- [ ] Command arguments passed as array, not interpolated string

### Path Traversal Prevention

- [ ] All file paths resolved with `path.resolve()` before use
- [ ] Resolved paths validated to stay within repository root
- [ ] Path validation rejects `..` traversal attempts
- [ ] No user input directly used in file operations without validation

### Input Sanitization

- [ ] Git refs validated before passing to git commands
- [ ] No format string injection (user input never used as format specifier)
- [ ] If HTML output exists: no `innerHTML`, `document.write` with user data

---

## 📦 Schema & Contract Checklist

### Output Versioning

- [ ] JSON output includes `schema_version` field
- [ ] SARIF output includes `$schema` reference to SARIF 2.1.0 schema
- [ ] Version field values are valid semver

### Version Synchronization

- [ ] Runtime `--version` output matches `package.json` version
- [ ] No stale VERSION files that could desync
- [ ] Release process updates all version sources

### Schema Evolution

- [ ] New optional fields have sensible defaults
- [ ] Unknown config fields are ignored (not errors)
- [ ] Backward compatibility maintained within major version
- [ ] Breaking changes require major version bump

---

## ⚠️ Error Handling Checklist

### Run Summary

- [ ] Machine-readable status produced even on failure
- [ ] Exit code accurately reflects success/failure state
- [ ] Partial results reported when available

### Configuration Preservation

- [ ] Probe failures do not discard user configuration
- [ ] Fallback behavior uses explicit user settings
- [ ] Original values preserved through error paths

### Promise Handling

- [ ] No floating promises (all awaited or `.catch()` handled)
- [ ] Async errors propagate correctly
- [ ] Error boundaries exist for agent execution

### Value Clamping

- [ ] Cost estimates clamped to non-negative
- [ ] Percentages clamped to 0-100
- [ ] Confidence intervals maintain lower ≤ value ≤ upper

---

## 📝 Documentation Checklist

### Parameter Accuracy

- [ ] `--help` output matches actual CLI behavior
- [ ] README examples use actual parameter names
- [ ] Config file examples use actual field names
- [ ] Copy-paste from docs works without modification

### Test Claims

- [ ] Only claim coverage for what's actually tested
- [ ] Security claims link to specific test files
- [ ] "Tested by automation" vs "verified by design" distinguished

---

## Quick Reference: Top 10 Rejection Reasons

| #   | Issue                   | Detection                                      |
| --- | ----------------------- | ---------------------------------------------- |
| 1   | Secret in output        | grep for API_KEY, token, bearer in test output |
| 2   | `shell: true`           | grep for `shell:\s*true` in source             |
| 3   | Missing schema_version  | Check JSON output structure                    |
| 4   | Path traversal possible | Check path validation before file ops          |
| 5   | Floating promise        | TypeScript strict mode + no-floating-promises  |
| 6   | Stale version           | Compare --version to package.json              |
| 7   | Undocumented param      | Diff --help against README                     |
| 8   | Unredacted error        | Check error messages for echoed input          |
| 9   | Missing run summary     | Verify output on simulated failure             |
| 10  | Unsafe DOM method       | grep for innerHTML, document.write             |

---

## Sign-Off

**Reviewer**: ******\_\_\_******
**Date**: ******\_\_\_******
**PR**: ******\_\_\_******

- [ ] All checklist items verified
- [ ] Any deviations documented and justified
- [ ] PR approved for merge

---

_This checklist is binding for Phase 407. Source: PR_LESSONS_LEARNED.md_
