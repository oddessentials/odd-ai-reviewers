# Contract: Finding Validation (Post-Processing)

**Module**: `router/src/report/finding-validator.ts`
**Depends on**: `line-resolver.ts` (existing), Finding type from `agents/types.ts`

## Finding Classification

Before validation, each finding is classified by scope:

| Class        | Criteria                                            | Line Validation          | Language Validation |
| ------------ | --------------------------------------------------- | ------------------------ | ------------------- |
| `inline`     | `finding.file` present AND `finding.line` defined   | YES                      | YES                 |
| `file-level` | `finding.file` present AND `finding.line` undefined | SKIP                     | YES                 |
| `global`     | `finding.file` undefined                            | SKIP                     | YES                 |
| `cross-file` | `finding.file` present but NOT in diff              | SKIP (log as cross-file) | YES                 |

## Interface

### validateFindings(findings: Finding[], lineResolver: LineResolver): FindingValidationSummary

Validates all findings for internal consistency before posting.

**Input**:

- `findings`: Array of deduplicated, sanitized findings
- `lineResolver`: Existing LineResolver built from canonical diff files

**Output**: `FindingValidationSummary` containing validFindings[], filtered[], and stats.

**Validation passes** (applied in order):

#### Pass 1: Finding Classification

Classify each finding as `inline`, `file-level`, `global`, or `cross-file` per the table above.

#### Pass 2: Line Number Validation (FR-011) — inline findings only

For each `inline` finding:

- Use `lineResolver.validateLine(finding.file, finding.line)` to check validity
- If line is outside diff range → filter with reason "Line {N} not in diff range for {file}"
- `file-level`, `global`, and `cross-file` findings bypass this pass entirely

For `cross-file` findings:

- Log at diagnostic level: `[router] [finding-validator] cross-file finding for {file} — line validation skipped`
- Proceed to Pass 3

#### Pass 3: Structural Self-Contradiction Detection (FR-012)

**IMPORTANT**: This is NOT a phrase-matching filter. It detects structurally self-contradicting findings using a multi-signal approach. A finding is filtered ONLY when multiple signals indicate it is non-actionable.

**Filter criteria** (ALL conditions must be met):

1. Finding severity is `info` (warning and error findings are NEVER filtered by language)
2. Finding message matches one or more dismissive patterns (see table below)
3. Finding has no actionable suggestion (suggestion field is empty, null, or repeats the dismissive language)

| Pattern            | Regex                        | Description           |
| ------------------ | ---------------------------- | --------------------- |
| No action required | `/\bno action required\b/i`  | Explicit dismissal    |
| Acceptable as-is   | `/\bacceptable as[- ]is\b/i` | Explicit acceptance   |
| Not blocking       | `/\bnot blocking\b/i`        | Explicit non-blocking |
| No change needed   | `/\bno change needed\b/i`    | Explicit no-change    |
| Can be ignored     | `/\bcan be ignored\b/i`      | Explicit ignorable    |

A finding at `info` severity with dismissive language BUT a concrete, non-dismissive suggestion MUST NOT be filtered.

**Rationale**: This prevents the filter from dropping nuanced findings that contain cautionary language but still provide actionable value. Only truly self-contradicting findings (low severity + dismissive message + no actionable suggestion) are removed.

**Constraints**:

- Must not modify findings (pure validation, returns new arrays)
- Must process all findings even if some fail (no early termination)
- Filtered findings are logged at diagnostic level with `[router] [finding-validator]` prefix (FR-013)
- Must run after sanitization and before sorting (FR-014)
- MUST NOT filter findings at `warning` or `error` severity regardless of language

## Integration Point

In `router/src/phases/report.ts`, insert between existing sanitizeFindings() and sortFindings() calls:

```
processFindings() → sanitizeFindings() → validateFindings() [NEW] → sortFindings() → dispatchReport()
```

The LineResolver is constructed from canonical diff files (same as github.ts:172) and passed to validateFindings().

## Explicit Non-Goals

- This validator does NOT assess finding quality or relevance (that's the agent's job)
- This validator does NOT filter based on keywords in warning/error findings
- This validator does NOT validate that code constructs mentioned in findings actually exist in the diff (would require semantic parsing)
- This validator does NOT filter cross-file findings — they bypass line validation but are still posted
