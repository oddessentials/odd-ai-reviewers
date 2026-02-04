# CLI Reference

The `ai-review` CLI tool allows you to run AI-powered code reviews locally on your machine, without needing CI/CD integration.

## Installation

```bash
# Install globally
npm install -g @oddessentials/odd-ai-reviewers

# Or run directly with npx
npx @oddessentials/odd-ai-reviewers
```

## Prerequisites

Some agents require external tools to be installed:

| Agent       | Required Tool                                                 | Purpose                      |
| ----------- | ------------------------------------------------------------- | ---------------------------- |
| `semgrep`   | [Semgrep](https://semgrep.dev)                                | Static analysis              |
| `reviewdog` | [Reviewdog](https://github.com/reviewdog/reviewdog) + Semgrep | Linting with inline comments |

AI-only agents (`opencode`, `pr_agent`, `ai_semantic_review`, `local_llm`) don't require external tools—just API keys.

The `control_flow` agent is built-in and requires no external tools or API keys.

### Installing Semgrep

**macOS:**

```bash
brew install semgrep
```

**Windows:**

```bash
pip install semgrep
```

> Note: Requires Python 3.8 or later

**Linux:**

```bash
pip install semgrep
```

### Installing Reviewdog

**macOS:**

```bash
brew install reviewdog/tap/reviewdog
```

**Windows:**

Download the latest release from [GitHub Releases](https://github.com/reviewdog/reviewdog/releases), extract, and add to your PATH.

**Linux:**

```bash
curl -sfL https://raw.githubusercontent.com/reviewdog/reviewdog/master/install.sh | sh -s
```

---

## Commands

### `ai-review local`

Run AI review on local changes (uncommitted/staged files).

```bash
ai-review local [path] [options]
```

**Arguments:**

- `path` - Path to repository (default: current directory)

**Options:**
| Option | Description |
|--------|-------------|
| `--base <ref>` | Base reference for comparison (auto-detected if not specified) |
| `--head <ref>` | Head reference (default: HEAD) |
| `--range <range>` | Git range (e.g., `main...HEAD`, `HEAD~3..`). See [Range Operators](#range-operators) below. |
| `--staged` | Review only staged changes |
| `--uncommitted` | Include uncommitted changes (default: true) |
| `--pass <name>` | Run specific pass only |
| `--agent <id>` | Run specific agent only |
| `--format <fmt>` | Output format: `pretty`, `json`, `sarif` (default: pretty) |
| `--no-color` | Disable colored output |
| `--quiet` | Minimal output (errors only) |
| `--verbose` | Show debug information |
| `--dry-run` | Show what would be reviewed without running agents |
| `--cost-only` | Estimate cost without running agents |
| `-c, --config <path>` | Path to config file |

**Examples:**

```bash
# Review current directory
ai-review local .

# Shorthand (same as above)
ai-review .

# Review staged changes only
ai-review local --staged

# Review last 3 commits
ai-review local --range HEAD~3..

# Dry run to see what would be analyzed
ai-review local --dry-run

# Output as JSON
ai-review local --format json
```

#### Range Operators

The `--range` option supports two git range operators:

| Operator | Syntax        | Description                       | Use Case                                         |
| -------- | ------------- | --------------------------------- | ------------------------------------------------ |
| `...`    | `base...head` | Symmetric difference (merge-base) | Review only changes introduced on feature branch |
| `..`     | `base..head`  | Direct comparison                 | Review all changes including merged commits      |

**Default behavior**: When you specify a single ref (e.g., `--range main`), the default operator is `...` (three-dot), which shows only the changes introduced on the current branch since it diverged from the base.

**Examples:**

```bash
# Changes on current branch since diverging from main (recommended for PRs)
ai-review local --range main...HEAD

# All commits reachable from HEAD but not main (includes merge commits)
ai-review local --range main..HEAD

# Last 3 commits using merge-base comparison
ai-review local --range HEAD~3...HEAD

# Last 3 commits (shorthand, defaults to HEAD)
ai-review local --range HEAD~3..
```

**Visual comparison:**

```
      A---B---C  feature (HEAD)
     /
D---E---F---G    main

--range main...HEAD  →  A, B, C (feature branch changes only)
--range main..HEAD   →  A, B, C (but may behave differently with merges)
```

> **Tip**: Use `...` (three-dot) for typical PR reviews where you want to see only the changes you've made on your feature branch.

---

### `ai-review check`

Validate that all required external dependencies are installed and working.

```bash
ai-review check [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--verbose` | Show additional details (minimum version, docs URL, install instructions) |
| `--json` | Output results in JSON format |

**Exit Codes:**

- `0` - All dependencies available
- `1` - One or more dependencies missing or unhealthy

**Examples:**

```bash
# Basic check
ai-review check

# Verbose output with install instructions
ai-review check --verbose

# JSON output for scripting
ai-review check --json
```

**Sample Output:**

```
Dependency Status Check
────────────────────────────────────────

✓ Semgrep 1.56.0
✓ Reviewdog 0.17.4
```

When dependencies are missing:

```
Dependency Status Check
────────────────────────────────────────

✗ Semgrep - missing
    Minimum version: 1.0.0
    Documentation: https://semgrep.dev/docs/getting-started/
    Install:
      pip install semgrep

✗ Reviewdog - missing
    Minimum version: 0.14.0
    Documentation: https://github.com/reviewdog/reviewdog#installation
    Install:
      brew install reviewdog/tap/reviewdog
```

---

### `ai-review review`

Run AI review on a PR or commit range (typically used in CI/CD).

```bash
ai-review review [options]
```

**Required Options:**
| Option | Description |
|--------|-------------|
| `--repo <path>` | Path to repository |
| `--base <sha>` | Base commit SHA |
| `--head <sha>` | Head commit SHA |

**Optional:**
| Option | Description |
|--------|-------------|
| `--pr <number>` | PR number |
| `--owner <owner>` | Repository owner (for GitHub API) |
| `--repo-name <name>` | Repository name (for GitHub API) |
| `--dry-run` | Run without posting results |

---

### `ai-review validate`

Validate configuration file without running a review.

```bash
ai-review validate --repo <path> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--repo <path>` | Path to repository (required) |
| `--json` | Output validation result as JSON |

---

### `ai-review config init`

Generate a new `.ai-review.yml` configuration file interactively.

```bash
ai-review config init [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--defaults` | Use default settings without prompts |
| `--yes` | Alias for `--defaults` |
| `--provider <provider>` | LLM provider: `openai`, `anthropic`, `azure-openai`, `ollama` |
| `--platform <platform>` | Platform: `github`, `ado` (default: github) |
| `--output <path>` | Output file path (default: `.ai-review.yml`) |

**Examples:**

```bash
# Interactive mode
ai-review config init

# Non-interactive with defaults
ai-review config init --defaults --provider anthropic
```

---

## Dependency Detection

When you run `ai-review local`, the CLI automatically checks for required dependencies based on your configuration:

1. **Required passes** - If a pass is marked `required: true` and its dependencies are missing, the CLI exits with an error and installation instructions.

2. **Optional passes** - If a pass is marked `required: false` and its dependencies are missing, the pass is skipped with a warning, and other passes continue.

3. **AI-only agents** - Agents like `opencode` and `pr_agent` don't require external tools, only API keys.

### Graceful Degradation

If you have semgrep installed but not reviewdog:

```
⚠ Some passes were skipped due to missing dependencies:

⚠ Pass "linting" skipped: Reviewdog is missing

  Run "ai-review check" to see installation instructions.
```

The semgrep pass will still run successfully.

---

## Environment Variables

| Variable                  | Description                           |
| ------------------------- | ------------------------------------- |
| `ANTHROPIC_API_KEY`       | Anthropic API key (for Claude models) |
| `OPENAI_API_KEY`          | OpenAI API key (for GPT models)       |
| `AZURE_OPENAI_API_KEY`    | Azure OpenAI API key                  |
| `AZURE_OPENAI_ENDPOINT`   | Azure OpenAI endpoint URL             |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI deployment name          |
| `OLLAMA_BASE_URL`         | Ollama server URL (for local LLMs)    |
| `MODEL`                   | Override the default model            |

---

## Troubleshooting

### "Missing required dependencies" error

Run `ai-review check --verbose` to see:

- Which dependencies are missing
- Platform-specific installation instructions
- Documentation links

### Tool installed but not detected

Ensure the tool is in your PATH:

```bash
# Check if semgrep is accessible
which semgrep    # macOS/Linux
where semgrep    # Windows

# Check version
semgrep --version
```

### Version mismatch warning

If you see a version mismatch warning, update the tool:

```bash
# Semgrep
pip install --upgrade semgrep

# Reviewdog (macOS)
brew upgrade reviewdog
```

---

## See Also

- [Configuration Schema](../configuration/config-schema.md) - Full YAML configuration options
- [Cost Controls](../configuration/cost-controls.md) - Budget management
- [GitHub Setup](../platforms/github/setup.md) - CI/CD integration
