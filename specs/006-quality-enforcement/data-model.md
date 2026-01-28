# Data Model: Quality Enforcement

**Feature**: 006-quality-enforcement
**Date**: 2026-01-28

## Entities

### 1. CoverageThreshold

Configuration defining minimum coverage percentages.

| Field      | Type   | Required | Description                  |
| ---------- | ------ | -------- | ---------------------------- |
| statements | number | Yes      | Minimum statement coverage % |
| branches   | number | Yes      | Minimum branch coverage %    |
| functions  | number | Yes      | Minimum function coverage %  |
| lines      | number | Yes      | Minimum line coverage %      |

**Validation Rules**:

- All values must be between 0 and 100
- CI thresholds must be >= local thresholds

**State Transitions**: N/A (static configuration)

---

### 2. CoverageConfig

Top-level coverage configuration in vitest.config.ts.

| Field            | Type              | Required | Description                     |
| ---------------- | ----------------- | -------- | ------------------------------- |
| provider         | 'v8'              | Yes      | Coverage provider (fixed)       |
| reporter         | string[]          | Yes      | Output formats                  |
| reportsDirectory | string            | Yes      | Output path                     |
| include          | string[]          | Yes      | Source file patterns            |
| exclude          | string[]          | Yes      | Exclusion patterns              |
| thresholds       | CoverageThreshold | Yes      | Active thresholds (CI or local) |

**Derived Field**:

- `mode`: 'ci' | 'local' - Determined by `process.env.CI === 'true'`

---

### 3. SecurityEvent

Structured log entry for security-related operations.

| Field       | Type   | Required | Description                                                               |
| ----------- | ------ | -------- | ------------------------------------------------------------------------- |
| category    | enum   | Yes      | Event type: `regex_validation`, `mitigation_applied`, `mitigation_failed` |
| ruleId      | string | Yes      | Identifier for the rule/pattern being validated                           |
| file        | string | Yes      | File path being analyzed                                                  |
| patternHash | string | Yes      | SHA-256 hash of pattern (first 16 chars)                                  |
| durationMs  | number | Yes      | Processing time in milliseconds                                           |
| outcome     | enum   | Yes      | Result: `success`, `failure`, `timeout`                                   |
| errorReason | enum   | No       | On failure: `invalid_regex`, `timeout`, `runtime_error`                   |
| timestamp   | string | Yes      | ISO 8601 timestamp                                                        |
| runId       | string | Yes      | Unique identifier for the analysis run                                    |

**Identity/Uniqueness**: `runId` + `ruleId` + `file` + `patternHash`

**Validation Rules**:

- `patternHash` must be exactly 16 hex characters
- `durationMs` must be >= 0
- `errorReason` required when `outcome === 'failure'`

---

### 4. PatternCorpus

Vendored collection of ReDoS test patterns.

| Field          | Type           | Required | Description                      |
| -------------- | -------------- | -------- | -------------------------------- |
| version        | string         | Yes      | Semantic version (e.g., "1.0.0") |
| source_urls    | string[]       | Yes      | URLs of authoritative sources    |
| retrieved_at   | string         | Yes      | ISO 8601 date of curation        |
| curation_rules | string         | Yes      | Selection criteria description   |
| patterns       | PatternEntry[] | Yes      | Array of test patterns           |

**PatternEntry**:

| Field           | Type   | Required | Description                                                             |
| --------------- | ------ | -------- | ----------------------------------------------------------------------- |
| id              | string | Yes      | Unique identifier (e.g., "redos-001")                                   |
| pattern         | string | Yes      | The regex pattern to test                                               |
| category        | string | Yes      | Classification: `nested_quantifiers`, `catastrophic_backtracking`, etc. |
| expected_result | enum   | Yes      | `reject` or `accept`                                                    |
| error_code      | string | No       | Expected error code if rejected                                         |
| source          | string | Yes      | Attribution (OWASP, CWE, etc.)                                          |
| poc_input       | string | No       | Proof-of-concept input triggering ReDoS                                 |

**Identity/Uniqueness**: `id` must be unique within corpus

**Lifecycle**:

1. `draft` - New patterns added for review
2. `ratified` - Included in versioned corpus
3. `deprecated` - Marked for removal in next major version

---

### 5. LinkcheckAllowlist

Configuration for excluded external links.

| Field   | Type             | Required | Description        |
| ------- | ---------------- | -------- | ------------------ |
| version | string           | Yes      | Config version     |
| entries | AllowlistEntry[] | Yes      | List of exclusions |

**AllowlistEntry**:

| Field    | Type   | Required | Description                       |
| -------- | ------ | -------- | --------------------------------- |
| pattern  | string | Yes      | URL or regex pattern to exclude   |
| reason   | string | Yes      | Justification for exclusion       |
| expiry   | string | No       | ISO 8601 date for periodic review |
| added_by | string | No       | PR reference that added entry     |
| added_at | string | Yes      | ISO 8601 date added               |

**Validation Rules**:

- `reason` must be non-empty
- `pattern` must be valid regex or exact URL
- Expired entries should trigger CI warning

---

### 6. TrustBoundary

Documentation entity for regex pattern sources.

| Field       | Type     | Required | Description                                                |
| ----------- | -------- | -------- | ---------------------------------------------------------- |
| source      | string   | Yes      | Code location or config path                               |
| trust_level | enum     | Yes      | `trusted` (repo-controlled) or `untrusted` (PR-controlled) |
| rationale   | string   | Yes      | Why this classification                                    |
| mitigations | string[] | No       | Applied security controls                                  |

**Note**: This is a documentation-only entity, not code.

---

## Relationships

```
CoverageConfig
    └── contains → CoverageThreshold (1:1)

PatternCorpus
    └── contains → PatternEntry (1:many)

LinkcheckAllowlist
    └── contains → AllowlistEntry (1:many)

SecurityEvent
    └── references → PatternCorpus.pattern via patternHash (implicit)
```

## Volume/Scale Assumptions

| Entity            | Expected Count             | Growth Rate         |
| ----------------- | -------------------------- | ------------------- |
| CoverageThreshold | 2 (CI + local)             | Static              |
| SecurityEvent     | ~100-1000 per analysis run | Per run             |
| PatternEntry      | 50-200 patterns            | Quarterly updates   |
| AllowlistEntry    | 5-20 entries               | Rare additions      |
| TrustBoundary     | 5-15 documented            | Static per codebase |
