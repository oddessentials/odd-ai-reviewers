/**
 * Comment Resolution Tests
 *
 * Tests for grouped comment resolution logic (feature 405-fix-grouped-comment-resolution).
 * This file tests the resolution.ts module which handles:
 * - Determining when a grouped comment should be resolved
 * - Partial resolution visual indication (strikethrough)
 * - Resolution logging with stable event name
 *
 * Key invariant: A comment is resolved if and only if ALL unique fingerprint
 * markers in that comment are stale in the current analysis run.
 *
 * Per spec:
 * - SC-004: Tests must be table-driven
 * - SC-007: Tests use pure data fixtures; platform API calls are NOT tested here
 * - SC-008: Resolution tests are separate from deduplication tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  buildCommentToMarkersMap,
  shouldResolveComment,
  getPartiallyResolvedMarkers,
  hasMalformedMarkers,
  applyPartialResolutionVisual,
  stripOwnFingerprintMarkers,
  emitResolutionLog,
  emitMalformedMarkerWarning,
  evaluateCommentResolution,
} from '../report/resolution.js';
import { identifyStaleComments, LINE_PROXIMITY_THRESHOLD } from '../report/formats.js';
import type { Finding } from '../agents/types.js';

// =============================================================================
// Test Fixtures
// =============================================================================

/**
 * Valid dedupe key format: 32-char hex fingerprint + file + line
 * Example: abcdef1234567890abcdef1234567890:src/test.ts:42
 * The fingerprint must be exactly 32 lowercase hex characters [a-f0-9]{32}
 */
const VALID_MARKER_A = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1:src/test.ts:10';
const VALID_MARKER_B = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2:src/test.ts:15';
const VALID_MARKER_C = 'c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3:src/other.ts:20';
const MALFORMED_MARKER = 'invalid-marker-not-a-valid-format';

// =============================================================================
// buildCommentToMarkersMap Tests
// =============================================================================

describe('buildCommentToMarkersMap', () => {
  it('should reverse dedupeKeyToCommentId map correctly', () => {
    const dedupeKeyToCommentId = new Map<string, number>([
      [VALID_MARKER_A, 100],
      [VALID_MARKER_B, 100], // Same comment as A (grouped)
      [VALID_MARKER_C, 200], // Different comment
    ]);

    const result = buildCommentToMarkersMap(dedupeKeyToCommentId);

    expect(result.size).toBe(2);
    expect(result.get(100)).toContain(VALID_MARKER_A);
    expect(result.get(100)).toContain(VALID_MARKER_B);
    expect(result.get(100)?.length).toBe(2);
    expect(result.get(200)).toEqual([VALID_MARKER_C]);
  });

  it('should handle empty map', () => {
    const result = buildCommentToMarkersMap(new Map());
    expect(result.size).toBe(0);
  });

  it('should handle single marker per comment', () => {
    const dedupeKeyToCommentId = new Map<string, number>([
      [VALID_MARKER_A, 100],
      [VALID_MARKER_B, 200],
    ]);

    const result = buildCommentToMarkersMap(dedupeKeyToCommentId);

    expect(result.size).toBe(2);
    expect(result.get(100)?.length).toBe(1);
    expect(result.get(200)?.length).toBe(1);
  });
});

// =============================================================================
// shouldResolveComment Tests (Table-Driven per SC-004)
// =============================================================================

