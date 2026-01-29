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
- TypeScript 5.9.3 (ES2022 target, NodeNext modules) + Zod 4.3.6 (schema validation), Commander 14.x (CLI), Anthropic SDK 0.71.2, OpenAI 6.17.0, Octokit 22.0.1 (010-type-test-optimization)
- File-based cache (cache/store.ts), ephemeral per-run (010-type-test-optimization)

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
- 010-type-test-optimization: Added TypeScript 5.9.3 (ES2022 target, NodeNext modules) + Zod 4.3.6 (schema validation), Commander 14.x (CLI), Anthropic SDK 0.71.2, OpenAI 6.17.0, Octokit 22.0.1
- 009-azure-devops-permissions-docs: Added Markdown (GitHub Flavored Markdown) + N/A (documentation only)
- 008-docs-viewer-refactor: Added JavaScript ES6+ (client-side), Node.js >=22.0.0 (dev server) + marked.js (markdown), DOMPurify (sanitization), mermaid (diagrams) - all CDN; chokidar (file watching - new), http (Node.js built-in)





<!-- MANUAL ADDITIONS START -->

## Type Utilities (router/src/types/)

The `router/src/types/` directory contains shared type utilities for type-safe error handling and validation.

### Custom Errors (errors.ts)

Four error categories with canonical wire format for serialization:

- `ConfigError` - Configuration validation failures (CONFIG_* codes)
- `AgentError` - Agent execution failures (AGENT_* codes)
- `NetworkError` - API/network failures (NETWORK_* codes)
- `ValidationError` - Input validation failures (VALIDATION_* codes)

Usage:
```typescript
import { ConfigError, ConfigErrorCode } from './types/errors.js';

throw new ConfigError('Invalid config', ConfigErrorCode.INVALID_SCHEMA, {
  path: configPath,
  field: 'passes',
});
```

### Result Type (result.ts)

Discriminated union for explicit error handling:

```typescript
import { Ok, Err, isOk, match } from './types/result.js';

function parseConfig(input: string): Result<Config, ValidationError> {
  // ... returns Ok(config) or Err(error)
}

const result = parseConfig(input);
if (isOk(result)) {
  console.log(result.value); // TypeScript knows value exists
}
```

### Branded Types (branded.ts)

Compile-time validation guarantees:

- `SafeGitRef` - Validated git reference (no shell injection)
- `ValidatedConfig<T>` - Configuration that passed Zod validation
- `CanonicalPath` - Normalized, validated file path

```typescript
import { SafeGitRefHelpers } from './types/branded.js';

const result = SafeGitRefHelpers.parse(userInput);
if (isOk(result)) {
  checkoutBranch(result.value); // Guaranteed safe
}
```

### assertNever (assert-never.ts)

Exhaustive switch enforcement:

```typescript
import { assertNever } from './types/assert-never.js';

switch (status) {
  case 'success': return handleSuccess();
  case 'failure': return handleFailure();
  default: assertNever(status); // Compile error if case missing
}
```

<!-- MANUAL ADDITIONS END -->
