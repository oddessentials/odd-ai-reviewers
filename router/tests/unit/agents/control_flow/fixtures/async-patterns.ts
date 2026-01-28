/**
 * Test Fixtures: Async/Await Patterns
 *
 * Fixtures for testing async boundary handling per FR-022 and FR-023.
 * - FR-022: Track mitigations before async boundaries within same function
 * - FR-023: Conservative assumptions for cross-function async
 */

// =============================================================================
// Intra-Function Async Patterns (FR-022)
// =============================================================================

/**
 * Mitigation BEFORE await - should be recognized.
 * The sanitization happens before the async boundary.
 */
export const SANITIZE_BEFORE_AWAIT = `
async function processInput(userId: string) {
  const sanitizedId = sanitizeInput(userId);
  const data = await fetchUserData(sanitizedId);
  return data;
}
`;

/**
 * Mitigation AFTER await - should be recognized.
 * The sanitization happens after the async operation completes.
 */
export const SANITIZE_AFTER_AWAIT = `
async function processInput(userId: string) {
  const data = await fetchUserData(userId);
  const sanitized = sanitizeOutput(data);
  return sanitized;
}
`;

/**
 * Null check before await - should protect the await call.
 */
export const NULL_CHECK_BEFORE_AWAIT = `
async function fetchIfExists(id: string | null) {
  if (id === null) {
    return null;
  }
  const result = await database.query(id);
  return result;
}
`;

/**
 * Auth check before await - should protect the async operation.
 */
export const AUTH_CHECK_BEFORE_AWAIT = `
async function protectedFetch(user: User, resourceId: string) {
  if (!isAuthenticated(user)) {
    throw new Error('Unauthorized');
  }
  const resource = await fetchResource(resourceId);
  return resource;
}
`;

/**
 * Multiple awaits with mitigation before all.
 */
export const MITIGATION_BEFORE_MULTIPLE_AWAITS = `
async function multiStep(input: string) {
  const validated = validateInput(input);
  const step1 = await processStep1(validated);
  const step2 = await processStep2(step1);
  const step3 = await processStep3(step2);
  return step3;
}
`;

/**
 * Sequential awaits with mitigation between them.
 */
export const MITIGATION_BETWEEN_AWAITS = `
async function twoPhaseProcess(input: string) {
  const data = await fetchRawData(input);
  const sanitized = sanitizeData(data);
  const result = await saveData(sanitized);
  return result;
}
`;

/**
 * Try-catch wrapping await with mitigation in catch.
 */
export const TRY_CATCH_AWAIT = `
async function safeOperation(input: string) {
  try {
    const result = await riskyOperation(input);
    return result;
  } catch (error) {
    logError(error);
    return sanitizeError(error);
  }
}
`;

/**
 * Conditional await with mitigation on one branch.
 */
export const CONDITIONAL_AWAIT = `
async function conditionalFetch(shouldFetch: boolean, id: string) {
  if (shouldFetch) {
    const sanitized = sanitizeId(id);
    return await fetchData(sanitized);
  }
  return getCachedData(id);
}
`;

/**
 * Promise.all with mitigations before.
 */
export const PROMISE_ALL_WITH_MITIGATION = `
async function parallelFetch(ids: string[]) {
  const sanitizedIds = ids.map(sanitizeInput);
  const results = await Promise.all(
    sanitizedIds.map(id => fetchData(id))
  );
  return results;
}
`;

/**
 * Await in loop with mitigation before loop.
 */
export const AWAIT_IN_LOOP = `
async function processItems(items: string[]) {
  const sanitizedItems = items.map(sanitizeItem);
  const results = [];
  for (const item of sanitizedItems) {
    const result = await processItem(item);
    results.push(result);
  }
  return results;
}
`;

// =============================================================================
// Cross-Function Async Patterns (FR-023)
// =============================================================================

/**
 * Async function calling another async function.
 * Cross-function async requires conservative fallback.
 */
export const CROSS_FUNCTION_ASYNC = `
async function fetchUser(id: string) {
  return await database.getUser(id);
}

async function processUser(id: string) {
  const sanitizedId = sanitizeInput(id);
  const user = await fetchUser(sanitizedId);
  return user;
}
`;

