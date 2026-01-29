/**
 * Cache Key Module
 * Generates deterministic cache keys for review results
 *
 * (012-fix-agent-result-regressions) - Cache keys now include CACHE_SCHEMA_VERSION
 * to automatically invalidate legacy cache entries when schema changes.
 */

import { createHash } from 'crypto';
import { CACHE_SCHEMA_VERSION } from '../agents/types.js';

/** Cache key prefix for namespacing (includes version for automatic invalidation) */
export const CACHE_KEY_PREFIX = `ai-review-v${CACHE_SCHEMA_VERSION}`;

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
 *
 * (012-fix-agent-result-regressions) - Updated to handle versioned key format
 * Supports both legacy format (ai-review-{prNumber}-{hash}) and new format
 * (ai-review-v{version}-{prNumber}-{hash}) for backwards compatibility in parsing.
 */
export function parseCacheKey(
  key: string
): { prNumber: number; hash: string; version?: number } | null {
  // Try new versioned format first
  const versionedMatch = key.match(/^ai-review-v(\d+)-(\d+)-([a-f0-9]+)$/);
  if (versionedMatch && versionedMatch[1] && versionedMatch[2] && versionedMatch[3]) {
    return {
      version: parseInt(versionedMatch[1], 10),
      prNumber: parseInt(versionedMatch[2], 10),
      hash: versionedMatch[3],
    };
  }

  // Fall back to legacy format (for parsing only - new keys always use versioned format)
  const legacyMatch = key.match(/^ai-review-(\d+)-([a-f0-9]+)$/);
  if (legacyMatch && legacyMatch[1] && legacyMatch[2]) {
    return {
      prNumber: parseInt(legacyMatch[1], 10),
      hash: legacyMatch[2],
    };
  }

  return null;
}
