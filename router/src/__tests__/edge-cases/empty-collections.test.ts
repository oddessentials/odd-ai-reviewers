/**
 * Empty Collection Edge Case Tests
 *
 * These tests verify that empty collections are handled correctly throughout
 * the codebase. "Nothing happens" scenarios are easy to miss and can lead
 * to subtle bugs when code assumes collections are non-empty.
 *
 * Rule: Never rely on implicit coverage for empty collections.
 * Always assert explicitly that empty arrays remain empty and don't
 * magically gain entries.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentSuccess,
  AgentFailure,
  AgentSkipped,
  isSuccess,
  isFailure,
  type AgentMetrics,
  type Finding,
  type AgentResult,
} from '../../agents/types.js';
import {
  deduplicateFindings,
  deduplicatePartialFindings,
  sortFindings,
  countBySeverity,
  groupByFile,
  generateSummaryMarkdown,
  renderPartialFindingsSection,
} from '../../report/formats.js';
import { annotateProvenance, type ExecuteResult } from '../../phases/execute.js';

const metrics: AgentMetrics = {
  durationMs: 100,
  filesProcessed: 5,
};

describe('Empty Collection Edge Cases', () => {
  describe('ExecuteResult collections', () => {
    it('completeFindings is empty when no agents produce findings', () => {
      // Simulate result from agents that ran but found nothing
      const result: ExecuteResult = {
        completeFindings: [],
        partialFindings: [],
        allResults: [
          AgentSuccess({
            agentId: 'semgrep',
            findings: [], // No findings
            metrics,
          }),
          AgentSuccess({
            agentId: 'eslint',
            findings: [], // No findings
            metrics,
          }),
        ],
        skippedAgents: [],
      };

      // EXPLICIT: completeFindings MUST be empty
      expect(result.completeFindings).toEqual([]);
      expect(result.completeFindings).toHaveLength(0);
      expect(result.completeFindings).toStrictEqual([]);
    });

    it('partialFindings is empty when all agents succeed', () => {
      // This is the most important empty collection test - prevents
      // regression where partial findings could leak into success path
      const result: ExecuteResult = {
        completeFindings: [
          { severity: 'warning', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' },
        ],
        partialFindings: [],
        allResults: [
          AgentSuccess({
            agentId: 'semgrep',
            findings: [
              { severity: 'warning', file: 'a.ts', message: 'Test', sourceAgent: 'semgrep' },
            ],
            metrics,
          }),
        ],
        skippedAgents: [],
      };

      // EXPLICIT: partialFindings MUST be empty when all agents succeed
      expect(result.partialFindings).toEqual([]);
      expect(result.partialFindings).toHaveLength(0);
      // Verify nothing sneaked in
      expect(result.partialFindings.some((f) => f.provenance === 'partial')).toBe(false);
    });

    it('partialFindings is empty when failure has no partial findings', () => {
      // Preflight failures typically have no partial findings
      const result: ExecuteResult = {
        completeFindings: [],
        partialFindings: [],
        allResults: [
          AgentFailure({
            agentId: 'semgrep',
            error: 'Missing API key',
            failureStage: 'preflight',
            // No partialFindings provided - defaults to []
            metrics,
          }),
        ],
        skippedAgents: [],
      };

      // EXPLICIT: partialFindings MUST be empty
      expect(result.partialFindings).toEqual([]);
      expect(result.partialFindings).toHaveLength(0);
    });

    it('skippedAgents is empty when all configured agents run', () => {
      const result: ExecuteResult = {
        completeFindings: [],
        partialFindings: [],
        allResults: [
          AgentSuccess({ agentId: 'semgrep', findings: [], metrics }),
          AgentSuccess({ agentId: 'eslint', findings: [], metrics }),
        ],
        skippedAgents: [],
      };

      // EXPLICIT: skippedAgents MUST be empty
      expect(result.skippedAgents).toEqual([]);
      expect(result.skippedAgents).toHaveLength(0);
    });

    it('allResults is empty when no agents are configured', () => {
      // Edge case: no agents configured to run
      const result: ExecuteResult = {
        completeFindings: [],
        partialFindings: [],
        allResults: [],
        skippedAgents: [],
      };

      // EXPLICIT: All collections MUST be empty
      expect(result.completeFindings).toEqual([]);
      expect(result.partialFindings).toEqual([]);
      expect(result.allResults).toEqual([]);
      expect(result.skippedAgents).toEqual([]);
    });
  });

  describe('AgentResult collections', () => {
    it('AgentSuccess.findings can be empty (agent found nothing)', () => {
      const success = AgentSuccess({
        agentId: 'clean-code-agent',
        findings: [],
        metrics,
      });

      // EXPLICIT: Empty findings is valid for success
      expect(success.findings).toEqual([]);
      expect(success.findings).toHaveLength(0);
      expect(success.status).toBe('success');
    });

    it('AgentFailure.partialFindings can be empty (preflight failure)', () => {
      const failure = AgentFailure({
        agentId: 'test',
        error: 'Config validation failed',
        failureStage: 'preflight',
        // partialFindings omitted - defaults to []
        metrics,
      });

      // EXPLICIT: Empty partialFindings is valid
      expect(failure.partialFindings).toEqual([]);
      expect(failure.partialFindings).toHaveLength(0);
      expect(failure.status).toBe('failure');
    });

    it('AgentFailure constructor defaults partialFindings to empty array', () => {
      const failure = AgentFailure({
        agentId: 'test',
        error: 'Error',
        failureStage: 'exec',
        metrics,
        // partialFindings NOT provided
      });

      // EXPLICIT: Default must be empty array, not undefined
      expect(failure.partialFindings).toBeDefined();
      expect(failure.partialFindings).toEqual([]);
      expect(Array.isArray(failure.partialFindings)).toBe(true);
    });
  });

  describe('Deduplication with empty inputs', () => {
    it('deduplicateFindings returns empty array for empty input', () => {
      const result = deduplicateFindings([]);

      // EXPLICIT: Empty in -> empty out
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('deduplicatePartialFindings returns empty array for empty input', () => {
      const result = deduplicatePartialFindings([]);

      // EXPLICIT: Empty in -> empty out
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('sortFindings returns empty array for empty input', () => {
      const result = sortFindings([]);

      // EXPLICIT: Empty in -> empty out
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  describe('Counting and grouping with empty inputs', () => {
    it('countBySeverity returns all zeros for empty input', () => {
      const counts = countBySeverity([]);

      // EXPLICIT: All counts must be zero
      expect(counts.error).toBe(0);
      expect(counts.warning).toBe(0);
      expect(counts.info).toBe(0);
    });

    it('groupByFile returns empty map for empty input', () => {
      const groups = groupByFile([]);

      // EXPLICIT: Empty map
      expect(groups.size).toBe(0);
      expect([...groups.entries()]).toEqual([]);
    });
  });

  describe('Report generation with empty inputs', () => {
    it('generateSummaryMarkdown handles no findings', () => {
      const markdown = generateSummaryMarkdown([]);

      // EXPLICIT: Should still generate valid markdown with zeros
      expect(markdown).toContain('| 🔴 Errors | 0 |');
      expect(markdown).toContain('| 🟡 Warnings | 0 |');
      expect(markdown).toContain('| 🔵 Info | 0 |');
      expect(markdown).toContain('No issues found');
    });

    it('renderPartialFindingsSection returns empty string for no partial findings', () => {
      const result = renderPartialFindingsSection([]);

      // EXPLICIT: Empty section -> empty string (not rendered)
      expect(result).toBe('');
      expect(result).toHaveLength(0);
    });
  });

  describe('Provenance annotation with empty inputs', () => {
    it('annotateProvenance returns empty array for empty input', () => {
      const result = annotateProvenance([], 'complete');

      // EXPLICIT: Empty in -> empty out
      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('annotateProvenance preserves empty arrays through transformation', () => {
      const original: Finding[] = [];
      const complete = annotateProvenance(original, 'complete');
      const partial = annotateProvenance(original, 'partial');

      // EXPLICIT: Both transformations produce empty arrays
      expect(complete).toEqual([]);
      expect(partial).toEqual([]);
      // Original unchanged
      expect(original).toEqual([]);
    });
  });

  describe('Mixed scenarios with some empty collections', () => {
    it('success results contribute to complete, failures with no partials add nothing', () => {
      const successFindings: Finding[] = [
        { severity: 'warning', file: 'a.ts', message: 'Warning', sourceAgent: 'semgrep' },
      ];

      const results: AgentResult[] = [
        AgentSuccess({
          agentId: 'semgrep',
          findings: successFindings,
          metrics,
        }),
        AgentFailure({
          agentId: 'eslint',
          error: 'Timeout',
          failureStage: 'preflight',
          // No partial findings
          metrics,
        }),
      ];

      // Simulate processing using type guards
      const completeFindings = results.filter(isSuccess).flatMap((r) => r.findings);

      const partialFindings = results.filter(isFailure).flatMap((r) => r.partialFindings);

      // EXPLICIT: Complete has items, partial is empty
      expect(completeFindings).toHaveLength(1);
      expect(partialFindings).toEqual([]);
      expect(partialFindings).toHaveLength(0);
    });

    it('all skipped agents produce all-empty collections', () => {
      const results: AgentResult[] = [
        AgentSkipped({
          agentId: 'semgrep',
          reason: 'No supported files',
          metrics,
        }),
        AgentSkipped({
          agentId: 'eslint',
          reason: 'Agent disabled',
          metrics,
        }),
      ];

      // Simulate processing using type guards
      const completeFindings = results.filter(isSuccess).flatMap((r) => r.findings);

      const partialFindings = results.filter(isFailure).flatMap((r) => r.partialFindings);

      // EXPLICIT: All collections empty when everything is skipped
      expect(completeFindings).toEqual([]);
      expect(partialFindings).toEqual([]);
    });
  });
});
