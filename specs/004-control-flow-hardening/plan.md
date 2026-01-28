# Implementation Plan: Control Flow Analysis Hardening

**Branch**: `004-control-flow-hardening` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-control-flow-hardening/spec.md`

## Summary

This feature adds two hardening improvements to the existing control flow analysis agent:

1. **Regex Timeout Protection**: Add a timeout wrapper around regex pattern evaluation to prevent denial-of-service from malicious or poorly-constructed custom patterns. This builds on the existing `hasExponentialRegex()` heuristic check by adding runtime protection.

2. **Cross-File Mitigation Transparency**: Enhance finding messages to explicitly indicate when mitigations are detected in different files than the vulnerability, including file paths, line numbers, and call depth information.

## Technical Context

**Language/Version**: TypeScript 5.x (ESM), Node.js >=22.0.0
**Primary Dependencies**: typescript (compiler API for AST parsing), Zod (schema validation), Vitest (testing)
**Storage**: N/A (in-memory analysis only)
**Testing**: Vitest 4.x with coverage
**Target Platform**: Linux server (CI execution), Node.js runtime
**Project Type**: Single project (router workspace)
**Performance Goals**: Pattern timeout default 100ms; analysis completes within 5-minute budget
**Constraints**: No blocking operations; must not hang on malicious input
**Scale/Scope**: Handles PRs up to 10,000 lines with 100+ custom patterns

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                          |
| -------------------------------- | ------- | -------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ PASS | No changes to posting; agent still returns findings to router  |
| II. Structured Findings Contract | ✅ PASS | Enhances finding metadata with location info; schema unchanged |
| III. Provider-Neutral Core       | ✅ PASS | No provider-specific code introduced                           |
| IV. Security-First Design        | ✅ PASS | Feature specifically adds DoS protection via timeouts          |
| V. Deterministic Outputs         | ✅ PASS | Timeouts produce deterministic "conservative" results          |
| VI. Bounded Resources            | ✅ PASS | Enforces time bounds on regex evaluation                       |
| VII. Environment Discipline      | ✅ PASS | No new dependencies or runtime installers                      |
| VIII. Explicit Non-Goals         | ✅ PASS | Stays within agent scope                                       |

**Gate Status**: ✅ PASSED - No violations

## Project Structure

### Documentation (this feature)

```text
specs/004-control-flow-hardening/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (TypeScript interfaces)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/
├── src/
│   ├── agents/
│   │   └── control_flow/
│   │       ├── index.ts                 # Agent entry point
│   │       ├── mitigation-detector.ts   # Add timeout wrapper here (FR-001 to FR-005)
│   │       ├── finding-generator.ts     # Enhance messages here (FR-006 to FR-010)
│   │       ├── types.ts                 # Extend MitigationInstance schema
│   │       └── logger.ts                # Enhanced logging (FR-011, FR-012)
│   └── config/
│       └── mitigation-config.ts         # Add patternTimeoutMs config option
└── tests/
    └── unit/
        └── agents/
            └── control_flow/
                ├── regex-timeout.test.ts    # New: timeout behavior tests
                └── cross-file-messages.test.ts # New: message format tests
```

**Structure Decision**: Extends existing router/src/agents/control_flow/ module. No new top-level directories required.

## Complexity Tracking

> No violations to justify - all Constitution checks pass.

| Item                     | Decision                                                          |
| ------------------------ | ----------------------------------------------------------------- |
| Pattern timeout approach | Use AbortController + setTimeout for non-blocking timeout         |
| Cross-file detection     | Leverage existing SourceLocation.file field in MitigationInstance |
