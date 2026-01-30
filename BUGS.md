# Code Review: PR #108 - Proximity-Based Deduplication for Line Drift

**Date**: 2026-01-30
**PR**: https://github.com/oddessentials/odd-ai-reviewers/pull/108
**Branch**: claude/fix-duplicate-pr-comments-E4ZER

## Overview

This PR implements a proximity-based deduplication system to solve the "line drift" problem where security findings move to different line numbers between pushes due to code insertions/deletions. Instead of creating duplicate comments, the system now detects these as the same issue and also resolves stale comments when issues are fixed.

---

## Code Quality & Style

**Positives:**

- Well-documented functions with clear JSDoc comments
- Consistent coding style matching the existing codebase
- Good separation of concerns - deduplication logic in `formats.ts`, integration in `ado.ts`/`github.ts`
- Exported `LINE_PROXIMITY_THRESHOLD` as a constant for configurability

**Minor suggestions:**

- The `extractFingerprintFromKey` function is exported but not used anywhere in the codebase - consider if it's needed or remove it

---

## Implementation Analysis

**1. Parsing Logic (`parseDedupeKey`) - Solid**

- Handles file paths with colons (e.g., Windows paths `C:/Users/...`)
- Uses `lastIndexOf` correctly to parse the line number
- Returns null for invalid inputs - good defensive programming

**2. Proximity Matching Logic - Well Designed**

- `isDuplicateByProximity` checks exact match first (fast path), then falls back to proximity
- `LINE_PROXIMITY_THRESHOLD = 20` is reasonable for typical code changes
- Uses absolute difference for line comparison

**3. Stale Comment Resolution - Good Implementation**

- Bidirectional proximity check correctly handles both directions
- GitHub: Strikes through old text and adds "Resolved" - clear UX
- ADO: Uses status 4 (Closed) - correct API usage

---

## Bugs Found

### [P2] Grouped Comments Incorrectly Resolved When Partial Findings Fixed

**Location**: `router/src/report/github.ts:448-470`

**Description**:
Grouped inline comments can contain multiple fingerprint markers (from `formatGroupedInlineComment`), but the stale-resolution loop resolves the entire comment as soon as any one marker is stale. If two findings are grouped (within 3 lines) and only one is fixed on a later run, this loop will strike through the whole comment and mark the still-active finding as resolved.

**Bug Scenario**:

1. **Initial state**: Grouped comment for findings A and B (within 3 lines of each other)
   - `dedupeKeyToCommentId`: A -> 123, B -> 123 (both map to same comment)

2. **Next push**: Finding A is fixed, finding B still active
   - `identifyStaleComments` returns `['A']`

3. **Resolution loop**:
   ```typescript
   for (const staleKey of staleKeys) {  // staleKey = 'A'
     const commentId = dedupeKeyToCommentId.get(staleKey);  // = 123
     // Strikes through ENTIRE comment, including active finding B!
     const resolvedBody = `~~${existingComment.body...}~~`;
   }
   ```

**Result**: Finding B (still active) is incorrectly struck through and marked as "Resolved". This hides valid security issues.

**Evidence**: `base.ts:55-73` shows grouped comments have multiple markers:

```typescript
export function formatGroupedInlineComment(findings: (Finding & { line: number })[]): string {
  // ...
  for (const finding of findings) {
    lines.push(buildFingerprintMarker(finding)); // One marker PER finding
  }
  return lines.join('\n').trim();
}
```

**Recommended Fix**:
Before resolving a comment, check if ALL markers in that comment are stale:

```typescript
// Get all markers in this comment
const allMarkersInComment = existingDedupeKeys.filter(
  (k) => dedupeKeyToCommentId.get(k) === commentId
);

// Only resolve if ALL markers are stale
const allStale = allMarkersInComment.every((m) => staleKeys.includes(m));
if (!allStale) continue;
```

Alternatively, edit out just the stale entry from the grouped comment rather than striking through the entire comment.

---

## Other Potential Issues & Risks

### Performance Concern with Large PRs

In `isDuplicateByProximity`, there's a linear scan through `existingLines`:

```typescript
for (const existingLine of existingLines) {
  if (Math.abs(findingLine - existingLine) <= LINE_PROXIMITY_THRESHOLD) {
```

For a file with many findings, this is O(n) per finding. Consider sorting `existingLines` and using binary search if this becomes a bottleneck. For typical PRs this is fine.

### Stale Marker Regex in GitHub Resolution

```typescript
if (existingComment.body.includes('~~') && existingComment.body.includes('Resolved')) {
```

This check could false-positive if a user's code snippet in the comment contains `~~`. However, requiring both conditions makes this unlikely. Acceptable risk.

### Comment Update Removes HTML Comments

```typescript
const resolvedBody =
  `~~${existingComment.body.replace(/<!--[^>]*-->/g, '').trim()}~~\n\n` +
```

This removes ALL HTML comments from the body, including potentially useful ones. The fingerprint marker is then re-added at the end, so deduplication still works, but any other HTML comments are lost.

---

## Test Coverage

**Comprehensive test suite covering:**

- Dedupe key parsing (valid, invalid, edge cases with colons)
- Proximity map building
- Duplicate detection (exact match, proximity match, threshold boundary, different fingerprint, different file)
- Stale comment identification
- Multiple findings/comments scenario

**Test gap:**

- No integration-level test that mocks the GitHub/ADO API calls and verifies end-to-end behavior
- No test for the grouped comment resolution scenario (the P2 bug above)

---

## Security Considerations

- No user input directly used in API calls without prior validation
- Fingerprint matching uses cryptographic hashes
- Rate limiting preserved with `INLINE_COMMENT_DELAY_MS`
- Graceful error handling with `try/catch` and warning logs for failures

---

## Recommendations

1. **Fix the P2 bug** for grouped comment resolution before merging

2. **Add a test** for the edge case where a finding moves exactly `LINE_PROXIMITY_THRESHOLD` lines (boundary test at `=` vs `<`)

3. **Add a test** for grouped comment partial resolution scenario

4. **Minor cleanup**: Remove `extractFingerprintFromKey` if unused, or add a test that explicitly uses it

5. **Documentation**: Consider adding a brief note about how users can adjust `LINE_PROXIMITY_THRESHOLD` if needed

6. **Future enhancement**: Consider making the threshold configurable via environment variable or config file

---

## Verdict

**Do not merge until the P2 grouped comments bug is fixed.** The core proximity-based deduplication logic is well-implemented and solves a real pain point. However, the stale comment resolution for grouped comments can incorrectly hide active security findings, which defeats the purpose of the review tool.
