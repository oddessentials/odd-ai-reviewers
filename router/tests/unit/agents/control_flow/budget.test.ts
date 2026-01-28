/**
 * Analysis Budget Tests
 *
 * Tests for the AnalysisBudget class that manages time and size limits
 * during control flow analysis with graceful degradation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AnalysisBudget,
  DEFAULT_BUDGET_CONFIG,
  getFilePriority,
  type FilePriority,
} from '../../../../src/agents/control_flow/budget.js';
import {
  SMALL_CODEBASE,
  MEDIUM_CODEBASE,
  LARGE_CODEBASE,
  VERY_LARGE_CODEBASE,
  OVERSIZED_CODEBASE,
  HIGH_PRIORITY_FILES,
  MEDIUM_PRIORITY_FILES,
  LOW_PRIORITY_FILES,
} from './fixtures/large-codebase.js';
import { createLogger, resetLogger } from '../../../../src/agents/control_flow/logger.js';

// =============================================================================
// Test Setup
// =============================================================================

describe('AnalysisBudget', () => {
  let budget: AnalysisBudget;

  beforeEach(() => {
    resetLogger();
    budget = new AnalysisBudget();
  });

  afterEach(() => {
    resetLogger();
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Constructor Tests
  // ===========================================================================

  describe('constructor', () => {
    it('should create with default config', () => {
      const b = new AnalysisBudget();
      expect(b.status).toBe('ok');
      expect(b.isDegraded).toBe(false);
      expect(b.effectiveMaxCallDepth).toBe(DEFAULT_BUDGET_CONFIG.maxCallDepth);
    });

    it('should accept custom config', () => {
      const b = new AnalysisBudget({
        maxDurationMs: 60000,
        maxLinesChanged: 5000,
        maxCallDepth: 3,
      });
      expect(b.effectiveMaxCallDepth).toBe(3);
    });

    it('should start with zero lines analyzed', () => {
      expect(budget.stats.linesAnalyzed).toBe(0);
      expect(budget.stats.filesAnalyzed).toBe(0);
    });
  });

  // ===========================================================================
  // Status Tracking Tests
  // ===========================================================================

  describe('status tracking', () => {
    it('should remain ok for small codebase', () => {
      for (const file of SMALL_CODEBASE.files) {
        budget.recordFile(file.lines);
      }
      expect(budget.status).toBe('ok');
      expect(budget.isDegraded).toBe(false);
    });

    it('should remain ok for medium codebase', () => {
      for (const file of MEDIUM_CODEBASE.files) {
        budget.recordFile(file.lines);
      }
      expect(budget.status).toBe('ok');
    });

    it('should transition to warning at 80% size budget', () => {
      // Record 8000 lines (80% of 10000)
      budget.recordFile(8000);
      expect(budget.status).toBe('warning');
      expect(budget.isDegraded).toBe(true);
    });

    it('should transition to exceeded at 90% size budget', () => {
      // Record 9000 lines (90% of 10000)
      budget.recordFile(9000);
      expect(budget.status).toBe('exceeded');
      expect(budget.isDegraded).toBe(true);
    });

    it('should transition to terminated at 100% size budget', () => {
      // Record 10000 lines (100% of 10000)
      budget.recordFile(10000);
      expect(budget.status).toBe('terminated');
    });

    it('should handle progressive status changes', () => {
      expect(budget.status).toBe('ok');

      budget.recordFile(7500); // 75%
      expect(budget.status).toBe('ok');

      budget.recordFile(500); // 80%
      expect(budget.status).toBe('warning');

      budget.recordFile(1000); // 90%
      expect(budget.status).toBe('exceeded');

      budget.recordFile(1000); // 100%
      expect(budget.status).toBe('terminated');
    });
  });

  // ===========================================================================
  // Time Budget Tests (T061)
  // ===========================================================================

  describe('time budget', () => {
    it('should track elapsed time', () => {
      const start = budget.elapsedMs;
      // Elapsed time should be very small initially
      expect(start).toBeLessThan(100);
    });

    it('should calculate remaining time', () => {
      expect(budget.remainingMs).toBeLessThanOrEqual(DEFAULT_BUDGET_CONFIG.maxDurationMs);
      expect(budget.remainingMs).toBeGreaterThan(0);
    });

    it('should calculate time percent used', () => {
      expect(budget.timePercentUsed).toBeGreaterThanOrEqual(0);
      expect(budget.timePercentUsed).toBeLessThan(1); // Should be very small initially
    });

    it('should trigger warning at 80% time budget', () => {
      // Create budget with short duration
      const shortBudget = new AnalysisBudget({ maxDurationMs: 100 });

      // Mock Date.now to simulate time passing
      const startTime = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => startTime + 80); // 80% elapsed

      shortBudget.checkBudget();
      expect(shortBudget.status).toBe('warning');
    });

    it('should trigger terminated at 100% time budget', () => {
      const shortBudget = new AnalysisBudget({ maxDurationMs: 100 });

      const startTime = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => startTime + 100);

      shortBudget.checkBudget();
      expect(shortBudget.status).toBe('terminated');
    });
  });

  // ===========================================================================
  // Size Budget Tests (T062)
  // ===========================================================================

  describe('size budget', () => {
    it('should track lines analyzed', () => {
      budget.recordFile(100);
      expect(budget.stats.linesAnalyzed).toBe(100);

      budget.recordFile(200);
      expect(budget.stats.linesAnalyzed).toBe(300);
    });

    it('should track files analyzed', () => {
      budget.recordFile(100);
      budget.recordFile(200);
      expect(budget.stats.filesAnalyzed).toBe(2);
    });

    it('should calculate size percent used', () => {
      budget.recordFile(5000);
      expect(budget.sizePercentUsed).toBe(50);
    });

    it('should handle large codebase', () => {
      for (const file of LARGE_CODEBASE.files) {
        budget.recordFile(file.lines);
      }
      expect(budget.status).toBe(LARGE_CODEBASE.expectedStatus);
    });

    it('should handle very large codebase', () => {
      for (const file of VERY_LARGE_CODEBASE.files) {
        budget.recordFile(file.lines);
      }
      expect(budget.status).toBe(VERY_LARGE_CODEBASE.expectedStatus);
    });

    it('should handle oversized codebase', () => {
      for (const file of OVERSIZED_CODEBASE.files) {
        if (!budget.shouldContinue()) break;
        budget.recordFile(file.lines);
      }
      expect(budget.status).toBe('terminated');
    });
  });

  // ===========================================================================
  // Degraded Mode Tests (T063)
  // ===========================================================================

  describe('degraded mode', () => {
    it('should reduce call depth to 3 in degraded mode', () => {
      expect(budget.effectiveMaxCallDepth).toBe(5);

      budget.recordFile(8000); // Trigger warning
      expect(budget.isDegraded).toBe(true);
      expect(budget.effectiveMaxCallDepth).toBe(3);
    });

    it('should respect custom maxCallDepth if lower than 3', () => {
      const b = new AnalysisBudget({ maxCallDepth: 2 });
      b.recordFile(8000);
      expect(b.effectiveMaxCallDepth).toBe(2);
    });

    it('should track when degradation started', () => {
      expect(budget.getDegradedReason()).toBeUndefined();

      budget.recordFile(8000);
      expect(budget.getDegradedReason()).toContain('80%');
    });

    it('should provide degraded reason for time budget', () => {
      const shortBudget = new AnalysisBudget({ maxDurationMs: 100 });
      const startTime = Date.now();
      vi.spyOn(Date, 'now').mockImplementation(() => startTime + 85);

      shortBudget.checkBudget();
      expect(shortBudget.getDegradedReason()).toContain('time budget');
    });

    it('should provide degraded reason for size budget', () => {
      budget.recordFile(8500);
      expect(budget.getDegradedReason()).toContain('size budget');
    });
  });

  // ===========================================================================
  // File Priority Tests (T063)
  // ===========================================================================

  describe('file priority', () => {
    it('should identify high priority files', () => {
      for (const file of HIGH_PRIORITY_FILES) {
        expect(getFilePriority(file)).toBe('high');
      }
    });

    it('should identify medium priority files', () => {
      for (const file of MEDIUM_PRIORITY_FILES) {
        expect(getFilePriority(file)).toBe('medium');
      }
    });

    it('should identify low priority files', () => {
      for (const file of LOW_PRIORITY_FILES) {
        expect(getFilePriority(file)).toBe('low');
      }
    });

    it('should default to medium for unknown files', () => {
      expect(getFilePriority('src/unknown/file.ts')).toBe('medium');
    });

    it('should prioritize test detection over other patterns', () => {
      // Even if file is in api folder, test files are low priority
      expect(getFilePriority('src/api/__tests__/handler.test.ts')).toBe('low');
    });
  });

  describe('shouldAnalyzeFile', () => {
    it('should analyze all files when not degraded', () => {
      expect(budget.shouldAnalyzeFile('src/__tests__/test.ts')).toBe(true);
      expect(budget.shouldAnalyzeFile('src/auth/login.ts')).toBe(true);
    });

    it('should skip low priority files in degraded mode', () => {
      budget.recordFile(8000); // Trigger degraded mode
      expect(budget.isDegraded).toBe(true);

      expect(budget.shouldAnalyzeFile('src/__tests__/test.ts')).toBe(false);
      expect(budget.shouldAnalyzeFile('src/auth/login.ts')).toBe(true);
    });

    it('should track skipped files', () => {
      budget.recordFile(8000);

      budget.shouldAnalyzeFile('src/__tests__/test1.ts');
      budget.shouldAnalyzeFile('src/__tests__/test2.ts');

      expect(budget.stats.filesSkipped).toBe(2);
    });

    it('should not analyze any files when terminated', () => {
      budget.recordFile(10000);

      expect(budget.shouldAnalyzeFile('src/auth/login.ts')).toBe(false);
    });
  });

  describe('sortFilesByPriority', () => {
    it('should sort files with high priority first', () => {
      const files = [
        { path: 'src/__tests__/test.ts' },
        { path: 'src/auth/login.ts' },
        { path: 'src/services/user.ts' },
      ];

      const sorted = budget.sortFilesByPriority(files);

      expect(sorted[0]?.path).toBe('src/auth/login.ts');
      expect(sorted[1]?.path).toBe('src/services/user.ts');
      expect(sorted[2]?.path).toBe('src/__tests__/test.ts');
    });

    it('should not mutate original array', () => {
      const files = [{ path: 'src/__tests__/test.ts' }, { path: 'src/auth/login.ts' }];
      const original = [...files];

      budget.sortFilesByPriority(files);

      expect(files).toEqual(original);
    });
  });

  // ===========================================================================
  // Graceful Termination Tests (T064)
  // ===========================================================================

  describe('graceful termination', () => {
    it('should stop analysis when terminated', () => {
      budget.recordFile(10000);
      expect(budget.shouldContinue()).toBe(false);
    });

    it('should continue analysis when ok', () => {
      budget.recordFile(1000);
      expect(budget.shouldContinue()).toBe(true);
    });

    it('should continue analysis when degraded but not terminated', () => {
      budget.recordFile(8000);
      expect(budget.isDegraded).toBe(true);
      expect(budget.shouldContinue()).toBe(true);
    });

    it('should not change status after terminated', () => {
      budget.recordFile(10000);
      expect(budget.status).toBe('terminated');

      budget.recordFile(1000); // Try to add more
      expect(budget.status).toBe('terminated');
    });
  });

  // ===========================================================================
  // Call Depth Tests
  // ===========================================================================

  describe('call depth', () => {
    it('should track current depth', () => {
      budget.setCallDepth(3);
      expect(budget.canGoDeeper()).toBe(true);

      budget.setCallDepth(5);
      expect(budget.canGoDeeper()).toBe(false);
    });

    it('should respect reduced depth in degraded mode', () => {
      budget.setCallDepth(2);
      expect(budget.canGoDeeper()).toBe(true);

      budget.recordFile(8000); // Trigger degraded
      budget.setCallDepth(3);
      expect(budget.canGoDeeper()).toBe(false);
    });

    it('should not allow deeper calls when terminated', () => {
      budget.setCallDepth(0);
      budget.recordFile(10000);
      expect(budget.canGoDeeper()).toBe(false);
    });
  });

  // ===========================================================================
  // Finding Metadata Tests (T065)
  // ===========================================================================

  describe('toFindingMetadata', () => {
    it('should return non-degraded metadata when ok', () => {
      budget.setCallDepth(2);
      const metadata = budget.toFindingMetadata();

      expect(metadata.analysisDepth).toBe(2);
      expect(metadata.degraded).toBe(false);
      expect(metadata.degradedReason).toBeUndefined();
    });

    it('should return degraded metadata when warning', () => {
      budget.recordFile(8000);
      budget.setCallDepth(2);
      const metadata = budget.toFindingMetadata();

      expect(metadata.degraded).toBe(true);
      expect(metadata.degradedReason).toBeDefined();
    });

    it('should include reason when terminated', () => {
      budget.recordFile(10000);
      const metadata = budget.toFindingMetadata();

      expect(metadata.degraded).toBe(true);
      expect(metadata.degradedReason).toContain('100%');
    });
  });

  // ===========================================================================
  // Analysis Log Tests
  // ===========================================================================

  describe('analysis log', () => {
    it('should log status transitions', () => {
      budget.recordFile(8000);

      const log = budget.analysisLog;
      expect(log.length).toBeGreaterThan(0);
      expect(log.some((entry) => entry.message.includes('warning'))).toBe(true);
    });

    it('should return copy of log', () => {
      budget.addLog('info', 'test');
      const log1 = budget.analysisLog;
      const log2 = budget.analysisLog;

      expect(log1).not.toBe(log2);
      expect(log1).toEqual(log2);
    });
  });

  // ===========================================================================
  // Stats Tests
  // ===========================================================================

  describe('stats', () => {
    it('should return comprehensive stats', () => {
      budget.recordFile(5000);

      const stats = budget.stats;

      expect(stats.linesAnalyzed).toBe(5000);
      expect(stats.filesAnalyzed).toBe(1);
      expect(stats.filesSkipped).toBe(0);
      expect(stats.status).toBe('ok');
      expect(stats.degraded).toBe(false);
      expect(stats.timePercentUsed).toBeGreaterThanOrEqual(0);
      expect(stats.sizePercentUsed).toBe(50);
    });

    it('should track skipped files in stats', () => {
      budget.recordFile(8000);
      budget.shouldAnalyzeFile('src/__tests__/test.ts');

      expect(budget.stats.filesSkipped).toBe(1);
    });
  });
});

// =============================================================================
// getFilePriority Unit Tests
// =============================================================================

describe('getFilePriority', () => {
  const testCases: Array<{ path: string; expected: FilePriority }> = [
    // High priority
    { path: 'src/auth/login.ts', expected: 'high' },
    { path: 'src/security/validate.ts', expected: 'high' },
    { path: 'src/middleware/auth.ts', expected: 'high' },
    { path: 'src/api/users.ts', expected: 'high' },
    { path: 'src/handlers/payment.ts', expected: 'high' },
    { path: 'src/controllers/order.ts', expected: 'high' },
    { path: 'src/database/queries.ts', expected: 'high' },
    { path: 'src/db/connection.ts', expected: 'high' },
    { path: 'src/utils/sanitize.ts', expected: 'high' },
    { path: 'src/helpers/validate.ts', expected: 'high' },
    { path: 'src/lib/escape.ts', expected: 'high' },

    // Medium priority
    { path: 'src/services/user.ts', expected: 'medium' },
    { path: 'src/utils/format.ts', expected: 'medium' },
    { path: 'src/models/order.ts', expected: 'medium' },
    { path: 'src/entities/product.ts', expected: 'medium' },
    { path: 'src/helpers/date.ts', expected: 'medium' },
    { path: 'src/lib/cache.ts', expected: 'medium' },

    // Low priority
    { path: 'src/__tests__/user.test.ts', expected: 'low' },
    { path: 'src/user.test.ts', expected: 'low' },
    { path: 'src/user.spec.ts', expected: 'low' },
    { path: 'scripts/build.ts', expected: 'low' },
    { path: 'tools/generate.ts', expected: 'low' },
    { path: 'src/types/index.ts', expected: 'low' },
    { path: 'src/interfaces/user.ts', expected: 'low' },
    { path: 'src/constants/index.ts', expected: 'low' },
    { path: 'src/config/defaults.ts', expected: 'low' },

    // Default to medium
    { path: 'src/index.ts', expected: 'medium' },
    { path: 'src/main.ts', expected: 'medium' },
    { path: 'src/app.ts', expected: 'medium' },
  ];

  testCases.forEach(({ path, expected }) => {
    it(`should classify ${path} as ${expected}`, () => {
      expect(getFilePriority(path)).toBe(expected);
    });
  });
});
