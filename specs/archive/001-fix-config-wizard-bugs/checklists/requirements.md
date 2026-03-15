# Specification Quality Checklist: Fix Config Wizard Validation Bugs

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-01-31
**Updated**: 2026-01-31 (after clarifications - session 3)
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All items pass validation
- Spec is ready for `/speckit.tasks`
- Four distinct bugs are covered as four user stories with clear priorities:
  - P1: Auto-applied model not propagated (critical runtime failure)
  - P2: Ollama provider falsely requires OLLAMA_BASE_URL
  - P2: Config init validation crashes
  - P3: Both platform option drops ADO reporting

### Clarifications Applied (2026-01-31) - Session 1

1. **Single Source of Truth Rule**: Added FR-001 through FR-004 establishing that preflight returns `resolvedConfig` and runReview uses it exclusively—no re-resolution after preflight. This prevents "preflight passes, runtime fails" drift.

2. **Ollama URL Validation Tightened**:
   - FR-005: OLLAMA_BASE_URL optional ONLY when `provider: ollama`
   - FR-007: Invalid URL format is a preflight error (not runtime)
   - FR-008: Connectivity check remains runtime (explicit boundary)
   - Added acceptance scenarios for valid/invalid URL formats

3. **Both Platform Warning**:
   - FR-013: Validation warns when neither platform env detected
   - FR-014: Warning is informational, not error (config still valid)
   - Added acceptance scenario for runtime behavior when only one platform active

### Clarifications Applied (2026-01-31) - Session 2

4. **Enforceable No-Reresolution Guardrail**:
   - FR-015: Regression test MUST spy/mock resolver functions and assert exactly one call per command path
   - FR-016: Regression test MUST verify AgentContext derived exclusively from ResolvedConfig
   - SC-009: Added success criterion for regression test existence

5. **Exit Code Semantics with Warnings**:
   - FR-018: `validate` exits non-zero only on errors (warnings don't affect exit)
   - FR-019: `config init` post-validate exits 0 unless errors exist
   - FR-020: Warnings never block execution or cause non-zero exit
   - FR-017: "Both" platform warning must list exact env vars checked
   - SC-010: Added success criterion for exit 0 with warnings-only
   - Updated acceptance scenarios in US3 and US4 to include exit code expectations

### Clarifications Applied (2026-01-31) - Session 3

6. **Validate Must Match Review Preflight Exactly**:
   - FR-021: Regression test MUST run both `validate` and `review` on same repo/env and assert identical resolved tuple
   - FR-022: `validate` must NOT perform any resolution branches that `review` doesn't
   - SC-011: Added success criterion for validate/review parity test
   - Added acceptance scenario US1.5 for validate/review tuple comparison

7. **Cancel/Non-TTY Exit Semantics**:
   - FR-023: Wizard cancellation (Ctrl+C, EOF) MUST exit 0
   - FR-024: Non-TTY without `--defaults` MUST exit 1 with single-line actionable error
   - FR-025: `validate` and `review` MUST never prompt—fail fast with error
   - FR-026: No command may hang waiting for stdin in CI
   - SC-012: Wizard cancel → exit 0 (verified by test)
   - SC-013: Non-TTY → exit 1 with message (verified by test)
   - SC-014: No CI stdin hang (verified by test)
   - Added acceptance scenarios US3.5 and US3.6 for cancel and non-TTY behavior
   - Added edge cases for prompt behavior and cancellation

### Key Entities Updated

- **ResolvedConfig**: New entity—single source of truth for provider/model/keySource/configSource
- **PreflightResult**: Now includes warnings array in addition to errors

### Plan Updates

- Added new test file: `validate-review-parity.test.ts`
- Phase 6 expanded to include cancel semantics and non-TTY behavior
- Phase 7 expanded with additional regression tests (items 3, 4, 11, 12, 13)
- Risk assessment updated to include CI hang mitigation