/**
 * Async callback pattern - harder to track.
 */
export const ASYNC_CALLBACK = `
async function processWithCallback(data: string, callback: (result: string) => Promise<void>) {
  const sanitized = sanitizeData(data);
  await callback(sanitized);
}
`;

/**
 * Async method in class - cross-method calls.
 */
export const ASYNC_CLASS_METHODS = `
class DataProcessor {
  async sanitize(input: string) {
    return sanitizeInput(input);
  }

  async process(input: string) {
    const clean = await this.sanitize(input);
    const result = await this.transform(clean);
    return result;
  }

  async transform(data: string) {
    return await externalTransform(data);
  }
}
`;

/**
 * Async generator pattern.
 */
export const ASYNC_GENERATOR = `
async function* processStream(items: string[]) {
  for (const item of items) {
    const sanitized = sanitizeItem(item);
    const result = await processItem(sanitized);
    yield result;
  }
}
`;

/**
 * Nested async calls.
 */
export const NESTED_ASYNC_CALLS = `
async function outer(input: string) {
  const sanitized = sanitizeInput(input);
  const result = await middle(sanitized);
  return result;
}

async function middle(input: string) {
  return await inner(input);
}

async function inner(input: string) {
  return await database.query(input);
}
`;

// =============================================================================
// Edge Cases
// =============================================================================

/**
 * Immediately invoked async function expression (IIFE).
 */
export const ASYNC_IIFE = `
const result = (async () => {
  const sanitized = sanitizeInput(userInput);
  return await fetchData(sanitized);
})();
`;

/**
 * Await with optional chaining.
 */
export const AWAIT_OPTIONAL_CHAIN = `
async function safeFetch(service: Service | null) {
  const result = await service?.fetchData();
  return result ?? defaultValue;
}
`;

/**
 * Await in ternary expression.
 */
export const AWAIT_IN_TERNARY = `
async function conditionalAwait(condition: boolean, id: string) {
  const sanitized = sanitizeInput(id);
  const result = condition
    ? await fetchFromPrimary(sanitized)
    : await fetchFromBackup(sanitized);
  return result;
}
`;

/**
 * Await with nullish coalescing.
 */
export const AWAIT_NULLISH_COALESCING = `
async function fetchWithFallback(id: string) {
  const sanitized = sanitizeInput(id);
  const result = await fetchData(sanitized) ?? await fetchFallback(sanitized);
  return result;
}
`;

/**
 * Top-level await (ESM).
 */
export const TOP_LEVEL_AWAIT = `
const config = await loadConfig();
const sanitizedConfig = sanitizeConfig(config);
export const settings = sanitizedConfig;
`;

/**
 * Async arrow function with implicit return.
 */
export const ASYNC_ARROW_IMPLICIT = `
const fetchSanitized = async (id: string) =>
  await fetchData(sanitizeInput(id));
`;

/**
 * Async function with destructuring await.
 */
export const DESTRUCTURING_AWAIT = `
async function fetchUserAndPosts(userId: string) {
  const sanitizedId = sanitizeInput(userId);
  const { user, posts } = await fetchUserData(sanitizedId);
  return { user: sanitizeUser(user), posts };
}
`;

// =============================================================================
// Unmitigated Patterns (Should Still Flag)
// =============================================================================

/**
 * No mitigation - await with raw input.
 */
export const UNMITIGATED_AWAIT = `
async function unsafeProcess(input: string) {
  const result = await dangerousOperation(input);
  return result;
}
`;

/**
 * Mitigation only on one branch of conditional await.
 */
export const PARTIAL_MITIGATION_CONDITIONAL_AWAIT = `
async function partialMitigation(condition: boolean, input: string) {
  if (condition) {
    const sanitized = sanitizeInput(input);
    return await fetchData(sanitized);
  }
  // Unmitigated path!
  return await fetchData(input);
}
`;

/**
 * Mitigation after dangerous await.
 */
