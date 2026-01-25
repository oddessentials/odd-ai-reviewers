/**
 * Generate Docs Manifest
 *
 * Scans the /docs directory for markdown files and generates a manifest.json
 * that the docs viewer uses for dynamic file discovery.
 * Supports nested folders with hierarchical structure.
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
 * @param {string} relativePath - Relative path from docs root
 * @returns {Array} - Array of file/folder entries
 */
function scanDirectory(dir, relativePath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    // Skip excluded files/directories
    if (EXCLUDE.has(entry.name)) continue;

    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Recursively scan subdirectory
      const children = scanDirectory(path.join(dir, entry.name), entryRelativePath);
      if (children.length > 0) {
        items.push({
          name: entry.name,
          type: 'folder',
          path: entryRelativePath,
          children: children,
        });
      }
    } else if (entry.name.endsWith('.md')) {
      // Include markdown files
      items.push({
        name: entry.name,
        type: 'file',
        path: `../${entryRelativePath}`,
      });
    }
  }

  // Sort: folders first, then files, alphabetically
  items.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return items;
}

/**
 * Flatten the tree structure for backward compatibility
 * Returns both nested and flat representations
 */
function flattenTree(items, result = []) {
  for (const item of items) {
    if (item.type === 'file') {
      result.push({
        name: item.path.replace('../', ''),
        type: 'file',
        path: item.path,
      });
    } else if (item.type === 'folder' && item.children) {
      flattenTree(item.children, result);
    }
  }
  return result;
}

function generateManifest() {
  const tree = scanDirectory(DOCS_DIR);
  const flatFiles = flattenTree(tree);

  const manifest = {
    version: 2,
    tree: tree,
    files: flatFiles, // Backward compatible flat list
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✓ Generated manifest with ${flatFiles.length} documentation files`);
  console.log(`  Output: ${MANIFEST_PATH}`);

  // List the files for verification
  console.log('\nFiles included:');
  for (const file of flatFiles) {
    console.log(`  - ${file.name}`);
  }
}

generateManifest();
