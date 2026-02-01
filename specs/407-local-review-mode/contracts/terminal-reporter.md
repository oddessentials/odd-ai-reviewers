# Terminal Reporter Contract

**Feature Branch**: `407-local-review-mode`
**Date**: 2026-02-01

---

## Module Interface

### Location

`router/src/report/terminal.ts`

### Exports

```typescript
export interface TerminalContext {
  colored: boolean;
  verbose: boolean;
  quiet: boolean;
  format: 'pretty' | 'json' | 'sarif';
  showProgress: boolean;
  showCost: boolean;
}

export interface TerminalReportResult {
  success: boolean;
  findingsCount: number;
  partialFindingsCount: number;
  error?: string;
}

export function reportToTerminal(
  findings: Finding[],
  partialFindings: Finding[],
  context: TerminalContext,
  config: Config,
  diffFiles: DiffFile[]
): Promise<TerminalReportResult>;

export function formatFindingForTerminal(finding: Finding, context: TerminalContext): string;

export function generateTerminalSummary(
  findings: Finding[],
  partialFindings: Finding[],
  executionTimeMs: number,
  estimatedCostUsd: number
): string;
```

---

## Processing Pipeline

The terminal reporter follows the same pipeline as GitHub/ADO reporters:

```
Input: Finding[], PartialFinding[], Config, DiffFile[]
  │
  ├─ 1. Canonicalize diff files
  │     canonicalizeDiffFiles(diffFiles)
  │
  ├─ 2. Build line resolver
  │     buildLineResolver(canonicalFiles)
  │
  ├─ 3. Normalize findings
  │     normalizeFindingsForDiff(findings, lineResolver)
  │
  ├─ 4. Deduplicate
  │     deduplicateFindings(normalized)
  │
  ├─ 5. Sort
  │     sortFindings(deduplicated)
  │
  └─ 6. Format and output
        formatAndPrint(sorted, context)
```

---

## Output Specifications

### ANSI Color Codes

| Element          | Code                | Fallback      |
| ---------------- | ------------------- | ------------- |
| Error severity   | `\x1b[31m` (red)    | `[ERROR]`     |
| Warning severity | `\x1b[33m` (yellow) | `[WARNING]`   |
| Info severity    | `\x1b[34m` (blue)   | `[INFO]`      |
| File path        | `\x1b[36m` (cyan)   | Plain text    |
| Line number      | `\x1b[90m` (gray)   | Plain text    |
| Suggestion       | `\x1b[32m` (green)  | `Suggestion:` |
| Code highlight   | `\x1b[7m` (inverse) | `▸` prefix    |
| Reset            | `\x1b[0m`           | -             |
| Bold             | `\x1b[1m`           | -             |

### Box Drawing Characters

| Element         | Character | Fallback |
| --------------- | --------- | -------- | --- |
| Top-left        | `┌`       | `+`      |
| Top-right       | `┐`       | `+`      |
| Bottom-left     | `└`       | `+`      |
| Bottom-right    | `┘`       | `+`      |
| Horizontal      | `─`       | `-`      |
| Vertical        | `│`       | `        | `   |
| Section divider | `━`       | `=`      |

### Severity Emojis (reused from existing)

| Severity | Emoji | Text fallback |
| -------- | ----- | ------------- |
| error    | 🔴    | `[E]`         |
| warning  | 🟡    | `[W]`         |
| info     | 🔵    | `[I]`         |

---

## Format: Pretty

### Structure

```
Header
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pass 1: [name]
  Finding boxes...
Pass separator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Pass N: [name]
  Finding boxes...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Summary
```

### Header Format

```
🔍 odd-ai-reviewers v{version}
   Analyzing {fileCount} files ({lineCount} lines changed)
   Config: {configPath} ✓
   Base: {baseBranch} ({source})
```

Where:

- `version`: Package version from package.json
- `fileCount`: Number of files in diff
- `lineCount`: Total additions + deletions
- `configPath`: Path to config file, or "(zero-config defaults)" if none
- `baseBranch`: Detected or specified base
- `source`: "auto-detected" or "specified"

### Finding Box Format

