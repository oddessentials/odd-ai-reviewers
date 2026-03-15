# Test Suite Architecture Audit — Task #3

**Date:** 2026-03-14 | **Auditor:** qa-architect

---

## Executive Summary

The test suite exhibits **significant architectural debt** from organic growth across three locations with inconsistent patterns. While test coverage is comprehensive, the architecture creates maintenance burden and obscures test governance.

**Critical Issues:** 3 | **High Issues:** 5 | **Medium Issues:** 6

---

## 1. Test Location Architecture

### Current State

Test files distributed across **FOUR primary locations**:

| Location                                                    | Count   | Pattern                | Status            |
| ----------------------------------------------------------- | ------- | ---------------------- | ----------------- |
| `router/src/__tests__/`                                     | 79      | Co-located with source | ⚠️ Mixed purposes |
| `router/tests/unit/`                                        | 45      | Domain-organized       | ✅ Structured     |
| `router/tests/integration/`                                 | 10      | Integration scenarios  | ✅ Intentional    |
| `router/tests/schema/`, `.../security/`, `.../reliability/` | 13      | Specialized suites     | ✅ Focused        |
| `scripts/__tests__/`                                        | 2       | Build scripts          | ✅ Isolated       |
| `tests/docs-viewer/`                                        | 5       | Docs viewer            | ✅ Isolated       |
| **TOTAL**                                                   | **154** |                        |                   |

### Critical Problem #1: Double Test Execution

The vitest config includes **BOTH** co-located and unit tests:

```typescript
// router/vitest.config.ts
include: ['src/**/*.test.ts', 'tests/**/*.test.ts'];
```

**Impact:**

- 79 co-located tests + 68 unit tests = 147 tests run per `pnpm test`
- **Same functionality tested twice** — no clear ownership
- Coverage reporting excludes co-located tests, hiding execution redundancy
- Difficult to track which test "owns" a module

**Conflict with coverage config:**

```typescript
// Coverage explicitly EXCLUDES co-located tests
exclude: ['src/**/*.test.ts', 'src/__tests__/**/*', ...]
```

→ Tests are **run but not counted** — creates blind spot about actual coverage

### Critical Problem #2: Test Organization Inconsistency

**Config tests (3 locations, 761 total lines):**

- `router/src/__tests__/config.test.ts` — 403 lines (schema parsing)
- `router/tests/unit/config.test.ts` — 221 lines (error handling)
- `router/tests/unit/config/schemas.test.ts` — 137 lines (Zod schemas)

→ **Unclear ownership:** Which test handles which concern?

**Report tests (scattered):**

- Co-located: `report.test.ts`, `report/deduplication.test.ts`, `report_formats.test.ts`
- Unit: `report/finding-validator.test.ts`, `report/terminal.test.ts`, `report/framework-pattern-filter.test.ts`
- Total: 6+ test files for one module

**ADO tests (4 locations):**

- `ado.test.ts`, `ado-line-validation.test.ts`, `ado-multiline-payload.test.ts`, `ado_trust.test.ts`

→ No clear separation between unit/integration/behavior tests

### High Issue #1: Control Flow Coverage Gaps

**Missing unit test files** (4 modules):

- `cfg-types.ts` — Type definitions, may be untested
- `mitigation-patterns.ts` — Pattern definitions, may be untested
- `safe-source-patterns.ts` — Safe patterns, may be untested
- `timeout-regex.ts` — Regex logic, may be untested

**Impact:** Critical modules for security analysis may lack explicit test coverage.

---

## 2. Vitest Configuration Assessment

### Coverage Thresholds

**Current:**
| Metric | CI | Local |
|--------|----|----|
| Statements | 65% | 60% |
| Branches | 60% | 55% |
| Functions | 68% | 63% |
| Lines | 66% | 61% |

**Assessment:**

- ✅ CI/local gap (5%) appropriate for development iteration
- ⚠️ Function threshold (68%) highest — unusual (typically functions easiest to cover)
- ⚠️ Branch coverage (60% CI) significantly lower than statements (65%) — may indicate:
  - Deep nesting in untested error paths
  - Complex conditional logic in non-critical paths
  - Legitimate test-difficult scenarios (network calls, race conditions)

