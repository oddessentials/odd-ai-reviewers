/**
 * Deduplication and Path Normalization Tests
 *
 * Regression tests for bug fixes in:
 * - ProximityMap update after posting (FR-001, FR-002)
 * - DeletedFiles path normalization (FR-003, FR-004)
 * - StaleCount calculation (FR-005, FR-006)
 * - Empty marker extraction guard (FR-008)
 * - ADO path handling documentation verification (FR-009)
 *
 * @module deduplication.test
 */

import { describe, it, expect } from 'vitest';
import {
  generateFingerprint,
  getDedupeKey,
  isDuplicateByProximity,
  extractFingerprintMarkers,
  updateProximityMap,
  LINE_PROXIMITY_THRESHOLD,
} from '../../report/formats.js';
import { canonicalizeDiffFiles } from '../../diff.js';
import type { Finding } from '../../agents/types.js';
import type { DiffFile } from '../../diff.js';

// ============================================================================
// updateProximityMap helper unit tests
// ============================================================================

describe('updateProximityMap helper', () => {
  it('should create proximity key in exact format: fingerprint:file', () => {
    const proximityMap = new Map<string, number[]>();
    const finding: Finding = {
      file: 'src/test.ts',
      line: 10,
      message: 'Test',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint: 'abc123def456abc123def456abc12345',
    };

    updateProximityMap(proximityMap, finding);

    // Assert exact key format matches isDuplicateByProximity pattern
    const expectedKey = `${finding.fingerprint}:${finding.file}`;
    expect(proximityMap.get(expectedKey)).toStrictEqual([10]);
  });

  it('should use immutable updates (original array unchanged)', () => {
    const fingerprint = 'abc123def456abc123def456abc12345';
    const proximityKey = `${fingerprint}:src/test.ts`;
    const originalLines = [5];
    const proximityMap = new Map([[proximityKey, originalLines]]);

    const finding: Finding = {
      file: 'src/test.ts',
      line: 10,
      message: 'Test',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint,
    };

    updateProximityMap(proximityMap, finding);

    expect(proximityMap.get(proximityKey)).toStrictEqual([5, 10]);
    expect(originalLines).toStrictEqual([5]); // Original unchanged
  });

  it('should generate fingerprint via canonical generateFingerprint when missing', () => {
    const proximityMap = new Map<string, number[]>();
    const finding: Finding = {
      file: 'src/test.ts',
      line: 10,
      message: 'Test finding',
      severity: 'warning',
      sourceAgent: 'test',
      // No fingerprint
    };

    updateProximityMap(proximityMap, finding);

    expect(proximityMap.size).toBe(1);
    const [key] = [...proximityMap.keys()];
    // Generated fingerprint is 32 hex chars
    expect(key).toMatch(/^[a-f0-9]{32}:src\/test\.ts$/);
  });

  it('should default line to 0 when finding.line is undefined', () => {
    const proximityMap = new Map<string, number[]>();
    const finding: Finding = {
      file: 'src/test.ts',
      // No line
      message: 'File-level finding',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint: 'abc123def456abc123def456abc12345',
    };

    updateProximityMap(proximityMap, finding);

    const proximityKey = `${finding.fingerprint}:${finding.file}`;
    expect(proximityMap.get(proximityKey)).toStrictEqual([0]);
  });
});

// ============================================================================
// US1: ProximityMap Update Tests (FR-001, FR-002)
// ============================================================================

