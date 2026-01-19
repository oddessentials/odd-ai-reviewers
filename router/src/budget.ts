/**
 * Budget Module
 * Enforces per-PR and monthly cost limits
 */

import type { Limits } from './config.js';

export interface BudgetContext {
  /** Number of files changed in the PR */
  fileCount: number;
  /** Total lines changed (additions + deletions) */
  diffLines: number;
  /** Estimated tokens for LLM input */
  estimatedTokens: number;
}

export interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  /** Suggested reduced scope if over budget */
  reducedScope?: {
    maxFiles?: number;
    maxLines?: number;
  };
}

export interface CostEstimate {
  /** Estimated USD cost for LLM calls */
  estimatedUsd: number;
  /** Breakdown by agent */
  breakdown: Record<string, number>;
}

// Approximate cost per 1K tokens (GPT-4 class models)
const COST_PER_1K_TOKENS_INPUT = 0.01;
const COST_PER_1K_TOKENS_OUTPUT = 0.03;
const ESTIMATED_OUTPUT_RATIO = 0.2; // Output is typically 20% of input

/**
 * Check if the PR is within budget limits
 */
export function checkBudget(context: BudgetContext, limits: Limits): BudgetCheck {
  // Check file count limit
  if (context.fileCount > limits.max_files) {
    return {
      allowed: false,
      reason: `PR has ${context.fileCount} files, exceeds limit of ${limits.max_files}`,
      reducedScope: { maxFiles: limits.max_files },
    };
  }

  // Check diff lines limit
  if (context.diffLines > limits.max_diff_lines) {
    return {
      allowed: false,
      reason: `PR has ${context.diffLines} changed lines, exceeds limit of ${limits.max_diff_lines}`,
      reducedScope: { maxLines: limits.max_diff_lines },
    };
  }

  // Check token limit
  if (context.estimatedTokens > limits.max_tokens_per_pr) {
    return {
      allowed: false,
      reason: `Estimated ${context.estimatedTokens} tokens, exceeds limit of ${limits.max_tokens_per_pr}`,
    };
  }

  // Check estimated cost
  const estimate = estimateCost(context.estimatedTokens);
  if (estimate.estimatedUsd > limits.max_usd_per_pr) {
    return {
      allowed: false,
      reason: `Estimated cost $${estimate.estimatedUsd.toFixed(2)} exceeds limit of $${limits.max_usd_per_pr.toFixed(2)}`,
    };
  }

  return { allowed: true };
}

/**
 * Estimate cost based on token count
 */
export function estimateCost(tokens: number): CostEstimate {
  const inputCost = (tokens / 1000) * COST_PER_1K_TOKENS_INPUT;
  const outputTokens = tokens * ESTIMATED_OUTPUT_RATIO;
  const outputCost = (outputTokens / 1000) * COST_PER_1K_TOKENS_OUTPUT;

  return {
    estimatedUsd: inputCost + outputCost,
    breakdown: {
      input: inputCost,
      output: outputCost,
    },
  };
}

/**
 * Estimate token count from diff content
 * Rough approximation: 1 token ≈ 4 characters
 */
export function estimateTokens(diffContent: string): number {
  return Math.ceil(diffContent.length / 4);
}

/**
 * Track monthly spending (stub - would use persistent storage in production)
 */
export interface MonthlyUsage {
  month: string; // YYYY-MM format
  totalUsd: number;
  prCount: number;
}

export function checkMonthlyBudget(
  currentUsage: MonthlyUsage,
  estimatedCost: number,
  monthlyLimit: number
): BudgetCheck {
  const projectedTotal = currentUsage.totalUsd + estimatedCost;

  if (projectedTotal > monthlyLimit) {
    return {
      allowed: false,
      reason: `Monthly budget exhausted. Current: $${currentUsage.totalUsd.toFixed(2)}, Limit: $${monthlyLimit.toFixed(2)}`,
    };
  }

  return { allowed: true };
}
