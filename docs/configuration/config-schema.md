# Configuration Schema Reference

The `.ai-review.yml` file controls how AI review runs in your repository.

## Full Schema

```yaml
version: 1 # Schema version (required: 1)
trusted_only: true # Only run on non-fork PRs

triggers:
  on: [pull_request, push] # When to trigger
  branches: [main, develop] # Which branches to review

passes:
  - name: static # Pass name
    agents: [semgrep] # Agents to run
    enabled: true # Enable/disable pass
    required: true # Fail fast when prerequisites are missing
  - name: semantic
    agents: [opencode, pr_agent]
    enabled: true
    required: false

limits:
  max_files: 50 # Max files per PR
  max_diff_lines: 2000 # Max diff lines
  max_tokens_per_pr: 12000 # Max LLM tokens
  max_usd_per_pr: 1.00 # Max cost per PR
  monthly_budget_usd: 100 # Monthly budget

reporting:
  github:
    mode: checks_and_comments # checks_only | comments_only | checks_and_comments
    max_inline_comments: 20 # Max inline comments
    summary: true # Post summary comment
  ado:
    mode: threads_and_status # threads_only | status_only | threads_and_status
    max_inline_comments: 20 # Max inline comments
    summary: true # Post summary thread
    thread_status: active # active | pending

gating:
  enabled: false # Block merge on findings
  fail_on_severity: error # error | warning | info

path_filters:
  include: # Only review these paths
    - 'src/**'
    - 'lib/**'
  exclude: # Skip these paths
    - '**/*.test.ts'
    - '**/node_modules/**'
```

## Properties

### `version` (required)

Schema version. Currently only `1` is supported.

### `trusted_only`

When `true` (default), AI review only runs on PRs from the same repository. Fork PRs are skipped.

### `triggers`

Controls when reviews run:

- `on`: Event types (`pull_request`, `push`)
- `branches`: Target branches to review

### `passes`

Array of review passes executed in order. Each pass has:

- `name`: Identifier for the pass
- `agents`: Array of agent IDs to run
- `enabled`: Whether the pass runs
- `required`: When `true`, missing prerequisites (like API keys) fail fast

Available agents:

- `semgrep` — Static security analysis (free)
- `reviewdog` — Annotation formatter
- `control_flow` — Control flow analysis with vulnerability detection (free)
- `opencode` — OpenCode.ai semantic review
- `pr_agent` — PR-Agent AI review
- `local_llm` — Local Ollama-based review
- `ai_semantic_review` — Direct OpenAI/Anthropic SDK integration

### Agent Capability Matrix

| Agent                | Deterministic | LLM-backed | Network Access | Cost Impact  |
| -------------------- | ------------- | ---------- | -------------- | ------------ |
| `semgrep`            | ✅            | ❌         | ❌             | Free         |
| `reviewdog`          | ✅            | ❌         | ❌             | Free         |
| `control_flow`       | ✅            | ❌         | ❌             | Free         |
| `opencode`           | ❌            | ✅         | ✅             | Medium       |
| `pr_agent`           | ❌            | ✅         | ✅             | Low          |
| `local_llm`          | ❌            | ✅         | ❌             | Compute-only |
| `ai_semantic_review` | ❌            | ✅         | ✅             | Medium       |

### `limits`

Budget controls to prevent runaway costs:

| Property             | Default | Description                       |
| -------------------- | ------- | --------------------------------- |
| `max_files`          | 50      | Skip review if more files changed |
| `max_diff_lines`     | 2000    | Truncate diff at this limit       |
| `max_tokens_per_pr`  | 12000   | Max LLM input tokens              |
| `max_usd_per_pr`     | 1.00    | Max estimated cost per PR         |
| `monthly_budget_usd` | 100     | Monthly spending cap              |

### `reporting`

GitHub-specific reporting options:

- `mode`: How to report findings
  - `checks_only`: Only create check runs
  - `comments_only`: Only post PR comments
  - `checks_and_comments`: Both (default)
- `max_inline_comments`: Limit inline comment spam
- `summary`: Post a summary comment

### `gating`

Optional merge blocking:

- `enabled`: If `true`, set check status based on findings
- `fail_on_severity`: Minimum severity to fail
  - `error`: Only fail on errors
  - `warning`: Fail on warnings or errors
  - `info`: Fail on any finding

### `path_filters`

Glob patterns to include/exclude files:

- `include`: Only review matching files
- `exclude`: Skip matching files

## `.reviewignore` File

