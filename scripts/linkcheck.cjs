#!/usr/bin/env node
/**
 * Documentation Link Checker
 *
 * Runs markdown-link-check on all markdown files in docs/.
 * Uses glob pattern expansion to work cross-platform.
 *
 * @see FR-012, FR-013
 */

const { execSync } = require('child_process');
const { globSync } = require('glob');
const path = require('path');

const configPath = path.join(__dirname, '..', '.markdown-link-check.json');
const docsPath = path.join(__dirname, '..', 'docs');

// Find all markdown files in docs/
const files = globSync('**/*.md', { cwd: docsPath });

if (files.length === 0) {
  console.log('No markdown files found in docs/');
  process.exit(0);
}

console.log(`Checking ${files.length} markdown files...\n`);

let hasErrors = false;

for (const file of files) {
  const fullPath = path.join(docsPath, file);
  console.log(`[linkcheck] ${file}`);

  try {
    execSync(`npx markdown-link-check --config "${configPath}" "${fullPath}"`, {
      stdio: 'inherit',
      cwd: path.dirname(fullPath),
    });
  } catch {
    hasErrors = true;
  }
}

if (hasErrors) {
  console.log('\n[linkcheck] Some links failed validation');
  process.exit(1);
} else {
  console.log('\n[linkcheck] All links valid');
}