### Setup.ts Configuration

✅ **Appropriate:** Handles EPERM sandboxing issues in Windows/Linux CI environments

- Wraps `child_process.execFileSync()` and `execSync()` to coerce exit code 0 with stdout
- Prevents false negatives in git/grep tests

### Missing Coverage Areas

Based on vitest config exclude patterns:

| Area                            | Status                 | Notes                |
| ------------------------------- | ---------------------- | -------------------- |
| `src/**/*.test.ts` (co-located) | Excluded from coverage | 79 tests not counted |
| `src/__tests__/**/*`            | Explicitly excluded    | By design?           |
| `dist/`                         | Excluded               | ✅ Correct           |

---

## 3. Fixture Organization

### Benchmark Suite

**Structure:**

```
router/tests/fixtures/benchmark/
├── regression-suite.json          (856 lines, 43+ scenarios)
├── snapshots/
│   ├── fp-b-*.snapshot.json       (7 files — category B)
│   ├── fp-c-*.snapshot.json       (6 files — category C)
│   ├── fp-d-*.snapshot.json       (7 files — category D)
│   ├── fp-f-*.snapshot.json       (17 files — category F)
└── mock-results/
    └── summary.json
```

**Assessment:**

- ✅ Clear categorization by false-positive pattern type
- ⚠️ **Medium Issue #1: 37 separate JSON files** — DRY violation
  - Each snapshot is independently maintained
  - No unified schema for version tracking
  - No cross-snapshot validation
  - Difficult to bulk update findings format

**Recommendation:** Consolidate to `snapshots.json` with indexed array:

```json
{
  "snapshots": [
    { "id": "fp-b-001", "metadata": {...}, "expected": [...] },
    ...
  ]
}
```

### ReDoS Corpus

```
router/tests/fixtures/redos-corpus/
└── v1.json                        (ReDoS pattern library)
```

✅ **Well-organized:** Single versioned file, clear purpose

### Missing Fixture Documentation

⚠️ **Medium Issue #2: No fixture README**

- No explanation of snapshot categories (B, C, D, F)
- No guidance on snapshot format versioning
- No rotation/deprecation policy
- Pattern meanings undocumented

---

## 4. Test Utilities Assessment

### test-utils.ts

**Available helpers:**

- `assertDefined<T>()` — Runtime null-check with type narrowing
- `createTestControlFlowConfig()` — Control flow config factory
- `createTestConfig()` — Minimal Config object
- `createTestAgentContext()` — Full AgentContext factory
- `createTestDiffFile()` — DiffFile builder

**Assessment:**

- ✅ Type-safe factories eliminate non-null assertions
- ✅ Partial overrides support flexible test setup
- ⚠️ **Medium Issue #3: Limited coverage**
  - No builders for:
    - Finding objects (critical for vulnerability detector tests)
    - Error objects (ConfigError, AgentError, etc.)
    - Platform-specific objects (GitHub check run, ADO thread reply)
  - ReDoS pattern fixtures have inline string arrays instead of factory

### setup.ts

✅ **Appropriate:** EPERM sandboxing is targeted and necessary

---

## 5. Dead Tests & Test Health

### Conditional Skips (Expected Behavior)

**Legitimate conditional skips found:**

- `depcruise-rules.test.ts` — skipped if dep-cruise not available (tool dependency)
- `reviewdog.test.ts` — skipped if reviewdog not installed (tool dependency)
- `security.test.ts` — skipped if lsof not available (tool dependency)
- `false-positive-benchmark.test.ts` — skipped if no pattern B snapshots (data-driven)

→ All appropriate; tied to external tool availability

### No Assertion Tests

✅ **Finding:** No test files found with zero assertions — all tests are active

---

## 6. Coverage Gap Analysis

### Discrepancy: Config Tests

**Test files vs. actual coverage:**

