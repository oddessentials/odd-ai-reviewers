/**
 * Branded Type Tests
 *
 * Tests for:
 * - SafeGitRef brand helpers (T028)
 * - ValidatedConfig brand helpers (T029)
 * - CanonicalPath brand helpers (T030)
 * - Serialization round-trip (T031)
 */

import { describe, it, expect } from 'vitest';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import {
  SafeGitRefHelpers,
  CanonicalPathHelpers,
  createValidatedConfigHelpers,
  createBrandHelpers,
  type SafeGitRef,
  type CanonicalPath,
  type ValidatedConfig,
} from '../../types/branded.js';
import { isOk, isErr } from '../../types/result.js';

describe('Branded Types', () => {
  describe('SafeGitRef (T028)', () => {
    describe('parse', () => {
      it('should accept valid git refs', () => {
        const validRefs = [
          'main',
          'feature/my-branch',
          'v1.0.0',
          'abc123def',
          'refs/heads/main',
          'origin/main',
          'feature_branch',
          'my.branch.name',
        ];

        for (const ref of validRefs) {
          const result = SafeGitRefHelpers.parse(ref);
          expect(isOk(result)).toBe(true);
          if (isOk(result)) {
            expect(result.value).toBe(ref);
          }
        }
      });

      it('should reject empty strings', () => {
        const result = SafeGitRefHelpers.parse('');
        expect(isErr(result)).toBe(true);
      });

      it('should reject strings that are too long', () => {
        const longRef = 'a'.repeat(257);
        const result = SafeGitRefHelpers.parse(longRef);
        expect(isErr(result)).toBe(true);
      });

      it('should reject refs with path traversal', () => {
        const result = SafeGitRefHelpers.parse('refs/../../../etc/passwd');
        expect(isErr(result)).toBe(true);
      });

      it('should reject refs starting with dash', () => {
        const result = SafeGitRefHelpers.parse('-malicious');
        expect(isErr(result)).toBe(true);
      });

      it('should reject refs with shell metacharacters', () => {
        const dangerousRefs = [
          'ref;echo pwned',
          'ref|cat /etc/passwd',
          'ref&whoami',
          'ref`id`',
          'ref$PATH',
          'ref with spaces',
        ];

        for (const ref of dangerousRefs) {
          const result = SafeGitRefHelpers.parse(ref);
          expect(isErr(result)).toBe(true);
        }
      });

      it('should reject non-string inputs', () => {
        const result = SafeGitRefHelpers.parse(123);
        expect(isErr(result)).toBe(true);
      });
    });

    describe('brand and unbrand', () => {
      it('should brand valid pre-validated values', () => {
        const branded = SafeGitRefHelpers.brand('main');
        expect(branded).toBe('main');
      });

      it('should unbrand to underlying value', () => {
        const result = SafeGitRefHelpers.parse('feature/test');
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const unbranded = SafeGitRefHelpers.unbrand(result.value);
          expect(unbranded).toBe('feature/test');
        }
      });
    });

    describe('is (type guard)', () => {
      it('should return true for valid refs', () => {
        expect(SafeGitRefHelpers.is('main')).toBe(true);
        expect(SafeGitRefHelpers.is('feature/branch')).toBe(true);
      });

      it('should return false for invalid refs', () => {
        expect(SafeGitRefHelpers.is('')).toBe(false);
        expect(SafeGitRefHelpers.is('ref;pwned')).toBe(false);
        expect(SafeGitRefHelpers.is(123)).toBe(false);
      });
    });

    describe('constants', () => {
      it('should expose MAX_LENGTH', () => {
        expect(SafeGitRefHelpers.MAX_LENGTH).toBe(256);
      });

      it('should expose PATTERN', () => {
        expect(SafeGitRefHelpers.PATTERN).toBeInstanceOf(RegExp);
      });
    });
  });

  describe('CanonicalPath (T030)', () => {
    describe('parse', () => {
      it('should accept valid paths', () => {
        const validPaths = [
          'src/index.ts',
          'package.json',
          'path/to/file.txt',
          'some_file.js',
          'file-name.ts',
        ];

        for (const path of validPaths) {
          const result = CanonicalPathHelpers.parse(path);
          expect(isOk(result)).toBe(true);
        }
      });

      it('should normalize backslashes to forward slashes', () => {
        const result = CanonicalPathHelpers.parse('path\\to\\file.ts');
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe('path/to/file.ts');
        }
      });

      it('should reject empty strings', () => {
        const result = CanonicalPathHelpers.parse('');
        expect(isErr(result)).toBe(true);
      });

      it('should reject path traversal attempts', () => {
        const traversalPaths = ['../secret', '../../etc/passwd', 'path/../../../etc/passwd'];

        for (const path of traversalPaths) {
          const result = CanonicalPathHelpers.parse(path);
          expect(isErr(result)).toBe(true);
        }
      });

      it('should reject absolute paths', () => {
        const result = CanonicalPathHelpers.parse('/etc/passwd');
        expect(isErr(result)).toBe(true);
      });

      it('should reject paths with shell metacharacters', () => {
        const dangerousPaths = [
          'path;echo pwned',
          'file|cat /etc/passwd',
          "path'injection",
          'file"injection',
        ];

        for (const path of dangerousPaths) {
          const result = CanonicalPathHelpers.parse(path);
          expect(isErr(result)).toBe(true);
        }
      });
    });

    describe('normalize helper', () => {
      it('should normalize path separators', () => {
        expect(CanonicalPathHelpers.normalize('path\\to\\file')).toBe('path/to/file');
        expect(CanonicalPathHelpers.normalize('path//to//file')).toBe('path/to/file');
      });
    });

    describe('hasTraversal helper', () => {
      it('should detect traversal', () => {
        expect(CanonicalPathHelpers.hasTraversal('../secret')).toBe(true);
        expect(CanonicalPathHelpers.hasTraversal('path/../file')).toBe(true);
      });

      it('should allow valid paths', () => {
        expect(CanonicalPathHelpers.hasTraversal('path/to/file')).toBe(false);
      });
    });
  });

  describe('ValidatedConfig (T029)', () => {
    const TestConfigSchema = z.object({
      name: z.string().min(1),
      count: z.number().int().positive(),
      enabled: z.boolean().default(true),
    });

    type TestConfig = z.infer<typeof TestConfigSchema>;

    const TestConfigHelpers = createValidatedConfigHelpers(TestConfigSchema);

    describe('parse', () => {
      it('should accept valid config', () => {
        const result = TestConfigHelpers.parse({
          name: 'test',
          count: 42,
          enabled: true,
        });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.name).toBe('test');
          expect(result.value.count).toBe(42);
        }
      });

      it('should apply defaults', () => {
        const result = TestConfigHelpers.parse({
          name: 'test',
          count: 1,
        });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.enabled).toBe(true);
        }
      });

      it('should reject invalid config', () => {
        const result = TestConfigHelpers.parse({
          name: '', // too short
          count: -1, // not positive
        });

        expect(isErr(result)).toBe(true);
      });

      it('should reject missing required fields', () => {
        const result = TestConfigHelpers.parse({
          name: 'test',
          // missing count
        });

        expect(isErr(result)).toBe(true);
      });
    });

    describe('brand and unbrand', () => {
      it('should brand valid config', () => {
        const config: TestConfig = { name: 'test', count: 1, enabled: false };
        const branded = TestConfigHelpers.brand(config);
        expect(branded.name).toBe('test');
      });

      it('should unbrand to plain object', () => {
        const result = TestConfigHelpers.parse({
          name: 'test',
          count: 5,
          enabled: true,
        });

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const unbranded = TestConfigHelpers.unbrand(result.value);
          expect(unbranded).toEqual({
            name: 'test',
            count: 5,
            enabled: true,
          });
        }
      });
    });

    describe('schema access', () => {
      it('should expose the original schema', () => {
        expect(TestConfigHelpers.schema).toBe(TestConfigSchema);
      });
    });
  });

  describe('Serialization Round-Trip (T031)', () => {
    it('should round-trip SafeGitRef through JSON', () => {
      const parseResult = SafeGitRefHelpers.parse('feature/branch-123');
      expect(isOk(parseResult)).toBe(true);

      if (isOk(parseResult)) {
        const branded: SafeGitRef = parseResult.value;

        // Serialize (unbrand)
        const plain = SafeGitRefHelpers.unbrand(branded);
        const json = JSON.stringify({ ref: plain });

        // Deserialize (parse)
        const parsed = JSON.parse(json) as { ref: string };
        const restored = SafeGitRefHelpers.parse(parsed.ref);

        expect(isOk(restored)).toBe(true);
        if (isOk(restored)) {
          expect(restored.value).toBe(branded);
        }
      }
    });

    it('should round-trip CanonicalPath through JSON', () => {
      const parseResult = CanonicalPathHelpers.parse('src/components/Button.tsx');
      expect(isOk(parseResult)).toBe(true);

      if (isOk(parseResult)) {
        const branded: CanonicalPath = parseResult.value;

        // Serialize
        const plain = CanonicalPathHelpers.unbrand(branded);
        const json = JSON.stringify({ path: plain });

        // Deserialize
        const parsed = JSON.parse(json) as { path: string };
        const restored = CanonicalPathHelpers.parse(parsed.path);

        expect(isOk(restored)).toBe(true);
        if (isOk(restored)) {
          expect(restored.value).toBe(branded);
        }
      }
    });

    it('should round-trip ValidatedConfig through JSON', () => {
      const ConfigSchema = z.object({
        version: z.number(),
        name: z.string(),
      });
      const ConfigHelpers = createValidatedConfigHelpers(ConfigSchema);

      const parseResult = ConfigHelpers.parse({ version: 1, name: 'test' });
      expect(isOk(parseResult)).toBe(true);

      if (isOk(parseResult)) {
        const branded: ValidatedConfig<{ version: number; name: string }> = parseResult.value;

        // Serialize
        const plain = ConfigHelpers.unbrand(branded);
        const json = JSON.stringify(plain);

        // Deserialize
        const parsed = JSON.parse(json) as unknown;
        const restored = ConfigHelpers.parse(parsed);

        expect(isOk(restored)).toBe(true);
        if (isOk(restored)) {
          expect(restored.value).toEqual(branded);
        }
      }
    });

    it('should fail deserialization for tampered data', () => {
      // Serialize valid ref
      const validResult = SafeGitRefHelpers.parse('main');
      expect(isOk(validResult)).toBe(true);

      // Tamper with serialized data
      const tampered = { ref: 'ref;echo pwned' };
      const json = JSON.stringify(tampered);

      // Deserialize - should fail
      const parsed = JSON.parse(json) as { ref: string };
      const restored = SafeGitRefHelpers.parse(parsed.ref);

      expect(isErr(restored)).toBe(true);
    });
  });

  describe('createBrandHelpers factory', () => {
    it('should create helpers for custom branded types', () => {
      const EmailSchema = z.string().email();
      const EmailHelpers = createBrandHelpers(EmailSchema, 'Email', 'email');

      const validResult = EmailHelpers.parse('test@example.com');
      expect(isOk(validResult)).toBe(true);

      const invalidResult = EmailHelpers.parse('not-an-email');
      expect(isErr(invalidResult)).toBe(true);
    });

    it('should support additional validation', async () => {
      // Use dynamic imports for ESM
      const { ValidationError, ValidationErrorCode } = await import('../../types/errors.js');
      const { Ok, Err } = await import('../../types/result.js');

      const PositiveNumberSchema = z.number();
      const PositiveHelpers = createBrandHelpers(
        PositiveNumberSchema,
        'PositiveNumber',
        'value',
        (value) => {
          if (value <= 0) {
            return Err(
              new ValidationError('Must be positive', ValidationErrorCode.CONSTRAINT_VIOLATED, {
                field: 'value',
                value,
                constraint: 'positive',
              })
            );
          }
          return Ok(value);
        }
      );

      const validResult = PositiveHelpers.parse(42);
      expect(isOk(validResult)).toBe(true);

      const invalidResult = PositiveHelpers.parse(-5);
      expect(isErr(invalidResult)).toBe(true);
    });
  });

  // ============================================================================
  // BrandHelpers.is() Consistency Tests (012-fix-agent-result-regressions)
  // FR-006, FR-009: Verify is() and parse() always agree
  // ============================================================================

  describe('BrandHelpers.is() consistency (012-fix-agent-result-regressions)', () => {
    describe('T033: is() returns false for forbidden patterns', () => {
      it('should return false for path traversal pattern', () => {
        expect(SafeGitRefHelpers.is('refs/../main')).toBe(false);
      });

      it('should return false for shell injection attempts', () => {
        expect(SafeGitRefHelpers.is('$(whoami)')).toBe(false);
        expect(SafeGitRefHelpers.is('branch`id`')).toBe(false);
        expect(SafeGitRefHelpers.is('ref;echo pwned')).toBe(false);
      });

      it('should return false for leading dash (option injection)', () => {
        expect(SafeGitRefHelpers.is('-malicious')).toBe(false);
      });
    });

    describe('T034: is() returns true for valid inputs', () => {
      it('should return true for simple branch names', () => {
        expect(SafeGitRefHelpers.is('main')).toBe(true);
        expect(SafeGitRefHelpers.is('develop')).toBe(true);
      });

      it('should return true for feature branches', () => {
        expect(SafeGitRefHelpers.is('feature/my-branch')).toBe(true);
        expect(SafeGitRefHelpers.is('feature/JIRA-123')).toBe(true);
      });

      it('should return true for tag refs', () => {
        expect(SafeGitRefHelpers.is('v1.0.0')).toBe(true);
        expect(SafeGitRefHelpers.is('release/2.0')).toBe(true);
      });
    });

    describe('T035: fixed wide corpus - is() agrees with parse() for all entries (FR-009)', () => {
      // Fixed corpus covering known edge cases
      const corpus: unknown[] = [
        // Valid refs
        'main',
        'refs/heads/feature',
        'feature/my-branch',
        'valid/branch/name',
        'refs/tags/v1.0.0',
        'abc123',
        'a',
        // Invalid - forbidden patterns
        'refs/../main', // Path traversal
        'feature--name/../etc', // Embedded traversal
        '', // Empty
        null,
        undefined,
        // Length limits
        'a'.repeat(256), // Max length - valid
        'a'.repeat(257), // Over max - invalid
        // Invalid start
        '-leading-dash',
        // Shell injection attempts
        '$(whoami)',
        'branch`id`',
        'ref;echo pwned',
        'ref|cat /etc/passwd',
        'ref&whoami',
        'ref$PATH',
        // Whitespace
        'branch with spaces',
        'branch\ttab',
        'branch\nnewline',
        // Non-string types
        123,
        { foo: 'bar' },
        ['array'],
        true,
        false,
      ];

      it.each(corpus)('is() agrees with parse() for corpus entry: %p', (input) => {
        const isResult = SafeGitRefHelpers.is(input);
        const parseResult = isOk(SafeGitRefHelpers.parse(input));
        expect(isResult).toBe(parseResult);
      });
    });

    describe('T036: fuzz loop with crypto.randomBytes - is() agrees with parse() (FR-009)', () => {
      it('is() agrees with parse() for 100 random fuzz inputs', () => {
        for (let i = 0; i < 100; i++) {
          // Generate random bytes of varying lengths (0-64)
          const length = Math.floor(Math.random() * 64);
          const fuzzInput = randomBytes(length).toString('base64');

          const isResult = SafeGitRefHelpers.is(fuzzInput);
          const parseResult = isOk(SafeGitRefHelpers.parse(fuzzInput));

          expect(isResult, `Failed for fuzz input: ${fuzzInput}`).toBe(parseResult);
        }
      });

      it('is() agrees with parse() for random binary inputs', () => {
        for (let i = 0; i < 50; i++) {
          // Test with raw binary (may contain null bytes, etc.)
          const fuzzInput = randomBytes(Math.floor(Math.random() * 32)).toString('binary');

          const isResult = SafeGitRefHelpers.is(fuzzInput);
          const parseResult = isOk(SafeGitRefHelpers.parse(fuzzInput));

          expect(isResult, `Failed for binary input: ${fuzzInput}`).toBe(parseResult);
        }
      });
    });
  });
});