describe('shouldResolveComment', () => {
  /**
   * Table-driven test cases for shouldResolveComment
   *
   * Per spec FR-002: System MUST only mark a grouped comment as resolved
   * when ALL unique fingerprint markers in that comment are identified as stale.
   */
  const testCases = [
    {
      name: 'all markers stale → comment resolved',
      markers: [VALID_MARKER_A, VALID_MARKER_B],
      staleMarkers: [VALID_MARKER_A, VALID_MARKER_B],
      expected: true,
    },
    {
      name: 'some markers stale → comment NOT resolved',
      markers: [VALID_MARKER_A, VALID_MARKER_B],
      staleMarkers: [VALID_MARKER_A], // Only A is stale, B is still active
      expected: false,
    },
    {
      name: 'no markers stale → comment NOT resolved',
      markers: [VALID_MARKER_A, VALID_MARKER_B],
      staleMarkers: [],
      expected: false,
    },
    {
      name: 'malformed marker → comment NOT resolved',
      markers: [VALID_MARKER_A, MALFORMED_MARKER],
      staleMarkers: [VALID_MARKER_A, MALFORMED_MARKER],
      expected: false,
    },
    {
      name: 'duplicate markers → deduplicated before evaluation',
      markers: [VALID_MARKER_A, VALID_MARKER_A, VALID_MARKER_A], // Duplicates
      staleMarkers: [VALID_MARKER_A],
      expected: true, // All unique markers (just A) are stale
    },
    {
      name: 'zero valid markers → comment NOT resolved',
      markers: [],
      staleMarkers: [VALID_MARKER_A],
      expected: false,
    },
    {
      name: 'single marker stale → comment resolved',
      markers: [VALID_MARKER_A],
      staleMarkers: [VALID_MARKER_A],
      expected: true,
    },
    {
      name: 'single marker active (not stale) → comment NOT resolved',
      markers: [VALID_MARKER_A],
      staleMarkers: [],
      expected: false,
    },
  ];

  it.each(testCases)('$name', ({ markers, staleMarkers, expected }) => {
    const staleSet = new Set(staleMarkers);
    const result = shouldResolveComment(markers, staleSet);
    expect(result).toBe(expected);
  });
});

// =============================================================================
// getPartiallyResolvedMarkers Tests
// =============================================================================

describe('getPartiallyResolvedMarkers', () => {
  it('should return stale markers when comment not fully resolved', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_B];
    const staleSet = new Set([VALID_MARKER_A]); // Only A is stale

    const result = getPartiallyResolvedMarkers(markers, staleSet);

    expect(result).toEqual([VALID_MARKER_A]);
  });

  it('should return empty array when no markers are stale', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_B];
    const staleSet = new Set<string>();

    const result = getPartiallyResolvedMarkers(markers, staleSet);

    expect(result).toEqual([]);
  });

  it('should exclude malformed markers', () => {
    const markers = [VALID_MARKER_A, MALFORMED_MARKER];
    const staleSet = new Set([VALID_MARKER_A, MALFORMED_MARKER]);

    const result = getPartiallyResolvedMarkers(markers, staleSet);

    // Only valid marker A should be returned
    expect(result).toEqual([VALID_MARKER_A]);
  });

  it('should deduplicate markers', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_A, VALID_MARKER_A];
    const staleSet = new Set([VALID_MARKER_A]);

    const result = getPartiallyResolvedMarkers(markers, staleSet);

    // Should only have one entry for A
    expect(result).toEqual([VALID_MARKER_A]);
  });
});

// =============================================================================
// hasMalformedMarkers Tests
// =============================================================================

describe('hasMalformedMarkers', () => {
  it('should return false for all valid markers', () => {
    expect(hasMalformedMarkers([VALID_MARKER_A, VALID_MARKER_B])).toBe(false);
  });

  it('should return true if any marker is malformed', () => {
    expect(hasMalformedMarkers([VALID_MARKER_A, MALFORMED_MARKER])).toBe(true);
  });

  it('should return true for all malformed markers', () => {
    expect(hasMalformedMarkers([MALFORMED_MARKER, 'another-bad-one'])).toBe(true);
  });

  it('should return false for empty array', () => {
    expect(hasMalformedMarkers([])).toBe(false);
  });
});

// =============================================================================
// applyPartialResolutionVisual Tests
// =============================================================================

