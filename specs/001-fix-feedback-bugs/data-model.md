# Data Model: Fix Feedback Bugs

**Feature**: 001-fix-feedback-bugs
**Date**: 2026-01-30

## Overview

This feature involves bug fixes to existing entities. No new entities are introduced. This document describes the relevant entities and their relationships as they pertain to the fixes.

---

## Entities

### TraversalState

**Location**: `router/src/agents/control_flow/types.ts:480-491`

Tracks node traversal progress during control flow analysis.

| Field           | Type                        | Description                                                            |
| --------------- | --------------------------- | ---------------------------------------------------------------------- |
| nodesVisited    | number                      | Current count of nodes visited in this traversal                       |
| maxNodesVisited | number                      | Maximum nodes allowed (from budget config) - **inclusive upper bound** |
| limitReached    | boolean                     | Whether the node limit was reached                                     |
| classification  | NodeLimitClassification?    | Classification assigned when limit is reached                          |
| reason          | TraversalTerminationReason? | Reason for traversal termination                                       |

**Validation Rules**:

- `nodesVisited >= 0`
- `maxNodesVisited >= 0`
- When `nodesVisited >= maxNodesVisited`, traversal MUST stop (FR-002)
- Limit of 0 means 0 nodes visited (Edge Case 1)

**State Transitions**:

```
Initial: nodesVisited=0, limitReached=false
  ↓ [check: nodesVisited >= max?]
  ├─ YES → limitReached=true, classification='unknown', reason='node_limit_exceeded', STOP
  └─ NO  → nodesVisited++, continue traversal
```

---

### MitigationInstance

**Location**: `router/src/agents/control_flow/types.ts:202-215`

Instance of a mitigation detected in code.

| Field              | Type              | Description                            |
| ------------------ | ----------------- | -------------------------------------- |
| patternId          | string            | References MitigationPattern.id        |
| location           | SourceLocation    | Where mitigation was detected          |
| protectedVariables | string[]          | Variables protected by this mitigation |
| protectedPaths     | string[]          | Code paths protected                   |
| scope              | MitigationScope   | Scope of protection                    |
| confidence         | Confidence        | Detection confidence level             |
| callChain          | CallChainEntry[]? | Cross-file tracking (optional)         |
| discoveryDepth     | number?           | Discovery depth (optional)             |

**Relationship**: References `MitigationPattern` via `patternId`. Pattern contains `mitigates: VulnerabilityType[]`.

---

### MitigationPattern

**Location**: `router/src/agents/control_flow/types.ts:112-123`

Pattern definition for detecting mitigations.

| Field             | Type                | Description                                    |
| ----------------- | ------------------- | ---------------------------------------------- |
| id                | string              | Unique pattern identifier                      |
| name              | string              | Human-readable name                            |
| description       | string              | Pattern description                            |
| **mitigates**     | VulnerabilityType[] | **Vulnerability types this pattern addresses** |
| match             | MatchCriteria       | Matching criteria                              |
| confidence        | Confidence          | Default confidence                             |
| isBuiltIn         | boolean?            | Whether pattern is built-in                    |
| deprecated        | boolean?            | Deprecation flag                               |
| deprecationReason | string?             | Why deprecated                                 |

**Validation Rules**:

- `mitigates.length >= 1` (enforced by Zod schema)
- `id` must be non-empty

---

### VulnerabilityType

**Location**: `router/src/agents/control_flow/types.ts:14-23`

Enumeration of vulnerability categories.

| Value               | Description                 |
| ------------------- | --------------------------- |
| injection           | SQL/Command injection       |
| null_deref          | Null pointer dereference    |
| auth_bypass         | Authentication bypass       |
| xss                 | Cross-site scripting        |
| path_traversal      | Path traversal attacks      |
| prototype_pollution | Prototype pollution         |
| ssrf                | Server-side request forgery |

---

### ExecutionPath

**Location**: `router/src/agents/control_flow/path-analyzer.ts:34-46`

Represents an execution path through the control flow graph.

| Field       | Type                 | Description                      |
| ----------- | -------------------- | -------------------------------- |
| nodes       | string[]             | Node IDs in path order           |
| mitigations | MitigationInstance[] | Mitigations detected along path  |
| isComplete  | boolean              | Whether path reaches exit        |
| signature   | string               | Path signature for deduplication |

**Relationship**: Contains `MitigationInstance[]`. Each instance links to `MitigationPattern` via `patternId`.

---

### TestCoveragePath

**Conceptual entity** (not a code type) - represents a test file reference in spec documentation.

| Field      | Type   | Description                        |
| ---------- | ------ | ---------------------------------- |
| path       | string | File path extracted from backticks |
| lineNumber | number | Line in spec file                  |
| specFile   | string | Source spec file                   |

**Validation Rules**:

- Path must be backtick-quoted in source
- Path must reference an existing file
- Zero valid paths on a line → silently skip (no error)

---

## Relationships Diagram

```
┌─────────────────────┐
│   TraversalState    │
│─────────────────────│
│ nodesVisited        │
│ maxNodesVisited     │──────────── Bug 1: >= check
│ limitReached        │
└─────────────────────┘

┌─────────────────────┐      patternId      ┌─────────────────────┐
│ MitigationInstance  │─────────────────────│  MitigationPattern  │
│─────────────────────│                     │─────────────────────│
│ patternId           │                     │ id                  │
│ location            │                     │ mitigates[]         │──── Bug 2: check this
│ protectedVariables  │                     │ match               │
└─────────────────────┘                     └─────────────────────┘
         │                                            │
         │ contained in                               │
         ▼                                            │
┌─────────────────────┐                               │
│   ExecutionPath     │                               │
│─────────────────────│                               │
│ nodes[]             │                               │
│ mitigations[]       │───── pathMitigatesVulnerability() ──────────────┘
│ isComplete          │           checks pattern.mitigates
└─────────────────────┘

┌─────────────────────┐
│  TestCoveragePath   │──── Bug 3: global extraction
│─────────────────────│
│ path                │
│ lineNumber          │
└─────────────────────┘
```

---

## Schema Changes

**None required**. All fixes use existing schema fields:

- `TraversalState.nodesVisited` / `maxNodesVisited` - existing
- `MitigationPattern.mitigates` - existing
- TestCoveragePath extraction - conceptual, no schema