| Module              | Co-located   | Unit         | Status    |
| ------------------- | ------------ | ------------ | --------- |
| `config.ts`         | ✅ 403 lines | ✅ 221 lines | Duplicate |
| `config.ts` schemas | ❌           | ✅ 137 lines | Scattered |

**Questions:**

- What's the scope overlap between `config.test.ts` and `unit/config.test.ts`?
- Does `schemas.test.ts` duplicate schema parsing tests from both?
- Can they be consolidated?

### Critical Untested Paths

**Control Flow module gaps** (source files without explicit test files):

1. `cfg-types.ts` — Type definitions
   - **Risk:** Structural type bugs silently propagate
2. `mitigation-patterns.ts` — Pattern library (500+ lines)
   - **Risk:** CRITICAL — pattern errors go undetected
   - Affects vulnerability detection
3. `safe-source-patterns.ts` — Safe patterns library (400+ lines)
   - **Risk:** CRITICAL — false negatives if patterns wrong
4. `timeout-regex.ts` — ReDoS timeout logic
   - **Risk:** Regressions in ReDoS prevention

**Testing status:** These modules are tested **indirectly** via integration tests, but not with explicit unit test ownership.

---

## 7. Architecture Assessment

### Problem Summary

| Issue                                          | Severity    | Impact                                   |
| ---------------------------------------------- | ----------- | ---------------------------------------- |
| Tests in `src/` AND `tests/` simultaneously    | 🔴 CRITICAL | Maintenance confusion, unclear ownership |
| Coverage excludes co-located tests             | 🔴 CRITICAL | True coverage hidden from CI             |
| 3-4 locations for same module (config, report) | 🟠 HIGH     | Difficult to find relevant test          |
| 37 separate snapshot files                     | 🟠 HIGH     | DRY violation, bulk updates impossible   |
| 4 untested source modules in control_flow      | 🟠 HIGH     | Risk of silent regressions               |
| No fixture documentation                       | 🟡 MEDIUM   | Onboarding burden for contributors       |
| No test utilities for Finding/Error objects    | 🟡 MEDIUM   | Test setup boilerplate duplicated        |
| Unclear ci/branches coverage gap               | 🟡 MEDIUM   | Why is branch coverage 60%?              |

### Current Strengths

✅ **5-layer test architecture** properly isolates concerns:

1. Safe-source detection (unit)
2. Context loading (unit)
3. Post-processing (unit)
4. Prompt integration (unit)
5. End-to-end benchmarks (integration)

✅ **Comprehensive coverage:** 65% (CI) across 500+ source files is solid baseline

✅ **Specialized test suites** well-organized:

- `schema/` — JSON/SARIF output format contracts
- `security/` — Path traversal, error redaction, child-process injection
- `reliability/` — Promise handling, value clamping, config preservation
- `integration/` — Cross-platform, control-flow determinism, benchmark regression

---

## 8. Concrete Recommendations

### Phase 1: Consolidation (High Priority)

**1. Relocate all co-located tests to `router/tests/` equivalent**

```bash
# Current state (DO NOT keep):
router/src/__tests__/         (79 tests, mixed purposes)
router/src/__tests__/integration/  (6 integration tests)

# Target state:
router/tests/unit/            (45 existing + 79 relocated)
router/tests/integration/     (10 existing + 6 relocated)
```

**Action items:**

1. Move `router/src/__tests__/*.test.ts` → `router/tests/unit/`
   - `config.test.ts` → merge with `unit/config.test.ts` (keep unit version)
   - `ado*.test.ts` → `unit/report/ado*.test.ts` (platform reporter)
   - `cache*.test.ts` → `unit/cache/` (already organized)
   - `cli/*` → `unit/cli/` (already organized)

2. Move `router/src/__tests__/integration/*` → `router/tests/integration/`
   - `pipeline.test.ts` → `router/tests/integration/pipeline.test.ts`
   - `router.test.ts` → `router/tests/integration/router.test.ts`
   - `cache-behavior.test.ts` → `router/tests/integration/cache.test.ts`

