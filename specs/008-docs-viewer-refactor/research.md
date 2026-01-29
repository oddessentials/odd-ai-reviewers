# Research: Documentation Viewer Refactor

**Feature**: 008-docs-viewer-refactor
**Date**: 2026-01-28

## Research Tasks

### 1. File Watching Library Selection

**Decision**: chokidar

**Rationale**:

- Proven cross-platform file watcher with 33M+ weekly downloads
- Native path normalization to forward slashes (critical for Windows compatibility)
- Supports glob patterns for include/exclude
- Used by webpack, vite, nodemon, and other major tools
- No polling needed on modern filesystems (inotify/FSEvents/ReadDirectoryChangesW)

**Alternatives Considered**:

- `fs.watch` (Node.js built-in): Unreliable across platforms, no recursive watching on Windows, known event duplication issues
- `node-watch`: Smaller community, less battle-tested
- `gaze`: Deprecated, archived repository
- `watchpack`: Webpack-specific, heavier dependency

**Implementation Notes**:

- Use `chokidar.watch()` with `ignoreInitial: true` to skip initial add events
- Exclude patterns: `**/node_modules/**`, `**/manifest.json`, `**/.git/**`
- Normalize all paths to forward slashes before comparison

### 2. SSE Live Reload Implementation

**Decision**: Server-Sent Events with response-time injection

**Rationale**:

- SSE is simpler than WebSockets (no handshake, no proxy issues)
- Unidirectional (server → client) is sufficient for reload signals
- Native browser support (EventSource API)
- Response-time injection ensures no reload code in static files

**Alternatives Considered**:

- WebSockets: More complex, bidirectional not needed, proxy configuration issues
- Long polling: More HTTP overhead, more client complexity
- Browser-sync: Heavy dependency, more features than needed
- livereload: Requires injecting script tag into HTML file (leakage risk)

**Implementation Pattern**:

```javascript
// Dev server intercepts index.html requests
// Injects SSE client script at response time:
const SSE_CLIENT = `
<script>
  new EventSource('/__reload').onmessage = () => location.reload();
</script>
`;
// Appended before </body> in streamed response
```

### 3. Single-Pass Render Architecture

**Decision**: Resolve doc target before manifest load completes; defer render until both ready

**Rationale**:

- Hash is available synchronously at page load
- Manifest fetch is async but fast (local file)
- Single render path eliminates flicker

**Implementation Pattern**:

```javascript
async init() {
  // 1. Parse hash synchronously (before any rendering)
  const target = this.parseHash()?.primary || 'index.md';

  // 2. Load manifest (async)
  await this.loadManifest();

  // 3. Single render pass
  if (this.isValidPath(target)) {
    await this.loadFile(target, 'primary');
  } else {
    this.showNotFound(target);
  }
}
// NO showIntro() call on init - removed entirely
```

### 4. Internal Link Definition & Rewriting

**Decision**: Rewrite links matching pattern `[./|../]*.md[#anchor]?` that resolve to manifest entries

**Rationale**:

- Precise definition prevents "some links work" bugs
- Strip `#anchor` before manifest lookup (anchors not supported in hash routing)
- Path normalization handles `./`, `../`, and bare filenames

**Implementation Pattern**:

```javascript
rewriteInternalLinks(container, currentFile) {
  container.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');

    // Skip external links
    if (href.startsWith('http://') || href.startsWith('https://')) return;

    // Skip non-markdown links
    if (!href.includes('.md')) return;

    // Strip anchor suffix
    const [path] = href.split('#');

    // Resolve relative path
    const resolved = this.resolvePath(currentFile, path);

    // Check manifest (case-insensitive)
    const match = this.getAllowedPaths().find(
      p => p.toLowerCase() === resolved.toLowerCase()
    );

    if (match) {
      link.onclick = (e) => {
        e.preventDefault();
        this.loadFile(match, 'primary');
      };
    }
    // Non-matching links show "not found" on click (handled by loadFile)
  });
}
```

### 5. Heading Anchor Handling (Scroll-to-ID)

**Decision**: Use scroll-to-id without URL hash modification

**Rationale**:

- Hash is reserved for doc routing
- Click on heading anchor scrolls to element by ID
- URL remains unchanged (no router conflict)
- Browsers support `element.scrollIntoView()` natively

**Implementation Pattern**:

