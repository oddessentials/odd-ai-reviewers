# Data Model: Control Flow Analysis & Mitigation Recognition

**Feature**: 001-control-flow-analysis
**Date**: 2026-01-27
**Status**: Complete

## Entity Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Analysis Session                               │
│  (per PR review run)                                                     │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ contains
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Analysis Budget                                  │
│  tracks time/size limits, degradation state                             │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ governs
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       File Analysis[]                                    │
│  one per changed file in PR                                             │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ produces
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Control Flow Graph[]                                  │
│  one per function in analyzed files                                     │
└─────────────────────────────────────────────────────────────────────────┘
         │
         ├── contains ──▶ CFG Node[]
         │                    │
         │                    └── contains ──▶ Mitigation Instance[]
         │
         └── connects ──▶ CFG Edge[]
                              │
                              └── condition (optional)

         │
         │ enables detection of
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Potential Vulnerability[]                             │
│  identified sink points requiring mitigation                            │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ evaluated against
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Mitigation Pattern[]                                  │
│  built-in + custom patterns from configuration                          │
└─────────────────────────────────────────────────────────────────────────┘
         │
         │ produces
         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Control Flow Finding[]                                │
│  final output conforming to router Finding schema                       │
└─────────────────────────────────────────────────────────────────────────┘
```

## Core Entities

### 1. Control Flow Graph (CFG)

Represents execution paths through a single function.

| Field          | Type                   | Description                        |
| -------------- | ---------------------- | ---------------------------------- |
| `functionId`   | `string`               | Unique identifier (file:line:name) |
| `functionName` | `string`               | Function/method name               |
| `filePath`     | `string`               | Source file path                   |
| `startLine`    | `number`               | Function start line                |
| `endLine`      | `number`               | Function end line                  |
| `nodes`        | `Map<string, CFGNode>` | All nodes in the graph             |
| `edges`        | `CFGEdge[]`            | Connections between nodes          |
| `entryNode`    | `string`               | ID of entry node                   |
| `exitNodes`    | `string[]`             | IDs of exit nodes (return/throw)   |
| `callSites`    | `CallSite[]`           | Function calls within this CFG     |

**Validation Rules**:

- Every CFG must have exactly one entry node
- Every CFG must have at least one exit node
- All edges must reference existing nodes
- No orphan nodes (unreachable from entry)

---

### 2. CFG Node

Represents a basic block or control point in the CFG.

| Field              | Type                   | Description                     |
| ------------------ | ---------------------- | ------------------------------- |
| `id`               | `string`               | Unique node identifier          |
| `type`             | `CFGNodeType`          | Node classification             |
| `statements`       | `ts.Statement[]`       | AST statements in this block    |
| `lineStart`        | `number`               | First line of block             |
| `lineEnd`          | `number`               | Last line of block              |
| `mitigations`      | `MitigationInstance[]` | Mitigations active at this node |
| `taintedVariables` | `Set<string>`          | Variables with tainted data     |

**Node Types**:

| Type          | Description               |
| ------------- | ------------------------- |
| `entry`       | Function entry point      |
| `exit`        | Normal return             |
| `throw`       | Exception exit            |
| `basic`       | Sequential statements     |
| `branch`      | If/switch condition       |
| `merge`       | Join point after branches |
| `loop_header` | Loop condition check      |
| `loop_body`   | Loop iteration block      |
| `call`        | Function call site        |
| `await`       | Async boundary            |

---

### 3. CFG Edge

Represents a transition between nodes.

| Field            | Type             | Description                      |
| ---------------- | ---------------- | -------------------------------- |
| `from`           | `string`         | Source node ID                   |
| `to`             | `string`         | Target node ID                   |
| `type`           | `CFGEdgeType`    | Edge classification              |
| `condition`      | `ts.Expression?` | Branch condition (if applicable) |
| `conditionValue` | `boolean?`       | True/false branch                |

**Edge Types**:

| Type           | Description              |
| -------------- | ------------------------ |
| `sequential`   | Normal flow              |
| `branch_true`  | Condition is true        |
| `branch_false` | Condition is false       |
| `loop_back`    | Back edge to loop header |
| `loop_exit`    | Exit from loop           |
| `exception`    | Exception thrown         |
| `return`       | Return from call         |

---

### 4. Mitigation Pattern

Defines a code pattern that mitigates a specific vulnerability class.

| Field               | Type                          | Description                |
| ------------------- | ----------------------------- | -------------------------- |
| `id`                | `string`                      | Unique pattern identifier  |
| `name`              | `string`                      | Human-readable name        |
| `description`       | `string`                      | What this pattern does     |
| `mitigates`         | `VulnerabilityType[]`         | Risks this addresses       |
| `match`             | `MatchCriteria`               | How to detect this pattern |
| `confidence`        | `'high' \| 'medium' \| 'low'` | Detection confidence       |
| `isBuiltIn`         | `boolean`                     | Built-in vs custom         |
| `deprecated`        | `boolean`                     | No longer recommended      |
| `deprecationReason` | `string?`                     | Why deprecated             |

**Match Criteria**:

| Field              | Type                     | Description                |
| ------------------ | ------------------------ | -------------------------- |
| `type`             | `MatchType`              | What to match              |
| `name`             | `string?`                | Exact function/method name |
| `namePattern`      | `string?`                | Regex for name matching    |
| `module`           | `string?`                | Required import source     |
| `parameters`       | `ParameterConstraint[]?` | Parameter requirements     |
| `returnConstraint` | `ReturnConstraint?`      | Return value handling      |

**Match Types**: `function_call`, `method_call`, `type_guard`, `assignment`, `typeof_check`, `instanceof_check`

**Vulnerability Types**: `injection`, `null_deref`, `auth_bypass`, `xss`, `path_traversal`, `prototype_pollution`, `ssrf`

---

### 5. Mitigation Instance

A detected application of a mitigation pattern at a specific location.

| Field                | Type                                | Description              |
| -------------------- | ----------------------------------- | ------------------------ |
| `patternId`          | `string`                            | Which pattern matched    |
| `location`           | `SourceLocation`                    | Where detected           |
| `protectedVariables` | `string[]`                          | Variables this mitigates |
| `protectedPaths`     | `string[]`                          | CFG paths this covers    |
| `scope`              | `'block' \| 'function' \| 'module'` | Mitigation scope         |
| `confidence`         | `'high' \| 'medium' \| 'low'`       | Detection confidence     |

---

### 6. Potential Vulnerability

A code location where a vulnerability could exist (sink point).

| Field                 | Type                  | Description                       |
| --------------------- | --------------------- | --------------------------------- |
| `id`                  | `string`              | Unique identifier                 |
| `type`                | `VulnerabilityType`   | Category of vulnerability         |
| `sinkLocation`        | `SourceLocation`      | Where the vulnerability manifests |
| `taintedSource`       | `SourceLocation?`     | Origin of tainted data            |
| `affectedVariable`    | `string`              | Variable at risk                  |
| `requiredMitigations` | `VulnerabilityType[]` | What mitigations would help       |
| `description`         | `string`              | Human-readable explanation        |

---

### 7. Control Flow Finding

Final output entity conforming to router's Finding schema.

| Field         | Type                             | Description                |
| ------------- | -------------------------------- | -------------------------- |
| `severity`    | `'error' \| 'warning' \| 'info'` | Finding severity           |
| `file`        | `string`                         | File path                  |
| `line`        | `number`                         | Start line                 |
| `endLine`     | `number?`                        | End line                   |
| `message`     | `string`                         | Finding description        |
| `suggestion`  | `string?`                        | How to fix                 |
| `ruleId`      | `string`                         | `cfa/<vulnerability-type>` |
| `sourceAgent` | `string`                         | `control_flow`             |
| `fingerprint` | `string`                         | Stable identifier          |
| `metadata`    | `FindingMetadata`                | Extended information       |

**Finding Metadata**:

| Field                 | Type                            | Description            |
| --------------------- | ------------------------------- | ---------------------- |
| `mitigationStatus`    | `'none' \| 'partial' \| 'full'` | Coverage status        |
| `originalSeverity`    | `Severity?`                     | Pre-downgrade severity |
| `pathsCovered`        | `number`                        | Paths with mitigation  |
| `pathsTotal`          | `number`                        | Total paths to sink    |
| `unprotectedPaths`    | `string[]`                      | Path descriptions      |
| `mitigationsDetected` | `string[]`                      | Pattern IDs found      |
| `analysisDepth`       | `number`                        | Call depth reached     |
| `degraded`            | `boolean`                       | Analysis was limited   |
| `degradedReason`      | `string?`                       | Why degraded           |

---

### 8. Analysis Budget

Tracks resource consumption for a single analysis run.

| Field             | Type           | Description                     |
| ----------------- | -------------- | ------------------------------- |
| `startTime`       | `number`       | Analysis start (ms since epoch) |
| `maxDurationMs`   | `number`       | Time limit (default: 300000)    |
| `maxLinesChanged` | `number`       | Size limit (default: 10000)     |
| `maxCallDepth`    | `number`       | Depth limit (default: 5)        |
| `linesAnalyzed`   | `number`       | Lines processed so far          |
| `filesAnalyzed`   | `number`       | Files processed so far          |
| `currentDepth`    | `number`       | Current call depth              |
| `status`          | `BudgetStatus` | Current state                   |
| `degradedAt`      | `number?`      | When degradation started        |

**Budget Status**: `ok`, `warning`, `exceeded`, `terminated`

---

### 9. Mitigation Configuration

User-defined mitigation patterns from config file.

| Field       | Type                  | Description                  |
| ----------- | --------------------- | ---------------------------- |
| `version`   | `string`              | Config schema version        |
| `patterns`  | `MitigationPattern[]` | Custom patterns              |
| `overrides` | `PatternOverride[]`   | Modifications to built-ins   |
| `disabled`  | `string[]`            | Built-in patterns to disable |

**Pattern Override**:

| Field        | Type          | Description          |
| ------------ | ------------- | -------------------- |
| `patternId`  | `string`      | Pattern to override  |
| `confidence` | `Confidence?` | New confidence level |
| `deprecated` | `boolean?`    | Mark as deprecated   |

---

## State Transitions

### Finding Severity Lifecycle

```
[Detected at CRITICAL]
        │
        ▼
    ┌───────────────────────┐
    │  Check all paths      │
    └───────────────────────┘
        │
        ├── All paths mitigated ──▶ SUPPRESSED (no finding)
        │
        ├── No paths mitigated ──▶ CRITICAL (unchanged)
        │
        └── Partial mitigation ──▶ HIGH (downgraded)
                                        │
                                        ▼
                                   [Same check for HIGH]
                                        │
                                        ├── Full ──▶ SUPPRESSED
                                        ├── None ──▶ HIGH
                                        └── Partial ──▶ MEDIUM
                                                           │
                                                           ▼
                                                      [etc. to LOW]
