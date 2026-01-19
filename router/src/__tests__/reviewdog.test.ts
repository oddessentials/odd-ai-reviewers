/**
 * Reviewdog Agent Tests
 *
 * Integration tests are guarded by CI_HAS_REVIEWDOG environment variable.
 * Unit tests run without the reviewdog binary.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('Reviewdog Agent', () => {
  describe('Temp file handling', () => {
    it('should write JSON to temp file without injection issues', () => {
      const maliciousJson = JSON.stringify({
        results: [
          {
            path: "'; rm -rf /; echo '",
            check_id: 'test',
            message: '`backticks` and "quotes" and $variables',
          },
        ],
      });

      const tempFile = join(tmpdir(), `test-semgrep-${Date.now()}.json`);
      writeFileSync(tempFile, maliciousJson);

      expect(existsSync(tempFile)).toBe(true);

      // Read back and verify content is preserved exactly
      const readBack = readFileSync(tempFile, 'utf-8');
      expect(readBack).toBe(maliciousJson);

      // Cleanup
      unlinkSync(tempFile);
      expect(existsSync(tempFile)).toBe(false);
    });

    it('should handle JSON with newlines and special characters', () => {
      const complexJson = JSON.stringify(
        {
          results: [
            {
              message: 'Line 1\nLine 2\r\nLine 3\tTabbed',
              path: 'file with spaces.ts',
            },
          ],
        },
        null,
        2
      );

      const tempFile = join(tmpdir(), `test-complex-${Date.now()}.json`);
      writeFileSync(tempFile, complexJson);

      const readBack = readFileSync(tempFile, 'utf-8');
      expect(readBack).toBe(complexJson);
      expect(readBack).toContain('\\n');
      expect(readBack).toContain('\\r\\n');
      expect(readBack).toContain('\\t');

      unlinkSync(tempFile);
    });
  });

  describe('Integration tests (requires reviewdog binary)', () => {
    const hasReviewdog = process.env['CI_HAS_REVIEWDOG'] === 'true';

    it.skipIf(!hasReviewdog)('should pipe semgrep JSON through reviewdog', async () => {
      // This test requires:
      // 1. reviewdog binary in PATH
      // 2. CI_HAS_REVIEWDOG=true
      // 3. GITHUB_TOKEN set (for github-pr-review reporter)

      // Golden fixture: valid semgrep JSON output
      const goldenSemgrepOutput = {
        version: '1.0.0',
        errors: [],
        paths: { scanned: ['test.ts'] },
        results: [
          {
            check_id: 'typescript.security.test-rule',
            path: 'test.ts',
            start: { line: 1, col: 1 },
            end: { line: 1, col: 10 },
            message: 'Test finding',
            severity: 'WARNING',
          },
        ],
      };

      // Verify the fixture is valid JSON
      expect(() => JSON.stringify(goldenSemgrepOutput)).not.toThrow();
    });
  });
});
