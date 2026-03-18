# Config Contract: 417 Dogfood Quality Release

## Suppressions Schema

```yaml
# .ai-review.yml — new top-level section
suppressions:
  rules:
    - rule: 'semantic/documentation'
      reason: 'We use JSDoc, not TSDoc'
    - message: '^missing error handling'
      file: 'tests/**'
      reason: 'Tests intentionally omit error handling'
    - severity: info
      file: 'scripts/**'
      reason: 'Scripts are internal tooling'
  disable_matchers:
    - 'ts-unused-prefix'
  security_override_allowlist:
    - 'legacy auth module - tracked in JIRA-1234'
```

## Validation Rules

### Suppression Rules

| Rule                                                                        | Behavior on Violation |
| --------------------------------------------------------------------------- | --------------------- |
| At least one of `rule`, `message`, `file` required                          | Config error (exit 2) |
| `message` patterns must be anchored (no bare `.*`)                          | Config error (exit 2) |
| `rule` patterns use glob syntax only                                        | Config error (exit 2) |
| Maximum 50 rules                                                            | Config error (exit 2) |
| `reason` field mandatory                                                    | Config error (exit 2) |
| `breadth_override: true` requires `breadth_override_reason` + `approved_by` | Config error (exit 2) |

### Breadth Enforcement (CI Mode)

| Condition                                                                         | Behavior                                |
| --------------------------------------------------------------------------------- | --------------------------------------- |
| Rule matches <= 20 findings                                                       | Normal suppression                      |
| Rule matches > 20, no override                                                    | Hard failure (exit 2)                   |
| Rule matches > 20, override present                                               | Warning in summary, limit raised to 200 |
| Rule matches > 200, override present                                              | Hard failure (exit 2)                   |
| Override rule matches error-severity, reason not in `security_override_allowlist` | Hard failure (exit 2)                   |
| Override rule matches error-severity, reason in allowlist                         | Warning in summary                      |

### Breadth Enforcement (Local Mode)

| Condition       | Behavior                                       |
| --------------- | ---------------------------------------------- |
| Any match count | Warning only (developer's codebase is trusted) |

## Config-Time Agent Validation

| Check                       | Pass Required | Behavior                                |
| --------------------------- | ------------- | --------------------------------------- |
| Unknown agent ID in pass    | Any           | Config error (exit 2) listing valid IDs |
| Duplicate agent ID in pass  | Any           | Config error (exit 2)                   |
| Provider-incompatible agent | `true`        | Config error (exit 2)                   |
| Provider-incompatible agent | `false`       | Agent excluded, visible notice          |
| Exclusion leaves pass empty | `true`        | Config error (exit 2)                   |
| Exclusion leaves pass empty | `false`       | Pass removed, reported as skipped       |

## Base-Branch Suppression Loading (CI Only)

| Context                                      | Suppression Source                                                    |
| -------------------------------------------- | --------------------------------------------------------------------- |
| CI mode (GitHub/ADO)                         | `git show <base-ref>:.ai-review.yml` → extract `suppressions` section |
| CI mode, base has no config                  | Empty suppressions (no rules active)                                  |
| CI mode, base has config but no suppressions | Empty suppressions                                                    |
| Local review mode                            | Working tree `.ai-review.yml` (developer trusted)                     |
| Config init / validate                       | N/A (suppressions not evaluated)                                      |
