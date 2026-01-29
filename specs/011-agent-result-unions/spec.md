# Feature Specification: AgentResult Discriminated Unions

**Feature Branch**: `011-agent-result-unions`
**Created**: 2026-01-29
**Status**: Draft
**Input**: User description: "remaining incomplete gaps from 010-type-test-optimization"

## Overview

This feature completes the remaining work from the 010-type-test-optimization feature, specifically Phase 9 (User Story 7 - Discriminated Unions for Agent Results) and partial Phase 10 tasks. The goal is to refactor the `AgentResult` interface to use a discriminated union pattern with exhaustive switch enforcement via `assertNever`.

**Clarification Note**: Additional security hardening items (child_process audit, generic Error elimination, canary tests) are recommended for a separate feature (012-security-hardening) to maintain focused scope.

## Clarifications

### Session 2026-01-29

- Q: Should AgentFailure carry findings for partial results or discard them? → A: Keep partial results but make explicit: rename to `partialFindings`, add `failureStage: 'preflight' | 'exec' | 'postprocess'`, enforce consumers label as partial and never count as success.
- Q: What counts as "API boundary" for backward compatibility? → A: Only router CLI/binary entry point. Ban `result.success` everywhere else (agents, phases, cache, telemetry, report, tests) via lint rule or grep-based CI check. Deprecated getter exists only for incremental migration within same PR series, then delete.
- Q: Does "tests pass without modification" mean no test code changes? → A: No. Tests are internal code, must migrate to `status`. "Without modification" means equivalent assertions and outcomes, not syntax.
- Q: Is P2 (Typed Metadata Fields) in scope or deferred? → A: Required scope. Typed metadata helpers for `Finding.metadata` and `AgentContext.env` ship with discriminated unions.
- Q: What is the commit workflow for implementation? → A: Commit each phase to current branch after ensuring all CI and quality checks pass. Fix any failures (pre-existing or new) in enterprise-grade fashion before proceeding.
- Q: When should `.success` ban be enforced? → A: Unconditionally after Phase 1. Add grep/lint check early with allowlist only for `router/src/main.ts` (CLI entry) + temporary migration allowlist file. Don't wait until Phase 4.
- Q: How should canary test work without breaking CI builds? → A: Use runtime/tsd-style canary with `switch` + `assertNever` + type-level `satisfies` check. No intentional compile errors in CI; fail deterministically via type tests.
- Q: Should AgentResult have serialization contract even if not persisted? → A: Yes. Add explicit `toJSON/fromJSON` or Zod schema + round-trip tests for all variants to prevent widening/shape drift since cache/store.ts touches it.
- Q: How to prevent ad-hoc object literals for AgentResult? → A: Add ESLint rule or grep CI check to forbid `status: 'success'` object literals outside `agents/types.ts`. Lock constructors as only factory path.
- Q: When should `partialFindings` exclusion from success metrics be enforced? → A: From day 1. Add integration test proving: failure emits `status=failure`, includes `partialFindings`, does not increment success metrics.
- Q: Where should typed metadata helpers live? → A: Dedicated module with zero dependency back-edges into agents. Strictly additive, non-invasive; no changes to existing `Finding` schema/shape.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Exhaustive Agent Result Handling (Priority: P1)

As a developer working on the router, I want `AgentResult` to use a discriminated union pattern so that the compiler catches any missing cases when handling agent outcomes, preventing runtime errors from unhandled states.

**Why this priority**: This is the core change that affects 17 files and provides compile-time safety for all agent result handling. Without this, new result states could be added without updating all handlers.

**Independent Test**: Create a switch statement on `AgentResult.status` and verify the compiler emits an error if a case is missing. Verify existing tests continue to pass after migration.

**Acceptance Scenarios**:

1. **Given** a switch statement handling AgentResult, **When** a new status variant is added, **Then** the compiler reports an error at all switch sites missing the new case
2. **Given** an agent completes successfully, **When** the result is processed, **Then** the success variant contains findings and metrics without an error field
3. **Given** an agent fails, **When** the result is processed, **Then** the failure variant contains an error message and the reason is accessible
4. **Given** an agent is skipped, **When** the result is processed, **Then** the skipped variant contains the skip reason

---

### User Story 2 - Type-Safe Result Construction (Priority: P1)

As a developer implementing a review agent, I want constructor helpers for each AgentResult variant so that I cannot accidentally create invalid combinations (e.g., success with error message, or failure without error).

**Why this priority**: Constructor helpers enforce valid state combinations at construction time, preventing subtle bugs where success=true but error is set.

**Independent Test**: Attempt to call `AgentSuccess()` with an error field; verify compile error. Attempt to call `AgentFailure()` without an error; verify compile error.