In addition to `path_filters` in `.ai-review.yml`, you can create a `.reviewignore` file at your repository root to exclude files from review using [`.gitignore`-compatible syntax](https://git-scm.com/docs/gitignore#_pattern_format).

### Syntax

```gitignore
# Comments start with #
# Empty lines are ignored

# Bare names match anywhere and include directory contents
node_modules
.vscode

# Trailing slash explicitly marks directories
dist/
vendor/

# Wildcards work as expected
*.min.js
*.generated.ts

# Negation patterns re-include previously excluded files
!webpack.config.js

# Root-relative patterns (leading /) only match at repo root
/config.local.js

# Path patterns are anchored
src/generated/
```

#### Bare Segment Matching

When you use a bare name like `node_modules` (no path separators), it matches that name **anywhere** in the path, plus all contents within it.

**What `node_modules` matches:**

| Path                             | Matches? | Why                   |
| -------------------------------- | -------- | --------------------- |
| `node_modules`                   | ✅       | Directory itself      |
| `node_modules/lodash/index.js`   | ✅       | Contents of directory |
| `src/node_modules/local/file.js` | ✅       | Nested occurrence     |

**What `node_modules` does NOT match:**

| Path                          | Matches? | Why                            |
| ----------------------------- | -------- | ------------------------------ |
| `node_modules_backup/file.js` | ❌       | Different segment (has suffix) |
| `my-node_modules/file.js`     | ❌       | Different segment (has prefix) |

> **Tip**: To match only at the repository root, use `/node_modules` instead of `node_modules`.

### Pattern Normalization

Patterns you write in `.reviewignore` are transformed before matching. Understanding these transformations helps you write effective exclusion rules.

| You Write       | Becomes           | Rule                                        |
| --------------- | ----------------- | ------------------------------------------- |
| `node_modules`  | `**/node_modules` | Bare name → matches anywhere in path        |
| `/config.js`    | `config.js`       | Leading `/` → root-relative only            |
| `dist/`         | `**/dist/**`      | Trailing `/` → directory + all contents     |
| `src/generated` | `src/generated`   | Has `/` → path-relative (no transformation) |
| `./src/file.ts` | `src/file.ts`     | Leading `./` stripped                       |
| `**/vendor`     | `**/vendor`       | Already recursive → no change               |

**When is `**/` prefix added?\*\*

The `**/` prefix (match anywhere) is added only when ALL of these are true:

- Pattern has no path separator (except trailing `/`)
- Pattern doesn't start with `/` (not root-relative)
- Pattern doesn't already start with `**`

This means `node_modules` matches `node_modules/`, `src/node_modules/`, and `deep/path/node_modules/`, while `/node_modules` only matches at the repository root.

### Filter Precedence

When both `.reviewignore` and `path_filters` are configured, they are applied in this order:

1. **`.reviewignore`** — Files matching patterns are excluded first
2. **`path_filters.exclude`** — Additional files are excluded
3. **`path_filters.include`** — If set, only matching files survive

### When to Use Each

| Use Case                                                | Recommended            |
| ------------------------------------------------------- | ---------------------- |
| Repository-wide exclusions (dependencies, build output) | `.reviewignore`        |
| Workflow-specific filtering (only review `src/`)        | `path_filters.include` |
| Exclude test files from semantic review                 | `path_filters.exclude` |

### Example `.reviewignore`

```gitignore
# Dependencies
node_modules
vendor/

# Build outputs
dist/
*.min.js
*.bundle.js

# Generated files
src/generated/
**/*.pb.go

# IDE and editor files
.vscode
.idea

# But keep important configs
!.vscode/settings.json

# Exclude directory but keep specific file for review
node_modules
!node_modules/important-patch.js
```

#### Negation Pattern Behavior

Negation patterns (starting with `!`) re-include files that were previously excluded. The **last matching pattern wins**:

```gitignore
node_modules           # Exclude all node_modules contents
!node_modules/keep.js  # Re-include this specific file
```

In this example, `node_modules/keep.js` will be reviewed while all other files in `node_modules/` remain excluded.

## Examples

### Minimal Configuration

```yaml
version: 1
```

Uses defaults: Semgrep-only static analysis, trusted PRs only. AI agents run only when configured.

### Static Analysis Only (Free)

```yaml
version: 1
passes:
  - name: static
    agents: [semgrep]
```

### Strict Gating

```yaml
version: 1
gating:
  enabled: true
  fail_on_severity: warning
```

### Large Repository

```yaml
version: 1
limits:
  max_files: 100
  max_diff_lines: 5000
  max_tokens_per_pr: 30000
  max_usd_per_pr: 5.00
path_filters:
  exclude:
    - '**/generated/**'
    - '**/vendor/**'
```
