# Data Model: False Positive Deep Fixes & Benchmark Integration

**Branch**: `410-false-positive-deep-fixes` | **Date**: 2026-03-11

## Entities

### 1. AgentContext (Extended)

**Source**: `router/src/agents/types.ts` lines 330-357
**Change type**: Extension (add optional fields)

| Field                    | Type                                | Required | Description                                     |
| ------------------------ | ----------------------------------- | -------- | ----------------------------------------------- |
| repoPath                 | string                              | yes      | Repository root path (existing)                 |
| diff                     | DiffSummary                         | yes      | Parsed diff metadata (existing)                 |
| files                    | DiffFile[]                          | yes      | Filtered file list (existing)                   |
| config                   | Config                              | yes      | Validated configuration (existing)              |
| diffContent              | string                              | yes      | Raw diff text for LLM context (existing)        |
| prNumber                 | number                              | no       | PR number (existing)                            |
| env                      | Record<string, string \| undefined> | yes      | Environment variables (existing)                |
| effectiveModel           | string                              | yes      | Resolved model ID (existing)                    |
| provider                 | string \| null                      | yes      | LLM provider (existing)                         |
| **prDescription**        | **string**                          | **no**   | **NEW: PR title + body for context enrichment** |
| **projectRules**         | **string**                          | **no**   | **NEW: CLAUDE.md / project rules content**      |
| **reviewIgnorePatterns** | **string[]**                        | **no**   | **NEW: Exposed .reviewignore patterns**         |

**Validation**: prDescription and projectRules are sanitized (null bytes removed, length bounded by token budget). reviewIgnorePatterns already validated by existing reviewignore.ts.

### 2. SafeSourcePattern

**Source**: NEW file `router/src/agents/control_flow/safe-source-patterns.ts`
**Mirrors**: MitigationPattern from mitigation-patterns.ts

| Field            | Type                        | Required | Description                                        |
| ---------------- | --------------------------- | -------- | -------------------------------------------------- |
| id               | string                      | yes      | Unique identifier (e.g., 'constant-literal-array') |
| name             | string                      | yes      | Human-readable name                                |
| description      | string                      | yes      | What makes this source safe                        |
| preventsTaintFor | VulnerabilityType[]         | yes      | Vulnerability types this source is safe for        |
| match            | SafeSourceMatchCriteria     | yes      | AST matching rules                                 |
| confidence       | 'high' \| 'medium' \| 'low' | yes      | Detection confidence                               |

### 3. SafeSourceMatchCriteria

**Source**: NEW, part of safe-source-patterns.ts

| Field                     | Type                | Required | Description                                                                                          |
| ------------------------- | ------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| type                      | SafeSourceMatchType | yes      | 'constant_declaration' \| 'builtin_reference' \| 'safe_function_return' \| 'constant_element_access' |
| identifiers               | string[]            | no       | Exact identifier names to match (e.g., ['__dirname', '__filename'])                                  |
| callTargets               | string[]            | no       | Function names whose return values are safe (e.g., ['readdirSync'])                                  |
| requireModuleScope        | boolean             | no       | If true, declaration must be at module level                                                         |
| requireLiteralInitializer | boolean             | no       | If true, initializer must be a literal value                                                         |

### 4. SafeSourceInstance

**Source**: NEW, runtime detection result

| Field        | Type                           | Required | Description                          |
| ------------ | ------------------------------ | -------- | ------------------------------------ |
| patternId    | string                         | yes      | Which SafeSourcePattern matched      |
| variableName | string                         | yes      | The variable name identified as safe |
| location     | { file: string, line: number } | yes      | Source location                      |
| confidence   | 'high' \| 'medium' \| 'low'    | yes      | Inherited from pattern               |

### 5. FindingClassification

**Source**: NEW, part of finding-validator.ts

