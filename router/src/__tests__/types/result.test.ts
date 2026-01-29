/**
 * Result Type Tests
 *
 * Tests for:
 * - Result type narrowing (T040)
 * - Result utilities (T041)
 * - wrapThrowing backward compatibility (T042)
 */

import { describe, it, expect } from 'vitest';
import {
  Ok,
  Err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  map,
  mapErr,
  flatMap,
  match,
  collect,
  partition,
  fromPromise,
  toPromise,
  wrapThrowing,
  wrapThrowingAsync,
  tryCatch,
  tryCatchAsync,
  type Result,
} from '../../types/result.js';

describe('Result Type', () => {
  describe('Constructors', () => {
    it('Ok creates a success result', () => {
      const result = Ok(42);
      expect(result.ok).toBe(true);
      expect((result as { value: number }).value).toBe(42);
    });

    it('Err creates a failure result', () => {
      const error = new Error('test');
      const result = Err(error);
      expect(result.ok).toBe(false);
      expect((result as { error: Error }).error).toBe(error);
    });
  });

  describe('Type Narrowing (T040)', () => {
    it('isOk narrows to success type', () => {
      const result: Result<number, Error> = Ok(42);

      if (isOk(result)) {
        // TypeScript knows result.value exists
        expect(result.value).toBe(42);
      } else {
        // Should not reach here
        expect.fail('Should be Ok');
      }
    });

    it('isErr narrows to failure type', () => {
      const error = new Error('test');
      const result: Result<number, Error> = Err(error);

      if (isErr(result)) {
        // TypeScript knows result.error exists
        expect(result.error).toBe(error);
      } else {
        // Should not reach here
        expect.fail('Should be Err');
      }
    });

    it('type guards are mutually exclusive', () => {
      const okResult: Result<number, Error> = Ok(42);
      const errResult: Result<number, Error> = Err(new Error('test'));

      expect(isOk(okResult)).toBe(true);
      expect(isErr(okResult)).toBe(false);

      expect(isOk(errResult)).toBe(false);
      expect(isErr(errResult)).toBe(true);
    });
  });

  describe('Result Utilities (T041)', () => {
    describe('unwrap', () => {
      it('returns value for Ok', () => {
        const result = Ok(42);
        expect(unwrap(result)).toBe(42);
      });

      it('throws for Err', () => {
        const error = new Error('test error');
        const result = Err(error);
        expect(() => unwrap(result)).toThrow('test error');
      });
    });

    describe('unwrapOr', () => {
      it('returns value for Ok', () => {
        const result: Result<number, Error> = Ok(42);
        expect(unwrapOr(result, 0)).toBe(42);
      });

      it('returns default for Err', () => {
        const result: Result<number, Error> = Err(new Error());
        expect(unwrapOr(result, 0)).toBe(0);
      });
    });

    describe('unwrapOrElse', () => {
      it('returns value for Ok', () => {
        const result: Result<number, Error> = Ok(42);
        expect(unwrapOrElse(result, () => 0)).toBe(42);
      });

      it('calls fn with error for Err', () => {
        const result: Result<number, Error> = Err(new Error('test'));
        const defaultFn = (e: Error) => e.message.length;
        expect(unwrapOrElse(result, defaultFn)).toBe(4); // "test".length
      });
    });

    describe('map', () => {
      it('transforms Ok value', () => {
        const result: Result<number, Error> = Ok(5);
        const mapped = map(result, (x) => x * 2);

        expect(isOk(mapped)).toBe(true);
        if (isOk(mapped)) {
          expect(mapped.value).toBe(10);
        }
      });

      it('passes through Err', () => {
        const error = new Error('test');
        const result: Result<number, Error> = Err(error);
        const mapped = map(result, (x) => x * 2);

        expect(isErr(mapped)).toBe(true);
        if (isErr(mapped)) {
          expect(mapped.error).toBe(error);
        }
      });
    });

    describe('mapErr', () => {
      it('passes through Ok', () => {
        const result: Result<number, Error> = Ok(42);
        const mapped = mapErr(result, (e) => new Error(`wrapped: ${e.message}`));

        expect(isOk(mapped)).toBe(true);
        if (isOk(mapped)) {
          expect(mapped.value).toBe(42);
        }
      });

      it('transforms Err', () => {
        const result: Result<number, Error> = Err(new Error('original'));
        const mapped = mapErr(result, (e) => new Error(`wrapped: ${e.message}`));

        expect(isErr(mapped)).toBe(true);
        if (isErr(mapped)) {
          expect(mapped.error.message).toBe('wrapped: original');
        }
      });
    });

    describe('flatMap', () => {
      it('chains Ok operations', () => {
        const result: Result<number, Error> = Ok(5);
        const chained = flatMap(result, (x) => (x > 0 ? Ok(x * 2) : Err(new Error('negative'))));

        expect(isOk(chained)).toBe(true);
        if (isOk(chained)) {
          expect(chained.value).toBe(10);
        }
      });

      it('short-circuits on first Err', () => {
        const result: Result<number, Error> = Err(new Error('first'));
        const chained = flatMap(result, (x) => Ok(x * 2));

        expect(isErr(chained)).toBe(true);
        if (isErr(chained)) {
          expect(chained.error.message).toBe('first');
        }
      });

      it('returns Err from chain function', () => {
        const result: Result<number, Error> = Ok(-5);
        const chained = flatMap(result, (x) =>
          x > 0 ? Ok(x * 2) : Err(new Error('must be positive'))
        );

        expect(isErr(chained)).toBe(true);
        if (isErr(chained)) {
          expect(chained.error.message).toBe('must be positive');
        }
      });
    });

    describe('match', () => {
      it('calls ok handler for Ok', () => {
        const result: Result<number, Error> = Ok(42);
        const value = match(result, {
          ok: (v) => `value: ${v}`,
          err: (e) => `error: ${e.message}`,
        });

        expect(value).toBe('value: 42');
      });

      it('calls err handler for Err', () => {
        const result: Result<number, Error> = Err(new Error('failed'));
        const value = match(result, {
          ok: (v) => `value: ${v}`,
          err: (e) => `error: ${e.message}`,
        });

        expect(value).toBe('error: failed');
      });
    });

    describe('collect', () => {
      it('collects all Ok values', () => {
        const results: Result<number, Error>[] = [Ok(1), Ok(2), Ok(3)];
        const collected = collect(results);

        expect(isOk(collected)).toBe(true);
        if (isOk(collected)) {
          expect(collected.value).toEqual([1, 2, 3]);
        }
      });

      it('returns first Err', () => {
        const results: Result<number, Error>[] = [
          Ok(1),
          Err(new Error('first error')),
          Ok(3),
          Err(new Error('second error')),
        ];
        const collected = collect(results);

        expect(isErr(collected)).toBe(true);
        if (isErr(collected)) {
          expect(collected.error.message).toBe('first error');
        }
      });

      it('handles empty array', () => {
        const results: Result<number, Error>[] = [];
        const collected = collect(results);

        expect(isOk(collected)).toBe(true);
        if (isOk(collected)) {
          expect(collected.value).toEqual([]);
        }
      });
    });

    describe('partition', () => {
      it('separates Ok and Err', () => {
        const results: Result<number, Error>[] = [
          Ok(1),
          Err(new Error('a')),
          Ok(2),
          Err(new Error('b')),
          Ok(3),
        ];
        const { ok, err } = partition(results);

        expect(ok).toEqual([1, 2, 3]);
        expect(err.map((e) => e.message)).toEqual(['a', 'b']);
      });

      it('handles all Ok', () => {
        const results: Result<number, Error>[] = [Ok(1), Ok(2)];
        const { ok, err } = partition(results);

        expect(ok).toEqual([1, 2]);
        expect(err).toEqual([]);
      });

      it('handles all Err', () => {
        const results: Result<number, Error>[] = [Err(new Error('a')), Err(new Error('b'))];
        const { ok, err } = partition(results);

        expect(ok).toEqual([]);
        expect(err.length).toBe(2);
      });
    });
  });

  describe('Async Utilities', () => {
    describe('fromPromise', () => {
      it('wraps resolved promise in Ok', async () => {
        const result = await fromPromise(Promise.resolve(42));
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(42);
        }
      });

      it('wraps rejected promise in Err', async () => {
        const error = new Error('rejected');
        const result = await fromPromise(Promise.reject(error));

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error).toBe(error);
        }
      });

      it('maps error with custom mapper', async () => {
        const result = await fromPromise(
          Promise.reject(new Error('original')),
          (e) => new Error(`mapped: ${(e as Error).message}`)
        );

        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.message).toBe('mapped: original');
        }
      });
    });

    describe('toPromise', () => {
      it('resolves for Ok', async () => {
        const result: Result<number, Error> = Ok(42);
        const value = await toPromise(result);
        expect(value).toBe(42);
      });

      it('rejects for Err', async () => {
        const error = new Error('test');
        const result: Result<number, Error> = Err(error);

        await expect(toPromise(result)).rejects.toBe(error);
      });
    });
  });

  describe('wrapThrowing Backward Compatibility (T042)', () => {
    describe('wrapThrowing', () => {
      it('returns value for Ok result', () => {
        const internalFn = (x: number): Result<number, Error> => Ok(x * 2);
        const publicFn = wrapThrowing(internalFn);

        expect(publicFn(5)).toBe(10);
      });

      it('throws for Err result', () => {
        const internalFn = (x: number): Result<number, Error> => {
          if (x < 0) {
            return Err(new Error('must be positive'));
          }
          return Ok(x);
        };
        const publicFn = wrapThrowing(internalFn);

        expect(publicFn(5)).toBe(5);
        expect(() => publicFn(-1)).toThrow('must be positive');
      });

      it('preserves function signature', () => {
        const internalFn = (a: string, b: number): Result<string, Error> => Ok(`${a}:${b}`);
        const publicFn = wrapThrowing(internalFn);

        expect(publicFn('test', 42)).toBe('test:42');
      });
    });

    describe('wrapThrowingAsync', () => {
      it('returns value for Ok result', async () => {
        const internalFn = async (x: number): Promise<Result<number, Error>> => {
          await Promise.resolve();
          return Ok(x * 2);
        };
        const publicFn = wrapThrowingAsync(internalFn);

        expect(await publicFn(5)).toBe(10);
      });

      it('throws for Err result', async () => {
        const internalFn = async (x: number): Promise<Result<number, Error>> => {
          await Promise.resolve();
          if (x < 0) {
            return Err(new Error('must be positive'));
          }
          return Ok(x);
        };
        const publicFn = wrapThrowingAsync(internalFn);

        expect(await publicFn(5)).toBe(5);
        await expect(publicFn(-1)).rejects.toThrow('must be positive');
      });
    });

    describe('tryCatch', () => {
      it('wraps throwing function', () => {
        const throwingFn = (x: number): number => {
          if (x < 0) throw new Error('negative');
          return x * 2;
        };
        const safeFn = tryCatch(throwingFn, (e) => e as Error);

        const okResult = safeFn(5);
        expect(isOk(okResult)).toBe(true);
        if (isOk(okResult)) {
          expect(okResult.value).toBe(10);
        }

        const errResult = safeFn(-5);
        expect(isErr(errResult)).toBe(true);
        if (isErr(errResult)) {
          expect(errResult.error.message).toBe('negative');
        }
      });

      it('maps errors', () => {
        const throwingFn = (): number => {
          throw new Error('original');
        };
        const safeFn = tryCatch(throwingFn, () => new Error('mapped'));

        const result = safeFn();
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
          expect(result.error.message).toBe('mapped');
        }
      });
    });

    describe('tryCatchAsync', () => {
      it('wraps async throwing function', async () => {
        const throwingFn = async (x: number): Promise<number> => {
          await Promise.resolve();
          if (x < 0) throw new Error('negative');
          return x * 2;
        };
        const safeFn = tryCatchAsync(throwingFn, (e) => e as Error);

        const okResult = await safeFn(5);
        expect(isOk(okResult)).toBe(true);
        if (isOk(okResult)) {
          expect(okResult.value).toBe(10);
        }

        const errResult = await safeFn(-5);
        expect(isErr(errResult)).toBe(true);
        if (isErr(errResult)) {
          expect(errResult.error.message).toBe('negative');
        }
      });
    });
  });
});
