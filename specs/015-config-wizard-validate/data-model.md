# Data Model: 015-config-wizard-validate

**Date**: 2026-01-31
**Purpose**: Define entities, interfaces, and data structures for interactive wizard and validation

## Core Entities

### WizardState

Tracks user selections through the interactive wizard flow.

```typescript
interface WizardState {
  /** Selected platform(s) for PR integration */
  platform: 'github' | 'azure-devops' | 'both' | null;

  /** Selected LLM provider */
  provider: LlmProvider | null;

  /** Selected agent identifiers (e.g., ['semgrep', 'opencode']) */
  agents: string[];

  /** Output file path (default: .ai-review.yml) */
  outputPath: string;

  /** Whether user confirmed to overwrite existing file */
  overwriteConfirmed: boolean;
}
```

**Validation Rules**:

- `platform` must be set before `provider`
- `provider` must be set before `agents`
- `agents` must include at least one agent
- `outputPath` must be a valid file path

**State Transitions**:

```
null → platform → provider → agents → confirmed
```

### ValidationReport

Summary of all preflight check results with severity categorization.

```typescript
interface ValidationReport {
  /** Errors that block execution (exit code 1) */
  errors: ValidationMessage[];

  /** Warnings that should be reviewed (exit code 0) */
  warnings: ValidationMessage[];

  /** Informational messages (exit code 0) */
  info: ValidationMessage[];

  /** Resolved configuration tuple on success */
  resolved?: ResolvedConfigTuple;

  /** Overall validation status */
  valid: boolean;
}

interface ValidationMessage {
  /** Human-readable message */
  message: string;

  /** Actionable fix instruction (optional) */
  fix?: string;

  /** Category for grouping (e.g., 'api-keys', 'model-config') */
  category: ValidationCategory;
}

type ValidationCategory =
  | 'api-keys'
  | 'model-config'
  | 'provider-match'
  | 'azure-config'
  | 'legacy-keys'
  | 'multi-key-ambiguity'
  | 'schema';
```

**Exit Code Logic**:

- `errors.length > 0` → exit 1
- `errors.length === 0` → exit 0 (even with warnings)

### PromptOption

Represents a single selectable option in interactive prompts.

```typescript
interface PromptOption<T> {
  /** Display label shown to user */
  label: string;

  /** Value returned when selected */
  value: T;

  /** Optional description shown below label */
  description?: string;

  /** Whether this is the default selection */
  isDefault?: boolean;
}
```

### PromptResult

Result from an interactive prompt.

```typescript
type PromptResult<T> = { status: 'selected'; value: T } | { status: 'cancelled' };
```

## Existing Entities (from 014)

### ResolvedConfigTuple (unchanged)

```typescript
interface ResolvedConfigTuple {
  provider: LlmProvider | null;
  model: string;
  keySource: string | null;
  configSource: 'file' | 'defaults' | 'merged';
  configPath?: string;
  schemaVersion: number;
  resolutionVersion: number;
}
```

### PreflightResult (unchanged)

```typescript
interface PreflightResult {
  valid: boolean;
  errors: string[];
  resolved?: ResolvedConfigTuple;
}
```

## Data Constants

### Available Platforms

```typescript
const AVAILABLE_PLATFORMS: PromptOption<string>[] = [
  { label: 'GitHub', value: 'github', description: 'GitHub.com or GitHub Enterprise' },
  { label: 'Azure DevOps', value: 'azure-devops', description: 'Azure DevOps Services or Server' },
  { label: 'Both', value: 'both', description: 'Support both GitHub and Azure DevOps' },
];
```

### Available Providers (existing)

```typescript
// From router/src/cli/config-wizard.ts lines 229-242
const AVAILABLE_PROVIDERS: PromptOption<LlmProvider>[] = [
  { label: 'OpenAI', value: 'openai', description: 'GPT-4, GPT-4o (requires OPENAI_API_KEY)' },
  {
    label: 'Anthropic',
    value: 'anthropic',
    description: 'Claude 3.5, Claude 4 (requires ANTHROPIC_API_KEY)',
  },
  {
    label: 'Azure OpenAI',
    value: 'azure-openai',
    description: 'Azure-hosted GPT models (requires 3 env vars)',
  },
  { label: 'Ollama', value: 'ollama', description: 'Local models (requires OLLAMA_BASE_URL)' },
];
```

### Available Agents (existing)

```typescript
// From router/src/cli/config-wizard.ts lines 217-224
const AVAILABLE_AGENTS: PromptOption<string>[] = [
  { label: 'Semgrep', value: 'semgrep', description: 'Static analysis (always recommended)' },
  { label: 'Reviewdog', value: 'reviewdog', description: 'Linter aggregator' },
  { label: 'OpenCode', value: 'opencode', description: 'AI code review (cloud providers)' },
  { label: 'PR Agent', value: 'pr_agent', description: 'PR description generator' },
  {
    label: 'AI Semantic Review',
    value: 'ai_semantic_review',
    description: 'Semantic code analysis',
  },
  { label: 'Local LLM', value: 'local_llm', description: 'Ollama-based review (local only)' },
];
```

## Relationships

```
WizardState
    │
    ├── platform (selected from AVAILABLE_PLATFORMS)
    ├── provider (selected from AVAILABLE_PROVIDERS)
    └── agents[] (selected from AVAILABLE_AGENTS)
            │
            ▼
    generateDefaultConfig() → Config
            │
            ▼
    generateConfigYaml() → YAML string
            │
            ▼
    runPreflightChecks() → PreflightResult
            │
            ▼
    formatValidationReport() → ValidationReport
```

## Mapping to Functional Requirements

| Entity           | FR Coverage                                       |
| ---------------- | ------------------------------------------------- |
| WizardState      | FR-001 through FR-005 (wizard flow)               |
| ValidationReport | FR-006 through FR-011 (validate command)          |
| PromptOption     | FR-005 (keyboard navigation via numbered choices) |
| PromptResult     | FR-012 (cancellation handling)                    |

## File Output Format

The wizard generates `.ai-review.yml` using existing `generateConfigYaml()`:

```yaml
version: 1
provider: openai # Selected provider
trusted_only: true
triggers:
  branches:
    include:
      - main
      - master
passes:
  - name: static
    agents:
      - semgrep
  - name: ai
    agents:
      - opencode
limits:
  max_files: 50
  max_diff_lines: 2000
models:
  default: gpt-4o
reporting:
  github:
    post_review_comment: true
    create_check_run: true
gating:
  security:
    block_on_high: false
```

Key order is deterministic per FR-014 (byte-stable output).
