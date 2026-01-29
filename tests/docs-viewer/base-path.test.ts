/**
 * Base Path Tests for Documentation Viewer
 *
 * Tests that the viewer works correctly under GitHub Pages subpath
 * (e.g., /<repo>/docs/viewer/) by verifying all fetches use relative paths.
 *
 * FR-011: System MUST use relative paths from viewer root for all fetches
 * FR-011a: System MUST include automated test under fake base path
 */

import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

/**
 * Wait for server to start and return the URL.
 * Parses stdout for the server URL.
 */
async function waitForServerUrl(server: ChildProcess, timeoutMs = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = global.setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, timeoutMs);

    server.stdout?.on('data', (data: Buffer) => {
      const output = data.toString();
      // Look for URL in output like "Server running at http://localhost:3000/"
      const urlMatch = output.match(/http:\/\/localhost:\d+\/?/);
      if (urlMatch) {
        global.clearTimeout(timeout);
        resolve(urlMatch[0]);
      }
    });

    server.stderr?.on('data', (data: Buffer) => {
      console.error('Server stderr:', data.toString());
    });

    server.on('error', (err) => {
      global.clearTimeout(timeout);
      reject(err);
    });

    server.on('exit', (code) => {
      if (code !== 0) {
        global.clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}

function getViewerUrl(port: number, basePath: string): string {
  let normalized = basePath;
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  if (!normalized.endsWith('/')) normalized += '/';
  if (!normalized.endsWith('/docs/viewer/')) {
    normalized = `${normalized}docs/viewer/`;
  }
  return `http://localhost:${port}${normalized}`;
}

describe('GitHub Pages Base Path Compatibility', () => {
  describe('Relative Path Verification (FR-011)', () => {
    it('should use relative paths in app.js basePath', async () => {
      // Read app.js and verify basePath is relative
      const fs = await import('fs/promises');
      const path = await import('path');

      const appJsPath = path.resolve('docs/viewer/app.js');
      const content = await fs.readFile(appJsPath, 'utf-8');

      // Verify basePath is relative (starts with ./ or ../)
      expect(content).toMatch(/basePath:\s*['"]\.\.?\/?['"]/);

      // Verify no absolute paths like /docs/ or /manifest.json
      expect(content).not.toMatch(/fetch\s*\(\s*['"]\/docs\//);
      expect(content).not.toMatch(/fetch\s*\(\s*['"]\/manifest\.json/);
    });

    it('should use relative path for manifest.json fetch', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const appJsPath = path.resolve('docs/viewer/app.js');
      const content = await fs.readFile(appJsPath, 'utf-8');

      // Verify manifest fetch uses relative path
      expect(content).toMatch(/fetch\s*\(\s*['"]\.\/manifest\.json['"]/);
    });

    it('should use relative basePath for document fetches', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const appJsPath = path.resolve('docs/viewer/app.js');
      const content = await fs.readFile(appJsPath, 'utf-8');

      // Verify document fetches use basePath (which is relative)
      expect(content).toMatch(/fetch\s*\(\s*`\$\{this\.basePath\}|fetch\s*\(\s*this\.basePath/);
    });
  });

  describe('Subpath Simulation (FR-011a)', () => {
    let server: ChildProcess | null = null;
    const basePath = '/odd-ai-reviewers/docs/viewer/';
    const port = 3001;

    async function ensureServer() {
      if (server) return;
      server = spawn('node', [
        'scripts/docs-dev-server.mjs',
        '--base-path',
        basePath,
        '--port',
        String(port),
      ]);
      await waitForServerUrl(server);
    }

    afterAll(async () => {
      if (server) {
        server.kill();
        await setTimeout(100); // Give server time to clean up
      }
    });

    it('should serve manifest.json under fake base path', async () => {
      // Note: This test requires the dev server to support --base-path flag
      await ensureServer();
      const baseUrl = getViewerUrl(port, basePath);

      // Fetch manifest
      const manifestRes = await fetch(`${baseUrl}manifest.json`);
      expect(manifestRes.ok).toBe(true);

      const manifest = await manifestRes.json();
      expect(manifest.version).toBeGreaterThanOrEqual(2);
      expect(manifest.files).toBeDefined();
      expect(Array.isArray(manifest.files)).toBe(true);
    });

    it('should serve documents under fake base path', async () => {
      // Note: Requires running dev server with --base-path
      await ensureServer();

      // Fetch a known doc (relative from viewer)
      const baseUrl = getViewerUrl(port, basePath);
      const docUrl = new URL('../index.md', baseUrl).toString();
      const docRes = await fetch(docUrl);
      expect(docRes.ok).toBe(true);

      const content = await docRes.text();
      expect(content.length).toBeGreaterThan(0);
    });
  });

  describe('Index.html Static Verification', () => {
    it('should not contain absolute paths in index.html', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const indexPath = path.resolve('docs/viewer/index.html');
      const content = await fs.readFile(indexPath, 'utf-8');

      // Verify no absolute paths (except CDN URLs which are expected)
      // Check for local absolute paths like /docs/, /viewer/, etc.
      const localAbsolutePaths = content.match(/(?:src|href)=["']\/(?!\/)/g);

      if (localAbsolutePaths) {
        // Filter out any that might be false positives
        const realAbsolutePaths = localAbsolutePaths.filter((p) => {
          // CDN URLs start with // or https://
          return !p.includes('//');
        });
        expect(realAbsolutePaths).toHaveLength(0);
      }
    });

    it('should use relative paths for local resources', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      const indexPath = path.resolve('docs/viewer/index.html');
      const content = await fs.readFile(indexPath, 'utf-8');

      // Check stylesheet link is relative
      expect(content).toMatch(/href=["']styles\.css["']/);

      // Check app.js script is relative
      expect(content).toMatch(/src=["']app\.js["']/);
    });
  });
});
