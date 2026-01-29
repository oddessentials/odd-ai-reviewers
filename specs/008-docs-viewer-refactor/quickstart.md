# Quickstart: Documentation Viewer Refactor

**Feature**: 008-docs-viewer-refactor
**Date**: 2026-01-28

## Prerequisites

- Node.js >= 22.0.0
- pnpm 10.x
- Repository cloned locally

## Development Setup

### 1. Install Dependencies

```bash
pnpm install
```

This will install the new `chokidar` dependency for file watching.

### 2. Start the Dev Server

```bash
npm run docs:dev
```

Expected output:

```
📚 Documentation viewer dev server
✓ Manifest regenerated (33 files)
✓ Server running at http://localhost:3000/
✓ Watching for changes...
```

The browser should open automatically. If not, open http://localhost:3000/ manually.

### 3. Edit Documentation

1. Open any `.md` file in `docs/`
2. Make changes and save
3. Browser automatically reloads within ~2 seconds

### 4. Add New Documentation

1. Create a new `.md` file in `docs/` or a subdirectory
2. Dev server detects the new file
3. Manifest regenerates automatically
4. Browser reloads with updated navigation

## Testing

### Run All Tests

```bash
pnpm test
```

### Run Docs Viewer Tests Only

```bash
pnpm test tests/docs-viewer/
```

### Test Categories

| Test File                | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `sanitization.test.ts`   | Verify XSS protection with 5 adversarial fixtures |
| `base-path.test.ts`      | Verify GitHub Pages subpath compatibility         |
| `smoke.test.ts`          | Verify dev server boots and serves content        |
| `link-rewriting.test.ts` | Verify internal link normalization                |

## Common Tasks

### Regenerate Manifest Manually

```bash
npm run docs:manifest
```

### Check Links

```bash
npm run docs:linkcheck
```

### View Production Version

Open `docs/viewer/index.html` directly in a browser (file:// protocol).
Note: Some features may not work due to CORS restrictions.

## Troubleshooting

### Port Already in Use

If you see an error like:

```
Error: Port 3000 is already in use
```

Either:

- Stop the other process using port 3000
- Use a different port: `npm run docs:dev -- --port 3001`

### Changes Not Appearing

1. Check that the file is saved
2. Check the terminal for any errors
3. Try refreshing the browser manually
4. Verify the file is a `.md`, `.js`, `.css`, or `.html` file

### New File Not in Navigation

1. Wait a moment for manifest regeneration
2. Check terminal for "Manifest regenerated" message
3. If still missing, run `npm run docs:manifest` manually

### SSE Connection Lost

The browser will automatically reconnect. If issues persist:

1. Refresh the page
2. Check that the dev server is still running

## Architecture Overview

```
┌────────────────────────────────────────────────────────┐
│                      Browser                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  index.html  │  │   app.js     │  │ styles.css   │  │
│  │  (shell)     │  │ (viewer)     │  │ (theme)      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│         │                │                              │
│         │     fetch markdown files                      │
│         ▼                ▼                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │              manifest.json                        │  │
│  │         (source of truth for docs)                │  │
│  └──────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────┘
           │                    ▲
    SSE reload signal          │ serves
           │                    │
           ▼                    │
┌────────────────────────────────────────────────────────┐
│                   Dev Server                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ HTTP Server  │  │  chokidar    │  │ Manifest     │  │
│  │ (static +    │  │  (watcher)   │  │ Generator    │  │
│  │  SSE inject) │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────────────────────────────────────┘
           │
    watches for changes
           │
           ▼
┌────────────────────────────────────────────────────────┐
│                   File System                           │
│  docs/                                                  │
│  ├── index.md           (landing page)                 │
│  ├── viewer/            (viewer app)                   │
│  ├── architecture/      (docs)                         │
│  ├── configuration/     (docs)                         │
│  └── ...                                               │
└────────────────────────────────────────────────────────┘
```

## Key Files

| File                                 | Purpose                  | Modified         |
| ------------------------------------ | ------------------------ | ---------------- |
| `docs/viewer/app.js`                 | Viewer application logic | Yes - refactored |
| `docs/viewer/index.html`             | Viewer HTML shell        | Minimal changes  |
| `scripts/docs-dev-server.mjs`        | Live reload dev server   | New              |
| `scripts/generate-docs-manifest.cjs` | Manifest generator       | Unchanged        |
| `tests/docs-viewer/*.test.ts`        | New test suite           | New              |
| `package.json`                       | New `docs:dev` script    | Modified         |
