/**
 * Budget Module Tests
 */

import { describe, it, expect } from 'vitest';
import {
  checkBudget,
  estimateCost,
  estimateTokens,
  checkMonthlyBudget,
  COST_PER_1K_TOKENS_INPUT,
  COST_PER_1K_TOKENS_OUTPUT,
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
  max_completion_tokens: 4000,
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
    // With GPT-4o-mini pricing: input=$0.00015/1K, output=$0.0006/1K
    // For 50000 tokens with 20% output ratio:
    // - Input cost: 50000 / 1000 * 0.00015 = $0.0075
    // - Output cost: 50000 * 0.2 / 1000 * 0.0006 = $0.006
    // - Total: ~$0.0135 which exceeds $0.01 limit
    const context: BudgetContext = {
      fileCount: 10,
      diffLines: 500,
      estimatedTokens: 50000,
    };

    // Use tight cost limit but allow the tokens through
    const tightLimits: Limits = {
      ...defaultLimits,
      max_tokens_per_pr: 100000, // High enough to pass token check
      max_usd_per_pr: 0.01, // Very low cost limit, will be exceeded
    };

    const result = checkBudget(context, tightLimits);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Estimated cost');
    expect(result.reason).toContain('exceeds limit');
  });
});

describe('Pricing Consistency', () => {
  /**
   * CRITICAL: This test ensures budget estimates match actual agent cost calculations.
   * If this test fails, the budget module and agents have drifted out of sync,
   * which could cause budget limits to fail silently or block valid PRs.
   */
  it('should use consistent pricing with budget module', () => {
    // These are the exact values used in pr_agent.ts and ai_semantic_review.ts
    const agentInputCostPer1K = 0.00015;
    const agentOutputCostPer1K = 0.0006;

    // Verify budget module uses the same constants
    expect(COST_PER_1K_TOKENS_INPUT).toBe(agentInputCostPer1K);
    expect(COST_PER_1K_TOKENS_OUTPUT).toBe(agentOutputCostPer1K);
  });

  it('should calculate cost matching agent formula', () => {
    const tokens = 10000;
    const cost = estimateCost(tokens);

    // Replicate the agent formula exactly
    const expectedInputCost = (tokens / 1000) * 0.00015;
    const expectedOutputTokens = tokens * 0.2; // ESTIMATED_OUTPUT_RATIO
    const expectedOutputCost = (expectedOutputTokens / 1000) * 0.0006;
    const expectedTotal = expectedInputCost + expectedOutputCost;

    expect(cost.estimatedUsd).toBeCloseTo(expectedTotal, 6);
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
