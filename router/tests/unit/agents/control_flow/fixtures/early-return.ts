/**
 * Test Fixtures: Early Return Patterns
 *
 * Code samples demonstrating early return patterns that affect control flow.
 * These patterns should cause the analyzer to recognize unreachable code
 * and correctly identify which paths need mitigation.
 */

// =============================================================================
// Guard Clauses with Early Return
// =============================================================================

export const guardClauseExample = `
function processUser(user: User | null) {
  // Guard clause - early return if null
  if (!user) {
    return { error: 'User not found' };
  }

  // After guard, user is guaranteed to exist
  // This code should NOT flag null_deref
  return { name: user.name, email: user.email };
}
`;

export const multipleGuardClausesExample = `
function validateInput(data: unknown) {
  // Guard 1: type check
  if (typeof data !== 'object' || data === null) {
    return { valid: false, error: 'Not an object' };
  }

  // Guard 2: required field check
  if (!('name' in data)) {
    return { valid: false, error: 'Missing name' };
  }

  // Guard 3: type validation
  if (typeof (data as any).name !== 'string') {
    return { valid: false, error: 'Name must be string' };
  }

  // After all guards, data is validated
  return { valid: true, value: data };
}
`;

export const nestedGuardExample = `
function getNestedValue(obj: { a?: { b?: { c?: string } } } | null) {
  if (!obj) return undefined;
  if (!obj.a) return undefined;
  if (!obj.a.b) return undefined;

  // All guards passed - safe to access
  return obj.a.b.c;
}
`;

// =============================================================================
// Early Return with Error Handling
// =============================================================================

export const errorCheckReturnExample = `
async function fetchData(url: string) {
  const response = await fetch(url);

  // Early return on error
  if (!response.ok) {
    return { error: \`HTTP \${response.status}\` };
  }

  // Only reached if response is ok
  const data = await response.json();
  return { data };
}
`;

export const throwOnErrorExample = `
function divideNumbers(a: number, b: number) {
  // Early throw prevents division by zero
  if (b === 0) {
    throw new Error('Division by zero');
  }

  // Safe to divide after check
  return a / b;
}
`;

export const assertAndReturnExample = `
function processArray(items: unknown) {
  if (!Array.isArray(items)) {
    throw new TypeError('Expected array');
  }

  if (items.length === 0) {
    return [];
  }

  // Items is guaranteed to be non-empty array
  return items.map(item => process(item));
}
`;

// =============================================================================
// Conditional Early Return
// =============================================================================

export const conditionalReturnExample = `
function getDisplayName(user: User) {
  // Return early for special cases
  if (user.isAnonymous) {
    return 'Anonymous';
  }

  if (user.nickname) {
    return user.nickname;
  }

  // Fallback to full name
  return \`\${user.firstName} \${user.lastName}\`;
}
`;

export const switchWithReturnExample = `
function handleCommand(cmd: Command) {
  switch (cmd.type) {
    case 'create':
      return handleCreate(cmd.payload);
    case 'update':
      return handleUpdate(cmd.payload);
    case 'delete':
      return handleDelete(cmd.payload);
    default:
      // Early return for unknown command
      return { error: 'Unknown command' };
  }
  // This code is unreachable
  console.log('Should never execute');
}
`;

// =============================================================================
// Early Return in Async Functions
// =============================================================================

export const asyncGuardExample = `
async function loadUserProfile(userId: string | null) {
  // Early return for missing userId
  if (!userId) {
    return null;
  }

  // Early return if not authenticated
  if (!isAuthenticated()) {
    return { error: 'Not authenticated' };
  }

  // Safe to fetch after guards
  const profile = await fetchProfile(userId);
  return profile;
}
`;

export const awaitWithEarlyReturnExample = `
async function processDocument(docId: string) {
  const doc = await getDocument(docId);

  // Early return if document not found
  if (!doc) {
    return { status: 'not_found' };
  }

  // Early return if document locked
  if (doc.isLocked) {
    return { status: 'locked', lockedBy: doc.lockedBy };
  }

  // Document exists and is not locked
  await updateDocument(doc);
  return { status: 'success' };
}
`;

// =============================================================================
// Negative Examples (Should Flag Issues)
// =============================================================================

export const missingGuardExample = `
function unsafeAccess(user: User | null) {
  // Missing guard clause - should flag null_deref
  return user.name;
}
`;

export const incompleteGuardExample = `
function partialGuard(data: { a?: { b?: string } } | null) {
  if (!data) return null;

  // Guards data but not data.a - should flag null_deref on data.a.b
  return data.a.b;
}
`;

export const guardAfterAccessExample = `
function wrongOrderGuard(user: User | null) {
  // Access before guard - should flag
  const name = user.name;

  if (!user) {
    return null;
  }

  return name;
}
`;

export const conditionalGuardMissingPathExample = `
function conditionallyGuarded(user: User | null, check: boolean) {
  if (check) {
    if (!user) return null;
    return user.name; // Protected
  }

  // Unprotected path - should flag
  return user.email;
}
`;