3. Delete `router/src/__tests__/` directory (empty after relocation)

**Vitest config update:**

```typescript
// BEFORE:
include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],

// AFTER:
include: ['tests/**/*.test.ts'],  // Only in tests/, no source co-location
```

**Coverage config update:**

```typescript
// BEFORE:
include: ['src/**/*.ts'],
exclude: ['src/**/*.test.ts', 'src/__tests__/**/*', ...],

// AFTER:
include: ['src/**/*.ts'],
exclude: ['src/**/*.test.ts', ...],  // Remove __tests__ exception
```

---

### Phase 2: Test Consolidation (Medium Priority)

**2. Consolidate duplicate config tests**

| Source                         | Target                | Action                                    |
| ------------------------------ | --------------------- | ----------------------------------------- |
| `src/__tests__/config.test.ts` | `unit/config.test.ts` | Merge; keep unit version (221 lines)      |
| `unit/config.test.ts`          | (consolidated)        | Add error tests from co-located           |
| `unit/config/schemas.test.ts`  | `unit/config.test.ts` | Consolidate (Zod tests with config tests) |

**Result:** Single `router/tests/unit/config.test.ts` with all config concerns

**3. Consolidate report tests**

Current:

- `ado.test.ts`, `ado-line-validation.test.ts`, `ado-multiline-payload.test.ts`, `ado_trust.test.ts`
- `github-line-validation.test.ts`, `github-multiline-payload.test.ts`
- `report.test.ts`, `report_formats.test.ts`, `report/deduplication.test.ts`

Target structure:

```
router/tests/unit/report/
├── ado.test.ts              (consolidated: ado.ts + line-validation + multiline + trust)
├── github.test.ts           (consolidated: github-line-validation + multiline)
├── deduplication.test.ts    (existing)
├── finding-validator.test.ts (existing)
├── framework-pattern-filter.test.ts (existing)
├── local-review-pipeline.test.ts (existing)
└── security-adversarial.test.ts (existing)
```

---

### Phase 3: Fixture Organization (High Priority)

**4. Consolidate benchmark snapshots**

Consolidate 37 files into single indexed JSON:

```json
// router/tests/fixtures/benchmark/snapshots.json
{
  "version": "2.0",
  "created": "2026-03-14T00:00:00Z",
  "snapshots": [
    {
      "id": "fp-b-001",
      "category": "b",
      "description": "Category B false positive pattern 001",
      "expectedFindings": [...],
      "sha256": "abc123..."
    },
    ...
  ]
}
```

**Benefits:**

- Single source of truth for all snapshots
- Bulk version updates possible
- Centralized hash validation
- Schema versioning clear

**Action items:**

1. Create `snapshots.json` with all 37 snapshots consolidated
2. Delete individual `fp-*.snapshot.json` files
3. Update `false-positive-benchmark.test.ts` to read from consolidated file
4. Add `FIXTURES_README.md` (see below)

---

### Phase 4: Documentation (Medium Priority)

**5. Add fixture documentation**

Create `router/tests/fixtures/README.md`:

````markdown
# Test Fixtures

## Benchmark Snapshots

### Organization

- **fp-b (7):** Aliasing/binding patterns (taint loss)
- **fp-c (6):** Control flow patterns (loop/condition complexity)
- **fp-d (7):** Destructuring patterns (binding loss)
- **fp-f (17):** Framework/library false positives

### Format

```json
{
  "id": "fp-b-001",
  "sourceFile": "path/to/example.ts",
  "findings": [
    {
      "rule": "sql_injection",
      "severity": "high",
      "line": 5,
      "context": "..."
    }
  ],
  "sha256": "..."
}
```
````

### Adding New Fixtures

1. Create minimal reproducer in a source file
2. Run benchmark: `pnpm test false-positive-benchmark`
3. Add snapshot to `snapshots.json`
4. Commit with category prefix (fp-{category}-{number})

### Deprecation

Snapshots marked with `deprecated: true` are kept for regression testing but not updated.

````

---

