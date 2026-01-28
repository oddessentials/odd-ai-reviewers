/**
 * Analysis Logger Tests
 *
 * Tests for the AnalysisLogger class that provides structured logging
 * for control flow analysis decisions per FR-013.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AnalysisLogger,
  createLogger,
  getLogger,
  resetLogger,
} from '../../../../src/agents/control_flow/logger.js';

describe('AnalysisLogger', () => {
  let logger: AnalysisLogger;

  beforeEach(() => {
    resetLogger();
    logger = createLogger({ minLevel: 'debug' });
  });

  afterEach(() => {
    resetLogger();
  });

  // ===========================================================================
  // Factory Tests
  // ===========================================================================

  describe('createLogger', () => {
    it('should create logger with default config', () => {
      const log = createLogger();
      expect(log).toBeDefined();
      expect(log).toBeInstanceOf(AnalysisLogger);
    });

    it('should create logger with custom config', () => {
      const log = createLogger({
        minLevel: 'warn',
        maxEntries: 500,
        consoleOutput: false,
      });
      expect(log).toBeDefined();
    });
  });

  describe('getLogger', () => {
    it('should return singleton instance', () => {
      const log1 = getLogger();
      const log2 = getLogger();
      expect(log1).toBe(log2);
    });

    it('should reset singleton with resetLogger', () => {
      const log1 = getLogger();
      resetLogger();
      const log2 = getLogger();
      expect(log1).not.toBe(log2);
    });
  });

  // ===========================================================================
  // Analysis ID Tests
  // ===========================================================================

  describe('analysisId', () => {
    it('should generate unique analysis ID', () => {
      const log1 = createLogger();
      const log2 = createLogger();
      expect(log1.getAnalysisId()).not.toBe(log2.getAnalysisId());
    });

    it('should start with cfa- prefix', () => {
      const id = logger.getAnalysisId();
      expect(id).toMatch(/^cfa-/);
    });

    it('should generate new ID on startNewSession', () => {
      const id1 = logger.getAnalysisId();
      logger.startNewSession();
      const id2 = logger.getAnalysisId();
      expect(id1).not.toBe(id2);
    });

    it('should clear entries on startNewSession', () => {
      logger.logPathFound('test', 5);
      expect(logger.getEntries().length).toBe(1);
      logger.startNewSession();
      expect(logger.getEntries().length).toBe(0);
    });
  });

  // ===========================================================================
  // Path Logging Tests
  // ===========================================================================

  describe('path logging', () => {
    it('should log path start', () => {
      logger.logPathStart('node_1', 'node_5');
      const entries = logger.getEntriesByCategory('path');
      expect(entries.length).toBe(1);
      expect(entries[0]?.message).toContain('node_1');
      expect(entries[0]?.message).toContain('node_5');
    });

    it('should log path found', () => {
      logger.logPathFound('entry->a->b->exit', 4);
      const entries = logger.getEntriesByCategory('path');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['signature']).toBe('entry->a->b->exit');
      expect(entries[0]?.context?.['nodeCount']).toBe(4);
    });

    it('should log path analysis complete', () => {
      logger.logPathAnalysisComplete(10, 7, 3);
      const entries = logger.getEntriesByCategory('path');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('info');
      expect(entries[0]?.context?.['totalPaths']).toBe(10);
      expect(entries[0]?.context?.['mitigatedCount']).toBe(7);
    });

    it('should log path limit reached', () => {
      logger.logPathLimitReached(100);
      const entries = logger.getEntriesByCategory('path');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('warn');
      expect(entries[0]?.context?.['limit']).toBe(100);
    });

    it('should log unreachable node', () => {
      logger.logUnreachableNode('node_5', 'after return');
      const entries = logger.getEntriesByCategory('path');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['nodeId']).toBe('node_5');
    });
  });

  // ===========================================================================
  // Mitigation Logging Tests
  // ===========================================================================

  describe('mitigation logging', () => {
    it('should log mitigation match', () => {
      logger.logMitigationMatch('zod-parse', { line: 10 }, 'injection');
      const entries = logger.getEntriesByCategory('mitigation');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['patternId']).toBe('zod-parse');
      expect(entries[0]?.context?.['vulnerabilityType']).toBe('injection');
    });

    it('should log mitigation evaluation', () => {
      logger.logMitigationEvaluation('path1', ['zod-parse', 'validator'], 'mitigated');
      const entries = logger.getEntriesByCategory('mitigation');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['result']).toBe('mitigated');
    });

    it('should log custom pattern evaluation', () => {
      logger.logCustomPatternEvaluation('company-sanitize', true);
      const entries = logger.getEntriesByCategory('mitigation');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['matched']).toBe(true);
    });

    it('should log mitigation coverage', () => {
      logger.logMitigationCoverage('injection', 75.5, 'partial');
      const entries = logger.getEntriesByCategory('mitigation');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('info');
      expect(entries[0]?.context?.['status']).toBe('partial');
    });
  });

  // ===========================================================================
  // Depth Logging Tests
  // ===========================================================================

  describe('depth logging', () => {
    it('should log call depth', () => {
      logger.logCallDepth('processUser', 3, 5);
      const entries = logger.getEntriesByCategory('depth');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['currentDepth']).toBe(3);
      expect(entries[0]?.context?.['maxDepth']).toBe(5);
    });

    it('should log depth limit reached', () => {
      logger.logDepthLimitReached('deepNested', 5);
      const entries = logger.getEntriesByCategory('depth');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('warn');
    });

    it('should log inter-procedural start', () => {
      logger.logInterProceduralStart('caller', 'callee', 42);
      const entries = logger.getEntriesByCategory('depth');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['callerFunction']).toBe('caller');
      expect(entries[0]?.context?.['calleeFunction']).toBe('callee');
    });
  });

  // ===========================================================================
  // Finding Logging Tests
  // ===========================================================================

  describe('finding logging', () => {
    it('should log finding generated', () => {
      logger.logFindingGenerated('cfa/injection', 'error', 'test.ts', 15);
      const entries = logger.getEntriesByCategory('finding');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('info');
      expect(entries[0]?.context?.['ruleId']).toBe('cfa/injection');
    });

    it('should log finding suppressed', () => {
      logger.logFindingSuppressed('injection', 'test.ts', 15, ['zod-parse']);
      const entries = logger.getEntriesByCategory('finding');
      expect(entries.length).toBe(1);
      expect(entries[0]?.message).toContain('suppressed');
    });

    it('should log severity downgrade', () => {
      logger.logSeverityDowngrade('error', 'warning', 60);
      const entries = logger.getEntriesByCategory('finding');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['originalSeverity']).toBe('error');
      expect(entries[0]?.context?.['newSeverity']).toBe('warning');
    });
  });

  // ===========================================================================
  // Budget Logging Tests
  // ===========================================================================

  describe('budget logging', () => {
    it('should log budget usage', () => {
      logger.logBudgetUsage('time', 150000, 300000);
      const entries = logger.getEntriesByCategory('budget');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['used']).toBe(150000);
      expect(entries[0]?.context?.['total']).toBe(300000);
    });

    it('should log budget warning', () => {
      logger.logBudgetWarning('time', 85);
      const entries = logger.getEntriesByCategory('budget');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('warn');
    });

    it('should log budget exceeded', () => {
      logger.logBudgetExceeded('size');
      const entries = logger.getEntriesByCategory('budget');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('error');
    });
  });

  // ===========================================================================
  // CFG Logging Tests
  // ===========================================================================

  describe('cfg logging', () => {
    it('should log CFG built', () => {
      logger.logCFGBuilt('processData', 25, 30);
      const entries = logger.getEntriesByCategory('cfg');
      expect(entries.length).toBe(1);
      expect(entries[0]?.context?.['nodeCount']).toBe(25);
      expect(entries[0]?.context?.['edgeCount']).toBe(30);
    });

    it('should log CFG complexity', () => {
      logger.logCFGComplexity('complexFunction', 500);
      const entries = logger.getEntriesByCategory('cfg');
      expect(entries.length).toBe(1);
      expect(entries[0]?.level).toBe('warn');
    });
  });

  // ===========================================================================
  // Log Level Filtering Tests
  // ===========================================================================

  describe('log level filtering', () => {
    it('should respect minLevel configuration', () => {
      const warnLogger = createLogger({ minLevel: 'warn' });
      warnLogger.logPathStart('a', 'b'); // debug - should be filtered
      warnLogger.logPathLimitReached(100); // warn - should be included
      warnLogger.logBudgetExceeded('time'); // error - should be included

      const entries = warnLogger.getEntries();
      expect(entries.length).toBe(2);
      expect(entries.every((e) => e.level === 'warn' || e.level === 'error')).toBe(true);
    });

    it('should include all levels when minLevel is debug', () => {
      logger.logPathStart('a', 'b'); // debug
      logger.logMitigationCoverage('xss', 100, 'full'); // info
      logger.logPathLimitReached(100); // warn
      logger.logBudgetExceeded('time'); // error

      const entries = logger.getEntries();
      expect(entries.length).toBe(4);
    });
  });

  // ===========================================================================
  // Category Filtering Tests
  // ===========================================================================

  describe('category filtering', () => {
    it('should respect includeCategories configuration', () => {
      const filteredLogger = createLogger({
        minLevel: 'debug',
        includeCategories: ['path', 'finding'],
      });

      filteredLogger.logPathStart('a', 'b');
      filteredLogger.logMitigationMatch('zod', { line: 1 }, 'injection');
      filteredLogger.logFindingGenerated('cfa/xss', 'error', 'test.ts', 1);

      const entries = filteredLogger.getEntries();
      expect(entries.length).toBe(2);
      expect(entries.every((e) => e.category === 'path' || e.category === 'finding')).toBe(true);
    });

    it('should respect excludeCategories configuration', () => {
      const filteredLogger = createLogger({
        minLevel: 'debug',
        excludeCategories: ['path', 'depth'],
      });

      filteredLogger.logPathStart('a', 'b');
      filteredLogger.logCallDepth('fn', 1, 5);
      filteredLogger.logMitigationCoverage('xss', 100, 'full');

      const entries = filteredLogger.getEntries();
      // path category is excluded, depth is excluded
      expect(entries.every((e) => e.category !== 'depth' && e.category !== 'path')).toBe(true);
    });
  });

  // ===========================================================================
  // Max Entries Tests
  // ===========================================================================

  describe('max entries limiting', () => {
    it('should limit entries to maxEntries', () => {
      const limitedLogger = createLogger({ minLevel: 'debug', maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        limitedLogger.logPathFound(`path${i}`, i);
      }

      expect(limitedLogger.getEntries().length).toBe(5);
    });

    it('should keep most recent entries when over limit', () => {
      const limitedLogger = createLogger({ minLevel: 'debug', maxEntries: 3 });

      for (let i = 0; i < 5; i++) {
        limitedLogger.logPathFound(`path${i}`, i);
      }

      const entries = limitedLogger.getEntries();
      expect(entries[0]?.context?.['signature']).toBe('path2');
      expect(entries[2]?.context?.['signature']).toBe('path4');
    });
  });

  // ===========================================================================
  // Retrieval Tests
  // ===========================================================================

  describe('getEntries', () => {
    it('should return copy of entries', () => {
      logger.logPathStart('a', 'b');
      const entries1 = logger.getEntries();
      const entries2 = logger.getEntries();
      expect(entries1).not.toBe(entries2);
      expect(entries1).toEqual(entries2);
    });
  });

  describe('getEntriesByCategory', () => {
    it('should filter by category', () => {
      logger.logPathStart('a', 'b');
      logger.logMitigationMatch('zod', { line: 1 }, 'injection');
      logger.logFindingGenerated('cfa/xss', 'error', 'test.ts', 1);

      const pathEntries = logger.getEntriesByCategory('path');
      expect(pathEntries.length).toBe(1);
      expect(pathEntries[0]?.category).toBe('path');
    });
  });

  describe('getEntriesByLevel', () => {
    it('should filter by level', () => {
      logger.logPathStart('a', 'b'); // debug
      logger.logPathLimitReached(100); // warn
      logger.logBudgetExceeded('time'); // error

      const warnEntries = logger.getEntriesByLevel('warn');
      expect(warnEntries.length).toBe(1);
      expect(warnEntries[0]?.level).toBe('warn');
    });
  });

  // ===========================================================================
  // Summary Tests
  // ===========================================================================

  describe('getSummary', () => {
    it('should return correct summary', () => {
      logger.logPathStart('a', 'b'); // debug, path
      logger.logMitigationCoverage('xss', 100, 'full'); // info, mitigation
      logger.logPathLimitReached(100); // warn, path
      logger.logBudgetExceeded('time'); // error, budget

      const summary = logger.getSummary();

      expect(summary.analysisId).toBe(logger.getAnalysisId());
      expect(summary.totalEntries).toBe(4);
      expect(summary.byLevel.debug).toBe(1);
      expect(summary.byLevel.info).toBe(1);
      expect(summary.byLevel.warn).toBe(1);
      expect(summary.byLevel.error).toBe(1);
      expect(summary.byCategory.path).toBe(2);
      expect(summary.byCategory.mitigation).toBe(1);
      expect(summary.byCategory.budget).toBe(1);
      expect(summary.warnings).toBe(1);
      expect(summary.errors).toBe(1);
    });
  });

  // ===========================================================================
  // Clear Tests
  // ===========================================================================

  describe('clear', () => {
    it('should clear all entries', () => {
      logger.logPathStart('a', 'b');
      logger.logMitigationMatch('zod', { line: 1 }, 'injection');
      expect(logger.getEntries().length).toBe(2);

      logger.clear();
      expect(logger.getEntries().length).toBe(0);
    });
  });

  // ===========================================================================
  // Export Tests
  // ===========================================================================

  describe('exportAsJson', () => {
    it('should export as valid JSON', () => {
      logger.logPathStart('a', 'b');
      logger.logMitigationMatch('zod', { line: 1 }, 'injection');

      const json = logger.exportAsJson();
      const parsed = JSON.parse(json);

      expect(parsed.analysisId).toBe(logger.getAnalysisId());
      expect(parsed.exportTime).toBeDefined();
      expect(parsed.entries.length).toBe(2);
    });
  });

  // ===========================================================================
  // Timestamp Tests
  // ===========================================================================

  describe('timestamps', () => {
    it('should include timestamp in entries', () => {
      const before = Date.now();
      logger.logPathStart('a', 'b');
      const after = Date.now();

      const entries = logger.getEntries();
      expect(entries[0]?.timestamp).toBeGreaterThanOrEqual(before);
      expect(entries[0]?.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
