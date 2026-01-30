/**
 * Cache Store Module
 * Stores and retrieves cached review results
 * Uses GitHub Actions cache in CI, file-based cache locally
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'fs';
import { join, resolve } from 'path';
import { homedir } from 'os';
import type { AgentResult } from '../agents/index.js';
import { AgentResultSchema } from '../agents/types.js';
import { AI_REVIEW_CACHE_PATH, CACHE_KEY_PREFIX, generateRestoreKeyPrefix } from './key.js';
import { buildRouterEnv } from '../agents/security.js';

export interface CacheEntry {
  key: string;
  result: AgentResult;
  createdAt: string;
  expiresAt: string;
}

/** Default TTL: 24 hours */
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

/** In-memory cache for current session */
const memoryCache = new Map<string, CacheEntry>();

/** Cache directory path */
function getCacheDir(): string {
  // Use GITHUB_WORKSPACE in CI, otherwise ~/.ai-review-cache
  const routerEnv = buildRouterEnv(process.env as Record<string, string | undefined>);
  const base = routerEnv['GITHUB_WORKSPACE'] || homedir();
  return join(base, AI_REVIEW_CACHE_PATH);
}

/**
 * Check if we're running in GitHub Actions
 */
function isGitHubActions(): boolean {
  const routerEnv = buildRouterEnv(process.env as Record<string, string | undefined>);
  return routerEnv['GITHUB_ACTIONS'] === 'true';
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
  const dir = getCacheDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Validate cache key to prevent path traversal attacks.
 * Keys must be alphanumeric with dashes only (matching generateCacheKey output).
 */
function isValidCacheKey(key: string): boolean {
  // Cache keys from generateCacheKey are: ai-review-v{N}-{prNumber}-{hash}
  // Only allow alphanumeric, dashes, no path separators or traversal
  return /^[a-zA-Z0-9-]+$/.test(key) && !key.includes('..');
}

/**
 * Get cache file path for a key.
 * Validates key format and ensures resolved path stays under cache root.
 */
function getCacheFilePath(key: string): string {
  if (!isValidCacheKey(key)) {
    throw new Error(`Invalid cache key format: ${key}`);
  }

  const cacheDir = getCacheDir();
  const filePath = join(cacheDir, `${key}.json`);

  // Ensure resolved path is under cache directory (defense in depth)
  const resolvedPath = resolve(filePath);
  const resolvedCacheDir = resolve(cacheDir);
  if (!resolvedPath.startsWith(resolvedCacheDir)) {
    throw new Error(`Cache path traversal detected: ${key}`);
  }

  return filePath;
}

/**
 * Validate a cached result against AgentResultSchema
 *
 * (012-fix-agent-result-regressions) - Validates cache entries to handle:
 * - Legacy cache entries (success: boolean format) → return null (cache miss)
 * - Malformed/corrupted entries → return null (cache miss)
 * - New-format entries (discriminated union with status field) → return result
 */
function validateCachedResult(result: unknown): AgentResult | null {
  const parseResult = AgentResultSchema.safeParse(result);
  if (!parseResult.success) {
    // Legacy or malformed cache entry - treat as cache miss
    return null;
  }
  return parseResult.data;
}

/**
 * Get a cached result
 */
export async function getCached(key: string): Promise<AgentResult | null> {
  // Check memory cache first
  const memEntry = memoryCache.get(key);
  if (memEntry) {
    if (new Date(memEntry.expiresAt) > new Date()) {
      // Validate the cached result (012-fix-agent-result-regressions)
      const validated = validateCachedResult(memEntry.result);
      if (validated) {
        console.log(`[cache] Memory hit: ${key}`);
        return validated;
      }
      // Invalid format - treat as cache miss
      console.warn(`[cache] Memory entry invalid format, treating as miss: ${key}`);
      memoryCache.delete(key);
    } else {
      memoryCache.delete(key);
    }
  }

  // Check file cache
  const filePath = getCacheFilePath(key);
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const entry = JSON.parse(content) as CacheEntry;

      if (new Date(entry.expiresAt) > new Date()) {
        // Validate the cached result (012-fix-agent-result-regressions)
        const validated = validateCachedResult(entry.result);
        if (validated) {
          console.log(`[cache] File hit: ${key}`);
          // Populate memory cache with validated result (direct assignment for clarity)
          entry.result = validated;
          memoryCache.set(key, entry);
          return validated;
        }
        // Invalid format - treat as cache miss (remove stale file)
        console.warn(`[cache] File entry invalid format, treating as miss: ${key}`);
        unlinkSync(filePath);
        return null;
      }

      // Expired, remove file
      unlinkSync(filePath);
    } catch {
      console.warn(`[cache] Failed to read cache file: ${filePath}`);
    }
  }

  return null;
}