### Phase 5: Test Utilities Enhancement (Low Priority)

**6. Add missing test builders**

Extend `router/tests/test-utils.ts`:

```typescript
// Finding builder
export function createTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    rule: 'test_rule',
    severity: 'warning',
    line: 1,
    column: 0,
    message: 'Test finding',
    ...overrides,
  };
}

// Error builders
export function createTestConfigError(code: ConfigErrorCode = ConfigErrorCode.INVALID_SCHEMA): ConfigError {
  return new ConfigError('Test error', code);
}

export function createTestValidationError(): ValidationError {
  return new ValidationError('Test validation error', ValidationErrorCode.SCHEMA_MISMATCH);
}

// Platform objects
export function createTestGitHubCheckRun(overrides = {}): CheckRun {
  return { id: 123, name: 'test', ...overrides };
}
````

---

## 9. Implementation Timeline

| Phase                          | Files          | Effort                          | Timeline     |
| ------------------------------ | -------------- | ------------------------------- | ------------ |
| 1. Relocate co-located tests   | 79 files       | 4-6h (mostly mv/update imports) | Week 1       |
| 2. Consolidate duplicate tests | 6 files merged | 2-3h (merge logic)              | Week 1       |
| 3. Consolidate fixtures        | 37→1 file      | 1-2h                            | Week 2       |
| 4. Documentation               | 1 new file     | 1h                              | Week 2       |
| 5. Test utilities              | 4 new builders | 1h                              | Low priority |

**Total:** ~10-12 hours over 2 weeks

---

## 10. Risk Assessment

### Consolidation Risks

**Risk:** Test file moves cause import path breakage

**Mitigation:**

- Run full test suite after each move
- Update all `import` paths in moved files
- Check for hardcoded path references in config

**Risk:** Merging config tests might hide test concerns

**Mitigation:**

- Keep descriptive test names (e.g., `describe('config schema validation')`)
- Use sub-describe blocks to organize by concern
- Add comments explaining multi-location tests

---

## 11. Success Criteria

Before signoff, verify:

- [ ] All 79 co-located tests moved to `router/tests/`
- [ ] `router/src/__tests__/` directory removed
- [ ] `vitest.config.ts` include pattern: `['tests/**/*.test.ts']` only
- [ ] `pnpm test` runs 147 tests (same count, new location)
- [ ] Coverage thresholds met on CI
- [ ] 37 snapshots consolidated to `snapshots.json`
- [ ] `fixtures/README.md` documents all categories
- [ ] All duplicate config/report tests consolidated
- [ ] 4 untested control-flow modules have explicit unit test files
- [ ] Zero test files in `src/__tests__/`

---

## Appendix: File Move Checklist

### Co-located tests to relocate:

**Unit tests:**

```
src/__tests__/agent-icons.test.ts → tests/unit/agents/icons.test.ts
src/__tests__/base-report.test.ts → tests/unit/report/base.test.ts
src/__tests__/budget.test.ts → tests/unit/budget.test.ts
src/__tests__/budget_exemption.test.ts → tests/unit/budget-exemption.test.ts
src/__tests__/cache.test.ts → tests/unit/cache/index.test.ts
src/__tests__/config.test.ts → MERGE with tests/unit/config.test.ts
src/__tests__/ado*.test.ts → tests/unit/report/ado.test.ts (4 files → 1)
src/__tests__/github*.test.ts → tests/unit/report/github.test.ts (2 files → 1)
... (73 total)
```

**Integration tests:**

```
src/__tests__/integration/*.test.ts → tests/integration/
```

---

## Conclusion

The test suite demonstrates **good coverage and organization intent** but suffers from **architectural drift** with tests in source and test directories simultaneously. The consolidation effort (10-12 hours) will:

1. **Clarify ownership** — one location per test type
2. **Reduce maintenance burden** — no duplicate coverage
3. **Enable bulk operations** — snapshot consolidation possible
4. **Improve discoverability** — consistent patterns

**Recommended priority:** Phase 1 (consolidation) before Phase 2-5 (optimization).
