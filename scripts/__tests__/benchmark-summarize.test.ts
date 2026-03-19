import { describe, expect, it } from 'vitest';
import { buildSummary } from '../benchmark-summarize.js';

describe('buildSummary', () => {
  it('aggregates overall and per-project metrics for odd-ai-reviewers', () => {
    const benchmarkData = {
      'https://github.com/getsentry/sentry/pull/1': { source_repo: 'sentry' },
      'https://github.com/grafana/grafana/pull/2': { source_repo: 'grafana' },
      'https://github.com/grafana/grafana/pull/3': { source_repo: 'grafana' },
    };

    const evaluations = {
      'https://github.com/getsentry/sentry/pull/1': {
        'odd-ai-reviewers': { tp: 2, fp: 1, fn: 1, skipped: false },
      },
      'https://github.com/grafana/grafana/pull/2': {
        'odd-ai-reviewers': { tp: 1, fp: 1, fn: 0, skipped: false },
      },
      'https://github.com/grafana/grafana/pull/3': {
        'odd-ai-reviewers': { tp: 0, fp: 2, fn: 3, skipped: false },
      },
    };

    const summary = buildSummary(
      benchmarkData,
      evaluations,
      'odd-ai-reviewers',
      'openai/gpt-4o-mini'
    );

    expect(summary).toMatchObject({
      tool: 'odd-ai-reviewers',
      judge_model: 'openai/gpt-4o-mini',
      total_tool_comments: 7,
      total_golden_comments: 7,
      true_positives: 3,
      false_positives: 4,
      false_negatives: 4,
      precision: 0.4286,
      recall: 0.4286,
      f1: 0.4286,
      projects: {
        grafana: { precision: 0.25, recall: 0.25, f1: 0.25 },
        sentry: { precision: 0.6667, recall: 0.6667, f1: 0.6667 },
      },
    });
  });

  it('skips unrelated tools and skipped evaluations', () => {
    const benchmarkData = {
      'https://github.com/example/repo/pull/1': { source_repo: 'repo' },
      'https://github.com/example/repo/pull/2': { source_repo: 'repo' },
    };

    const evaluations = {
      'https://github.com/example/repo/pull/1': {
        'odd-ai-reviewers': { tp: 1, fp: 0, fn: 1, skipped: false },
        claude: { tp: 5, fp: 0, fn: 0, skipped: false },
      },
      'https://github.com/example/repo/pull/2': {
        'odd-ai-reviewers': { tp: 9, fp: 9, fn: 9, skipped: true },
      },
    };

    const summary = buildSummary(benchmarkData, evaluations, 'odd-ai-reviewers', 'judge');

    expect(summary).toMatchObject({
      total_tool_comments: 1,
      total_golden_comments: 2,
      true_positives: 1,
      false_positives: 0,
      false_negatives: 1,
      precision: 1,
      recall: 0.5,
      f1: 0.6667,
      projects: {
        repo: { precision: 1, recall: 0.5, f1: 0.6667 },
      },
    });
  });
});
