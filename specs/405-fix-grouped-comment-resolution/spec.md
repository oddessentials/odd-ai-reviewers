# Feature Specification: Fix Grouped Comment Resolution Bug

**Feature Branch**: `405-fix-grouped-comment-resolution`
**Created**: 2026-01-30
**Status**: Draft
**Input**: User description: "BUGS.md enterprise-grade solutions that have automated tests to prevents regressions. Tests must cover happy path and edge cases."

## Background

This specification addresses a P2 bug identified in PR #108 (proximity-based deduplication). The stale comment resolution logic incorrectly resolves entire grouped comments when only some findings within the group are stale, causing active security findings to be hidden.

**Bug Location**: `router/src/report/github.ts:448-470` and equivalent logic in `router/src/report/ado.ts`

**Root Cause**: Grouped inline comments contain multiple fingerprint markers (one per finding), but the stale-resolution loop resolves the entire comment as soon as any single marker is identified as stale. This means if findings A and B are grouped together and only A is fixed, the entire comment (including active finding B) gets struck through and marked as "Resolved".

## Clarifications

### Session 2026-01-30

- Q: Resolution state model → A: Comments have exactly two states: resolved or unresolved. Partial resolution is purely visual and MUST NOT introduce any new persisted or emitted state. Resolution decisions are derived only from the current analysis run.
- Q: Source of truth → A: Resolution logic MUST be stateless per run. Decisions based solely on extracted fingerprint markers in comment body and current findings within proximity threshold. No cached, historical, or external state may influence resolution.
- Q: Grouped comment resolution rule → A: A grouped comment MUST NOT be marked as resolved unless every unique fingerprint marker in that comment is stale. If any marker remains active, the comment MUST remain unresolved.
- Q: Malformed marker handling → A: Malformed or missing markers MUST NOT crash resolution logic. Any comment containing at least one malformed or unparseable marker MUST be treated as unresolved. A single structured warning log entry MUST be emitted per comment (no spam).
- Q: Duplicate fingerprint handling → A: Duplicate fingerprint values within a comment MUST be deduplicated before evaluation. Each unique fingerprint counts exactly once toward resolution.
- Q: Logging requirements → A: Resolution actions MUST be logged in structured form. Logs MUST NOT include raw fingerprint strings. Log fields MUST include: platform, commentId, fingerprintCount, staleCount, resolved (boolean).
- Q: P2 visual indication → A: Not deferrable. Resolved findings within an unresolved grouped comment MUST be visually distinguished (e.g., strikethrough). This MUST be implemented now but MUST NOT affect resolution state.
- Q: Backward compatibility → A: Existing comments created before this fix MUST be handled safely. No migration or rewrite of historical comments is required.
- Q: Visual distinction implementation → A: Visual distinction MUST be implemented by modifying the rendered comment body content, not via platform metadata or thread state.
- Q: Log emission frequency → A: Resolution logs MUST be emitted at most once per comment per analysis run, preventing accidental log amplification in large PRs.
- Q: Zero valid markers handling → A: If a comment contains zero valid fingerprint markers after parsing, it MUST be treated as unresolved.
- Q: Test implementation approach → A: Resolution logic MUST be unit-tested with pure data fixtures; platform API calls MUST be mocked.
- Q: Module placement → A: Shared grouped-comment resolution logic MUST live in a clearly named module (e.g., `resolution.ts`), not in a file whose name implies unrelated responsibilities. Rendering/formatting helpers may call into resolution logic, but MUST NOT own it.
- Q: Test file organization → A: Grouped comment resolution tests MUST live in a clearly named test file (e.g., `comment-resolution.test.ts`). Existing `deduplication.test.ts` MUST remain focused on deduplication behavior only.
- Q: Visual distinction mechanism → A: Resolved findings within an unresolved grouped comment MUST be rendered by modifying the comment body content. The visual distinction MUST use a deterministic, platform-safe mechanism (Markdown strikethrough) and MUST preserve fingerprint markers unchanged.
- Q: Resolution log event naming → A: Resolution logging MUST use a single, stable event name (`comment_resolution`). The event name and structured fields MUST be identical across GitHub and Azure DevOps implementations.
- Q: Artifact policy → A: If no external contracts are introduced, the `contracts/` directory MUST NOT contain placeholder files. Internal-only changes MUST be documented inline or omitted from contract artifacts entirely.
- Q: Rate limiting specificity → A: Resolution operations MUST use the existing platform rate limiter helpers already used by current comment/thread resolution code paths; no new per-marker API calls may bypass rate limiting.
- Q: User content preservation → A: When applying visual distinction, the system MUST preserve all non-marker user-authored content byte-for-byte; only the renderer output for individual findings may change (e.g., wrap resolved finding blocks in strikethrough), and fingerprint markers MUST remain unchanged.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Grouped Comment Remains Active When Any Finding Still Exists (Priority: P1)

