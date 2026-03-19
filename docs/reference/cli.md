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
| `--pass <name>` | Run specific pass only (see [Pass Names](#pass-names)) |
| `--agent <id>` | Run specific agent only (see [Agent IDs](#agent-ids)) |
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

#### Pass Names

Pass names are user-defined in your `.ai-review.yml` configuration file. Each entry in the `passes` array has a `name` field that you can use with `--pass`. To discover available passes, check your config file or run `ai-review local --dry-run`.

```yaml
# .ai-review.yml
passes:
  - name: static # use: --pass static
    agents: [semgrep]
  - name: cloud-ai # use: --pass cloud-ai
    agents: [opencode, pr_agent]
```

#### Agent IDs

The following agent IDs are valid for the `--agent` option:

| ID                   | Description                               | Requires            |
| -------------------- | ----------------------------------------- | ------------------- |
| `semgrep`            | Static analysis via Semgrep CLI           | Semgrep installed   |
| `reviewdog`          | Lint aggregation via Reviewdog CLI        | Reviewdog + Semgrep |
| `opencode`           | AI code review via cloud LLM              | API key             |
| `pr_agent`           | AI pull request analysis via cloud LLM    | API key             |
| `local_llm`          | AI code review via local Ollama model     | Ollama running      |
| `ai_semantic_review` | Semantic analysis via cloud LLM           | API key             |
| `control_flow`       | Built-in TypeScript control flow analysis | Nothing (built-in)  |

See also: [Agent Capability Matrix](../configuration/config-schema.md#agent-capability-matrix) in the configuration reference.

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

### `ai-review benchmark`

Run the false-positive regression benchmark against a fixture file. Used to validate that suppression logic and finding quality meet release gate thresholds.

```bash
ai-review benchmark --fixtures <path> [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--fixtures <path>` | Path to benchmark fixture JSON (required) |
| `--output <path>` | Write report JSON to file |
| `--verbose` | Print per-scenario pass/fail details |

**Exit Codes:**

- `0` - All release gates passed
- `1` - One or more gates failed
- `2` - Fatal error (e.g., empty fixture file)

**Release Gates:**

| Gate   | Metric                         | Threshold |
| ------ | ------------------------------ | --------- |
| SC-001 | FP suppression rate            | >= 85%    |
| SC-002 | True positive recall           | = 100%    |
| SC-003 | True positive precision        | >= 70%    |
| SC-004 | False positive rate            | <= 25%    |
| SC-007 | Self-contradiction filter rate | >= 80%    |

**Example:**

```bash
# Run benchmark with verbose output
ai-review benchmark --fixtures router/tests/fixtures/benchmark/scenarios.json --verbose

# Save report to file
ai-review benchmark --fixtures fixtures.json --output report.json
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

### AI Provider Keys

| Variable                  | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`       | Anthropic API key (for Claude models)                            |
| `OPENAI_API_KEY`          | OpenAI API key (for GPT models)                                  |
| `AZURE_OPENAI_API_KEY`    | Azure OpenAI API key                                             |
| `AZURE_OPENAI_ENDPOINT`   | Azure OpenAI endpoint URL                                        |
| `AZURE_OPENAI_DEPLOYMENT` | Azure OpenAI deployment name                                     |
| `OLLAMA_BASE_URL`         | Ollama server URL (default: `http://localhost:11434`)            |
| `MODEL`                   | Override the default model for cloud AI agents                   |
| `OLLAMA_MODEL`            | Override the model for local_llm agent (default: `codellama:7b`) |

### Local LLM Tuning

| Variable                | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `LOCAL_LLM_NUM_CTX`     | Context window size for Ollama (default: 4096)        |
| `LOCAL_LLM_NUM_PREDICT` | Maximum tokens to generate (default: 2048)            |
| `LOCAL_LLM_TIMEOUT`     | Request timeout in milliseconds (default: 120000)     |
| `LOCAL_LLM_OPTIONAL`    | When `true`, skip gracefully if Ollama is unavailable |

### Platform Tokens

| Variable             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `GITHUB_TOKEN`       | GitHub API token (for PR comments and check runs)       |
| `AZURE_DEVOPS_PAT`   | Azure DevOps personal access token                      |
| `SYSTEM_ACCESSTOKEN` | Azure DevOps pipeline token (auto-set in ADO pipelines) |

### Telemetry

| Variable                      | Description                                          |
| ----------------------------- | ---------------------------------------------------- |
| `TELEMETRY_ENABLED`           | Enable/disable telemetry (`true`/`false`)            |
| `TELEMETRY_BACKENDS`          | Comma-separated backend list (e.g., `console,jsonl`) |
| `TELEMETRY_JSONL_PATH`        | File path for JSONL telemetry output                 |
| `TELEMETRY_VERBOSITY`         | Detail level: `minimal`, `standard`, `verbose`       |
| `TELEMETRY_BUFFER_SIZE`       | Max events to buffer before flush (default: 100)     |
| `TELEMETRY_FLUSH_INTERVAL_MS` | Flush interval in milliseconds (default: 5000)       |

### Utility

| Variable             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `NO_COLOR`           | Disable colored output (standard convention, any value) |
| `FORCE_PRETTY`       | Force pretty output format in non-TTY environments      |
| `MARTIAN_API_KEY`    | Judge API key for the external benchmark                |
| `MARTIAN_MODEL`      | Judge model for the external benchmark                  |
| `BENCHMARK_MODEL_ID` | Model ID for benchmark snapshot recording               |
| `BENCHMARK_PROVIDER` | Provider for benchmark snapshot recording               |

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
- [External Benchmark](external-benchmark.md) - Deterministic withmartian benchmark runner
