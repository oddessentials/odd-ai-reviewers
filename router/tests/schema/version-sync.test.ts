/**
 * Schema Compliance Tests: Version Synchronization
 *
 * PR_LESSONS_LEARNED.md Requirement #9: Keep VERSION files synchronized
 * "If your CLI reads version from a file at runtime, ensure your release
 * process updates ALL version sources"
 *
 * These tests verify that version information is consistent across:
 * - package.json
 * - Runtime version reporting
 * - JSON output schema version
 *
 * @module tests/schema/version-sync
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { JSON_SCHEMA_VERSION } from '../../src/report/terminal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROUTER_ROOT = join(__dirname, '..', '..');

describe('T129: Version Synchronization', () => {
  describe('Package Version', () => {
    it('should have a valid version in package.json', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg).toHaveProperty('version');
      expect(typeof pkg.version).toBe('string');

      // Should be valid semver format
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });

    it('should have required package metadata', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      // Required fields for publishing
      expect(pkg).toHaveProperty('name');
      expect(pkg).toHaveProperty('description');
      expect(pkg).toHaveProperty('version');
      expect(pkg).toHaveProperty('license');
    });

    it('should have consistent bin name', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg).toHaveProperty('bin');
      expect(pkg.bin).toHaveProperty('ai-review');
    });
  });

  describe('Schema Version', () => {
    it('should have JSON_SCHEMA_VERSION constant defined', () => {
      expect(JSON_SCHEMA_VERSION).toBeDefined();
      expect(typeof JSON_SCHEMA_VERSION).toBe('string');
    });

    it('should have valid semver format for schema version', () => {
      expect(JSON_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe('Version Consistency', () => {
    it('should not have mismatched versions in different locations', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      // If there's a VERSION file, it should match package.json
      const versionFilePath = join(ROUTER_ROOT, 'VERSION');
      if (existsSync(versionFilePath)) {
        const versionFileContent = readFileSync(versionFilePath, 'utf-8').trim();
        expect(versionFileContent).toBe(pkg.version);
      }
    });

    it('should have version accessible for runtime reporting', async () => {
      // The version should be importable/readable at runtime
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      // Version should be a valid string that can be used in output
      expect(pkg.version).toBeTruthy();
      expect(pkg.version.length).toBeGreaterThan(0);
    });
  });

  describe('Version in Output', () => {
    it('should include version in JSON output context', async () => {
      const { generateJsonOutput, createDefaultContext } =
        await import('../../src/report/terminal.js');

      const context = {
        ...createDefaultContext(),
        version: '1.2.3', // Simulated version
      };

      const output = generateJsonOutput([], [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('version');
      expect(parsed.version).toBe('1.2.3');
    });

    it('should default to 0.0.0 when version not provided', async () => {
      const { generateJsonOutput, createDefaultContext } =
        await import('../../src/report/terminal.js');

      const context = createDefaultContext();
      // Don't set version

      const output = generateJsonOutput([], [], context, []);
      const parsed = JSON.parse(output);

      expect(parsed).toHaveProperty('version');
      expect(parsed.version).toBe('0.0.0');
    });

    it('should include version in SARIF output', async () => {
      const { generateSarifOutput, createDefaultContext } =
        await import('../../src/report/terminal.js');

      const context = {
        ...createDefaultContext(),
        version: '1.2.3',
      };

      const output = generateSarifOutput([], context);
      const parsed = JSON.parse(output);

      expect(parsed.runs[0].tool.driver).toHaveProperty('version');
      expect(parsed.runs[0].tool.driver.version).toBe('1.2.3');
    });
  });

  describe('Main Entry Point', () => {
    it('should have main entry point in package.json', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg).toHaveProperty('main');
      expect(pkg.main).toContain('main.js');
    });

    it('should have type: module for ESM', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg).toHaveProperty('type');
      expect(pkg.type).toBe('module');
    });
  });

  describe('Files Field', () => {
    it('should have files field for npm publish', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg).toHaveProperty('files');
      expect(Array.isArray(pkg.files)).toBe(true);
    });

    it('should include dist directory in files', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.files).toContain('dist');
    });

    it('should include README in files', () => {
      const pkgPath = join(ROUTER_ROOT, 'package.json');
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

      expect(pkg.files.some((f: string) => f.toLowerCase().includes('readme'))).toBe(true);
    });
  });
});
