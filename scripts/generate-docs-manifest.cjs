/**
 * Generate Docs Manifest
 *
 * Scans the /docs directory recursively for markdown files and generates a manifest.json
 * that the docs viewer uses for dynamic file discovery.
 *
 * Supports nested directories for organized documentation structure.
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

/**
 * Recursively scan a directory for markdown files
 * @param {string} dir - Directory to scan
 * @param {string} relativePath - Relative path from docs root (for nested folders)
 * @returns {Array} Array of file objects
 */
function scanDirectory(dir, relativePath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    // Skip excluded items
    if (EXCLUDE.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    const itemRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Recursively scan subdirectories
      const nestedFiles = scanDirectory(fullPath, itemRelativePath);
      files.push(...nestedFiles);
    } else if (entry.name.endsWith('.md')) {
      // Add markdown file to manifest
      // Calculate path relative to viewer directory (which is in /docs/viewer)
      const pathFromViewer = relativePath ? `../${relativePath}/${entry.name}` : `../${entry.name}`;

      files.push({
        name: entry.name,
        type: 'file',
        path: pathFromViewer,
        // Include folder info for nested files (useful for future categorization)
        ...(relativePath && { folder: relativePath }),
      });
    }
  }

  return files;
}

function generateManifest() {
  const files = scanDirectory(DOCS_DIR);

  // Sort alphabetically by name for consistent ordering
  files.sort((a, b) => a.name.localeCompare(b.name));

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
    const prefix = file.folder ? `  [${file.folder}]` : '';
    console.log(`  - ${prefix}${file.name}`);
  }
}

generateManifest();
