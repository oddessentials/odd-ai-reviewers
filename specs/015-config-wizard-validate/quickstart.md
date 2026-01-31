# Quickstart: 015-config-wizard-validate

**Date**: 2026-01-31
**Purpose**: Developer guide for implementing the config wizard and validation features

## Prerequisites

- Node.js >=22.0.0
- Existing 014-user-friendly-config infrastructure in place
- Familiarity with `router/src/` codebase structure

## Implementation Overview

### Phase 1: Interactive Prompts Module

Create `router/src/cli/interactive-prompts.ts`:

```typescript
import * as readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';

export interface PromptOption<T> {
  label: string;
  value: T;
  description?: string;
}

export type PromptResult<T> = { status: 'selected'; value: T } | { status: 'cancelled' };

export async function promptSelect<T>(
  rl: readline.Interface,
  question: string,
  options: PromptOption<T>[]
): Promise<PromptResult<T>> {
  // Print options with numbers
  console.log(`\n${question}`);
  options.forEach((opt, i) => {
    const desc = opt.description ? ` (${opt.description})` : '';
    console.log(`  ${i + 1}. ${opt.label}${desc}`);
  });

  // Read input
  const answer = await rl.question(`\nEnter choice [1-${options.length}]: `);

  // Handle cancellation (empty input on Ctrl+C)
  if (answer === null || answer === undefined) {
    return { status: 'cancelled' };
  }

  // Parse selection
  const num = parseInt(answer.trim(), 10);
  if (num >= 1 && num <= options.length) {
    return { status: 'selected', value: options[num - 1].value };
  }

  // Invalid input - re-prompt
  console.log('Invalid choice. Please enter a number.');
  return promptSelect(rl, question, options);
}

export async function promptConfirm(
  rl: readline.Interface,
  question: string,
  defaultNo = true
): Promise<boolean> {
  const hint = defaultNo ? '[y/N]' : '[Y/n]';
  const answer = await rl.question(`${question} ${hint}: `);

  if (answer === '') {
    return !defaultNo;
  }

  const lower = answer.toLowerCase().trim();
  if (['y', 'yes'].includes(lower)) return true;
  if (['n', 'no'].includes(lower)) return false;

  console.log('Please answer y or n.');
  return promptConfirm(rl, question, defaultNo);
}

export function createReadlineInterface(): readline.Interface {
  return readline.createInterface({ input, output });
}
```

### Phase 2: Validation Report Module

Create `router/src/cli/validation-report.ts`:

```typescript
import type { PreflightResult } from '../phases/preflight.js';
import type { ResolvedConfigTuple } from '../config/providers.js';

export interface ValidationReport {
  errors: string[];
  warnings: string[];
  info: string[];
  resolved?: ResolvedConfigTuple;
  valid: boolean;
}

export function formatValidationReport(result: PreflightResult): ValidationReport {
  // Current preflight returns all issues as errors
  // For warnings, we need to categorize based on message content
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const msg of result.errors) {
    if (msg.includes('WARNING') || msg.includes('deprecated')) {
      warnings.push(msg);
    } else {
      errors.push(msg);
    }
  }

  return {
    errors,
    warnings,
    info: [],
    resolved: result.resolved,
    valid: errors.length === 0,
  };
}

export function printValidationReport(report: ValidationReport): void {
  // Print errors
  for (const err of report.errors) {
    console.error(`✗ ERROR: ${err}`);
  }

  // Print warnings to stderr
  for (const warn of report.warnings) {
    console.error(`⚠ WARNING: ${warn}`);
  }

  // Print success with resolved tuple
  if (report.valid) {
    const status =
      report.warnings.length > 0
        ? '✓ Configuration valid (with warnings)'
        : '✓ Configuration valid';
    console.log(status);

    if (report.resolved) {
      console.log(`  Provider: ${report.resolved.provider ?? 'none'}`);
      console.log(`  Model: ${report.resolved.model}`);
      console.log(`  Key source: ${report.resolved.keySource ?? '(not set)'}`);
      console.log(`  Config source: ${report.resolved.configSource}`);
    }
  } else {
    console.error(`\nValidation failed with ${report.errors.length} error(s).`);
  }
}
```

### Phase 3: Update Validate Command

Modify `router/src/main.ts` validate command:

```typescript
program
  .command('validate')
  .description('Validate configuration file and run preflight checks')
  .requiredOption('--repo <path>', 'Path to repository')
  .action(async (options) => {
    try {
      console.log(`Validating configuration at ${options.repo}/.ai-review.yml...\n`);

      const config = await loadConfig(options.repo);
      const preflightResult = runPreflightChecks(config);
      const report = formatValidationReport(preflightResult);

      printValidationReport(report);
      exitHandler(report.valid ? 0 : 1);
    } catch (error) {
      if (error instanceof Error) {
        console.error(`✗ ERROR: ${error.message}`);
      }
      exitHandler(1);
    }
  });
```

### Phase 4: Interactive Wizard Flow

Update `router/src/main.ts` config init command:

```typescript
import { createReadlineInterface, promptSelect, promptConfirm } from './cli/interactive-prompts.js';
import { AVAILABLE_PLATFORMS, AVAILABLE_PROVIDERS, AVAILABLE_AGENTS } from './cli/config-wizard.js';

// In config init action:
if (!useDefaults) {
  if (!isInteractiveTerminal()) {
    console.error('Error: Interactive mode requires a TTY.');
    console.error('Use --defaults flag with --provider and --platform options.');
    exitHandler(1);
    return;
  }

  const rl = createReadlineInterface();

  try {
    console.log('Welcome to ai-review configuration wizard!\n');

    // Platform selection
    const platformResult = await promptSelect(rl, 'Select your platform:', AVAILABLE_PLATFORMS);
    if (platformResult.status === 'cancelled') {
      console.log('\nConfiguration cancelled.');
      exitHandler(0);
      return;
    }
    const platform = platformResult.value;

    // Provider selection
    const providerResult = await promptSelect(rl, 'Select your LLM provider:', AVAILABLE_PROVIDERS);
    if (providerResult.status === 'cancelled') {
      console.log('\nConfiguration cancelled.');
      exitHandler(0);
      return;
    }
    provider = providerResult.value;

    // Agent selection (multi-select simplified to recommended defaults)
    const defaultAgents = getDefaultAgentsForProvider(provider);
    console.log(`\nRecommended agents for ${provider}: ${defaultAgents.join(', ')}`);
    const useRecommended = await promptConfirm(rl, 'Use recommended agents?', false);
    agents = useRecommended ? defaultAgents : await promptAgentSelection(rl, provider);

    // Check overwrite
    if (fs.existsSync(outputPath)) {
      const overwrite = await promptConfirm(rl, `\nFile ${outputPath} exists. Overwrite?`, true);
      if (!overwrite) {
        console.log('Configuration cancelled.');
        exitHandler(0);
        return;
      }
    }

    rl.close();
  } catch (error) {
    rl.close();
    // Ctrl+C throws, exit 0
    console.log('\nConfiguration cancelled.');
    exitHandler(0);
    return;
  }
}

// Continue with config generation...
```

## Testing Guide

### Unit Tests for Prompts

```typescript
// router/src/__tests__/interactive-prompts.test.ts
import { describe, it, expect, vi } from 'vitest';
import { promptSelect } from '../cli/interactive-prompts.js';
import { Readable, Writable } from 'stream';
import * as readline from 'readline/promises';

function createMockRl(inputs: string[]): readline.Interface {
  let inputIndex = 0;
  const mockInput = new Readable({
    read() {
      if (inputIndex < inputs.length) {
        this.push(inputs[inputIndex++] + '\n');
      } else {
        this.push(null);
      }
    },
  });
  const mockOutput = new Writable({ write: () => {} });
  return readline.createInterface({ input: mockInput, output: mockOutput });
}

describe('promptSelect', () => {
  it('returns selected value for valid input', async () => {
    const rl = createMockRl(['2']);
    const options = [
      { label: 'A', value: 'a' },
      { label: 'B', value: 'b' },
    ];
    const result = await promptSelect(rl, 'Pick:', options);
    expect(result).toEqual({ status: 'selected', value: 'b' });
  });
});
```

### Integration Test for Validate

```typescript
// router/src/__tests__/validate-command.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('validate command', () => {
  it('exits 0 when config is valid', async () => {
    // Set up valid environment
    process.env.OPENAI_API_KEY = 'test-key';

    // Run validate
    const exitCode = await runValidateCommand({ repo: './fixtures/valid-config' });

    expect(exitCode).toBe(0);
  });

  it('exits 1 when multi-key ambiguity detected', async () => {
    process.env.OPENAI_API_KEY = 'key1';
    process.env.ANTHROPIC_API_KEY = 'key2';
    process.env.MODEL = 'gpt-4o';

    const exitCode = await runValidateCommand({ repo: './fixtures/no-provider' });

    expect(exitCode).toBe(1);
  });
});
```

## File Checklist

| File                                               | Action | Purpose                                |
| -------------------------------------------------- | ------ | -------------------------------------- |
| `router/src/cli/interactive-prompts.ts`            | Create | Readline-based prompt utilities        |
| `router/src/cli/validation-report.ts`              | Create | Validation result formatting           |
| `router/src/main.ts`                               | Modify | Update validate + config init commands |
| `router/src/__tests__/interactive-prompts.test.ts` | Create | Prompt unit tests                      |
| `router/src/__tests__/validation-report.test.ts`   | Create | Report formatting tests                |
| `router/src/__tests__/validate-command.test.ts`    | Create | Validate command integration tests     |

## Success Criteria Verification

| Criterion                           | How to Verify                                   |
| ----------------------------------- | ----------------------------------------------- |
| SC-001: Wizard <2 min               | Manual test: time wizard completion             |
| SC-002: validate catches all issues | Run validate with each preflight error scenario |
| SC-003: Actionable Fix instructions | Review error output for "Fix:" text             |
| SC-004: CI parity                   | Run validate in CI, compare to review preflight |
| SC-005: Generated config validates  | Run wizard → immediately run validate           |
