# Quickstart: User-Friendly Configuration

**Feature**: 014-user-friendly-config | **Date**: 2026-01-30

## Overview

This feature enhances the configuration experience for odd-ai-reviewers by:

1. Adding explicit provider selection
2. Improving error messages with actionable fixes
3. Logging resolved configuration for debugging
4. Providing a guided configuration wizard

---

## Developer Setup

### Prerequisites

```bash
# Ensure you're on the feature branch
git checkout 014-user-friendly-config

# Install dependencies
pnpm install

# Run tests to verify environment
pnpm test
```

### Key Files to Modify

| File                              | Changes                                           |
| --------------------------------- | ------------------------------------------------- |
| `router/src/config/schemas.ts`    | Add `provider` field to ConfigSchema              |
| `router/src/config/providers.ts`  | Add `ResolvedConfigTuple` type, update resolution |
| `router/src/preflight.ts`         | Add multi-key validation, resolved config logging |
| `router/src/main.ts`              | Add `config init` command                         |
| `router/src/cli/config-wizard.ts` | New file - interactive wizard                     |

### Test Files

| File                                         | Purpose                         |
| -------------------------------------------- | ------------------------------- |
| `router/src/__tests__/preflight.test.ts`     | Add multi-key + MODEL scenarios |
| `router/src/__tests__/config-wizard.test.ts` | New file - wizard tests         |
| `router/src/__tests__/providers.test.ts`     | Add explicit provider tests     |

---

## Implementation Tasks

### Task 1: Add Provider Field to Schema

```typescript
// router/src/config/schemas.ts

// Add near LlmProvider type definition
export const ProviderSchema = z.enum(['anthropic', 'openai', 'azure-openai', 'ollama']);

// Add to ConfigSchema
export const ConfigSchema = z.object({
  // ... existing fields ...
  provider: ProviderSchema.optional(),
});
```

### Task 2: Add ResolvedConfigTuple Type

```typescript
// router/src/config/providers.ts

export interface ResolvedConfigTuple {
  provider: LlmProvider | null;
  model: string;
  keySource: string | null;
  configSource: 'file' | 'defaults' | 'merged';
  configPath?: string;
  schemaVersion: number; // Tuple format version (start at 1)
  resolutionVersion: number; // Resolution logic version (start at 1)
}
```

### Task 3: Add Multi-Key Validation

```typescript
// router/src/preflight.ts

export function validateMultiKeyAmbiguity(
  config: Config,
  env: Record<string, string | undefined>
): string[] {
  const errors: string[] = [];

  // Count providers with keys present
  const providersWithKeys = countProvidersWithKeys(env);

  // If 2+ providers AND MODEL is set AND no explicit provider
  const effectiveModel = resolveEffectiveModel(config, env);
  if (providersWithKeys >= 2 && effectiveModel && !config.provider) {
    errors.push(
      `Error: Multiple provider keys detected with MODEL set. Ambiguous configuration.\n` +
        `Fix: Add 'provider: openai' (or 'anthropic') to your .ai-review.yml`
    );
  }

  return errors;
}
```

### Task 4: Log Resolved Config

```typescript
// router/src/phases/preflight.ts

export function logResolvedConfig(resolved: ResolvedConfigTuple): void {
  console.log('[router] Resolved configuration:', JSON.stringify(resolved, null, 2));
}
```

### Task 5: Config Wizard Command

```typescript
// router/src/main.ts

program
  .command('config')
  .description('Configuration management commands')
  .command('init')
  .description('Initialize configuration interactively')
  .option('--repo <path>', 'Repository path', process.cwd())
  .option('--defaults', 'Use default values without prompting (CI-safe)')
  .option('--yes', 'Alias for --defaults')
  .action(async (options) => {
    // TTY safety check
    if (!process.stdin.isTTY && !options.defaults && !options.yes) {
      console.error('Error: Cannot run interactive wizard in non-TTY environment.');
      console.error('Fix: Use --defaults or --yes flag for non-interactive mode.');
      process.exit(1);
    }
    await runConfigWizard(options.repo, { useDefaults: options.defaults || options.yes });
  });
```

