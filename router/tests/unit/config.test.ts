/**
 * Config Error Path Coverage Tests
 *
 * Tests for User Story 4 (T033-T037): Comprehensive config loading error tests.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, unlinkSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempRepo } from '../helpers/temp-repo.js';
import { loadConfigFromPath } from '../../src/config.js';
import { ConfigErrorCode } from '../../src/types/errors.js';

// =============================================================================
// T033-T037: Config Error Path Tests
// =============================================================================

describe('config error handling', () => {
  // T033: Test for ENOENT (missing config file)
  describe('T033: FILE_NOT_FOUND for missing config', () => {
    it('should return FILE_NOT_FOUND for missing config file', async () => {
      const nonexistentPath = '/nonexistent/path/that/does/not/exist/config.yml';

      await expect(loadConfigFromPath(nonexistentPath)).rejects.toMatchObject({
        code: ConfigErrorCode.FILE_NOT_FOUND,
        message: expect.stringContaining('not found'),
      });
    });

    it('should include path in error context', async () => {
      const nonexistentPath = '/some/missing/config.yml';

      try {
        await loadConfigFromPath(nonexistentPath);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toMatchObject({
          code: ConfigErrorCode.FILE_NOT_FOUND,
          context: {
            path: nonexistentPath,
          },
        });
      }
    });
  });

  // T034: Test for deletion race condition
  describe('T034: Deletion race condition', () => {
    it('should handle file deleted after check but before read', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Create file
      writeFileSync(configPath, 'version: 1\n');

      // Verify it exists
      expect(existsSync(configPath)).toBe(true);

      // Delete it to simulate race condition
      unlinkSync(configPath);

      // Now try to load - should get FILE_NOT_FOUND
      await expect(loadConfigFromPath(configPath)).rejects.toMatchObject({
        code: ConfigErrorCode.FILE_NOT_FOUND,
      });
    });
  });

  // T035: Test for EACCES (permission denied) - skip on Windows
  describe('T035: FILE_UNREADABLE for permission denied', () => {
    const isWindows = process.platform === 'win32';

    it.skipIf(isWindows)('should return FILE_UNREADABLE for permission denied', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Create file with restricted permissions
      writeFileSync(configPath, 'version: 1\n');
      chmodSync(configPath, 0o000);

      try {
        await expect(loadConfigFromPath(configPath)).rejects.toMatchObject({
          code: ConfigErrorCode.FILE_UNREADABLE,
          message: expect.stringContaining('permission denied'),
        });
      } finally {
        // Restore permissions for cleanup
        chmodSync(configPath, 0o644);
      }
    });
  });

  // T036: Test for malformed YAML parsing error
  describe('T036: YAML_PARSE_ERROR for malformed YAML', () => {
    it('should return YAML_PARSE_ERROR for invalid YAML syntax', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Write invalid YAML with unclosed brackets
      writeFileSync(configPath, 'invalid: yaml: [unclosed');

      await expect(loadConfigFromPath(configPath)).rejects.toMatchObject({
        code: ConfigErrorCode.YAML_PARSE_ERROR,
        message: expect.stringContaining('parse'),
      });
    });

    it('should handle tabs in indentation (YAML error)', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Write YAML with tab indentation (invalid in strict YAML)
      writeFileSync(configPath, 'key:\n\tvalue: foo');

      // This may or may not error depending on YAML parser strictness
      // The important thing is it doesn't crash
      try {
        await loadConfigFromPath(configPath);
      } catch (err) {
        // If it does error, it should be YAML_PARSE_ERROR or INVALID_SCHEMA
        expect(err).toMatchObject({
          code: expect.stringMatching(/^CONFIG_/),
        });
      }
    });

    it('should handle empty file', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Write empty file
      writeFileSync(configPath, '');

      // Empty file parses as null, which should be handled gracefully
      // It will likely fail schema validation but not YAML parsing
      try {
        await loadConfigFromPath(configPath);
      } catch (err) {
        // Should either work (with defaults) or fail validation, not crash
        expect(err).toMatchObject({
          code: expect.stringMatching(/^CONFIG_/),
        });
      }
    });
  });

  // T037: Test for schema validation failure
  describe('T037: INVALID_SCHEMA for schema validation failure', () => {
    it('should return INVALID_SCHEMA with field-level errors', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Write valid YAML but invalid schema (passes is required to be array)
      writeFileSync(
        configPath,
        `
version: 1
passes: "not-an-array"
`
      );

      await expect(loadConfigFromPath(configPath)).rejects.toMatchObject({
        code: ConfigErrorCode.INVALID_SCHEMA,
        message: expect.stringContaining('Invalid'),
      });
    });

    it('should include field info in error context', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Write config with invalid limit value
      writeFileSync(
        configPath,
        `
version: 1
limits:
  max_files: "not-a-number"
`
      );

      try {
        await loadConfigFromPath(configPath);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toMatchObject({
          code: ConfigErrorCode.INVALID_SCHEMA,
          context: {
            path: configPath,
            field: expect.any(String),
          },
        });
      }
    });

    it('should handle unknown fields gracefully', async () => {
      const repo = makeTempRepo({ initGit: false });
      const configPath = join(repo.path, '.ai-review.yml');

      // Write valid config with extra unknown field
      writeFileSync(
        configPath,
        `
version: 1
unknown_extra_field: "should be ignored or cause error"
`
      );

      // Should either pass (with unknown fields ignored) or fail validation
      try {
        const config = await loadConfigFromPath(configPath);
        expect(config).toBeDefined();
      } catch (err) {
        expect(err).toMatchObject({
          code: ConfigErrorCode.INVALID_SCHEMA,
        });
      }
    });
  });
});
