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
 * Exit codes:
 *   0 - All links valid (or no specs found)
 *   1 - Broken links detected
 *   2 - Script error (file system, glob, etc.)
 */

const { globSync } = require('glob');
const fs = require('fs');
const path = require('path');

const specsPath = path.join(__dirname, '..', 'specs');

// Find all spec.md files
let specFiles;
try {
  specFiles = globSync('*/spec.md', { cwd: specsPath });
} catch (err) {
  console.error(`[spec-linkcheck] ❌ Failed to scan specs directory: ${err.message}`);
  process.exit(2);
}

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
// Per FR-006: Use global matching of single-path pattern, not fixed capture groups
// This ensures ALL backtick-quoted paths on a line are validated, not just the first two
const testCoverageLinePattern = /\*\*Test Coverage\*\*:\s*(.+)/g;
const singlePathPattern = /`([^`]+)`/g;

// Alternative pattern: Test: `path/to/file.ts`
const altTestPattern = /\bTest:\s*`([^`]+)`/g;

for (const specFile of specFiles) {
  const fullPath = path.join(specsPath, specFile);
  let specContent;
  try {
    specContent = fs.readFileSync(fullPath, 'utf-8');
  } catch (err) {
    console.error(`[spec-linkcheck] ❌ Failed to read ${specFile}: ${err.message}`);
    process.exit(2);
  }
  const specDir = path.dirname(fullPath);
  const featureName = path.dirname(specFile);

  // Find all test coverage references
  const testRefs = [];

  // Match **Test Coverage**: `path` pattern - extract ALL paths on the line (FR-006)
  let match;
  while ((match = testCoverageLinePattern.exec(specContent)) !== null) {
    const lineContent = match[1];
    // Extract all backtick-quoted paths from this line using global matching
    let pathMatch;
    // Reset lastIndex for the inner pattern for each line
    singlePathPattern.lastIndex = 0;
    while ((pathMatch = singlePathPattern.exec(lineContent)) !== null) {
      testRefs.push(pathMatch[1]);
    }
  }

  // Reset lastIndex for reuse
  testCoverageLinePattern.lastIndex = 0;

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
