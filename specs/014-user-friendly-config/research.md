# Research: User-Friendly Configuration & API Key Handling

**Feature**: 014-user-friendly-config | **Date**: 2026-01-30

## Research Summary

All technical context was gathered during exploration. No external research required - this is an enhancement to existing codebase patterns.

---

## Decision 1: Provider Field Schema Design

**Decision**: Add optional `provider` field to root config schema as `z.enum(['anthropic', 'openai', 'azure-openai', 'ollama']).optional()`

**Rationale**:

- Matches existing `LlmProvider` type in `providers.ts`
- Optional maintains backward compatibility for single-provider setups
- Explicit enum prevents typos and enables IDE autocomplete
- Root-level placement (not nested in `models`) aligns with how provider affects agent execution

**Alternatives Considered**:

- Nesting under `models.provider`: Rejected - provider is orthogonal to model selection
- String type without enum: Rejected - loses type safety and autocomplete
- Required field: Rejected - breaks backward compatibility unnecessarily

---

## Decision 2: Multi-Key Validation Strategy

**Decision**: Hard fail in preflight when (multiple provider keys present) AND (MODEL is set) AND (no explicit provider), with actionable error message

**Rationale**:

- Per spec clarification: "forces clarity, no implicit precedence"
- Current behavior causes 404 errors at runtime - fail-fast is better
- Breaking change is acceptable per spec ("users with both keys set must add provider")
- Single-key scenarios continue to auto-detect (no breaking change there)

**Alternatives Considered**:

- Warning instead of error: Rejected - spec requires hard fail
- Requiring provider in all multi-key scenarios (even without MODEL): Rejected - too strict, users may have keys for different repos
- Only validating when model family mismatches: Already exists in `validateProviderModelCompatibility()` - this adds the ambiguity check

---

## Decision 3: Resolved Config Tuple Format

**Decision**: Log JSON object with fields: `provider`, `model`, `keySource`, `configSource`, `schemaVersion`, `resolutionVersion` at preflight success

**Rationale**:

- JSON is machine-parseable for debugging scripts
- Fields match FR-011 requirements exactly
- `keySource` values: `env:ANTHROPIC_API_KEY`, `env:OPENAI_API_KEY`, etc.
- `configSource` values: `file:.ai-review.yml`, `defaults`, `merged`
- `schemaVersion` tracks tuple format changes (prevents "same shape, different meaning")
- `resolutionVersion` tracks resolution logic changes (enables support ticket triage)

**Format Example**:

```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "keySource": "env:OPENAI_API_KEY",
  "configSource": "file:.ai-review.yml",
  "schemaVersion": 1,
  "resolutionVersion": 1
}
```

**Alternatives Considered**:

- Plain text log: Rejected - harder to parse for debugging
- Separate log per field: Rejected - fragmented, harder to correlate
- Writing to separate artifact file: Deferred - log output sufficient for MVP
- No versioning: Rejected - makes future evolution and support tickets harder

---

## Decision 4: Azure OpenAI Error Message Format

**Decision**: Single-line actionable format: `Error: Azure OpenAI requires AZURE_OPENAI_DEPLOYMENT. Fix: set AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>`

**Rationale**:

- Per spec: "single-line 'set X' fix"
- Existing `validateAzureDeployment()` already checks for partial bundles
- Pattern matches other actionable error messages in preflight

**Template**:

```
Error: Azure OpenAI configuration incomplete. Fix: set {MISSING_VAR}
```

**Alternatives Considered**:

- Multi-line explanation: Rejected - spec requires single-line
- Link to docs: Can be added as second line if needed, but primary fix is inline

---

## Decision 5: Configuration Wizard Implementation

**Decision**: New Commander subcommand `ai-review config init` with interactive prompts using Node.js readline; must be TTY-safe

**Rationale**:

- `config init` naming follows common CLI patterns (npm init, git init)
- Node.js readline is built-in, no new dependencies
- Commander already used for CLI structure
- Can be extended with `config validate` subcommand

**TTY Safety Requirements**:

- Check `process.stdin.isTTY` before prompting
- If not TTY: refuse with clear message unless `--defaults` or `--yes` flag provided
- `--defaults` applies sensible defaults without prompting
- `--yes` is alias for `--defaults` (npm convention)

