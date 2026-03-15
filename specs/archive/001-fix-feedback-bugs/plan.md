# Implementation Plan: Fix Feedback Bugs

**Branch**: `001-fix-feedback-bugs` | **Date**: 2026-01-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-fix-feedback-bugs/spec.md`

## Summary

Fix three correctness bugs identified in FEEDBACK.md:

1. **Off-by-one node visit limit** (path-analyzer.ts:316) - Change `>` to `>=` with pre-increment semantics
2. **Mitigation mapping placeholder** (path-analyzer.ts:414-422) - Replace `return true` placeholder with actual `Mitigation.appliesTo` check
3. **Spec link checker pattern limitation** (check-spec-test-links.cjs:52) - Replace fixed capture groups with global single-path matching

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: Zod 4.3.6 (schema validation), typescript (compiler API)
**Storage**: N/A (in-memory analysis, file-based spec checker)
**Testing**: Vitest 4.0.18 with @vitest/coverage-v8
**Target Platform**: Node.js >=22.0.0, Linux CI (GitHub Actions, Azure Pipelines)
**Project Type**: Single project (router package + scripts)
**Performance Goals**: N/A (bug fixes, no performance changes)
**Constraints**: Must pass all existing tests (FR-007), minimum 8 new regression tests (FR-008/FR-009)
**Scale/Scope**: 3 targeted fixes across 2 files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status   | Notes                                                  |
| -------------------------------- | -------- | ------------------------------------------------------ |
| I. Router Owns All Posting       | N/A      | Bug fixes don't affect posting                         |
| II. Structured Findings Contract | **PASS** | Mitigation fix improves schema compliance              |
| III. Provider-Neutral Core       | **PASS** | All fixes in provider-agnostic code                    |
| IV. Security-First Design        | **PASS** | No secret exposure, no new inputs                      |
| V. Deterministic Outputs         | **PASS** | Fixes improve determinism (accurate mitigation checks) |
| VI. Bounded Resources            | **PASS** | Node limit fix enforces bounds correctly               |
| VII. Environment Discipline      | **PASS** | No toolchain changes                                   |
| VIII. Explicit Non-Goals         | **PASS** | Fixes stay within scope                                |

**Quality Gates**:

- Zero-Tolerance Lint: Will validate with `--max-warnings 0`
- Security Linting: No new security-sensitive code
- Dependency Architecture: No new dependencies
- Local = CI Parity: Pre-commit hooks will verify

**Result**: All gates PASS. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/001-fix-feedback-bugs/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output (below)
├── data-model.md        # Phase 1 output (below)
├── quickstart.md        # Phase 1 output (below)
└── checklists/
    └── requirements.md  # Quality checklist (complete)
```

### Source Code (affected files)

```text
router/
├── src/
│   └── agents/
│       └── control_flow/
│           ├── path-analyzer.ts    # Bug 1 (line 316), Bug 2 (lines 414-422)
│           └── types.ts            # MitigationPattern.mitigates, VulnerabilityType
└── tests/
    └── unit/
        └── agents/
            └── control_flow/
                └── path-analyzer.test.ts  # New regression tests

scripts/
└── check-spec-test-links.cjs       # Bug 3 (line 52)
```

**Structure Decision**: Single project structure. Fixes target existing files in `router/src/agents/control_flow/` and `scripts/`.

## Complexity Tracking

> No violations to justify - all gates pass.

N/A