describe('applyPartialResolutionVisual', () => {
  // Use the same marker fingerprints as VALID_MARKER_A and VALID_MARKER_B
  const FINGERPRINT_A = 'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';
  const FINGERPRINT_B = 'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2';

  // Sample grouped comment body (from base.ts formatGroupedInlineComment)
  const sampleGroupedBody = `**Multiple issues found in this area (2):**

🔴 **Line 10** (semgrep): SQL injection vulnerability
   💡 Use parameterized queries

🟡 **Line 15** (eslint): Missing null check

<!-- odd-ai-reviewers:fingerprint:v1:${FINGERPRINT_A}:src/test.ts:10 -->
<!-- odd-ai-reviewers:fingerprint:v1:${FINGERPRINT_B}:src/test.ts:15 -->`;

  it('should apply strikethrough to resolved findings', () => {
    const resolvedMarkers = [`${FINGERPRINT_A}:src/test.ts:10`];

    const result = applyPartialResolutionVisual(sampleGroupedBody, resolvedMarkers);

    // First finding should be struck through
    expect(result).toContain('~~🔴 **Line 10** (semgrep): SQL injection vulnerability');
    expect(result).toContain('✅'); // Resolved indicator

    // Second finding should NOT be struck through
    expect(result).toContain('🟡 **Line 15** (eslint): Missing null check');
    expect(result).not.toContain('~~🟡');
  });

  it('should preserve fingerprint markers unchanged', () => {
    const resolvedMarkers = [`${FINGERPRINT_A}:src/test.ts:10`];

    const result = applyPartialResolutionVisual(sampleGroupedBody, resolvedMarkers);

    // Both markers should still be present and unchanged
    expect(result).toContain(
      `<!-- odd-ai-reviewers:fingerprint:v1:${FINGERPRINT_A}:src/test.ts:10 -->`
    );
    expect(result).toContain(
      `<!-- odd-ai-reviewers:fingerprint:v1:${FINGERPRINT_B}:src/test.ts:15 -->`
    );
  });

  it('should return unchanged body if no markers are resolved', () => {
    const result = applyPartialResolutionVisual(sampleGroupedBody, []);
    expect(result).toBe(sampleGroupedBody);
  });

  it('should handle body without finding patterns', () => {
    const simpleBody = 'Just a simple comment without structured findings';
    const result = applyPartialResolutionVisual(simpleBody, [VALID_MARKER_A]);
    expect(result).toBe(simpleBody);
  });
});

// =============================================================================
// stripOwnFingerprintMarkers Tests (FR-019)
// =============================================================================

describe('stripOwnFingerprintMarkers', () => {
  it('should remove our fingerprint markers', () => {
    const body = `Some content
<!-- odd-ai-reviewers:fingerprint:v1:abcdef1234567890abcdef1234567890:src/test.ts:10 -->
More content`;

    const result = stripOwnFingerprintMarkers(body);

    expect(result).not.toContain('odd-ai-reviewers:fingerprint');
    expect(result).toContain('Some content');
    expect(result).toContain('More content');
  });

  it('should preserve user-added HTML comments', () => {
    const body = `Some content
<!-- User's note: This is important -->
<!-- odd-ai-reviewers:fingerprint:v1:abcdef1234567890abcdef1234567890:src/test.ts:10 -->
<!-- TODO: Review this later -->`;

    const result = stripOwnFingerprintMarkers(body);

    // Our marker should be removed
    expect(result).not.toContain('odd-ai-reviewers:fingerprint');
    // User comments should be preserved
    expect(result).toContain("<!-- User's note: This is important -->");
    expect(result).toContain('<!-- TODO: Review this later -->');
  });

  it('should preserve other HTML comment formats', () => {
    const body = `Content
<!--[if IE]>Special IE content<![endif]-->
<!-- odd-ai-reviewers:fingerprint:v1:abcdef1234567890abcdef1234567890:src/test.ts:10 -->
<!-- @author: developer -->`;

    const result = stripOwnFingerprintMarkers(body);

    expect(result).not.toContain('odd-ai-reviewers:fingerprint');
    expect(result).toContain('<!--[if IE]>Special IE content<![endif]-->');
    expect(result).toContain('<!-- @author: developer -->');
  });

  it('should handle multiple fingerprint markers', () => {
    const body = `Content
<!-- odd-ai-reviewers:fingerprint:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1:src/a.ts:10 -->
<!-- odd-ai-reviewers:fingerprint:v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb2:src/b.ts:20 -->
End`;

    const result = stripOwnFingerprintMarkers(body);

    expect(result).not.toContain('odd-ai-reviewers:fingerprint');
    expect(result).toContain('Content');
    expect(result).toContain('End');
  });

  it('should handle body with no markers', () => {
    const body = 'Just plain text without any markers';
    const result = stripOwnFingerprintMarkers(body);
    expect(result).toBe(body);
  });

  it('should handle markers with varying whitespace', () => {
    const body = `Content
<!--odd-ai-reviewers:fingerprint:v1:abcdef1234567890abcdef1234567890:src/test.ts:10-->
<!--  odd-ai-reviewers:fingerprint:v1:abcdef1234567890abcdef1234567890:src/test.ts:20  -->
End`;

    const result = stripOwnFingerprintMarkers(body);

    expect(result).not.toContain('odd-ai-reviewers:fingerprint');
    expect(result).toContain('Content');
    expect(result).toContain('End');
  });
});

