# Data Model: User-Friendly Configuration & API Key Handling

**Feature**: 014-user-friendly-config | **Date**: 2026-01-30

## Entities

### 1. LlmProvider (Existing - No Changes)

```typescript
type LlmProvider = 'anthropic' | 'openai' | 'azure-openai' | 'ollama';
```

**Location**: `router/src/config/providers.ts`

---

### 2. ConfigSchema (Modified)

**Location**: `router/src/config/schemas.ts`

**Current Fields**: `version`, `trusted_only`, `triggers`, `passes`, `limits`, `models`, `reporting`, `gating`, `path_filters`, `control_flow`

**New Field**:

```typescript
// Add to ConfigSchema
provider: z.enum(['anthropic', 'openai', 'azure-openai', 'ollama']).optional();
```

**Validation Rules**:

- Optional field (null/undefined allowed)
- When present, must be one of the four valid providers
- When present, corresponding API key must exist in environment

---

### 3. ResolvedConfigTuple (New)

**Purpose**: Captures the fully resolved configuration state for logging and reproducibility (FR-011)

```typescript
interface ResolvedConfigTuple {
  /** Resolved LLM provider */
  provider: LlmProvider | null;

  /** Effective model name (may be auto-applied default for single-key setups) */
  model: string;

  /** Source of API key, e.g., "env:OPENAI_API_KEY" */
  keySource: string | null;

  /** Source of config, e.g., "file:.ai-review.yml", "defaults", "merged" */
  configSource: 'file' | 'defaults' | 'merged';

  /** Path to config file if file source */
  configPath?: string;

  /** Tuple format version - increment when fields are added/changed */
  schemaVersion: number;

  /** Resolution logic version - increment when resolution behavior changes */
  resolutionVersion: number;
}
```

**Location**: `router/src/config/providers.ts` (new export)

**Version Strategy**:

- `schemaVersion`: Tracks structural changes to the tuple (add/remove/rename fields)
- `resolutionVersion`: Tracks semantic changes to resolution logic (provider precedence, default model selection)
- Both start at 1; increment independently as needed
- Enables support ticket triage: "same tuple shape, different meaning" is detectable

**Lifecycle**:

1. Created during preflight validation
2. Logged to stdout in JSON format
3. Passed to AgentContext for use during run
4. Not persisted between runs

---

### 4. PreflightResult (Modified)

**Location**: `router/src/preflight.ts`

**Current Fields**: `valid: boolean`, `errors: string[]`

**New Fields**:

```typescript
interface PreflightResult {
  valid: boolean;
  errors: string[];

  /** Resolved config tuple when valid, undefined when invalid */
  resolved?: ResolvedConfigTuple;
}
```

**Validation Rules**:

- `resolved` only populated when `valid === true`
- When valid, `resolved` must have all required fields populated

---

### 5. ProviderKeyMapping (New Internal Type)

**Purpose**: Maps providers to their required environment variables

```typescript
const PROVIDER_KEY_MAPPING: Record<LlmProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  'azure-openai': ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_DEPLOYMENT'],
  ollama: ['OLLAMA_BASE_URL'],
};
```

**Location**: `router/src/preflight.ts`

**Usage**:

- Multi-key detection: count providers with at least one key present
- Azure validation: check all 3 keys as atomic bundle
- Key source logging: record which key was used

**Ollama Clarification**: Ollama only counts as "having a key" when `OLLAMA_BASE_URL` is explicitly set to a non-empty value. The runtime default (`http://ollama-sidecar:11434`) is NOT considered for multi-key detection. This means a user with only `OPENAI_API_KEY` set is in single-key mode even if Ollama would work at runtime.

---

### 6. DefaultModelMapping (New Internal Constant)

**Purpose**: Auto-applies default models for single-provider setups when model is not configured

```typescript
const DEFAULT_MODELS: Record<LlmProvider, string | null> = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o',
  'azure-openai': null, // User must specify deployment name (no auto-apply)
  ollama: 'codellama:7b',
};
```

**Location**: `router/src/preflight.ts`

**Usage**:

- Auto-apply for single-key setups (logged in resolved tuple)
- Config wizard defaults
- Azure OpenAI is exception: no default (deployment names are user-specific)

---

## State Transitions

### Config Resolution Flow

```
┌─────────────────┐
│ Raw Config File │
└────────┬────────┘
         │ loadConfig()
         ▼
┌─────────────────┐
│ Parsed Config   │ ← Zod validation, deep merge with defaults
└────────┬────────┘
         │ runPreflightChecks()
         ▼
┌─────────────────────────────────────────────────────────┐
│ Validation Checks                                        │
│ ┌─────────────────┐  ┌─────────────────┐                │
│ │ Legacy Keys     │  │ Azure Bundle    │                │
│ └─────────────────┘  └─────────────────┘                │
│ ┌─────────────────┐  ┌─────────────────┐                │
│ │ Multi-Key Check │  │ Model Config    │ ← NEW CHECK   │
│ └─────────────────┘  └─────────────────┘                │
│ ┌─────────────────┐  ┌─────────────────┐                │
│ │ Provider Match  │  │ Chat Model      │                │
│ └─────────────────┘  └─────────────────┘                │
└────────┬────────────────────────────────────────────────┘
         │
         ▼
    ┌────┴────┐
    │ Valid?  │
    └────┬────┘
    YES  │  NO
         ▼
┌─────────────────┐      ┌─────────────────┐
│ ResolvedConfig  │      │ Error Messages  │
│ Tuple + Log     │      │ (Actionable)    │
└─────────────────┘      └─────────────────┘
```