| Value        | Criteria                                            | Line Validation | Language Validation |
| ------------ | --------------------------------------------------- | --------------- | ------------------- |
| `inline`     | `finding.file` present AND `finding.line` defined   | YES             | YES                 |
| `file-level` | `finding.file` present AND `finding.line` undefined | SKIP            | YES                 |
| `global`     | `finding.file` undefined                            | SKIP            | YES                 |
| `cross-file` | `finding.file` present but NOT in diff              | SKIP (logged)   | YES                 |

### 6. FindingValidationResult

**Source**: NEW file `router/src/report/finding-validator.ts`

| Field          | Type                                   | Required | Description                                                          |
| -------------- | -------------------------------------- | -------- | -------------------------------------------------------------------- |
| finding        | Finding                                | yes      | The original finding                                                 |
| classification | FindingClassification                  | yes      | How the finding was classified (inline/file-level/global/cross-file) |
| valid          | boolean                                | yes      | Whether finding passed all validation checks                         |
| filterReason   | string                                 | no       | Why finding was filtered (if invalid)                                |
| filterType     | 'invalid_line' \| 'self_contradicting' | no       | Category of filter applied                                           |

### 7. FindingValidationSummary

**Source**: NEW, return type of validateFindings()

| Field         | Type                                                                                                                                                   | Required | Description                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------- |
| validFindings | Finding[]                                                                                                                                              | yes      | Findings that passed validation                         |
| filtered      | FindingValidationResult[]                                                                                                                              | yes      | Findings that were filtered with reasons                |
| stats         | { total: number, valid: number, filteredByLine: number, filteredBySelfContradiction: number, byClassification: Record<FindingClassification, number> } | yes      | Aggregate counts including per-classification breakdown |

### 8. BenchmarkScenario

**Source**: NEW, benchmark fixture format (consolidated in `regression-suite.json`)