### Task 6: Auto-Apply Default Models

```typescript
// router/src/preflight.ts

const DEFAULT_MODELS: Record<LlmProvider, string | null> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  'azure-openai': null, // No auto-apply for Azure
  ollama: 'codellama:7b',
};

export function resolveEffectiveModelWithDefaults(
  config: Config,
  env: Record<string, string | undefined>,
  provider: LlmProvider | null
): string | null {
  // Check MODEL env first
  const envModel = env.MODEL;
  if (envModel) return envModel;

  // Check config.models.default
  if (config.models?.default) return config.models.default;

  // Auto-apply default for single-provider setups (except Azure)
  if (provider && DEFAULT_MODELS[provider]) {
    return DEFAULT_MODELS[provider];
  }

  return null; // Azure or no provider
}
```

---

## Testing Approach

### Unit Tests

```typescript
// router/src/__tests__/preflight.test.ts

describe('validateMultiKeyAmbiguity', () => {
  it('fails when both keys present with MODEL but no provider', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      OPENAI_API_KEY: 'sk-xxx',
      MODEL: 'gpt-4o',
    };
    const config = createTestConfig(); // no provider field

    const result = validateMultiKeyAmbiguity(config, env);

    expect(result).toHaveLength(1);
    expect(result[0]).toContain('Ambiguous configuration');
  });

  it('passes when explicit provider set', () => {
    const env = {
      ANTHROPIC_API_KEY: 'sk-ant-xxx',
      OPENAI_API_KEY: 'sk-xxx',
      MODEL: 'gpt-4o',
    };
    const config = { ...createTestConfig(), provider: 'openai' };

    const result = validateMultiKeyAmbiguity(config, env);

    expect(result).toHaveLength(0);
  });

  it('passes with single key (no ambiguity)', () => {
    const env = {
      OPENAI_API_KEY: 'sk-xxx',
      MODEL: 'gpt-4o',
    };
    const config = createTestConfig();

    const result = validateMultiKeyAmbiguity(config, env);

    expect(result).toHaveLength(0);
  });
});
```

### Integration Tests

```bash
# Test the full preflight flow
pnpm test router/src/__tests__/preflight.test.ts

# Test config wizard (interactive tests may need mocking)
pnpm test router/src/__tests__/config-wizard.test.ts
```

---

## Validation Checklist

Before marking implementation complete:

- [ ] `provider` field added to schema and validated
- [ ] Multi-key + MODEL without provider fails preflight
- [ ] Resolved config tuple logged on successful preflight
- [ ] Resolved config tuple includes schemaVersion and resolutionVersion
- [ ] Single-key setups auto-apply default model (gpt-4o, claude-sonnet-4-20250514, codellama:7b)
- [ ] Azure incomplete errors show single-line fix
- [ ] Config wizard generates valid YAML with deterministic key ordering
- [ ] Config wizard refuses to run in non-TTY without --defaults/--yes
- [ ] All new code has unit tests
- [ ] Documentation updated (quickstart, troubleshooting)
- [ ] CHANGELOG updated with breaking change note

---

## Common Gotchas

1. **Don't modify provider precedence logic** - Single-key auto-detection must remain unchanged for backward compatibility

2. **Azure has no model default** - FR-013 explicitly forbids model defaulting for Azure OpenAI

3. **Log format is JSON** - Resolved config must be machine-parseable

4. **Error messages are prescriptive** - Always include `Fix:` with exact command/config to add

5. **Versioning is mandatory** - Always include schemaVersion and resolutionVersion in resolved tuple

6. **TTY check before prompts** - Wizard must check `process.stdin.isTTY` before any readline calls

7. **Deterministic YAML output** - Use stable key ordering (alphabetical or schema-defined) in generated configs

8. **Single-key auto-apply** - Default models are auto-applied (not suggested) for single-provider setups
