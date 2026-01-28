# Implementation Plan: ReDoS Prevention and Testing Improvements

**Branch**: `005-redos-prevention` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-redos-prevention/spec.md`

## Summary

This feature addresses code review feedback on the control flow hardening implementation (004-control-flow-hardening). The primary goals are:

1. Add ReDoS pattern validation before regex execution to prevent catastrophic backtracking
2. Expand unit test coverage for edge cases in cross-file mitigation tracking and timeout behavior
3. Enhance error handling in TimeoutRegex to catch and gracefully handle all regex errors
4. Improve logging for pattern timeouts and cross-file mitigations with audit-quality detail

## Technical Context

**Language/Version**: TypeScript 5.9.x (ESM), targeting ES2022
**Primary Dependencies**: typescript (compiler API), zod (schema validation), vitest (testing)
**Storage**: N/A (in-memory analysis only)
**Testing**: Vitest 4.x with coverage reporting
**Target Platform**: Node.js >=22.0.0, Linux CI (OSCR constraints)
**Project Type**: Single project (monorepo workspace: router/)
**Performance Goals**: Pattern validation <1ms per pattern; no added latency to analysis
**Constraints**: Pattern timeout 10-1000ms configurable; no external network calls during validation
**Scale/Scope**: ~10 patterns per analysis run; ~1000 LOC modified; existing test infrastructure

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status | Notes                                                                                            |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | PASS   | No posting changes; internal analysis hardening only                                             |
| II. Structured Findings Contract | PASS   | Extends existing FindingMetadata with patternTimeouts/crossFileMitigations (already done in 004) |
| III. Provider-Neutral Core       | PASS   | No provider-specific code; pure analysis logic                                                   |
| IV. Security-First Design        | PASS   | Primary goal is defense (ReDoS prevention); treats patterns as untrusted input                   |
| V. Deterministic Outputs         | PASS   | Pattern validation is deterministic; rejected patterns logged consistently                       |
| VI. Bounded Resources            | PASS   | Extends timeout protection; adds validation timeout as secondary bound                           |
| VII. Environment Discipline      | PASS   | No runtime installers; uses existing toolchain                                                   |
| VIII. Explicit Non-Goals         | PASS   | Analysis hardening, not CI orchestration                                                         |

**Quality Gates:**

- Zero-tolerance lint: MUST maintain `--max-warnings 0`
- Security linting: ReDoS prevention directly addresses security concerns
- Test coverage: MUST achieve 80% coverage on modified files (FR-013)
- Local = CI parity: Existing hooks apply

## Project Structure

### Documentation (this feature)

```text
specs/005-redos-prevention/
├── plan.md              # This file
├── research.md          # Phase 0 output: ReDoS detection approaches
├── data-model.md        # Phase 1 output: PatternValidationResult entity
├── quickstart.md        # Phase 1 output: Testing guide
├── contracts/           # Phase 1 output: Validation API contract
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
router/
├── src/
│   └── agents/
│       └── control_flow/
│           ├── timeout-regex.ts       # Enhanced with pattern validation
│           ├── mitigation-detector.ts # Enhanced error handling
│           ├── pattern-validator.ts   # NEW: ReDoS pattern validation
│           ├── types.ts               # Extended with validation types
│           └── logger.ts              # Enhanced logging categories
└── tests/
    └── unit/
        └── agents/
            └── control_flow/
                ├── regex-timeout.test.ts        # Expanded timeout tests
                ├── cross-file-messages.test.ts  # Expanded edge case tests
                ├── pattern-validator.test.ts    # NEW: Validation tests
                └── logger.test.ts               # Expanded logging tests
```

**Structure Decision**: Single project structure maintained. New pattern-validator.ts module follows existing file organization in `router/src/agents/control_flow/`. Tests mirror source structure in `router/tests/unit/agents/control_flow/`.

## Constitution Check (Post-Design)

_Re-evaluation after Phase 1 design completion._

| Principle                        | Status | Design Impact                                                        |
| -------------------------------- | ------ | -------------------------------------------------------------------- |
| I. Router Owns All Posting       | PASS   | No changes to posting; pattern-validator.ts is internal              |
| II. Structured Findings Contract | PASS   | New types extend existing schemas with optional fields               |
| III. Provider-Neutral Core       | PASS   | Validation logic has no provider dependencies                        |
| IV. Security-First Design        | PASS   | Design treats all patterns as untrusted; implements defense-in-depth |
| V. Deterministic Outputs         | PASS   | Static analysis is deterministic; results stable for same pattern    |
| VI. Bounded Resources            | PASS   | Validation timeout (10ms default) prevents validation DoS            |
| VII. Environment Discipline      | PASS   | No new external dependencies; pure TypeScript implementation         |
| VIII. Explicit Non-Goals         | PASS   | No scope creep; focused on pattern validation and testing            |

**Design Artifacts Created:**

- `research.md`: ReDoS detection approach decisions
- `data-model.md`: 5 entity definitions with Zod schemas
- `contracts/pattern-validator-api.ts`: Public interface contract
- `quickstart.md`: Testing guide with coverage requirements

## Complexity Tracking

No constitution violations requiring justification. Feature adds defensive capabilities within existing architecture.