| Field            | Type                                   | Required | Description                                                                                                                                               |
| ---------------- | -------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id               | string                                 | yes      | Unique scenario ID (e.g., 'fp-a-001')                                                                                                                     |
| category         | string                                 | yes      | Pattern category ('safe-source', 'framework-conventions', 'project-context', 'pr-description', 'self-contradicting', or custom subcategory for pattern F) |
| pattern          | 'A' \| 'B' \| 'C' \| 'D' \| 'E' \| 'F' | yes      | Root-cause pattern from spec ('F' for remaining/mixed)                                                                                                    |
| description      | string                                 | yes      | Human-readable description                                                                                                                                |
| sourceIssue      | string                                 | yes      | GitHub issue reference (e.g., '#158.1')                                                                                                                   |
| diff             | string                                 | yes      | Unified diff content for the scenario                                                                                                                     |
| config           | object                                 | no       | Optional config override                                                                                                                                  |
| prDescription    | string                                 | no       | Optional PR description for context scenarios                                                                                                             |
| projectRules     | string                                 | no       | Optional project rules for context scenarios                                                                                                              |
| expectedFindings | ExpectedFinding[]                      | yes      | Expected findings (empty for false-positive tests)                                                                                                        |
| truePositive     | boolean                                | yes      | Whether this scenario tests true-positive preservation                                                                                                    |
| subcategory      | string                                 | no       | For pattern 'F' only: specific root cause explanation                                                                                                     |
| source           | string                                 | no       | Origin of fixture: 'internal' (default, from #158-161) or external benchmark name                                                                         |

### 9. ExpectedFinding

**Source**: NEW, part of BenchmarkScenario

| Field           | Type     | Required | Description                             |
| --------------- | -------- | -------- | --------------------------------------- |
| file            | string   | yes      | Expected file path                      |
| line            | number   | no       | Expected line number                    |
| severityAtLeast | Severity | no       | Minimum expected severity               |
| messageContains | string   | no       | Substring that should appear in message |
| ruleId          | string   | no       | Expected rule ID                        |

### 10. BenchmarkReport

**Source**: NEW, benchmark output format with dual-pool scoring

| Field          | Type                           | Required | Description                                  |
| -------------- | ------------------------------ | -------- | -------------------------------------------- |
| schemaVersion  | string                         | yes      | Report format version ('1.0.0')              |
| timestamp      | string                         | yes      | ISO 8601 UTC                                 |
| totalScenarios | number                         | yes      | Count of scenarios run                       |
| pool1          | FPRegressionPool               | yes      | FP-regression pool metrics (43 scenarios)    |
| pool2          | TPPreservationPool             | yes      | TP-preservation pool metrics (10+ scenarios) |
| byCategory     | Record<string, CategoryResult> | yes      | Per-pattern-category breakdown               |
| scenarios      | ScenarioResult[]               | yes      | Individual scenario results                  |

### 10a. FPRegressionPool

| Field           | Type   | Required | Description                    |
| --------------- | ------ | -------- | ------------------------------ |
| total           | number | yes      | Total FP scenarios             |
| trueNegatives   | number | yes      | Correctly suppressed           |
| falsePositives  | number | yes      | Incorrectly produced findings  |
| suppressionRate | number | yes      | TN / (TN + FP) — target >= 85% |
| fpRate          | number | yes      | 1 - suppressionRate            |

### 10b. TPPreservationPool

| Field          | Type   | Required | Description                               |
| -------------- | ------ | -------- | ----------------------------------------- |
| total          | number | yes      | Total TP scenarios                        |
| truePositives  | number | yes      | Expected findings matched                 |
| falseNegatives | number | yes      | Expected findings missed                  |
| extraneous     | number | yes      | Actual findings not matching any expected |
| recall         | number | yes      | TP / (TP + FN) — target = 100%            |
| precision      | number | yes      | TP / (TP + extraneous) — target >= 70%    |

### 11. PullRequestContext (Extended)

**Source**: `router/src/trust.ts` lines 8-21
**Change type**: Extension (add optional fields)

| Field     | Type       | Required | Description                  |
| --------- | ---------- | -------- | ---------------------------- |
| number    | number     | yes      | PR number (existing)         |
| headRepo  | string     | yes      | Source repository (existing) |
| baseRepo  | string     | yes      | Target repository (existing) |
| author    | string     | yes      | PR author (existing)         |
| isFork    | boolean    | yes      | Fork status (existing)       |
| isDraft   | boolean    | yes      | Draft status (existing)      |
| **title** | **string** | **no**   | **NEW: PR title**            |
| **body**  | **string** | **no**   | **NEW: PR body/description** |

## Entity Relationships

```text
AgentContext ──has──> prDescription (string, from PullRequestContext.title + body)
AgentContext ──has──> projectRules (string, from CLAUDE.md file)
AgentContext ──has──> reviewIgnorePatterns (string[], from .reviewignore file)

VulnerabilityDetector ──uses──> SafeSourcePattern[] (declarative pattern definitions)
VulnerabilityDetector ──produces──> SafeSourceInstance[] (runtime detections)
SafeSourceInstance ──prevents──> TaintedVariable (safe sources excluded from taint tracking)

Finding ──validated-by──> FindingValidationResult (post-processing)
Finding[] ──produces──> FindingValidationSummary (aggregate validation)

BenchmarkScenario ──contains──> ExpectedFinding[] (ground truth)
BenchmarkScenario[] ──produces──> BenchmarkReport (aggregate metrics)
```

## State Transitions

### Finding Lifecycle (Extended)

```text
[Agent Generates] → [Deduplicated] → [Sanitized] → [Validated*] → [Sorted] → [Posted]
                                                         │
                                                         ├─ valid → continues to [Sorted]
                                                         └─ filtered → [Logged] (diagnostic)

* NEW step: Validated via finding-validator.ts
```

### Safe Source Detection Flow

```text
[AST Node] → [Is taint source?] → YES → [Is safe source?] → YES → [Skip: no taint]
                     │                          │
                     NO → [Skip]                NO → [Add to tainted variables]
```
