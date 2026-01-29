# Feature Specification: Documentation Viewer Refactor

**Feature Branch**: `008-docs-viewer-refactor`
**Created**: 2026-01-28
**Status**: Draft
**Input**: User description: "The /docs/viewer is not working properly and is going to require a major refactor, including a simple live reload dev server we can use for local testing before pushing to GitHub. Documentation viewer index page (docs/index.md) should be the front page - not the weird document/% markdown count."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Documentation Reader Sees Meaningful Landing Page (Priority: P1)

A documentation reader visits the documentation viewer and immediately sees the actual documentation content (docs/index.md) rendered as the landing page, providing a welcoming introduction with navigation links to different documentation sections.

**Why this priority**: The current landing page showing "8 Documents" and "100% Markdown" statistics provides no value to users seeking documentation. The actual index.md contains navigation tables, quick start links, and useful content that should be the first thing users see.

**Independent Test**: Can be fully tested by opening the viewer in a browser and verifying that docs/index.md content appears immediately without requiring any clicks or navigation.

**Acceptance Scenarios**:

1. **Given** a user navigates to the documentation viewer root URL, **When** the page loads, **Then** the content from docs/index.md is rendered in the main content area with all navigation links functional.
2. **Given** a user is viewing the index.md landing page, **When** they click a navigation link (e.g., "Getting Started"), **Then** they are navigated to the corresponding documentation section within the viewer.
3. **Given** a user accesses the viewer via a direct link to a specific document (e.g., #getting-started/quick-start.md), **When** the page loads, **Then** that specific document is displayed instead of the index.md landing page.

---

### User Story 2 - Developer Uses Live Reload Dev Server (Priority: P2)

A developer working on documentation can run a local development server that automatically reloads when markdown files or viewer code changes, allowing rapid iteration without manual browser refreshes or pushing to GitHub.

**Why this priority**: Currently developers must push changes to GitHub to see how documentation renders, creating a slow feedback loop. A local dev server enables faster iteration and catches issues before they reach the repository.

**Independent Test**: Can be fully tested by running a single command, editing a markdown file, and observing the browser automatically updates to show the changes.

**Acceptance Scenarios**:

1. **Given** a developer runs the dev server command, **When** the server starts, **Then** the documentation viewer opens in the default browser at a local URL showing the current documentation.
2. **Given** the dev server is running and a markdown file is modified, **When** the file is saved, **Then** the browser automatically reloads and displays the updated content within 2 seconds.
3. **Given** the dev server is running and viewer code (HTML/JS/CSS) is modified, **When** the file is saved, **Then** the browser automatically reloads with the updated viewer.
4. **Given** a developer attempts to start the dev server, **When** port conflicts exist, **Then** the server provides a clear error message with the conflicting port information.

---

### User Story 3 - Navigation Sidebar Shows Accurate Statistics (Priority: P3)

The documentation viewer sidebar displays accurate information about the documentation structure, showing the correct count of documentation files and meaningful organization metrics.

**Why this priority**: While the landing page fix (P1) addresses the primary user-facing issue, correcting the statistics ensures consistency and professionalism. This is lower priority because it doesn't block documentation consumption.

**Independent Test**: Can be verified by counting markdown files in the docs directory and comparing to the displayed count in the viewer.

**Acceptance Scenarios**:

1. **Given** a user views the documentation viewer, **When** statistics are displayed, **Then** the document count reflects the actual number of markdown files (not just top-level folders).
2. **Given** new documentation files are added to the repository, **When** the manifest is regenerated and viewer loads, **Then** the statistics update to reflect the new count.

---

### Edge Cases

- What happens when docs/index.md is missing or empty? The viewer displays a helpful message indicating the documentation index is not available.
- How does the system handle the dev server when running on Windows vs Unix systems? The server works consistently across both operating systems using proven file watcher with path normalization to forward slashes.
- What happens when the dev server cannot find the docs directory? The server fails with a clear error message indicating the docs directory path.
- What happens when a user bookmarks a specific document URL and later that document is removed? The viewer displays identical "document not found" message (same for direct hash load, link click, and back/forward navigation).
- What happens when a markdown file contains a link to a non-existent doc? The viewer displays "document not found" when the user clicks the link.
- What happens when the dev server port is already in use? The server fails loudly and displays the conflicting port number.
- What happens when reload script injection code accidentally remains in production build? Structurally impossible: dev server injects SSE script at response time (never writes to files); production `index.html` has no reload code.
- What happens when manifest.json is out of sync with filesystem? Dev server regenerates manifest on startup and file add/remove; prints warning when requested doc exists on disk but missing from manifest.
- What happens when a user clicks an in-doc heading anchor link? System scrolls to element by ID without modifying URL hash (prevents router conflict with doc navigation).
- What happens when a markdown link has format `../other.md#section`? System strips `#section` suffix, normalizes path, looks up in manifest; if found, navigates to doc (anchor portion ignored for routing).

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: System MUST render docs/index.md as the default landing page when no specific document is requested via URL hash.
- **FR-002**: System MUST use a single hash format `#path/to/doc.md` (full path from docs root) for document navigation; hash is reserved for doc routing only.
- **FR-002a**: System MUST handle in-doc heading anchors via scroll-to-id without modifying URL hash (click heading link scrolls to element by ID, URL unchanged, no router conflict).
- **FR-003**: System MUST perform single-pass initial render—resolve requested doc (from hash or default to index.md) once, then render once; no intermediate "render then correct" pattern.
- **FR-004**: System MUST provide a development server command (`npm run dev`) that serves the documentation viewer locally.
- **FR-005**: Development server MUST use SSE (Server-Sent Events) for live reload; SSE script injected at response time by dev server (never written to files); production `index.html` contains no reload code.
- **FR-006**: Development server MUST automatically reload the browser when any markdown file in the docs directory is modified.
- **FR-007**: Development server MUST automatically reload the browser when viewer code (HTML, JavaScript, CSS) is modified.
- **FR-008**: System MUST calculate document counts from manifest.json (sole source of truth for doc discovery).
- **FR-008a**: Development server MUST regenerate manifest.json on startup and on file add/remove events; MUST print warning when requested doc exists on disk but is missing from manifest.
- **FR-009**: System MUST preserve existing security features including file allowlist validation and content sanitization; security behavior MUST be covered by automated tests with 5 adversarial fixtures: (1) `<script>` tags, (2) `javascript:` links, (3) `onerror`/`onclick` event handlers, (4) raw HTML blocks with iframes, (5) data: URI in images.
- **FR-010**: System MUST maintain 100% static compatibility with GitHub Pages hosting—no server-side rendering required for production.
- **FR-011**: System MUST use relative paths from viewer root for all fetches (manifest, docs); no absolute paths like `/docs/...` to ensure GitHub Pages base path compatibility.
- **FR-011a**: System MUST include automated test that runs viewer under fake base path (e.g., `/odd-ai-reviewers/docs/viewer/`) and asserts manifest + doc fetches succeed.
- **FR-012**: Development server MUST work on both Windows and Unix-based operating systems using proven file watcher with path normalization.
- **FR-013**: System MUST handle missing or malformed index.md gracefully with a user-friendly fallback message.
- **FR-014**: System MUST rewrite internal markdown links to hash navigation; "internal" defined as: links resolving to a `.md` file under `docs/` after path normalization; handles `./x.md`, `../x.md`, `x.md`, `x.md#anchor` patterns; strips `#anchor` suffix before manifest lookup.
- **FR-015**: System MUST open external links (absolute URLs) in normal browser navigation.
- **FR-016**: System MUST display identical "document not found" message for all three entry points: (1) direct hash load, (2) link click, (3) back/forward navigation; no blank screens.
- **FR-017**: Development server MUST print URL on successful start and fail loudly with port number on port conflicts.
- **FR-018**: System MUST include automated smoke test (HTTP-level, headless, no browser automation): start server, GET `/`, assert known marker from index.md present, GET known doc route, assert marker; deterministic text-based assertions only.

### Key Entities

- **Documentation Manifest**: The manifest.json file containing the hierarchical list of all allowed documentation files, their paths, and metadata.
- **Documentation Viewer**: The client-side application (HTML/JS/CSS) that renders markdown content in the browser.
- **Development Server**: A local server process that serves files and triggers browser reloads on file changes.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Users see meaningful documentation content (index.md) immediately on viewer load via single-pass render (no flicker or "wrong doc" flash).
- **SC-002**: Documentation changes are visible in the browser promptly after saving a file when using the dev server (2s is UX target; tests verify eventual reload and correct content, not timing).
- **SC-003**: Dev server starts successfully with `npm run dev` command, prints URL, and requires no additional configuration.
- **SC-004**: All existing documentation links and navigation continue to function correctly after the refactor.
- **SC-005**: The viewer displays the correct count of documentation files (derived from manifest.json).
- **SC-006**: The refactored viewer passes all existing security validations (path traversal prevention, content sanitization) verified by automated tests with adversarial fixtures.
- **SC-007**: Automated smoke test verifies: dev server boots, fetches root and confirms index.md renders, fetches a known doc path and confirms it renders.
- **SC-008**: Viewer functions correctly on GitHub Pages under repository subpath (e.g., `/<repo>/docs/viewer/`) using relative path fetches.

## Clarifications

### Session 2026-01-28

- Q: URL scheme for document navigation? → A: Single hash format `#path/to/doc.md` (full path from docs root); hash reserved for doc routing only, no in-doc anchors via hash
- Q: How to handle initial render to avoid flicker? → A: Single-pass render—resolve doc (hash or default index.md) once at load, render once; no "render index then correct" pattern
- Q: Production vs dev server architecture? → A: Production 100% static (GH Pages compatible); dev server is wrapper only (static files + reload trigger), no SSR or special API
- Q: Base path handling for GitHub Pages? → A: Use relative paths from viewer root (or computed base URL); avoid absolute fetches like `/docs/...` or `/manifest.json`
- Q: Source of truth for doc discovery and counts? → A: manifest.json is sole source of truth; dev server may regenerate manifest on change, existing lint-staged workflow acceptable
- Q: Live reload implementation approach? → A: SSE (Server-Sent Events); inject reload script only in dev; ensure script cannot ship to GH Pages artifacts
- Q: Markdown link handling behavior? → A: Internal doc links rewrite to hash navigation; external links open normally; links to non-existent docs show "not found" message
- Q: Timing goals in tests? → A: "Reload within 2s" is UX target only; tests assert eventual reload and correct content, not timing (avoid flaky CI)
- Q: Dev command requirements? → A: Single `npm run dev` command; print URL on start; fail loudly on port-in-use with port number; include smoke test

### Session 2026-01-28 (Round 2)

- Q: How to handle in-doc heading anchors since hash is reserved for doc routing? → A: Use scroll-to-id without changing URL; heading anchor links scroll to element by ID but do not modify URL hash (prevents router conflict)
- Q: Precise definition of "internal" link for rewriting? → A: Rewrite only links that resolve to a `.md` file under `docs/` after path normalization; strip any `#anchor` suffix before lookup; handle `./x.md`, `../x.md`, `x.md`, and `x.md#anchor` patterns
- Q: How to prevent manifest desync footgun in dev? → A: Dev server regenerates manifest.json on startup and on file add/remove events; prints warning when requested doc exists on disk but missing from manifest
- Q: How to enforce relative paths don't regress? → A: Add automated test that runs viewer under fake base path (e.g., `/odd-ai-reviewers/docs/viewer/`) and asserts manifest + doc fetches succeed
- Q: How to structurally prevent SSE script shipping to production? → A: Dev server injects SSE script at response time (never written to files); production `index.html` has no reload code
- Q: Smoke test flakiness prevention? → A: HTTP-level headless test only (no browser automation); start server, GET `/`, assert known marker from index.md present, GET known doc route, assert marker; deterministic text-based assertions
- Q: Which adversarial fixtures for sanitization tests? → A: 5 fixtures: (1) `<script>` tags, (2) `javascript:` links, (3) `onerror`/`onclick` event handlers, (4) raw HTML blocks with iframes, (5) data: URI in images
- Q: Document-not-found consistency across entry points? → A: Identical "document not found" behavior for all three: direct hash load, link click, and back/forward navigation; no blank screens

## Assumptions

- The existing docs/index.md file will be maintained as the canonical documentation landing page content.
- Developers have Node.js available in their development environment for running the dev server.
- The dev server is intended for local development only, not production deployment.
- The existing manifest generation workflow (lint-staged) will continue to be used for keeping manifest.json up to date.
- Browser support targets modern browsers that support ES6+ features (consistent with current viewer requirements).
- File watching uses proven library (e.g., chokidar) with path normalization; excludes node_modules, build outputs, and generated files.