// =============================================================================
// emitResolutionLog Tests
// =============================================================================

describe('emitResolutionLog', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should emit structured log with correct event name', () => {
    emitResolutionLog('github', 123, 2, 1, false);

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logArg = consoleSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(logArg as string);

    expect(parsed.event).toBe('comment_resolution');
    expect(parsed.platform).toBe('github');
    expect(parsed.commentId).toBe(123);
    expect(parsed.fingerprintCount).toBe(2);
    expect(parsed.staleCount).toBe(1);
    expect(parsed.resolved).toBe(false);
  });

  it('should use same event name for ADO', () => {
    emitResolutionLog('ado', 456, 3, 3, true);

    const logArg = consoleSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(logArg as string);

    expect(parsed.event).toBe('comment_resolution');
    expect(parsed.platform).toBe('ado');
    expect(parsed.resolved).toBe(true);
  });

  it('should NOT include raw fingerprint strings', () => {
    emitResolutionLog('github', 123, 5, 3, false);

    const logArg = consoleSpy.mock.calls[0]?.[0] as string;

    // Should not contain any fingerprint-like patterns
    expect(logArg).not.toMatch(/[a-f0-9]{32}/);
    expect(logArg).not.toContain('src/');
  });
});

// =============================================================================
// emitMalformedMarkerWarning Tests (FR-010)
// =============================================================================

describe('emitMalformedMarkerWarning', () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should emit warning with correct event name and reason', () => {
    emitMalformedMarkerWarning('github', 123);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const logArg = consoleWarnSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(logArg as string);

    expect(parsed.event).toBe('comment_resolution_warning');
    expect(parsed.platform).toBe('github');
    expect(parsed.commentId).toBe(123);
    expect(parsed.reason).toBe('malformed_marker');
  });

  it('should use same event name for ADO', () => {
    emitMalformedMarkerWarning('ado', 456);

    const logArg = consoleWarnSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(logArg as string);

    expect(parsed.event).toBe('comment_resolution_warning');
    expect(parsed.platform).toBe('ado');
  });

  it('should NOT include raw fingerprint strings in warning', () => {
    emitMalformedMarkerWarning('github', 789);

    const logArg = consoleWarnSpy.mock.calls[0]?.[0] as string;

    // Should not contain any fingerprint-like patterns
    expect(logArg).not.toMatch(/[a-f0-9]{32}/);
    expect(logArg).not.toContain('src/');
  });
});

// =============================================================================
// evaluateCommentResolution Tests
// =============================================================================

describe('evaluateCommentResolution', () => {
  it('should return complete resolution decision', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_B];
    const staleSet = new Set([VALID_MARKER_A]); // Partial resolution

    const decision = evaluateCommentResolution(100, markers, staleSet);

    expect(decision.commentId).toBe(100);
    expect(decision.resolved).toBe(false);
    expect(decision.fingerprintCount).toBe(2);
    expect(decision.staleCount).toBe(1);
    expect(decision.partiallyResolved).toEqual([VALID_MARKER_A]);
    expect(decision.hasMalformed).toBe(false);
  });

  it('should detect malformed markers', () => {
    const markers = [VALID_MARKER_A, MALFORMED_MARKER];
    const staleSet = new Set([VALID_MARKER_A, MALFORMED_MARKER]);

    const decision = evaluateCommentResolution(100, markers, staleSet);

    expect(decision.resolved).toBe(false);
    expect(decision.hasMalformed).toBe(true);
  });

  it('should indicate full resolution when all stale', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_B];
    const staleSet = new Set([VALID_MARKER_A, VALID_MARKER_B]);

    const decision = evaluateCommentResolution(100, markers, staleSet);

    expect(decision.resolved).toBe(true);
    expect(decision.partiallyResolved).toEqual([]); // No partial when fully resolved
  });
});

