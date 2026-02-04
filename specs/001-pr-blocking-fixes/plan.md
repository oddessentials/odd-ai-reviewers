# Implementation Plan: PR Blocking Fixes

**Branch**: `001-pr-blocking-fixes` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-pr-blocking-fixes/spec.md`
**Last Updated**: 2026-02-03

## Implementation Status

| User Story              | Priority | Status         | Notes                                                   |
| ----------------------- | -------- | -------------- | ------------------------------------------------------- |
| Phase 1 - Setup         | -        | ✅ COMPLETE    | isNodeError type guard created                          |
| US1 - Release Pipeline  | P1       | ✅ COMPLETE    | CHANGELOG path, breaking changes, shell param expansion |
| US2 - Windows Semgrep   | P1       | ✅ COMPLETE    | PYTHONUTF8=1 centralized in createSafeAgentEnv          |
| US3 - OpenAI Models     | P1       | ⏳ NOT STARTED | max_completion_tokens for GPT-5.x                       |
| US4 - Error Handling    | P2       | ⏳ NOT STARTED | Apply isNodeError type guard                            |
| US5 - Supply Chain      | P2       | ⏳ NOT STARTED | badge-update.yml still uses unpinned action             |
| US6 - Dead Code         | P2       | ⏳ NOT STARTED | Delete npm-publish.yml                                  |
| US7 - Integration Tests | P3       | ⏳ NOT STARTED | 2 tests still skipped                                   |

**Progress**: Phase 1 + 2/7 user stories complete (8/24 tasks)

## Summary

This plan addresses 10 PR-blocking issues from PR_FEEDBACK.md that affect release correctness, security posture, cross-platform usability, and basic operability of local review. The fixes span configuration corrections (semantic-release), code hardening (error handling, API compatibility), CI/CD security (action pinning), and test coverage gaps.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules), Node.js >=22.0.0
**Primary Dependencies**: Commander 14.x (CLI), Zod 4.x (validation), OpenAI SDK 6.x, Anthropic SDK 0.71.x, Octokit 22.x
**Storage**: N/A (stateless CLI, file-based cache exists but not modified for core fixes)
**Testing**: Vitest 4.x
**Target Platform**: Cross-platform (Linux CI, Windows/macOS local development)
**Project Type**: Single project (router monorepo structure)
**Performance Goals**: N/A (bug fixes, no new performance-critical paths)
**Constraints**: Must maintain backward compatibility with GPT-4.x models
**Scale/Scope**: 10 discrete fixes affecting ~8 files

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status   | Notes                                                                               |
| -------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | **PASS** | No changes to posting logic                                                         |
| II. Structured Findings Contract | **PASS** | No changes to finding schema                                                        |
| III. Provider-Neutral Core       | **PASS** | No provider-specific changes to core                                                |
| IV. Security-First Design        | **PASS** | Fixes improve security (action pinning, shell injection prevention, error handling) |
| V. Deterministic Outputs         | **PASS** | No changes to output logic                                                          |
| VI. Bounded Resources            | **PASS** | No changes to resource limits                                                       |
| VII. Environment Discipline      | **PASS** | PYTHONUTF8=1 addition follows environment injection patterns                        |
| VIII. Explicit Non-Goals         | **PASS** | Changes stay within scope                                                           |

**Quality Gates**:

- Zero-Tolerance Lint Policy: All changes must pass `pnpm lint --max-warnings 0`
- Security Linting: No new child process patterns outside existing allowed patterns
- Local = CI Parity: Pre-commit hooks will validate all changes

**Result**: All gates pass. No complexity tracking required.

## Project Structure

### Documentation (this feature)

```text
specs/001-pr-blocking-fixes/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal - no new entities)
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (affected files)

```text
router/
├── src/
│   ├── agents/
│   │   ├── opencode.ts          # FR-007/008/009: OpenAI model parameter switching (⏳ pending)
│   │   ├── security.ts          # FR-005: PYTHONUTF8=1 centralized (✅ done)
│   │   ├── semgrep.ts           # FR-006: Graceful degradation (✅ inherits from execute.ts)
│   │   └── reviewdog.ts         # Cleaned up PYTHONUTF8 duplication (✅ done)
│   ├── cli/
│   │   ├── commands/
│   │   │   └── local-review.ts  # FR-011: loadConfigWithFallback error handling (✅ done)
│   │   └── dependencies/
│   │       └── checker.ts       # FR-010: ErrnoException type guard (✅ done)
│   ├── config.ts                # FR-012: Generic error handling hardening (✅ done)
│   └── types/
│       └── errors.ts            # isNodeError type guard (✅ done)
├── __tests__/
│   ├── security.test.ts         # PYTHONUTF8 unit tests (✅ done)
│   └── semgrep.test.ts          # PYTHONUTF8 wiring test (✅ done)
└── tests/
    └── integration/
        └── local-review-cli.test.ts  # FR-016: Unskip integration tests (⏳ pending)

.github/workflows/
├── release.yml          # FR-003/004: Shell param expansion, CHANGELOG path (✅ done)
├── badge-update.yml     # FR-013/014: Pin or replace exuanbo/actions-deploy-gist (⏳ pending)
└── npm-publish.yml      # FR-015: DELETED (✅ done)

.releaserc.json          # FR-001/002: CHANGELOG path, breaking change detection (✅ done)
```

**Structure Decision**: Single project structure maintained. Changes are targeted fixes to existing files with no new modules required.

## Complexity Tracking

> No violations - table not needed.