describe('US1: ProximityMap Update After Posting', () => {
  describe('proximityMap structure', () => {
    it('should update proximityMap after posting a comment', () => {
      // Given: A finding that was just posted
      const finding: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint: 'abc123def456abc123def456abc12345',
      };

      // When: We simulate the proximity map update after posting
      const proximityMap = new Map<string, number[]>();
      const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
      const proximityKey = `${fingerprint}:${finding.file}`;
      const existingLines = proximityMap.get(proximityKey) ?? [];
      existingLines.push(finding.line ?? 0);
      proximityMap.set(proximityKey, existingLines);

      // Then: The proximityMap should contain the finding's line
      expect(proximityMap.get(proximityKey)).toStrictEqual([10]);
    });

    it('should skip second finding within threshold after first is posted', () => {
      // Given: Two findings with same fingerprint at lines 10 and 15
      const fingerprint = 'abc123def456abc123def456abc12345';
      const finding1: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint,
      };
      const finding2: Finding = {
        file: 'src/test.ts',
        line: 15,
        message: 'Same test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint,
      };

      // When: First finding is posted and proximityMap is updated
      const existingFingerprintSet = new Set<string>();
      const proximityMap = new Map<string, number[]>();

      // Post first finding
      const key1 = getDedupeKey(finding1);
      existingFingerprintSet.add(key1);
      const proximityKey = `${fingerprint}:${finding1.file}`;
      proximityMap.set(proximityKey, [finding1.line ?? 0]);

      // Then: Second finding should be detected as proximity duplicate
      const isDuplicate = isDuplicateByProximity(finding2, existingFingerprintSet, proximityMap);
      expect(isDuplicate).toBe(true);
    });

    it('should post both findings when outside threshold (50 lines)', () => {
      // Given: Two findings with same fingerprint at lines 10 and 60
      const fingerprint = 'abc123def456abc123def456abc12345';
      const finding1: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint,
      };
      const finding2: Finding = {
        file: 'src/test.ts',
        line: 60, // 50 lines apart - outside threshold
        message: 'Same test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint,
      };

      // When: First finding is posted and proximityMap is updated
      const existingFingerprintSet = new Set<string>();
      const proximityMap = new Map<string, number[]>();

      // Post first finding
      const key1 = getDedupeKey(finding1);
      existingFingerprintSet.add(key1);
      const proximityKey = `${fingerprint}:${finding1.file}`;
      proximityMap.set(proximityKey, [finding1.line ?? 0]);

      // Then: Second finding should NOT be detected as duplicate (outside threshold)
      const isDuplicate = isDuplicateByProximity(finding2, existingFingerprintSet, proximityMap);
      expect(isDuplicate).toBe(false);
    });
  });
});

// ============================================================================
// US2: DeletedFiles Path Normalization Tests (FR-003, FR-004)
// ============================================================================

describe('US2: DeletedFiles Path Normalization', () => {
  describe('path format variations', () => {
    it('should filter deleted file with ./ prefix correctly', () => {
      // Given: A deleted file with ./ prefix and a finding without prefix
      const diffFiles: DiffFile[] = [
        { path: './src/deleted.ts', status: 'deleted', additions: 0, deletions: 10 },
      ];
      const canonicalFiles = canonicalizeDiffFiles(diffFiles);
      const deletedFiles = new Set(
        canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );

      // When: We check if a finding path matches
      const findingPath = 'src/deleted.ts';

      // Then: The paths should match after canonicalization
      expect(deletedFiles.has(findingPath)).toBe(true);
    });

    it('should filter deleted file without ./ prefix correctly', () => {
      // Given: A deleted file without prefix and a finding with ./ prefix
      const diffFiles: DiffFile[] = [
        { path: 'src/removed.ts', status: 'deleted', additions: 0, deletions: 10 },
      ];
      const canonicalFiles = canonicalizeDiffFiles(diffFiles);
      const deletedFiles = new Set(
        canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );

      // When: Finding path is normalized
      const findingPath = 'src/removed.ts'; // After normalization from ./src/removed.ts

      // Then: The paths should match
      expect(deletedFiles.has(findingPath)).toBe(true);
    });

    it('should not filter findings on modified files', () => {
      // Given: A deleted file and a modified file
      const diffFiles: DiffFile[] = [
        { path: 'old.ts', status: 'deleted', additions: 0, deletions: 10 },
        { path: 'new.ts', status: 'modified', additions: 5, deletions: 2 },
      ];
      const canonicalFiles = canonicalizeDiffFiles(diffFiles);
      const deletedFiles = new Set(
        canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );

      // When: We check findings on both files
      const deletedFindingPath = 'old.ts';
      const modifiedFindingPath = 'new.ts';

      // Then: Only the deleted file finding should be filtered
      expect(deletedFiles.has(deletedFindingPath)).toBe(true);
      expect(deletedFiles.has(modifiedFindingPath)).toBe(false);
    });
  });
});

