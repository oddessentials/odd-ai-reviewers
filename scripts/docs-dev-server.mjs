#!/usr/bin/env node
/**
 * Documentation Dev Server
 *
 * A development server with live reload for the documentation viewer.
 *
 * Features:
 * - Serves docs/viewer/ and docs/ directories
 * - SSE-based live reload on file changes
 * - Automatic manifest regeneration on file add/remove
 * - Response-time SSE client injection (never written to files)
 *
 * Usage:
 *   node scripts/docs-dev-server.mjs [options]
 *
 * Options:
 *   --port <number>     Port to listen on (default: 3000)
 *   --base-path <path>  Base path for serving (default: /)
 *   --no-open           Don't open browser on start
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// ES module dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// MIME types for common file extensions
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

// SSE client script to inject into index.html
const SSE_CLIENT_SCRIPT = `
<script>
(function() {
  const es = new EventSource('/__reload');
  es.onmessage = function(event) {
    if (event.data === 'reload') {
      console.log('[dev-server] Reloading...');
      window.location.reload();
    }
  };
  es.onerror = function() {
    console.log('[dev-server] SSE connection lost, reconnecting...');
  };
})();
</script>
</body>`;

// Parse command line arguments (T028)
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: 3000,
    basePath: '/',
    open: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--port':
        config.port = parseInt(args[++i], 10);
        if (isNaN(config.port)) {
          console.error('Invalid port number');
          process.exit(1);
        }
        break;
      case '--base-path':
        config.basePath = args[++i];
        if (!config.basePath.startsWith('/')) {
          config.basePath = '/' + config.basePath;
        }
        if (!config.basePath.endsWith('/')) {
          config.basePath += '/';
        }
        break;
      case '--no-open':
        config.open = false;
        break;
      case '--help':
      case '-h':
        console.log(`
Documentation Dev Server

Usage: node scripts/docs-dev-server.mjs [options]

Options:
  --port <number>     Port to listen on (default: 3000)
  --base-path <path>  Base path for serving (default: /)
  --no-open           Don't open browser on start
  --help, -h          Show this help message
`);
        process.exit(0);
    }
  }

  return config;
}

function normalizeBasePath(basePath) {
  if (!basePath || basePath === '/') return '/';
  let normalized = basePath;
  if (!normalized.startsWith('/')) normalized = '/' + normalized;
  if (!normalized.endsWith('/')) normalized += '/';
  return normalized;
}

function getRepoBasePath(basePath) {
  const viewerSuffix = '/docs/viewer/';
  const normalized = normalizeBasePath(basePath);
  if (normalized.endsWith(viewerSuffix)) {
    const trimmed = normalized.slice(0, -viewerSuffix.length);
    return trimmed ? normalizeBasePath(trimmed) : '/';
  }
  return normalized;
}

function getViewerMountPath(basePath) {
  const normalized = normalizeBasePath(basePath);
  if (normalized.endsWith('/docs/viewer/')) {
    return normalized;
  }
  return `${normalized}docs/viewer/`;
}

// SSE clients for live reload
const sseClients = new Set();

// Send reload signal to all connected clients
function triggerReload() {
  for (const client of sseClients) {
    client.write('data: reload\n\n');
  }
}

// Regenerate manifest (T024, T025)
function regenerateManifest() {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', ['scripts/generate-docs-manifest.cjs'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[dev-server] Manifest regenerated');
        resolve();
      } else {
        reject(new Error(`Manifest generation failed with code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// Serve a static file
function serveFile(res, filePath, injectSSE = false) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      }
      return;
    }

    // T021: Inject SSE client script into index.html
    if (injectSSE && ext === '.html') {
      let html = data.toString('utf-8');
      html = html.replace('</body>', SSE_CLIENT_SCRIPT);
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache',
      });
      res.end(html);
    } else {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    }
  });
}

// Handle SSE connection (T020)
function handleSSE(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send initial connection message
  res.write('data: connected\n\n');

  // Add to clients set
  sseClients.add(res);

  // Remove on close
  req.on('close', () => {
    sseClients.delete(res);
  });
}

// Create HTTP server (T019)
function createServer(config) {
  const repoBasePath = getRepoBasePath(config.basePath);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${config.port}`);
    let pathname = url.pathname;

    // Handle SSE endpoint (T020)
    if (pathname === '/__reload') {
      handleSSE(req, res);
      return;
    }

    // Strip repository base path if configured
    if (pathname.startsWith(repoBasePath)) {
      const stripped = pathname.slice(repoBasePath.length);
      pathname = `/${stripped.replace(/^\/+/, '')}`;
    }

    // Route to appropriate directory
    let filePath;
    let injectSSE = false;

    if (pathname === '/' || pathname === '/docs/viewer/') {
      filePath = path.join(PROJECT_ROOT, 'docs', 'viewer', 'index.html');
      injectSSE = true;
    } else if (pathname === '/docs/viewer/index.html') {
      filePath = path.join(PROJECT_ROOT, 'docs', 'viewer', 'index.html');
      injectSSE = true;
    } else if (pathname.startsWith('/docs/')) {
      filePath = path.join(PROJECT_ROOT, pathname);
      // Inject SSE into any HTML file in docs/viewer/
      injectSSE = pathname.includes('/docs/viewer/') && pathname.endsWith('.html');
    } else {
      // Default: serve from project root
      filePath = path.join(PROJECT_ROOT, pathname);
    }

    // Normalize path and prevent directory traversal
    filePath = path.normalize(filePath);
    if (!filePath.startsWith(PROJECT_ROOT)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    // Check if path is a directory
    fs.stat(filePath, (err, stats) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        } else {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        }
        return;
      }

      if (stats.isDirectory()) {
        // Try index.html in directory
        const indexPath = path.join(filePath, 'index.html');
        serveFile(res, indexPath, injectSSE);
      } else {
        serveFile(res, filePath, injectSSE);
      }
    });
  });

  return server;
}

// Setup file watcher (T022, T023)
async function setupWatcher(config) {
  // Dynamic import chokidar
  const { default: chokidar } = await import('chokidar');

  const watchPaths = [
    path.join(PROJECT_ROOT, 'docs', '**', '*.md'),
    path.join(PROJECT_ROOT, 'docs', 'viewer', '*'),
  ];

  const watcher = chokidar.watch(watchPaths, {
    ignored: ['**/node_modules/**', '**/manifest.json', '**/.git/**'],
    persistent: true,
    ignoreInitial: true,
  });

  // Track if we need to regenerate manifest
  let manifestDirty = false;
  let debounceTimer = null;

  const debouncedReload = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      if (manifestDirty) {
        try {
          await regenerateManifest();
        } catch (error) {
          console.error('[dev-server] Manifest regeneration failed:', error.message);
        }
        manifestDirty = false;
      }
      triggerReload();
    }, 100);
  };

  watcher.on('change', (filePath) => {
    console.log(`[dev-server] File changed: ${path.relative(PROJECT_ROOT, filePath)}`);
    debouncedReload();
  });

  // T024: Regenerate manifest on add/remove
  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.md')) {
      console.log(`[dev-server] File added: ${path.relative(PROJECT_ROOT, filePath)}`);
      manifestDirty = true;
      debouncedReload();
    }
  });

  watcher.on('unlink', (filePath) => {
    if (filePath.endsWith('.md')) {
      console.log(`[dev-server] File removed: ${path.relative(PROJECT_ROOT, filePath)}`);
      manifestDirty = true;
      debouncedReload();
    }
  });

  watcher.on('error', (error) => {
    console.error('[dev-server] Watcher error:', error);
  });

  return watcher;
}

// Open browser (T029)
function openBrowser(url) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  spawn(command, args, { stdio: 'ignore', detached: true }).unref();
}

// Main entry point
async function main() {
  const config = parseArgs();

  // T025: Regenerate manifest on startup
  console.log('[dev-server] Regenerating manifest...');
  try {
    await regenerateManifest();
  } catch (error) {
    console.error('[dev-server] Warning: Could not regenerate manifest:', error.message);
  }

  const server = createServer(config);

  // T026: Handle port conflict
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`\nError: Port ${config.port} is already in use.`);
      console.error(
        `Try using a different port: node scripts/docs-dev-server.mjs --port ${config.port + 1}\n`
      );
      process.exit(1);
    }
    throw error;
  });

  server.listen(config.port, () => {
    const viewerPath = getViewerMountPath(config.basePath);
    const viewerUrl = `http://localhost:${config.port}${viewerPath}`;

    // T027: Print URL on successful start
    console.log(`\n[dev-server] Server running at http://localhost:${config.port}/`);
    console.log(`[dev-server] Viewer available at ${viewerUrl}`);
    console.log('[dev-server] Press Ctrl+C to stop\n');

    // T029: Open browser
    if (config.open) {
      openBrowser(viewerUrl);
    }
  });

  // Setup file watcher
  await setupWatcher(config);

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[dev-server] Shutting down...');
    server.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('[dev-server] Fatal error:', error);
  process.exit(1);
});