**Deterministic Output Requirements**:

- YAML output must use stable key ordering (alphabetical or schema-defined)
- Lists must maintain stable order (no Set iteration randomness)
- Enables reproducible config generation for testing

**Implementation Approach**:

1. Check TTY, abort early if non-interactive and no --defaults
2. Prompt for platform: GitHub / Azure DevOps
3. Prompt for provider: OpenAI / Anthropic / Azure OpenAI / Ollama
4. For Azure OpenAI: Prompt for all 3 values together (per User Story 3)
5. Prompt for agents to enable
6. Generate `.ai-review.yml` with deterministic key order and comments

**Alternatives Considered**:

- Third-party prompt library (inquirer, prompts): Rejected - adds dependency for simple use case
- Web-based wizard: Out of scope per spec
- Non-interactive template copying: Less user-friendly, doesn't validate inputs
- Ignoring TTY check: Rejected - would hang in CI environments

---

## Decision 6: Default Model Selection

**Decision**: When single provider key is set and no MODEL configured, auto-apply the default:

- Anthropic: `claude-sonnet-4-20250514`
- OpenAI: `gpt-4o`
- Azure OpenAI: (no default - deployment name is always user-specified per FR-013)
- Ollama: `codellama:7b`

**Rationale**:

- FR-001 requires "auto-apply" for single-provider setups to enable "just works" experience
- Azure OpenAI is the exception per FR-013 (deployment names are user-specific)
- Auto-apply is logged in resolved config tuple, so behavior is transparent
- Users can still override via MODEL env or config

**Behavior**:

- Single key + no MODEL → auto-apply default, log in resolved tuple
- Single key + MODEL set → use configured MODEL
- Azure OpenAI + no deployment → fail with actionable error (no auto-apply)

**Alternatives Considered**:

- Suggestion only: Rejected - contradicts FR-001 "MUST auto-apply" and harms first-time UX
- Fail without suggestion: Less helpful, spec wants actionable errors
- Auto-apply for Azure too: Rejected - deployment names are custom, no universal default

---

## Decision 7: Backward Compatibility Strategy

**Decision**: Three-tier compatibility:

1. **Single-key configs**: Fully backward compatible, no changes required
2. **Multi-key without MODEL**: Fully backward compatible (precedence still applies)
3. **Multi-key with MODEL but no provider**: BREAKING - now fails with clear migration path

**Migration Message**:

```
Error: Multiple provider keys detected with MODEL set. Ambiguous configuration.
Fix: Add 'provider: openai' (or 'anthropic') to your .ai-review.yml
See: https://github.com/oddessentials/odd-ai-reviewers/docs/configuration/provider-selection.md
```

**Rationale**:

- Only the ambiguous case breaks - this is intentional per spec
- Clear error message with exact fix reduces migration friction
- Documentation link provides full context

---

## Decision 8: Key Source Detection

**Decision**: Track which environment variable provided the API key for logging:

```typescript
interface KeySource {
  provider: LlmProvider;
  envVar: string; // e.g., 'ANTHROPIC_API_KEY', 'AZURE_OPENAI_API_KEY'
}
```

**Rationale**:

- FR-011 requires logging `key-source` in resolved tuple
- Helps debugging when users have multiple keys but one is invalid
- Simple to implement - just record which key was checked during provider resolution

**Alternatives Considered**:

- Not tracking key source: Violates FR-011
- Tracking key value: Security risk - never log secrets

---

## Implementation Order

Based on dependencies and risk:

1. **Schema extension** (`provider` field) - Foundation for other changes
2. **Resolved config logging** - Non-breaking, enables debugging
3. **Multi-key validation** - Breaking change, highest user impact
4. **Azure error messages** - Quick win, improves existing errors
5. **Config wizard** - New feature, can be implemented in parallel
6. **Documentation** - After code changes stabilize

---

## No External Research Required

All decisions are based on:

- Existing codebase patterns (Zod schemas, Commander CLI, preflight validation)
- Spec requirements and clarifications
- Constitution principles (especially determinism and security)

No external API integration, no new libraries, no cloud service research needed.
