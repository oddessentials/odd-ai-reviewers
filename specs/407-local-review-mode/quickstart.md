# Quickstart Guide: Local Review Mode

**Feature Branch**: `407-local-review-mode`
**Date**: 2026-02-01

---

## Installation

```bash
# Using npx (no install required)
npx @oddessentials/ai-review --version

# Global install
npm install -g @oddessentials/ai-review

# Project dependency
npm install --save-dev @oddessentials/ai-review
```

---

## First Review in 60 Seconds

### 1. Set API Credentials

```bash
# For Claude (Anthropic)
export ANTHROPIC_API_KEY="sk-ant-..."

# OR for GPT (OpenAI)
export OPENAI_API_KEY="sk-..."
```

### 2. Run Review

```bash
# Navigate to any git repository with changes
cd your-project

# Run local review
npx @oddessentials/ai-review .
```

That's it! The tool will:

- Detect your repository
- Find the default branch (main/master)
- Analyze your uncommitted changes
- Display findings in the terminal

---

## Common Workflows

### Pre-Commit Hook

Add to your pre-commit hook:

```bash
# .husky/pre-commit
npx @oddessentials/ai-review . --staged --quiet
```

Or with lint-staged:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["npx @oddessentials/ai-review . --staged --quiet"]
  }
}
```

### Before Creating PR

Review all changes in your feature branch:

```bash
ai-review . --base main
```

### Debugging CI Failures

Reproduce CI review locally:

```bash
ai-review . --base main --verbose
```

### Specific Agent Only

Run just semgrep for fast static analysis:

```bash
ai-review . --agent semgrep
```

---

## Configuration

### Generate Config File

```bash
ai-review config init
```

This creates `.ai-review.yml` with interactive options.

### Validate Config

```bash
ai-review validate
```

### Zero-Config Mode

Without a config file, the tool uses sensible defaults:

- Single AI review pass
- Conservative cost limits
- Auto-detected API provider

A message indicates when defaults are in use.

---

## Output Formats

### Terminal (default)

```bash
ai-review .
```

Human-readable output with colors and code snippets.

### JSON

```bash
ai-review . --format json > results.json
```

Machine-readable for CI integration.

### SARIF

```bash
ai-review . --format sarif > results.sarif
```

For IDE integration (VS Code, JetBrains).

---

## CLI Reference

```
ai-review <path> [options]

Arguments:
  path                  Directory to review (default: ".")

Diff Options:
  --base <ref>          Base reference (default: auto-detect)
  --head <ref>          Head reference (default: HEAD)
  --range <range>       Git range (e.g., HEAD~3..)
  --staged              Only staged changes
  --uncommitted         Include uncommitted (default: true)

Filter Options:
  --pass <name>         Run specific pass only
  --agent <id>          Run specific agent only

Output Options:
  --format <fmt>        pretty | json | sarif
  --no-color            Disable colors
  -q, --quiet           Errors only
  -v, --verbose         Debug output

Execution Options:
  --dry-run             Preview without running
  --cost-only           Estimate cost only
  -c, --config <path>   Config file path

Standard:
  -h, --help            Show help
  -V, --version         Show version
```

---

## Troubleshooting

### "Not a git repository"

```bash
# Make sure you're in a git repo
git status

# Or specify the path
ai-review /path/to/repo
```

### "No API credentials found"

Set at least one API key:

```bash
export ANTHROPIC_API_KEY="your-key"
# or
export OPENAI_API_KEY="your-key"
```

### "No changes to review"

The tool only reviews changed files. Make some changes first:

```bash
git status  # Should show modified files
```

### Slow Performance

For faster reviews:

- Use `--staged` to review only staged files
- Use `--agent semgrep` for static analysis only
- Use `--pass static` to skip AI passes

---

## Next Steps

- [Full CLI Reference](./contracts/cli-interface.md)
- [Configuration Guide](../../docs/configuration.md)
- [CI Integration](../../docs/ci-integration.md)
