/**
 * Generate Docs Manifest
 *
 * Scans the /docs directory for markdown files and generates a manifest.json
 * that the docs viewer uses for dynamic file discovery.
 * Supports nested folders with hierarchical structure.
 *
 * SECURITY:
 * - Uses async fs operations for non-blocking performance
 * - Validates entry names to prevent path traversal attacks
 * - Only includes .md files from trusted /docs directory
 *
 * Usage: node scripts/generate-docs-manifest.cjs
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

const DOCS_DIR = path.join(__dirname, '..', 'docs');
const VIEWER_DIR = path.join(DOCS_DIR, 'viewer');
const MANIFEST_PATH = path.join(VIEWER_DIR, 'manifest.json');

// Files/directories to exclude from the manifest
const EXCLUDE = new Set(['index.html', 'viewer']);

/**
 * Validate an entry name is safe for path construction.
 * SECURITY: Prevents path traversal attacks if manifest is ever generated
 * from untrusted sources. Defense-in-depth for build-time security.
 *
 * @param {string} name - Entry name to validate
 * @returns {boolean} - True if the name is safe
 */
function isValidEntryName(name) {
  // Block path traversal attempts
  if (name.includes('..')) return false;
  // Block absolute paths (Windows and Unix)
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return false;
  // Block null bytes (injection vector)
  if (name.includes('\0')) return false;
  // Block hidden files/directories (starting with .)
  if (name.startsWith('.')) return false;
  // Block backslash (Windows path separator could be injection vector)
  if (name.includes('\\')) return false;
  return true;
}

/**
 * Recursively scan a directory for markdown files (async)
 * @param {string} dir - Directory to scan
 * @param {string} relativePath - Relative path from docs root
 * @returns {Promise<Array>} - Array of file/folder entries
 */
async function scanDirectory(dir, relativePath = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    // Skip excluded files/directories
    if (EXCLUDE.has(entry.name)) continue;

    // SECURITY: Validate entry name before using in path construction
    if (!isValidEntryName(entry.name)) {
      console.warn(`⚠ Skipping unsafe entry: ${entry.name}`);
      continue;
    }

    const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      // Recursively scan subdirectory
      const children = await scanDirectory(path.join(dir, entry.name), entryRelativePath);
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

/**
 * Generate the manifest file (async)
 */
async function generateManifest() {
  const tree = await scanDirectory(DOCS_DIR);
  const flatFiles = flattenTree(tree);

  const manifest = {
    version: 2,
    tree: tree,
    files: flatFiles, // Backward compatible flat list
  };

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✓ Generated manifest with ${flatFiles.length} documentation files`);
  console.log(`  Output: ${MANIFEST_PATH}`);

  // List the files for verification
  console.log('\nFiles included:');
  for (const file of flatFiles) {
    console.log(`  - ${file.name}`);
  }
}

// Run the generator
generateManifest().catch((error) => {
  console.error('Error generating manifest:', error);
  process.exit(1);
});
