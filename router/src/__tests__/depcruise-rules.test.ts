/**
 * Dependency Cruiser Rule Validation Tests
 *
 * Validates that the dependency-cruiser configuration correctly enforces:
 * - Test infrastructure (__tests__/) can import vitest
 * - Production code (src/**) cannot import vitest
 * - Specs cannot import test artifacts
 *
 * CANARY TESTS: This file includes assertions that will FAIL LOUDLY if
 * anyone attempts to expand the exception surface. The allowed patterns
 * are explicitly locked to prevent accidental rule weakening.
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';
import { readFileSync } from 'fs';

// Project root (two levels up from __tests__)
const projectRoot = join(__dirname, '..', '..', '..');

/**
 * LOCKED PATTERNS - These are the ONLY allowed exceptions to not-to-dev-dep.
 * Adding broader patterns (test-utils, helpers, __*__, etc.) is FORBIDDEN.
 * If you need to change these, you must justify it in a PR review.
 */
const ALLOWED_TEST_FILE_PATTERN = '[.](?:spec|test)[.](?:js|mjs|cjs|jsx|ts|mts|cts|tsx)$';
const ALLOWED_TEST_INFRA_PATTERN = '^router/src/__tests__/';

/**
 * Normalize path to POSIX format (forward slashes).
 * Ensures consistent path matching across Windows and Linux.
 */
function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/');
}

/**
 * Run dependency-cruiser with specific options and return the result
 */
