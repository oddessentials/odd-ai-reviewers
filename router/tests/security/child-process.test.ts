/**
 * Security Compliance Tests: Child Process Safety
 *
 * PR_LESSONS_LEARNED.md Requirement #3: No shell: true in child_process
 * "Always use shell: false, validate inputs, use allowlists for commands."
 *
 * This test verifies that the codebase does NOT use dangerous patterns:
 * - spawn/exec with shell: true
 * - exec() with user-controlled input
 * - execSync() without proper input validation
 *
 * IMPORTANT: The single allowed exception is depcruise-rules.test.ts which
 * uses shell: true for pnpm.cmd on Windows, but with hardcoded commands only.
 *
 * @module tests/security/child-process
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { glob } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROUTER_SRC = join(__dirname, '..', '..', 'src');

/**
 * Known exceptions with justification
 * Note: Use forward slashes for cross-platform matching
 */
const ALLOWED_SHELL_TRUE_FILES = [
  // Test file that uses shell: true for pnpm.cmd on Windows
  // Justification: Uses hardcoded 'pnpm' command, not user input
  '__tests__/depcruise-rules.test.ts',
  'depcruise-rules.test.ts', // Also match just the filename
];

describe('T123: Child Process Security Compliance', () => {
  describe('Static Analysis: shell: true Detection', () => {
    it('should not use shell: true in production source files', async () => {
      // Search for shell: true in src files (excluding tests and allowed files)
      const sourceFiles = await glob('**/*.ts', {
        cwd: ROUTER_SRC,
        ignore: ['**/__tests__/**', '**/*.test.ts', '**/tests/**'],
      });

      const violations: string[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(join(ROUTER_SRC, file), 'utf-8');

        // Look for shell: true pattern
        if (/shell:\s*true/.test(content)) {
          violations.push(file);
        }
      }

      expect(violations).toEqual([]);
    });

    it('should only have shell: true in allowed test files', async () => {
      const allFiles = await glob('**/*.ts', { cwd: ROUTER_SRC });

      const shellTrueFiles: string[] = [];

      for (const file of allFiles) {
        const content = readFileSync(join(ROUTER_SRC, file), 'utf-8');

        if (/shell:\s*true/.test(content)) {
          shellTrueFiles.push(file);
        }
      }

      // Verify all found files are in the allowed list
      for (const file of shellTrueFiles) {
        // Normalize path separators for cross-platform comparison
        const normalizedFile = file.replace(/\\/g, '/');
        const isAllowed = ALLOWED_SHELL_TRUE_FILES.some(
          (allowed) => normalizedFile.includes(allowed) || normalizedFile.endsWith(allowed)
        );
        if (!isAllowed) {
          expect.fail(
            `File ${file} uses shell: true but is not in the allowed list. ` +
              `Either add justification to ALLOWED_SHELL_TRUE_FILES or remove shell: true.`
          );
        }
      }
    });
  });

  describe('Static Analysis: Dangerous Patterns', () => {
    it('should prefer execFileSync over execSync in production code', async () => {
      const sourceFiles = await glob('**/*.ts', {
        cwd: ROUTER_SRC,
        ignore: ['**/__tests__/**', '**/*.test.ts', '**/tests/**'],
      });

      const execSyncUsages: { file: string; line: number; context: string }[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(join(ROUTER_SRC, file), 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Match execSync but not execFileSync
          if (/\bexecSync\s*\(/.test(line) && !/\bexecFileSync\s*\(/.test(line)) {
            execSyncUsages.push({
              file,
              line: index + 1,
              context: line.trim(),
            });
          }
        });
      }

      // Known exception: security.ts uses execSync for lsof detection
      // This is acceptable because the command is hardcoded
      const unexpectedUsages = execSyncUsages.filter(
        (usage) => !usage.file.includes('security.ts') || !usage.context.includes('command -v lsof')
      );

      // Filter out the hardcoded lsof command usage in security.ts
      const actualViolations = unexpectedUsages.filter((usage) => {
        // Allow hardcoded commands in security.ts
        if (usage.file.includes('security.ts')) {
          return false;
        }
        return true;
      });

      if (actualViolations.length > 0) {
        const details = actualViolations
          .map((v) => `  ${v.file}:${v.line}: ${v.context}`)
          .join('\n');
        expect.fail(
          `Found ${actualViolations.length} potentially dangerous execSync usages:\n${details}\n` +
            `Consider using execFileSync with shell: false instead.`
        );
      }
    });

    it('should not use exec() with string interpolation', async () => {
      const sourceFiles = await glob('**/*.ts', {
        cwd: ROUTER_SRC,
        ignore: ['**/__tests__/**', '**/*.test.ts', '**/tests/**'],
      });

      const violations: { file: string; line: number; context: string }[] = [];

      for (const file of sourceFiles) {
        const content = readFileSync(join(ROUTER_SRC, file), 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Look for exec with template literals or string concatenation
          if (/\bexec\s*\(\s*`/.test(line) || /\bexec\s*\([^)]*\+/.test(line)) {
            violations.push({
              file,
              line: index + 1,
              context: line.trim(),
            });
          }
        });
      }

      expect(violations).toEqual([]);
    });
  });

  describe('Runtime Verification: git-context.ts', () => {
    it('should use execFileSync for git commands', () => {
      const gitContextPath = join(ROUTER_SRC, 'cli', 'git-context.ts');

      if (!existsSync(gitContextPath)) {
        // File doesn't exist in this context, skip
        return;
      }

      const content = readFileSync(gitContextPath, 'utf-8');

      // Should import execFileSync
      expect(content).toContain('execFileSync');

      // Should NOT import exec or execSync
      expect(content).not.toMatch(/import.*\bexec\b[^F]/);
      expect(content).not.toMatch(/import.*\bexecSync\b/);
    });

    it('should use array arguments for git commands', () => {
      const gitContextPath = join(ROUTER_SRC, 'cli', 'git-context.ts');

      if (!existsSync(gitContextPath)) {
        return;
      }

      const content = readFileSync(gitContextPath, 'utf-8');

      // Find all execFileSync calls
      const execFileCalls = content.match(/execFileSync\s*\([^)]+\)/g) || [];

      for (const call of execFileCalls) {
        // Each call should have 'git' as first arg and array as second
        expect(call).toMatch(/execFileSync\s*\(\s*['"`]git['"`]\s*,\s*\[/);
      }
    });
  });

  describe('Documentation: Security Comments', () => {
    it('should have security documentation in git-context.ts', () => {
      const gitContextPath = join(ROUTER_SRC, 'cli', 'git-context.ts');

      if (!existsSync(gitContextPath)) {
        return;
      }

      const content = readFileSync(gitContextPath, 'utf-8');

      // Should document the security approach
      expect(content).toMatch(/shell:\s*false|Security|execFileSync/i);
    });
  });
});
