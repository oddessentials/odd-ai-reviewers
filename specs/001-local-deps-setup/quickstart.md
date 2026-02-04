# Quickstart: CLI Local Review Dependency Setup

**Feature**: 001-local-deps-setup
**Date**: 2026-02-02

## Overview

This feature adds dependency detection for external tools (semgrep, reviewdog) used by the `ai-review local` command. Users get actionable error messages when dependencies are missing, and can proactively check their setup with `ai-review check`.

## Prerequisites

- Node.js >= 22.0.0
- pnpm (for development)
- TypeScript 5.9.3+

## Key Files

| File                                      | Purpose                         |
| ----------------------------------------- | ------------------------------- |
| `router/src/cli/dependencies/catalog.ts`  | Centralized dependency registry |
| `router/src/cli/dependencies/checker.ts`  | Core detection logic            |
| `router/src/cli/dependencies/types.ts`    | TypeScript interfaces           |
| `router/src/cli/dependencies/messages.ts` | User-facing error messages      |
| `router/src/cli/commands/check.ts`        | New `ai-review check` command   |
| `router/src/cli/commands/local-review.ts` | Modified to include preflight   |

## Usage

### Check Environment Setup

```bash
# Basic check
ai-review check

# Verbose output with versions
ai-review check --verbose

# JSON output for scripting
ai-review check --json
```

### Local Review with Dependency Detection

```bash
# Dependencies are checked automatically before review
ai-review local .

# If semgrep is missing, you'll see:
# ERROR: Missing required dependency: semgrep
#   To install on macOS: brew install semgrep
#   Docs: https://semgrep.dev/docs/getting-started/
```

## Development

### Run Tests

```bash
# All dependency tests
pnpm test router/src/__tests__/cli/dependencies/

# Specific test file
pnpm test router/src/__tests__/cli/dependencies/checker.test.ts
```

### Build

```bash
pnpm build
```

### Manual Testing

```bash
# Test with missing dependencies (rename semgrep temporarily)
which semgrep  # Note the path
sudo mv /path/to/semgrep /path/to/semgrep.bak
ai-review local .  # Should show helpful error
sudo mv /path/to/semgrep.bak /path/to/semgrep  # Restore

# Test check command
ai-review check --verbose
```

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                     ai-review local .                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Load Config (.ai-review.yml)              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Extract Passes → Agents → Dependencies          │
│                                                              │
│  passes: [{name: 'security', agents: ['semgrep']}]          │
│       ↓                                                      │
│  agents: ['semgrep']                                        │
│       ↓                                                      │
│  dependencies: ['semgrep']  (from AGENT_DEPENDENCIES map)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Check Each Dependency                      │
│                                                              │
│  execFileSync('semgrep', ['--version'], {shell: false})     │
│       │                                                      │
│       ├── ENOENT ──────────────→ status: 'missing'          │
│       ├── exec error ──────────→ status: 'unhealthy'        │
│       └── success + parse ─────→ status: 'available'        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Determine Exit Behavior                   │
│                                                              │
│  Required pass + missing dep → EXIT 1 (consolidated error)  │
│  Optional pass + missing dep → WARN + continue              │
│  All deps available ─────────→ proceed with review          │
└─────────────────────────────────────────────────────────────┘
```

## Adding New Dependencies

1. Add entry to `DEPENDENCY_CATALOG` in `catalog.ts`:

```typescript
export const DEPENDENCY_CATALOG: DependencyCatalog = {
  // ... existing entries ...
  newtool: {
    name: 'newtool',
    displayName: 'New Tool',
    versionCommand: ['newtool', ['--version']],
    versionRegex: /(\d+\.\d+\.\d+)/,
    minVersion: '1.0.0',
    docsUrl: 'https://newtool.dev/docs/',
    installInstructions: {
      darwin: 'brew install newtool',
      win32: 'choco install newtool',
      linux: 'apt install newtool',
    },
  },
};
```

2. Add agent mapping in `catalog.ts`:

```typescript
export const AGENT_DEPENDENCIES: AgentDependencyMap = {
  // ... existing entries ...
  newtool_agent: ['newtool'],
};
```

3. Add tests in `router/src/__tests__/cli/dependencies/catalog.test.ts`

## Exit Codes

| Code | Meaning                                   |
| ---- | ----------------------------------------- |
| 0    | Success (or only optional passes skipped) |
| 1    | Required dependency missing               |
| 2    | Invalid arguments                         |

## Troubleshooting

### "semgrep not found" but it's installed

1. Check if semgrep is in your PATH:

   ```bash
   which semgrep  # Unix
   where semgrep  # Windows
   ```

2. If using pyenv/virtualenv, ensure the environment is activated

3. Try running `semgrep --version` directly to verify it works

### "unhealthy" status for a tool

This means the tool exists but `--version` failed. Common causes:

- Corrupted installation
- Missing runtime dependencies (e.g., Python for semgrep)
- Permission issues

Run the version command manually to diagnose:

```bash
semgrep --version
reviewdog --version
```