```javascript
attachHeadingAnchors(container) {
  container.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
    if (!heading.id) return;

    const anchor = document.createElement('a');
    anchor.className = 'heading-anchor';
    anchor.href = `#${heading.id}`; // Visual indicator only
    anchor.onclick = (e) => {
      e.preventDefault();
      heading.scrollIntoView({ behavior: 'smooth' });
    };
    anchor.textContent = '#';
    heading.appendChild(anchor);
  });
}
```

### 6. Dev Server Manifest Regeneration

**Decision**: Regenerate manifest on startup and on file add/remove events

**Rationale**:

- Ensures manifest stays in sync during dev
- Warnings for disk-manifest mismatch help developers understand issues
- Does not regenerate on every file change (only add/remove)

**Implementation Pattern**:

```javascript
// On startup
await regenerateManifest();

// Watch for file add/remove (not content changes)
watcher.on('add', async (path) => {
  if (path.endsWith('.md')) {
    console.log(`📄 New doc: ${path}`);
    await regenerateManifest();
    notifyClients();
  }
});

watcher.on('unlink', async (path) => {
  if (path.endsWith('.md')) {
    console.log(`🗑️ Removed: ${path}`);
    await regenerateManifest();
    notifyClients();
  }
});
```

### 7. Sanitization Test Fixtures

**Decision**: 5 specific adversarial fixtures as defined in spec

**Fixtures**:

1. **Script tags**: `<script>alert('xss')</script>`
2. **JavaScript links**: `<a href="javascript:alert('xss')">click</a>`
3. **Event handlers**: `<img src="x" onerror="alert('xss')">`
4. **Raw HTML with iframes**: `<iframe src="https://evil.com"></iframe>`
5. **Data URI in images**: `<img src="data:text/html,<script>alert('xss')</script>">`

**Test Assertions**:

- All script tags stripped
- All `javascript:` hrefs removed or sanitized
- All event handler attributes (`on*`) removed
- Iframes stripped entirely
- Data URIs with non-image MIME types blocked

### 8. Smoke Test Architecture

**Decision**: HTTP-level headless test using Vitest + native fetch

**Rationale**:

- No browser automation (deterministic, fast, no flakiness)
- Text-based assertions on HTTP responses
- Works identically on Windows and Linux CI

**Implementation Pattern**:

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';

describe('docs dev server smoke test', () => {
  let server;
  let baseUrl;

  beforeAll(async () => {
    // Start server, capture URL from stdout
    server = spawn('node', ['scripts/docs-dev-server.mjs']);
    baseUrl = await waitForServerUrl(server);
  });

  afterAll(() => {
    server.kill();
  });

  it('renders index.md on root request', async () => {
    const res = await fetch(baseUrl);
    const html = await res.text();
    // Assert known marker from index.md
    expect(html).toContain('Welcome to the odd-ai-reviewers documentation');
  });

  it('renders known doc route', async () => {
    const res = await fetch(`${baseUrl}#getting-started/quick-start.md`);
    const html = await res.text();
    expect(html).toContain('Quick Start');
  });
});
```

**Note**: Smoke test fetches HTML shell; actual markdown rendering is client-side. Test validates server serves files correctly and SSE endpoint exists.

### 9. GitHub Pages Base Path Testing

**Decision**: Run viewer under simulated subpath using custom server

**Rationale**:

- GitHub Pages serves from `/<repo>/docs/viewer/`
- Must verify all fetches use relative paths
- Single test catches absolute path regressions

**Implementation Pattern**:

```javascript
it('works under repository subpath', async () => {
  // Start server with --base-path /odd-ai-reviewers/docs/viewer/
  const server = spawn('node', [
    'scripts/docs-dev-server.mjs',
    '--base-path',
    '/odd-ai-reviewers/docs/viewer/',
  ]);

  const baseUrl = await waitForServerUrl(server);

  // Fetch manifest
  const manifestRes = await fetch(`${baseUrl}manifest.json`);
  expect(manifestRes.ok).toBe(true);

  // Fetch a doc
  const docRes = await fetch(`${baseUrl}../index.md`);
  expect(docRes.ok).toBe(true);

  server.kill();
});
```

## Summary

All research tasks resolved. No NEEDS CLARIFICATION items remain.

| Topic               | Decision                                   | Confidence |
| ------------------- | ------------------------------------------ | ---------- |
| File watcher        | chokidar                                   | High       |
| Live reload         | SSE with response-time injection           | High       |
| Render architecture | Single-pass, hash-first                    | High       |
| Link rewriting      | Normalize + strip anchor + manifest lookup | High       |
| Heading anchors     | scroll-to-id, no URL change                | High       |
| Manifest sync       | Regen on startup + add/remove              | High       |
| Security tests      | 5 specific fixtures                        | High       |
| Smoke test          | HTTP-level, Vitest + fetch                 | High       |
| Base path test      | Simulated subpath server                   | High       |
