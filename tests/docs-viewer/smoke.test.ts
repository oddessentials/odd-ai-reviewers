/**
 * Smoke Tests for Documentation Dev Server
 *
 * Tests that the dev server boots correctly and serves content.
 *
 * T018: Smoke test for dev server boot and content serving
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'child_process';
import { setTimeout } from 'timers/promises';

/**
 * Wait for server to start and return the URL.
 * Parses stdout for the server URL.
 */
async function waitForServerUrl(server: ChildProcess, timeoutMs = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = global.setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, timeoutMs);

    let output = '';

    server.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
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
      if (code !== 0 && code !== null) {
        global.clearTimeout(timeout);
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
}

describe('Documentation Dev Server', () => {
  describe('Server Boot (T018)', () => {
    let server: ChildProcess | null = null;
    let serverUrl: string | null = null;

    beforeAll(async () => {
      // Start the dev server
      server = spawn('node', ['scripts/docs-dev-server.mjs', '--port', '3099', '--no-open'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      try {
        serverUrl = await waitForServerUrl(server);
      } catch {
        // Server failed to start - tests will fail appropriately
        serverUrl = null;
      }
    });

    afterAll(async () => {
      if (server) {
        server.kill('SIGTERM');
        await setTimeout(200); // Give server time to clean up
      }
    });

    // Helper to construct URLs properly
    function makeUrl(path: string): string {
      if (!serverUrl) throw new Error('Server not started');
      const base = serverUrl.endsWith('/') ? serverUrl : serverUrl + '/';
      return base + path;
    }

    it('should start and print URL', () => {
      expect(serverUrl).not.toBeNull();
      expect(serverUrl).toMatch(/^http:\/\/localhost:\d+\/?$/);
    });

    it('should serve index.html at viewer root', async () => {
      const response = await fetch(makeUrl('docs/viewer/'));
      expect(response.ok).toBe(true);

      const html = await response.text();
      // The SSE injection modifies the HTML slightly
      expect(html.toLowerCase()).toContain('<!doctype html>');
      expect(html).toContain('Odd AI Reviewers Documentation');
    });

    it('should serve manifest.json', async () => {
      const response = await fetch(makeUrl('docs/viewer/manifest.json'));
      expect(response.ok).toBe(true);

      const manifest = await response.json();
      expect(manifest.version).toBeGreaterThanOrEqual(2);
      expect(manifest.files).toBeDefined();
      expect(Array.isArray(manifest.files)).toBe(true);
    });

    it('should serve markdown files from docs/', async () => {
      // Fetch index.md (should exist in most docs folders)
      const response = await fetch(makeUrl('docs/index.md'));

      // It's okay if index.md doesn't exist - just check we get a valid response
      if (response.ok) {
        const content = await response.text();
        expect(content.length).toBeGreaterThan(0);
      } else {
        // 404 is acceptable if file doesn't exist
        expect(response.status).toBe(404);
      }
    });

    it('should serve static assets (app.js, styles.css)', async () => {
      const [jsResponse, cssResponse] = await Promise.all([
        fetch(makeUrl('docs/viewer/app.js')),
        fetch(makeUrl('docs/viewer/styles.css')),
      ]);

      expect(jsResponse.ok).toBe(true);
      expect(cssResponse.ok).toBe(true);

      const jsContent = await jsResponse.text();
      const cssContent = await cssResponse.text();

      expect(jsContent).toContain('const DocsViewer');
      expect(cssContent.length).toBeGreaterThan(0);
    });
  });

  describe('SSE Endpoint', () => {
    let server: ChildProcess | null = null;
    let serverUrl: string | null = null;

    beforeAll(async () => {
      server = spawn('node', ['scripts/docs-dev-server.mjs', '--port', '3098', '--no-open'], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      try {
        serverUrl = await waitForServerUrl(server);
      } catch {
        serverUrl = null;
      }
    });

    afterAll(async () => {
      if (server) {
        server.kill('SIGTERM');
        await setTimeout(200);
      }
    });

    // Helper to construct URLs properly
    function makeUrl(path: string): string {
      if (!serverUrl) throw new Error('Server not started');
      const base = serverUrl.endsWith('/') ? serverUrl : serverUrl + '/';
      return base + path;
    }

    it('should provide SSE endpoint at /__reload', async () => {
      // SSE endpoints return text/event-stream
      const controller = new AbortController();
      const timeoutId = global.setTimeout(() => controller.abort(), 2000);

      try {
        const response = await fetch(makeUrl('__reload'), {
          signal: controller.signal,
        });

        expect(response.ok).toBe(true);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
      } catch (error) {
        // AbortError is expected since we're cutting the SSE connection short
        if (error instanceof Error && error.name !== 'AbortError') {
          throw error;
        }
      } finally {
        global.clearTimeout(timeoutId);
      }
    });

    it('should inject SSE client script into index.html', async () => {
      const response = await fetch(makeUrl('docs/viewer/index.html'));
      expect(response.ok).toBe(true);

      const html = await response.text();
      // The SSE client should be injected before </body>
      expect(html).toContain('__reload');
      expect(html).toContain('EventSource');
    });
  });
});
