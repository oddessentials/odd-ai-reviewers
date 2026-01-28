# Quickstart: Control Flow Analysis Agent

**Feature**: 001-control-flow-analysis
**Date**: 2026-01-27

## Overview

The control flow analysis agent provides flow-sensitive static analysis for TypeScript/JavaScript code, reducing false positives by recognizing existing mitigations and tracking data flow through control structures.

## Quick Start

### 1. Enable the Agent

Add to your `.ai-review.yml`:

```yaml
agents:
  - control_flow # Enable control flow analysis

control_flow:
  enabled: true
```

### 2. Run a Review

```bash
# The agent runs automatically as part of the review pipeline
npm run review -- --pr 123
```

### 3. View Results

Findings include mitigation-aware analysis:

```
⚠️ warning cfa/injection src/handlers/user.ts:42
  Potential SQL injection: user input reaches database query
  Mitigation detected on 2 of 3 paths. Unprotected paths: [catch block at line 38].
  Original severity: error, downgraded due to partial mitigation.
```

## Configuration Options

### Basic Configuration

```yaml
control_flow:
  enabled: true
  max_call_depth: 5 # How deep to follow function calls (default: 5)
  time_budget_ms: 300000 # Max analysis time in ms (default: 5 min)
  size_budget_lines: 10000 # Max lines to analyze (default: 10K)
```

### Custom Mitigation Patterns

Define patterns your codebase uses:

```yaml
control_flow:
  mitigation_patterns:
    # Recognize your internal sanitization function
    - id: custom/sanitize-input
      name: 'sanitizeInput'
      description: 'Company-standard input sanitization'
      mitigates: [injection, xss]
      match:
        type: function_call
        name: sanitizeInput
        module: '@company/security'
      confidence: high

    # Recognize your auth middleware
    - id: custom/require-auth
      name: 'requireAuth middleware'
      description: 'Express middleware that requires authentication'
      mitigates: [auth_bypass]
      match:
        type: function_call
        name: requireAuth
      confidence: high
```

### Override Built-in Patterns

```yaml
control_flow:
  # Mark a pattern as deprecated
  pattern_overrides:
    - pattern_id: builtin/validator-escape
      deprecated: true
      deprecation_reason: 'Use DOMPurify instead'

  # Disable patterns entirely
  disabled_patterns:
    - builtin/legacy-sanitizer
```

## Understanding Findings

### Mitigation Status

Each finding indicates mitigation coverage:

| Status    | Meaning              | Severity Impact      |
| --------- | -------------------- | -------------------- |
| `none`    | No mitigation found  | Original severity    |
| `partial` | Some paths mitigated | Downgraded one level |
| `full`    | All paths mitigated  | Finding suppressed   |

### Severity Downgrade Rules

When partial mitigation is detected (coverage-based):

- ≥75% coverage: downgrade by 2 levels
- ≥50% coverage: downgrade by 1 level
- <50% coverage: no downgrade

Severity levels: `error` → `warning` → `info`

### Example Finding with Reasoning

```json
{
  "severity": "warning",
  "file": "src/api/users.ts",
  "line": 45,
  "message": "Potential null dereference: 'user.profile' may be undefined",
  "ruleId": "cfa/null_deref",
  "metadata": {
    "mitigationStatus": "partial",
    "originalSeverity": "error",
    "pathsCovered": 2,
    "pathsTotal": 3,
    "unprotectedPaths": ["else branch at line 42"],
    "mitigationsDetected": ["builtin/optional-chaining"],
    "analysisDepth": 2,
    "degraded": false
  }
}
```

## Built-in Mitigation Patterns

### Input Validation

| Pattern ID             | Matches                      | Mitigates      |
| ---------------------- | ---------------------------- | -------------- |
| `builtin/zod-parse`    | `z.parse()`, `z.safeParse()` | injection, xss |
| `builtin/validator-*`  | `validator.isEmail()`, etc.  | injection      |
| `builtin/joi-validate` | `Joi.validate()`             | injection      |