```

**Severity Downgrade Rules** (FR-009):

- Critical → High (partial mitigation)
- High → Medium (partial mitigation)
- Medium → Low (partial mitigation)
- Low → Low (no further downgrade)

### Analysis Budget Lifecycle

```
[START]
   │
   ▼
┌──────────┐    linesAnalyzed > maxLinesChanged    ┌──────────┐
│    OK    │ ──────────────────────────────────────▶│ EXCEEDED │
└──────────┘                                        └──────────┘
   │                                                     │
   │ elapsed > 0.8 * maxDurationMs                       │
   ▼                                                     │
┌──────────┐    elapsed > maxDurationMs             ┌────▼─────┐
│ WARNING  │ ──────────────────────────────────────▶│TERMINATED│
└──────────┘                                        └──────────┘
   │
   │ reduce call depth to 3
   │ skip low-priority files
   ▼
[Continue with degraded analysis]
```

---

## Indexes and Lookups

| Entity            | Key           | Purpose                     |
| ----------------- | ------------- | --------------------------- |
| CFG               | `functionId`  | Fast function lookup        |
| CFGNode           | `id`          | Graph traversal             |
| MitigationPattern | `id`          | Pattern matching            |
| MitigationPattern | `mitigates[]` | Find patterns for vuln type |
| Finding           | `fingerprint` | Deduplication               |
| Finding           | `file:line`   | Location grouping           |

---

## Configuration Schema

```yaml
# .ai-review.yml addition
control_flow:
  enabled: true
  max_call_depth: 5 # FR-003
  time_budget_ms: 300000 # FR-018
  size_budget_lines: 10000 # FR-019

  # Custom mitigation patterns
  mitigation_patterns:
    - id: custom/our-sanitizer
      name: 'Company Sanitizer'
      description: 'Internal sanitization function'
      mitigates: [injection, xss]
      match:
        type: function_call
        name: sanitizeInput
        module: '@company/security'
      confidence: high

  # Override built-in patterns
  pattern_overrides:
    - pattern_id: builtin/validator-escape
      deprecated: true
      deprecation_reason: 'Use DOMPurify instead'

  # Disable specific patterns
  disabled_patterns:
    - builtin/legacy-sanitizer
```