As a developer reviewing PR comments, when I fix one issue from a grouped comment but another issue remains unresolved, the grouped comment should stay visible with the active finding clearly shown, so that I don't miss remaining security issues.

**Why this priority**: This is the core bug fix. Without this, the system actively hides valid security findings, which defeats the purpose of the review tool and creates false confidence that issues are resolved.

**Independent Test**: Can be fully tested by creating a grouped comment with two findings, fixing one finding in a subsequent push, and verifying the comment is not marked as resolved.

**Acceptance Scenarios**:

1. **Given** a grouped PR comment contains findings A and B (same file, within 3 lines), **When** finding A is fixed but finding B remains in a subsequent push, **Then** the grouped comment must NOT be marked as resolved
2. **Given** a grouped PR comment contains findings A, B, and C, **When** findings A and B are fixed but C remains, **Then** the grouped comment must NOT be marked as resolved
3. **Given** a grouped PR comment contains findings A and B, **When** both A and B are fixed in a subsequent push, **Then** the grouped comment SHOULD be marked as resolved

---

### User Story 2 - Single Finding Comments Resolve Correctly (Priority: P1)

As a developer reviewing PR comments, when I fix an issue that has its own individual comment (not grouped), the comment should be correctly marked as resolved so I can track my progress.

**Why this priority**: This is the existing happy path that must continue working. The bug fix must not break the existing single-comment resolution behavior.

**Independent Test**: Can be fully tested by creating a single-finding comment, fixing the finding, and verifying the comment is marked as resolved.

**Acceptance Scenarios**:

1. **Given** a single-finding PR comment for finding A, **When** finding A is fixed in a subsequent push, **Then** the comment SHOULD be marked as resolved
2. **Given** a single-finding PR comment for finding A, **When** finding A still exists (possibly at a different line within proximity threshold), **Then** the comment must NOT be marked as resolved

---

### User Story 3 - Azure DevOps Grouped Thread Behavior (Priority: P1)

As a developer using Azure DevOps, the same grouped comment resolution logic applies to ADO threads, ensuring threads with active findings are not prematurely closed.

**Why this priority**: The bug exists in both GitHub and ADO implementations. Both must be fixed to provide consistent behavior across platforms.

**Independent Test**: Can be fully tested by creating a grouped ADO thread with two findings, fixing one finding, and verifying the thread is not closed.

**Acceptance Scenarios**:

1. **Given** a grouped ADO thread contains findings A and B, **When** finding A is fixed but B remains, **Then** the thread must NOT be closed (status must not change to 4/Closed)
2. **Given** a grouped ADO thread contains findings A and B, **When** both findings are fixed, **Then** the thread SHOULD be closed

---

### User Story 4 - Partial Resolution Visual Indication (Priority: P1)

As a developer reviewing a grouped comment, when some findings in the group are fixed but others remain, I want a clear indication of which findings were resolved versus which are still active, so I can focus on remaining work.

**Why this priority**: Elevated from P2 to P1 per clarification - visual indication is not deferrable and MUST be implemented now.

**Independent Test**: Can be fully tested by fixing one finding in a grouped comment and verifying the resolved finding is visually distinguished from active findings.

**Acceptance Scenarios**:

1. **Given** a grouped comment with findings A and B where A is fixed, **When** viewing the comment after the next analysis run, **Then** finding A MUST be visually marked as resolved (e.g., strikethrough) while finding B remains unmarked
2. **Given** a grouped comment with multiple findings, **When** all findings are resolved one by one across multiple pushes, **Then** each finding MUST be individually marked as resolved until all are resolved and the entire comment is marked resolved

---

### Edge Cases

