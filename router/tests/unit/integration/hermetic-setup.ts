/**
 * Hermetic Test Setup Utilities
 *
 * Shared test infrastructure for deterministic, isolated tests.
 * Located in __tests__/ directory which is classified as test code
 * by dependency-cruiser, allowing legitimate vitest imports.
 *
 * Provides:
 * - Frozen time (no wall-clock dependencies)
 * - Deterministic teardown
 *
 * @example
 * ```typescript
 * import { describe, it, beforeEach, afterEach } from 'vitest';
 * import {
 *   FROZEN_TIMESTAMP,
 *   setupHermeticTest,
 *   teardownHermeticTest,
 * } from '../hermetic-setup.js';
 *
 * describe('MyFeature', () => {
 *   beforeEach(() => setupHermeticTest());
 *   afterEach(() => teardownHermeticTest());
 *
 *   it('works with frozen time', () => {
 *     expect(new Date().toISOString()).toBe(FROZEN_TIMESTAMP);
 *   });
 * });
 * ```
 */

import { vi } from 'vitest';

/**
 * Frozen test timestamp - use consistently across all hermetic tests
 */
export const FROZEN_TIMESTAMP = '2026-01-29T00:00:00.000Z';
export const FROZEN_DATE = new Date(FROZEN_TIMESTAMP);

/**
 * Setup hermetic test environment
 *
 * Configures:
 * - Frozen system time to FROZEN_TIMESTAMP
 *
 * Call this in beforeEach()
 */
export function setupHermeticTest(): void {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_DATE);
}

/**
 * Teardown hermetic test environment
 *
 * Restores:
 * - Real system time
 * - All mocks
 *
 * Call this in afterEach()
 */
export function teardownHermeticTest(): void {
  vi.useRealTimers();
  vi.restoreAllMocks();
}
