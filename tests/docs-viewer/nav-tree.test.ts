/**
 * Navigation Tree Tests for Documentation Viewer
 *
 * Ensures the sidebar tree uses manifest paths for routing and highlights
 * without relying on leaf filenames (prevents duplicate index.md collisions).
 */

import { describe, it, expect } from 'vitest';

describe('Navigation Tree Logic', () => {
  it('should route using normalized manifest paths', async () => {
    const fs = await import('fs/promises');
    const path = await import('path');

    const appJsPath = path.resolve('docs/viewer/app.js');
    const content = await fs.readFile(appJsPath, 'utf-8');

    // Ensure we do not route using leaf name directly
    expect(content).not.toMatch(/loadFile\(\s*item\.name/);

    // Ensure file links store normalized paths for highlighting
    expect(content).toMatch(/dataset\.file/);
  });
});