### Null Safety

| Pattern ID                   | Matches                    | Mitigates  |
| ---------------------------- | -------------------------- | ---------- |
| `builtin/optional-chaining`  | `?.` operator              | null_deref |
| `builtin/nullish-coalescing` | `??` operator              | null_deref |
| `builtin/if-null-check`      | `if (x != null)`           | null_deref |
| `builtin/typeof-check`       | `typeof x !== 'undefined'` | null_deref |

### Output Encoding

| Pattern ID            | Matches                      | Mitigates      |
| --------------------- | ---------------------------- | -------------- |
| `builtin/encode-uri`  | `encodeURIComponent()`       | xss, injection |
| `builtin/dompurify`   | `DOMPurify.sanitize()`       | xss            |
| `builtin/escape-html` | Common HTML escape functions | xss            |

### Authentication

| Pattern ID              | Matches                  | Mitigates   |
| ----------------------- | ------------------------ | ----------- |
| `builtin/passport-auth` | Passport.js middleware   | auth_bypass |
| `builtin/jwt-verify`    | `jwt.verify()`           | auth_bypass |
| `builtin/session-check` | Session existence checks | auth_bypass |

## Degraded Mode

When analysis limits are reached, the agent enters degraded mode:

```
ℹ️ info cfa/budget-warning
  Analysis budget 80% consumed. Reducing call depth from 5 to 3.
  Some findings may have reduced confidence.
```

### Indicators

- `degraded: true` in finding metadata
- `degradedReason` explains why
- Findings marked with reduced confidence

### Handling Large PRs

For PRs exceeding limits:

1. **Split the PR** into smaller changes
2. **Increase budgets** (if resources allow):
   ```yaml
   control_flow:
     time_budget_ms: 600000 # 10 minutes
     size_budget_lines: 20000
   ```
3. **Accept degraded results** with conservative assumptions

## Troubleshooting

### "Analysis timed out"

The PR exceeded the time budget. Options:

- Increase `time_budget_ms`
- Reduce `max_call_depth`
- Split large PRs

### "Pattern not recognized"

Your mitigation isn't in the built-in patterns. Add a custom pattern:

```yaml
control_flow:
  mitigation_patterns:
    - id: custom/my-sanitizer
      name: 'mySanitizer'
      mitigates: [injection]
      match:
        type: function_call
        name: mySanitizer
      confidence: high
```

### "False positive persists"

If a finding is still raised despite mitigation:

1. Check the `unprotectedPaths` in metadata
2. Ensure mitigation covers ALL paths
3. Verify the pattern matches your code exactly

### Debug Logging

Enable verbose logging:

```bash
DEBUG=control_flow:* npm run review -- --pr 123
```

## API Reference

### Agent Registration

```typescript
import { controlFlowAgent } from './agents/control_flow';

// The agent is exported as an object implementing ReviewAgent
// It can be registered with the router agent registry
agents.push(controlFlowAgent);
```

### Programmatic Configuration

```typescript
import type { ControlFlowConfig } from './agents/control_flow/types';

const config: ControlFlowConfig = {
  enabled: true,
  maxCallDepth: 5,
  timeBudgetMs: 300_000,
  sizeBudgetLines: 10_000,
  mitigationPatterns: [],
  patternOverrides: [],
  disabledPatterns: [],
};
```

### Custom Pattern Validation

```typescript
import { validateMitigationPattern } from './agents/control_flow/types';

const result = validateMitigationPattern({
  id: 'custom/my-pattern',
  name: 'My Pattern',
  description: 'Custom mitigation',
  mitigates: ['injection'],
  match: { type: 'function_call', name: 'sanitize' },
  confidence: 'high',
});

if (!result.success) {
  console.error('Invalid pattern:', result.error.issues);
}
```

## Next Steps

- See [data-model.md](./data-model.md) for entity details
- See [research.md](./research.md) for technology decisions
- See [spec.md](./spec.md) for full requirements
