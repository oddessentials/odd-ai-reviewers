# Implementation Plan: Documentation Viewer Refactor

**Branch**: `008-docs-viewer-refactor` | **Date**: 2026-01-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-docs-viewer-refactor/spec.md`

## Summary

Refactor the documentation viewer to render `docs/index.md` as the default landing page (replacing the "8 Documents / 100% Markdown" statistics splash), add a live reload development server with SSE for local testing, fix document counting to use manifest.json correctly, and ensure all navigation/link handling is consistent and testable.

## Technical Context

**Language/Version**: JavaScript ES6+ (client-side), Node.js >=22.0.0 (dev server)
**Primary Dependencies**: marked.js (markdown), DOMPurify (sanitization), mermaid (diagrams) - all CDN; chokidar (file watching - new), http (Node.js built-in)
**Storage**: N/A (ephemeral, static files only)
**Testing**: Vitest (unit/integration), HTTP-level smoke tests (no browser automation)
**Target Platform**: Modern browsers (ES6+), GitHub Pages (static hosting)
**Project Type**: Single project - docs tooling
**Performance Goals**: Initial render <1s, live reload <2s (UX target)
**Constraints**: 100% static production, no SSR, relative paths only, GitHub Pages subpath compatible
**Scale/Scope**: ~33 documentation files, single developer workflow

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Principle                        | Status   | Notes                                                                                            |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| I. Router Owns All Posting       | N/A      | Docs viewer is separate tooling, not core review system                                          |
| II. Structured Findings Contract | N/A      | No findings output                                                                               |
| III. Provider-Neutral Core       | N/A      | Docs tooling, not provider integration                                                           |
| IV. Security-First Design        | **PASS** | DOMPurify sanitization preserved, file allowlist maintained, adversarial test fixtures specified |
| V. Deterministic Outputs         | **PASS** | Manifest as sole source of truth, stable doc counts                                              |
| VI. Bounded Resources            | **PASS** | No new resource consumption, dev server is local-only                                            |
| VII. Environment Discipline      | **PASS** | Node.js >=22, chokidar is proven watcher (no curl\|bash)                                         |
| VIII. Explicit Non-Goals         | **PASS** | Docs viewer is existing tooling scope, not CI expansion                                          |

**Quality Gates:**

- Zero-Tolerance Lint Policy: Will apply to new dev server code
- Security Linting: ESLint security plugin will cover new Node.js code
- Local = CI Parity: Smoke tests will run in CI

**Gate Status**: PASS - No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/008-docs-viewer-refactor/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (minimal - no API contracts needed)
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
docs/
├── index.md                    # Landing page content (existing)
├── viewer/
│   ├── index.html              # Production viewer shell (modify)
│   ├── app.js                  # Viewer application logic (refactor)
│   ├── styles.css              # Viewer styles (existing, minimal changes)
│   └── manifest.json           # Doc discovery manifest (existing)
├── architecture/               # Existing docs
├── configuration/              # Existing docs
├── examples/                   # Existing docs
├── getting-started/            # Existing docs
├── platforms/                  # Existing docs
├── reference/                  # Existing docs
└── security/                   # Existing docs

scripts/
├── generate-docs-manifest.cjs  # Manifest generator (existing)
├── regenerate-docs-manifest.cjs # Lint-staged wrapper (existing)
├── docs-dev-server.mjs         # NEW: Live reload dev server
└── linkcheck.cjs               # Existing

tests/
├── docs-viewer/
│   ├── sanitization.test.ts    # NEW: 5 adversarial fixtures
│   ├── base-path.test.ts       # NEW: GitHub Pages subpath test
│   ├── smoke.test.ts           # NEW: HTTP-level smoke test
│   └── link-rewriting.test.ts  # NEW: Internal link normalization
```

**Structure Decision**: Single project with new dev server script in `scripts/` and new test files in `tests/docs-viewer/`. No new packages or workspaces needed.

## Complexity Tracking

> No Constitution Check violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --------- | ---------- | ------------------------------------ |
| (none)    | -          | -                                    |

---

## Post-Design Constitution Re-Check

_Performed after Phase 1 design artifacts completed._

| Principle                   | Status   | Post-Design Notes                                                                                                |
| --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------- |
| IV. Security-First Design   | **PASS** | SSE script injection is response-time only (never written to files); 5 adversarial sanitization fixtures defined |
| V. Deterministic Outputs    | **PASS** | manifest.json confirmed as sole source of truth; dev server regenerates on startup                               |
| VII. Environment Discipline | **PASS** | chokidar is npm package (no runtime installers); pinned in package.json                                          |

**Post-Design Gate Status**: PASS - Design artifacts align with constitution.

---

## Generated Artifacts

| Artifact      | Path                                                       | Status   |
| ------------- | ---------------------------------------------------------- | -------- |
| Research      | `specs/008-docs-viewer-refactor/research.md`               | Complete |
| Data Model    | `specs/008-docs-viewer-refactor/data-model.md`             | Complete |
| Quickstart    | `specs/008-docs-viewer-refactor/quickstart.md`             | Complete |
| Contracts     | `specs/008-docs-viewer-refactor/contracts/sse-protocol.md` | Complete |
| Agent Context | `CLAUDE.md`                                                | Updated  |

## Next Steps

Run `/speckit.tasks` to generate actionable task list from this plan.