// ============================================================================
// US3: StaleCount Calculation Tests (FR-005, FR-006)
// ============================================================================

describe('US3: StaleCount Calculation', () => {
  describe('resolution scenarios', () => {
    it('should have staleCount equal total when fully resolved', () => {
      // Given: A comment with all markers stale
      const allMarkersInComment = ['marker1', 'marker2', 'marker3'];
      const staleKeySet = new Set(['marker1', 'marker2', 'marker3']);
      const shouldResolve = allMarkersInComment.every((m) => staleKeySet.has(m));

      // When: Computing stale count
      const partiallyResolved = shouldResolve
        ? []
        : allMarkersInComment.filter((m) => staleKeySet.has(m));
      const staleCount = shouldResolve ? allMarkersInComment.length : partiallyResolved.length;

      // Then: staleCount should equal total markers
      expect(shouldResolve).toBe(true);
      expect(staleCount).toBe(3);
    });

    it('should have staleCount equal partial count when partially resolved', () => {
      // Given: A comment with only some markers stale
      const allMarkersInComment = ['marker1', 'marker2', 'marker3'];
      const staleKeySet = new Set(['marker1']); // Only marker1 is stale
      const shouldResolve = allMarkersInComment.every((m) => staleKeySet.has(m));

      // When: Computing stale count
      const partiallyResolved = shouldResolve
        ? []
        : allMarkersInComment.filter((m) => staleKeySet.has(m));
      const staleCount = shouldResolve ? allMarkersInComment.length : partiallyResolved.length;

      // Then: staleCount should equal partial count (1)
      expect(shouldResolve).toBe(false);
      expect(staleCount).toBe(1);
    });

    it('should have staleCount equal zero when no markers stale', () => {
      // Given: A comment with no markers stale
      const allMarkersInComment = ['marker1', 'marker2', 'marker3'];
      const staleKeySet = new Set<string>([]); // No markers stale
      const shouldResolve = allMarkersInComment.every((m) => staleKeySet.has(m));

      // When: Computing stale count
      const partiallyResolved = shouldResolve
        ? []
        : allMarkersInComment.filter((m) => staleKeySet.has(m));
      const staleCount = shouldResolve ? allMarkersInComment.length : partiallyResolved.length;

      // Then: staleCount should equal 0
      expect(shouldResolve).toBe(false);
      expect(staleCount).toBe(0);
    });
  });
});

// ============================================================================
// US5: Empty Marker Extraction Tests (FR-008)
// ============================================================================

describe('US5: Empty Marker Extraction Guard', () => {
  describe('marker extraction', () => {
    it('should not add empty capture groups to markers array', () => {
      // Given: A comment body with potentially malformed markers
      const bodyWithValidMarkers = `
Test comment body
<!-- odd-ai-reviewers:fingerprint:v1:abc123def456abc123def456abc12345:src/test.ts:10 -->
`;
      // When: Extracting markers
      const markers = extractFingerprintMarkers(bodyWithValidMarkers);

      // Then: No empty strings should be in the array
      expect(markers.every((m) => m.length > 0)).toBe(true);
      expect(markers.some((m) => m === '')).toBe(false);
    });

    it('should extract valid markers correctly', () => {
      // Given: A comment body with valid markers
      const body = `
Test comment body
<!-- odd-ai-reviewers:fingerprint:v1:abc123def456abc123def456abc12345:src/test.ts:10 -->
<!-- odd-ai-reviewers:fingerprint:v1:def456abc123def456abc123def45678:src/other.ts:20 -->
`;
      // When: Extracting markers
      const markers = extractFingerprintMarkers(body);

      // Then: All valid markers should be present
      expect(markers.length).toBe(2);
      expect(markers).toContain('abc123def456abc123def456abc12345:src/test.ts:10');
      expect(markers).toContain('def456abc123def456abc123def45678:src/other.ts:20');
    });
  });
});

