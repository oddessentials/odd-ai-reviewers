# Data Model: Local Review Mode & Terminal Reporter

**Feature Branch**: `407-local-review-mode`
**Date**: 2026-02-01

---

## New Entities

### GitContext

Represents the inferred git repository context for local review.

| Field          | Type    | Description                                   |
| -------------- | ------- | --------------------------------------------- |
| repoRoot       | string  | Absolute path to repository root              |
| currentBranch  | string  | Current branch name (or 'HEAD' if detached)   |
| defaultBase    | string  | Detected default branch (main/master/develop) |
| hasUncommitted | boolean | Whether working tree has uncommitted changes  |
| hasStaged      | boolean | Whether index has staged changes              |

**Validation Rules**:

- `repoRoot` must be absolute path containing `.git` directory
- `currentBranch` must not be empty
- `defaultBase` must exist in local or remote refs

**State Transitions**: Immutable snapshot, regenerated per command invocation.

---

### LocalReviewOptions

Command-line options specific to local review mode.

| Field       | Type         | Default     | Description                   |
| ----------- | ------------ | ----------- | ----------------------------- |
| path        | string       | "."         | Directory to review           |
| base        | string?      | auto-detect | Base reference for comparison |
| head        | string?      | "HEAD"      | Head reference                |
| range       | string?      | null        | Git range (e.g., HEAD~3..)    |
| staged      | boolean      | false       | Review only staged changes    |
| uncommitted | boolean      | true        | Include uncommitted changes   |
| pass        | string?      | null        | Run specific pass only        |
| agent       | string?      | null        | Run specific agent only       |
| format      | OutputFormat | "pretty"    | Output format                 |
| noColor     | boolean      | false       | Disable colored output        |
| quiet       | boolean      | false       | Minimal output (errors only)  |
| verbose     | boolean      | false       | Debug information             |
| dryRun      | boolean      | false       | Show what would be reviewed   |
| costOnly    | boolean      | false       | Estimate cost only            |
| config      | string?      | null        | Config file path              |

**Validation Rules**:

- `range` is mutually exclusive with `base`/`head` — if both specified, emit warning and use `range`
- `staged` overrides `uncommitted` — when `--staged` is set, only staged changes are reviewed regardless of `--uncommitted`
- If both `staged=false` and `uncommitted=false`, error: "Nothing to review. Specify --staged or --uncommitted."
- `format` must be one of: pretty, json, sarif
- `quiet` and `verbose` are mutually exclusive

---

### TerminalContext

Context object for terminal reporter.

| Field        | Type         | Default     | Description              |
| ------------ | ------------ | ----------- | ------------------------ |
| colored      | boolean      | auto-detect | Enable ANSI colors       |
| verbose      | boolean      | false       | Show debug info          |
| quiet        | boolean      | false       | Errors only              |
| format       | OutputFormat | "pretty"    | Output format            |
| showProgress | boolean      | true        | Show progress indicators |
| showCost     | boolean      | true        | Show cost in summary     |

**Validation Rules**:

- `colored` defaults to true if stdout is TTY
- `quiet` suppresses all non-error output

---

### TerminalFinding

Extended finding for terminal display with code context.

| Field              | Type         | Description                 |
| ------------------ | ------------ | --------------------------- |
| (inherits Finding) | -            | All Finding fields          |
| codeSnippet        | CodeSnippet? | Surrounding code context    |
| displayLine        | number?      | Normalized line for display |

**Relationships**:

- Extends `Finding` from `router/src/agents/types.ts`
- `codeSnippet` extracted from diff patch

---

### CodeSnippet

Code context for displaying findings.

| Field         | Type          | Description                 |
| ------------- | ------------- | --------------------------- |
| lines         | SnippetLine[] | Array of code lines         |
| highlightLine | number        | 0-indexed line to highlight |
| language      | string?       | Language for syntax hint    |

---

### SnippetLine

Individual line in code snippet.

| Field         | Type    | Description                      |
| ------------- | ------- | -------------------------------- |
| lineNumber    | number  | 1-indexed line number            |
| content       | string  | Line content                     |
| isHighlighted | boolean | Whether this is the finding line |

---

### ReviewSummary

Terminal output summary.

| Field         | Type          | Description                      |
| ------------- | ------------- | -------------------------------- |
| errorCount    | number        | Findings with severity 'error'   |
| warningCount  | number        | Findings with severity 'warning' |
| infoCount     | number        | Findings with severity 'info'    |
| filesAnalyzed | number        | Number of files in diff          |
| linesChanged  | number        | Total additions + deletions      |
| executionTime | number        | Milliseconds elapsed             |
| estimatedCost | number        | USD estimate                     |
| passResults   | PassSummary[] | Per-pass breakdown               |

