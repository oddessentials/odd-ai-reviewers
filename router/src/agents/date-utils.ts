/**
 * Date Utilities for LLM Agents
 *
 * Provides injectable date functions for deterministic testing.
 * LLM prompts include current date to enable time-aware reviews.
 */

/** Date override for testing (null = use real date) */
let dateOverride: string | null = null;

/**
 * Get the current UTC date in YYYY-MM-DD format.
 * Uses override if set (for testing), otherwise returns real date.
 */
export function getCurrentDateUTC(): string {
  if (dateOverride !== null) {
    return dateOverride;
  }
  const isoString = new Date().toISOString();
  return isoString.split('T')[0] ?? isoString.slice(0, 10);
}

/**
 * Set a date override for testing.
 * Pass null to clear the override and use real date.
 *
 * @param date - Date string in YYYY-MM-DD format, or null to clear
 */
export function setDateOverride(date: string | null): void {
  dateOverride = date;
}
