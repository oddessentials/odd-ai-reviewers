/**
 * Cache Key Module (Stub)
 * Generates deterministic cache keys for review results
 *
 * To be fully implemented in Phase 2
 */

import { createHash } from 'crypto';

export interface CacheKeyInputs {
    prNumber: number;
    headSha: string;
    configHash: string;
    agentId: string;
}

/**
 * Generate a cache key for a review run
 */
export function generateCacheKey(inputs: CacheKeyInputs): string {
    const data = `${inputs.prNumber}:${inputs.headSha}:${inputs.configHash}:${inputs.agentId}`;
    return createHash('sha256').update(data).digest('hex').slice(0, 16);
}

/**
 * Generate a hash of the configuration
 */
export function hashConfig(config: unknown): string {
    const json = JSON.stringify(config, Object.keys(config as object).sort());
    return createHash('sha256').update(json).digest('hex').slice(0, 16);
}
