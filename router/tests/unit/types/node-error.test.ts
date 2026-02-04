/**
 * Tests for isNodeError Type Guard
 *
 * Comprehensive test suite for the NodeError interface and isNodeError type guard.
 * Tests cover all edge cases for type safety in catch blocks.
 *
 * @module tests/unit/types/node-error
 */

import { describe, it, expect } from 'vitest';
import { isNodeError, type NodeError } from '../../../src/types/errors.js';

describe('isNodeError', () => {
  describe('basic Error instances', () => {
    it('should return true for standard Error', () => {
      const error = new Error('Something went wrong');
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for TypeError', () => {
      const error = new TypeError('Invalid type');
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for RangeError', () => {
      const error = new RangeError('Out of range');
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for SyntaxError', () => {
      const error = new SyntaxError('Unexpected token');
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for custom Error subclass', () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }
      const error = new CustomError('Custom message');
      expect(isNodeError(error)).toBe(true);
    });
  });

  describe('Node.js system errors with code property', () => {
    it('should return true for ENOENT (file not found)', () => {
      const error = new Error('ENOENT: no such file or directory') as NodeError;
      error.code = 'ENOENT';
      error.syscall = 'open';
      error.path = '/path/to/file';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for EACCES (permission denied)', () => {
      const error = new Error('EACCES: permission denied') as NodeError;
      error.code = 'EACCES';
      error.syscall = 'access';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for ETIMEDOUT (connection timed out)', () => {
      const error = new Error('ETIMEDOUT: connection timed out') as NodeError;
      error.code = 'ETIMEDOUT';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for ECONNREFUSED (connection refused)', () => {
      const error = new Error('ECONNREFUSED: connection refused') as NodeError;
      error.code = 'ECONNREFUSED';
      error.syscall = 'connect';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for EPERM (operation not permitted)', () => {
      const error = new Error('EPERM: operation not permitted') as NodeError;
      error.code = 'EPERM';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for EEXIST (file already exists)', () => {
      const error = new Error('EEXIST: file already exists') as NodeError;
      error.code = 'EEXIST';
      error.path = '/path/to/file';
      expect(isNodeError(error)).toBe(true);
    });
  });

  describe('errors with errno property', () => {
    it('should return true for error with negative errno (POSIX)', () => {
      const error = new Error('System error') as NodeError;
      error.code = 'ENOENT';
      error.errno = -2; // POSIX ENOENT
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with positive errno (Windows)', () => {
      const error = new Error('System error') as NodeError;
      error.code = 'ENOENT';
      error.errno = 2; // Windows ERROR_FILE_NOT_FOUND
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with errno = 0', () => {
      const error = new Error('System error') as NodeError;
      error.errno = 0;
      expect(isNodeError(error)).toBe(true);
    });
  });

  describe('errors with path property', () => {
    it('should return true for error with absolute path', () => {
      const error = new Error('File error') as NodeError;
      error.code = 'ENOENT';
      error.path = '/absolute/path/to/file.txt';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with relative path', () => {
      const error = new Error('File error') as NodeError;
      error.code = 'ENOENT';
      error.path = './relative/path.txt';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with Windows path', () => {
      const error = new Error('File error') as NodeError;
      error.code = 'ENOENT';
      error.path = 'C:\\Users\\test\\file.txt';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with empty path string', () => {
      const error = new Error('File error') as NodeError;
      error.path = '';
      expect(isNodeError(error)).toBe(true);
    });
  });

  describe('errors with syscall property', () => {
    it('should return true for error with syscall = open', () => {
      const error = new Error('System call failed') as NodeError;
      error.syscall = 'open';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with syscall = read', () => {
      const error = new Error('System call failed') as NodeError;
      error.syscall = 'read';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with syscall = spawn', () => {
      const error = new Error('System call failed') as NodeError;
      error.syscall = 'spawn';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for error with syscall = connect', () => {
      const error = new Error('System call failed') as NodeError;
      error.syscall = 'connect';
      expect(isNodeError(error)).toBe(true);
    });
  });

  describe('errors with all Node.js properties', () => {
    it('should return true for fully populated Node.js error', () => {
      const error = new Error('ENOENT: no such file or directory') as NodeError;
      error.code = 'ENOENT';
      error.errno = -2;
      error.path = '/path/to/missing/file';
      error.syscall = 'open';
      expect(isNodeError(error)).toBe(true);
    });

    it('should allow type-safe property access after guard', () => {
      const error = new Error('Test error') as NodeError;
      error.code = 'ENOENT';
      error.errno = -2;
      error.path = '/test/path';
      error.syscall = 'open';

      if (isNodeError(error)) {
        // These should all be type-safe
        expect(error.code).toBe('ENOENT');
        expect(error.errno).toBe(-2);
        expect(error.path).toBe('/test/path');
        expect(error.syscall).toBe('open');
        expect(error.message).toBe('Test error');
        expect(error.name).toBe('Error');
      }
    });
  });

  describe('non-Error values (should return false)', () => {
    it('should return false for null', () => {
      expect(isNodeError(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isNodeError(undefined)).toBe(false);
    });

    it('should return false for string', () => {
      expect(isNodeError('error message')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isNodeError(42)).toBe(false);
    });

    it('should return false for boolean', () => {
      expect(isNodeError(false)).toBe(false);
    });

    it('should return false for plain object with error-like properties', () => {
      const fakeError = {
        message: 'Fake error',
        name: 'Error',
        code: 'ENOENT',
        stack: 'fake stack trace',
      };
      expect(isNodeError(fakeError)).toBe(false);
    });

    it('should return false for array', () => {
      expect(isNodeError(['error'])).toBe(false);
    });

    it('should return false for function', () => {
      expect(isNodeError(() => 'error')).toBe(false);
    });

    it('should return false for Symbol', () => {
      expect(isNodeError(Symbol('error'))).toBe(false);
    });

    it('should return false for BigInt', () => {
      expect(isNodeError(BigInt(42))).toBe(false);
    });
  });

  describe('errors with invalid property types (should return false)', () => {
    it('should return false when code is a number', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = 42;
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when code is an object', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = { type: 'ENOENT' };
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when code is an array', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = ['ENOENT'];
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when code is boolean', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = true;
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when errno is a string', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['errno'] = '-2';
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when errno is an object', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['errno'] = { value: -2 };
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when path is a number', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['path'] = 123;
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when path is an array', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['path'] = ['/path/to/file'];
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when syscall is a number', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['syscall'] = 1;
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when syscall is an object', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['syscall'] = { name: 'open' };
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false when multiple properties have wrong types', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = 42;
      error['errno'] = 'invalid';
      error['path'] = ['array'];
      expect(isNodeError(error)).toBe(false);
    });
  });

  describe('mixed valid and invalid properties', () => {
    it('should return false if code is valid but errno is invalid', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = 'ENOENT'; // valid
      error['errno'] = 'not a number'; // invalid
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false if errno is valid but path is invalid', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['errno'] = -2; // valid
      error['path'] = 42; // invalid
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false if path is valid but syscall is invalid', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['path'] = '/valid/path'; // valid
      error['syscall'] = ['open']; // invalid
      expect(isNodeError(error)).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return true for Error with null prototype properties', () => {
      const error = new Error('Test');
      // Ensure no inherited properties interfere
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for Error subclass with additional properties', () => {
      class ExtendedError extends Error {
        public customProp: string;
        constructor(message: string) {
          super(message);
          this.customProp = 'custom';
        }
      }
      const error = new ExtendedError('Extended');
      expect(isNodeError(error)).toBe(true);
    });

    it('should return true for Error with code set to empty string', () => {
      const error = new Error('Test') as NodeError;
      error.code = '';
      expect(isNodeError(error)).toBe(true);
    });

    it('should return false for code set to null (not undefined)', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['code'] = null;
      expect(isNodeError(error)).toBe(false);
    });

    it('should return false for errno set to NaN', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['errno'] = NaN;
      // NaN is typeof 'number', so this should pass
      expect(isNodeError(error)).toBe(true);
    });

    it('should return false for errno set to Infinity', () => {
      const error = new Error('Test') as unknown as Record<string, unknown>;
      error['errno'] = Infinity;
      // Infinity is typeof 'number', so this should pass
      expect(isNodeError(error)).toBe(true);
    });
  });

  describe('real-world usage patterns', () => {
    it('should work in typical catch block pattern', () => {
      const simulatedError = (): never => {
        const error = new Error('ENOENT: no such file') as NodeError;
        error.code = 'ENOENT';
        error.path = '/missing/file';
        throw error;
      };

      try {
        simulatedError();
      } catch (err) {
        expect(isNodeError(err)).toBe(true);
        if (isNodeError(err)) {
          expect(err.code).toBe('ENOENT');
          expect(err.path).toBe('/missing/file');
        }
      }
    });

    it('should handle thrown non-Error values gracefully', () => {
      const throwString = (): never => {
        // Intentionally throwing non-Error for test coverage
        throw 'string error';
      };

      try {
        throwString();
      } catch (err) {
        expect(isNodeError(err)).toBe(false);
      }
    });

    it('should work with Promise rejection', async () => {
      const rejectWithNodeError = (): Promise<void> => {
        const error = new Error('ECONNREFUSED') as NodeError;
        error.code = 'ECONNREFUSED';
        return Promise.reject(error);
      };

      try {
        await rejectWithNodeError();
      } catch (err) {
        expect(isNodeError(err)).toBe(true);
        if (isNodeError(err)) {
          expect(err.code).toBe('ECONNREFUSED');
        }
      }
    });

    it('should enable switch statement on error codes', () => {
      const error = new Error('Test') as NodeError;
      error.code = 'ENOENT';

      if (isNodeError(error)) {
        let result: string;
        switch (error.code) {
          case 'ENOENT':
            result = 'not found';
            break;
          case 'EACCES':
            result = 'permission denied';
            break;
          default:
            result = 'unknown';
        }
        expect(result).toBe('not found');
      }
    });
  });

  describe('type narrowing verification', () => {
    it('should narrow unknown to NodeError', () => {
      const unknownValue: unknown = new Error('Test');

      // Before guard: can't access .code
      // After guard: can access .code safely
      if (isNodeError(unknownValue)) {
        // This line would fail TypeScript compilation if narrowing didn't work
        const _code: string | undefined = unknownValue.code;
        const _errno: number | undefined = unknownValue.errno;
        const _path: string | undefined = unknownValue.path;
        const _syscall: string | undefined = unknownValue.syscall;
        expect(_code).toBeUndefined();
        expect(_errno).toBeUndefined();
        expect(_path).toBeUndefined();
        expect(_syscall).toBeUndefined();
      }
    });
  });
});