// ============================================================================
// US6: ADO Path Format Tests (FR-009)
// ============================================================================

describe('US6: ADO Path Format Verification', () => {
  describe('path format separation', () => {
    it('should use leading slash format for ADO thread context', () => {
      // Given: A finding with a normalized path
      const finding: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
      };

      // When: Converting to ADO thread context path format
      const adoFilePath = finding.file.startsWith('/') ? finding.file : `/${finding.file}`;

      // Then: Path should have leading slash
      expect(adoFilePath).toBe('/src/test.ts');
      expect(adoFilePath.startsWith('/')).toBe(true);
    });

    it('should use normalized format (no leading slash) for dedupe key', () => {
      // Given: A finding with a normalized path
      const finding: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
      };

      // When: Getting dedupe key
      const dedupeKey = getDedupeKey(finding);

      // Then: Dedupe key should use normalized path (no leading slash)
      expect(dedupeKey.includes('/src/test.ts')).toBe(false);
      expect(dedupeKey.includes('src/test.ts')).toBe(true);
    });
  });
});

// ============================================================================
// Edge Case Tests (FR-012)
// ============================================================================

describe('Edge Cases', () => {
  describe('EC1: Finding without fingerprint', () => {
    it('should generate fingerprint for findings without pre-existing fingerprint', () => {
      // Given: A finding without a fingerprint
      const finding: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        // No fingerprint property
      };

      // When: Generating fingerprint
      const fingerprint = finding.fingerprint ?? generateFingerprint(finding);

      // Then: Fingerprint should be generated
      expect(fingerprint).toBeDefined();
      expect(fingerprint.length).toBe(32); // SHA256 truncated to 32 hex chars
    });
  });

  describe('EC2: Boundary at LINE_PROXIMITY_THRESHOLD', () => {
    it('should detect findings at exactly 20 lines apart as proximity duplicates', () => {
      // Given: Two findings with same fingerprint at exactly threshold apart
      const fingerprint = 'abc123def456abc123def456abc12345';
      const finding1: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'Test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint,
      };
      const finding2: Finding = {
        file: 'src/test.ts',
        line: 30, // Exactly 20 lines apart from line 10
        message: 'Same test finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint,
      };

      // When: First finding is posted and proximityMap is updated
      const existingFingerprintSet = new Set<string>();
      const proximityMap = new Map<string, number[]>();

      const key1 = getDedupeKey(finding1);
      existingFingerprintSet.add(key1);
      const proximityKey = `${fingerprint}:${finding1.file}`;
      proximityMap.set(proximityKey, [finding1.line ?? 0]);

      // Then: Second finding should be detected as proximity duplicate (inclusive boundary)
      const isDuplicate = isDuplicateByProximity(finding2, existingFingerprintSet, proximityMap);
      expect(isDuplicate).toBe(true);
    });
  });

  describe('EC3: Deleted file with unicode path', () => {
    it('should filter deleted file with unicode characters in path', () => {
      // Given: A deleted file with unicode in path
      const diffFiles: DiffFile[] = [
        { path: 'src/файл.ts', status: 'deleted', additions: 0, deletions: 10 },
      ];
      const canonicalFiles = canonicalizeDiffFiles(diffFiles);
      const deletedFiles = new Set(
        canonicalFiles.filter((f) => f.status === 'deleted').map((f) => f.path)
      );

      // When: We check if a finding path matches
      const findingPath = 'src/файл.ts';

      // Then: The paths should match
      expect(deletedFiles.has(findingPath)).toBe(true);
    });
  });

  describe('EC4: Empty proximityMap at start', () => {
    it('should correctly populate empty proximityMap with first finding', () => {
      // Given: An empty proximityMap and fingerprint set
      const existingFingerprintSet = new Set<string>();
      const proximityMap = new Map<string, number[]>();

      const finding: Finding = {
        file: 'src/test.ts',
        line: 10,
        message: 'First finding',
        severity: 'warning',
        sourceAgent: 'test-agent',
        fingerprint: 'abc123def456abc123def456abc12345',
      };

      // When: First finding is not a duplicate (empty state)
      const isFirstDuplicate = isDuplicateByProximity(
        finding,
        existingFingerprintSet,
        proximityMap
      );

      // Then: First finding should NOT be a duplicate
      expect(isFirstDuplicate).toBe(false);

      // And when: We add the first finding
      const key = getDedupeKey(finding);
      existingFingerprintSet.add(key);
      const fingerprint = finding.fingerprint ?? generateFingerprint(finding);
      const proximityKey = `${fingerprint}:${finding.file}`;
      proximityMap.set(proximityKey, [finding.line ?? 0]);

      // Then: Both structures should be populated
      expect(existingFingerprintSet.has(key)).toBe(true);
      expect(proximityMap.get(proximityKey)).toStrictEqual([10]);
    });
  });

  describe('EC5: Grouped comment updates proximityMap for all findings', () => {
    it('should update proximityMap for each finding in a grouped comment', () => {
      // Given: A group of findings to be posted together
      const fingerprint1 = 'abc123def456abc123def456abc12345';
      const fingerprint2 = 'def456abc123def456abc123def45678';
      const findingsInGroup: Finding[] = [
        {
          file: 'src/test.ts',
          line: 10,
          message: 'First finding',
          severity: 'warning',
          sourceAgent: 'test-agent',
          fingerprint: fingerprint1,
        },
        {
          file: 'src/test.ts',
          line: 12,
          message: 'Second finding',
          severity: 'error',
          sourceAgent: 'test-agent',
          fingerprint: fingerprint2,
        },
      ];

      // When: Updating tracking structures for all findings in group
      const existingFingerprintSet = new Set<string>();
      const proximityMap = new Map<string, number[]>();

      for (const f of findingsInGroup) {
        const key = getDedupeKey(f);
        existingFingerprintSet.add(key);

        const fingerprint = f.fingerprint ?? generateFingerprint(f);
        const proximityKey = `${fingerprint}:${f.file}`;
        const existingLines = proximityMap.get(proximityKey) ?? [];
        existingLines.push(f.line ?? 0);
        proximityMap.set(proximityKey, existingLines);
      }

      // Then: Both findings should be tracked
      expect(existingFingerprintSet.size).toBe(2);
      expect(proximityMap.size).toBe(2);

      // And each finding should have its line in the map
      const key1 = `${fingerprint1}:src/test.ts`;
      const key2 = `${fingerprint2}:src/test.ts`;
      expect(proximityMap.get(key1)).toStrictEqual([10]);
      expect(proximityMap.get(key2)).toStrictEqual([12]);
    });
  });
});

