# Quickstart: Dependency Update Verification

## Prerequisites

- Node.js >= 22
- npm (via Node.js install)

## Install

```bash
cd /mnt/e/projects/odd-ai-reviewers
npm install
```

## Verify

```bash
npm run verify
npm test
npm audit
```

## Repo-Standards Checks

Run repo-standards v7 checklist generation and verify applicable items:

```bash
npx repo-standards typescript-js github-actions
```

## Notes

- If `npm audit` reports new high/critical vulnerabilities, capture the dependency path and resolve via upgrades or overrides.
- If linting fails, align config files with repo-standards v7 requirements before re-running verification.
