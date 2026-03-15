# Research: Quality Enforcement

**Feature**: 006-quality-enforcement
**Date**: 2026-01-28

## Research Topics

### 1. Vitest CI/Local Threshold Split

**Decision**: Use environment detection in `vitest.config.ts` with `process.env.CI`

**Rationale**: Vitest config supports dynamic configuration via function export. The `CI` environment variable is automatically set by GitHub Actions and is the industry standard for detecting CI environments. This avoids false positives on Linux developer machines.

**Implementation Pattern**:

```typescript
export default defineConfig({
  test: {
    coverage: {
      thresholds:
        process.env.CI === 'true'
          ? { statements: 67, branches: 63, functions: 70, lines: 68 } // CI (stricter)
          : { statements: 65, branches: 60, functions: 68, lines: 66 }, // Local (baseline)
    },
  },
});
```

**Alternatives Considered**:

- Separate config files (`vitest.config.ci.ts`) - Rejected: configuration drift risk
- Custom `COVERAGE_MODE` env var - Rejected: non-standard, requires additional setup
- Hostname detection - Rejected: fragile, false positives

---

### 2. lint-staged Auto-Formatting Configuration

**Decision**: Configure lint-staged to run Prettier with `--write` flag on staged files

**Rationale**: lint-staged already runs on pre-commit. Adding `prettier --write` to the pipeline auto-formats staged files and re-stages them. This is the standard pattern for auto-formatting.

**Implementation Pattern**:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,json,md,yml,yaml}": ["prettier --write"],
    "*.{ts,tsx}": ["eslint --fix --max-warnings 0"]
  }
}
```

**Alternatives Considered**:

- Prettier as separate hook - Rejected: more complexity, slower
- Format on save (editor config) - Rejected: not enforceable, inconsistent

---

### 3. Markdown Link Checking Tool

**Decision**: Use `markdown-link-check` npm package with configuration file

**Rationale**: Well-maintained, configurable, supports internal and external links, can be run in CI and locally. Supports ignore patterns via config file.

**Implementation Pattern**:

- Install: `npm install -D markdown-link-check`
- Config: `.markdown-link-check.json` with `ignorePatterns` for allowlisted URLs
- CI: `find docs -name '*.md' -exec markdown-link-check {} \;`

**Alternatives Considered**:

- `linkcheck` (Go binary) - Rejected: additional toolchain dependency
- Custom script - Rejected: maintenance burden
- GitHub Action only - Rejected: no local parity

**Note**: For external link allowlist, use `.linkcheckignore.yml` as specified in FR-013, mapping to `markdown-link-check` config.

---

### 4. ReDoS Corpus Sources

**Decision**: Curate from OWASP ReDoS examples and CWE-1333 references

**Rationale**: Authoritative sources with documented attack patterns. Patterns are well-understood and provide good coverage of common vulnerability classes.

**Sources**:

- OWASP ReDoS Prevention Cheat Sheet
- CWE-1333: Inefficient Regular Expression Complexity
- safe-regex test corpus (npm package reference patterns)

**Corpus Structure** (per FR-020):

```json
{
  "version": "1.0.0",
  "source_urls": [
    "https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS",
    "https://cwe.mitre.org/data/definitions/1333.html"
  ],
  "retrieved_at": "2026-01-28",
  "curation_rules": "Patterns must demonstrate exponential backtracking with proof-of-concept inputs",
  "patterns": [
    {
      "id": "redos-001",
      "pattern": "(a+)+$",
      "category": "nested_quantifiers",
      "expected_result": "reject",
      "error_code": "REDOS_NESTED_QUANTIFIER",
      "source": "OWASP"
    }
  ]
}
```

**Alternatives Considered**:

- Dynamic fetch from OWASP - Rejected: network dependency, non-reproducible
- safe-regex patterns only - Rejected: limited coverage

---

### 5. Security Event Logging Pattern

**Decision**: Single-module pattern with structured event emission and SHA-256 hashing

**Rationale**: Centralized logging ensures consistent schema, prevents pattern leakage, and provides single aggregation point for monitoring.

**Implementation Pattern**:

```typescript
// security-logger.ts
import { createHash } from 'crypto';

export interface SecurityEvent {
  category: 'regex_validation' | 'mitigation_applied' | 'mitigation_failed';
  ruleId: string;
  file: string;
  patternHash: string; // SHA-256, never raw pattern
  durationMs: number;
  outcome: 'success' | 'failure' | 'timeout';
  errorReason?: 'invalid_regex' | 'timeout' | 'runtime_error';
}

export function hashPattern(pattern: string): string {
  return createHash('sha256').update(pattern).digest('hex').slice(0, 16);
}

export function logSecurityEvent(event: SecurityEvent): void {
  // Emit to console in structured format
  // Fail-safe: catch errors, emit to stderr, continue
}
```

**Alternatives Considered**:

- Distributed logging across modules - Rejected: inconsistent schema, hard to audit
- External logging service - Rejected: adds dependency, network requirement
- EventEmitter pattern - Rejected: more complexity for same result

---

### 6. Badge Update Workflow Trigger

**Decision**: Separate workflow triggered on `push` to `main`

**Rationale**: Decouples badge update from PR validation. Badge updates can fail (Gist API issues) without blocking PRs. Uses existing Gist-based badge infrastructure.

**Implementation Pattern**:

```yaml
# .github/workflows/badge-update.yml
name: Update Badges
on:
  push:
    branches: [main]
  workflow_run:
    workflows: ['CI']
    types: [completed]
    branches: [main]
```

**Alternatives Considered**:

- Badge update in PR workflow - Rejected: couples PR to Gist availability
- Manual badge updates - Rejected: human error, stale badges

---

### 7. Documentation Link Integrity - Broken Images Fix

**Decision**: Fix relative paths in `docs/reference/review-team.md` to use `../img/` prefix

**Rationale**: Images are located at `docs/img/` but `review-team.md` is at `docs/reference/review-team.md`. Current paths (`img/...`) resolve from the file's directory, not docs root.

**Current (broken)**:

```html
<img src="img/ollama.png" ... />
```

**Fixed**:

```html
<img src="../img/ollama.png" ... />
```

**Verification**: Run link checker after fix to confirm resolution.

---

## Summary

All research items resolved. No NEEDS CLARIFICATION markers remain. Ready for Phase 1 design.

| Topic               | Decision                                       | Confidence |
| ------------------- | ---------------------------------------------- | ---------- |
| CI/Local thresholds | `process.env.CI` detection in vitest.config.ts | High       |
| Auto-formatting     | lint-staged with `prettier --write`            | High       |
| Link checking       | markdown-link-check with config                | High       |
| ReDoS corpus        | OWASP/CWE sourced vendored JSON                | High       |
| Security logging    | Single module with SHA-256 hashing             | High       |
| Badge workflow      | Separate post-merge workflow                   | High       |
| Broken links fix    | Relative path correction                       | High       |
