# Quickstart: Fix Grouped Comment Resolution Bug

**Feature**: 405-fix-grouped-comment-resolution
**Date**: 2026-01-30

## Prerequisites

- Node.js >= 22.0.0
- pnpm (package manager)
- Git

## Setup

```bash
# Clone and checkout feature branch
git checkout 405-fix-grouped-comment-resolution

# Install dependencies
pnpm install

# Run existing tests to establish baseline
pnpm test
```

## Key Files

| File                                              | Purpose                                             |
| ------------------------------------------------- | --------------------------------------------------- |
| `router/src/report/resolution.ts`                 | **NEW**: Dedicated resolution logic module          |
| `router/src/report/github.ts`                     | GitHub-specific integration (calls resolution.ts)   |
| `router/src/report/ado.ts`                        | ADO-specific integration (calls resolution.ts)      |
| `router/src/report/base.ts`                       | Comment formatting (calls resolution.ts for visual) |
| `router/src/report/formats.ts`                    | Fingerprint/dedupe utilities (unchanged scope)      |
| `router/src/__tests__/comment-resolution.test.ts` | **NEW**: Dedicated resolution tests                 |
| `router/src/__tests__/deduplication.test.ts`      | Existing dedupe tests (unchanged scope)             |

## Implementation Order

1. **Create `resolution.ts` module** (new file)
   - `buildCommentToMarkersMap()`
   - `shouldResolveComment()`
   - `getPartiallyResolvedMarkers()`
   - `applyPartialResolutionVisual()`

2. **Update GitHub resolution** (`github.ts`)
   - Import and call `resolution.ts` helpers
   - Replace per-marker loop with per-comment evaluation
   - Add visual distinction for partial resolution
   - Use `comment_resolution` log event

3. **Update ADO resolution** (`ado.ts`)
   - Apply identical pattern as GitHub
   - Use same `comment_resolution` log event

4. **Create `comment-resolution.test.ts`** (new file)
   - Table-driven tests for all resolution scenarios
   - Platform parity verification

## Running Tests

```bash
# Run all tests
pnpm test

# Run resolution tests only
pnpm test router/src/__tests__/comment-resolution.test.ts

# Run with coverage
pnpm test --coverage

# Watch mode during development
pnpm test --watch
```

## Test Scenarios to Cover

| Scenario                      | Expected Behavior                                  |
| ----------------------------- | -------------------------------------------------- |
| All markers stale             | Comment resolved                                   |
| Some markers stale            | Comment NOT resolved; stale findings strikethrough |
| No markers stale              | Comment NOT resolved                               |
| Malformed marker present      | Comment NOT resolved; warning logged               |
| Duplicate markers             | Deduplicated before evaluation                     |
| Zero valid markers            | Comment NOT resolved                               |
| Single-finding comment stale  | Comment resolved (regression test)                 |
| Proximity boundary (20 lines) | Correct stale identification                       |

## Log Event Format

All resolution logging uses the stable `comment_resolution` event:

```json
{
  "event": "comment_resolution",
  "platform": "github",
  "commentId": 12345,
  "fingerprintCount": 3,
  "staleCount": 2,
  "resolved": false
}
```

## Verification Commands

```bash
# Lint check
pnpm lint

# Type check
pnpm typecheck

# Full CI check
pnpm lint && pnpm typecheck && pnpm test
```

## Success Criteria

- [ ] All existing tests pass (no regressions)
- [ ] New `comment-resolution.test.ts` covers all scenarios
- [ ] GitHub and ADO pass equivalent behavioral tests
- [ ] Logs use `comment_resolution` event with required fields
- [ ] Visual distinction visible in partial resolution scenarios
- [ ] Resolution logic lives in `resolution.ts` (not in formats.ts)
