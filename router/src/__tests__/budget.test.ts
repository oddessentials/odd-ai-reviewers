/**
 * Budget Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  checkBudget,
  estimateCost,
  estimateTokens,
  checkMonthlyBudget,
  type BudgetContext,
  type MonthlyUsage,
} from '../budget.js';
import type { Limits } from '../config.js';

const defaultLimits: Limits = {
  max_files: 50,
  max_diff_lines: 2000,
  max_tokens_per_pr: 12000,
  max_usd_per_pr: 1.0,
  monthly_budget_usd: 100,
};

describe('checkBudget', () => {
  it('should allow PR within all limits', () => {
    const context: BudgetContext = {
      fileCount: 10,
      diffLines: 500,
      estimatedTokens: 1000,
    };

    const result = checkBudget(context, defaultLimits);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should fail PR exceeding file count with suggestion', () => {
    const context: BudgetContext = {
      fileCount: 60,
      diffLines: 500,
      estimatedTokens: 1000,
    };

    const result = checkBudget(context, defaultLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('60 files');
    expect(result.reason).toContain('exceeds limit of 50');
    expect(result.reducedScope?.maxFiles).toBe(50);
  });

  it('should fail PR exceeding diff lines with suggestion', () => {
    const context: BudgetContext = {
      fileCount: 10,
      diffLines: 3000,
      estimatedTokens: 1000,
    };

    const result = checkBudget(context, defaultLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('3000 changed lines');
    expect(result.reason).toContain('exceeds limit of 2000');
    expect(result.reducedScope?.maxLines).toBe(2000);
  });

  it('should fail PR exceeding token limit', () => {
    const context: BudgetContext = {
      fileCount: 10,
      diffLines: 500,
      estimatedTokens: 15000,
    };

    const result = checkBudget(context, defaultLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('15000 tokens');
    expect(result.reason).toContain('exceeds limit of 12000');
  });

  it('should fail PR exceeding cost limit', () => {
    const context: BudgetContext = {
      fileCount: 10,
      diffLines: 500,
      estimatedTokens: 10000, // Will estimate to ~$0.16 which is under $1
    };

    // Use tight limits
    const tightLimits: Limits = {
      ...defaultLimits,
      max_usd_per_pr: 0.01, // Very low limit
    };

    const result = checkBudget(context, tightLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Estimated cost');
    expect(result.reason).toContain('exceeds limit');
  });
});

describe('estimateCost', () => {
  it('should estimate cost based on tokens', () => {
    const tokens = 10000;
    const cost = estimateCost(tokens);

    expect(cost.estimatedUsd).toBeGreaterThan(0);
    expect(cost.breakdown['input']).toBeGreaterThan(0);
    expect(cost.breakdown['output']).toBeGreaterThan(0);
  });

  it('should calculate higher cost for more tokens', () => {
    const small = estimateCost(1000);
    const large = estimateCost(10000);

    expect(large.estimatedUsd).toBeGreaterThan(small.estimatedUsd);
  });
});

describe('estimateTokens', () => {
  it('should estimate tokens from diff content', () => {
    const content = 'a'.repeat(400); // 400 chars ≈ 100 tokens
    const tokens = estimateTokens(content);

    expect(tokens).toBe(100);
  });

  it('should round up tokens', () => {
    const content = 'ab'; // 2 chars ≈ 0.5 tokens → rounds to 1
    const tokens = estimateTokens(content);

    expect(tokens).toBe(1);
  });
});

describe('checkMonthlyBudget', () => {
  it('should allow when within budget', () => {
    const usage: MonthlyUsage = {
      month: '2026-01',
      totalUsd: 50,
      prCount: 20,
    };

    const result = checkMonthlyBudget(usage, 10, 100);
    expect(result.allowed).toBe(true);
  });

  it('should fail when exceeding monthly limit', () => {
    const usage: MonthlyUsage = {
      month: '2026-01',
      totalUsd: 95,
      prCount: 50,
    };

    const result = checkMonthlyBudget(usage, 10, 100);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Monthly budget exhausted');
  });

  it('should allow when exactly at limit', () => {
    const usage: MonthlyUsage = {
      month: '2026-01',
      totalUsd: 90,
      prCount: 45,
    };

    const result = checkMonthlyBudget(usage, 10, 100);
    expect(result.allowed).toBe(true);
  });
});
