# Feature Specification: Fix Agent Result Union Regressions

**Feature Branch**: `012-fix-agent-result-regressions`
**Created**: 2026-01-29
**Status**: Draft
**Input**: User description: "Fix regressions in the reporting pipeline (partial findings dropped), cache handling (legacy cached results trigger runtime failure), and validation helper (BrandHelpers.is ignores additionalValidation)"

## Clarifications

### Session 2026-01-29

- Q: How should partial findings be stored relative to complete findings? → A: Separate collections (`completeFindings` and `partialFindings`) end-to-end; gating uses completeFindings only
- Q: How should findings indicate partial status? → A: Add `provenance: 'complete' | 'partial'` field to Finding type
- Q: How should cache validation detect legacy entries? → A: Schema-driven via `AgentResultSchema.safeParse()`; on failure → cache miss + re-run
- Q: How to prevent repeatedly re-hitting legacy cache entries? → A: Version the cache key/schema; legacy entries invalidated by version bump
- Q: Should existing tests remain unmodified? → A: Tests may be updated for new labeling/fields; equivalent outcomes required
- Q: How should BrandHelpers.is() be implemented for consistency? → A: Implement as "try parse() and return Ok/Err" with property-based test asserting `.is(x) === isOk(parse(x))`
- Q: What are the deduplication rules for partialFindings? → A: Dedupe within partialFindings only (same finding from same failed agent); no cross-collection deduplication against completeFindings
- Q: Where does cache version live and who owns incrementing it? → A: Schema constant (`CACHE_SCHEMA_VERSION`) co-located with AgentResultSchema in types file; bumped manually on schema changes, code-reviewed
- Q: Is Finding.provenance backward-compatible? → A: Yes; optional field defaults to 'complete' when absent; no FindingSchema version bump required
- Q: How is cache versioning enforced end-to-end? → A: CACHE_SCHEMA_VERSION included in cache key generation (key.ts); legacy keys unreachable by design
- Q: What is the dedup key for partialFindings? → A: `sourceAgent + file + line + ruleId` (includes sourceAgent to scope dedup within same agent)
- Q: How to implement property-based tests without new deps? → A: Fixed wide corpus table + fuzz loop with crypto.randomBytes; no generator library
- Q: Should new tests assert provenance on success results? → A: Add assertion in existing 'success result' tests that `finding.provenance === 'complete'` (no new test file/suite)
- Q: Where should provenance schema validation tests live? → A: Schema/type validation in `types.test.ts`; keep `execute.test.ts` focused on collection/flow only

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Partial Findings from Failed Agents Preserved (Priority: P1)

When an agent fails partway through execution (e.g., Semgrep encounters an exec error after finding some issues), the partial findings gathered before the failure are preserved in a separate `partialFindings` collection and shown to users in the report in a dedicated section, distinct from complete findings.

**Why this priority**: This is the most impactful regression - users lose visibility into real code issues that were detected before an agent failure. This directly affects the core value proposition of code review.

**Independent Test**: Can be fully tested by triggering a Semgrep agent failure after it has detected findings, and verifying those findings appear in the final report in the partial findings section with `provenance: 'partial'`.

**Acceptance Scenarios**:

1. **Given** an agent discovers findings before encountering an execution error, **When** the review completes, **Then** the partial findings appear in a dedicated report section with `provenance: 'partial'`
2. **Given** an agent fails with partialFindings in its failure result, **When** the reporting phase runs, **Then** partialFindings are collected separately from completeFindings (not merged into allFindings)
3. **Given** an agent fails with no partial findings, **When** the review completes, **Then** the failure is reported normally without phantom findings

---

### User Story 2 - Legacy Cache Entries Handled Gracefully (Priority: P1)

When the system encounters cached AgentResult entries from before the status-based union migration, it validates them using `AgentResultSchema.safeParse()`. Entries that fail schema validation (including legacy format) are treated as cache misses, triggering agent re-execution. Cache versioning prevents repeated re-hits of legacy entries.

**Why this priority**: This is a production-breaking regression - any existing `.ai-review-cache` with old entries will cause runtime failures on cache hits, terminating required passes. Users cannot use the system at all with existing caches.

**Independent Test**: Can be fully tested by creating a cache entry with the old format (success: true, no status field), triggering a cache hit, and verifying the agent re-runs instead of crashing.

**Acceptance Scenarios**:

1. **Given** a cache contains legacy AgentResult entries (success: boolean, no status field), **When** `AgentResultSchema.safeParse()` runs, **Then** validation fails and the entry is treated as a cache miss
2. **Given** a cache contains new-format entries (status: 'success'|'failure'|'skipped'), **When** a cache hit occurs, **Then** the cached result passes schema validation and is used normally
3. **Given** a cache version bump occurs, **When** old-version entries are encountered, **Then** they are invalidated and agents re-run (no repeated legacy re-hits)

