# ReDoS Threat Model

**Document Version**: 1.0.0
**Last Updated**: 2026-01-28
**Status**: Active

This document describes the regex security threat model for the odd-ai-reviewers system, focusing on Regular Expression Denial of Service (ReDoS) attack vectors and mitigations.

---

## Overview

The odd-ai-reviewers system uses regular expressions in several contexts:

1. **Configuration validation** - User-provided patterns in config files
2. **Code analysis** - Pattern matching during security analysis
3. **Data processing** - Parsing git diffs, cache keys, and structured data
4. **Sanitization** - Cleaning user-provided content

This threat model documents trust boundaries and security controls for each context.

---

## Trust Boundary Classification

### Trust Levels

| Level             | Description                           | Controls Required                     |
| ----------------- | ------------------------------------- | ------------------------------------- |
| **HARDCODED**     | Compile-time string literals          | None - patterns are code-reviewed     |
| **REPO_CONFIG**   | Repository-controlled configuration   | ReDoS validation before compilation   |
| **PR_CONTROLLED** | PR-provided or external input         | Full validation + timeout enforcement |
| **ANALYZED_CODE** | Patterns derived from analyzed source | Sanitization + bounded execution      |

### Decision Matrix

```
┌─────────────────────────────────────────────────────────────────┐
│                    Pattern Source Decision Tree                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Is the pattern a string literal in source code?                │
│    ├─ YES → HARDCODED (no validation needed)                    │
│    └─ NO                                                         │
│         │                                                        │
│         └─ Is it from repository configuration?                 │
│              ├─ YES → REPO_CONFIG                               │
│              │        (validate on load, before PR execution)   │
│              └─ NO                                              │
│                   │                                             │
│                   └─ Is it from PR content or external API?     │
│                        ├─ YES → PR_CONTROLLED                   │
│                        │        (validate + enforce timeout)    │
│                        └─ NO → ANALYZED_CODE                    │
│                                (sanitize + bounded execution)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     ReDoS Attack Surface                         │
└─────────────────────────────────────────────────────────────────┘

                    ┌──────────────┐
                    │   PR Author  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  PR Content  │ (Untrusted)
                    └──────┬───────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ Modified │    │  Config  │    │ Comments │
    │  Files   │    │  Files   │    │ /Labels  │
    └────┬─────┘    └────┬─────┘    └────┬─────┘
         │               │               │
         │               │               │
         ▼               ▼               ▼
┌─────────────────────────────────────────────────────┐
│                VALIDATION BOUNDARY                   │
│  ┌─────────────────────────────────────────────┐   │
│  │  Pattern Validator                           │   │
│  │  - ReDoS detection (vulnerability-detector)  │   │
│  │  - Syntax validation                         │   │
│  │  - Timeout enforcement (timeout-regex.ts)    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────┐
│ Validated Regex  │ (Safe to execute)
└──────────────────┘
```

---

## Call Site Inventory

### Dynamic RegExp Construction Sites

| File                                            | Line | Trust Level   | Control                     |
| ----------------------------------------------- | ---- | ------------- | --------------------------- |
| `report/formats.ts`                             | 224  | HARDCODED     | Constant interpolation only |
| `config/mitigation-config.ts`                   | 148  | REPO_CONFIG   | Try-catch validation        |
| `agents/control_flow/pattern-validator.ts`      | 361  | REPO_CONFIG   | Syntax validation           |
| `agents/control_flow/timeout-regex.ts`          | 76   | REPO_CONFIG   | Timeout enforcement         |
| `agents/control_flow/vulnerability-detector.ts` | 600  | ANALYZED_CODE | Word boundary escaping      |
| `agents/control_flow/types.ts`                  | 474  | REPO_CONFIG   | Zod schema validation       |

### Security Controls by Call Site

#### `report/formats.ts:224` - HARDCODED

```typescript
// Trust: HARDCODED - Template uses constant prefix only
const regex = new RegExp(`<!--\\s*${FINGERPRINT_MARKER_PREFIX}([^\\s]+)\\s*-->`, 'g');
```

**Control**: No runtime validation needed. Pattern is compile-time constant with string interpolation of a hardcoded constant.

#### `config/mitigation-config.ts:148` - REPO_CONFIG

