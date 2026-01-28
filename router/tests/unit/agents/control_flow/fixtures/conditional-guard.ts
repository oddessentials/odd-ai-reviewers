/**
 * Test Fixtures: Conditional Guard Patterns
 *
 * Code samples demonstrating conditional guards that establish invariants
 * for subsequent code. The analyzer should track these conditions to
 * avoid false positives in guarded branches.
 */

// =============================================================================
// Type Narrowing Guards
// =============================================================================

export const typeofGuardExample = `
function processValue(value: unknown) {
  if (typeof value === 'string') {
    // Inside this block, value is narrowed to string
    return value.toUpperCase();
  }

  if (typeof value === 'number') {
    // Inside this block, value is narrowed to number
    return value.toFixed(2);
  }

  return String(value);
}
`;

export const instanceofGuardExample = `
function handleError(error: unknown) {
  if (error instanceof TypeError) {
    // Narrowed to TypeError
    console.error('Type error:', error.message);
    return { type: 'type', message: error.message };
  }

  if (error instanceof RangeError) {
    // Narrowed to RangeError
    console.error('Range error:', error.message);
    return { type: 'range', message: error.message };
  }

  if (error instanceof Error) {
    // Narrowed to Error
    return { type: 'generic', message: error.message };
  }

  return { type: 'unknown', message: String(error) };
}
`;

export const inOperatorGuardExample = `
interface Dog { bark(): void; }
interface Cat { meow(): void; }

function handlePet(pet: Dog | Cat) {
  if ('bark' in pet) {
    // Narrowed to Dog
    pet.bark();
  } else {
    // Narrowed to Cat
    pet.meow();
  }
}
`;

// =============================================================================
// Null/Undefined Guards
// =============================================================================

export const strictNullGuardExample = `
function processOptional(value: string | null) {
  if (value !== null) {
    // value is string here
    return value.length;
  }
  return 0;
}
`;

export const loosyNullGuardExample = `
function processNullish(value: string | null | undefined) {
  if (value != null) {
    // value is string here (excludes both null and undefined)
    return value.trim();
  }
  return '';
}
`;

export const truthyGuardExample = `
function processIfTruthy(value: string | null | undefined) {
  if (value) {
    // value is truthy string (not null, undefined, or empty)
    return value.split(',');
  }
  return [];
}
`;

export const negatedNullGuardExample = `
function processNotNull(items: string[] | null) {
  if (!items) {
    return [];
  }

  // items is string[] here
  return items.filter(Boolean);
}
`;

// =============================================================================
// Compound Guards
// =============================================================================

export const andGuardExample = `
function processUserData(user: User | null, data: Data | undefined) {
  if (user && data) {
    // Both user and data are defined
    return { userId: user.id, dataValue: data.value };
  }
  return null;
}
`;

export const orGuardWithDefaultExample = `
function getName(user: { name?: string } | null) {
  // Short-circuit provides default
  const name = user?.name || 'Unknown';
  return name.toUpperCase(); // Safe - always string
}
`;

export const nestedConditionGuardExample = `
function deepAccess(obj: { a?: { b?: { c: string } } } | null) {
  if (obj && obj.a && obj.a.b) {
    // All levels verified
    return obj.a.b.c;
  }
  return 'default';
}
`;

// =============================================================================
// Guards in Different Control Structures
// =============================================================================

export const ternaryGuardExample = `
function safeDivide(a: number, b: number | null) {
  // Ternary with guard
  return b !== null && b !== 0 ? a / b : 0;
}
`;

export const shortCircuitGuardExample = `
function getLength(arr: string[] | null) {
  // Short-circuit evaluation acts as guard
  return arr && arr.length;
}
`;

export const optionalChainingGuardExample = `
function getCity(user: { address?: { city?: string } } | null) {
  // Optional chaining provides implicit guards
  return user?.address?.city ?? 'Unknown';
}
`;

// =============================================================================
// Guards with Assertions
// =============================================================================

export const assertionFunctionExample = `
function assertDefined<T>(value: T | null | undefined): asserts value is T {
  if (value == null) {
    throw new Error('Value is null or undefined');
  }
}

function processWithAssertion(data: Data | null) {
  assertDefined(data);
  // After assertion, data is Data (not null)
  return data.process();
}
`;

export const customTypeGuardExample = `
function isValidUser(user: unknown): user is User {
  return (
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    'name' in user
  );
}

function processUser(input: unknown) {
  if (isValidUser(input)) {
    // input is User here
    return { id: input.id, name: input.name };
  }
  return null;
}
`;

// =============================================================================
// Negative Examples (Guards Don't Protect)
// =============================================================================

export const wrongBranchExample = `
function wrongBranch(value: string | null) {
  if (value === null) {
    // We're in the null branch - should flag
    return value.length;
  }
  return 0;
}
`;

export const guardNotOnPathExample = `
function guardNotOnPath(value: string | null, flag: boolean) {
  if (flag) {
    if (value !== null) {
      console.log('has value');
    }
  }

  // Guard was in different branch - should flag
  return value.length;
}
`;

export const guardResetExample = `
function guardReset(value: string | null) {
  if (value !== null) {
    value = getValue(); // Reassignment may return null
  }

  // Guard no longer valid after reassignment - should flag
  return value.length;
}
`;

export const loopInvalidatesGuardExample = `
function loopInvalidates(items: (string | null)[]) {
  let current = items[0];

  if (current !== null) {
    for (let i = 1; i < items.length; i++) {
      // Loop may reassign to null
      current = items[i];
    }
    // Guard no longer valid - should flag
    return current.length;
  }

  return 0;
}
`;
