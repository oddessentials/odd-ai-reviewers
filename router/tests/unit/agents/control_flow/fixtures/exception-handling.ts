/**
 * Test Fixtures: Exception Handling Patterns
 *
 * Code samples demonstrating exception handling patterns that affect
 * control flow. The analyzer should understand try/catch/finally
 * blocks and how they affect reachability.
 */

// =============================================================================
// Basic Try/Catch Patterns
// =============================================================================

export const simpleTryCatchExample = `
function parseJSON(text: string) {
  try {
    return JSON.parse(text);
  } catch (error) {
    // Catch block handles parse errors
    return null;
  }
}
`;

export const tryCatchFinallyExample = `
function readFile(path: string) {
  let handle: FileHandle | null = null;
  try {
    handle = openFile(path);
    return handle.read();
  } catch (error) {
    console.error('Failed to read:', error);
    return null;
  } finally {
    // Finally always runs - cleanup
    if (handle) {
      handle.close();
    }
  }
}
`;

export const nestedTryCatchExample = `
async function fetchAndParse(url: string) {
  try {
    const response = await fetch(url);
    try {
      return await response.json();
    } catch (parseError) {
      // Inner catch for parse errors
      console.error('Parse failed:', parseError);
      return { raw: await response.text() };
    }
  } catch (fetchError) {
    // Outer catch for fetch errors
    console.error('Fetch failed:', fetchError);
    return null;
  }
}
`;

// =============================================================================
// Throwing and Rethrowing
// =============================================================================

export const throwInTryExample = `
function validateAge(age: number) {
  try {
    if (age < 0) {
      throw new Error('Age cannot be negative');
    }
    if (age > 150) {
      throw new Error('Age is unrealistic');
    }
    return { valid: true, age };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
`;

export const rethrowExample = `
function processData(data: unknown) {
  try {
    return transform(data);
  } catch (error) {
    // Log and rethrow
    console.error('Transform failed:', error);
    throw error;
  }
}
`;

export const conditionalRethrowExample = `
function handleError(error: unknown) {
  try {
    riskyOperation();
  } catch (e) {
    if (e instanceof CriticalError) {
      // Rethrow critical errors
      throw e;
    }
    // Handle non-critical errors
    return { handled: true };
  }
}
`;

// =============================================================================
// Exception Flow Control
// =============================================================================

export const catchWithReturnExample = `
function safeParse(text: string): Result {
  try {
    const data = JSON.parse(text);
    return { success: true, data };
  } catch {
    // Catch without variable binding
    return { success: false, data: null };
  }
}
`;

export const catchWithThrowExample = `
function mustParse(text: string) {
  try {
    return JSON.parse(text);
  } catch (error) {
    // Transform and rethrow
    throw new ParseError(\`Invalid JSON: \${error.message}\`);
  }
  // Unreachable - catch always throws
  console.log('Never executed');
}
`;

export const finallyWithReturnExample = `
function getResource() {
  try {
    return acquireResource();
  } finally {
    // Finally runs before return
    cleanup();
  }
}
`;

// =============================================================================
// Guards in Exception Handlers
// =============================================================================

export const guardInCatchExample = `
function handleApiError(error: unknown) {
  try {
    return callApi();
  } catch (error) {
    // Guard in catch block
    if (error instanceof ApiError) {
      return { code: error.code, message: error.message };
    }
    if (error instanceof NetworkError) {
      return { code: 'NETWORK', message: 'Connection failed' };
    }
    return { code: 'UNKNOWN', message: String(error) };
  }
}
`;

export const nullCheckInFinallyExample = `
function processWithCleanup(resource: Resource | null) {
  try {
    if (!resource) {
      throw new Error('No resource');
    }
    return resource.process();
  } finally {
    // Must check null again in finally
    if (resource) {
      resource.release();
    }
  }
}
`;

// =============================================================================
// Async Exception Handling
// =============================================================================

export const asyncTryCatchExample = `
async function fetchUser(id: string) {
  try {
    const response = await fetch(\`/users/\${id}\`);
    if (!response.ok) {
      throw new HttpError(response.status);
    }
    return await response.json();
  } catch (error) {
    if (error instanceof HttpError) {
      return { error: \`HTTP \${error.status}\` };
    }
    return { error: 'Unknown error' };
  }
}
`;

export const promiseCatchExample = `
function fetchData(url: string) {
  return fetch(url)
    .then(r => r.json())
    .catch(error => {
      console.error('Fetch failed:', error);
      return null;
    });
}
`;

export const asyncFinallyExample = `
async function withTransaction(operation: () => Promise<void>) {
  const tx = await beginTransaction();
  try {
    await operation();
    await tx.commit();
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    await tx.close();
  }
}
`;

// =============================================================================
// Edge Cases
// =============================================================================

export const emptyTryBlockExample = `
function emptyTry() {
  try {
    // Empty try block
  } catch {
    return 'caught';
  }
  return 'normal';
}
`;

export const emptyCatchBlockExample = `
function silentCatch(fn: () => void) {
  try {
    fn();
  } catch {
    // Intentionally empty - suppress errors
  }
}
`;

export const multipleReturnsInTryExample = `
function multiReturn(value: number) {
  try {
    if (value < 0) {
      return 'negative';
    }
    if (value === 0) {
      return 'zero';
    }
    return 'positive';
  } catch {
    return 'error';
  }
}
`;

// =============================================================================
// Negative Examples (Should Flag Issues)
// =============================================================================

export const uncaughtNullExample = `
function unsafeInTry(data: Data | null) {
  try {
    // No null check - should flag
    return data.process();
  } catch (error) {
    return null;
  }
}
`;

export const catchDoesntProtectExample = `
function catchNoHelp(value: string | null) {
  try {
    console.log('trying');
  } catch {
    // Catch doesn't help with null outside try
  }
  // Should flag - no protection
  return value.length;
}
`;

export const finallyDoesntGuardExample = `
function finallyNoGuard(resource: Resource | null) {
  try {
    doSomething();
  } finally {
    // Finally doesn't establish guard for code after
  }
  // Should flag - resource might be null
  return resource.getValue();
}
`;
