/**
 * Regenerate Docs Manifest for Pre-Commit Hook
 *
 * Called by lint-staged when markdown files in the docs directory change.
 * Ensures Local = CI parity (Invariant 33 from INVARIANTS.md).
 *
 * This script:
 * 1. Regenerates the docs manifest using generate-docs-manifest.cjs
 * 2. Detects if the manifest changed
 * 3. Auto-stages the manifest for the current commit
 *
 * Usage: Called automatically by lint-staged, not for direct invocation.
 */

const { execSync, spawnSync } = require('child_process');
const path = require('path');

const MANIFEST_PATH = 'docs/viewer/manifest.json';

function main() {
  console.log('[docs-manifest] Regenerating manifest due to docs changes...');

  // Run the manifest generator
  try {
    execSync('node scripts/generate-docs-manifest.cjs', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
  } catch (error) {
    console.error('[docs-manifest] Manifest generation failed');
    process.exit(1);
  }

  // Check if manifest has changes (unstaged)
  const diffResult = spawnSync('git', ['diff', '--name-only', MANIFEST_PATH], {
    encoding: 'utf-8',
    cwd: path.join(__dirname, '..'),
  });

  const hasDiff = diffResult.stdout.trim().length > 0;

  if (hasDiff) {
    console.log('[docs-manifest] Manifest changed, staging for commit...');
    try {
      execSync(`git add ${MANIFEST_PATH}`, {
        cwd: path.join(__dirname, '..'),
        stdio: 'inherit',
      });
      console.log('[docs-manifest] Manifest staged successfully');
    } catch (error) {
      console.error('[docs-manifest] Failed to stage manifest');
      process.exit(1);
    }
  } else {
    console.log('[docs-manifest] Manifest unchanged');
  }
}

main();