/**
 * Store a result in the cache
 */
export async function setCache(
  key: string,
  result: AgentResult,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  const entry: CacheEntry = {
    key,
    result,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Store in memory
  memoryCache.set(key, entry);

  // Store to file
  try {
    ensureCacheDir();
    const filePath = getCacheFilePath(key);
    writeFileSync(filePath, JSON.stringify(entry, null, 2));
    console.log(`[cache] Set: ${key} (expires: ${expiresAt.toISOString()})`);
  } catch (error) {
    console.warn(`[cache] Failed to write cache file: ${error}`);
  }
}

/**
 * Clear the cache
 */
export async function clearCache(): Promise<void> {
  memoryCache.clear();

  const dir = getCacheDir();
  if (existsSync(dir)) {
    try {
      const files = readdirSync(dir);
      for (const file of files) {
        if (file.startsWith(CACHE_KEY_PREFIX) && file.endsWith('.json')) {
          unlinkSync(join(dir, file));
        }
      }
      console.log('[cache] Cleared');
    } catch (error) {
      console.warn(`[cache] Failed to clear cache: ${error}`);
    }
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpired(): Promise<number> {
  let cleaned = 0;
  const dir = getCacheDir();

  if (!existsSync(dir)) return 0;

  try {
    const files = readdirSync(dir);
    for (const file of files) {
      if (!file.startsWith(CACHE_KEY_PREFIX) || !file.endsWith('.json')) continue;

      const filePath = join(dir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const entry = JSON.parse(content) as CacheEntry;

        if (new Date(entry.expiresAt) < new Date()) {
          unlinkSync(filePath);
          memoryCache.delete(entry.key);
          cleaned++;
        }
      } catch {
        // Remove corrupted files
        unlinkSync(filePath);
        cleaned++;
      }
    }
  } catch (error) {
    console.warn(`[cache] Cleanup failed: ${error}`);
  }

  if (cleaned > 0) {
    console.log(`[cache] Cleaned up ${cleaned} expired entries`);
  }

  return cleaned;
}

/**
 * Find cached result for a PR (even with different SHA)
 * Used for fallback when exact cache miss
 *
 * (012-fix-agent-result-regressions) - Now validates results through validateCachedResult()
 * to ensure legacy/malformed entries are treated as cache misses.
 */
export async function findCachedForPR(prNumber: number): Promise<AgentResult | null> {
  const prefix = generateRestoreKeyPrefix(prNumber);
  const dir = getCacheDir();

  if (!existsSync(dir)) return null;

  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    for (const file of files) {
      const filePath = join(dir, file);
      try {
        const content = readFileSync(filePath, 'utf-8');
        const entry = JSON.parse(content) as CacheEntry;

        if (new Date(entry.expiresAt) > new Date()) {
          // Validate the cached result (012-fix-agent-result-regressions)
          const validated = validateCachedResult(entry.result);
          if (validated) {
            console.log(`[cache] Fallback hit for PR ${prNumber}: ${entry.key}`);
            return validated;
          }
          // Invalid format - skip and try next file
          console.warn(`[cache] Fallback entry invalid format, skipping: ${entry.key}`);
        }
      } catch {
        // Skip corrupted files
      }
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Save cache for GitHub Actions
 * Call this at the end of a CI run to persist cache
 */
export async function saveGitHubActionsCache(key: string): Promise<boolean> {
  if (!isGitHubActions()) {
    return false;
  }

  try {
    // Dynamic import to avoid bundling @actions/cache for non-CI use
    const cache = await import('@actions/cache');
    const paths = [getCacheDir()];

    await cache.saveCache(paths, key);
    console.log(`[cache] Saved to GitHub Actions cache: ${key}`);
    return true;
  } catch (error) {
    console.warn(`[cache] Failed to save GitHub Actions cache: ${error}`);
    return false;
  }
}

/**
 * Restore cache from GitHub Actions
 * Call this at the start of a CI run
 */
export async function restoreGitHubActionsCache(
  primaryKey: string,
  restoreKeys: string[]
): Promise<string | undefined> {
  if (!isGitHubActions()) {
    return undefined;
  }

  try {
    const cache = await import('@actions/cache');
    const paths = [getCacheDir()];

    const matchedKey = await cache.restoreCache(paths, primaryKey, restoreKeys);
    if (matchedKey) {
      console.log(`[cache] Restored from GitHub Actions cache: ${matchedKey}`);
    }
    return matchedKey;
  } catch (error) {
    console.warn(`[cache] Failed to restore GitHub Actions cache: ${error}`);
    return undefined;
  }
}