### Multi-Key Detection State Machine

```
┌──────────────────────────────────────────────────────────────┐
│ Input: env vars, config.provider                             │
│ Note: Only MODEL env var is checked, not config.models.default│
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Count providers │
                    │ with keys set   │
                    │ (explicit only) │
                    └────────┬────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
     ┌──────────┐     ┌──────────┐     ┌──────────┐
     │ 0 keys   │     │ 1 key    │     │ 2+ keys  │
     └────┬─────┘     └────┬─────┘     └────┬─────┘
          │                │                │
          ▼                ▼                ▼
     ┌──────────┐     ┌──────────┐     ┌────────────────┐
     │ FAIL:    │     │ PASS:    │     │ MODEL env var  │
     │ No keys  │     │ Auto-    │     │ set?           │
     └──────────┘     │ detect + │     └───────┬────────┘
                      │ auto-    │        YES  │  NO
                      │ apply    │             │    │
                      └──────────┘             ▼    ▼
                                   ┌────────────┐  ┌────────────┐
                                   │ Explicit   │  │ PASS:      │
                                   │ provider   │  │ Implicit   │
                                   │ set?       │  │ precedence │
                                   └─────┬──────┘  │ (backward  │
                                    YES  │  NO     │ compat)    │
                                         ▼         └────────────┘
                              ┌──────────┐  ┌──────────┐
                              │ PASS:    │  │ FAIL:    │
                              │ Explicit │  │ Ambig.   │
                              │ provider │  │ (FR-004) │
                              └──────────┘  └──────────┘
```

**Key Clarifications**:

- "Keys set" means explicitly set to non-empty value (Ollama runtime default doesn't count)
- Only `MODEL` env var triggers FR-004, not `config.models.default`
- 2+ keys without MODEL uses implicit precedence (Anthropic > Azure > OpenAI) for backward compatibility

---

## Relationships

```
Config (1) ────────── provider: optional ─────────► LlmProvider

Config (1) ────────── models.default: optional ───► Model Name

Environment (1) ─────── API Keys ─────────────────► Provider Resolution

PreflightResult (1) ── resolved ──────────────────► ResolvedConfigTuple (0..1)

AgentContext (1) ────── provider, effectiveModel ─► From ResolvedConfigTuple
```

---

## Validation Rules Summary

| Rule                  | Trigger                                        | Result                                                                                                  |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| No API keys           | Zero provider keys in env                      | `Error: No API keys configured. Fix: set OPENAI_API_KEY or ANTHROPIC_API_KEY`                           |
| Multi-key ambiguity   | 2+ keys + MODEL env var + no explicit provider | `Error: Multiple provider keys with MODEL set. Fix: add 'provider: openai' to config`                   |
| Multi-key no MODEL    | 2+ keys + no MODEL env var                     | PASS: Use implicit precedence (Anthropic > Azure > OpenAI) for backward compatibility                   |
| Azure incomplete      | 1-2 of 3 Azure keys (regardless of intent)     | `Error: Azure OpenAI incomplete. Fix: set AZURE_OPENAI_{missing}`                                       |
| Provider mismatch     | Explicit provider + missing key                | `Error: Provider 'anthropic' requires ANTHROPIC_API_KEY. Fix: set ANTHROPIC_API_KEY`                    |
| Model mismatch        | Provider resolved but model incompatible       | `Error: Model 'gpt-4o' incompatible with provider 'anthropic'. Fix: set MODEL=claude-sonnet-4-20250514` |
| No model (single-key) | Single provider, no MODEL env var              | Auto-apply default (gpt-4o, claude-sonnet-4-20250514, codellama:7b)                                     |
| No model (Azure)      | Azure OpenAI, no MODEL env var                 | `Error: Azure OpenAI requires deployment name. Fix: set MODEL=<deployment-name>`                        |
| Ollama implicit       | OLLAMA_BASE_URL not set                        | Not counted as "having a key" for multi-key detection; runtime defaults to localhost:11434              |

**Note**: `config.models.default` is intentionally NOT checked for multi-key ambiguity. Only the `MODEL` environment variable indicates runtime override intent.

---

## Backward Compatibility

| Scenario                         | Current Behavior               | New Behavior                                                  |
| -------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| Single OPENAI_API_KEY            | Auto-selects OpenAI            | Unchanged + auto-applies gpt-4o if no MODEL                   |
| Single ANTHROPIC_API_KEY         | Auto-selects Anthropic         | Unchanged + auto-applies claude-sonnet-4-20250514 if no MODEL |
| Both keys, no MODEL env var      | Anthropic wins (precedence)    | **Unchanged** (preserved for backward compatibility)          |
| Both keys, MODEL env var set     | Anthropic wins, 404 at runtime | **BREAKING**: Fails preflight with actionable error           |
| Both keys, MODEL + provider      | N/A (field didn't exist)       | Explicit provider used, preflight passes                      |
| Both keys, config.models.default | Anthropic wins (precedence)    | **Unchanged** (config default ≠ env var override)             |
| Azure partial (2/3 keys)         | Fails preflight                | Unchanged (improved single-line message)                      |
| OLLAMA_BASE_URL not set          | Ollama unavailable             | **Unchanged** (not counted for multi-key detection)           |

**Breaking Change Summary**: Only the combination of `2+ API keys` + `MODEL env var` + `no explicit provider` now fails. All other scenarios preserve existing behavior.
