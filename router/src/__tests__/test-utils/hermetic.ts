/**
 * Hermetic Test Utilities
 *
 * Provides utilities for creating deterministic, isolated tests that:
 * - Have frozen time (no wall-clock dependencies)
 * - Have deterministic UUIDs
 * - Have no real network access
 * - Have no real git remote access
 *
 * @example
 * ```typescript
 * import { describe, it, beforeEach, afterEach } from 'vitest';
 * import { setupHermeticTest, teardownHermeticTest } from './test-utils/hermetic.js';
 *
 * describe('MyFeature', () => {
 *   beforeEach(() => {
 *     setupHermeticTest();
 *   });
 *
 *   afterEach(() => {
 *     teardownHermeticTest();
 *   });
 *
 *   it('works with frozen time', () => {
 *     expect(new Date().toISOString()).toBe('2026-01-29T00:00:00.000Z');
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
 * Deterministic UUID counter for generating predictable UUIDs
 */
let uuidCounter = 0;

/**
 * Generate a deterministic UUID for testing
 * Returns UUIDs in format: test-uuid-NNNN where NNNN is a zero-padded counter
 */
export function generateTestUUID(): string {
  const counter = uuidCounter++;
  return `test-uuid-${counter.toString().padStart(4, '0')}`;
}

/**
 * Reset the UUID counter (call in afterEach if needed)
 */
export function resetUUIDCounter(): void {
  uuidCounter = 0;
}

/**
 * Setup hermetic test environment
 *
 * Configures:
 * - Frozen system time to FROZEN_TIMESTAMP
 * - Deterministic crypto.randomUUID()
 * - Stubbed fetch (returns 503 by default - must be mocked per test)
 *
 * Call this in beforeEach()
 */
export function setupHermeticTest(): void {
  // Freeze time
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_DATE);

  // Reset UUID counter
  resetUUIDCounter();

  // Stub crypto.randomUUID with deterministic values
  vi.stubGlobal('crypto', {
    ...globalThis.crypto,
    randomUUID: generateTestUUID,
  });

  // Stub fetch to fail by default (tests must explicitly mock expected calls)
  vi.stubGlobal(
    'fetch',
    vi.fn().mockRejectedValue(new Error('Network access not allowed in hermetic tests'))
  );
}

/**
 * Teardown hermetic test environment
 *
 * Restores:
 * - Real system time
 * - Original global stubs
 *
 * Call this in afterEach()
 */
export function teardownHermeticTest(): void {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetUUIDCounter();
}

/**
 * Create a mock response for testing fetch calls
 */
export function createMockResponse(
  body: unknown,
  options: { status?: number; headers?: Record<string, string> } = {}
): Response {
  const { status = 200, headers = {} } = options;
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}

/**
 * Create a mock git exec function that returns stubbed output
 */
export function createMockGitExec(responses: Record<string, string | Error>) {
  return vi.fn((command: string, args: string[]): string => {
    const key = `${command} ${args.join(' ')}`;

    // Check for exact match first
    if (Object.prototype.hasOwnProperty.call(responses, key)) {
      const response = responses[key];
      if (response === undefined) {
        throw new Error(`Unmocked git command: ${key}`);
      }
      if (response instanceof Error) {
        throw response;
      }
      return response;
    }

    // Check for partial matches (command only)
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.startsWith(pattern)) {
        if (response instanceof Error) {
          throw response;
        }
        return response;
      }
    }

    throw new Error(`Unmocked git command: ${key}`);
  });
}

/**
 * Advance time by specified milliseconds in hermetic tests
 */
export async function advanceTime(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/**
 * Run all pending timers in hermetic tests
 */
export async function runAllTimers(): Promise<void> {
  await vi.runAllTimersAsync();
}