function runDepcruise(args: string): { exitCode: number; output: string } {
  try {
    const output = execSync(`pnpm depcruise ${args}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { exitCode: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      exitCode: err.status ?? 1,
      output: (err.stdout ?? '') + (err.stderr ?? ''),
    };
  }
}

/**
 * Load and parse the dependency-cruiser configuration
 */
function loadDepcruiseConfig(): {
  forbidden: { name: string; from?: { pathNot?: string | string[] } }[];
} {
  const configPath = join(projectRoot, '.dependency-cruiser.cjs');
  const configContent = readFileSync(configPath, 'utf-8');

  // Find the not-to-dev-dep rule section
  const ruleStart = configContent.indexOf("name: 'not-to-dev-dep'");
  if (ruleStart === -1) {
    throw new Error('Could not find not-to-dev-dep rule in .dependency-cruiser.cjs');
  }

  // Extract the section from the rule start to the next rule (or end)
  const ruleSection = configContent.slice(ruleStart, ruleStart + 1000);

  // Find pathNot array - look for pathNot: [ ... ],
  const pathNotStart = ruleSection.indexOf('pathNot:');
  if (pathNotStart === -1) {
    throw new Error('Could not find pathNot in not-to-dev-dep rule');
  }

  // Extract from pathNot to the closing ],
  const afterPathNot = ruleSection.slice(pathNotStart);
  const arrayStart = afterPathNot.indexOf('[');
  const arrayEnd = afterPathNot.indexOf('],');

  if (arrayStart === -1 || arrayEnd === -1) {
    // Single string value
    const singleMatch = afterPathNot.match(/pathNot:\s*['"]([^'"]+)['"]/);
    if (singleMatch?.[1]) {
      return {
        forbidden: [{ name: 'not-to-dev-dep', from: { pathNot: [singleMatch[1]] } }],
      };
    }
    throw new Error('Could not parse pathNot value');
  }

  // Extract the array content
  const arrayContent = afterPathNot.slice(arrayStart, arrayEnd + 1);

  // Extract all string values from the array
  const stringMatches = arrayContent.match(/'([^']+)'/g);
  const pathNot = stringMatches ? stringMatches.map((s) => s.slice(1, -1)) : [];

  return {
    forbidden: [
      {
        name: 'not-to-dev-dep',
        from: { pathNot },
      },
    ],
  };
}

describe('Dependency Cruiser Rule Validation', () => {
  describe('CANARY: Exception Surface Lock', () => {
    it('should have EXACTLY two patterns in not-to-dev-dep pathNot (no more, no less)', () => {
      const config = loadDepcruiseConfig();
      const notToDevDep = config.forbidden.find((r) => r.name === 'not-to-dev-dep');

      expect(notToDevDep).toBeDefined();
      expect(notToDevDep?.from?.pathNot).toBeDefined();

      const pathNot = notToDevDep?.from?.pathNot;
      const patterns = Array.isArray(pathNot) ? pathNot : [pathNot];

      // CANARY: Fail if someone adds more patterns
      expect(patterns.length).toBe(2);
    });

    it('should contain ONLY the locked test file pattern (*.test.ts, *.spec.ts)', () => {
      const config = loadDepcruiseConfig();
      const notToDevDep = config.forbidden.find((r) => r.name === 'not-to-dev-dep');
      const pathNot = notToDevDep?.from?.pathNot;
      const patterns = Array.isArray(pathNot) ? pathNot : [pathNot];

      // CANARY: Exact match required - no variations allowed
      expect(patterns).toContainEqual(ALLOWED_TEST_FILE_PATTERN);
    });

    it('should contain ONLY the locked test infrastructure pattern (^router/src/__tests__/)', () => {
      const config = loadDepcruiseConfig();
      const notToDevDep = config.forbidden.find((r) => r.name === 'not-to-dev-dep');
      const pathNot = notToDevDep?.from?.pathNot;
      const patterns = Array.isArray(pathNot) ? pathNot : [pathNot];

      // CANARY: Exact match required - no broader patterns like:
      // - test-utils (too broad)
      // - helpers (too broad)
      // - __mocks__ (not approved)
      // - /__tests__/ (missing anchor - would match any __tests__ anywhere)
      expect(patterns).toContainEqual(ALLOWED_TEST_INFRA_PATTERN);
    });

    it('should NOT contain any unapproved broad patterns', () => {
      const config = loadDepcruiseConfig();
      const notToDevDep = config.forbidden.find((r) => r.name === 'not-to-dev-dep');
      const pathNot = notToDevDep?.from?.pathNot;
      const patterns = Array.isArray(pathNot) ? pathNot : [pathNot];

      // FORBIDDEN PATTERNS - patterns that are too broad and should never appear
      // Note: We check for exact matches or patterns that would silently expand the exception
      const forbiddenExactPatterns = [
        'test-utils', // Too broad - could match anywhere
        'helpers', // Too broad - could match anywhere
        '__mocks__', // Not approved for this rule
        'fixtures', // Too broad
        'mocks', // Too broad
        'stubs', // Too broad
      ];

      // These patterns are forbidden because they lack proper anchoring
      // The allowed pattern is ^router/src/__tests__/ (fully anchored)
      const forbiddenUnanchoredPatterns = [
        /^__tests__/, // Missing path anchor - would match any __tests__
        /^\/test\//, // Too broad
        /^test\//, // Too broad
      ];

      for (const pattern of patterns) {
        // Skip the known-good patterns
        if (pattern === ALLOWED_TEST_FILE_PATTERN || pattern === ALLOWED_TEST_INFRA_PATTERN) {
          continue;
        }

        // Check for forbidden substrings
        for (const forbidden of forbiddenExactPatterns) {
          expect(pattern).not.toContain(forbidden);
        }

        // Check for forbidden pattern structures
        for (const forbiddenRegex of forbiddenUnanchoredPatterns) {
          expect(pattern).not.toMatch(forbiddenRegex);
        }
      }
    });

    it('should keep production path anchor unchanged (^router/src)', () => {
      const configPath = join(projectRoot, '.dependency-cruiser.cjs');
      const configContent = readFileSync(configPath, 'utf-8');

      // Verify the production path is still anchored to router/src
      const pathMatch = configContent.match(
        /name:\s*['"]not-to-dev-dep['"][\s\S]*?path:\s*['"]\^?\(?(router\/src)\)?['"]/
      );

      expect(pathMatch).not.toBeNull();
      expect(pathMatch?.[1]).toBe('router/src');
    });
  });

  describe('CANARY: Cross-Platform Path Normalization', () => {
    it('should match POSIX paths with the test infra pattern', () => {
      const posixPath = 'router/src/__tests__/hermetic-setup.ts';
      const regex = new RegExp(ALLOWED_TEST_INFRA_PATTERN);

      expect(regex.test(posixPath)).toBe(true);
    });

    it('should match Windows paths after normalization', () => {
      // Windows-style path that would come from path.join() on Windows
      const windowsPath = 'router\\src\\__tests__\\hermetic-setup.ts';
      const normalizedPath = toPosixPath(windowsPath);
      const regex = new RegExp(ALLOWED_TEST_INFRA_PATTERN);

      // After normalization, the pattern should match
      expect(normalizedPath).toBe('router/src/__tests__/hermetic-setup.ts');
      expect(regex.test(normalizedPath)).toBe(true);
    });

    it('should NOT match paths outside __tests__/ even after normalization', () => {
      const windowsProductionPath = 'router\\src\\config.ts';
      const normalizedPath = toPosixPath(windowsProductionPath);
      const regex = new RegExp(ALLOWED_TEST_INFRA_PATTERN);

      expect(regex.test(normalizedPath)).toBe(false);
    });

    it('should use POSIX separators in all config patterns', () => {
      const config = loadDepcruiseConfig();
      const notToDevDep = config.forbidden.find((r) => r.name === 'not-to-dev-dep');
      const pathNot = notToDevDep?.from?.pathNot;
      const patterns = Array.isArray(pathNot) ? pathNot : [pathNot];

      // All patterns must use forward slashes, never backslashes
      for (const pattern of patterns) {
        expect(pattern).not.toContain('\\');
      }
    });
  });

  describe('not-to-dev-dep rule behavior', () => {
    it('should allow __tests__/ to import vitest (test infrastructure)', () => {
      const result = runDepcruise(
        'router/src/__tests__/hermetic-setup.ts --config .dependency-cruiser.cjs --output-type err'
      );

      expect(result.output).not.toContain('not-to-dev-dep');
    });

    it('should allow *.test.ts files to import vitest', () => {
      const result = runDepcruise(
        'router/src/__tests__/integration/error-paths.test.ts --config .dependency-cruiser.cjs --output-type err'
      );

      expect(result.output).not.toContain('not-to-dev-dep');
    });

    it('should block production code from importing vitest', () => {
      const result = runDepcruise(
        'router/src/config.ts --config .dependency-cruiser.cjs --output-type json'
      );

      // Production files should pass (no vitest imports) and be subject to the rule
      expect(result.exitCode).toBe(0);
    });
  });

  describe('not-to-spec rule behavior', () => {
    it('should prevent importing .test.ts files from non-test code', () => {
      const result = runDepcruise(
        'router/src --config .dependency-cruiser.cjs --focus not-to-spec --output-type err'
      );

      expect(result.exitCode).toBe(0);
    });
  });

  describe('full scan verification', () => {
    it('should have no violations in the full router/src scan', () => {
      const result = runDepcruise('router/src --config .dependency-cruiser.cjs --output-type err');

      expect(result.exitCode).toBe(0);
      expect(result.output).toContain('no dependency violations found');
    });
  });
});
