/**
 * Preinstall guard script - blocks npm install and npm ci
 * Per FR-006: Block only `npm install` and `npm ci`; allow `npm --version`, `npx`, `npm help`
 *
 * This script runs during the preinstall lifecycle hook.
 * It checks if npm is being used for install operations and blocks them
 * with an actionable error message directing users to pnpm.
 */

'use strict';

// Only run this check if we're in an npm install context
const userAgent = process.env.npm_config_user_agent || '';
const isNpm = userAgent.startsWith('npm/');

// npm_command is set during npm lifecycle scripts
// For 'npm install' it will be 'install', for 'npm ci' it will be 'ci'
const npmCommand = process.env.npm_command;

if (isNpm && (npmCommand === 'install' || npmCommand === 'ci')) {
  console.error(`
╭───────────────────────────────────────────────────────────────────────────────╮
│                                                                               │
│  ERROR: This project uses pnpm, not npm.                                      │
│                                                                               │
│  npm install and npm ci are blocked.                                          │
│                                                                               │
│  To install dependencies, run:                                                │
│                                                                               │
│    corepack enable                                                            │
│    pnpm install                                                               │
│                                                                               │
│  For more information, see docs/getting-started/development-setup.md          │
│                                                                               │
╰───────────────────────────────────────────────────────────────────────────────╯
`);
  process.exit(1);
}

// Allow all other npm commands (--version, npx, help, etc.)
process.exit(0);
