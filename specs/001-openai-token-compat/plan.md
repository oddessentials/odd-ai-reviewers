# Implementation Plan: OpenAI Model Compatibility

**Branch**: `001-openai-token-compat` | **Date**: 2026-02-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-openai-token-compat/spec.md`

## Summary

Implement enterprise-grade token parameter compatibility for OpenAI API calls. Modern o-series models reject the deprecated `max_tokens` parameter and require `max_completion_tokens`. The solution uses a capability fallback approach: prefer `max_completion_tokens`, detect compatibility errors via HTTP 400 + message pattern matching, and retry exactly once with `max_tokens`. This maintains backward compatibility with legacy models while supporting modern ones deterministically.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (ES2022 target, NodeNext modules)
**Primary Dependencies**: OpenAI SDK 6.17.0, Zod 4.3.6 (validation), existing error types from `router/src/types/errors.ts`
**Storage**: N/A (stateless per run, existing file-based cache unaffected)
**Testing**: Vitest 4.x with 65% coverage requirement in CI
**Target Platform**: Node.js >=22.0.0, Linux CI environments
**Project Type**: Single TypeScript project (router/)
**Performance Goals**: No additional latency for successful requests; single retry adds one round-trip only when compatibility error occurs
**Constraints**: Maximum one retry per request; deterministic behavior; no sensitive data in logs
**Scale/Scope**: Affects 3 agent files with 6 total OpenAI/Anthropic call sites; ~200 lines of new/modified code

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

### Pre-Design Check (Phase 0)

| Principle                        | Status  | Notes                                                                           |
| -------------------------------- | ------- | ------------------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ PASS | Change is in agent execution, not posting                                       |
| II. Structured Findings Contract | ✅ PASS | No change to finding schema                                                     |
| III. Provider-Neutral Core       | ✅ PASS | Changes are in provider-specific agent code, not core                           |
| IV. Security-First Design        | ✅ PASS | No secrets logged; FR-011 explicitly forbids sensitive data in logs             |
| V. Deterministic Outputs         | ✅ PASS | Same input → same output; retry is bounded (max 1) and only for specific errors |
| VI. Bounded Resources            | ✅ PASS | Single retry is bounded; configurable token limit with validation               |
| VII. Environment Discipline      | ✅ PASS | No new toolchain dependencies; uses existing patterns                           |
| VIII. Explicit Non-Goals         | ✅ PASS | Not expanding scope; fixing existing OpenAI integration                         |

### Post-Design Check (Phase 1)

| Principle                        | Status  | Notes                                                               |
| -------------------------------- | ------- | ------------------------------------------------------------------- |
| I. Router Owns All Posting       | ✅ PASS | Verified: No posting logic added                                    |
| II. Structured Findings Contract | ✅ PASS | Verified: Finding schema unchanged                                  |
| III. Provider-Neutral Core       | ✅ PASS | Verified: `token-compat.ts` is OpenAI-specific, isolated in agents/ |
| IV. Security-First Design        | ✅ PASS | Verified: Logging excludes API keys, payloads, token values         |
| V. Deterministic Outputs         | ✅ PASS | Verified: FR-013 ensures retry request identical except token param |
| VI. Bounded Resources            | ✅ PASS | Verified: Config validation min=16; single retry max                |
| VII. Environment Discipline      | ✅ PASS | Verified: No new dependencies; uses existing OpenAI SDK             |
| VIII. Explicit Non-Goals         | ✅ PASS | Verified: No scope expansion beyond token parameter handling        |

**Quality Gates**:

- Zero-tolerance lint policy: Will run `pnpm lint --max-warnings 0`
- Security linting: No new child processes or eval patterns
- Dependency architecture: No new circular dependencies
- Local = CI parity: Pre-commit hooks will validate changes

## Project Structure

### Documentation (this feature)

```text
specs/001-openai-token-compat/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - internal changes only)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
router/src/
├── agents/
│   ├── opencode.ts           # PRIMARY: Add token param compat (lines 171-182, 303-309)
│   ├── pr_agent.ts           # SECONDARY: Apply same pattern (lines 105, 310)
│   ├── ai_semantic_review.ts # SECONDARY: Apply same pattern (lines 103, 329)
│   ├── retry.ts              # REFERENCE: Existing retry utility (may wrap)
│   └── token-compat.ts       # NEW: Token parameter compatibility utilities
├── config/
│   └── schemas.ts            # UPDATE: Add max_completion_tokens config option
└── types/
    └── errors.ts             # REFERENCE: Existing error types

router/tests/
├── unit/
│   └── agents/
│       └── token-compat.test.ts  # NEW: Unit tests for compatibility logic
└── integration/
    └── openai-compat.test.ts     # NEW: Integration tests (if API keys available)
```

**Structure Decision**: Single project structure. Changes are localized to the `router/src/agents/` directory with a new utility module for token parameter compatibility. This follows the existing pattern of agent-specific code in the agents directory.

## Complexity Tracking

> No constitution violations requiring justification.

| Aspect             | Decision                                         | Rationale                                                         |
| ------------------ | ------------------------------------------------ | ----------------------------------------------------------------- |
| New utility module | `token-compat.ts`                                | Centralizes retry logic; avoids code duplication across 3 agents  |
| Config extension   | Optional `max_completion_tokens` in LimitsSchema | Enterprise requirement (FR-007); follows existing config patterns |

## Phase 1 Artifacts

| Artifact                         | Status      | Description                                        |
| -------------------------------- | ----------- | -------------------------------------------------- |
| [research.md](./research.md)     | ✅ Complete | OpenAI API research, error formats, retry strategy |
| [data-model.md](./data-model.md) | ✅ Complete | Type definitions, config schema extension          |
| [quickstart.md](./quickstart.md) | ✅ Complete | Developer guide, usage examples                    |
| [contracts/](./contracts/)       | ✅ Complete | N/A - internal changes only (documented)           |

## Next Steps

Run `/speckit.tasks` to generate the task breakdown for implementation.