// =============================================================================
// ADO Platform Parity Tests (US3)
// =============================================================================

describe('ADO Platform Parity', () => {
  /**
   * Per spec FR-004: System MUST implement identical resolution semantics
   * for both GitHub and Azure DevOps platforms.
   *
   * These tests verify that the resolution logic is platform-agnostic.
   * The same functions are used for both platforms.
   */

  it('ADO: all markers stale → thread closed (same logic as GitHub)', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_B];
    const staleSet = new Set([VALID_MARKER_A, VALID_MARKER_B]);

    // Same function used for both platforms
    const shouldClose = shouldResolveComment(markers, staleSet);
    expect(shouldClose).toBe(true);
  });

  it('ADO: some markers stale → thread NOT closed (same logic as GitHub)', () => {
    const markers = [VALID_MARKER_A, VALID_MARKER_B];
    const staleSet = new Set([VALID_MARKER_A]); // Only A stale

    const shouldClose = shouldResolveComment(markers, staleSet);
    expect(shouldClose).toBe(false);
  });
});

// =============================================================================
// Edge Cases (Phase 7)
// =============================================================================

describe('Edge Cases', () => {
  it('user content preservation: applyPartialResolutionVisual preserves non-marker content', () => {
    const bodyWithUserContent = `**Multiple issues found in this area (1):**

🔴 **Line 10** (semgrep): Issue found

User added this note: Please fix ASAP!

<!-- odd-ai-reviewers:fingerprint:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1:src/test.ts:10 -->`;

    const result = applyPartialResolutionVisual(bodyWithUserContent, [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1:src/test.ts:10',
    ]);

    // User content should be preserved
    expect(result).toContain('User added this note: Please fix ASAP!');
  });

  it('all resolved one-by-one: each finding struck through before full resolution', () => {
    // This tests the scenario where findings are resolved incrementally
    const markers = [VALID_MARKER_A, VALID_MARKER_B];

    // First push: A is fixed
    let staleSet = new Set([VALID_MARKER_A]);
    let decision = evaluateCommentResolution(100, markers, staleSet);
    expect(decision.resolved).toBe(false);
    expect(decision.partiallyResolved).toEqual([VALID_MARKER_A]);

    // Second push: B is also fixed
    staleSet = new Set([VALID_MARKER_A, VALID_MARKER_B]);
    decision = evaluateCommentResolution(100, markers, staleSet);
    expect(decision.resolved).toBe(true);
    expect(decision.partiallyResolved).toEqual([]); // Empty when fully resolved
  });
});

// =============================================================================
// Proximity Threshold Boundary Tests (SC-004)
// =============================================================================

