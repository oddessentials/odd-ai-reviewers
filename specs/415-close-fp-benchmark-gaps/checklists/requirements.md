# Specification Quality Checklist: Close All 12 Unsuppressed FP Benchmark Scenarios

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-03-13
**Revised**: 2026-03-13 (v3 — post second-round critique review)
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
- [x] Scope is clearly bounded (Out of Scope section added)
- [x] Dependencies and assumptions identified

## Round 1 Critique Response Verification

- [x] **Critique 1**: All 12 scenarios explicitly classified — no escape hatches remain. fp-d-006 reclassified as TP. 3 fixtures marked for adjustment.
- [x] **Critique 2**: FR-001 through FR-007 all include "Suppress when", "Suppress what", and "Pass through" sub-sections. No "suppress ALL" language.
- [x] **Critique 3**: T024 (OAuth2) matcher REMOVED entirely. fp-d-006 reclassified as true positive. PR descriptions excluded from security suppression evidence.
- [x] **Critique 4**: T025 has strict closed evidence contract: 2 APIs, 5 bases, 3 segment forms, canonical regex, alias rejection, explicit rejection list.
- [x] **Critique 5**: T023 messagePattern NOT widened. New allSettled-error matcher deferred to separate spec amendment with strict evidence requirement.
- [x] **Critique 6**: Dismissive patterns explicitly tied to three-gate architecture. Phrase match alone documented as NEVER sufficient. Documentation comment required.
- [x] **Critique 7**: Single provider hard gate for recording. Cross-provider verification explicitly advisory-only (FR-023). No mixed "should"/"must" language.
- [x] **Critique 8**: CI merge gate is replay-only. Prompt hash drift = hard failure (strengthened in Round 2 Critique B). Snapshot recording separated from merge gate. API keys not needed for CI.
- [x] **Critique 9**: SC-007 tightened with equivalence conditions. FR-018 has 5 explicit sub-requirements. Legitimate divergences documented.
- [x] **Critique 10**: SC-008 (pre-existing issues) removed. FR-019/FR-020 (Semgrep/SHA-pin) moved to Out of Scope. FR-021/FR-022 collapsed into single FR-019. SC-010 reworded as non-regression criterion.

## Round 2 Critique Response Verification

- [x] **Critique A (SC-001/SC-004 conflict)**: SC-001 rewritten as per-scenario gate — each of the 11 FP scenarios individually must produce zero surviving findings. SC-004 rewritten as aggregate non-regression floor for all 36 FP scenarios. No overlap or contradiction between the two criteria.
- [x] **Critique B (prompt-hash freshness)**: FR-022 enforces two-part hard gate: fixture hash match (Gate 1 — replay validity) AND prompt hash match (Gate 2 — prompt freshness). Both are hard failures. Workflow defined: change prompts → re-record → commit both in same PR. Acceptance scenario 3 and edge cases updated to match. No warn-only path — snapshots must be current.
- [x] **Critique C (T025 single-line scope)**: FR-011 has explicit "Deliberate scope limitation" paragraph. Single-line only, 85-90% coverage target, 5 expected pass-through variants documented. Implementers MUST NOT extend regex without spec amendment.
- [x] **Critique D (FR-006 structural only)**: FR-006 completely rewritten. ALL naming heuristics removed (function names, parameter names, file names). "Structural" defined as: `catch` keyword OR explicit `: Error`/`: SomeError` type annotation observable in the diff. 4 non-structural signals explicitly listed as MUST NOT use.
- [x] **Critique E (FR-003/FR-004 proximity)**: FR-003 replaces "near the finding" with "within 10 lines of the finding line AND in the same diff file section (hunk)". FR-004 replaces "single construction site" with 3 observable regex conditions (module-scoped null init, guard check, single construction).
- [x] **Critique F (FR-017c fixture shape)**: FR-017c expanded with required fixture fields, required diff structure, allowlisted stdlib calls (8 calls), prohibited elements (I/O modules, async, multiple statements), and compliance verification of current fixture.
- [x] **Critique G (SC-007/FR-018 CLI parity)**: FR-018 narrowed to "exactly 4 post-processing stages" as complete and exhaustive definition. SC-007 references FR-018(a)-(d) directly. 5 out-of-scope divergences explicitly listed as accepted and NOT measured by SC-007.
- [x] **Critique H (fp-d-006 TP match contract)**: FR-017a uses exact `ExpectedFinding` shape consistent with all 18 existing TP scenarios: `{ file: "src/auth.ts", severityAtLeast: "warning", messageContains: "token" }`. Each field choice is justified. Line and ruleId deliberately omitted (cross-provider portability).
- [x] **Critique I (FR-014 evidence coupling)**: FR-014 has 4-part evidence coupling invariant: (a) same evidence validator, (b) 4-param + Express required, (c) 5 negative test cases per phrase, (d) no bypass code path. No phrase-only suppression possible.
- [x] **Critique J (fixture integrity)**: Fixture Integrity Rule (FIR-1 through FIR-4) in Constraints section. Per-fixture behavioral preservation constraints for fp-c-005, fp-f-005, fp-f-015. Realism preservation, no behavioral removal, and PR review gate defined. New edge case added.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows with explicit pass-through assertions
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification
- [x] Security boundary explicitly preserved (severity gates, defense-in-depth, no cosmetic-metadata evidence)
- [x] Per-scenario gates differentiated from aggregate floors (SC-001 vs SC-004)
- [x] All proximity/evidence conditions use exact observable criteria (no vague "near" or "related")
- [x] Fixture editing constrained by structural realism rule

## Notes

- Spec v3 addresses all 20 review critiques across 2 specialist review rounds
- 29 functional requirements cover 6 categories: prompt conventions, matchers, pipeline, CLI parity, benchmark thresholds, snapshots
- 10 success criteria provide measurable verification gates with clear per-scenario vs aggregate distinction
- 9 edge cases address boundary conditions including drift handling, aliases, CLI divergence, staleness, and fixture integrity
- Closed matcher table amended from 5 to 7 (not 8 — T024 removed)
- Out of Scope section explicitly defers 5 items to separate PRs
- All acceptance scenarios include both suppression AND pass-through assertions
- Evidence requirements use structural observability (catch keyword, type annotations, regex patterns) — no naming heuristics
- Spec is ready for `/speckit.plan`
