#!/usr/bin/env node
/**
 * Spec-to-Test Link Checker
 *
 * Validates that test file references in spec.md files actually exist.
 * Prevents link rot by failing CI if a spec references a non-existent test.
 *
 * Usage:
 *   node scripts/check-spec-test-links.cjs
 *
 * Spec format for test coverage:
 *   **Test Coverage**: `path/to/test.test.ts`
 *
 * @see NEXT_STEPS.md - "Specs: make acceptance criteria provably testable"
 */

const { globSync } = require('glob');
const fs = require('fs');
const path = require('path');

const specsPath = path.join(__dirname, '..', 'specs');

// Find all spec.md files
const specFiles = globSync('*/spec.md', { cwd: specsPath });

if (specFiles.length === 0) {
  console.log('[spec-linkcheck] No spec.md files found in specs/');
  process.exit(0);
}

console.log(
  `[spec-linkcheck] Checking ${specFiles.length} spec files for test coverage links...\n`
);

let hasErrors = false;
const errors = [];
let totalLinks = 0;
let validLinks = 0;

// Regex patterns to match test coverage annotations
// Matches: **Test Coverage**: `path/to/file.ts`
// Also matches: **Test Coverage**: `path/to/file.test.ts`, `path/to/other.test.ts`
const testCoveragePattern = /\*\*Test Coverage\*\*:\s*`([^`]+)`(?:\s*,\s*`([^`]+)`)?/g;

// Alternative pattern: Test: `path/to/file.ts`
const altTestPattern = /\bTest:\s*`([^`]+)`/g;

for (const specFile of specFiles) {
  const fullPath = path.join(specsPath, specFile);
  const specContent = fs.readFileSync(fullPath, 'utf-8');
  const specDir = path.dirname(fullPath);
  const featureName = path.dirname(specFile);

  // Find all test coverage references
  const testRefs = [];

  // Match **Test Coverage**: `path` pattern
  let match;
  while ((match = testCoveragePattern.exec(specContent)) !== null) {
    testRefs.push(match[1]);
    if (match[2]) {
      testRefs.push(match[2]);
    }
  }

  // Reset lastIndex for reuse
  testCoveragePattern.lastIndex = 0;

  // Also match simpler Test: `path` pattern
  while ((match = altTestPattern.exec(specContent)) !== null) {
    testRefs.push(match[1]);
  }
  altTestPattern.lastIndex = 0;

  if (testRefs.length === 0) {
    // No test coverage annotations in this spec - just note it
    console.log(`[spec-linkcheck] ${specFile}: No test coverage annotations found (optional)`);
    continue;
  }

  console.log(`[spec-linkcheck] ${specFile}: Found ${testRefs.length} test reference(s)`);

  for (const testPath of testRefs) {
    totalLinks++;

    // Resolve the test path relative to project root
    const projectRoot = path.join(__dirname, '..');
    const absoluteTestPath = path.resolve(projectRoot, testPath);

    if (fs.existsSync(absoluteTestPath)) {
      validLinks++;
      console.log(`  ✓ ${testPath}`);
    } else {
      hasErrors = true;
      errors.push({
        spec: specFile,
        testPath: testPath,
        resolved: absoluteTestPath,
      });
      console.log(`  ✗ ${testPath} (NOT FOUND)`);
    }
  }
}

console.log('');

if (hasErrors) {
  console.log('[spec-linkcheck] ❌ Spec-to-test validation FAILED');
  console.log(`\nBroken test references (${errors.length}):`);
  for (const error of errors) {
    console.log(`\n  Spec: ${error.spec}`);
    console.log(`  Referenced: ${error.testPath}`);
    console.log(`  Resolved to: ${error.resolved}`);
  }
  console.log('\nTo fix:');
  console.log('  1. Update the **Test Coverage** path in the spec to match the actual test file');
  console.log('  2. Or create the missing test file');
  console.log('  3. Or remove the Test Coverage annotation if tests are not yet written');
  process.exit(1);
} else {
  console.log('[spec-linkcheck] ✓ All spec-to-test links valid');
  console.log(`  Total links checked: ${totalLinks}`);
  console.log(`  Valid: ${validLinks}`);
  process.exit(0);
}