---

### PassSummary

Summary for a single review pass.

| Field         | Type           | Description             |
| ------------- | -------------- | ----------------------- |
| passName      | string         | Pass identifier         |
| findingsCount | number         | Findings from this pass |
| agentResults  | AgentSummary[] | Per-agent breakdown     |
| durationMs    | number         | Pass execution time     |

---

### AgentSummary

Summary for a single agent execution.

| Field         | Type                                | Description         |
| ------------- | ----------------------------------- | ------------------- |
| agentId       | string                              | Agent identifier    |
| agentName     | string                              | Human-readable name |
| status        | 'success' \| 'failure' \| 'skipped' | Execution result    |
| findingsCount | number                              | Findings produced   |
| reason        | string?                             | Skip/failure reason |

---

### ZeroConfigDefaults

Generated configuration when no `.ai-review.yml` exists.

| Field    | Type     | Value            | Description           |
| -------- | -------- | ---------------- | --------------------- |
| version  | number   | 1                | Config schema version |
| passes   | Pass[]   | [single AI pass] | Default review passes |
| limits   | Limits   | conservative     | Resource limits       |
| provider | Provider | auto-detect      | From environment      |

**Auto-Detection Logic** (priority order):

1. If `ANTHROPIC_API_KEY` set → provider: 'anthropic'
2. If `OPENAI_API_KEY` set → provider: 'openai'
3. If `AZURE_OPENAI_*` set → provider: 'azure-openai'
4. If `OLLAMA_*` set → provider: 'ollama'
5. Otherwise → error: no credentials

**Multi-Provider Handling**: If multiple provider keys are found, the highest-priority provider is used. Output indicates which provider was selected and which were ignored:
```
Using Anthropic (ANTHROPIC_API_KEY found)
Note: OPENAI_API_KEY also set but ignored due to priority order
```

---

## Existing Entities (Extended)

### Finding (existing, no changes)

Core finding structure remains unchanged. Terminal reporter consumes normalized findings.

### DiffSummary (existing, extended)

Add support for working tree diffs:

| New Field | Type                          | Description      |
| --------- | ----------------------------- | ---------------- |
| source    | 'local-git' \| 'working-tree' | Diff source type |

---

## Output Formats

### OutputFormat Enum

```
pretty  - Human-readable with colors and boxes
json    - JSON array of findings
sarif   - SARIF 2.1.0 compliant
```

### JSON Output Schema

```json
{
  "schema_version": "1.0.0",
  "version": "1.2.0",
  "timestamp": "2026-02-01T12:00:00Z",
  "summary": {
    "errorCount": 0,
    "warningCount": 0,
    "infoCount": 0,
    "filesAnalyzed": 0,
    "executionTimeMs": 0,
    "estimatedCostUsd": 0.0
  },
  "findings": [
    {
      "severity": "error|warning|info",
      "file": "string",
      "line": 0,
      "endLine": 0,
      "message": "string",
      "suggestion": "string",
      "ruleId": "string",
      "sourceAgent": "string"
    }
  ],
  "partialFindings": [],
  "passes": [],
  "config": {}
}
```

**Field Definitions:**
- `schema_version`: Output format version (for consumer compatibility validation)
- `version`: Tool version (from package.json)
- `timestamp`: ISO 8601 format, always UTC (Z suffix)
```

### SARIF Output Schema

Follows SARIF 2.1.0 specification:

- `$schema`: "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json"
- `version`: "2.1.0"
- `runs[0].tool.driver.name`: "odd-ai-reviewers"
- `runs[0].results[]`: Mapped findings

---

## Entity Relationships

```
LocalReviewOptions
    │
    ├─ generates ─→ GitContext
    │
    ├─ loads ─→ Config (or ZeroConfigDefaults)
    │
    ├─ creates ─→ DiffSummary
    │                │
    │                └─ contains ─→ DiffFile[]
    │
    └─ produces ─→ Finding[]
                      │
                      └─ formatted as ─→ TerminalFinding[]
                                            │
                                            └─ rendered in ─→ ReviewSummary
```

---

## State Diagram: Local Review Flow

```
┌─────────────────┐
│   CLI Invoked   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Infer GitContext│
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌───────────────────┐
│  Load Config    │────▶│ ZeroConfigDefaults│
└────────┬────────┘     │   (if missing)    │
         │              └───────────────────┘
         ▼
┌─────────────────┐
│ Generate Diff   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Execute Agents  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Process Findings│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Terminal Output │
└─────────────────┘
```