export const MITIGATION_TOO_LATE = `
async function mitigationTooLate(input: string) {
  const result = await dangerousOperation(input);
  // Sanitizing result doesn't help - input was already used unsafely
  const sanitized = sanitizeResult(result);
  return sanitized;
}
`;

// =============================================================================
// Test Helpers
// =============================================================================

export interface AsyncPatternTestCase {
  name: string;
  code: string;
  expectedMitigated: boolean;
  description: string;
  asyncBoundaries: number;
  crossFunctionAsync: boolean;
}

/**
 * All intra-function test cases.
 */
export const INTRA_FUNCTION_CASES: AsyncPatternTestCase[] = [
  {
    name: 'sanitize-before-await',
    code: SANITIZE_BEFORE_AWAIT,
    expectedMitigated: true,
    description: 'Sanitization before await should be recognized',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'sanitize-after-await',
    code: SANITIZE_AFTER_AWAIT,
    expectedMitigated: true,
    description: 'Sanitization after await should be recognized',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'null-check-before-await',
    code: NULL_CHECK_BEFORE_AWAIT,
    expectedMitigated: true,
    description: 'Null check before await protects the call',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'auth-check-before-await',
    code: AUTH_CHECK_BEFORE_AWAIT,
    expectedMitigated: true,
    description: 'Auth check before await protects the operation',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'mitigation-before-multiple-awaits',
    code: MITIGATION_BEFORE_MULTIPLE_AWAITS,
    expectedMitigated: true,
    description: 'Single mitigation before multiple awaits',
    asyncBoundaries: 3,
    crossFunctionAsync: false,
  },
  {
    name: 'mitigation-between-awaits',
    code: MITIGATION_BETWEEN_AWAITS,
    expectedMitigated: true,
    description: 'Mitigation between two awaits',
    asyncBoundaries: 2,
    crossFunctionAsync: false,
  },
  {
    name: 'try-catch-await',
    code: TRY_CATCH_AWAIT,
    expectedMitigated: true,
    description: 'Try-catch with await and error sanitization',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'conditional-await',
    code: CONDITIONAL_AWAIT,
    expectedMitigated: true,
    description: 'Conditional path with mitigation before await',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'await-in-loop',
    code: AWAIT_IN_LOOP,
    expectedMitigated: true,
    description: 'Await in loop with mitigation before loop',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
];

/**
 * All cross-function test cases (require conservative fallback).
 */
export const CROSS_FUNCTION_CASES: AsyncPatternTestCase[] = [
  {
    name: 'cross-function-async',
    code: CROSS_FUNCTION_ASYNC,
    expectedMitigated: false, // Conservative: can't verify cross-function
    description: 'Cross-function async requires conservative fallback',
    asyncBoundaries: 2,
    crossFunctionAsync: true,
  },
  {
    name: 'async-callback',
    code: ASYNC_CALLBACK,
    expectedMitigated: false,
    description: 'Async callback pattern is hard to track',
    asyncBoundaries: 1,
    crossFunctionAsync: true,
  },
  {
    name: 'nested-async-calls',
    code: NESTED_ASYNC_CALLS,
    expectedMitigated: false,
    description: 'Deeply nested async calls',
    asyncBoundaries: 3,
    crossFunctionAsync: true,
  },
];

/**
 * Unmitigated test cases (should still flag).
 */
export const UNMITIGATED_CASES: AsyncPatternTestCase[] = [
  {
    name: 'unmitigated-await',
    code: UNMITIGATED_AWAIT,
    expectedMitigated: false,
    description: 'No mitigation present',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
  {
    name: 'partial-mitigation-conditional',
    code: PARTIAL_MITIGATION_CONDITIONAL_AWAIT,
    expectedMitigated: false, // Partial - one branch unmitigated
    description: 'Only one branch is mitigated',
    asyncBoundaries: 2,
    crossFunctionAsync: false,
  },
  {
    name: 'mitigation-too-late',
    code: MITIGATION_TOO_LATE,
    expectedMitigated: false,
    description: 'Mitigation after dangerous operation',
    asyncBoundaries: 1,
    crossFunctionAsync: false,
  },
];
