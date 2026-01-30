# Implementation Plan: Fix Grouped Comment Resolution Bug

**Branch**: `405-fix-grouped-comment-resolution` | **Date**: 2026-01-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/405-fix-grouped-comment-resolution/spec.md`

## Summary

Fix the P2 bug where stale comment resolution incorrectly marks entire grouped comments as resolved when only some findings within the group are stale. The fix requires checking ALL unique fingerprint markers in a grouped comment before marking it as resolved, and implementing visual distinction (strikethrough) for individually resolved findings within partially-resolved grouped comments.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2022 target, NodeNext modules)
**Primary Dependencies**: Octokit (GitHub API), node-fetch (ADO API), Vitest (testing)
**Storage**: N/A (stateless per run)
**Testing**: Vitest 4.x with table-driven tests and mocked platform APIs
**Target Platform**: Node.js >=22.0.0, Linux CI environments
**Project Type**: Single (router module within monorepo)
**Performance Goals**: Maintain existing rate limiting behavior, single structured log per comment
**Constraints**: Resolution logic must be stateless per run; no persistent state between analysis runs
**Scale/Scope**: Handles PRs with hundreds of findings and existing comments

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status  | Notes                                                                                                       |
| -------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ PASS | Changes stay within router's `github.ts` and `ado.ts`; no agent modifications                               |
| II. Structured Findings Contract | ✅ PASS | Uses existing fingerprint markers; no schema changes                                                        |
| III. Provider-Neutral Core       | ✅ PASS | Shared resolution logic in dedicated `resolution.ts`; platform-specific integration in `github.ts`/`ado.ts` |
| IV. Security-First Design        | ✅ PASS | No new inputs; existing marker parsing unchanged; logs exclude raw fingerprints                             |
| V. Deterministic Outputs         | ✅ PASS | Resolution is deterministic: comment resolved IFF all markers stale                                         |
| VI. Bounded Resources            | ✅ PASS | Maintains existing rate limiting; log emission capped at once per comment                                   |
| VII. Environment Discipline      | ✅ PASS | No environment changes; pure logic fix                                                                      |
| VIII. Explicit Non-Goals         | ✅ PASS | No scope expansion; stays within PR comment management                                                      |

**Constitution Gate: PASSED** — No violations detected.

## Project Structure

### Documentation (this feature)

```text
specs/405-fix-grouped-comment-resolution/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

**Note**: No `contracts/` directory - internal-only changes documented inline per artifact policy.

### Source Code (repository root)

```text
router/src/
├── report/
│   ├── resolution.ts    # NEW: Shared resolution logic (dedicated module)
│   ├── formats.ts       # Fingerprint/dedupe utilities (unchanged responsibility)
│   ├── github.ts        # GitHub-specific integration (calls resolution.ts)
│   ├── ado.ts           # ADO-specific integration (calls resolution.ts)
│   └── base.ts          # Comment formatting (calls resolution.ts for visual distinction)
└── __tests__/
    ├── comment-resolution.test.ts  # NEW: Dedicated resolution tests
    └── deduplication.test.ts       # Existing dedupe tests (unchanged scope)
```

**Structure Decision**: Single project structure. New `resolution.ts` module owns all resolution logic. Tests split into dedicated files by responsibility.

## Complexity Tracking

> No Constitution violations requiring justification.

_N/A - All gates passed._

## Phase 0: Research (Complete)

See [research.md](./research.md) for full details.

**Key Decisions**:

1. Binary state model (resolved/unresolved) - partial resolution is visual only
2. Check all markers in comment before resolving
3. Visual distinction via Markdown strikethrough (preserves fingerprint markers)
4. Shared resolution logic in dedicated `resolution.ts` module (not in `formats.ts`)
5. Structured logging with stable event name `comment_resolution` (once per comment)
6. Dedicated test file `comment-resolution.test.ts` (separate from deduplication tests)

## Phase 1: Design (Complete)

**Artifacts Generated**:

- [data-model.md](./data-model.md) - Ephemeral data structures for resolution
- [quickstart.md](./quickstart.md) - Development setup and test scenarios

**Note**: No contracts artifact - internal-only changes per artifact policy.

**Constitution Re-Check**: PASSED — Design maintains all principle compliance.

## Next Steps

Run `/speckit.tasks` to generate implementation tasks.
