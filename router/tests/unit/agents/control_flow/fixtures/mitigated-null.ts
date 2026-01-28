/**
 * Test Fixtures: Mitigated Null/Undefined Patterns
 *
 * Code samples demonstrating null safety patterns that should be
 * recognized as mitigations for null dereference vulnerabilities.
 */

// =============================================================================
// Optional Chaining Patterns
// =============================================================================

export const optionalChainingExample = `
interface User {
  profile?: {
    address?: {
      city?: string;
    };
  };
}

function getCity(user: User): string | undefined {
  // Optional chaining mitigates null deref
  return user.profile?.address?.city;
}
`;

export const optionalChainingMethodExample = `
interface Service {
  getData?(): string;
}

function callService(service: Service | null) {
  // Optional chaining on method call
  const result = service?.getData?.();
  return result ?? 'default';
}
`;

// =============================================================================
// Nullish Coalescing Patterns
// =============================================================================

export const nullishCoalescingExample = `
function getConfig(config: { timeout?: number } | null) {
  // Nullish coalescing provides default
  const timeout = config?.timeout ?? 5000;
  return fetch('/api', { timeout });
}
`;

export const nullishAssignmentExample = `
function initDefaults(options: { retries?: number }) {
  // Nullish assignment
  options.retries ??= 3;
  return options;
}
`;

// =============================================================================
// Explicit Null Checks
// =============================================================================

export const ifNullCheckExample = `
function processUser(user: User | null) {
  if (user === null) {
    return;
  }
  // After null check, user is safe to access
  console.log(user.name);
}
`;

export const ifNotNullCheckExample = `
function processData(data: Data | null | undefined) {
  if (data != null) {
    // After != null check, data is defined
    process(data.value);
  }
}
`;

export const ifUndefinedCheckExample = `
function getValue(obj: { value?: string }) {
  if (obj.value !== undefined) {
    // After undefined check, value exists
    return obj.value.toUpperCase();
  }
  return 'default';
}
`;

// =============================================================================
// Type Guard Patterns
// =============================================================================

export const typeofCheckExample = `
function processInput(input: unknown) {
  if (typeof input === 'string') {
    // After typeof check, input is string
    return input.toLowerCase();
  }
  return String(input);
}
`;

export const instanceofCheckExample = `
function handleError(error: unknown) {
  if (error instanceof Error) {
    // After instanceof check, error has message
    console.error(error.message);
  }
}
`;

export const customTypeGuardExample = `
interface Cat { meow(): void; }
interface Dog { bark(): void; }

function isCat(pet: Cat | Dog): pet is Cat {
  return 'meow' in pet;
}

function handlePet(pet: Cat | Dog) {
  if (isCat(pet)) {
    // After type guard, pet is Cat
    pet.meow();
  }
}
`;

// =============================================================================
// Early Return Patterns
// =============================================================================

export const earlyReturnNullExample = `
function processItem(item: Item | null): Result {
  if (!item) {
    return { error: 'No item' };
  }
  // After early return, item is not null
  return { data: item.process() };
}
`;

export const guardClauseExample = `
function calculate(a: number | null, b: number | null): number {
  if (a === null) throw new Error('a is required');
  if (b === null) throw new Error('b is required');

  // After guards, both are safe
  return a + b;
}
`;

// =============================================================================
// Assertion Functions
// =============================================================================

export const assertNotNullExample = `
function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value == null) {
    throw new Error('Value must be defined');
  }
}

function process(data: Data | null) {
  assertDefined(data);
  // After assertion, data is defined
  return data.value;
}
`;

// =============================================================================
// Negative Examples (Should Still Flag)
// =============================================================================

export const unmitigatedNullExample = `
function unsafeAccess(user: User | null) {
  // No null check - should flag potential null deref
  console.log(user.name);
}
`;

export const partialNullCheckExample = `
function partialCheck(data: Data | null) {
  if (Math.random() > 0.5) {
    if (data !== null) {
      console.log(data.value); // Protected
    }
  } else {
    console.log(data.value); // Unprotected - should flag
  }
}
`;

export const nullCheckWrongBranchExample = `
function wrongBranch(user: User | null) {
  if (user === null) {
    // This is the null branch
    console.log(user.name); // Should flag - user is definitely null here!
  }
}
`;
