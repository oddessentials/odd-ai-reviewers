/**
 * Generate CLAUDE.md — deterministic, manual-run only.
 *
 * Reads project state (package.json, tsconfig, scripts) and produces a
 * consolidated CLAUDE.md. Preserves the <!-- MANUAL ADDITIONS --> block
 * from the existing file if present.
 *
 * Usage: npx tsx scripts/generate-claude-md.ts
 *
 * NOT wired into pre-commit or CI hooks (FR-028).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const ROUTER = join(ROOT, 'router');
const OUTPUT = join(ROOT, 'CLAUDE.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function extractManualAdditions(existing: string): string | null {
  const startMarker = '<!-- MANUAL ADDITIONS START -->';
  const endMarker = '<!-- MANUAL ADDITIONS END -->';
  const startIdx = existing.indexOf(startMarker);
  const endIdx = existing.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return null;
  return existing.slice(startIdx, endIdx + endMarker.length);
}

function listDir(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const result: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist')
      continue;
    if (entry.isDirectory()) {
      result.push(`${prefix}${entry.name}/`);
      // Only go one level deep for src/
      if (prefix === '' || prefix === '  ') {
        result.push(...listDir(join(dir, entry.name), prefix + '  '));
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Data collection
// ---------------------------------------------------------------------------

const rootPkg = readJson<Record<string, unknown>>(join(ROOT, 'package.json'));
const routerPkg = readJson<Record<string, unknown>>(join(ROUTER, 'package.json'));
const deps = routerPkg['dependencies'] as Record<string, string> | undefined;
const devDeps = routerPkg['devDependencies'] as Record<string, string> | undefined;
const _scripts = routerPkg['scripts'] as Record<string, string> | undefined;
const _rootScripts = rootPkg['scripts'] as Record<string, string> | undefined;

// Read existing manual additions
let manualAdditions = '';
if (existsSync(OUTPUT)) {
  const existing = readFileSync(OUTPUT, 'utf8');
  manualAdditions = extractManualAdditions(existing) ?? '';
}

// Collect router/src top-level structure
const srcDirs = listDir(join(ROUTER, 'src'));

// ---------------------------------------------------------------------------
// Generate
// ---------------------------------------------------------------------------

const today = new Date().toISOString().slice(0, 10);

const lines: string[] = [
  '# odd-ai-reviewers Development Guidelines',
  '',
  `Development guidelines maintained by the project team. Last updated: ${today}`,
  '',
  '## Active Technologies',
  '',
  `- **Language**: TypeScript ${deps?.['typescript'] ?? '5.x'} (ES2022 target, NodeNext modules)`,
  `- **Runtime**: Node.js >= 22.0.0`,
  `- **Validation**: Zod ${deps?.['zod']?.replace('^', '') ?? '4.x'}`,
  `- **CLI**: Commander ${deps?.['commander']?.replace('^', '') ?? '14.x'}`,
  `- **Testing**: Vitest ${devDeps?.['vitest']?.replace('^', '') ?? '4.x'}`,
  `- **AI SDKs**: Anthropic ${deps?.['@anthropic-ai/sdk'] ?? '0.x'}, OpenAI ${deps?.['openai']?.replace('^', '') ?? '6.x'}`,
  `- **GitHub**: Octokit ${deps?.['@octokit/rest']?.replace('^', '') ?? '22.x'}`,
  `- **Package Manager**: pnpm ${(rootPkg['packageManager'] as string)?.split('@')[1] ?? '10.x'}`,
  `- **Hooks**: Husky 9.x, lint-staged 16.x`,
  `- **Formatting**: Prettier 3.x, ESLint 9.x`,
  `- **CI**: GitHub Actions, semantic-release`,
  `- **Storage**: File-based cache (\`.ai-review-cache/\`), JSONL telemetry`,
  '',
  '## Project Structure',
  '',
  '```text',
  'router/                    # Main package (@oddessentials/odd-ai-reviewers)',
  '  src/',
  ...srcDirs.map((d) => `    ${d}`),
  '  tests/',
  '    unit/',
  '    integration/',
  '    fixtures/',
  'scripts/                   # Dev tooling (manual-run)',
  'docs/                      # Documentation',
  '  reference/',
  '  configuration/',
  '  platforms/',
  'specs/                     # Feature specifications',
  '```',
  '',
  '## Commands',
  '',
  '### Build & Test',
  '',
  '```bash',
  'pnpm install               # Install all dependencies',
  'pnpm build                 # Compile TypeScript',
  'pnpm test                  # Run tests (router)',
  'pnpm --filter ./router test:coverage  # Run with coverage',
  'pnpm --filter ./router test:ci-thresholds  # Run with CI-level coverage thresholds',
  '```',
  '',
  '### Quality',
  '',
  '```bash',
  'pnpm lint                  # ESLint',
  'pnpm lint:strict           # ESLint (zero warnings)',
  'pnpm format:check          # Prettier check',
  'pnpm typecheck             # TypeScript type check',
  'pnpm depcruise             # Circular dependency check',
  'pnpm verify                # All quality checks',
  '```',
  '',
  '### Documentation',
  '',
  '```bash',
  'pnpm docs:dev              # Local docs viewer',
  'pnpm docs:linkcheck        # Validate doc links',
  'pnpm docs:manifest         # Regenerate docs manifest',
  '```',
  '',
  '### CLI (after build)',
  '',
  '```bash',
  'ai-review local .          # Review local changes',
  'ai-review local --dry-run  # Preview without running',
  'ai-review check            # Verify dependencies',
  'ai-review config init      # Generate config',
  'ai-review benchmark --fixtures <path>  # Run FP benchmark',
  '```',
  '',
  '## Code Style',
  '',
  '- ESM-only (`"type": "module"` in package.json)',
  '- Strict TypeScript with ES2022 target',
  '- Prettier for formatting, ESLint for linting',
  '- Conventional commits (enforced by commitlint)',
  '- No default exports; use named exports',
  '',
];

// Add manual additions if present
if (manualAdditions) {
  lines.push('');
  lines.push(manualAdditions);
  lines.push('');
}

// Write output
const output =
  lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n';
writeFileSync(OUTPUT, output);
console.log(`[generate-claude-md] Written ${OUTPUT} (${output.length} bytes)`);
