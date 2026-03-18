# CLI Contract: 417 Dogfood Quality Release

## Exit Code Contract

| Code | Status Enum     | Condition                                             | Gating Evaluated? |
| ---- | --------------- | ----------------------------------------------------- | ----------------- |
| `0`  | `complete`      | All agents succeeded; gating passed or disabled       | Yes (passed)      |
| `1`  | `gating_failed` | All agents succeeded; findings exceed threshold       | Yes (failed)      |
| `2`  | `config_error`  | Config invalid, no passes runnable, suppression error | No                |
| `3`  | `incomplete`    | Some agents failed; partial results available         | No (suppressed)   |

**Precedence**: `3` always wins over `1`. A run that is both incomplete AND has findings above threshold returns `3`.
**Invariant**: `1` is only emitted when ALL agents completed successfully.

## --pass Flag Contract

```
ai-review local . --pass <name>
```

| Input                                    | Behavior                                      | Exit    |
| ---------------------------------------- | --------------------------------------------- | ------- |
| Valid pass name, deps available          | Run only that pass                            | 0/1/3   |
| Valid pass name, deps missing (required) | Error with install instructions               | 2       |
| Valid pass name, deps missing (optional) | Skip pass, no agents to run → error           | 2       |
| Invalid pass name                        | Error: "Unknown pass 'X'. Available: a, b, c" | 2       |
| Omitted                                  | Run all enabled passes                        | 0/1/2/3 |

## --agent Flag Contract

```
ai-review local . --agent <id>
```

| Input                            | Behavior                                                   | Exit    |
| -------------------------------- | ---------------------------------------------------------- | ------- |
| Valid ID, in configured pass(es) | Run only that agent across matching passes                 | 0/1/3   |
| Valid ID, not in any pass        | Error: "Agent 'X' not configured in any pass"              | 2       |
| Invalid ID                       | Error: "Unknown agent 'X'. Valid: semgrep, reviewdog, ..." | 2       |
| Omitted                          | Run all agents in selected passes                          | 0/1/2/3 |

## --pass + --agent Combined Contract

| --pass  | --agent           | Behavior                                                   |
| ------- | ----------------- | ---------------------------------------------------------- |
| Set     | Set               | Filter to named pass, then filter to named agent within it |
| Set     | Set (not in pass) | Error: "Agent 'X' not in pass 'Y'. Available in: Z"        |
| Set     | Omitted           | Run all agents in named pass                               |
| Omitted | Set               | Run named agent across all passes that contain it          |
| Omitted | Omitted           | Run all agents in all enabled passes                       |

## Execution Plan Serialization Contract (--verbose / --dry-run)

### Safe-Field Allowlist (canonical form)

```json
{
  "configSource": "string",
  "gating": { "driftGate": "boolean", "enabled": "boolean", "failOnSeverity": "string" },
  "limits": {
    "maxDiffLines": "number",
    "maxFiles": "number",
    "maxTokensPerPr": "number",
    "maxUsdPerPr": "number"
  },
  "mode": "execute | dry-run | cost-only",
  "model": "string | null",
  "passes": [{ "agents": ["string"], "name": "string", "required": "boolean" }],
  "provider": "string | null",
  "schemaVersion": "number"
}
```

**Key ordering**: Alphabetical at every level.
**Excluded**: API keys, tokens, endpoints, file paths, env vars, diff content, PR descriptions, file counts, token estimates, cost estimates.
**Golden tests**: Same config + same CLI flags MUST produce identical canonical JSON across dry-run, cost-only, and execute modes.

## JSON Output Contract

```json
{
  "schema_version": "1.0.0",
  "status": "complete | incomplete | gating_failed | config_error",
  "version": "1.12.0",
  "timestamp": "2026-03-17T...",
  "summary": { ... },
  "findings": [...],
  "partialFindings": [...],
  "passes": [...],
  "suppressions": [
    { "reason": "rule reason text", "matched": 5 }
  ],
  "config": { "source": "...", "path": "..." }
}
```

**Status invariants**:

- `"status": "gating_failed"` requires all agents completed
- `"status": "incomplete"` suppresses gating entirely
- `"status": "config_error"` has empty findings arrays