**Acceptance Scenarios**:

1. **Given** an agent run completes without errors, **When** I call `AgentSuccess()`, **Then** I must provide agentId, findings, and metrics (no error field allowed)
2. **Given** an agent run fails, **When** I call `AgentFailure()`, **Then** I must provide agentId, error message, failureStage, and metrics; partialFindings defaults to empty
3. **Given** an agent is skipped, **When** I call `AgentSkipped()`, **Then** I must provide agentId and skip reason (no findings field allowed)

---

### User Story 3 - Typed Metadata Fields (Priority: P1)

As a developer, I want `Finding.metadata` and `AgentContext.env` to have typed helpers so that common metadata patterns are validated rather than using untyped `Record<string, unknown>`.

**Why this priority**: Required scope - typed helpers ship with discriminated unions to provide consistent type safety across the agent result system.

**Independent Test**: Access a typed metadata field; verify autocomplete and type checking work. Access an unknown field; verify it requires explicit casting.

**Acceptance Scenarios**:

1. **Given** a Finding with security-related metadata, **When** I access `metadata.cwe`, **Then** it is typed as `string | undefined`
2. **Given** an AgentContext, **When** I access common env vars like `GITHUB_TOKEN`, **Then** helper functions provide type-safe access

---

### Edge Cases

- What happens when an agent returns an unexpected status value at runtime? The `assertNever` utility throws a descriptive error with the unexpected value
- How does the migration handle existing code that checks `success: boolean`? Code is migrated to use `status`; a temporary deprecated getter exists only during incremental migration, then is deleted
- What happens if an agent implementation returns null/undefined? TypeScript's strict null checks catch this at compile time
- What happens to `partialFindings` in reports? They are explicitly labeled as partial and excluded from success metrics

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST define AgentResult as a discriminated union with `status: 'success' | 'failure' | 'skipped'`
- **FR-002**: System MUST provide `AgentSuccess`, `AgentFailure`, and `AgentSkipped` constructor functions that enforce valid field combinations
- **FR-003**: System MUST use `assertNever` utility in all switch default cases for exhaustive checking
- **FR-004**: All switch statements on AgentResult MUST handle all three status variants (no `default` fallthrough allowed)
- **FR-005**: System MUST update all 17 files that reference AgentResult to use the new discriminated union pattern
- **FR-006**: System MAY provide a temporary deprecated `success` getter for incremental migration only; getter MUST be deleted before PR series merges (not kept for external compatibility)
- **FR-007**: System MUST provide typed helpers for common Finding.metadata fields (cwe, owasp, confidence)
- **FR-008**: System MUST provide typed helpers for common AgentContext.env fields (GITHUB_TOKEN, AZURE_DEVOPS_PAT, SYSTEM_ACCESSTOKEN)
- **FR-009**: All existing tests (1843+) MUST continue to pass after migration
- **FR-010**: System MUST add unit tests for AgentResult discriminated union behavior

#### Enforcement Requirements (Critical)

- **FR-011**: `status` MUST be the sole discriminator; no code path may infer success/failure via presence of fields or truthy checks
- **FR-012**: Constructor helpers (`AgentSuccess`, `AgentFailure`, `AgentSkipped`) MUST be the only creation mechanism; ad-hoc object literals for AgentResult MUST be blocked via ESLint rule or type tests
- **FR-013**: Variant field invariants MUST be enforced at the type level: `AgentSuccess` has NO `error`/`reason`; `AgentFailure` has `partialFindings` (not `findings`) + `failureStage`; `AgentSkipped` has NO `error`/`findings`
- **FR-014**: Cache serialization/deserialization MUST round-trip the `status` discriminator exactly; add test verifying each variant persists and reloads without widening
- **FR-015**: Telemetry and logging MUST key off `status`, not inferred success; metrics/counters/logs must be explicitly mapped per variant
- **FR-016**: `partialFindings` from `AgentFailure` MUST be labeled as partial in reports/telemetry and MUST NOT count toward success metrics
- **FR-017**: Phase 4 cleanup MUST fail if any consumer compiles with non-exhaustive switch handling
- **FR-018**: A canary test MUST use runtime/tsd-style approach (`switch` + `assertNever` + type-level `satisfies`) to verify exhaustiveness; MUST NOT require intentional compile errors in CI
- **FR-019**: A lint rule or grep-based CI check MUST fail on `\.success\b` usage unconditionally after Phase 1; allowlist ONLY `router/src/main.ts` (CLI entry) + temporary migration allowlist file during migration window
- **FR-020**: All boolean-based `success` logic MUST be removed from production paths before Phase 2+ ships
- **FR-021**: The deprecated `success` getter MUST be deleted before the PR series merges; it exists only for incremental migration, not long-term compatibility
- **FR-025**: AgentResult MUST have explicit serialization contract (`toJSON/fromJSON` or Zod schema) with round-trip tests for all variants to prevent shape drift
- **FR-026**: An ESLint rule or grep CI check MUST forbid `status: 'success'` (and `'failure'`, `'skipped'`) object literals outside `agents/types.ts` to lock constructors as only factory path
- **FR-027**: An integration test MUST prove: failure variant emits `status=failure`, includes `partialFindings`, and does NOT increment success metrics (enforced from day 1)
- **FR-028**: Typed metadata helpers MUST live in dedicated module (`agents/metadata.ts`) with zero dependency back-edges into agent implementations; strictly additive to existing `Finding` interface (no schema changes)

