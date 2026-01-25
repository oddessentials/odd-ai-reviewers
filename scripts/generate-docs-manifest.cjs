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

const EXCLUDE_DIRS = new Set(['viewer']);
const EXCLUDE_FILES = new Set(['index.html']);

function sortTreeItems(items) {
  items.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return items;
}

function scanDocsDirectory(relativeDir = '') {
  const absoluteDir = path.join(DOCS_DIR, relativeDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      const childRelativeDir = path.join(relativeDir, entry.name);
      const children = scanDocsDirectory(childRelativeDir);

      if (children.length > 0) {
        items.push({
          name: entry.name,
          type: 'dir',
          children: children,
        });
      }

      continue;
    }

    if (!entry.isFile()) continue;
    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (!entry.name.endsWith('.md')) continue;

    const filePath = path.posix.join(relativeDir, entry.name).replace(/\\/g, '/');

    items.push({
      name: entry.name,
      type: 'file',
      path: filePath,
    });
  }

  return sortTreeItems(items);
}

function generateManifest() {
  const files = scanDocsDirectory();

  const manifest = {
    version: 2,
    files: files,
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`✓ Generated manifest with ${files.length} documentation entries`);
  console.log(`  Output: ${MANIFEST_PATH}`);
}

generateManifest();
