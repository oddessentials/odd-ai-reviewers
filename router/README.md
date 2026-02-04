# @oddessentials/odd-ai-reviewers

AI-powered code review CLI that runs locally or in CI/CD pipelines. Get instant feedback on your code changes using LLMs like GPT-4 and Claude.

## Quick Start

```bash
# Run local review on current changes
npx @oddessentials/odd-ai-reviewers .

# Or install globally
npm install -g @oddessentials/odd-ai-reviewers
ai-review .
```

## Features

- **Local Review Mode**: Get instant AI feedback before pushing
- **CI/CD Integration**: GitHub Actions and Azure DevOps support
- **Zero Configuration**: Works out of the box with sensible defaults
- **Multiple AI Providers**: OpenAI, Anthropic, Azure OpenAI, Ollama
- **Cost Control**: Built-in budget limits and cost estimation
- **Customizable**: Configure passes, agents, and output formats

## Prerequisites

- Node.js >= 22.0.0
- Git
- API key for your preferred AI provider

## Environment Variables

Set one of these API keys:

```bash
# OpenAI
export OPENAI_API_KEY=sk-...

# Anthropic
export ANTHROPIC_API_KEY=sk-ant-...

# Azure OpenAI
export AZURE_OPENAI_API_KEY=...
export AZURE_OPENAI_ENDPOINT=https://...
export AZURE_OPENAI_DEPLOYMENT=...

# Ollama (local)
export OLLAMA_BASE_URL=http://localhost:11434
```

## Usage

### Local Review (Recommended for Development)

```bash
# Review uncommitted changes
ai-review .

# Review only staged changes (for pre-commit hooks)
ai-review . --staged

# Review changes between current branch and main
ai-review . --base main

# Dry run - see what would be reviewed
ai-review . --dry-run

# Cost estimate only
ai-review . --cost-only

# JSON output for tooling integration
ai-review . --format json

# SARIF output for IDE integration
ai-review . --format sarif
```

### CI Review Mode

```bash
# Review a specific commit range
ai-review review --repo . --base $BASE_SHA --head $HEAD_SHA

# With PR number for GitHub integration
ai-review review --repo . --base $BASE_SHA --head $HEAD_SHA --pr 123
```

### Configuration

```bash
# Generate a new configuration file
ai-review config init

# Validate existing configuration
ai-review validate --repo .
```

## Configuration File

Create `.ai-review.yml` in your repository root:

```yaml
# AI Provider configuration
provider: openai

# Model selection
models:
  default: gpt-4o-mini

# Review passes
passes:
  - name: ai-review
    enabled: true
    agents:
      - opencode

# Resource limits
limits:
  max_files: 50
  max_diff_lines: 5000
  max_usd_per_pr: 0.50

# Gating (fail CI on findings)
gating:
  enabled: true
  fail_on_severity: error
```

## CLI Reference

### `ai-review local [path]`

Run AI review on local changes.

| Option            | Description                                   |
| ----------------- | --------------------------------------------- |
| `--base <ref>`    | Base reference for comparison (auto-detected) |
| `--head <ref>`    | Head reference (default: HEAD)                |
| `--range <range>` | Git range (e.g., HEAD~3..)                    |
| `--staged`        | Review only staged changes                    |
| `--uncommitted`   | Include uncommitted changes (default: true)   |
| `--pass <name>`   | Run specific pass only                        |
| `--agent <id>`    | Run specific agent only                       |
| `--format <fmt>`  | Output format: pretty, json, sarif            |
| `--no-color`      | Disable colored output                        |
| `--quiet`         | Minimal output (errors only)                  |
| `--verbose`       | Show debug information                        |
| `--dry-run`       | Preview without running agents                |
| `--cost-only`     | Estimate cost without running                 |
| `-c, --config`    | Path to config file                           |

### Exit Codes

| Code | Meaning                                        |
| ---- | ---------------------------------------------- |
| 0    | Success (no blocking findings)                 |
| 1    | Failure (blocking findings or execution error) |
| 2    | Invalid arguments or configuration             |

## Pre-commit Hook Integration

Add to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: local
    hooks:
      - id: ai-review
        name: AI Code Review
        entry: npx @oddessentials/odd-ai-reviewers . --staged --quiet
        language: system
        pass_filenames: false
```

Or use with Husky:

```bash
# .husky/pre-commit
npx @oddessentials/odd-ai-reviewers . --staged --quiet || exit 1
```

## Changelog

This package uses [semantic-release](https://semantic-release.gitbook.io/) for automated versioning and changelog generation. The changelog is auto-generated from conventional commit messages.

See [CHANGELOG.md](../CHANGELOG.md) for the full release history.

## License

MIT