- What happens when a grouped comment has only one finding remaining and that finding is fixed? The comment MUST be fully resolved.
- What happens when findings within a group move to different lines but remain within proximity threshold (20 lines)? They MUST still be recognized as the same findings.
- What happens when a finding moves outside the proximity threshold? It MUST be treated as a new finding and the old fingerprint MUST be considered stale.
- What happens when a comment body contains user-added content alongside the fingerprint markers? The resolution logic MUST preserve user content appropriately.
- What happens when the dedupeKeyToCommentId map has multiple keys pointing to the same comment ID? All unique keys MUST be stale for the comment to be resolved.
- What happens with malformed or missing fingerprint markers in existing comments? The comment MUST be treated as unresolved and a single structured warning log MUST be emitted.
- What happens with duplicate fingerprint values within a comment? They MUST be deduplicated before evaluation; each unique fingerprint counts exactly once.
- What happens when a comment contains zero valid fingerprint markers after parsing? The comment MUST be treated as unresolved.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST check all unique fingerprint markers within a grouped comment before marking it as resolved
- **FR-002**: System MUST only mark a grouped comment as resolved when ALL unique fingerprint markers in that comment are identified as stale
- **FR-003**: System MUST preserve existing single-comment resolution behavior (no regression)
- **FR-004**: System MUST implement identical resolution semantics for both GitHub and Azure DevOps platforms; helper logic MUST be shared where possible
- **FR-005**: System MUST treat any comment containing at least one malformed or unparseable marker as unresolved
- **FR-006**: System MUST visually distinguish resolved findings from active findings within grouped comments by modifying the rendered comment body content (not via platform metadata or thread state)
- **FR-007**: System MUST maintain rate limiting behavior during resolution operations
- **FR-008**: System MUST log resolution actions in structured form with fields: platform, commentId, fingerprintCount, staleCount, resolved (boolean); logs MUST NOT include raw fingerprint strings
- **FR-009**: System MUST deduplicate fingerprint values within a comment before evaluation; each unique fingerprint counts exactly once
- **FR-010**: System MUST emit exactly one structured warning log entry per comment with malformed markers (no spam)
- **FR-011**: Resolution logic MUST be stateless per run; decisions based solely on current analysis data
- **FR-012**: Visual indication of resolved findings MUST NOT affect or introduce any new resolution state
- **FR-013**: System MUST treat any comment containing zero valid fingerprint markers after parsing as unresolved
- **FR-014**: System MUST emit resolution logs at most once per comment per analysis run to prevent log amplification in large PRs
- **FR-015**: Shared grouped-comment resolution logic MUST live in a dedicated module with a semantically correct name (e.g., `resolution.ts`); rendering/formatting modules MUST NOT own resolution logic
- **FR-016**: Resolution logging MUST use a single, stable event name (`comment_resolution`) with identical structured fields across all platforms
- **FR-017**: Visual distinction MUST use Markdown strikethrough and MUST preserve all fingerprint markers unchanged
- **FR-018**: Resolution operations MUST use the existing platform rate limiter helpers already used by current comment/thread resolution code paths; no new per-marker API calls may bypass rate limiting
- **FR-019**: When applying visual distinction, system MUST preserve all non-marker user-authored content byte-for-byte; only the renderer output for individual findings may change (e.g., wrap resolved finding blocks in strikethrough)

### Key Entities

- **GroupedComment**: A PR comment containing multiple findings (and multiple fingerprint markers) for issues within close proximity (typically 3 lines). Has exactly two states: resolved or unresolved.
- **FindingMarker**: A fingerprint marker embedded in a comment that uniquely identifies a specific finding (format: `<!-- odd-ai-reviewers:fingerprint:v1:FINGERPRINT:FILE:LINE -->`)
- **StaleMarker**: A fingerprint marker that has no matching current finding within the proximity threshold (20 lines)
- **UniqueFingerprints**: The deduplicated set of fingerprint values extracted from a comment; duplicates are collapsed before resolution evaluation

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: 100% of grouped comments with at least one active finding remain unresolved after analysis runs
- **SC-002**: 100% of grouped comments where all unique findings are fixed are correctly marked as resolved
- **SC-003**: Zero regressions in single-comment resolution behavior (existing tests continue to pass)
- **SC-004**: Test coverage MUST be table-driven and include: none resolved, some resolved, all resolved, malformed markers, duplicate markers, zero valid markers, proximity boundary cases
- **SC-005**: Both GitHub and Azure DevOps implementations MUST pass equivalent behavioral tests
- **SC-006**: Visual indication of resolved findings is present in all grouped comments with partial resolution
- **SC-007**: Resolution logic MUST be unit-tested with pure data fixtures; platform API calls MUST be mocked
- **SC-008**: Resolution tests MUST live in a dedicated test file (e.g., `comment-resolution.test.ts`), separate from deduplication tests

## Assumptions

- The existing `extractFingerprintMarkers` function correctly extracts all markers from a comment body
- The `dedupeKeyToCommentId` map correctly maps all fingerprint markers to their containing comment IDs
- The proximity threshold (20 lines) is authoritative and MUST NOT be changed
- Grouped comments always have at least 2 findings (single-finding comments are never grouped)
- The fingerprint format is stable and won't change during this fix
- Existing comments created before this fix will be handled safely with no migration required

## Constraints

### Final Constraint

> **A grouped comment is resolved if and only if all unique fingerprint markers in that comment are stale in the current analysis run. No exceptions.**

### Test Constraints

- Resolution logic MUST be unit-tested with pure data fixtures
- Platform API calls MUST be mocked in all unit tests
- Tests MUST be deterministic and table-driven
- Resolution tests MUST be in a dedicated file (`comment-resolution.test.ts`), not mixed with deduplication tests

### Module Constraints

- Shared resolution logic MUST live in `resolution.ts` (or similarly named dedicated module)
- Rendering/formatting modules (`base.ts`, `formats.ts`) may call resolution logic but MUST NOT own it
- Resolution log event MUST use stable name `comment_resolution` across all platforms

### Artifact Constraints

- No placeholder or ceremonial files in `contracts/` directory
- Internal-only interfaces documented inline in source code