// ============================================================================
// Integration: Sequential Posting Within Same Run
// ============================================================================

describe('Integration: Sequential Posting Within Same Run', () => {
  it('should detect finding as duplicate via proximity after prior finding posted', () => {
    // Simulate real posting loop with tracking structure updates
    const fingerprint = 'abc123def456abc123def456abc12345';
    const finding1: Finding = {
      file: 'src/test.ts',
      line: 10,
      message: 'Issue',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint,
    };
    const finding2: Finding = {
      file: 'src/test.ts',
      line: 10 + LINE_PROXIMITY_THRESHOLD, // At boundary
      message: 'Issue',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint,
    };
    const finding3: Finding = {
      file: 'src/test.ts',
      line: 10 + LINE_PROXIMITY_THRESHOLD + 1, // Outside threshold
      message: 'Issue',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint,
    };

    const existingFingerprintSet = new Set<string>();
    const proximityMap = new Map<string, number[]>();

    // finding1: not duplicate (empty state)
    expect(isDuplicateByProximity(finding1, existingFingerprintSet, proximityMap)).toBe(false);

    // Post finding1 - update structures
    existingFingerprintSet.add(getDedupeKey(finding1));
    updateProximityMap(proximityMap, finding1);

    // finding2: IS duplicate (at boundary, inclusive)
    expect(isDuplicateByProximity(finding2, existingFingerprintSet, proximityMap)).toBe(true);

    // finding3: NOT duplicate (outside threshold)
    expect(isDuplicateByProximity(finding3, existingFingerprintSet, proximityMap)).toBe(false);
  });

  it('should update tracking structures for all findings in grouped comment', () => {
    const fingerprint1 = 'abc123def456abc123def456abc12345';
    const fingerprint2 = 'def456abc123def456abc123def45678';
    const findingsInGroup: Finding[] = [
      {
        file: 'src/test.ts',
        line: 10,
        message: 'First',
        severity: 'warning',
        sourceAgent: 'test',
        fingerprint: fingerprint1,
      },
      {
        file: 'src/test.ts',
        line: 12,
        message: 'Second',
        severity: 'error',
        sourceAgent: 'test',
        fingerprint: fingerprint2,
      },
    ];

    const laterFinding: Finding = {
      file: 'src/test.ts',
      line: 10 + LINE_PROXIMITY_THRESHOLD, // Within threshold of first
      message: 'First',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint: fingerprint1,
    };

    const existingFingerprintSet = new Set<string>();
    const proximityMap = new Map<string, number[]>();

    // Simulate grouped post - update all
    for (const f of findingsInGroup) {
      existingFingerprintSet.add(getDedupeKey(f));
      updateProximityMap(proximityMap, f);
    }

    expect(existingFingerprintSet.size).toBe(2);
    expect(proximityMap.size).toBe(2);

    // Later finding detected as duplicate
    expect(isDuplicateByProximity(laterFinding, existingFingerprintSet, proximityMap)).toBe(true);
  });

  it('should post both findings when outside LINE_PROXIMITY_THRESHOLD', () => {
    const fingerprint = 'abc123def456abc123def456abc12345';
    const finding1: Finding = {
      file: 'src/test.ts',
      line: 10,
      message: 'Issue',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint,
    };
    const finding2: Finding = {
      file: 'src/test.ts',
      line: 10 + LINE_PROXIMITY_THRESHOLD + 10, // Well outside threshold
      message: 'Issue',
      severity: 'warning',
      sourceAgent: 'test',
      fingerprint,
    };

    const existingFingerprintSet = new Set<string>();
    const proximityMap = new Map<string, number[]>();

    // Post finding1
    existingFingerprintSet.add(getDedupeKey(finding1));
    updateProximityMap(proximityMap, finding1);

    // finding2 is NOT duplicate (outside threshold)
    expect(isDuplicateByProximity(finding2, existingFingerprintSet, proximityMap)).toBe(false);

    // Post finding2
    existingFingerprintSet.add(getDedupeKey(finding2));
    updateProximityMap(proximityMap, finding2);

    // Both posted
    expect(existingFingerprintSet.size).toBe(2);
    const proximityKey = `${fingerprint}:src/test.ts`;
    expect(proximityMap.get(proximityKey)).toStrictEqual([10, 10 + LINE_PROXIMITY_THRESHOLD + 10]);
  });
});
