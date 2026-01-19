/**
 * Cache Key Module
 * Generates deterministic cache keys for review results
 */

import { createHash } from 'crypto';

/** Cache key prefix for namespacing */
export const CACHE_KEY_PREFIX = 'ai-review';

/** Default cache directory path */
export const AI_REVIEW_CACHE_PATH = '.ai-review-cache';

export interface CacheKeyInputs {
  prNumber: number;
  headSha: string;
  configHash: string;
  agentId: string;
}

/**
 * Generate a cache key for a review run
 * Format: ai-review-{prNumber}-{headSha}-{configHash}-{agentId}
 */
export function generateCacheKey(inputs: CacheKeyInputs): string {
  const data = `${inputs.prNumber}:${inputs.headSha}:${inputs.configHash}:${inputs.agentId}`;
  const hash = createHash('sha256').update(data).digest('hex').slice(0, 16);
  return `${CACHE_KEY_PREFIX}-${inputs.prNumber}-${hash}`;
}

/**
 * Generate a restore key prefix for partial cache matches
 * This allows fallback to older cached results for the same PR
 */
export function generateRestoreKeyPrefix(prNumber: number): string {
  return `${CACHE_KEY_PREFIX}-${prNumber}-`;
}

/**
 * Generate a hash of the configuration
 * Used for cache invalidation when config changes
 */
export function hashConfig(config: unknown): string {
  const json = JSON.stringify(config, Object.keys(config as object).sort());
  return createHash('sha256').update(json).digest('hex').slice(0, 16);
}

/**
 * Generate a hash of file contents for cache invalidation
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Parse a cache key to extract components
 */
export function parseCacheKey(key: string): { prNumber: number; hash: string } | null {
  const match = key.match(/^ai-review-(\d+)-([a-f0-9]+)$/);
  if (!match || !match[1] || !match[2]) return null;
  return {
    prNumber: parseInt(match[1], 10),
    hash: match[2],
  };
}
