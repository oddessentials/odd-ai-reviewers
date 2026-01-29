# odd-ai-reviewers Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-01-27

## Active Technologies
- TypeScript 5.x (ESM), Node.js >=22.0.0 + typescript (compiler API for AST parsing), Zod (schema validation), Vitest (testing) (004-control-flow-hardening)
- N/A (in-memory analysis only) (004-control-flow-hardening)
- TypeScript 5.9.x (ESM), targeting ES2022 + typescript (compiler API), zod (schema validation), vitest (testing) (005-redos-prevention)
- TypeScript 5.9.x (ESM), Node.js >=22.0.0 + Vitest 4.x (testing), Husky 9.x (hooks), lint-staged (staged file processing), Prettier 3.x (formatting), ESLint 9.x (linting) (006-quality-enforcement)
- N/A (ephemeral, file-based configuration only) (006-quality-enforcement)
- TypeScript 5.9.x (ESM), Node.js ≥22.0.0 + Vitest 4.x (testing), Husky 9.x (hooks), lint-staged 16.x, Prettier 3.x, ESLint 9.x, Zod 4.x (schema validation) (007-pnpm-timeout-telemetry)
- JSONL file backend (ephemeral, per-run), console output (007-pnpm-timeout-telemetry)
- JavaScript ES6+ (client-side), Node.js >=22.0.0 (dev server) + marked.js (markdown), DOMPurify (sanitization), mermaid (diagrams) - all CDN; chokidar (file watching - new), http (Node.js built-in) (008-docs-viewer-refactor)
- N/A (ephemeral, static files only) (008-docs-viewer-refactor)
- Markdown (GitHub Flavored Markdown) + N/A (documentation only) (009-azure-devops-permissions-docs)

- TypeScript 5.x (ES2022 target, NodeNext modules), Node.js >=22.0.0 (001-control-flow-analysis)
- N/A (ephemeral workspace per constitution) (001-control-flow-analysis)

- Markdown (GitHub Flavored Markdown with HTML) + N/A (documentation only) (001-review-team-docs)

- TypeScript 5.x (ESM), Node.js >=22.0.0 + ESLint 9.x, typescript-eslint 8.x, Vitest 4.x, Prettier 3.x (003-dependency-updates)
- N/A (no database) (003-dependency-updates)

- Markdown documentation (no code changes) + N/A (documentation only) (001-reviewignore-docs)

## Project Structure

```text
src/
tests/
```

## Commands

# Add commands for Markdown documentation (no code changes)

## Code Style

Markdown documentation (no code changes): Follow standard conventions

## Recent Changes
- 009-azure-devops-permissions-docs: Added Markdown (GitHub Flavored Markdown) + N/A (documentation only)
- 008-docs-viewer-refactor: Added JavaScript ES6+ (client-side), Node.js >=22.0.0 (dev server) + marked.js (markdown), DOMPurify (sanitization), mermaid (diagrams) - all CDN; chokidar (file watching - new), http (Node.js built-in)
- 007-pnpm-timeout-telemetry: Added TypeScript 5.9.x (ESM), Node.js ≥22.0.0 + Vitest 4.x (testing), Husky 9.x (hooks), lint-staged 16.x, Prettier 3.x, ESLint 9.x, Zod 4.x (schema validation)





<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
