/**
 * Generate Docs Manifest
 *
 * Scans the /docs directory for markdown files and generates a manifest.json
 * that the docs viewer uses for dynamic file discovery.
 *
 * Usage: node scripts/generate-docs-manifest.cjs
 */

const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const VIEWER_DIR = path.join(DOCS_DIR, 'viewer');
const MANIFEST_PATH = path.join(VIEWER_DIR, 'manifest.json');

// Files/directories to exclude from the manifest
const EXCLUDE = new Set(['index.html', 'viewer']);

function scanDocsDirectory() {
  const entries = fs.readdirSync(DOCS_DIR, { withFileTypes: true });
  const markdownFiles = [];

  for (const entry of entries) {
    // Skip directories and excluded files
    if (entry.isDirectory()) continue;
    if (EXCLUDE.has(entry.name)) continue;

    // Only include markdown files
    if (entry.name.endsWith('.md')) {
      markdownFiles.push({
        name: entry.name,
        type: 'file',
        path: `../${entry.name}`,
      });
    }
  }

  // Sort alphabetically for consistent ordering
  markdownFiles.sort((a, b) => a.name.localeCompare(b.name));

  return markdownFiles;
}

function generateManifest() {
  const files = scanDocsDirectory();

  const manifest = {
    version: 1,
    files: files,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✓ Generated manifest with ${files.length} documentation files`);
  console.log(`  Output: ${MANIFEST_PATH}`);

  // List the files for verification
  console.log('\nFiles included:');
  for (const file of files) {
    console.log(`  - ${file.name}`);
  }
}

generateManifest();