```
┌─ {file}:{line} ─────────────────────────── {severity} ─┐
│ {message}                                              │
│                                                        │
│   {contextBefore}                                      │
│ ▸ {highlightedLine}                                    │
│   {contextAfter}                                       │
│                                                        │
│ 💡 {suggestion}                                        │
└────────────────────────────────────────────────────────┘
```

### Summary Format

```
📊 SUMMARY

   Errors:      {errorCount}
   Warnings:    {warningCount}
   Suggestions: {infoCount}

   Files:    {filesAnalyzed} analyzed
   Cost:     ${estimatedCost} (estimated)
   Time:     {executionTime}s
```

---

## Format: JSON

### Schema

```typescript
interface JsonOutput {
  schema_version: string;  // Output format version (FR-SCH-001)
  version: string;         // Tool version from package.json
  timestamp: string;       // ISO 8601, always UTC (Z suffix)
  summary: {
    errorCount: number;
    warningCount: number;
    infoCount: number;
    filesAnalyzed: number;
    linesChanged: number;
    executionTimeMs: number;
    estimatedCostUsd: number;
  };
  findings: Finding[];
  partialFindings: Finding[];
  passes: PassResult[];
  config: {
    source: 'file' | 'zero-config';
    path?: string;
  };
}
```

### Output Constraints

- Single-line JSON (no pretty-printing by default)
- UTF-8 encoding
- No trailing newline
- Valid JSON per RFC 8259
- `schema_version` MUST be present for consumer compatibility validation

---

## Format: SARIF

### Schema Version

SARIF 2.1.0 (https://docs.oasis-open.org/sarif/sarif/v2.1.0/)

### Mapping

| Finding Field | SARIF Location                                                |
| ------------- | ------------------------------------------------------------- |
| severity      | `results[].level` (error, warning, note)                      |
| file          | `results[].locations[].physicalLocation.artifactLocation.uri` |
| line          | `results[].locations[].physicalLocation.region.startLine`     |
| endLine       | `results[].locations[].physicalLocation.region.endLine`       |
| message       | `results[].message.text`                                      |
| ruleId        | `results[].ruleId`                                            |
| sourceAgent   | `results[].properties.sourceAgent`                            |
| suggestion    | `results[].fixes[].description.text`                          |

### Tool Definition

```json
{
  "driver": {
    "name": "odd-ai-reviewers",
    "version": "{version}",
    "informationUri": "https://github.com/oddessentials/odd-ai-reviewers",
    "rules": []
  }
}
```

**Note on `rules` Array**: The rules array is intentionally empty. Rule definitions are not populated from agent metadata because:
1. AI agents don't have static rule IDs
2. Semgrep rules are external and numerous
3. SARIF validators may show warnings about undefined ruleId references — this is expected and documented

---

## Progress Indicators

### During Agent Execution

```
⠋ Running semgrep...
⠙ Running semgrep...  [1.2s]
✓ semgrep complete: 3 findings
⠋ Running opencode...
✗ opencode failed: timeout
```

### Spinner Characters (for non-quiet mode)

```
⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏
```

### Fallback (no unicode)

```
| / - \
```

---

## Quiet Mode Behavior

When `--quiet` is specified:

- Suppress header
- Suppress progress
- Suppress pass separators
- Output only errors (severity = 'error')
- Minimal summary format:
  ```
  {errorCount} errors found
  ```
  or
  ```
  No errors found
  ```

---

## Verbose Mode Behavior

When `--verbose` is specified, additionally output:

- Git context detection details
- Config loading diagnostics
- Agent command lines (redacted secrets)
- Timing breakdowns
- Memory usage

---

## Error Output

All errors write to stderr, not stdout:

```typescript
console.error('[ai-review] Error: message');
```

Format:

- Prefix with `[ai-review]`
- Include error category
- Include actionable guidance where possible

---

## Exit Code Determination

```typescript
function determineExitCode(findings: Finding[], config: Config): number {
  if (!config.gating.enabled) return 0;

  const threshold = config.gating.fail_on_severity;
  const hasViolations = findings.some((f) => severityRank(f.severity) >= severityRank(threshold));

  return hasViolations ? 1 : 0;
}
```
