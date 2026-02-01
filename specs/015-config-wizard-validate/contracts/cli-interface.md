# CLI Interface Contract: 015-config-wizard-validate

**Date**: 2026-01-31
**Purpose**: Define the CLI command signatures and behavior contracts

## Commands

### `ai-review config init`

Generates a new `.ai-review.yml` configuration file.

#### Usage

```bash
# Interactive mode (requires TTY)
ai-review config init

# Non-interactive mode (CI-safe)
ai-review config init --defaults --provider openai --platform github

# With custom output path
ai-review config init --defaults --provider anthropic --output ./config/.ai-review.yml
```

#### Options

| Option             | Type    | Default          | Description                                            |
| ------------------ | ------- | ---------------- | ------------------------------------------------------ |
| `--defaults`, `-y` | boolean | false            | Use defaults without prompts                           |
| `--provider`       | enum    | -                | LLM provider (openai, anthropic, azure-openai, ollama) |
| `--platform`       | enum    | -                | Platform (github, azure-devops, both)                  |
| `--output`, `-o`   | string  | `.ai-review.yml` | Output file path                                       |

#### Behavior

**Interactive Mode** (no `--defaults`):

1. Check `process.stdin.isTTY === true`
2. If not TTY: print error and exit 1
3. If TTY: run interactive prompts
4. Platform selection → Provider selection → Agent selection
5. Check if output file exists; if yes, confirm overwrite
6. Write config file
7. Run validation and print summary
8. Exit 0 (success) or exit with appropriate code based on validation

**Non-Interactive Mode** (`--defaults`):

1. Validate `--provider` is set (required)
2. Use platform default if `--platform` not set (github)
3. Use default agents based on provider
4. Write config file (overwrite without prompt)
5. Run validation and print summary
6. Exit 0 or exit with code based on validation

#### Exit Codes

| Code | Condition                                                  |
| ---- | ---------------------------------------------------------- |
| 0    | Success (file written, validation passed or only warnings) |
| 0    | User cancelled (intentional, not an error)                 |
| 1    | Error: not TTY and no `--defaults` flag                    |
| 1    | Error: validation errors after writing file                |
| 1    | Error: invalid CLI options                                 |
| 1    | Error: file write failure                                  |

#### Output Format

**Interactive prompt example**:

```
Welcome to ai-review configuration wizard!

Select your platform:
  1. GitHub (GitHub.com or GitHub Enterprise)
  2. Azure DevOps (Azure DevOps Services or Server)
  3. Both (Support both GitHub and Azure DevOps)

Enter choice [1-3]:
```

**Success output**:

```
✓ Configuration written to .ai-review.yml

Validating configuration...
✓ Configuration valid
  Provider: openai
  Model: gpt-4o (auto-applied default)
  Key source: env:OPENAI_API_KEY
  Config source: file

Next steps:
  1. Set OPENAI_API_KEY environment variable
  2. Run 'ai-review review --repo .' to test
```

**Warning output**:

```
✓ Configuration written to .ai-review.yml

Validating configuration...
⚠ WARNING: OPENAI_API_KEY not set
  Set this environment variable before running reviews.

✓ Configuration valid (with warnings)
  Provider: openai
  Model: gpt-4o (auto-applied default)
  Key source: (not set)
  Config source: file
```

---

### `ai-review validate`

Validates configuration file and runs all preflight checks.

#### Usage

```bash
ai-review validate --repo .
ai-review validate --repo /path/to/repo
```

#### Options

| Option   | Type   | Required | Description                            |
| -------- | ------ | -------- | -------------------------------------- |
| `--repo` | string | Yes      | Path to repository with .ai-review.yml |

#### Behavior

1. Load config from `<repo>/.ai-review.yml`
2. If config not found: print error and exit 1
3. Run all preflight checks via `runPreflightChecks()`
4. Print validation report (errors, warnings, info)
5. On success: print resolved configuration tuple
6. Exit based on validation result

#### Exit Codes

| Code | Condition                                       |
| ---- | ----------------------------------------------- |
| 0    | Validation passed (no errors; warnings allowed) |
| 1    | Validation failed (any errors)                  |
| 1    | Config file not found                           |
| 1    | Invalid YAML syntax                             |

#### Output Format

**Success**:

```
Validating configuration at /path/to/repo/.ai-review.yml...

✓ Configuration valid
  Provider: anthropic
  Model: claude-sonnet-4-20250514
  Key source: env:ANTHROPIC_API_KEY
  Config source: file
```

**Error**:

```
Validating configuration at /path/to/repo/.ai-review.yml...

✗ ERROR: Multiple provider keys detected with MODEL env var but no explicit provider
  Found keys: OPENAI_API_KEY, ANTHROPIC_API_KEY
  MODEL is set to: gpt-4o
  Fix: Add 'provider: openai' to your .ai-review.yml to resolve ambiguity

Validation failed with 1 error(s).
```

**Warning (still exits 0)**:

```
Validating configuration at /path/to/repo/.ai-review.yml...

⚠ WARNING: Legacy environment variable detected: OPENAI_MODEL
  This variable is deprecated. Use MODEL instead.
  Migration: export MODEL="$OPENAI_MODEL" && unset OPENAI_MODEL

✓ Configuration valid (with warnings)
  Provider: openai
  Model: gpt-4o
  Key source: env:OPENAI_API_KEY
  Config source: merged
```

---

## Validation Checks Performed

The `validate` command runs all preflight checks from `runPreflightChecks()`:

| Check                        | Error Condition                              | Category            |
| ---------------------------- | -------------------------------------------- | ------------------- |
| API Keys                     | Missing required keys for enabled agents     | api-keys            |
| Model Config                 | No model configured (0 keys or ambiguous)    | model-config        |
| Model-Provider Match         | Model family doesn't match detected provider | provider-match      |
| Provider-Model Compatibility | Would cause 404 (e.g., gpt-4o on Anthropic)  | provider-match      |
| Azure Deployment             | Azure selected but deployment name missing   | azure-config        |
| Multi-Key Ambiguity          | 2+ keys + MODEL env + no explicit provider   | multi-key-ambiguity |
| Explicit Provider Keys       | Provider specified but keys missing          | api-keys            |
| Chat Model Compatibility     | Completions-only model (Codex) used          | model-config        |
| Legacy Keys                  | Deprecated env vars detected                 | legacy-keys         |

---

## Signal Handling

| Signal          | Behavior                      |
| --------------- | ----------------------------- |
| SIGINT (Ctrl+C) | Exit 0 (user cancellation)    |
| SIGTERM         | Exit 0 (graceful termination) |
| SIGPIPE         | Ignored (allow piped output)  |

---

## Environment Variables

No new environment variables introduced. Wizard warns about required variables based on selected provider:

| Provider     | Required Variables                                                         |
| ------------ | -------------------------------------------------------------------------- |
| openai       | `OPENAI_API_KEY`                                                           |
| anthropic    | `ANTHROPIC_API_KEY`                                                        |
| azure-openai | `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` |
| ollama       | `OLLAMA_BASE_URL` (optional but recommended)                               |
