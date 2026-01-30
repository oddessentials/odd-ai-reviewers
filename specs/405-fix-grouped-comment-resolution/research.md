# Research: Fix Grouped Comment Resolution Bug

**Feature**: 405-fix-grouped-comment-resolution
**Date**: 2026-01-30

## Overview

This research documents the investigation into the grouped comment resolution bug and the design decisions for the fix.

## Research Tasks

### 1. Current Resolution Logic Analysis

**Question**: How does the current stale comment resolution work?

**Findings**:

- `identifyStaleComments()` in `formats.ts` returns a list of dedupe keys for markers that have no matching current finding within proximity threshold
- In `github.ts:448-483`, the resolution loop iterates over stale keys and resolves comments individually
- The `dedupeKeyToCommentId` map is built by iterating all markers in existing comments and mapping each to its comment ID
- **Bug**: When a stale key is found, the entire comment is resolved without checking if other markers in the same comment are still active

### 2. Grouped Comment Structure

**Question**: How are grouped comments formatted and what markers do they contain?

**Findings**:

- `formatGroupedInlineComment()` in `base.ts:55-73` creates grouped comments
- Each finding in the group gets its own fingerprint marker appended at the end
- A grouped comment with 2 findings has 2 separate markers in its body
- The `dedupeKeyToCommentId` map correctly maps multiple keys to the same comment ID

### 3. Resolution State Model

**Decision**: Binary state model (resolved/unresolved)
**Rationale**: Per clarification, comments have exactly two states. Partial resolution is purely visual and does not introduce new persisted state.
**Alternatives Considered**:

- Three-state model (unresolved/partial/resolved) - rejected as it adds complexity and requires state tracking

### 4. Resolution Algorithm Design

**Decision**: Check all markers in comment before resolving
**Rationale**: Before resolving any comment, gather all markers that map to that comment ID and verify ALL are in the stale set. Only resolve if the intersection equals the full marker set.
**Implementation**:

```typescript
// Build reverse map: commentId -> all markers in that comment
const commentIdToMarkers = new Map<number, string[]>();
for (const [marker, commentId] of dedupeKeyToCommentId) {
  const existing = commentIdToMarkers.get(commentId) ?? [];
  existing.push(marker);
  commentIdToMarkers.set(commentId, existing);
}

// Resolve only if ALL markers for a comment are stale
for (const commentId of commentIdToMarkers.keys()) {
  const markersInComment = commentIdToMarkers.get(commentId) ?? [];
  const allStale = markersInComment.every((m) => staleKeys.includes(m));
  if (allStale) {
    // Safe to resolve entire comment
  }
}
```

### 5. Visual Distinction for Partial Resolution

**Decision**: Modify comment body content with strikethrough on resolved findings
**Rationale**: Per clarification, visual distinction must be implemented by modifying rendered content, not via platform metadata.
**Implementation**:

- When updating a grouped comment with partial resolution, identify which finding lines correspond to stale markers
- Apply `~~strikethrough~~` to those specific finding entries in the comment body
- Preserve active finding entries unmarked
- Keep all fingerprint markers intact for future resolution tracking

### 6. Logging Requirements

**Decision**: Structured log with capped emission
**Rationale**: Per clarification, logs must be emitted at most once per comment per analysis run.
**Implementation**:

- Log fields: `platform`, `commentId`, `fingerprintCount`, `staleCount`, `resolved` (boolean)
- Log raw fingerprint strings excluded
- Emit log entry when resolution decision is made for a comment (whether resolved or not)

### 7. Edge Cases

**Decision**: Defensive handling for malformed/zero markers
**Rationale**: Per clarification, comments with malformed or zero valid markers must be treated as unresolved.
**Implementation**:

- If `parseDedupeKey()` returns null for any marker, treat comment as unresolved
- If deduplicated marker count is zero, treat comment as unresolved
- Emit single warning log per comment with malformed markers

### 8. Module Placement

**Decision**: Create dedicated `resolution.ts` module for shared resolution logic
**Rationale**: Per clarification, resolution logic MUST live in a semantically named module. `formats.ts` implies formatting/rendering responsibilities, not resolution decisions.
**New Module** (`router/src/report/resolution.ts`):

- `shouldResolveComment(allMarkersInComment: string[], staleMarkers: string[]): boolean`
- `getPartiallyResolvedMarkers(allMarkersInComment: string[], staleMarkers: string[]): string[]`
- `buildCommentToMarkersMap(dedupeKeyToCommentId: Map<string, number>): Map<number, string[]>`
- `applyPartialResolutionVisual(body: string, resolvedMarkers: string[]): string`

### 9. Test Organization

**Decision**: Create dedicated `comment-resolution.test.ts` file
**Rationale**: Per clarification, resolution tests MUST be separate from deduplication tests.
**Test File** (`router/src/__tests__/comment-resolution.test.ts`):

- Table-driven tests for grouped comment resolution
- Tests for partial visual indication
- Malformed/zero marker edge cases
- Platform parity verification

### 10. Log Event Naming

**Decision**: Use stable event name `comment_resolution`
**Rationale**: Per clarification, event name and fields MUST be identical across platforms.
**Log Format**:

```typescript
console.log(
  JSON.stringify({
    event: 'comment_resolution',
    platform: 'github' | 'ado',
    commentId: number,
    fingerprintCount: number,
    staleCount: number,
    resolved: boolean,
  })
);
```

## Summary

All research tasks complete. No NEEDS CLARIFICATION items remain. The implementation approach is:

1. Create new `resolution.ts` module with shared resolution logic
2. Update `github.ts` to call `resolution.ts` helpers
3. Update `ado.ts` with identical integration pattern
4. Implement partial resolution visual indication (strikethrough, preserves markers)
5. Create dedicated `comment-resolution.test.ts` with table-driven tests
6. Use stable `comment_resolution` log event name across platforms
