/**
 * Regression Test: Block OPENCODE_API_KEY References
 *
 * This test prevents the legacy/incorrect OPENCODE_API_KEY from
 * ever reappearing in workflows, docs, or code.
 *
 * OpenCode uses OPENAI_API_KEY or ANTHROPIC_API_KEY - there is no
 * such thing as an "OpenCode API key".
 */

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { join } from 'path';

// Patterns that should NEVER appear in the codebase
const BANNED_PATTERNS = ['OPENCODE_API_KEY', 'OPENCODE_APIKEY', 'OPENCODE_KEY'];

// Paths to scan (relative to router root)
const SCAN_PATHS = ['../.github/workflows', '../docs', '../README.md'];

describe('No OPENCODE_API_KEY References', () => {
  const routerRoot = join(import.meta.dirname, '../..');

  for (const pattern of BANNED_PATTERNS) {
    it(`should not contain '${pattern}' in workflows or docs`, () => {
      const violations: string[] = [];

      for (const scanPath of SCAN_PATHS) {
        const fullPath = join(routerRoot, scanPath);

        try {
          // Use grep to find any occurrences
          // grep returns exit code 1 if no match (which is what we want)
          const result = execSync(`grep -r -l "${pattern}" "${fullPath}" 2>/dev/null || true`, {
            encoding: 'utf-8',
            cwd: routerRoot,
          });

          if (result.trim()) {
            violations.push(...result.trim().split('\n'));
          }
        } catch {
          // grep errors (e.g., path not found) are ignored
        }
      }

      expect(
        violations,
        `Found '${pattern}' in: ${violations.join(', ')}. ` +
          `OpenCode uses OPENAI_API_KEY or ANTHROPIC_API_KEY, not OPENCODE_API_KEY.`
      ).toHaveLength(0);
    });
  }

  it('should not reference OPENCODE_API_KEY in security.ts allowlist', () => {
    const securityPath = join(routerRoot, 'src/agents/security.ts');

    try {
      const result = execSync(`grep "OPENCODE_API_KEY" "${securityPath}" || true`, {
        encoding: 'utf-8',
      });

      expect(result.trim(), 'OPENCODE_API_KEY should not be in the security allowlist').toBe('');
    } catch {
      // grep returns 1 if no match - this is expected
    }
  });

  it('should not reference OPENCODE_API_KEY in preflight.ts', () => {
    const preflightPath = join(routerRoot, 'src/preflight.ts');

    try {
      const result = execSync(`grep "OPENCODE_API_KEY" "${preflightPath}" || true`, {
        encoding: 'utf-8',
      });

      expect(result.trim(), 'OPENCODE_API_KEY should not be in preflight validation').toBe('');
    } catch {
      // grep returns 1 if no match - this is expected
    }
  });
});
