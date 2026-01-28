/**
 * Linkcheck Allowlist Contract
 *
 * Defines the schema for external link validation exclusions.
 * Configuration file: .linkcheckignore.yml
 *
 * @see FR-013, FR-013a
 */

import { z } from 'zod';

/**
 * Single allowlist entry
 */
export const AllowlistEntry = z.object({
  /** URL or regex pattern to exclude from validation */
  pattern: z.string().min(1),

  /** Required justification for exclusion */
  reason: z.string().min(1),

  /** Optional expiry date for periodic review (ISO 8601) */
  expiry: z.string().datetime().optional(),

  /** PR reference that added this entry */
  added_by: z.string().optional(),

  /** Date entry was added (ISO 8601) */
  added_at: z.string().datetime(),
});

export type AllowlistEntry = z.infer<typeof AllowlistEntry>;

/**
 * Complete allowlist configuration
 */
export const LinkcheckAllowlist = z.object({
  /** Configuration version */
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver format'),

  /** List of excluded patterns */
  entries: z.array(AllowlistEntry),
});

export type LinkcheckAllowlist = z.infer<typeof LinkcheckAllowlist>;

/**
 * Check if an entry has expired
 *
 * @param entry - Allowlist entry to check
 * @param now - Current date (defaults to now)
 * @returns true if entry has an expiry date in the past
 */
export function isExpired(entry: AllowlistEntry, now: Date = new Date()): boolean {
  if (!entry.expiry) return false;
  return new Date(entry.expiry) < now;
}

/**
 * Get all expired entries from allowlist
 *
 * @param allowlist - Complete allowlist configuration
 * @param now - Current date (defaults to now)
 * @returns Array of expired entries
 */
export function getExpiredEntries(
  allowlist: LinkcheckAllowlist,
  now: Date = new Date()
): AllowlistEntry[] {
  return allowlist.entries.filter((entry) => isExpired(entry, now));
}

/**
 * Validate URL against allowlist patterns
 *
 * Uses string-based matching only (no dynamic RegExp) for security.
 * Patterns are matched as:
 * - Exact match: pattern equals URL
 * - Prefix match: pattern ends with '*' and URL starts with prefix
 * - Substring match: URL contains pattern
 *
 * @param url - URL to check
 * @param allowlist - Allowlist configuration
 * @returns true if URL matches any allowlist pattern
 */
export function isAllowlisted(url: string, allowlist: LinkcheckAllowlist): boolean {
  return allowlist.entries.some((entry) => {
    const pattern = entry.pattern;

    // Exact match
    if (url === pattern) {
      return true;
    }

    // Prefix match: pattern ends with '*'
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return url.startsWith(prefix);
    }

    // Substring match
    return url.includes(pattern);
  });
}

/**
 * Example YAML structure for .linkcheckignore.yml:
 *
 * ```yaml
 * version: "1.0.0"
 * entries:
 *   - pattern: "https://example.com/unstable-api"
 *     reason: "External API with frequent URL changes"
 *     expiry: "2026-06-01T00:00:00Z"
 *     added_by: "#123"
 *     added_at: "2026-01-28T00:00:00Z"
 * ```
 */
