/**
 * Prompt Conventions Sync Script
 *
 * Reads _shared_conventions.md and replaces content between
 * <!-- BEGIN SHARED CONVENTIONS --> / <!-- END SHARED CONVENTIONS -->
 * markers in all 4 prompt files. Also generates a compressed TypeScript
 * fallback constant for agent inline fallbacks.
 *
 * Usage:
 *   npx tsx scripts/sync-prompt-conventions.ts          # sync mode (write)
 *   npx tsx scripts/sync-prompt-conventions.ts --check   # check mode (exit 1 if drift)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = resolve(import.meta.dirname, '..');
const SHARED_FRAGMENT = resolve(ROOT, 'config/prompts/_shared_conventions.md');

const PROMPT_FILES = [
  'config/prompts/semantic_review.md',
  'config/prompts/pr_agent_review.md',
  'config/prompts/opencode_system.md',
  'config/prompts/architecture_review.md',
];

const BEGIN_MARKER = '<!-- BEGIN SHARED CONVENTIONS (source: _shared_conventions.md) -->';
const END_MARKER = '<!-- END SHARED CONVENTIONS -->';

function computeHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function readFragment(): string {
  try {
    return readFileSync(SHARED_FRAGMENT, 'utf8');
  } catch {
    console.error(`ERROR: Shared fragment not found: ${SHARED_FRAGMENT}`);
    process.exit(2);
  }
}

function syncPromptFile(
  filePath: string,
  fragmentContent: string,
  checkOnly: boolean
): { drifted: boolean; synced: boolean } {
  const absPath = resolve(ROOT, filePath);
  const relPath = relative(ROOT, absPath);
  let content: string;

  try {
    content = readFileSync(absPath, 'utf8');
  } catch {
    console.error(`ERROR: Prompt file not found: ${relPath}`);
    return { drifted: true, synced: false };
  }

  const beginIdx = content.indexOf(BEGIN_MARKER);
  const endIdx = content.indexOf(END_MARKER);

  if (beginIdx === -1 || endIdx === -1) {
    console.error(`ERROR: Missing markers in ${relPath}`);
    console.error(`  Expected: ${BEGIN_MARKER}`);
    console.error(`  Expected: ${END_MARKER}`);
    return { drifted: true, synced: false };
  }

  const before = content.slice(0, beginIdx + BEGIN_MARKER.length);
  const after = content.slice(endIdx);
  const currentContent = content.slice(beginIdx + BEGIN_MARKER.length, endIdx);

  const expectedContent = '\n' + fragmentContent + '\n';

  if (currentContent === expectedContent) {
    console.log(`  ✓ ${relPath} — in sync`);
    return { drifted: false, synced: true };
  }

  if (checkOnly) {
    console.log(`  ✗ ${relPath} — DRIFTED`);
    return { drifted: true, synced: false };
  }

  // Write synced content
  const synced = before + expectedContent + after;
  writeFileSync(absPath, synced, 'utf8');
  console.log(`  ✓ ${relPath} — synced`);
  return { drifted: false, synced: true };
}

function generateFallbackConstant(fragmentContent: string): string {
  // Compress the shared conventions into a single-line summary for agent fallbacks
  const lines = fragmentContent.split('\n');
  const conventions: string[] = [];
  const acds: string[] = [];
  const dataflow: string[] = [];

  let section = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('### Active Context Directives')) {
      section = 'acd';
      continue;
    }
    if (trimmed.startsWith('### Additional Data-flow')) {
      section = 'dataflow';
      continue;
    }
    if (/^\d+\.\s+\*\*/.test(trimmed) && section !== 'acd') {
      section = 'convention';
      // Extract convention number and title
      const match = trimmed.match(/^(\d+)\.\s+\*\*([^*]+)\*\*/);
      if (match && match[1] && match[2]) {
        conventions.push(`${match[1]}. ${match[2].trim()}`);
      }
      continue;
    }
    if (section === 'acd' && /^\d+\.\s+\*\*MANDATORY/.test(trimmed)) {
      const match = trimmed.match(/\*\*MANDATORY:\s*([^*]+)\*\*/);
      if (match && match[1]) {
        acds.push(match[1].trim());
      }
    }
    if (section === 'acd' && /^\d+\.\s+\*\*Design/.test(trimmed)) {
      acds.push('Design intent awareness');
    }
    if (section === 'dataflow' && trimmed.startsWith('- ')) {
      const short = trimmed.slice(2).split('—')[0]?.trim();
      if (short) dataflow.push(short);
    }
  }

  const summary = [
    `Conventions: ${conventions.join('; ')}`,
    `ACDs (MANDATORY): ${acds.join('; ')}`,
    `Data-flow additions: ${dataflow.join('; ')}`,
  ].join('\\n');

  return `/**
 * Auto-generated from config/prompts/_shared_conventions.md
 * DO NOT EDIT — run \`pnpm prompts:sync\` to regenerate
 * Hash: ${computeHash(fragmentContent)}
 */
export const SHARED_CONVENTIONS_HASH = '${computeHash(fragmentContent)}';

export const SHARED_CONVENTIONS_SUMMARY = \`${summary.replace(/`/g, "'")}\`;
`;
}

// --- Main ---

const checkOnly = process.argv.includes('--check');
const mode = checkOnly ? 'CHECK' : 'SYNC';

console.log(`[prompts:${mode.toLowerCase()}] Reading shared fragment...`);
const fragment = readFragment();
const hash = computeHash(fragment);
console.log(`  Fragment hash: ${hash.slice(0, 12)}...`);
console.log(
  `[prompts:${mode.toLowerCase()}] ${checkOnly ? 'Checking' : 'Syncing'} prompt files...`
);

let hasDrift = false;
for (const file of PROMPT_FILES) {
  const result = syncPromptFile(file, fragment, checkOnly);
  if (result.drifted) hasDrift = true;
}

if (!checkOnly) {
  // Generate fallback constant
  const fallbackPath = resolve(ROOT, 'router/src/prompts/shared-conventions.generated.ts');
  const fallbackContent = generateFallbackConstant(fragment);
  writeFileSync(fallbackPath, fallbackContent, 'utf8');
  console.log(`  ✓ router/src/prompts/shared-conventions.generated.ts — generated`);
}

if (hasDrift) {
  console.error(`\n[prompts:${mode.toLowerCase()}] FAILED — drift detected in one or more files`);
  process.exit(1);
}

console.log(
  `\n[prompts:${mode.toLowerCase()}] All prompt files ${checkOnly ? 'are in sync ✓' : 'synced successfully ✓'}`
);
