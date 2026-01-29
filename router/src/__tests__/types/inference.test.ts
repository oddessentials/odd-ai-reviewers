/**
 * Type Inference Tests (T075)
 *
 * These tests verify that TypeScript's type inference works correctly
 * with the type utilities provided by this codebase.
 *
 * Note: These are compile-time tests. The assertions verify that TypeScript
 * infers the correct types without explicit annotations. If these tests
 * compile successfully, the type system is working as expected.
 */

import { describe, it, expect } from 'vitest';
import {
  Ok,
  Err,
  isOk,
  isErr,
  match,
  map,
  flatMap,
  collect,
  partition,
} from '../../types/result.js';
import type { Result, Ok as OkType, Err as ErrType } from '../../types/result.js';
import { SafeGitRefHelpers, CanonicalPathHelpers } from '../../types/branded.js';
import type { SafeGitRef, CanonicalPath, Brand } from '../../types/branded.js';

describe('Type Inference Tests', () => {
  describe('Result literal type preservation', () => {
    it('should preserve literal types with Ok', () => {
      // TypeScript 5.0+ const type parameter preserves literal types
      const result = Ok(42);

      // This verifies the structure is correct at runtime
      expect(result.ok).toBe(true);

      // Must narrow with isOk to access value (Result is a discriminated union)
      if (isOk(result)) {
        expect(result.value).toBe(42);

        // Compile-time check: result.value should be number (or 42 with const)
        // The fact that this compiles means the type system is working
        const _typeCheck: number = result.value;
        expect(_typeCheck).toBe(42);
      }
    });

    it('should preserve object literal types with Ok', () => {
      const config = Ok({ name: 'test', count: 5 });

      expect(config.ok).toBe(true);
      if (isOk(config)) {
        // Compile-time: config.value has inferred type with correct properties
        const _nameCheck: string = config.value.name;
        const _countCheck: number = config.value.count;
        expect(_nameCheck).toBe('test');
        expect(_countCheck).toBe(5);
      }
    });

    it('should work with Err and error types', () => {
      const error = new Error('test error');
      const result = Err(error);

      expect(result.ok).toBe(false);
      if (isErr(result)) {
        // Compile-time: result.error is Error type
        const _errorCheck: Error = result.error;
        expect(_errorCheck.message).toBe('test error');
      }
    });

    it('should correctly narrow types with isOk guard', () => {
      const result: Result<string, Error> = Ok('success');

      if (isOk(result)) {
        // After guard, TypeScript knows result.value exists
        const value: string = result.value;
        expect(value).toBe('success');
      }
    });

    it('should correctly narrow types with isErr guard', () => {
      const result: Result<string, Error> = Err(new Error('fail'));

      if (isErr(result)) {
        // After guard, TypeScript knows result.error exists
        const error: Error = result.error;
        expect(error.message).toBe('fail');
      }
    });
  });

  describe('Result utility type inference', () => {
    it('should infer mapped type correctly', () => {
      const result = Ok(5);
      const mapped = map(result, (x) => x * 2);

      // TypeScript infers mapped as Result<number, never>
      if (isOk(mapped)) {
        const _check: number = mapped.value;
        expect(_check).toBe(10);
      }
    });

    it('should infer flatMap type correctly', () => {
      const parse = (s: string): Result<number, Error> => {
        const n = parseInt(s, 10);
        return isNaN(n) ? Err(new Error('not a number')) : Ok(n);
      };

      const result = Ok('42');
      const flatMapped = flatMap(result, parse);

      // TypeScript infers flatMapped as Result<number, Error>
      if (isOk(flatMapped)) {
        const _check: number = flatMapped.value;
        expect(_check).toBe(42);
      }
    });

    it('should infer match return type correctly', () => {
      const result: Result<number, Error> = Ok(42);

      const message = match(result, {
        ok: (value) => `Value: ${value}`,
        err: (error) => `Error: ${error.message}`,
      });

      // TypeScript infers message as string
      const _check: string = message;
      expect(_check).toBe('Value: 42');
    });

    it('should infer collect return type correctly', () => {
      const results: Result<number, Error>[] = [Ok(1), Ok(2), Ok(3)];
      const collected = collect(results);

      // TypeScript infers collected as Result<number[], Error>
      if (isOk(collected)) {
        const _check: number[] = collected.value;
        expect(_check).toEqual([1, 2, 3]);
      }
    });

    it('should infer partition return type correctly', () => {
      const results: Result<number, string>[] = [Ok(1), Err('fail'), Ok(3)];
      const { ok, err } = partition(results);

      // TypeScript infers ok as number[], err as string[]
      const _okCheck: number[] = ok;
      const _errCheck: string[] = err;
      expect(_okCheck).toEqual([1, 3]);
      expect(_errCheck).toEqual(['fail']);
    });
  });

  describe('Branded type inference', () => {
    it('should infer SafeGitRef from successful parse', () => {
      const result = SafeGitRefHelpers.parse('main');

      if (isOk(result)) {
        // TypeScript infers result.value as SafeGitRef
        const ref: SafeGitRef = result.value;
        expect(ref).toBe('main');

        // Can use as string in operations
        const upper: string = (ref as string).toUpperCase();
        expect(upper).toBe('MAIN');
      }
    });

    it('should infer CanonicalPath from successful parse', () => {
      const result = CanonicalPathHelpers.parse('src/index.ts');

      if (isOk(result)) {
        // TypeScript infers result.value as CanonicalPath
        const path: CanonicalPath = result.value;
        expect(path).toBe('src/index.ts');
      }
    });

    it('should allow branded types in type-safe functions', () => {
      // This function requires SafeGitRef - unbranded strings won't work
      function checkout(_ref: SafeGitRef): string {
        return `git checkout ${_ref}`;
      }

      const result = SafeGitRefHelpers.parse('feature-branch');
      if (isOk(result)) {
        const cmd = checkout(result.value);
        expect(cmd).toBe('git checkout feature-branch');
      }

      // Compile-time: This would fail type checking:
      // checkout('raw-string'); // Error: string is not assignable to SafeGitRef
    });

    it('should unbrand correctly for serialization', () => {
      const result = SafeGitRefHelpers.parse('develop');
      if (isOk(result)) {
        const branded: SafeGitRef = result.value;
        const unbranded: string = SafeGitRefHelpers.unbrand(branded);

        // Can JSON serialize the unbranded value
        const json = JSON.stringify({ ref: unbranded });
        expect(json).toBe('{"ref":"develop"}');
      }
    });
  });

  describe('Generic constraint inference', () => {
    it('should infer Brand type parameters correctly', () => {
      // Type-level test: Brand<T, B> should preserve T while adding brand B
      type TestBrand = Brand<string, 'TestBrand'>;

      // The underlying type is still string
      const branded = 'test' as TestBrand;
      const length: number = branded.length;
      expect(length).toBe(4);
    });

    it('should infer Result variants correctly', () => {
      // Type-level test: Ok and Err interfaces should match Result union
      type TestOk = OkType<number>;
      type TestErr = ErrType<string>;

      // OkType should have value
      const okResult: TestOk = { ok: true, value: 42 };
      expect(okResult.value).toBe(42);

      // ErrType should have error
      const errResult: TestErr = { ok: false, error: 'fail' };
      expect(errResult.error).toBe('fail');

      // Both should be assignable to Result
      const _r1: Result<number, string> = okResult;
      const _r2: Result<number, string> = errResult;
      expect(_r1.ok).toBe(true);
      expect(_r2.ok).toBe(false);
    });
  });

  describe('Compile-time type safety', () => {
    it('should enforce discriminated union exhaustiveness', () => {
      function processResult(result: Result<string, Error>): string {
        // Using destructuring to demonstrate discriminated union narrowing
        if (result.ok) {
          // TypeScript knows: result is { ok: true, value: string }
          return result.value;
        } else {
          // TypeScript knows: result is { ok: false, error: Error }
          return result.error.message;
        }
        // No assertNever needed here because the if-else is exhaustive
      }

      expect(processResult(Ok('success'))).toBe('success');
      expect(processResult(Err(new Error('fail')))).toBe('fail');
    });

    it('should enforce branded type contracts', () => {
      // This test verifies that the type system correctly distinguishes
      // branded types from their underlying types at compile time.

      // Function that requires SafeGitRef
      function gitCheckout(ref: SafeGitRef): void {
        // TypeScript guarantees ref has been validated
        expect(typeof ref).toBe('string');
      }

      // Can only call with properly parsed ref
      const result = SafeGitRefHelpers.parse('main');
      if (isOk(result)) {
        gitCheckout(result.value); // OK
      }

      // This would be a compile error (uncommenting would fail build):
      // gitCheckout('raw-string'); // Error: string not assignable to SafeGitRef
    });
  });
});
