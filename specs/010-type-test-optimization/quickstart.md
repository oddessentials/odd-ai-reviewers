# Quickstart: Type and Test Optimization

**Feature**: 010-type-test-optimization
**Date**: 2026-01-29

## Overview

This guide explains how to use the new type utilities introduced by this feature.

## Prerequisites

- Node.js >=22.0.0
- TypeScript 5.9.x
- pnpm 10.x

## Installation

No new dependencies required. All type utilities are internal to the codebase.

## Quick Examples

### 1. Using Custom Errors

```typescript
import { ConfigError, ConfigErrorCode, AgentError } from './types/errors.js';

// Create a config error with context
throw new ConfigError('Invalid agent configuration', ConfigErrorCode.INVALID_VALUE, {
  field: 'passes[0].agents',
  expected: 'array',
  actual: typeof value,
});

// Wrap an existing error as cause
try {
  loadConfig();
} catch (error) {
  throw new ConfigError(
    'Failed to load configuration',
    ConfigErrorCode.PARSE_ERROR,
    { path: configPath },
    { cause: error instanceof Error ? error : new Error(String(error)) }
  );
}

// Serialize for logging/transmission
const wireFormat = error.toWireFormat();
console.log(JSON.stringify(wireFormat));

// Deserialize from wire format
const restored = ConfigError.fromWireFormat(wireFormat);
```

### 2. Using Result Type

```typescript
import { Result, Ok, Err, isOk, isErr, match, wrapThrowing } from './types/result.js';
import { ValidationError, ValidationErrorCode } from './types/errors.js';

// Return Result instead of throwing
function parseConfig(input: string): Result<Config, ValidationError> {
  const result = ConfigSchema.safeParse(JSON.parse(input));
  if (result.success) {
    return Ok(result.data);
  }
  return Err(
    new ValidationError('Invalid config format', ValidationErrorCode.INVALID_INPUT, {
      field: 'config',
      value: input,
    })
  );
}

// Pattern match on result
const config = match(parseConfig(input), {
  ok: (value) => value,
  err: (error) => {
    console.error(`Config error: ${error.message}`);
    return defaultConfig;
  },
});

// Backward-compatible wrapper for public API
export const loadConfig = wrapThrowing(loadConfigInternal);
// loadConfig throws on error (existing behavior)
// loadConfigInternal returns Result (new pattern)
```

### 3. Using Branded Types

```typescript
import { SafeGitRef, SafeGitRefHelpers } from './types/branded.js';
import { isOk } from './types/result.js';

// Parse user input to branded type
const result = SafeGitRefHelpers.parse(userInput);
if (!isOk(result)) {
  throw result.error; // ValidationError with details
}
const ref: SafeGitRef = result.value;

// Use in type-safe function
function checkout(ref: SafeGitRef): void {
  // Compiler guarantees ref is validated
  execFileSync('git', ['checkout', ref]);
}

// Serialize for cache/JSON
const plain: string = SafeGitRefHelpers.unbrand(ref);
await cache.set('lastRef', plain);

// Deserialize from cache
const cached = await cache.get('lastRef');
const restoredResult = SafeGitRefHelpers.parse(cached);
```

### 4. Using Discriminated Unions

```typescript
import { AgentResult, assertNever } from './types/index.js';

function processResult(result: AgentResult): void {
  switch (result.status) {
    case 'success':
      // TypeScript knows: result.findings exists
      processFindings(result.findings);
      break;
    case 'failure':
      // TypeScript knows: result.error exists
      logError(result.error);
      break;
    case 'skipped':
      // TypeScript knows: result.reason exists
      console.log(`Skipped: ${result.reason}`);
      break;
    default:
      // Compile error if any case is missing
      assertNever(result);
  }
}
```

### 5. Writing Hermetic Tests

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setupHermeticTest, teardownHermeticTest } from './test-utils/hermetic.js';

describe('MyFeature', () => {
  beforeEach(() => {
    setupHermeticTest();
  });

  afterEach(() => {
    teardownHermeticTest();
  });

  it('should work with frozen time', () => {
    // Time is frozen at 2026-01-29T00:00:00Z
    const now = new Date();
    expect(now.toISOString()).toBe('2026-01-29T00:00:00.000Z');
  });

  it('should work with stubbed network', async () => {
    // Network calls return mocked responses
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ status: 'ok' })));

    const result = await callApi();
    expect(result.status).toBe('ok');
  });
});
```

### 6. Testing Entry Points

```typescript
import { describe, it, expect, vi } from 'vitest';
import { run } from '../main.js';

