# Quickstart: Testing Fix Config Wizard Validation Bugs

**Feature Branch**: `001-fix-config-wizard-bugs`
**Date**: 2026-01-31

## Prerequisites

- Node.js >=22.0.0
- pnpm installed
- Repository cloned and dependencies installed

```bash
cd router
pnpm install
```

## Running Tests

### All Tests

```bash
pnpm test
```

### Specific Test Files

```bash
# Resolution guardrail tests (new)
pnpm test resolution-guardrail

# Preflight validation tests
pnpm test preflight

# Config wizard tests
pnpm test config-wizard
```

### Watch Mode (for development)

```bash
pnpm test:watch resolution-guardrail
```

## Manual Testing

### Bug 1: Auto-Applied Model (P1)

Test that single-key setup works end-to-end:

```bash
# Set only OpenAI key (no MODEL)
export OPENAI_API_KEY="sk-..."
unset MODEL

# Create minimal config
cat > .ai-review.yml << 'EOF'
passes:
  - name: ai
    agents: [opencode]
    enabled: true
EOF

# Run review (should use gpt-4o automatically)
pnpm exec ai-review review --repo . --base HEAD~1 --head HEAD --dry-run
```

**Expected**: Review completes using `gpt-4o` (auto-applied default).

### Bug 2: Ollama URL Optional (P2)

Test that Ollama provider doesn't require OLLAMA_BASE_URL:

```bash
# Create config with provider: ollama
cat > .ai-review.yml << 'EOF'
provider: ollama
passes:
  - name: local
    agents: [local_llm]
    enabled: true
EOF

# Unset OLLAMA_BASE_URL
unset OLLAMA_BASE_URL

# Validate (should pass)
pnpm exec ai-review validate --repo .
```

**Expected**: Validation passes with no errors.

```bash
# Now test invalid URL format
export OLLAMA_BASE_URL="not-a-url"
pnpm exec ai-review validate --repo .
```

**Expected**: Validation fails with URL format error.

### Bug 3: Config Init Validation (P2)

Test that config init doesn't crash:

```bash
# Remove any existing config
rm -f .ai-review.yml

# Run config init
pnpm exec ai-review config init --defaults --provider openai --platform github --output .ai-review.test.yml

# Cleanup
rm -f .ai-review.test.yml
```

**Expected**: Config generated and validation completes (may show warnings about missing keys, but no crash).

### Bug 4: Both Platform Option (P3)

Test that "both" platform generates dual reporting:

```bash
# Run config init with both platform (non-interactive)
# Note: --defaults doesn't support --platform both, so check generated config

# For interactive test (requires TTY):
pnpm exec ai-review config init

# Select: Both (option 3)
# Select: OpenAI (option 1)
# Accept defaults

# Verify generated config has both reporting blocks
cat .ai-review.yml | grep -A 5 "reporting:"
```

**Expected**: Config contains both `reporting.github` and `reporting.ado` sections.

### Exit Code Tests

```bash
# Test exit code 0 with warnings only
export OPENAI_API_KEY=""
pnpm exec ai-review validate --repo . ; echo "Exit code: $?"
# Expected: Exit code 0 (errors cause 1, warnings don't)

# Test exit code 1 with errors
cat > .ai-review.yml << 'EOF'
provider: azure-openai
passes:
  - name: ai
    agents: [opencode]
    enabled: true
EOF
pnpm exec ai-review validate --repo . ; echo "Exit code: $?"
# Expected: Exit code 1 (missing Azure keys is an error)

# Cleanup
rm -f .ai-review.yml
```

## Regression Test: Single Resolution

The key regression test ensures model resolution happens exactly once:

```bash
# Run the specific guardrail test
pnpm test resolution-guardrail -- --reporter=verbose
```

**Expected Output**:

```
✓ resolves model exactly once per review command
✓ resolves model exactly once per validate command
✓ resolves model exactly once per config init validate
✓ AgentContext.effectiveModel matches ResolvedConfig.model
```

## Debugging

### Enable Debug Logging

```bash
# See resolved config tuple
DEBUG=preflight pnpm exec ai-review validate --repo .

# See all router logs
DEBUG=router:* pnpm exec ai-review review --repo . --base HEAD~1 --head HEAD --dry-run
```

### Check Preflight Resolution

Add temporary logging to `router/src/phases/preflight.ts`:

```typescript
console.log('[DEBUG] Resolved config:', JSON.stringify(resolvedTuple, null, 2));
```

## Common Issues

### "Cannot read property 'effectiveModel' of undefined"

This is the bug we're fixing. If you see this in config init, the fix hasn't been applied yet.

### "Provider 'ollama' requires: OLLAMA_BASE_URL"

This is the bug we're fixing. Ollama URL should be optional.

### Config init exits 1 but only shows warnings

Check that exit code logic uses `errors.length > 0` not `!valid` or similar.

## Test Coverage Targets

| Test Area                    | Minimum Coverage               |
| ---------------------------- | ------------------------------ |
| resolution-guardrail.test.ts | 100% (new file)                |
| preflight.test.ts (Ollama)   | 90%+                           |
| config-wizard.test.ts (both) | 90%+                           |
| main.ts exit codes           | Branch coverage for exit paths |

## CI Verification

All tests must pass in CI:

```bash
# Same checks as CI
pnpm lint
pnpm typecheck
pnpm test
```
