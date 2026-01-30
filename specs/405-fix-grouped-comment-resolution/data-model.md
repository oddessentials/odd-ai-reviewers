# Data Model: Fix Grouped Comment Resolution Bug

**Feature**: 405-fix-grouped-comment-resolution
**Date**: 2026-01-30

## Overview

This feature does not introduce new persistent data models. All resolution logic is stateless per run. This document describes the ephemeral data structures used during resolution.

## Entities

### CommentResolutionContext

Ephemeral context built during a resolution pass.

| Field         | Type       | Description                                                  |
| ------------- | ---------- | ------------------------------------------------------------ |
| commentId     | `number`   | Platform-specific comment/thread identifier                  |
| markers       | `string[]` | All unique fingerprint markers in the comment (deduplicated) |
| staleMarkers  | `string[]` | Subset of markers identified as stale                        |
| hasMalformed  | `boolean`  | Whether any marker failed parsing                            |
| shouldResolve | `boolean`  | Computed: true IFF all markers are stale and none malformed  |

### ResolutionDecision

Result of evaluating a comment for resolution.

| Field             | Type       | Description                                                             |
| ----------------- | ---------- | ----------------------------------------------------------------------- |
| commentId         | `number`   | Platform-specific comment/thread identifier                             |
| resolved          | `boolean`  | Whether the comment was marked as resolved                              |
| fingerprintCount  | `number`   | Total unique fingerprints in comment                                    |
| staleCount        | `number`   | Number of stale fingerprints                                            |
| partiallyResolved | `string[]` | Markers that are stale but comment not resolved (for visual indication) |

### ResolutionLog (structured output)

Log entry emitted once per comment per run using stable event name `comment_resolution`.

| Field            | Type                   | Description                                    |
| ---------------- | ---------------------- | ---------------------------------------------- |
| event            | `'comment_resolution'` | Stable event name (identical across platforms) |
| platform         | `'github' \| 'ado'`    | Platform identifier                            |
| commentId        | `number`               | Platform-specific comment/thread identifier    |
| fingerprintCount | `number`               | Total unique fingerprints evaluated            |
| staleCount       | `number`               | Number of stale fingerprints                   |
| resolved         | `boolean`              | Whether resolution was applied                 |

**Note**: Raw fingerprint strings are NOT included in logs per security requirements.

## Relationships

```text
Comment (platform)
    └── contains 1..N FindingMarker(s)
           └── each marker maps to exactly 1 Finding (via fingerprint)

CommentResolutionContext
    └── aggregates markers by commentId
           └── compares against stale set from identifyStaleComments()

ResolutionDecision
    └── computed from CommentResolutionContext
           └── drives platform-specific resolution action
```

## State Transitions

Comments have exactly two states:

```text
┌─────────────┐                    ┌────────────┐
│  UNRESOLVED │ ──── all stale ──→ │  RESOLVED  │
└─────────────┘                    └────────────┘
       ↑                                  │
       │                                  │
       └──── any marker active ───────────┘
             (no transition)
```

**Invariant**: A comment transitions to RESOLVED if and only if ALL unique fingerprint markers in that comment are stale in the current analysis run.

## Validation Rules

1. **Marker Validity**: Each marker must parse successfully via `parseDedupeKey()`
2. **Deduplication**: Duplicate fingerprint values within a comment are collapsed before evaluation
3. **Zero Markers**: Comments with zero valid markers after parsing remain UNRESOLVED
4. **Malformed Markers**: Comments with ANY malformed marker remain UNRESOLVED

## Data Flow

All resolution logic lives in dedicated `resolution.ts` module.

```text
1. Extract markers from comment body
   └── extractFingerprintMarkers(body) → string[]  [formats.ts]

2. Deduplicate markers
   └── [...new Set(markers)] → string[]  [resolution.ts]

3. Parse each marker
   └── parseDedupeKey(marker) → {fingerprint, file, line} | null  [formats.ts]

4. Build comment-to-markers map
   └── buildCommentToMarkersMap(dedupeKeyToCommentId) → Map<commentId, markers[]>  [resolution.ts]

5. Compare against stale set
   └── shouldResolveComment(allMarkers, staleMarkers) → boolean  [resolution.ts]

6. Apply visual distinction for partial resolution
   └── applyPartialResolutionVisual(body, resolvedMarkers) → string  [resolution.ts]

7. Apply resolution action
   └── Platform-specific: update comment body (GitHub) or close thread (ADO)  [github.ts/ado.ts]

8. Emit log entry (once per comment)
   └── { event: 'comment_resolution', platform, commentId, fingerprintCount, staleCount, resolved }
```