describe('main entry point', () => {
  it('should run with valid arguments', async () => {
    const mockExit = vi.fn();
    const exitCode = await run(
      ['node', 'main.js', 'review', '--repo', '/path/to/repo'],
      { GITHUB_TOKEN: 'test-token' },
      { exit: mockExit }
    );

    expect(exitCode).toBe(0);
    expect(mockExit).not.toHaveBeenCalled();
  });

  it('should handle missing arguments', async () => {
    const exitCode = await run(['node', 'main.js', 'review'], {}, { exit: vi.fn() });

    expect(exitCode).toBe(1);
  });
});
```

## Migration Guide

### Converting Error Handling

**Before:**

```typescript
try {
  const config = loadConfig();
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : 'Unknown'}`);
}
```

**After:**

```typescript
import { isConfigError } from './types/errors.js';

try {
  const config = loadConfig();
} catch (error) {
  if (isConfigError(error)) {
    console.error(`Config error [${error.code}]: ${error.message}`);
    console.error(`Context: ${JSON.stringify(error.context)}`);
    if (error.cause) {
      console.error(`Caused by: ${error.cause.message}`);
    }
  } else {
    throw error; // Re-throw unexpected errors
  }
}
```

### Converting to Result Pattern

**Before:**

```typescript
export function parseInput(input: string): ParsedInput {
  if (!input) {
    throw new Error('Input is required');
  }
  // ... parsing logic
  return parsed;
}
```

**After:**

```typescript
// Internal function uses Result
function parseInputInternal(input: string): Result<ParsedInput, ValidationError> {
  if (!input) {
    return Err(
      new ValidationError('Input is required', ValidationErrorCode.INVALID_INPUT, {
        field: 'input',
      })
    );
  }
  // ... parsing logic
  return Ok(parsed);
}

// Public API maintains backward compatibility
export const parseInput = wrapThrowing(parseInputInternal);
```

### Adding Branded Types to Existing Functions

**Before:**

```typescript
function checkoutBranch(ref: string): void {
  assertSafeGitRef(ref); // Runtime check
  execFileSync('git', ['checkout', ref]);
}
```

**After:**

```typescript
function checkoutBranch(ref: SafeGitRef): void {
  // No runtime check needed - type guarantees validation
  execFileSync('git', ['checkout', ref]);
}

// Caller must validate
const result = SafeGitRefHelpers.parse(userInput);
if (isOk(result)) {
  checkoutBranch(result.value);
}
```

## Common Patterns

### Error Chaining

```typescript
function loadAndValidateConfig(path: string): Result<ValidatedConfig, ConfigError> {
  const loadResult = loadConfig(path);
  if (isErr(loadResult)) {
    return Err(
      new ConfigError(
        'Failed to load config',
        ConfigErrorCode.FILE_NOT_FOUND,
        { path },
        { cause: loadResult.error }
      )
    );
  }

  const validateResult = validateConfig(loadResult.value);
  if (isErr(validateResult)) {
    return Err(
      new ConfigError(
        'Config validation failed',
        ConfigErrorCode.INVALID_SCHEMA,
        { path },
        { cause: validateResult.error }
      )
    );
  }

  return Ok(ValidatedConfigHelpers.brand(validateResult.value));
}
```

### Collecting Multiple Results

```typescript
import { collect, partition } from './types/result.js';

// Fail on first error
const results = files.map((f) => processFile(f));
const allOrNone = collect(results);
if (isErr(allOrNone)) {
  console.error('Failed:', allOrNone.error);
}

// Continue with partial success
const { ok: successes, err: failures } = partition(results);
console.log(`Processed ${successes.length}, failed ${failures.length}`);
```

## FAQ

**Q: Why branded types instead of runtime validation everywhere?**

A: Branded types shift validation to type-level, catching errors at compile time instead of runtime. Once you have a `SafeGitRef`, you never need to re-validate it.

**Q: Can I still use `as` casting for branded types?**

A: No. Direct casting (`value as SafeGitRef`) is forbidden. Use the helpers: `SafeGitRefHelpers.parse(value)` or `SafeGitRefHelpers.brand(value)` (internal only).

**Q: How do I serialize branded types for JSON/cache?**

A: Use `unbrand()` to strip the brand before serialization, and `parse()` to re-validate and re-brand after deserialization.

**Q: Do I need to convert all functions to Result?**

A: No. Result is for internal use. Public APIs maintain throwing behavior via `wrapThrowing()` for backward compatibility.

**Q: Why is assertNever in the default branch required?**

A: It ensures the compiler catches missing cases. Without it, adding a new variant to a discriminated union won't cause compile errors in existing switches.