#### Process Requirements (Commit Workflow)

- **FR-022**: Each implementation phase MUST be committed to the current branch only after all CI and quality checks pass
- **FR-023**: Any CI or quality check failures (pre-existing or introduced) MUST be fixed in an enterprise-grade fashion before phase commit
- **FR-024**: Commits MUST NOT proceed with failing checks; no exceptions for "pre-existing" failures

### Key Entities

- **AgentResult**: Discriminated union representing the outcome of an agent run (success, failure, or skipped)
- **AgentSuccess**: Variant for successful agent runs with `findings` and `metrics`; NO `error` or `reason` fields
- **AgentFailure**: Variant for failed agent runs with `error`, `failureStage` (`'preflight' | 'exec' | 'postprocess'`), and `partialFindings` (explicitly named to distinguish from success findings)
- **AgentSkipped**: Variant for skipped agent runs with `reason`; NO `error` or `findings` fields
- **Finding**: Review finding with optional typed metadata helpers
- **AgentContext**: Context provided to agents with typed env helpers

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: All 17 files referencing AgentResult are migrated to use the discriminated union pattern
- **SC-002**: Compiler catches 100% of missing switch cases when handling AgentResult
- **SC-003**: All existing tests continue to pass with equivalent assertions and outcomes after migration
- **SC-004**: Zero runtime errors from unhandled AgentResult states after deployment
- **SC-005**: New unit tests achieve 100% branch coverage for AgentResult handling logic
- **SC-006**: Developer autocomplete shows correct fields per AgentResult variant
- **SC-007**: Canary test exists using tsd-style type assertions (`satisfies` + exhaustive switch) that fails deterministically when variant added; no intentional compile errors in CI
- **SC-008**: Zero boolean-based `success` checks remain in production code paths after migration
- **SC-009**: Cache round-trip test passes for all three variants (status discriminator preserved)
- **SC-010**: Telemetry emits distinct event types per variant; `partialFindings` labeled explicitly as partial
- **SC-011**: Each phase commit passes all CI checks (lint, type-check, tests, dependency-cruiser) with zero failures
- **SC-012**: Grep check for `.success` passes with only `router/src/main.ts` + allowlist file exceptions after Phase 1
- **SC-013**: Grep check for `status: 'success'` object literals passes with only `agents/types.ts` exception
- **SC-014**: Serialization round-trip test passes for all three AgentResult variants (Zod or toJSON/fromJSON)
- **SC-015**: Integration test verifies failure variant with partialFindings does not increment success counters
- **SC-016**: `agents/metadata.ts` has zero imports from agent implementation files (depcruise enforced)

## Assumptions

- TypeScript 5.x with strict mode is required (already configured in project)
- The `assertNever` utility from `router/src/types/assert-never.ts` is available and tested
- Agents return results via Promise (no streaming results)
- The deprecated `success` getter is transitional only and deleted before PR series merges (no long-term backward compatibility)

## Out of Scope

- Streaming agent results
- Agent result persistence/caching changes (cache key generation unchanged)
- Changes to the Finding interface structure beyond metadata typing
- Changes to AgentMetrics interface
- Adding new agent result variants beyond success/failure/skipped

## Related Work (Recommended for 012-security-hardening)

The following items from clarification are recommended for a separate security-focused feature:

1. **npm bin shim CI test**: Add automated test for symlink entry path resolution
2. **child_process audit**: Document justifications for all 7 usage sites, harden security.ts
3. **Generic Error elimination**: Replace 11 production `throw new Error` with domain-specific errors
4. **ErrorWireFormat round-trip tests**: Add serialization tests proving no context/cause/stack loss
5. **Canary tests for security invariants**: Extend depcruise-rules.test.ts pattern to other invariants
6. **Lint rule for generic Error**: Add ESLint rule to prevent new generic Error throws