```typescript
// Trust: REPO_CONFIG - User-provided config pattern, validated on load
// eslint-disable-next-line security/detect-non-literal-regexp
new RegExp(pattern.match.namePattern);
```

**Control**: Try-catch validation on configuration load. Patterns are repository-controlled.

#### `agents/control_flow/pattern-validator.ts:361` - REPO_CONFIG

```typescript
// Trust: REPO_CONFIG - Pattern syntax validation
// eslint-disable-next-line security/detect-non-literal-regexp
new RegExp(pattern);
```

**Control**: Explicit syntax validation. Part of pattern validation pipeline that rejects unsafe patterns.

#### `agents/control_flow/timeout-regex.ts:76` - REPO_CONFIG

```typescript
// Trust: REPO_CONFIG - Validated config with timeout enforcement
this.pattern = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
```

**Control**: `TimeoutRegex` class enforces execution timeout on all pattern matches, preventing CPU exhaustion.

#### `agents/control_flow/vulnerability-detector.ts:600` - ANALYZED_CODE

```typescript
// Trust: ANALYZED_CODE - Variable name from analyzed source
const varPattern = new RegExp(`\\b${taintedVar.name}\\b`);
```

**Control**: Variable names are extracted from analyzed code. Word boundaries (`\b`) prevent injection. Source is not attacker-controlled.

#### `agents/control_flow/types.ts:474` - REPO_CONFIG

```typescript
// Trust: REPO_CONFIG - Zod validation on config load
// eslint-disable-next-line security/detect-non-literal-regexp
new RegExp(data.match.namePattern);
```

**Control**: Zod schema validation ensures patterns are syntactically valid before use.

---

## String Literal Patterns (HARDCODED)

The following patterns are string literals in source code and require no runtime validation:

### Configuration & Security

- `git-validators.ts:39` - Git ref validation
- `config/providers.ts:19-23` - Legacy model name patterns
- `config/mitigation-config.ts:237,242` - ReDoS detection patterns

### Data Processing

- `cache/key.ts:59` - Cache key parsing
- `diff.ts:457` - Git diff parsing
- `local_llm.ts:146` - Diff header extraction

### Sanitization

- `report/formats.ts:39` - Whitespace normalization
- `report/sanitize.ts:75` - Null byte removal
- `agents/security.ts:277` - Whitespace splitting

### Control Flow Analysis

- `agents/control_flow/budget.ts:48-62` - File path risk classification
- `agents/control_flow/pattern-validator.ts` - Multiple ReDoS detection patterns

---

## Mitigation Controls

### 1. Pattern Validation (`pattern-validator.ts`)

All user-provided patterns pass through the pattern validator which:

- Checks for ReDoS vulnerability patterns (nested quantifiers, overlapping alternation)
- Validates regex syntax before compilation
- Rejects patterns that fail validation

### 2. Timeout Enforcement (`timeout-regex.ts`)

The `TimeoutRegex` class wraps regex execution with configurable timeouts:

- Default timeout: 1000ms per match operation
- Prevents CPU exhaustion from slow patterns
- Logs timeout events for monitoring

### 3. Configuration Validation

Repository configuration is validated on load:

- Zod schemas validate structure and types
- Regex patterns are compiled in try-catch blocks
- Invalid patterns fail configuration loading

### 4. ESLint Security Rules

The `eslint-plugin-security` rule `detect-non-literal-regexp` flags all dynamic regex construction:

- Each disable comment requires a trust classification comment
- Code review ensures appropriate controls are in place

---

## Security Findings Triage

When Semgrep or other security tools report `detect-non-literal-regexp` findings:

1. **Identify the trust level** using the classification table above
2. **Verify controls are in place** per the call site inventory
3. **Accept or remediate** based on:
   - HARDCODED: Accept (no fix needed)
   - REPO_CONFIG: Accept if validation + timeout exist
   - PR_CONTROLLED: Requires validation + timeout
   - ANALYZED_CODE: Accept if properly sanitized

---

## References

- [FR-014](../../specs/006-quality-enforcement/spec.md) - ReDoS threat model documentation
- [FR-015](../../specs/006-quality-enforcement/spec.md) - Trust level code comments
- [FR-016](../../specs/006-quality-enforcement/spec.md) - Data flow documentation
- [OWASP ReDoS](https://owasp.org/www-community/attacks/Regular_expression_Denial_of_Service_-_ReDoS)