---

### User Story 3 - BrandHelpers.is Validates Fully (Priority: P2)

When code uses `SafeGitRefHelpers.is()` as a type guard before executing git commands, the implementation calls `parse()` internally and returns whether the result is Ok, ensuring perfect consistency between `.is()` and `.parse()`.

**Why this priority**: This is a security regression - code relying on `.is()` as a safety guard could pass unsafe git refs to shell commands. While `.parse()` correctly rejects them, inconsistent behavior between `.is()` and `.parse()` is a trap for developers.

**Independent Test**: Can be fully tested by calling `SafeGitRefHelpers.is('refs/../main')` and verifying it returns false (matching what `.parse()` would reject). Property-based tests assert `.is(x) === isOk(parse(x))` for a wide input corpus.

**Acceptance Scenarios**:

1. **Given** a git ref containing forbidden patterns (e.g., `..`, shell metacharacters), **When** `SafeGitRefHelpers.is()` is called, **Then** it returns false (same as `isOk(parse(x))`)
2. **Given** a valid git ref passing both schema and additional validation, **When** `SafeGitRefHelpers.is()` is called, **Then** it returns true
3. **Given** any input value, **When** both `.is()` and `.parse()` are called, **Then** `.is(x) === isOk(parse(x))` (verified by property-based test)

---

### Edge Cases

- What happens when an agent returns partialFindings but they are empty arrays? Should not add phantom findings to partialFindings collection
- How does the system handle cache entries that are malformed/corrupted beyond just legacy format? Schema validation fails → treated as cache miss
- What happens if BrandHelpers.is is called with null/undefined? Should return false without throwing (parse handles this)
- What happens when multiple agents fail with partial findings? All collected into partialFindings with appropriate agent attribution
- What if partialFindings contains duplicates of findings from other agents? No cross-collection deduplication; partialFindings deduped only within same agent's output to preserve provenance

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: Execute phase MUST collect partialFindings from AgentResultFailure results into a separate `partialFindings` collection (NOT merged into completeFindings/allFindings)
- **FR-002**: Partial findings MUST have `provenance: 'partial'` field; complete findings MUST have `provenance: 'complete'`; field is optional and defaults to 'complete' when absent (backward-compatible)
- **FR-003**: Cache retrieval MUST validate cached AgentResult using `AgentResultSchema.safeParse()` before use
- **FR-004**: Cache entries failing schema validation MUST be treated as cache misses, triggering agent re-execution
- **FR-005**: Cache MUST include a version identifier via `CACHE_SCHEMA_VERSION` constant co-located with AgentResultSchema; cache key generation (key.ts) MUST include version so legacy keys are unreachable
- **FR-006**: BrandHelpers.is() MUST be implemented as `isOk(parse(x))` to ensure definitional consistency
- **FR-007**: Reporting MUST render partialFindings in a dedicated section, separate from completeFindings
- **FR-008**: Gating decisions MUST use completeFindings only; partialFindings are informational
- **FR-009**: Tests MUST verify `.is(x) === isOk(parse(x))` using fixed wide corpus table + fuzz loop with crypto.randomBytes (no new dependencies)
- **FR-010**: Deduplication MUST occur within partialFindings only using key `sourceAgent + file + line + ruleId`; NO cross-collection deduplication against completeFindings
- **FR-011**: Test MUST prove dedup is within-partials only (same finding in both collections preserved)

### Key Entities

- **AgentResult**: Discriminated union with status field ('success' | 'failure' | 'skipped') - the core type being migrated
- **AgentResultFailure**: Failure variant that can optionally contain partialFindings array
- **Finding**: Individual code review finding with optional `provenance?: 'complete' | 'partial'` (defaults to 'complete' when absent; backward-compatible Structured Findings Contract change)
- **CacheEntry**: Stored AgentResult validated via schema; keyed with `CACHE_SCHEMA_VERSION` for invalidation on schema changes
- **BrandHelpers**: Type-safe helper factory; `.is()` implemented via `.parse()` for consistency

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of partial findings from failed agents appear in final reports in dedicated partial findings section
- **SC-002**: Zero runtime crashes when encountering legacy cache entries - graceful degradation to cache miss via schema validation
- **SC-003**: BrandHelpers.is() and .parse() agree on all inputs - verified by property-based test with wide input corpus
- **SC-004**: All existing tests continue to pass with equivalent outcomes; tests may be updated for new labeling/fields
- **SC-005**: New test cases cover all three regression scenarios with both positive and negative cases
- **SC-006**: Cache versioning prevents repeated re-execution of legacy entries after initial migration