describe('Proximity Threshold Boundary (identifyStaleComments)', () => {
  /**
   * These tests verify the LINE_PROXIMITY_THRESHOLD boundary behavior in
   * identifyStaleComments() from formats.ts.
   *
   * Per spec:
   * - Δ ≤ 20 lines → marker is active (not stale)
   * - Δ = 21 lines → marker is stale (old marker stale, new finding treated as new)
   *
   * The proximity threshold is currently 20 lines.
   */

  // Use consistent 32-char hex fingerprint
  const FINGERPRINT = 'abcdef1234567890abcdef1234567890';

  /**
   * Helper to create a minimal Finding fixture
   */
  function createFinding(file: string, line: number, fingerprint: string): Finding {
    return {
      file,
      line,
      fingerprint,
      message: 'Test finding',
      severity: 'warning',
      sourceAgent: 'test-agent',
    };
  }

  // Verify the threshold constant is what we expect
  it('LINE_PROXIMITY_THRESHOLD should be 20', () => {
    expect(LINE_PROXIMITY_THRESHOLD).toBe(20);
  });

  describe('table-driven boundary tests', () => {
    const boundaryTestCases = [
      {
        name: 'Δ = 0 lines (exact match) → marker is active (not stale)',
        existingLine: 100,
        currentLine: 100,
        expectedStale: false,
      },
      {
        name: 'Δ = 1 line → marker is active (not stale)',
        existingLine: 100,
        currentLine: 101,
        expectedStale: false,
      },
      {
        name: 'Δ = 19 lines → marker is active (not stale)',
        existingLine: 100,
        currentLine: 119,
        expectedStale: false,
      },
      {
        name: 'Δ = 20 lines (boundary) → marker is active (not stale)',
        existingLine: 100,
        currentLine: 120,
        expectedStale: false,
      },
      {
        name: 'Δ = 21 lines (just outside boundary) → marker is stale',
        existingLine: 100,
        currentLine: 121,
        expectedStale: true,
      },
      {
        name: 'Δ = 50 lines (well outside boundary) → marker is stale',
        existingLine: 100,
        currentLine: 150,
        expectedStale: true,
      },
      {
        name: 'Δ = -20 lines (boundary, negative direction) → marker is active (not stale)',
        existingLine: 100,
        currentLine: 80,
        expectedStale: false,
      },
      {
        name: 'Δ = -21 lines (just outside boundary, negative direction) → marker is stale',
        existingLine: 100,
        currentLine: 79,
        expectedStale: true,
      },
    ];

    it.each(boundaryTestCases)('$name', ({ existingLine, currentLine, expectedStale }) => {
      const file = 'src/test.ts';
      const existingDedupeKey = `${FINGERPRINT}:${file}:${existingLine}`;

      // Current finding at currentLine with same fingerprint
      const currentFindings: Finding[] = [createFinding(file, currentLine, FINGERPRINT)];

      const staleKeys = identifyStaleComments([existingDedupeKey], currentFindings);

      if (expectedStale) {
        expect(staleKeys).toContain(existingDedupeKey);
      } else {
        expect(staleKeys).not.toContain(existingDedupeKey);
      }
    });
  });

  it('no current findings for fingerprint → marker is stale', () => {
    const existingDedupeKey = `${FINGERPRINT}:src/test.ts:100`;
    const currentFindings: Finding[] = []; // No findings

    const staleKeys = identifyStaleComments([existingDedupeKey], currentFindings);

    expect(staleKeys).toContain(existingDedupeKey);
  });

  it('different file → marker is stale (no proximity match)', () => {
    const existingDedupeKey = `${FINGERPRINT}:src/old.ts:100`;
    // Same fingerprint but different file
    const currentFindings: Finding[] = [createFinding('src/new.ts', 100, FINGERPRINT)];

    const staleKeys = identifyStaleComments([existingDedupeKey], currentFindings);

    expect(staleKeys).toContain(existingDedupeKey);
  });

  it('different fingerprint → marker is stale (no proximity match)', () => {
    const existingDedupeKey = `${FINGERPRINT}:src/test.ts:100`;
    // Same file and line but different fingerprint
    const differentFingerprint = 'ffffffffffffffffffffffffffffffff';
    const currentFindings: Finding[] = [createFinding('src/test.ts', 100, differentFingerprint)];

    const staleKeys = identifyStaleComments([existingDedupeKey], currentFindings);

    expect(staleKeys).toContain(existingDedupeKey);
  });

  it('multiple current findings - closest one within threshold → marker is active', () => {
    const existingDedupeKey = `${FINGERPRINT}:src/test.ts:100`;
    // Multiple findings: one far away (stale), one within threshold (active)
    const currentFindings: Finding[] = [
      createFinding('src/test.ts', 200, FINGERPRINT), // 100 lines away - would be stale
      createFinding('src/test.ts', 115, FINGERPRINT), // 15 lines away - within threshold
    ];

    const staleKeys = identifyStaleComments([existingDedupeKey], currentFindings);

    // Should NOT be stale because one finding is within threshold
    expect(staleKeys).not.toContain(existingDedupeKey);
  });
});
